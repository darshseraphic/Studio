


```

```
              ┌──────────────────────────────────────────┐
              │          main.js (Core Shell)            │
              │  - Global Keyboard / Event Orchestration  │
              │  - IO Management (Secure Print Routine)  │
              │  - Session Backup Routing Framework     │
              └────────────────────┬─────────────────────┘
                                   │
     ┌─────────────────────────────┼─────────────────────────────┐
     ▼                             ▼                             ▼

```

┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
│   html.js IDE   │           │    github.js    │           │   weather.js    │
│ Secure Sandbox  │           │ Cloud Sync Port │           │ Meteorological  │
└─────────────────┘           └─────────────────┘           └─────────────────┘
▼                             ▼                             ▼
┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
│  calculator.js  │           │     note.js     │           │   Future Tools  │
│Custom Ast-Parser│           │ Scratchpad Memo │           │   (Extensible)  │
└─────────────────┘           └─────────────────┘           └─────────────────┘

```

### Core Execution Modules

1. **`main.js` (The Microkernel & Router):**
   * Acts as the central system router, initializing terminal hooks, monitoring global hotkeys, and enforcing input safety profiles.
   * Maintains the centralized tool `registry`, directing incoming keyboard input signals to either the global standard shell or hot-swapping control directly over to an active module runtime.
   * Houses the central `print()` architecture, which enforces absolute protection against Cross-Site Scripting (XSS) by using strict `textContent` DOM node creation.

2. **`html.js` (Isolated Compilation Layer):**
   * Implements a secure line-by-line code buffer storage system.
   * Employs dual-layer sanitization: dynamically base64-scrambles user inputs (`btoa`) before mapping them inside an `<iframe>` explicitly stripped of `allow-same-origin` privileges. This isolates the runtime context from accessing application `localStorage`.
   * Embeds a Content Security Policy (CSP) restriction (`default-src 'self'; script-src 'none';`) to permanently deaden script injection or unverified external context loading inside the sandbox window.

3. **`github.js` (State Persistence & API Sync Broker):**
   * Acts as the persistence layer bridge via the GitHub REST API.
   * Manages remote verification, token cache verification against the `/user` endpoint, and automated provisioning of private repository trees (`/user/repos`) if the requested session folder does not exist.
   * Orchestrates multi-file upstream synchronizations utilizing Base64-encoded streaming via `PUT` operations against target blob endpoints.

4. **`calculator.js` (Abstract Expression Parser):**
   * Features a built-in mathematical lexer and token processing routine designed to completely eliminate security hazards associated with native execution utilities like `eval()`.
   * Evaluates expressions by compiling sequential numeric tokens through an intermediate operation array stack, managing boundary thresholds, division-by-zero exceptions, and formatting multi-digit values using engineering scientific notation.

5. **`weather.js` (Meteorological Transformer):**
   * Uses asymmetric downstream API chaining (Geocoding Endpoint $\\rightarrow$ Hourly Forecast Engine) to collect geographical data.
   * Maps weather parameters to descriptive multi-line ASCII terminal art structures which are cleanly rendered onto the output layout matrix.

6. **`note.js` (Dynamic Workspace Buffer):**
   * Serves as an ephemeral high-speed input logging platform, syncing string entries into persistent storage arrays on every input trigger.

---

## 2. Advanced User Operations Guide

To leverage Studio with peak efficiency, understand its hidden interface mechanics, control combinations, and operational workflow patterns.

### Key Operational Frameworks

| Hotkey / Command | Scope | Operational Action |
| :--- | :--- | :--- |
| `CTRL + E` | **Global Override** | Immediately interrupts the current active tool mode, triggers its explicit termination cleanup routines (`onExit`), clears terminal states, and forces a safe return to the primary `main` console prompt. |
| `save` | **Context-Aware** | In sub-modules, pushes the currently isolated session trace upstream to GitHub (if active) or directly streams it to the system download directory as a local format file (`.txt`, `.csv`, `.html`). |
| `end` | **Global Admin** | Clears the entire terminal's historical log trail, sweeps volatile system memory caches, and strips tracked session arrays completely clean. |
| `end/[tool-name]` | **Targeted Purge** | Vaporizes state buffers for an individual module (e.g., `end/weather`), leaving other tool traces alive. |

### Maximizing Efficiency Across Modules

#### A. Master the HTML Interactive Workspace (`html`)
* **Line Navigation & Corrections:** If you make a mistake, do not retype everything. Enter `undo` to erase your last written code row. Need to clean your canvas? Execute `clean` to clear the terminal mirror alongside your underlying code arrays.
* **Rapid Code Importation:** You can paste massive external code blocks directly into the terminal while in `html` mode. The system automatically traps the clipboard transaction, splits it by line delimiters, and processes it line-by-line.
* **Exporting Work Safely:** Run `copy` to instantly copy your written code buffer from line 1 straight into your desktop clipboard.

#### B. Streamlined Cloud Backups (`github`)
To avoid repetitive manual downloads, configure your workspace automatically at startup:
1. Generate a **Personal Access Token (classic)** via GitHub developer settings with explicit `repo` scope permissions.
2. Enter `github` mode and log in: `login/YOUR_TOKEN_HERE`.
3. Link your target repository: `repo/my-studio-vault`. If the repository does not exist, Studio will automatically create a private repository with that name for you.
4. Now, typing `save` inside any workspace tool automatically updates your cloud backup seamlessly.

#### C. Smart Command Chaining
From the main menu, you can bypass entry intros by executing direct routing shortcuts. For instance, typing `weather/Paris` straight from the main prompt instantly starts `weather` mode, executes the search query, outputs the ASCII visual block, and registers the session telemetry in a single action.

---

## 3. Storage Architecture Mapping

Studio values extreme efficiency and zero external network overhead for state persistence. It manages session cache persistence using a highly structured `localStorage` taxonomy:

* `github_username` $\rightarrow$ Retains authenticated user account handle for console customization.
* `user` $\rightarrow$ Securely caches raw authentication token metadata.
* `repository` $\rightarrow$ Explicitly logs active cloud sync path.
* `note` $\rightarrow$ Stringified array tracking text-editor lines.
* `calculator` $\rightarrow$ Persists evaluation history entries.
* `weather` $\rightarrow$ Standardized CSV matrix arrays capturing historical metrics (`title,date_time,temp,humidity,precip,wind`).

---

## 4. Extension Architecture (Adding New Features)

Studio is designed to grow. You can easily add your own customized developer utilities by registering a new module interface string within `main.js`. 

Every extension must conform to the following standard module lifecycle interface pattern:

```javascript
import { registerTool, print } from './main.js';

const customTool = {
    helpText: "Brief functional overview displayed inside the system menu",
    prompt: "custom>", // The string rendered to designate the input area
    onEnter: () => {
        // Initialization routines (e.g., cache clearance or system messaging)
        print("System: Custom terminal service loaded successfully.");
    },
    handleInput: (input) => {
        // Main input parsing and process router logic goes here
        if (input.trim() === 'action') {
            print("Result executed.");
        }
    },
    onExit: () => {
        // Connection drops, notification hooks, or exit cleanup operations
        print("System: Deactivating custom terminal environment.");
    },
    getLines: () => {
        // Standard data extraction formatting logic used by the save manager
        return "Formatted exportable log data asset string";
    },
    clearBuffer: () => {
        // State destruction routine managed by system purge commands
    }
};

// Bind directly to the core application kernel engine
registerTool('custom', customTool);
