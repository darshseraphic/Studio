## Interactive Terminal Environment Tools — Master Documentation Matrix

A comprehensive, production-grade technical manual and operational guide for the modular web terminal toolset. This document provides step-by-step breakdowns, architecture blueprints, syntax rules, execution pipelines, and error handling for all registered tools.


## What Studio Does

Studio is a browser-based interactive terminal environment that brings several tools into one command-driven workspace. It provides readers for Bhagavad Gita verses and Bible passages, a scientific-calculator environment, a Cat API portal, and a GitHub workspace for browsing, editing, previewing, and managing repository content. The GitHub workspace can create repositories and files, pull and save files, rename or delete resources with confirmation guardrails, manage issues and repository settings, and open isolated previews of repository content. The command reference and detailed tool documentation below remain the authoritative descriptions of those capabilities.

## How Studio Protects User Data

Studio is designed so that sensitive GitHub session data and untrusted repository content are handled differently from ordinary application data.

### GitHub Credentials and Session State

GitHub credentials are stored in the encrypted Studio session envelope rather than as standalone plaintext browser keys. The operational GitHub session is kept in memory only while unlocked. Unlocking a stored session does not make it operational until GitHub `/user` validation succeeds and both the stored immutable GitHub user ID and login match the verified profile. A validation failure or GitHub HTTP 401 locks the session and clears the in-memory authorization and GitHub workspace/navigation state.

The `lock` operation clears the in-memory session and cryptographic key while preserving the encrypted session for a later unlock. `logout` destroys the encrypted stored session and performs the associated legacy cleanup.

GitHub repository/workspace binding state is stored inside the encrypted session envelope rather than as standalone plaintext `repository` or `github_active` browser state. Local file buffers and virtual directory state are kept in volatile browser memory rather than persisted as separate GitHub credential storage.

### API and Network Protection

Application API traffic is routed through the centralized `network-security.js` gateway. Requests are restricted to documented allowlisted origins, require HTTPS for external services, omit browser credentials, send no referrer, reject redirects, and enforce a hard maximum request timeout of 20 seconds. GitHub authorization headers are not allowed to cross to non-GitHub API origins.

External URLs opened through Studio are independently validated so dangerous URL schemes, embedded credentials, and non-local HTTP destinations are rejected. The popup is created with its opener relationship severed before external navigation.

### Repository Preview Protection

Repository-controlled HTML and JavaScript are treated as untrusted content. Editor and GitHub previews use the shared `preview-security.js` boundary and run inside `sandbox="allow-scripts"` iframes without `allow-same-origin`, form, popup, download, or top-navigation permissions.

The preview child receives its own restrictive CSP before repository-controlled content can execute. It blocks arbitrary connection APIs, remote executable resources, frames, workers, objects, and forms while preserving legitimate inline HTML/CSS/JavaScript and local `data:`/`blob:` resources. The preview has an opaque origin and no Studio opener, preventing repository code from directly accessing Studio DOM, cookies, storage, or session state.

Repository text and metadata rendered in the trusted Studio document use text-oriented output rather than trusted HTML insertion. Raw repository HTML remains inside the isolated preview boundary.

### Argon2id Session-Key Protection

GitHub session-key derivation runs in a dedicated same-origin Web Worker using the exact locally vendored `hash-wasm@4.12.0` Argon2id provider. The production parameters are enforced inside the Worker and the verified local provider artifact is recorded by SHA-256. There is no CDN fallback; if the local provider cannot be loaded or verified, derivation fails closed.

Temporary password, salt, provider-result, and handoff buffers receive best-effort cleanup. Browser JavaScript cannot guarantee zeroization of immutable strings or all runtime copies, so this is memory hygiene rather than hardware-enforced memory isolation.

### What Is and Is Not Encrypted

The security model above is primarily concerned with GitHub credentials, session keys, encrypted workspace state, and the boundary around untrusted repository code. It does **not** mean every piece of browser state is encrypted.

For example, the calculator intentionally stores its variables and terminal history in browser `localStorage`, as documented in the calculator section below. Users should therefore avoid entering secrets into calculator state or other non-sensitive tool data that the documentation identifies as browser-persisted.

## Security Architecture

Studio routes application API traffic through the centralized `network-security.js` gateway. API requests are restricted to the documented Studio service origins, require HTTPS, omit browser credentials, send no referrer, reject redirects, and use a hard-bounded timeout: callers may request a smaller timeout, but the effective timeout can never exceed 20 seconds. The generic external-navigation validator accepts `http://localhost`, `127.0.0.1`, or `[::1]` for local development; the API gateway still requires an explicitly allowlisted origin, so localhost HTTP is not an allowed API origin by default.

External browser navigation from the `open` command is handled separately through the same security module. It rejects non-web URL schemes, embedded credentials, and non-local HTTP destinations before opening a new tab. The navigation target is opened with an opener severed before external navigation is committed.

The HTML Content Security Policy keeps application API traffic on the documented allowlist, while repository previews use a separate child CSP. Editor and GitHub previews both flow through `preview-security.js`: the wrapper embeds repository HTML in a `sandbox="allow-scripts"` iframe without `allow-same-origin`, forms, popups, downloads, or top-navigation privileges. The child CSP is placed before all repository-controlled bytes, including hostile markup that places `<script>` before `<head>`, and blocks arbitrary connections, frames, workers, objects, and remote executable resources while preserving inline HTML/CSS/JavaScript plus local `data:`/`blob:` resources. The preview child has an opaque origin and no Studio opener, preventing access to Studio DOM, cookies, storage, or session state.

