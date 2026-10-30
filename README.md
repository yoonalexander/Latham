# Latham

Latham is an independently implemented voice-controlled computer assistant.
The repository currently contains the workspace and documentation scaffold.
The desktop app, voice providers, permissions, automation, and test harness
are not implemented yet.

The first release targets Chrome on Windows with a few supported websites,
remembered site approval, and user-supplied cloud keys or validated local AI.
Desktop applications are the next major capability milestone.

## Getting started

Use Node.js 22 or later and npm. From the repository root:

```powershell
npm ci
npm run check
```

`check` currently runs the shared TypeScript check. It does not launch an app
or test automation behavior. Electron, React, Vitest, Playwright, and provider
SDKs will be added when their implementation begins; none is installed by
this scaffold. The Windows helper is reserved and has no .NET project yet.

There is no `start` or production build command at this stage. Source entry
points export empty modules so workspace checks can run without pretending
that later features exist.

## Repository layout

```text
apps/
  desktop/
    src/main/                Electron main process
    src/preload/             Narrow renderer bridge
    src/renderer/            React renderer
  chrome-extension/
    src/background/          Extension service worker
    src/content/             Scoped page observation and actions
services/
  windows-helper/            Narrow host first; native UIA in Phase 3
packages/
  contracts/                 Shared types and boundary validation
  core/                      Session routing, policy and cancellation
  speech/                    Cloud/local transcription and VAD adapters
  decisions/                 Deterministic and cloud/local target selection
  planner/                   Deferred bounded workflows
  observations/              Snapshot identity, scope and redaction
  actions/                   Validated execution and verification
tests/
  fixtures/                  Controlled browser fixtures; native app later
  e2e/                       Future end-to-end evaluation
  security/                  Future permission and adversarial regressions
docs/
  architecture.md
  decisions.md
  threat-model.md
  evaluation.md
  dependencies.md
.env.example
roadmap.md
```

## Project documents

- [Technical design](Latham_Design_Document.md): implementation contracts and scope.
- [Full roadmap](roadmap.md): milestone order and acceptance gates.
- [Architecture](docs/architecture.md): module boundaries and process ownership.
- [Decision index](docs/decisions.md): links to settled choices and open decisions.
- [Threat model preparation](docs/threat-model.md): planned boundaries and unresolved validation.
- [Evaluation](docs/evaluation.md): what will establish acceptance.
- [Dependency provenance](docs/dependencies.md): direct dependency choices.
- [Historical design review](Latham_Design_Review.md): review of version 1.0.

## Configuration and credentials

`.env.example` lists planned non-secret configuration names only. Configuration
loading is not implemented. Never put real API keys in tracked files, renderer
code, or extension storage. Provider credential onboarding and the OS-backed
secret store remain future work.

## Independent implementation and distribution

Reference applications inform general concepts. They are not forks or imported
implementations of Latham. See design section 1.2 for the reference policy.
All npm workspaces are private to prevent accidental package publication.
The project's distribution license and contribution terms have not been
selected; no reference application's license is adopted as Latham's license.

Creating this scaffold does not complete Phase 0. The next work is the smallest
fixture-based vertical slice described in the roadmap.
