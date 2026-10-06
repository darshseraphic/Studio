#!/usr/bin/env python3
"""Real Chromium coverage for the Editor/GitHub repository preview boundary."""
from __future__ import annotations

import argparse
import base64
import os
import time
from pathlib import Path

from playwright.sync_api import BrowserContext, Page, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SECURITY_JS = ROOT / "preview-security.js"
TARGET_ROOT = "https://example.com/studio-preview-security"


def document(body: str) -> str:
    return f"<!doctype html><html><head><meta charset='utf-8'></head><body>{body}</body></html>"


def decode_child_document(wrapper: str) -> str:
    marker = 'src="data:text/html;base64,'
    encoded = wrapper[wrapper.index(marker) + len(marker) :].split('"', 1)[0]
    return base64.b64decode(encoded).decode("utf-8")


def prepare_preview(context: BrowserContext, studio: Page, html: str):
    wrapper = studio.evaluate("html => window.ps.buildHtmlPreviewDocument(html)", html)
    protected = decode_child_document(wrapper)
    studio.evaluate("html => { window.__previewCase = html; }", html)

    before = len(context.pages)
    with context.expect_page(timeout=3_000) as popup:
        studio.click("#launch-preview")
    preview = popup.value
    preview.wait_for_load_state("domcontentloaded")

    iframe = preview.locator("iframe")
    assert iframe.count() == 1, "preview did not create its iframe"
    assert iframe.get_attribute("sandbox") == "allow-scripts", "unexpected preview sandbox"
    assert iframe.get_attribute("src").startswith("data:text/html;base64,"), "preview child is not data-backed"
    assert preview.evaluate("window.opener === null") is True, "preview retained an opener to Studio"

    fallback = preview.frames[-1].url.startswith("chrome-error://")
    if fallback:
        # The container Chromium blocks data: subframes before delivery. Keep the
        # production wrapper and sandbox untouched; use the exact protected child
        # document through srcdoc so the hostile JavaScript runs under the same
        # sandbox and CSP in the browser.
        iframe.evaluate("(el, childHtml) => { el.srcdoc = childHtml; }", protected)
        preview.wait_for_timeout(100)

    child = preview.frames[-1]
    assert child.evaluate("window.opener === null") is True, "repository code received an opener"
    assert len(context.pages) == before + 1, "preview opening created an unexpected browsing context"
    return preview, child, fallback


def run_script_case(context: BrowserContext, studio: Page, name: str, attack: str, target: str):
    events: list[tuple[str, str, str | None]] = []

    def on_request(request):
        if request.url.startswith(target):
            events.append(("request", request.url, None))

    def on_failed(request):
        if request.url.startswith(target):
            events.append(("failed", request.url, request.failure))

    def on_response(response):
        if response.url.startswith(target):
            events.append(("response", response.url, None))

    html = document(f"""
        <div id="result" data-result="PENDING"></div>
        <script>
          window.__csp = [];
          document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.effectiveDirective));
          window.__startAttack = () => {{ {attack} }};
        </script>
    """)
    context.on("request", on_request)
    context.on("requestfailed", on_failed)
    context.on("response", on_response)
    try:
        preview, child, fallback = prepare_preview(context, studio, html)
        try:
            events.clear()  # Ignore the container's data: navigation restriction.
            deadline = time.monotonic() + 2.0
            while child.evaluate("typeof window.__startAttack === 'function'") is not True:
                if time.monotonic() >= deadline:
                    raise AssertionError("hostile preview trigger did not load")
                preview.wait_for_timeout(50)
            child.evaluate("window.__startAttack()")
            preview.wait_for_timeout(700)
            return {
                "result": child.locator("#result").get_attribute("data-result"),
                "csp": child.evaluate("window.__csp || []"),
                "events": list(events),
                "pages": len(context.pages),
                "fallback": fallback,
                "url": child.url,
            }
        finally:
            preview.close()
    finally:
        context.remove_listener("request", on_request)
        context.remove_listener("requestfailed", on_failed)
        context.remove_listener("response", on_response)