GitHub workspace state is consolidated into the encrypted session envelope. The application does not persist `repository` or `github_active` as standalone plaintext GitHub state. Unlocking verifies the token at unlock/first-use time against GitHub `/user` and requires both the immutable numeric user ID and login name to match the encrypted session. A mismatch immediately locks the vault and clears Studio's in-memory GitHub workspace/navigation state. This is unlock-time/first-use validation, not continuous background token validation; an unlocked token remains in memory until lock/logout or an explicit failure path.

## Argon2id security boundary

GitHub session key derivation runs inside a dedicated same-origin Web Worker. The worker enforces Argon2id v1.3 with the production policy below; the caller cannot weaken these parameters:

```text
Algorithm:   Argon2id
Version:     0x13 / Argon2 v1.3
Memory:      131072 KiB / 128 MiB
Iterations:  4
Parallelism: 1
Output:      32 bytes
Salt:        32 bytes
```

The worker loads only the same-origin `vendor/argon2.umd.min.js` provider from `hash-wasm@4.12.0` and verifies that `hashwasm.argon2id` is callable. There is no CDN fallback; if the local provider cannot be loaded or verified, derivation fails closed. The verified provider artifact SHA-256 is `dcec617a2e1b700fa132d1583a186cb70611113395e869f2dd6cc82b415d3094`. The worker also wipes password, salt, provider-result, and failed handoff buffers on its side. The key handoff is made from a separate copy: the worker wipes the provider-owned result before transferring the copy, then the transferred buffer is detached from the worker.

Verified local provider provenance: package `hash-wasm`, version `4.12.0`, artifact `vendor/argon2.umd.min.js` sourced from `dist/argon2.umd.min.js`. The checked-in manifest `vendor/argon2.umd.min.js.sha256` records SHA-256 `dcec617a2e1b700fa132d1583a186cb70611113395e869f2dd6cc82b415d3094`. Provider: local. CDN fallback: none. Fail-closed behavior: enabled. The local-provider integration test verifies the artifact and requires the runtime provider source to be local.

### Sensitive buffer cleanup

The session vault wipes temporary plaintext byte arrays after AES-GCM encryption/decryption and clears its in-memory session key and session object on lock. Browser JavaScript cannot guarantee zeroization of immutable strings or copies held by the browser/runtime, so these measures are best-effort memory hygiene rather than a hardware-enforced memory isolation guarantee.

## Executive Architecture Overview

The system operates as an interactive, multi-context web terminal. Each tool registers into a central command registry using `registerTool()` and controls context transitions through `setMode()`.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CENTRAL TERMINAL RUNTIME                              │
│                                  (main.js)                                      │
└───────┬───────────────┬─────────────────┬────────────────┬──────────────────────┘
        │               │                 │                │
        ▼               ▼                 ▼                ▼                      ▼
┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌──────────────┐ ┌──────────────────┐
│  bhagvad     │ │    bible     │ │  calculator   │ │     cat      │ │     github       │
└──────────────┘ └──────────────┘ └───────────────┘ └──────────────┘ └──────────────────┘
```

## Tool 1: Bhagavad Geeta Reader (`bhagvad`)

The Bhagavad Geeta Reader allows users to explore chapters and individual shloks (verses) from the Bhagavad Gita along with transliterations, translations, and commentaries by authorized scholars.

### Overview & Configuration

* **Tool Keyword**: `bhagvad`
* **Default Prompt Context**: `${username}/bhagvad/geeta>` or `bhagvad/geeta>`
* **Upstream Data API**: `https://vedicscriptures.github.io/slok/${chapter}/${shlok}`



### Command Reference & Step-by-Step Execution

#### 1. Context Activation
* **Command**: `bhagvad` (invoked from main prompt)
* **Description**: Enters the Bhagavad Geeta interactive sub-terminal mode.
* **Step-by-Step Execution Flow**:
  1. `onEnter()` lifecycle hook is triggered by the terminal runtime.
  2. Resolves the active user identity from the unlocked encrypted Studio session (defaults to `'guest'` while locked).
  3. Updates prompt context via `setMode('bhagvad', getGeetaPrompt())`.
  4. Displays system initialization headers and usage instructions.

#### 2. Shlok Retrieval (`[chapter]/[shlok]`)
* **Command Syntax**: `[chapter]/[shlok]` (e.g., `1/1`, `2/47`, `18/66`)
* **Description**: Queries and renders a specific verse including original Sanskrit text, Roman transliteration, and filtered commentary.
* **Step-by-Step Execution Flow**:
  1. **Input Normalization**: Trims whitespace and extracts the command string.
  2. **Sub-string Filter**: Bypasses processing if input equals root keywords like `'geeta'`, `'bhagvad'`, or trailing slash variations.
  3. **Format Validation**: Splits input by `/`. Validates that exactly two numeric components exist using the regex `/^\d+$/`.
  4. **API Request**: Performs an asynchronous `secureFetch()` request to `https://vedicscriptures.github.io/slok/${chapter}/${shlok}`.
  5. **Payload Validation**: Verifies HTTP response status (`res.ok`) and confirms presence of `data.slok`.
  6. **Text Formatting Engine**:
     * Applies `cleanWrap()` to format Sanskrit text and transliteration into clean, fixed-width blocks (max 74 characters wide) with uniform line indentation.
     * Applies `chunkAndWrap()` to split long commentaries into continuous two-sentence readable paragraphs wrapped at 70 characters.
  7. **Scholar Filter Pipeline**: Iterates through response keys and filters commentaries to display only authorized authors:
     * *Swami Adidevananda*
     * *Shri Purohit Swami*
     * *A.C. Bhaktivedanta Swami Prabhupada*
  8. **Terminal Render**: Outputs structured ASCII banners separating original verse, transliteration, and author commentaries.

