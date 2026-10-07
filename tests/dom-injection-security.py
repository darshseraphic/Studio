#!/usr/bin/env python3
"""Real-browser regression coverage for repository content reaching trusted Studio DOM."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MAIN_JS = ROOT / "main.js"
PREVIEW_SECURITY_JS = ROOT / "preview-security.js"
HOSTILE_VALUES = [
    '<script>window.__domInjection="EXECUTED"</script>',
    '<img src=x onerror="window.__domInjection=\'EXECUTED\'">',
    '<svg onload="window.__domInjection=\'EXECUTED\'"></svg>',
    '<iframe src="javascript:window.__domInjection=\'EXECUTED\'"></iframe>',
    '<object data="javascript:window.__domInjection=\'EXECUTED\'"></object>',
    '<embed src="javascript:window.__domInjection=\'EXECUTED\'">',
    '<form action="javascript:window.__domInjection=\'EXECUTED\'"><input name=x></form>',
    '<a href="javascript:window.__domInjection=\'EXECUTED\'">link</a>',
    '<style>body{background:url(javascript:window.__domInjection)}</style>',
    '<base href="https://evil.example/">',
    '<meta http-equiv="refresh" content="0;url=https://evil.example/">',
]


def run() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--executable-path", default=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"))
    args = parser.parse_args()

    with sync_playwright() as p:
        executable = args.executable_path or p.chromium.executable_path
        if not Path(executable).is_file():
            raise SystemExit(f"dom-injection-security: Chromium executable not found: {executable}")
        browser = p.chromium.launch(
            headless=True,
            executable_path=executable,
            args=["--no-sandbox"] if os.name != "nt" else [],
        )
        page = browser.new_page()
        page.set_content("""
            <!doctype html>
            <meta charset="utf-8">
            <div id="output"></div>
            <textarea id="cmd-input"></textarea>
            <div class="input-line"><span></span></div>
            <button id="theme-toggle">THEME</button>
        """)
        page.evaluate("""() => {
            window.__domInjection = 'UNTOUCHED';
            window.__localStorage = {
                data: new Map(),
                getItem(key) { return this.data.has(key) ? this.data.get(key) : null; },
                setItem(key, value) { this.data.set(key, String(value)); },
                removeItem(key) { this.data.delete(key); }
            };
        }""")

        main_source = MAIN_JS.read_text(encoding="utf-8")
        preview_source = PREVIEW_SECURITY_JS.read_text(encoding="utf-8")
        stub_source = """
            export function openExternalUrl() {}
            export const networkTool = {};
            export function getUnlockedUsernameSync() { return ''; }
            export function getWorkspaceStateSync() { return { repository: '', githubActive: false }; }
        """

        # Execute the real application main.js source. Only its unrelated module
        # imports are redirected to inert test stubs so the actual DOM sink is unchanged.
        stub_url = page.evaluate("source => URL.createObjectURL(new Blob([source], {type:'text/javascript'}))", stub_source)
        main_source = main_source.replace("'./network-security.js'", repr(stub_url)).replace("'./network.js'", repr(stub_url)).replace("'./session-vault.js'", repr(stub_url))
        main_source = main_source.replace('localStorage', '__localStorage')
        main_source = main_source.replace('from \'./network-security.js\'', f"from '{stub_url}'")
        main_source = main_source.replace('from \'./network.js\'', f"from '{stub_url}'")
        main_source = main_source.replace('from \'./session-vault.js\'', f"from '{stub_url}'")
        main_url = page.evaluate("source => URL.createObjectURL(new Blob([source], {type:'text/javascript'}))", main_source)
        page.evaluate("url => import(url)", main_url)
        page.wait_for_function("typeof window.print === 'function'")

        for index, payload in enumerate(HOSTILE_VALUES):
            page.evaluate("payload => window.print(payload)", f"repository-metadata-{index}: {payload}")

        rows = page.locator("#output > div")
        assert rows.count() == len(HOSTILE_VALUES)
        for index, payload in enumerate(HOSTILE_VALUES):
            expected = f"repository-metadata-{index}: {payload}"
            assert rows.nth(index).inner_text() == expected
        assert page.locator("#output script, #output img, #output svg, #output iframe, #output object, #output embed, #output form, #output a, #output style, #output base, #output meta").count() == 0
        assert page.evaluate("window.__domInjection") == "UNTOUCHED"
        print("malicious repository metadata -> trusted Studio DOM: BLOCKED")

        # Execute the real preview-security.js module and verify raw hostile markup
        # stays repository-controlled inside the encoded isolated preview document.
        preview_url = page.evaluate("source => URL.createObjectURL(new Blob([source], {type:'text/javascript'}))", preview_source)
        page.evaluate("url => import(url).then(m => { window.__buildHtmlPreviewDocument = m.buildHtmlPreviewDocument; window.__buildTextPreviewDocument = m.buildTextPreviewDocument; })", preview_url)
        hostile_html = """<script>window.parent.__domInjection='EXECUTED'</script>
        <img onerror="window.parent.__domInjection='EXECUTED'">
        <svg onload="window.parent.__domInjection='EXECUTED'"></svg>
        <iframe src="javascript:window.parent.__domInjection='EXECUTED'"></iframe>
        <object data="javascript:window.parent.__domInjection='EXECUTED'"></object>
        <embed src="javascript:window.parent.__domInjection='EXECUTED'">
        <form action="https://evil.example/"></form>
        <a href="javascript:window.parent.__domInjection='EXECUTED'">x</a>
        <base href="https://evil.example/">
        <meta http-equiv="refresh" content="0;url=https://evil.example/">"""
        wrapped = page.evaluate("html => window.__buildHtmlPreviewDocument(html)", hostile_html)
        assert 'sandbox="allow-scripts"' in wrapped
        assert 'src="data:text/html;base64,' in wrapped
        print("hostile repository HTML -> trusted Studio DOM: BLOCKED")

        safe = page.evaluate("() => window.__buildTextPreviewDocument('safe<name>.txt', '<safe> & text')")
        assert "safe&lt;name&gt;.txt" in safe
        assert "&lt;safe&gt; &amp; text" in safe
        print("safe repository text -> Studio: ALLOWED")
        print("dom-injection-security: PASS")
        browser.close()


if __name__ == "__main__":
    run()
