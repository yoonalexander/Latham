# Architecture

Status: design summary; runtime wiring is not implemented.
The [technical design](../Latham_Design_Document.md) owns detailed contracts;
the [roadmap](../roadmap.md) owns delivery order.

## Process and package ownership

| Boundary | Owner | First relevant milestone |
|---|---|---|
| Application lifecycle, orchestration and provider calls | Desktop main process | Phase 0 foundation |
| Narrow typed renderer bridge | Desktop preload | Phase 0 |
| Status, controls and settings | Desktop renderer | Phase 0 |
| Browser permissions and native messaging | Extension background | Phase 1 |
| Scoped DOM observations/actions | Extension content scripts | Phase 2 |
| Launch/focus relay when needed | Windows helper | Phase 1 |
| General native UIA and targeted native input | Windows helper | Phase 3 |
| Shared types and validation | contracts | Phase 0 |
| Session state, policy, routing and cancellation | core | Phase 0 |
| Transcription/VAD adapters | speech | Phase 1 |
| Deterministic and cloud/local target selection | decisions | Phases 1–2 |
| Snapshot identity, minimization and redaction | observations | Phases 0–2 |
| Execution and effect-specific verification | actions | Phases 0–2 |
| Optional bounded multi-step planning | planner | Phase 7 |

## Intended action path

A final utterance or typed command becomes a typed proposal. The local controller
checks session, scope, effect profile and target context before authorizing an
executor call. The executor checks identity/epochs and cancellation immediately
before mutation, then reports verified, failed, blocked, cancelled or unknown
effects honestly. Scope is also checked before observation.

Provider outputs and webpage content never create grants or authority.
The renderer, page scripts and models never receive unrestricted OS execution.

## Scope of this scaffold

Workspace manifests, empty source entry points and documentation exist.
There is no action pipeline, IPC bridge, UI, provider adapter or cancellation
implementation. Do not enable reference or experimental code to fill these gaps.