#### 3. Sub-terminal Help System (`help`)
* **Command**: `help`
* **Description**: Outputs command maps and usage examples for the Bhagavad Geeta reader.
* **Step-by-Step Execution Flow**:
  1. Input is lowercased and matched against `'help'`.
  2. Invokes `printGeetaHelp()`, which outputs formatted help lines to the terminal.

#### 4. Exit Mode Context (`exit`)
* **Command**: `exit`
* **Description**: Leaves the Bhagavad Geeta sub-terminal and returns to the root context.
* **Step-by-Step Execution Flow**:
  1. Input matched against `'exit'`.
  2. Calls `setMode('main', getSystemPrompt())` to reset the terminal prompt.


## Tool 2: Holy Bible Reader (`bible`)

The Holy Bible Reader enables fetching specific verses across various translations and books using a structured book/chapter:verse query format.

### Overview & Configuration

* **Tool Keyword**: `bible`
* **Default Prompt Context**: `${username}/bible>` or `bible>`
* **Upstream Data API**: `https://bible-api.com/${encodedBook}+${chapter}:${verse}`


### Command Reference & Step-by-Step Execution

#### 1. Context Activation
* **Command**: `bible`
* **Description**: Switches session context to the Bible Reader mode.
* **Step-by-Step Execution Flow**:
  1. Executes `onEnter()` hook.
  2. Resolves the active username from the unlocked encrypted Studio session to generate the interactive prompt string.
  3. Sets active mode using `setMode('bible', getBiblePrompt())`.
  4. Displays welcome banner and command help hints.

#### 2. Verse Retrieval (`[book]/[chapter]:[verse]`)
* **Command Syntax**: `[book]/[chapter]:[verse]` (e.g., `john/3:16`, `genesis/1:1`, `psalms/23:1`)
* **Description**: Fetches and renders scripture text based on book name, chapter number, and verse number.
* **Step-by-Step Execution Flow**:
  1. **Input Trimming & Guards**: Trims leading/trailing whitespace. Ignores empty strings or standalone mode keywords (`'bible'`, `'scripture'`).
  2. **Primary Split**: Splits input string across the `/` character into `book` and `chapter:verse` string segments.
  3. **Secondary Partition**: Splits the second segment across the `:` character to isolate `chapter` and `verse` numbers.
  4. **Syntax Validation**: Validates that both chapter and verse match numeric pattern `/^\d+$/`.
  5. **URL Encoding**: Encodes the book name using `encodeURIComponent()` to safely handle multi-word books (e.g., "1 john").
  6. **Network Request**: Issues a `secureFetch()` GET request to `https://bible-api.com/${encodedBook}+${chapter}:${verse}`.
  7. **Error Verification**: Evaluates standard HTTP errors (e.g., 404 for invalid references) and gracefully logs status failures.
  8. **Text Formatting & Rendering**:
     * Extracts reference string (`data.reference`) and scripture passage (`data.text`).
     * Runs text through `cleanWrap()` to ensure lines do not exceed 74 characters.
     * Renders scripture content inside an ASCII double-line border box.

#### 3. Help Command (`help`)
* **Command**: `help`
* **Description**: Prints interactive operational guide.

#### 4. Exit Command (`exit`)
* **Command**: `exit`
* **Description**: Leaves Bible Reader context and restores primary system prompt.


## Tool 3: Casio fx-570ES PLUS Emulation Engine (`calculator`)

A full scientific calculator emulator replicating the operations of the Casio fx-570ES Plus engineering calculator. Supports complex numbers, multi-base conversions, numerical calculus, matrix arithmetic, vector space operations, linear system solvers, statistical regression, and functional table generation.

### System Architecture & State Registers

* **Prompt Context**: `calc>`
* **Storage Persistence**:
  * `calc_variables`: Stores system registers (`A`, `B`, `C`, `D`, `X`, `Y`, `M`, `ANS`) as complex structure objects `{ re: Number, im: Number }`.
  * `calculator`: Caches terminal input/output history buffers in `localStorage`.


### Command Subsystems & Step-by-Step Execution

#### Subsystem A: Variable Storage Assignments
* **Syntax**: `REGISTER = expression` (e.g., `X = 5 * pi`, `A = 3 + 4i`, `B = sqrt(-16)`)
* **Supported Registers**: `A`, `B`, `C`, `D`, `X`, `Y`, `M`, `ANS`
* **Step-by-Step Execution**:
  1. Intercepts inputs matching pattern `/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/`.
  2. Verifies register name against system registers.
  3. Tokenizes and evaluates the right-hand expression using `parseAndEvaluate()`.
  4. Stores complex result `{ re, im }` into variable register table and syncs to `localStorage`.


