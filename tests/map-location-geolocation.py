#!/usr/bin/env python3
"""Real-browser coverage for Studio's explicit map/location Geolocation API command."""
from __future__ import annotations

import argparse
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import BrowserContext, Page, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
STUDIO_ORIGIN = "http://127.0.0.1"
EXPECTED_LAT = 18.5204
EXPECTED_LON = 73.8567


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        return


def serve_project():
    handler = lambda *args, **kwargs: QuietHandler(*args, directory=str(ROOT), **kwargs)
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


def execute_command(page: Page, command: str) -> None:
    page.locator("#cmd-input").fill(command)
    page.locator("#cmd-input").press("Enter")


def output_text(page: Page) -> str:
    return page.locator("#output").inner_text()


def storage_snapshot(page: Page) -> dict[str, object]:
    return page.evaluate(
        """() => ({
            localStorage: Object.fromEntries(Object.entries(localStorage)),
            sessionStorage: Object.fromEntries(Object.entries(sessionStorage)),
            cookie: document.cookie
        })"""
    )


def launch_page(context: BrowserContext, base_url: str, geo_mode: str | None = None) -> Page:
    if geo_mode == "unsupported":
        context.add_init_script(
            """Object.defineProperty(Navigator.prototype, 'geolocation', {
                configurable: true,
                get() { return undefined; }
            });"""
        )
    elif geo_mode in {"unavailable", "timeout"}:
        code = 2 if geo_mode == "unavailable" else 3
        context.add_init_script(
            f"""(() => {{
                const descriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'geolocation');
                const nativeGetter = descriptor?.get;
                Object.defineProperty(Navigator.prototype, 'geolocation', {{
                    configurable: true,
                    get() {{
                        const real = nativeGetter ? nativeGetter.call(this) : undefined;
                        if (!real) return real;
                        return new Proxy(real, {{
                            get(target, property) {{
                                if (property === 'getCurrentPosition') {{
                                    return (success, error) => error({{ code: {code}, message: '{geo_mode}' }});
                                }}
                                return Reflect.get(target, property);
                            }}
                        }});
                    }}
                }});
            }})();"""
        )

    page = context.new_page()
    page.goto(f"{base_url}/index.html", wait_until="domcontentloaded")
    page.wait_for_timeout(300)
    assert page.evaluate("window.isSecureContext") is True, "Studio test origin is not a secure context"
    return page


def configure_routes(context: BrowserContext, request_log: list[str] | None = None):
    def route_handler(route):
        url = route.request.url
        if request_log is not None:
            request_log.append(url)
        parsed = urlparse(url)
        if parsed.netloc == "geocoding-api.open-meteo.com":
            route.fulfill(
                status=200,
                content_type="application/json",
                body='{"results":[{"latitude":18.5204,"longitude":73.8567,"name":"Pune","country":"India"}]}',
            )
            return
        if parsed.netloc in {"www.google.com", "anvaka.github.io"}:
            route.abort()
            return
        route.continue_()

    context.route("**/*", route_handler)


