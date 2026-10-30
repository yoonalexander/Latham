# Latham

Latham is an independently implemented voice-controlled computer assistant.
**Phase 0 is implemented:** an Electron/React desktop shell executes typed
commands against a bundled, sandboxed test page with local authorization,
verification, cancellation, settings, a tray, and metadata-only diagnostics.

This is a development foundation, not the Chrome MVP. Microphone capture,
AI providers, the working Chrome extension, and native-app automation are
not connected. The complete project plan is in [roadmap.md](roadmap.md).

## Run the foundation

Tested on Windows with Node.js 22.13.0 and npm 10.9.2. Use a compatible Node 22+
release, then run from the repository root:

```powershell
npm ci
npm run setup:electron
npm run dev
```

The Electron setup command downloads the pinned development runtime from its
official release distribution if it is not already installed. No provider key,
model download, browser extension, or .NET SDK is needed for Phase 0.

The app starts **Paused**. Enable **Allow local fixture**, click **Start session**,
and run a command:

```text
type Hello Latham
search orchestral music
filter on
click Apply filter
click second Apply filter
click Continue
write Password: synthetic
```

The two Apply filter controls require an explicit choice. Continue has an unknown
effect, the application button/autosave field are consequential, and password
fields are secure: the controller blocks them. Real website access is not
enabled by the fixture consent checkbox.

**Stop** is always visible. Ctrl+Alt+. and the tray's Pause / Stop invoke the same
local cancellation fence. Closing the window hides it to the tray; choose
**Quit Latham** from the tray to exit. If the shortcut cannot register, the UI
reports that and retains the Stop button/tray control.

Use **Test dispatch delay** to stop work before dispatch or replace the fixture
document while a command is waiting. A dispatched action with an uncertain
result is labelled **Unverified** and is not retried. Use **Reset fixture** to
establish a fresh local document before starting again.

## Checks and evaluation

```powershell
npm run check
npm run evaluate
```

- `check`: TypeScript, 26 policy/contract/storage tests, and the desktop build.
- `evaluate`: those checks plus 4 actual Electron acceptance flows.
- `test:e2e`: builds, prepares Electron, and runs the Electron flows only.
- `start`: runs the last build; `dev` rebuilds before starting.

Tests use isolated directories under ignored `.test-artifacts/`. The Electron
runner writes a JSON report and synthetic fixture screenshots there; failed
runs retain traces. These explicit test artifacts are separate from the app's
default retention policy. See [evaluation evidence](docs/evaluation.md).

## Layout

| Directory | Responsibility |
|---|---|
| apps/desktop | Electron main, narrow preload bridge, React shell |
| apps/chrome-extension | Inactive MV3 scaffold; Phase 1 pairing and Phase 2 browser integration |
| services/windows-helper | Reserved; narrow host when needed, native UIA in Phase 3 |
| packages/contracts | Shared types and runtime boundary validation |
| packages/core | Session, policy orchestration, queue and cancellation |
| packages/decisions | Phase 0 deterministic commands; future cloud/local selection |
| packages/observations | Scoped fixture snapshots, identity and redaction |
| packages/actions | Local fixture profiles and effect-specific verification |
| packages/speech, packages/planner | Deferred speech/provider and workflow adapters |
| tests | Controlled pages, policy/security cases, Electron acceptance |
| docs | Architecture, decisions, threat boundaries, evidence and dependencies |
| scripts | Deterministic build and development startup |

All npm workspaces are private to prevent accidental npm publication.
The distribution license and contribution terms remain a separate review point.

## Data and scope

Settings persist fixture consent, the test delay, and the diagnostic preference
in Electron's user-data directory. Each launch still starts paused. The pages
use an in-memory browser session. Audio, screenshots, credentials and user
command/page contents are not written by the app's diagnostic logger.

Diagnostic persistence is off by default. Opting in saves only a bounded,
50-event set of codes, dispatch states, timestamps and durations in
`diagnostics.jsonl`. Inspect the current metadata trail in the app and use
**Clear diagnostics** to erase it. No raw exception messages enter that trail.

`.env.example` names future non-secret provider configuration only; loading it
and credential onboarding are Phase 1 work. Never put API keys in tracked files,
renderer code, or extension storage.

## Documents

- [Technical design](Latham_Design_Document.md)
- [Whole-project roadmap](roadmap.md)
- [Implemented architecture](docs/architecture.md)
- [Decision index](docs/decisions.md)
- [Threat boundaries and remaining scope](docs/threat-model.md)
- [Evaluation and evidence](docs/evaluation.md)
- [Dependency provenance](docs/dependencies.md)
- [Historical v1.0 design review](Latham_Design_Review.md)

Reference applications inform general concepts. Latham's Phase 0 code, fixture
pages, UI and icon were independently implemented; no reference repository was
forked or imported.