#### Subsystem B: Complex Arithmetic Mode (CMPLX)
* **Syntax Examples**:
  * `(2 + 3i) * (1 - 2i)` -> Evaluates to `8 - i`
  * `sqrt(-4)` -> Evaluates to `2i`
  * `i^i` -> Evaluates to `0.2078795764` ($e^{-\pi/2}$)
  * `pol(3, 4)` -> Transforms rectangular coordinates $(3, 4)$ into polar representation ($r\angle\theta\text{ rad}$)
* **Mathematical Operations**:
  * Complex Addition/Subtraction: $(a + bi) \pm (c + di) = (a \pm c) + (b \pm d)i$
  * Complex Multiplication: $(a + bi)(c + di) = (ac - bd) + (ad + bc)i$
  * Complex Division: $\frac{a + bi}{c + di} = \frac{(ac + bd) + (bc - ad)i}{c^2 + d^2}$
  * Complex Exponentiation: $a^b = e^{b \ln(a)}$ where $\ln(z) = \ln|z| + i \arg(z)$


#### Subsystem C: Multi-Base Digital Logic Architecture (BASE-N)
* **Commands**:
  * `base:bin(expr)`: Evaluates expression and outputs 32-bit unsigned binary (`0b...`).
  * `base:hex(expr)`: Evaluates expression and outputs hexadecimal (`0x...`).
  * `base:oct(expr)`: Evaluates expression and outputs octal (`0o...`).
  * `base:dec(expr)`: Evaluates expression and outputs decimal integer string.
  * `base:and(valA, valB)`: Performs bitwise AND ($A \land B$).
  * `base:or(valA, valB)`: Performs bitwise OR ($A \lor B$).
  * `base:xor(valA, valB)`: Performs bitwise XOR ($A \oplus B$).
  * `base:not(val)`: Performs bitwise NOT ($\sim A$).
* **Step-by-Step Execution**:
  1. Identifies `base:` prefix.
  2. Parses inner arguments and evaluates expression scalar real component.
  3. Truncates value to integer using `Math.floor()`.
  4. Performs bitwise shift/operation (`>>> 0` for unsigned representations) and prints formatted string.


#### Subsystem D: Equation Root Solvers (EQN Mode)

##### 1. Quadratic Equation Solver
* **Syntax**: `solve:quadratic(a, b, c)`
* **Mathematical Algorithm**: Solves $ax^2 + bx + c = 0$ using the quadratic formula:

$$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$

* **Step-by-Step Execution**:
  1. Extracts $a, b, c$ values.
  2. Computes discriminant $\Delta = b^2 - 4ac$.
  3. If $\Delta \ge 0$, computes two real roots.
  4. If $\Delta < 0$, computes complex conjugate pair $x = -\frac{b}{2a} \pm \frac{\sqrt{-\Delta}}{2a}i$.

##### 2. Simultaneous Linear System Solvers
* **2x2 Linear Solver Syntax**: `solve:linear([[a1,b1,c1], [a2,b2,c2]])`
  * Solves system:

$$\begin{cases} a_1 X + b_1 Y = c_1 \\ a_2 X + b_2 Y = c_2 \end{cases}$$

  * Applies Cramer's Rule: $D = a_1 b_2 - b_1 a_2$, $X = \frac{c_1 b_2 - b_1 c_2}{D}$, $Y = \frac{a_1 c_2 - c_1 a_2}{D}$.

* **3x3 Linear Solver Syntax**: `solve:linear([[a1,b1,c1,d1], [a2,b2,c2,d2], [a3,b3,c3,d3]])`
  * Solves 3D spatial vector intersection system using 3x3 Cramer's Rule determinants.



#### Subsystem E: Functional Value Tracing Grid (TABLE Mode)
* **Syntax**: `table(algebraic_expression, start_X, end_X, incremental_step)`
* **Example**: `table(X^2 + 1, 1, 3, 0.5)`
* **Step-by-Step Execution**:
  1. Parses algebraic expression containing independent variable `X`.
  2. Evaluates start, end, and step scalar values.
  3. Loops $x$ from `start_X` to `end_X` incrementing by `incremental_step`.
  4. Evaluates $f(x)$ dynamically passing custom $X$ value context to the parser.
  5. Renders formatted ASCII table grid.


#### Subsystem F: Statistics & Regression Analysis (STAT Mode)
* **Descriptive Summary Syntax**: `stat:summary([x1, x2, x3...])`
  * Computes count ($n$), mean ($\bar{x}$), sample standard deviation ($s$), minimum, and maximum.
* **Linear Regression Syntax**: `stat:reg([[x1, y1], [x2, y2]...])`
  * Fits coordinate pairs to linear trendline $Y = mX + b$ using least-squares formulas:

$$m = \frac{n \sum (xy) - \sum x \sum y}{n \sum (x^2) - (\sum x)^2}, \quad b = \frac{\sum y - m \sum x}{n}$$


#### Subsystem G: Numerical Higher Calculus
* **Numerical Differentiation**:
  * **Syntax**: `diff(expression, target_value)` (e.g., `diff(X^3, 2)`)
  * **Algorithm**: Central finite difference method with step size $h = 10^{-5}$:

$$f'(x) \approx \frac{f(x + h) - f(x - h)}{2h}$$

* **Numerical Definite Integration**:
  * **Syntax**: `int(expression, start, end)` (e.g., `int(X^2, 0, 3)`)
  * **Algorithm**: Composite Simpson's $1/3$ Rule over $N = 1000$ sub-intervals:

