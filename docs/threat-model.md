# Implemented trust boundaries

Status: implementation-backed boundary notes and regression coverage, not a
complete independent security audit.

## Assets and entry points

Typed commands and allowed field values are transient. Stored settings contain
fixture consent, the diagnostic preference and a bounded test delay. Optional
diagnostics contain codes, dispatch states, sequence/timestamps and durations.
The Phase 0 fixture path has no provider or desktop control authority. Phase 1
adds the separate assets and boundaries below.

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
Phase 2 adds real Chrome DOM/frame binding and supported-site effect profiles
to the Phase 1 setup boundary.
UIA, screenshots, voice spoofing and managed service boundaries require their
own later evidence. UAC/secure desktop and arbitrary shell execution remain
excluded.

See [evaluation](evaluation.md) and [design section 8](../Latham_Design_Document.md)
for scope and future acceptance obligations.

## Phase 1 boundaries

- Keys are main-process-only DPAPI ciphertext at rest. The renderer accepts a
  user-entered key once but cannot read it back. Import reads only the selected
  development env variable; diagnostics and extension messages contain no key.
- Main owns speech turn generations, duration/payload limits, abort/deadline
  signals and final-once acceptance. Stop discards late responses. The renderer
  gets only a preview; a transcript never executes itself. Audio-only microphone
  grants are restricted to the main application frame during explicit capture.
- Cloud mode discloses Google as the audio/context destination. Local mode uses
  only a selected whisper executable/model and loopback Ollama; remote model
  metadata, redirects, oversized output and non-candidate IDs are rejected.
  A malicious same-user executable/server is outside this attestation boundary.
- The extension has no content script or broad host/tabs permission. Exact
  optional host grants intersect Latham consent. Browser removal, Latham revoke
  and reconnect reconciliation fail closed; grants do not start a session.
- Native messaging checks the stable extension origin, per-process random pipe
  and session token. Frames are capped at 64 KiB. A current-user ACL protects
  config. The relay cannot invoke arbitrary commands or UIA.
- Stop fences are acknowledged by epoch. Unknown browser effects require
  explicit inspection before resume; no mutation is replayed after reconnect.

Regression evidence covers local-only request destinations, invalid/refused
model output, bounded audio/responses/frames, bad pairing tokens, revoked scope,
late/duplicate finals, missing acknowledgements and physical cancellation.
This is implementation review, not an independent security audit. Local ASR
temporarily writes WAV data and crash leftovers remain a documented development
limitation. Installer signing, model integrity management and production
extension identity remain release work. See [Phase 1 setup](phase1.md).
