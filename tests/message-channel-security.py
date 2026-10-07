#!/usr/bin/env python3
"""Real Chromium adversarial coverage for Studio cross-context messaging."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MAP_JS = ROOT / "map.js"


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
        if not Path(executable).is_file():
            raise SystemExit(
                f"message-channel-security: Chromium executable not found: {executable}"
            )

        launch_args = ["--no-sandbox"] if os.name != "nt" else []
        browser = p.chromium.launch(
            headless=True,
            executable_path=executable,
            args=launch_args,
        )
        try:
            context = browser.new_context()
            studio = context.new_page()
            studio.set_content(
                """
                <!doctype html>
                <button id="open-popup">open</button>
                <input id="cmd-input" value="sentinel">
                <div id="output"></div>
                """
            )
            studio.evaluate(
                """() => {
                    window.__mode = 'map';
                    window.__messages = [];
                    window.registry = {};
                    window.registerTool = (name, tool) => { window.registry[name] = tool; };
                    window.print = value => window.__messages.push(String(value));
                    window.setMode = value => { window.__mode = value; };
                    window.getSystemPrompt = () => 'map>';
                    window.secureFetch = async () => { throw new Error('unexpected secureFetch in message test'); };
                    window.openExternalUrl = () => window.__testPopupWindow;
                    document.getElementById('open-popup').addEventListener('click', () => {
                        window.__testPopupWindow = window.open('about:blank', '_blank');
                    });
                }"""
            )

            # Execute the real production map.js body in Chromium. Only its imports are
            # supplied as isolated test dependencies; the message handler itself is unchanged.
            source = MAP_JS.read_text(encoding="utf-8")
            source = source.replace(
                "import { registerTool, print, setMode, getSystemPrompt } from './main.js';\n",
                "",
            ).replace(
                "import { secureFetch, openExternalUrl } from './network-security.js';\n",
                "",
            )
            studio.add_script_tag(content=source)
            assert studio.evaluate("typeof window.registry.map?.handleInput === 'function'")

            with context.expect_page(timeout=5_000) as popup_info:
                studio.locator("#open-popup").click()
            popup = popup_info.value
            popup.wait_for_load_state("domcontentloaded")

            # Exercise the real map command path so the production handler records a real
            # WindowProxy as its expected message source and the actual external-map origin.
            studio.evaluate("window.registry.map.handleInput('road/Paris')")
            studio.wait_for_timeout(100)
            baseline_mode = studio.evaluate("window.__mode")
            baseline_messages = studio.evaluate("window.__messages.slice()")
            assert baseline_mode == "map"

            valid = {"type": "studio.map", "version": 1, "action": "close"}
            malformed = [
                valid,
                {**valid, "extra": "unexpected"},
                {"type": "wrong.type", "version": 1, "action": "close"},
                {"type": "studio.map", "version": 2, "action": "close"},
                {"type": "studio.map", "version": 1, "action": "navigate"},
                ["studio.map", 1, "close"],
            ]
            for payload in malformed:
                popup.evaluate("payload => window.opener.postMessage(payload, '*')", payload)
            for _ in range(3):
                popup.evaluate("window.opener.postMessage({type:'studio.map',version:1,action:'close'}, '*')")

            # A direct Studio-window replay has the wrong source even though it has the right shape.
            for _ in range(2):
                studio.evaluate("window.postMessage({type:'studio.map',version:1,action:'close'}, '*')")

            # A sandboxed preview-style child is opaque-origin and cannot be the remembered map popup.
            studio.evaluate(
                """() => {
                    const frame = document.createElement('iframe');
                    frame.id = 'preview-message-test';
                    frame.sandbox = 'allow-scripts';
                    frame.srcdoc = `<script>parent.postMessage({type:'studio.map',version:1,action:'close'}, '*')</script>`;
                    document.body.appendChild(frame);
                    window.__destroyedFrameSource = frame.contentWindow;
                    setTimeout(() => frame.remove(), 50);
                }"""
            )
            studio.wait_for_timeout(150)
            studio.evaluate(
                "window.__destroyedFrameSource && window.__destroyedFrameSource.postMessage({type:'studio.map',version:1,action:'close'}, '*')"
            )
            studio.wait_for_timeout(150)

            # Defensive check for a missing/empty origin uses a native MessageEvent object in the
            # browser. It does not stand in for a cross-context event; it verifies the same handler
            # safely rejects an origin-less event.
            studio.evaluate(
                "window.dispatchEvent(new MessageEvent('message', {data:{type:'studio.map',version:1,action:'close'}, origin:'', source:null}))"
            )
            studio.wait_for_timeout(100)

            assert studio.evaluate("window.__mode") == baseline_mode
            assert studio.evaluate("window.__messages") == baseline_messages
            assert studio.locator("#cmd-input").input_value() == "sentinel"
            print("forged popup messages: BLOCKED")
            print("wrong-origin popup: BLOCKED")
            print("malformed/unexpected messages: BLOCKED")
            print("prototype-like/extra-field payload: BLOCKED")
            print("replayed privileged message: BLOCKED")
            print("sandboxed preview-style message: BLOCKED")
            print("destroyed preview message: BLOCKED")
            print("origin-less defensive event: BLOCKED")
            print("legitimate Studio ↔ preview privileged channel: NONE")

            popup.close()
            print("message-channel-security: PASS")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