$$\int_{a}^{b} f(x) dx \approx \frac{h}{3} \left[ f(a) + 2 \sum_{j=1}^{N/2-1} f(x_{2j}) + 4 \sum_{j=1}^{N/2} f(x_{2j-1}) + f(b) \right]$$


#### Subsystem H: Matrix & Vector Array Modes

| Command Category | Command Syntax | Description & Operation |
| :  | :  | :  |
| **Matrix Determinant** | `mat:det([[a,b],[c,d]])` | Computes $2 \times 2$ or $3 \times 3$ matrix determinant $D$. |
| **Matrix Inversion** | `mat:inv([[a,b],[c,d]])` | Computes inverted matrix $A^{-1} = \frac{1}{\det(A)} \text{adj}(A)$. |
| **Matrix Addition** | `mat:add(matA, matB)` | Performs element-wise sum $C_{ij} = A_{ij} + B_{ij}$. |
| **Matrix Multiplication**| `mat:mul(matA, matB)` | Computes matrix product $C_{ij} = \sum_{k} A_{ik} B_{kj}$. |
| **Vector Magnitude** | `vec:mag([x, y, z])` | Calculates Euclidean length $\|V\| = \sqrt{x^2 + y^2 + z^2}$. |
| **Vector Dot Product** | `vec:dot(vA, vB)` | Computes scalar product $A \cdot B = A_x B_x + A_y B_y + A_z B_z$. |
| **Vector Cross Product**| `vec:cross(vA, vB)` | Computes 3D vector cross product $A \times B$. |


## Tool 4: Cat API Portal (`cat`)

Provides access to random cat facts and paginated cat breed information using the CatFact Ninja API.

### Overview & Configuration

* **Tool Keyword**: `cat`
* **Default Prompt Context**: `cat>`
* **Upstream Data API**: `https://catfact.ninja`


### Command Reference & Step-by-Step Execution

#### 1. Context Activation
* **Command**: `cat`
* **Step-by-Step Execution Flow**:
  1. Triggers `onEnter()` lifecycle event.
  2. Displays system banner instructing user on valid subcommand formats.

#### 2. Random Fact Fetcher (`random` or `cat/random`)
* **Command Syntax**: `random` or `cat/random`
* **Step-by-Step Execution**:
  1. Trims input and strips optional `cat/` prefix.
  2. Issues asynchronous GET request to `https://catfact.ninja/fact`.
  3. Parses JSON payload response object.
  4. Renders string value from `data.fact` key.

#### 3. Cat Breeds Catalog (`breeds` or `breeds/[page]`)
* **Command Syntax**: `breeds` or `breeds/2` or `cat/breeds/3`
* **Step-by-Step Execution**:
  1. Normalizes command string and extracts target page parameter (defaults to page `1` if omitted).
  2. Queries `https://catfact.ninja/breeds?page=${page}`.
  3. Iterates over returned array `data.data`.
  4. Renders each entry displaying breed name (`item.breed`) and country of origin (`item.country`).

#### 4. Exit Context Mode (`CTRL + E` or mode reset)
* Exits `cat>` mode prompt.


## Tool 5: GitHub Workspace Integration Suite (`github`)

A full virtual filesystem interface and cloud sync manager integrated with the official GitHub REST API. Supports remote workspace navigation, file editing, buffer management, repository provisioning, interactive deletions/renames, issue tracking, and sandbox application rendering.

### Environment Architecture & State Controls

* **Context Prompt**: `${username}/github${repository}${path}>`
* **State Registers**:
  * Encrypted session envelope: stores the GitHub token, verified identity, session ID, repository binding, activity state, and creation metadata.
  * In-memory session: holds the decrypted session only while unlocked; locking clears the token-bearing session object and cryptographic key from Studio memory.
  * Active GitHub workspace state (`repository` + `githubActive`) is stored inside the encrypted session envelope; no GitHub credential or workspace-binding flag is kept in plaintext browser storage.
  * `fileBuffers`: In-memory volatile dictionary caching active local file modifications.
  * `virtualDirectories`: Set tracking locally created directory paths.


### Interactive Confirmation Guardrails

To prevent accidental data loss, structural modifications (deletion, renaming, visibility adjustments) trigger interactive confirmation states that pause routine command parsing.

```
┌────────────────────────────────────────────────────────┐
│               COMMAND ISSUED BY USER                   │
│           (e.g., delete/app.js or rename/old)          │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│        SET INTERACTIVE STATE REGISTERS                 │
│      (pendingDeleteTarget, pendingRenameTarget)        │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│           PROMPT MODIFIED TO: "> "                     │
│    Awaits administrative confirmation [Yes/no]        │
└───────────────────────────┬────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
   User responds "Yes"             User responds "No"
            │                               │
            ▼                               ▼
 Execute GitHub API operation     Abort action sequence
 Reset prompt mode context        Reset prompt mode context
```


### Command Reference & Step-by-Step Execution

#### 1. Navigation & Path Traversals

##### Command: `cd [directory_name]`
* **Description**: Descends into a sub-directory node within the workspace.
* **Step-by-Step Execution**:
  1. If no repository is active, verifies remote repository existence via `verifyRemotePath(targetRepo, '')`. Sets active repository on success.
  2. If inside a repository, checks directory existence via GitHub API (`/contents/${path}`).
  3. Appends directory segment to `currentPath` and updates prompt.

