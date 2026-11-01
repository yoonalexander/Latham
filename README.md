# Latham

Latham is an independently implemented voice-controlled computer assistant.
Version 0.7 adds bounded search/filter/result workflows with an expiring review,
per-run budgets, verified progress and explicitly saved encrypted shortcuts.
It supports eight reviewed website origins, shared semantic controls,
open-component results and explicit same-origin frame inspection.
It retains scoped YouTube thumbnail matching, opt-in hands-free commands, field-bound
push-to-talk dictation, guarded correction/undo, verified search/video/filter
navigation, Gemini or local AI, remembered permissions and physical Stop.
See [bounded workflows](docs/phase7.md), [website coverage and restrictions](docs/phase6.md), [visual setup](docs/phase5.md), [hands-free setup](docs/phase4.md), [desktop setup](docs/phase3.md) and [the Chrome support matrix](docs/phase2.md) for exact operations and limits.

Phases 0–7 are implemented as an **unsigned Windows developer preview**. It is not a
signed installer or a promise of arbitrary-app/site support. Hands-free is optional
and starts disabled; recognition misses and false stops remain possible. The whole-project plan is in
[roadmap.md](roadmap.md).

Visual capture is off by default. It copies only approved public thumbnail assets;
it never captures a full screen, frames or form fields. Local OCR/layout or an
explicitly selected local/cloud visual model can propose matches. Opening a
video requires a separate confirmation and fresh DOM checks. The controlled
benchmark does not establish general photo/person matching.

## Run Latham

Tested on Windows with Node.js 22.13.0 and npm 10.9.2. Use a compatible Node 22+
release, then run from the repository root:

```powershell
npm ci
npm run setup:electron
npm run dev
```

The Electron setup command downloads the pinned development runtime from its
official release distribution if it is not already installed. No provider key,
model download or browser extension is needed for the fixture. The narrow
native relay uses Windows' existing .NET Framework compiler, without an SDK.

For Chrome, configure AI, register/load/connect the extension, approve a site,
then choose **Prepare Search dictation**. Hold to talk, review, and explicitly
insert the transcript. The app starts paused; push-to-talk requires explicit dispatch.
For consecutive automatic commands, explicitly enable a session as described in
the hands-free guide. Its microphone turns off when the session ends.

For desktop editing, approve Notepad, refresh and select its window, then choose
**Prepare editor dictation**. The same microphone produces a reviewed transcript;
explicit editor insertion requires the field binding captured before recording.
Manual edits, changed tabs/controls, denied apps and third-window focus suspend it.
Windows can intermittently refuse editor activation; Latham stops and asks you
to select the editor manually. See [validation results](docs/evaluation.md).

The optional **Show fixture tools** panel retains the local regression playground.
Enable **Allow local fixture**, click **Start session**, and run a command:

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
npm run setup:browser
npm run evaluate
```

- `check`: TypeScript, policy/provider/transport tests, and the desktop/host build.
- `evaluate`: those checks plus actual Electron and MV3/native-host flows.
- `test:e2e`: builds, prepares Electron, and runs the integration flows.
- `start`: runs the last build; `dev` rebuilds before starting.
- `package:preview`: prepares local Windows/extension ZIPs and a SHA-256 manifest
  under ignored `.test-artifacts/releases/`; it does not publish a release.
- `node scripts/check-preview.mjs`: checks the prepared executable and bundled
  native host/extension independently of the source checkout. Run it after other
  acceptance apps have closed; current-user native-host registration is shared.

Tests use isolated directories under ignored `.test-artifacts/`. The Electron
runner writes a JSON report and synthetic fixture screenshots there; failed
runs retain traces. These explicit test artifacts are separate from the app's
default retention policy. See [evaluation evidence](docs/evaluation.md).

## Layout

| Directory | Responsibility |
|---|---|
| apps/desktop | Electron main, narrow preload bridge, React shell |
| apps/chrome-extension | MV3 permissions, scoped root DOM agent and reviewed page operations |
| services/windows-helper | Independent Chrome relay plus desktop supervisor/disposable MTA UIA worker |
| packages/contracts | Shared types and runtime boundary validation |
| packages/core | Session, policy orchestration, queue and cancellation |
| packages/decisions | Phase 0 deterministic commands; future cloud/local selection |
| packages/observations | Scoped fixture snapshots, identity and redaction |
| packages/actions | Local fixture profiles and effect-specific verification |
| packages/speech | Gemini audio/selection, whisper.cpp and Ollama adapters |
| packages/planner | Deferred workflow adapter |
| tests | Controlled pages, policy/security cases, Electron acceptance |
| docs | Architecture, decisions, threat boundaries, evidence and dependencies |
| scripts | Deterministic build and development startup |

All npm workspaces are private to prevent accidental npm publication.
The distribution license and contribution terms remain a separate review point.

## Data and scope

Settings persist fixture consent, the test delay, and the diagnostic preference
in Electron's user-data directory. Each launch still starts paused. The pages
use an in-memory browser session. Provider settings and remembered site consent
persist separately; keys use Windows DPAPI. Audio, screenshots, credentials and
user command/page contents are not written by the diagnostic logger. Local ASR
uses stdin/stdout and creates no temporary audio or transcript files.

Diagnostic persistence is off by default. Opting in saves only a bounded,
50-event set of codes, dispatch states, timestamps and durations in
`diagnostics.jsonl`. Inspect the current metadata trail in the app and use
**Clear diagnostics** to erase it. No raw exception messages enter that trail.

`.env.local` is ignored. The development app can explicitly import its
`GEMINI_API_KEY` into the protected store; it does not import it automatically.
Never put API keys in tracked files, renderer code, or extension storage.

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