def run_click_case(context: BrowserContext, studio: Page, name: str, script: str, target: str):
    events: list[tuple[str, str, str | None]] = []

    def on_request(request):
        if request.url.startswith(target):
            events.append(("request", request.url, None))

    def on_failed(request):
        if request.url.startswith(target):
            events.append(("failed", request.url, request.failure))

    def on_response(response):
        if response.url.startswith(target):
            events.append(("response", response.url, None))

    html = document(f"""
        <div id="result" data-result="PENDING"></div>
        <script>
          const trigger = document.createElement('button');
          trigger.id = 'attack';
          trigger.textContent = 'attack';
          document.body.appendChild(trigger);
          trigger.addEventListener('click', () => {{ {script} }});
        </script>
    """)
    context.on("request", on_request)
    context.on("requestfailed", on_failed)
    context.on("response", on_response)
    try:
        preview, child, fallback = prepare_preview(context, studio, html)
        try:
            events.clear()
            original_top = preview.url
            deadline = time.monotonic() + 2.0
            while child.locator("#attack").count() != 1:
                if time.monotonic() >= deadline:
                    raise AssertionError("hostile preview trigger did not load")
                preview.wait_for_timeout(50)
            child.locator("#attack").click()
            preview.wait_for_timeout(700)
            result_node = child.locator("#result")
            result = result_node.get_attribute("data-result") if result_node.count() else None
            return {
                "result": result,
                "events": list(events),
                "pages": len(context.pages),
                "fallback": fallback,
                "child_url": child.url,
                "top_url": preview.url,
                "original_top": original_top,
            }
        finally:
            preview.close()
    finally:
        context.remove_listener("request", on_request)
        context.remove_listener("requestfailed", on_failed)
        context.remove_listener("response", on_response)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--executable-path",
        default=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"),
        help="optional explicit Chromium executable override",
    )
    args = parser.parse_args()

    with sync_playwright() as p:
        chromium = args.executable_path or p.chromium.executable_path
        if not Path(chromium).is_file():
            raise SystemExit(f"preview-browser-security: Chromium executable not found: {chromium}")
        browser = p.chromium.launch(headless=True, executable_path=chromium, args=["--no-sandbox"])
        context = browser.new_context()
        studio = context.new_page()
        studio.set_content("""
            <!doctype html><button id="launch-preview">launch</button>
            <script>
              document.getElementById('launch-preview').onclick = () =>
                window.ps.openSandboxPreview(window.ps.buildHtmlPreviewDocument(window.__previewCase));
            </script>
        """)

        # Execute the real preview-security module in Chromium, rather than a mock.
        source = SECURITY_JS.read_text(encoding="utf-8")
        studio.evaluate("""
            async source => {
              const u = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
              window.ps = await import(u);
              URL.revokeObjectURL(u);
            }
        """, source)

        # Legitimate local/data behavior remains available.
        data_svg = "data:image/svg+xml;base64," + base64.b64encode(
            b'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>'
        ).decode()
        legitimate = document(f"""
            <h1 id="html">inline html</h1>
            <style>#html {{ font-size: 23px; }}</style>
            <div id="dom"></div>
            <img id="data" src="{data_svg}">
            <script>
              document.body.dataset.inlineJs = 'yes';
              document.getElementById('dom').textContent = 'dom-manipulation';
              const blob = URL.createObjectURL(new Blob([
                '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><circle cx=".5" cy=".5" r=".5"/></svg>'
              ], {{type:'image/svg+xml'}}));
              const img = new Image();
              img.id = 'blob';
              img.src = blob;
              document.body.appendChild(img);
            </script>
        """)
        preview, child, legitimate_fallback = prepare_preview(context, studio, legitimate)
        try:
            preview.wait_for_timeout(700)
            assert child.locator("#html").inner_text() == "inline html"
            assert child.locator("#dom").inner_text() == "dom-manipulation"
            assert child.locator("body").get_attribute("data-inline-js") == "yes"
            assert child.locator("#html").evaluate("el => getComputedStyle(el).fontSize") == "23px"
            assert child.locator("#data").evaluate("el => el.complete && el.naturalWidth > 0")
            assert child.locator("#blob").evaluate("el => el.complete && el.naturalWidth > 0")
        finally:
            preview.close()
        print("legitimate preview: ALLOWED")

        blocked = [
            ("fetch", "fetch(__TARGET__).then(() => result.dataset.result='ALLOWED').catch(() => result.dataset.result='BLOCKED');", "connect-src"),
            ("XMLHttpRequest", "const x=new XMLHttpRequest();x.open('GET',__TARGET__);x.onload=()=>result.dataset.result='ALLOWED';x.onerror=()=>result.dataset.result='BLOCKED';try{x.send()}catch(e){result.dataset.result='BLOCKED'}", "connect-src"),
            ("WebSocket", "try{const s=new WebSocket(__WS__);s.onopen=()=>result.dataset.result='ALLOWED';s.onerror=()=>result.dataset.result='BLOCKED'}catch(e){result.dataset.result='BLOCKED'}", "connect-src"),
            ("EventSource", "try{const e=new EventSource(__TARGET__);e.onopen=()=>result.dataset.result='ALLOWED';e.onerror=()=>result.dataset.result='BLOCKED'}catch(e){result.dataset.result='BLOCKED'}", "connect-src"),
            ("sendBeacon", "try{navigator.sendBeacon(__TARGET__,'x');result.dataset.result='ACCEPTED'}catch(e){result.dataset.result='BLOCKED'}", "connect-src"),
            ("external img", "const i=new Image();i.onload=()=>result.dataset.result='ALLOWED';i.onerror=()=>result.dataset.result='BLOCKED';i.src=__TARGET__;document.body.appendChild(i);", "img-src"),
            ("external script", "const s=document.createElement('script');s.onload=()=>result.dataset.result='ALLOWED';s.onerror=()=>result.dataset.result='BLOCKED';s.src=__TARGET__;document.body.appendChild(s);", "script-src-elem"),
            ("external iframe", "const f=document.createElement('iframe');f.onload=()=>result.dataset.result='LOADED';f.onerror=()=>result.dataset.result='BLOCKED';f.src=__TARGET__;document.body.appendChild(f);", "frame-src"),
            ("worker", "try{new Worker(__TARGET__+'.js');result.dataset.result='ALLOWED'}catch(e){result.dataset.result='BLOCKED'}setTimeout(()=>result.dataset.result==='PENDING'&&(result.dataset.result='BLOCKED'),500);", None),
        ]
        for name, attack, directive in blocked:
            target = f"{TARGET_ROOT}/{name.replace(' ', '-').replace('XMLHttpRequest', 'xhr').replace('WebSocket', 'websocket').replace('EventSource', 'eventsource').replace('sendBeacon', 'beacon')}"
            if name == "WebSocket":
                target = "ws://example.com/studio-preview-security/websocket"
            attack = attack.replace("__WS__", repr("ws://example.com/studio-preview-security/websocket")).replace("__TARGET__", repr(target))
            outcome = run_script_case(context, studio, name, attack, target)
            successful = [e for e in outcome["events"] if e[0] == "response"]
            assert not successful, f"{name}: external response received {successful}"
            requests = [url for kind, url, _ in outcome["events"] if kind == "request"]
            failed = {url: reason for kind, url, reason in outcome["events"] if kind == "failed"}
            assert all(url in failed and failed[url] == "csp" for url in requests), f"{name}: request was not canceled by CSP: {outcome['events']}"
            if directive is not None:
                assert directive in outcome["csp"], f"{name}: missing browser CSP violation for {directive}: {outcome['csp']}"
            if name == "external iframe":
                assert outcome["result"] in {"LOADED", "BLOCKED"}, f"{name}: unexpected result {outcome['result']}"
            elif name == "sendBeacon":
                assert outcome["result"] == "ACCEPTED", f"{name}: unexpected browser API result {outcome['result']}"
            else:
                assert outcome["result"] == "BLOCKED", f"{name}: browser did not block the operation"
            print(f"{name}: BLOCKED")

        # window.open gets a real user activation from the hostile child; the sandbox still blocks it.
        popup_target = TARGET_ROOT + "/popup"
        outcome = run_click_case(
            context,
            studio,
            "window.open",
            f"try{{result.dataset.result=window.open({popup_target!r},'_blank')===null?'BLOCKED':'ALLOWED'}}catch(e){{result.dataset.result='BLOCKED'}}",
            popup_target,
        )
        assert outcome["result"] == "BLOCKED"
        assert not outcome["events"]
        assert outcome["pages"] == 2
        print("window.open: BLOCKED")

        # Self-navigation is allowed by the sandbox, but remains inside the child browsing context.
        for name, expression in [
            ("location.href", "location.href=T"),
            ("location.assign", "location.assign(T)"),
            ("location.replace", "location.replace(T)"),
        ]:
            target = f"{TARGET_ROOT}/{name.replace('.', '-') }"
            outcome = run_click_case(context, studio, name, expression.replace("T", repr(target)), target)
            assert outcome["top_url"] == outcome["original_top"], f"{name}: preview top-level context changed"
            # A successful self-navigation destroys the original document. In
            # this container Chromium may show chrome-error:// after blocking
            # the external fetch, so the stable assertion is marker removal.
            assert outcome["result"] is None, f"{name}: child document was not replaced"
            assert outcome["pages"] == 2
            print(f"{name}: ALLOWED (CONTAINED)")

        # Navigation of the preview wrapper itself is denied even with a user activation.
        for name in ["window.top.location", "window.parent.location"]:
            target = f"{TARGET_ROOT}/{name.replace('.', '-') }"
            expression = (
                f"try{{{name}.href={target!r}}}"
                "catch(e){result.dataset.result='BLOCKED'}"
            )
            outcome = run_click_case(context, studio, name, expression, target)
            assert outcome["top_url"] == outcome["original_top"], f"{name}: navigated the preview top-level context"
            assert outcome["result"] == "BLOCKED"
            assert not outcome["events"]
            print(f"{name}: BLOCKED")

        assert studio.evaluate("window.ps.PREVIEW_SANDBOX") == "allow-scripts"
        print(f"data-subframe fallback used: {legitimate_fallback}")
        print("preview-browser-security: PASS")
        browser.close()


if __name__ == "__main__":
    main()