##### Command: `cd [file_name.ext]`
* **Description**: Pulls and displays a read-only preview of a target file.
* **Step-by-Step Execution**:
  1. Detects `.` in target string.
  2. Checks for cached version in `fileBuffers`.
  3. If missing, calls `pullFileFromGitHub(fullPath)` to retrieve content.
  4. Renders file text directly to console between ASCII boundaries.

##### Command: `cd ..` or `..`
* **Description**: Ascends upward to parent directory or unbinds repository if at root level.

##### Command: `[username]/` (e.g., `guest/`, `octocat/`)
* **Description**: Instantly unbinds active repository and resets working directory to root GitHub workspace context.


#### 2. Resource Inspection & Directory Manifests

##### Command: `fletch`
* **Description**: Lists all repositories under the logged-in GitHub account when no repository is bound.
* **Step-by-Step Execution**:
  1. Fetches repository array from `https://api.github.com/user/repos?per_page=100&sort=updated`.
  2. Renders list indicating repository name and privacy status (`(private)`).

##### Command: `fletch/[directory_name]`
* **Description**: Fetches remote directory contents.
* **Step-by-Step Execution**:
  1. Issues GET request to repository contents endpoint `/contents/${path}`.
  2. Renders subdirectories (`-- dir/`) and files (`-- file.ext`).
  3. Populates local `virtualDirectories` and `fileBuffers` caches.

##### Command: `fletch/[file_name.ext]`
* **Description**: Downloads and displays full raw file contents.


#### 3. File Creation & Buffer Synchronization

##### Command: `create/[target]`
* **Syntax Examples**:
  * `create/my-new-repo` (when no repo bound): Provisions a new private GitHub repository.
  * `create/index.html`: Allocates a new file in active workspace.
  * `create/components`: Creates a virtual directory with a `.gitkeep` placeholder file.
* **Step-by-Step Execution (File Creation)**:
  1. Parses file extension against allowed format list (`VALID_EXTENSIONS`).
  2. Initializes local entry in `fileBuffers[target]`.
  3. Converts payload content string to UTF-8 base64 encoding.
  4. Issues HTTP `PUT` request to `/repos/${user}/${repo}/contents/${path}`.

##### Command: `edit/[file_name]` or `editor`
* **Description**: Opens the target file in the universal plaintext editor.
* **Step-by-Step Execution**:
  1. Pulls remote contents from GitHub if not already cached in local memory.
  2. Splits text into line arrays stored in `fileBuffers[target]`.
  3. Switches mode to `editor`.

##### Command: `pull/[file_name]`
* **Description**: Force-refreshes local workspace memory buffer with remote content from GitHub.

##### Command: `save/[file_name]`
* **Description**: Serializes local line buffer and commits/pushes changes to GitHub.
* **Step-by-Step Execution**:
  1. Reads line buffer array from `fileBuffers[target]` and joins with `
`.
  2. Encodes binary text string into Base64 format.
  3. Fetches target SHA hash from GitHub to determine if operation is an update or creation.
  4. Issues HTTP `PUT` request with updated commit message and Base64 body.

 

#### 4. Interactive Resource Deletion & Relocation

##### Command: `delete/[target]`
* **Description**: Triggers interactive deletion sequence for files, directories, or entire repositories.
* **Step-by-Step Execution**:
  1. Sets `pendingDeleteTarget` and `pendingDeleteType` (`repository`, `file`, or `directory`).
  2. Prompts user: `Are you sure you want to delete the [type] '[target]', [Yes/no]?`
  3. On user confirmation (`yes`/`y`):
     * **Repository**: Unbinds local context and clears path state.
     * **File**: Obtains file SHA hash via GET request, then issues HTTP `DELETE` payload request.
     * **Directory**: Executes recursive deletion by listing directory tree nodes and deleting each child file.

##### Command: `rename/[target]`
* **Description**: Interactively renames a file, directory, or repository.
* **Step-by-Step Execution (File Rename)**:
  1. Prompts for new file name and validates target extension.
  2. Reads source file content.
  3. Pushes file content to new path location (`pushFileToGitHub`).
  4. On successful creation, deletes original file node (`deletePathFromGitHub`).

 

#### 5. Application Sandbox Runtime Visualizer

##### Command: `run/[file_name]`
* **Description**: Packages workspace files and launches an isolated visual rendering tab in the browser.
* **Step-by-Step Execution**:
  1. Retrieves file text buffer from `fileBuffers[target]`.
  2. Base64 encodes content payload using `btoa(unescape(encodeURIComponent(code)))`.
  3. Constructs sandbox HTML wrapper document:
     * **HTML Files (`.html`)**: Wraps content inside the shared sandboxed `<iframe>` security boundary enforced by `preview-security.js`; repository HTML may execute inline scripts inside the sandbox while the preview CSP blocks remote executable resources, arbitrary connections, frames, workers, objects, and forms.
     * **Other Text Files**: Wraps content in styled terminal preview code block.
  4. Generates dynamic Blob URL via `URL.createObjectURL(blob)` and opens it in a new browser tab (`window.open`).

 

#### 6. Issue Tracking System