def test_success(browser, base_url: str) -> None:
    context = browser.new_context(
        geolocation={"latitude": EXPECTED_LAT, "longitude": EXPECTED_LON}
    )
    context.grant_permissions(["geolocation"], origin=base_url)
    request_log: list[str] = []
    configure_routes(context, request_log)
    page = launch_page(context, base_url)

    initial_storage = storage_snapshot(page)
    geo_calls = page.evaluate("window.__geoCalls = 0; const g = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation); navigator.geolocation.getCurrentPosition = (...args) => { window.__geoCalls += 1; return g(...args); }; window.__geoCalls")
    assert geo_calls == 0
    assert page.evaluate("navigator.permissions.query({name:'geolocation'}).then(p => p.state)") == "granted"

    with context.expect_page(timeout=5_000) as popup_info:
        execute_command(page, "map/location")
    popup = popup_info.value
    popup.wait_for_timeout(700)

    assert page.evaluate("window.__geoCalls") == 1, "map/location did not invoke the browser Geolocation API"
    assert page.locator("#output").inner_text().count("current browser location") == 1
    assert "current location acquired" in output_text(page)
    assert popup.url.startswith("https://www.google.com/maps/search/?api=1&query=")
    query = parse_qs(urlparse(popup.url).query).get("query", [""])[0]
    assert query == f"{EXPECTED_LAT},{EXPECTED_LON}", f"unexpected coordinate query: {query}"
    assert not any("geocoding-api.open-meteo.com" in url for url in request_log), "map/location used the place-geocoding API"
    assert storage_snapshot(page) == initial_storage, "map/location persisted browser storage state"
    assert page.evaluate("document.cookie") == initial_storage["cookie"]
    assert page.context.pages[-1] == popup
    popup.close()
    context.close()
    print("map/location command recognition: PASS")
    print("successful browser geolocation: PASS")
    print("coordinates opened through existing map flow: PASS")
    print("no persistent location storage: PASS")


def test_error(browser, base_url: str, mode: str, permission: bool = True) -> None:
    context = browser.new_context()
    if permission:
        context.grant_permissions(["geolocation"], origin=base_url)
    configure_routes(context)
    page = launch_page(context, base_url, geo_mode=mode)
    initial_storage = storage_snapshot(page)

    execute_command(page, "map/location")
    page.wait_for_timeout(500)
    text = output_text(page)

    expected = {
        "denied": "error: location permission was denied.",
        "unavailable": "error: current location is unavailable.",
        "timeout": "error: location request timed out.",
        "unsupported": "error: browser geolocation is not supported.",
    }[mode]
    assert expected in text, f"{mode}: missing error message"
    assert storage_snapshot(page) == initial_storage, f"{mode}: storage changed"
    assert len(context.pages) == 1, f"{mode}: map popup was left open"
    context.close()
    print(f"{mode}: PASS")


def test_existing_commands(browser, base_url: str) -> None:
    context = browser.new_context()
    configure_routes(context)
    page = launch_page(context, base_url)

    with context.expect_page(timeout=5_000) as popup_info:
        execute_command(page, "map/Pune")
    popup = popup_info.value
    popup.wait_for_timeout(600)
    assert popup.url.startswith("https://www.google.com/maps/search/?api=1&query=Pune%2C%20India")
    popup.close()

    with context.expect_page(timeout=5_000) as road_info:
        execute_command(page, "map/road/Pune")
    road = road_info.value
    road.wait_for_timeout(400)
    assert road.url.startswith("https://anvaka.github.io/city-roads/")
    road.close()

    before = output_text(page)
    execute_command(page, "network/location")
    page.wait_for_timeout(250)
    after = output_text(page)
    assert "Native geolocation access is disabled to protect your coordinates." in after[len(before):]

    context.close()
    print("map/Pune: PASS")
    print("map/road/Pune: PASS")
    print("network/location unchanged: PASS")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--executable-path",
        default=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"),
        help="optional explicit Chromium executable override",
    )
    args = parser.parse_args()

    with sync_playwright() as p:
        executable = args.executable_path or p.chromium.executable_path
        if not executable or not Path(executable).is_file():
            raise SystemExit(f"map-location-geolocation: Chromium executable not found: {executable}")

        launch_args = ["--no-sandbox"] if os.name != "nt" else []
        browser = p.chromium.launch(headless=True, executable_path=executable, args=launch_args)
        server, _thread = serve_project()
        base_url = f"{STUDIO_ORIGIN}:{server.server_port}"
        try:
            test_success(browser, base_url)
            test_error(browser, base_url, "denied", permission=False)
            test_error(browser, base_url, "unavailable")
            test_error(browser, base_url, "timeout")
            test_error(browser, base_url, "unsupported")
            test_existing_commands(browser, base_url)
        finally:
            browser.close()
            server.shutdown()
            server.server_close()

    print("map-location-geolocation: PASS")


if __name__ == "__main__":
    main()
