# Studio Security Audit Report — Token Validation / Preview Isolation / GitHub Permissions

## IMPLEMENTED

- `unlockAndValidateStoredSession(validate)` is the only stored-session unlock API; it rejects a missing validator and commits decrypted credentials only after validation succeeds. GitHub exposes `unlockAndValidateGithubSession()`, which always performs live `/user` validation.
- Identity binding checks both `profile.id` and `profile.login` against the encrypted session metadata.
- Identity/credential validation failure locks the session and clears in-memory GitHub navigation/transient state.
- Operational GitHub HTTP 401 responses now invalidate the in-memory session immediately.
- Repository previews share a dedicated preview-security module with a sandboxed iframe using `allow-scripts` only.
- Preview documents receive a restrictive child CSP with `connect-src 'none'`, `frame-src 'none'`, `worker-src 'none'`, `object-src 'none'`, `base-uri 'none'`, and `form-action 'none'`; local `data:`/`blob:` resources remain allowed where required for preview rendering.
- Parent Studio CSP permits only the `data:` iframe source used by the preview wrapper (`frame-src data:`); Editor and GitHub preview creation both use the same `preview-security.js` boundary.
- GitHub permission audit command is available as `permissions` inside GitHub workspace.
- All runtime permission probes are explicitly GET/read-only; they report reachability, the repository role, and GitHub's `X-Accepted-GitHub-Permissions` metadata when provided.
- The fine-grained permission matrix records `Contents: write` for repository contents writes, `Contents: write + Workflows: write` for workflow-file writes, `Issues: write` for issue writes with `Issues: write OR Pull requests: write` for shared issue/Pull Request comment operations, and `Administration: write` for repository administration/update.
- Repository creation in this Studio-scoped matrix refers specifically to `POST /user/repos` and reports `Administration: write OR Repository creation: write`. Organization and template repository creation are intentionally outside Studio capability reporting. General GitHub endpoint permission alternatives are intentionally kept outside the Studio capability matrix.
- Write capabilities are documented from endpoint requirements and are deliberately not tested through destructive or mutating probes.

## FIXED

- The validation-optional `unlockStoredSession()` API was removed. Decryption now produces temporary values; GitHub identity validation completes before operational session/key state is committed.
- Identity verification previously had the correct ID+login comparison in one path but was not guaranteed as an unlock gate; the check is now enforced during the unlock callback.
- GitHub 401 responses from normal API operations now trigger session invalidation instead of leaving an unusable token in memory.
- Repository HTML preview previously relied on a nested data iframe without a child network policy; previews now have an explicit CSP inside the rendered document.
- Preview title/text construction is escaped through the dedicated preview helper rather than interpolating repository-controlled strings into HTML.
- Editor and GitHub repository preview code now share the same isolation implementation.

## REMAINING LIMITATIONS

- Unlock-time validation is not continuous background validation. After a session is unlocked successfully, the credential may remain in memory until lock/logout or a failure path such as HTTP 401 invalidation.
- Fine-grained GitHub write permissions are not probed by this audit because proving write access generally requires a mutation. The audit reports the documented minimum permissions and safely probes read-only capabilities instead.
- Local Argon2 provider is verified and vendored from `hash-wasm@4.12.0/dist/argon2.umd.min.js` as `vendor/argon2.umd.min.js`. The checked-in SHA-256 is `dcec617a2e1b700fa132d1583a186cb70611113395e869f2dd6cc82b415d3094`. Provider: local. CDN fallback: none. Fail-closed behavior: enabled.
- Full repository preview functionality remains intentionally constrained: remote scripts, remote network requests, forms, popups, workers, and framed child content are blocked by the preview boundary.

## TEST EVIDENCE

### Verified by runtime/static test

- Complete JavaScript syntax checks for all application modules.
- JSON parsing for Argon2 test vectors.
- `tests/preview-isolation-runtime.mjs` — PASS.
- `tests/github-permissions-audit.mjs` — PASS.
- `tests/session-state-runtime.mjs` — PASS.
- `tests/security-regression.mjs` — PASS.
- Runtime unlock validation executes while the session remains locked; only successful validation is followed by operational session/key commit.
- Stored-session identity mismatch prevents operational unlock and clears navigation/workspace state.
- HTTP 401 validation failure clears the in-memory session/key through the GitHub harness.
- Preview output contains `sandbox="allow-scripts"` without `allow-same-origin`, `allow-forms`, or `allow-popups`.
- Preview child CSP is embedded before repository script execution and blocks network/frame/worker/object capabilities.
- GitHub mutation methods and permission categories are present in the complete source and are covered by the permission audit matrix.
- No raw `fetch()` calls exist outside the centralized network gateway.
- No direct plaintext GitHub storage keys are used outside the explicit legacy migration/cleanup logic.