| Command Syntax | Operation & Execution Flow |
| :  | :  |
| `issues` | Queries `https://api.github.com/repos/.../issues?state=all`. Renders list with state indicators (`++` for open, `--` for closed). |
| `issues/[number_or_title]` | Fetches detailed view for specific issue including body, author, and timestamp metadata. |
| `issues/close/[number]` | Sends PATCH request setting issue state to `'closed'`. |
| `issues/reopen/[number]` | Sends PATCH request setting issue state to `'open'`. |
| `issues/comment/[num]/"msg"` | Sends POST request to create a new comment on target issue. |
| `issues/fixed/[num]/"msg"` | Posts comment to target issue, then sends PATCH request marking it closed. |

 

#### 7. Administrative Repository Settings

##### Command: `settings/help`
* Renders settings command menu.

##### Command: `settings/rename`
* Interactively prompts user and sends PATCH request updating repository `name` attribute.

##### Command: `settings/branch/[branchName]`
* Sends PATCH request setting default repository branch (`default_branch`).

##### Command: `settings/issues/all`
* Issues DELETE request to `/interaction-limits` endpoint to remove interaction restrictions.

##### Command: `settings/issues/collaborative`
* Issues PUT request to `/interaction-limits` setting access restriction to `collaborators_only` for six months.

##### Command: `settings/sponsorships`
* Checks for `.github/FUNDING.yml` configuration and toggles funding file presence.

##### Command: `settings/visibility/public` or `settings/visibility/private`
* Interactively prompts user, then sends PATCH request setting `private: true/false`.

 

## Comprehensive Command Quick Reference Sheet

```
===================================================================================================
TOOL CONTEXT     COMMAND SYNTAX                    DESCRIPTION / FUNCTION
===================================================================================================
bhagvad          [chapter]/[shlok]                 Fetch Gita verse, transliteration & commentary
bhagvad          help                              Display Gita command help menu
bhagvad          exit                              Return to primary prompt                                 
bible            [book]/[chapter]:[verse]          Fetch Bible passage by reference
bible            help                              Display Bible command help menu
bible            exit                              Return to primary prompt                              
calculator       REGISTER = [expression]           Assign expression result to register (A,B,C,X,Y,M)
calculator       base:[bin|hex|oct|dec](expr)      Evaluate expression in specified number base
calculator       base:[and|or|xor](A, B)           Bitwise binary operation between two values
calculator       solve:quadratic(a, b, c)          Solve quadratic polynomial roots
calculator       solve:linear([matrix])           Solve 2x2 or 3x3 linear system via Cramer's Rule
calculator       table(expr, start, end, step)     Generate functional value trace grid
calculator       stat:summary([data_array])        Compute mean, std dev, min, max summary
calculator       stat:reg([[x1,y1], [x2,y2]])       Compute linear regression equation Y = mX + b
calculator       diff(expr, value)                 Compute central difference numerical derivative
calculator       int(expr, start, end)             Compute definite integral via Simpson's Rule
calculator       mat:[det|inv|add|mul](...)        Matrix determinant, inverse, sum, or product
calculator       vec:[mag|dot|cross](...)          Vector length, dot product, or cross product                          
cat              random                            Fetch random cat fact
cat              breeds/[page_number]              List cat breeds by catalog page                  
github           github                            Enter GitHub workspace context mode
github           fletch                            List user repositories or directory tree
github           cd [dir|file|..]                  Navigate directory tree or preview file
github           create/[target]                   Create repository, workspace file, or folder
github           edit/[file_name]                  Open plaintext file editor
github           save/[file_name]                  Commit and push local memory buffer to GitHub
github           pull/[file_name]                  Refresh local buffer with remote GitHub content
github           delete/[target]                   Interactively purge file, folder, or repo
github           rename/[target]                   Interactively rename file, folder, or repo
github           run/[file_name]                   Launch isolated sandbox visualizer tab
github           issues                            List repository issues
github           issues/fixed/[num]/"msg"          Post comment and close issue
github           settings/[action]                 Configure repository branch, visibility, etc.
github           vscode                            Open vscode.dev in a new browser tab
github           exit / [username]/                Unbind repository / exit workspace
===================================================================================================
```

 

## Error Handling & Exception Resolution Guide

| System Module | Error Condition / Log Message | Root Cause | Resolution Sequence |
| :--- | :--- | :--- | :--- |
| **Bhagavad Geeta** | `error: invalid format. please use chapter/shlok` | Command string contains invalid parameters or non-numeric inputs. | Format as `[chapter]/[shlok]` using valid digits (e.g., `2/47`). |
| **Bhagavad Geeta** | `error: unable to retrieve chapter... status 404` | Requested chapter or verse does not exist in the payload. | Verify parameters match bounds (18 chapters, valid verse count per chapter). |
| **Bible Reader** | `error: invalid format. please use book/chapter:verse` | Missing colon (`:`) or missing chapter/verse segment. | Format passage reference as `[book]/[chapter]:[verse]` (e.g., `john/3:16`). |
| **Calculator** | `division by zero complex boundaries` | Attempted division where denominator magnitude equals zero ($c^2 + d^2 = 0$). | Check input expression limits and complex boundary values. |
| **Calculator** | `quadratic systems require exactly three scalar coefficient variables` | `solve:quadratic()` received an incorrect number of coefficients. | Provide exactly three numeric coefficients: `solve:quadratic(a, b, c)`. |
| **GitHub** | `error: authentication token signature missing` | No unlocked verified authorization session is available. | Use `github` and authenticate with `login/token`, then unlock the encrypted session when prompted. |
| **GitHub** | `error: layout configuration rejected. extension... breaks systemic syntax rule maps` | Target file extension is not listed in `VALID_EXTENSIONS`. | Save or rename the file using a supported plaintext format extension. |
## Argon2id vendoring

