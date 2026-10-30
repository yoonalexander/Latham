# Phase 0 trust boundaries

Status: implementation-backed boundary notes and regression coverage, not a
complete independent security audit.

## Assets and entry points

Typed commands and allowed field values are transient. Stored settings contain
fixture consent, the diagnostic preference and a bounded test delay. Optional
diagnostics contain codes, dispatch states, sequence/timestamps and durations.
No audio, provider credentials, real account sessions or desktop control is
available in this phase.

The entry points are the named preload operations in
`apps/desktop/src/preload/index.ts`, guarded IPC in the main process, and
the fixture's root-document observation/dispatch transport.

## Boundaries and evidence

| Threat | Implemented boundary | Evidence |
|---|---|---|
| Renderer invokes arbitrary native/IPC actions | Narrow contextBridge API; top-frame sender and payload validation | Parser tests; Electron isolation/bridge behavior |
| No consent or a paused session still observes/acts | Controller gates before observation; active session separate from UI status | Denied-read and paused-session regression |
| Page text or labels grant authority | Deterministic routing and compiled fixture effect profiles | Unknown-command, renamed control, unknown/consequential tests |
| Password/hidden/denied-frame contents leak | Secure values and hidden controls omitted; root-only read; no raw values in renderer summary | Unit redaction and actual fixture/iframe assertions |
| Captured target is replaced or changed | Document/node/revision recheck at final dispatch | Stale receipt and real document-replacement tests |
| Stop or revoke leaves work queued | Generation fence and per-turn abort; serialized path | Delayed/queued cancellation, revocation and reset tests |
| Lost response causes duplicate mutation | Unknown effect remains unverified, blocks continuation, requires reset | Unit deadlines/unknown-dispatch and real lost-response flow |
| Last success label yields false verification | A new expected fixture result is required for each click | Prior-success-marker regression |
| Diagnostics record private activity | Typed metadata-only sink, off by default, bounded to 50 events; clear control | Storage and actual app diagnostic inspection |
| Bundled page opens a privileged/external surface | Sandboxed no-preload fixture, in-memory session, fixed resource map, denied requests/popups | Electron boundary and external-fetch tests |

## Limits and next review

The concrete executor is trusted local fixture code. These profiles and tests
do not establish that arbitrary website effects can be inferred safely.
Phase 1 needs a separate review of provider/secret routing, local runtime
endpoints and extension pairing. Phase 2 adds real Chrome origin/frame grants,
permissions persistence/revocation and supported-site effect profiles.
UIA, screenshots, voice spoofing and managed service boundaries require their
own later evidence. UAC/secure desktop and arbitrary shell execution remain
excluded.

See [evaluation](evaluation.md) and [design section 8](../Latham_Design_Document.md)
for scope and future acceptance obligations.