### Verified by source inspection

- The `permissions` command is registered in the GitHub workspace command set and help text.
- Editor repository-description writes use the GitHub security wrapper, so 401 invalidation applies there too.
- Parent CSP uses `frame-src data:` rather than the previous `frame-src 'self' data:` conflict.

### Not yet independently verified in this environment

- A real deployed Studio origin was not used for browser execution because the container's Chromium policy blocks navigation to external/local origins; the browser test therefore uses an isolated test page and the exact preview-security module, while exercising the real sandboxed child in Chromium.
- The test harness uses a data:→srcdoc fallback only when the container Chromium refuses the production data: subframe; the same sandbox and child CSP are used for the executing repository document.

## PHASE 7B — REPOSITORY CONTENT INJECTION / DOM BOUNDARY

### IMPLEMENTED

- Audited the complete application source for `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `DOMParser`, repository-derived URL/event-handler attributes, and HTML string generation. No trusted Studio sink was found for repository content beyond the intentionally isolated preview wrapper.
- The trusted Studio output sink remains `textContent` in `main.js`; repository metadata is therefore rendered as text rather than interpreted markup.
- `buildTextPreviewDocument()` continues to escape repository filenames and text before placing them in its wrapper HTML.
- `buildHtmlPreviewDocument()` keeps raw repository HTML encoded as base64 in a sandboxed preview iframe; it is never parsed as trusted Studio DOM.

### TEST EVIDENCE

- `tests/dom-injection-audit.mjs` verifies the high-risk DOM/HTML parsing sink audit across the application source.
- `tests/dom-injection-security.py` executes the relevant source paths in real Chromium and verifies hostile repository metadata cannot create executable HTML in the trusted Studio output, hostile preview HTML remains behind the sandbox wrapper, and safe text preview output remains functional.
- Hostile payload coverage includes `<script>`, image/event-handler injection, SVG handlers, iframe/object/embed, forms, `javascript:` URLs, style content, `<base>`, and meta refresh.

### SOURCE AUDIT SCOPE

- `tests/dom-injection-audit.mjs` recursively discovers production `.js` files from the project root while excluding `.git`, `node_modules`, `tests`, and `vendor` third-party assets. It reports every scanned production file and fails on high-risk HTML/DOM injection sinks, executable URL/event-handler sinks, iframe `srcdoc`, and contextual HTML-fragment creation.

### REMAINING LIMITATIONS

- The injection browser test exercises the actual application `main.js` output sink and `preview-security.js` generator, but uses a controlled browser page for the trusted Studio host rather than a deployed Studio origin.

- Repository HTML is intentionally not sanitized because it is retained as repository content inside the sandboxed preview boundary; the security property is that it cannot become trusted Studio DOM.
## PHASE 7C — CROSS-CONTEXT MESSAGING / BROWSER CAPABILITY BOUNDARY

### IMPLEMENTED

The production source tree contains one trusted application-window `message` receiver (`map.js`) and two Worker-side/message-response boundaries (`argon2-worker.js` and `session-vault.js`). The map receiver now requires all of the following before mutating Studio map state: the currently tracked popup `WindowProxy`, the exact expected HTTPS popup origin, and the explicit `{ type: "studio.map", version: 1, action: "close" }` schema with no extra enumerable fields. The existing preview boundary remains intentionally message-free: repository preview content has no privileged Studio message receiver to target, and the preview wrapper is opened without an opener.

No production `BroadcastChannel`, `MessageChannel`, storage-event, SharedWorker, or ServiceWorker control channel was found. No unrestricted `event.data.command` dispatch or wildcard privileged message send was found in production code.

### TEST EVIDENCE

`tests/message-channel-security.mjs` recursively scans the complete production JavaScript source tree (excluding tests, vendor assets, `node_modules`, and `.git`) and verifies the expected message-channel inventory, source/origin/schema checks, Worker response schema validation, and absence of unrestricted dispatch/channel primitives.

`tests/message-channel-security.py` executes the real `map.js` message receiver in Chromium and sends real cross-context `postMessage` traffic from a popup, a sandboxed preview-style iframe, malformed/replayed payloads, and a wrong-origin context. It also launches the real `argon2-worker.js` and verifies malformed privileged-command traffic is rejected by the production Worker policy.

### RUNTIME RESULTS

- message-channel-security (Node) — PASS
- message-channel-security (real Chromium) — PASS
- preview-browser-security (real Chromium) — PASS
- dom-injection-security (real Chromium) — PASS
- full cumulative Node security suite — PASS

### REMAINING LIMITATIONS

The shipped Studio application intentionally exposes no privileged Studio↔preview message protocol. Therefore there is no legitimate preview-origin message to prove as an accepted command; the safe behavior is that repository preview messages are not trusted or acted upon. The map popup close protocol is currently unreachable from the external popup once `openExternalUrl()` severs `window.opener`; the hardened receiver is retained for explicit future trusted integration, but no external page is relied upon for security-critical authorization.

## PHASE 7D — FULL ADVERSARIAL EDITOR / PREVIEW SECURITY VALIDATION

### IMPLEMENTED

Phase 7D added an integrated adversarial validation layer without changing the production security implementation. The test combines the previously audited preview execution, repository DOM-injection, cross-context messaging, session-state, GitHub, permission, and local-Argon2 boundaries.

The static audit discovers and scans the complete production JavaScript tree (17 files) while excluding tests and third-party vendor assets. It verifies the expected preview sandbox/CSP, centralized network boundary, mandatory GitHub session validation, message receiver restrictions, local Argon2 provenance, and retention of all prior adversarial tests.

The real-browser adversarial test executes the actual `preview-security.js` module and the actual sandboxed repository document in Chromium. The hostile repository content attempts to access Studio DOM and sentinels, storage and cookies, forge privileged messages, use arbitrary network APIs/resources, create workers, open popups, submit forms, trigger downloads, manipulate base/meta navigation, navigate itself, navigate its parent/top context, and use custom protocols. The browser test also verifies legitimate inline HTML/CSS/JavaScript and local data/blob resources.

### VERIFIED BY STATIC INSPECTION

- 17 production JavaScript files scanned.
- No direct application network API bypass outside `network-security.js`.
- Preview uses the shared `allow-scripts` sandbox without `allow-same-origin`.
- Preview CSP retains `connect-src 'none'`, `frame-src 'none'`, `worker-src 'none'`, `object-src 'none'`, `base-uri 'none'`, and `form-action 'none'`.
- No privileged preview `message` receiver exists.
- The production map receiver requires exact source/origin/schema validation.
- GitHub stored-session unlock requires validation before operational state commit and checks both numeric ID and login.
- Local Argon2 artifact remains pinned to `hash-wasm@4.12.0` with SHA-256 `dcec617a2e1b700fa132d1583a186cb70611113395e869f2dd6cc82b415d3094`.
- All previously approved security tests remain present.

### VERIFIED BY RUNTIME TEST

- All security `.mjs` tests — PASS.
- `preview-browser-security.py` — PASS in real Chromium.
- `dom-injection-security.py` — PASS in real Chromium.
- `message-channel-security.py` — PASS in real Chromium.
- `phase7d-adversarial-audit.mjs` — PASS.
- `phase7d-adversarial-preview-security.py` — PASS in real Chromium.

### VERIFIED IN REAL BROWSER

The integrated 7D hostile repository test used real Chromium, the real preview-security module, and a real sandboxed iframe. It observed actual browser behavior for network blocking, parent/Studio isolation, popup blocking, worker blocking, form/download restrictions, and navigation containment rather than relying only on generated HTML inspection.

### REMAINING LIMITATIONS

The integrated test does not use a deployed Studio instance; the trusted Studio side is a controlled browser test page that imports the real production preview-security module. In the container, Chromium may reject the production `data:` child navigation, so the test preserves the real preview wrapper/sandbox and executes the exact generated child via a test-only `srcdoc` path for deterministic browser execution.

Preview self-navigation remains possible within the sandboxed child. This is treated as containment rather than an escape because the child cannot access Studio-origin privileges, the opener, or the top-level Studio browsing context.

### KNOWN ACCEPTED BOUNDARIES

Repository-controlled HTML and JavaScript are intentionally executable inside the preview sandbox. The security boundary is the browser sandbox plus CSP and the absence of privileged Studio messaging, not sanitization of the repository preview document itself.
