# Studio Security Audit Report — Token Validation / Preview Isolation / GitHub Permissions

## IMPLEMENTED

- `unlockAndValidateStoredSession(validate)` is the only stored-session unlock API; it rejects a missing validator and commits decrypted credentials only after validation succeeds. GitHub exposes `unlockAndValidateGithubSession()`, which always performs live `/user` validation.
- Identity binding checks both `profile.id` and `profile.login` against the encrypted session metadata.
- Identity/credential validation failure locks the session and clears in-memory GitHub navigation/transient state.
- Operational GitHub HTTP 401 responses now invalidate the in-memory session immediately.
- Repository previews share a dedicated preview-security module with a sandboxed iframe using `allow-scripts` only.
- Preview documents receive a restrictive child CSP with `connect-src 'none'`, `frame-src 'none'`, `worker-src 'none'`, `object-src 'none'`, and local-only resource policies.
- Parent Studio CSP now permits only the `data:` iframe source used by the preview wrapper (`frame-src data:`).
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
- The available build used for this packaging step does not contain `vendor/argon2.umd.min.js`, so the exact local Argon2 provider artifact/hash could not be independently re-verified in this packaging environment. The previous project-side Argon2 test was user-reported as passing.
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

- The actual vendored `hash-wasm@4.12.0` provider file and its SHA-256 manifest, because the artifact is not present in the available package source.
- A live GitHub account/session with a real token was not used by the automated test suite.
- Browser-level inspection of a live malicious repository preview was not performed in a real GUI browser during this run.