Run `scripts/vendor-argon2-provider.sh` on a network-enabled development machine to fetch the exact `hash-wasm@4.12.0` npm package and install only its `dist/argon2.umd.min.js` provider. The script checks the package version and records the provider SHA-256 in `vendor/argon2.umd.min.js.sha256`.

The production local-provider integration test verifies the exact vendored artifact, its SHA-256 manifest, `provider = local`, and the Argon2id v1.3 production vector. The worker has no CDN fallback and fails closed if the local provider cannot be loaded or verified.



### Phase 7C — Cross-context messaging boundary

Studio exposes no privileged message channel from the repository preview to the trusted application. The preview wrapper is opened with a severed opener, and `preview-security.js` contains no `message` receiver. The only production-window message receiver is the map workspace channel in `map.js`; it accepts only the fixed `studio.map` v1 `close` schema, requires the exact currently tracked popup `WindowProxy` as `event.source`, and requires the expected HTTPS popup origin before changing Studio mode or closing the map workspace. Malformed, replayed, wrong-origin, origin-less, and preview-style messages are ignored. The Argon2 worker message boundary remains request-bound: session-vault accepts only the active request ID, a successful `ok` flag, and an `ArrayBuffer` key, while `argon2-worker.js` accepts only requests matching the fixed production KDF policy. No `BroadcastChannel`, `MessageChannel`, storage-event, SharedWorker, or ServiceWorker communication channel exists in production Studio code. Runtime coverage in `tests/message-channel-security.py` exercises the real Chromium message event path and the real Worker boundary; `tests/message-channel-security.mjs` scans the complete production JavaScript tree for message-channel receivers and unrestricted dispatch patterns.

### Phase 7B — Repository content injection boundary

Repository-controlled filenames, paths, descriptions, commit messages, file contents, and other metadata do not enter the trusted Studio document as HTML. The common `print()` sink in `main.js` assigns values through `textContent`, while Editor and GitHub repository UI paths use that sink rather than `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, or `DOMParser`. The HTML preview path intentionally keeps raw repository markup inside the already-isolated sandboxed preview document; text previews HTML-escape repository filenames and content before wrapper generation. Runtime coverage in `tests/dom-injection-security.py` exercises hostile HTML/attribute/protocol payloads in the trusted output path and verifies they remain text, while legitimate text preview rendering remains functional. `tests/dom-injection-audit.mjs` performs a complete application-source sink audit for the high-risk HTML parsing/injection APIs.

## Security hardening

GitHub credentials are stored only inside the encrypted Studio session envelope while locked. The vault exposes `unlockAndValidateStoredSession(validate)` for operational stored-session unlock and rejects a missing validator. Decryption remains temporary until the GitHub path performs `GET /user` validation and matches both the immutable numeric GitHub user ID and the stored login name; only then is the session and key committed to operational memory.

GitHub API requests are routed through the centralized network security gateway. An HTTP 401 response from an operational GitHub request immediately locks the session and clears in-memory authorization/navigation state. This is unlock-time validation plus failure-triggered invalidation, not continuous background token validation.

Repository previews are rendered inside `sandbox="allow-scripts"` iframes without `allow-same-origin`, `allow-forms`, `allow-popups`, `allow-downloads`, or top-navigation permissions. Editor and GitHub share this boundary through `preview-security.js`. The child CSP is installed before repository-controlled content can execute and blocks network connections, external executable resources, frames, workers, and objects while preserving inline HTML/CSS/JavaScript and local `data:`/`blob:` resources.

Run `permissions` inside the GitHub workspace to perform safe read-only capability probes and display the fine-grained permission profile required by Studio. Runtime probes are GET-only and report the repository role plus GitHub `X-Accepted-GitHub-Permissions` metadata when available. Write requirements are documented rather than proven by mutation: repository contents writes use `Contents: write`; workflow files require `Contents: write` plus `Workflows: write`; issue writes use `Issues: write`, while shared issue/Pull Request comment operations may use `Issues: write` or `Pull requests: write`; repository administration/update uses `Administration: write`; repository creation for Studio uses `POST /user/repos` and accepts `Administration: write OR Repository creation: write`. General GitHub endpoints may document additional permission alternatives separately; those are not part of Studio’s capability matrix. The command never performs write operations merely to test a token.

### Phase 7D — Full adversarial Editor/Preview validation

Phase 7D integrates the previously approved preview-isolation, repository-content injection, cross-context messaging, session-boundary, GitHub permission, and local-Argon2 controls into one adversarial validation layer. The production JavaScript tree is statically audited and the hostile repository test executes the real `preview-security.js` builder and sandboxed child in Chromium.

The integrated hostile preview attempts to reach Studio DOM/state, storage/cookies/session sentinels, privileged message receivers, external network APIs and resources, workers, popups, forms, downloads, navigation, custom protocols, `javascript:` URLs, `<base>`, and meta refresh. The test also verifies that legitimate inline HTML/CSS/JavaScript and local data/blob resources continue to function.

Runtime result: PASS in real Chromium. Contained preview self-navigation remains possible as an intentionally accepted boundary: it can replace the preview child document, but the sandbox prevents top-level Studio navigation, opener access, Studio-origin privileges, and other auxiliary browsing-context escape.
