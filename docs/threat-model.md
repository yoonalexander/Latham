# Implemented trust boundaries

Status: implementation-backed boundary notes and regression coverage, not a
complete independent security audit.

## Phase 7 workflow boundaries

- A strict structured goal compiles locally to search, optional filter and optional
  result opening. No model, page instruction, arbitrary tool list, selector or
  script can extend the plan. Literal query text never becomes action grammar.
  Goal/site/filter/result combinations are validated before execution.
- Preparation checks the selected origin/path before injecting/reading labels,
  establishes a current tab/window/document/session lease and displays the plan.
  A main-owned, expiring, single-use Run ID starts only that plan. Both main and
  worker cap action attempts, requests and elapsed time; the worker also requires
  an explicit start before accepting a tool. No persisted plan can resume.
- Each observation/action checks the lease, consent, epochs, Chrome document ID,
  isolated token and URL. Opens require a current result receipt and reviewed
  same-site read URL. Root replacement, unexpected navigation, trusted input or
  scrolling, iframe focus, tab/window changes and revoked access invalidate work.
  New-document pre-injection events are not a certified interaction history;
  fresh URL/identity/control evidence remains mandatory.
- Stop, timeout, hidden/crashed renderer, connection loss and user intervention
  discard late replies and remaining steps. Unknown effects retain the existing
  durable reconciliation marker; no navigation is blindly replayed. Partial
  completion keeps earlier verified steps distinct from a failed current step.
  Manual, visual, dictation and hands-free execution cannot race a live plan.
- Only a completed goal can be explicitly saved. Shortcuts contain validated
  goal/name/ID only, use DPAPI and have no plaintext fallback. Corrupt stores lock
  without overwrite; deletion cancels active authority. Startup/loading/editing
  cannot run a shortcut. Names/queries persist only by explicit save, not logs.
- No consequential integration was selected for enablement. A workflow Run ID
  cannot approve sending, uploads/applications, account changes, purchases,
  destructive actions, grants or scheduled unattended work. The separate review
  requirements and disabled candidates are recorded in [Phase 7](phase7.md).

The compiled catalog still limits possible read effects; it does not sandbox a
remote website or authenticate its internals. This is bounded preview support,
not general adversarial-site assurance. See [evaluation](evaluation.md).

## Phase 6 additions

Eight exact optional origins replace the two-entry catalog; grants still
intersect remembered Latham consent and an explicit active session. One compiled
catalog owns reviewed read routes/query recipes and result shapes in both the
desktop and worker. Providers cannot extend it. New fields advertise focus
only, never edit or submit authority. Search/filter requests navigate reviewed
read URLs without executing page click/input handlers. Unknown/autosave and
consequential controls remain excluded.

Open-root discovery, labels and results are bounded. Visible-only collection
does not infer virtual rows. A recycled node's changed label/href, replacement,
occlusion or changed scope invalidates its receipt. Explicit frame inspection
reads minimal supported-control counts only from visible same-origin reviewed
documents. Child values/arbitrary text are omitted; frame opening rechecks node,
child Document and URL, then uses top-level reviewed navigation. Cross-origin,
hidden, srcdoc, sandbox-inaccessible, nested and auth documents remain excluded.
Default observation remains root-only. No broad host grant or fallback exists.

URL verification checks duplicate query values and fragments, known fixed
normalizations, loaded state, stability and reviewed page evidence. Transient
observations may repeat; navigation itself does not. Challenges, missing evidence
and unknown outcomes cannot authorize retries. Revoking a live grant can prevent
fence acknowledgement until reload; the session remains paused. Edge's separate
fixture experiment does not grant public browser compatibility. See
[coverage limits](phase6.md) and [evaluation](evaluation.md).

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

The fixture executor is trusted local code. Phase 2 adds the separate Chrome
document/control bindings and compiled supported-site profiles described below.
These profiles do not establish that arbitrary website effects can be inferred
safely.
Broader UIA coverage, screenshots, voice spoofing and managed service boundaries require their
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
This is implementation review, not an independent security audit. Phase 2
supersedes the original temporary-file ASR path with bounded stdin/stdout.
Installer signing, automatic model integrity management and production
extension identity remain release work. See [Phase 2 setup](phase2.md).

## Phase 2 Chrome boundaries

- Exact Google/YouTube origin and path profiles are compiled locally. Injection
  happens only during explicit active requests into the root document's
  isolated world. No general content observer or arbitrary selector/script IPC
  is exposed. Secure, hidden, framed and unreviewed controls are excluded.
- Snapshots capture Chrome document ID, tab/window, isolated document token,
  element reference/revision, URL and connection/permission epoch. Dispatch
  rechecks all scope. Retired connections and replaced nodes cannot authorize
  later actions. A matching label alone never grants an effect.
- Read-query navigation is built from reviewed URLs rather than calling unknown
  handlers. YouTube links are restricted to ordinary same-origin video results.
  Consequential controls and unsupported routes remain blocked. Page text and
  provider output can choose only among bounded already-permitted candidates.
- Dictation captures its field binding before recording. Changing the actual
  field, editing it, losing grants or changing documents suspends that binding.
  Moving between Chrome and Latham's recording window preserves the same field.
  Append/replace/correction/undo require expected values and edit history;
  verification repeats after 100 ms to catch reactive overwrites.
- A durable uncertainty marker is written before mutation dispatch. Missing
  acknowledgement, failed readback and crashes require explicit inspection and
  an acknowledged fence before resume. Stop fences previously observed scopes,
  including across worker restarts; no uncertain mutation is replayed.
- The packaged app hides development env import and requires desktop/extension
  the matching desktop/extension version plus protocol 2. The local portable package was smoke tested, but both
  executable binaries are unsigned. Checksums do not authenticate a publisher.

Evidence includes stale nodes, duplicate clarification, late provider responses,
user edits/focus, denied controls/frames, persisted unknown effects and reactive
overwrites, plus real signed-out website workflows. External sites can change;
this is narrow preview support, not adversarial-page or general-site assurance.

## Phase 3 native boundaries

- App approval and a block override are stored separately from Chrome grants.
  Notepad is the only production native profile. Exact protected executable
  locations, window class, same-user/session token and non-elevated integrity
  are checked before any UIA traversal. All other apps are denied by default.
- The renderer submits named commands and opaque controller-owned window IDs,
  never native handles, arbitrary paths, selectors, keys or window messages.
  Window titles are local transient choice labels, not model inputs or logs.
- A separate non-window-owning MTA process performs bounded UIA traversal and
  editing. The supervisor never makes provider calls and can signal/terminate
  a stalled worker. A current-user ACL protects the cancellation event.
- Process start time, window/control handles, UIA runtime identity, document
  title, GUI-thread focus, edit notifications and expected value bind each edit.
  Secure/read-only/off-screen/unknown fields are excluded. Only the reviewed
  Notepad editor value or its exact RichEdit control can receive text; no
  keyboard, clipboard or denied-browser fallback exists.
- Before dispatch, durable uncertainty is written. Stop, crash, lost response
  or reactive readback failure cannot silently clear it. Reconciliation requires
  explicit inspection and confirmed worker exit; restart does not replay edits.
  Switching adapters waits for prior fences and blocks unresolved mutations.
- Field text and undo records live only in the worker, with no default persistent
  native activity log. App Stop does not undo target-app autosave or a call
  already issued. Same-user malware/replaced trusted binaries and independently
  hostile accessibility providers are not certified safe by these tests.

Evidence includes native user edits, removed controls, wrong fields/windows,
secure/read-only controls, reactive overwrites, stalled calls, killed workers,
restart uncertainty, shared transcript binding and repeated exact effects.
Movement and scaled fixture layout were tested on one physical monitor; broad
mixed-DPI and multi-monitor hardware support is not established. See [setup](phase3.md).

## Phase 4 speech authority and failure boundaries

- Hands-free is an explicit per-session automatic-command authorization, scoped
  to an existing Chrome or native session. It cannot grant permissions, reconcile
  uncertain effects or bypass ordinary action policy. It starts off after every
  launch and cannot restart itself after failure.
- Wake/stop are independent local fixed-grammar processes without a microphone,
  network or action interface. Wake waiting never reaches command ASR, including
  cloud ASR. Only subsequent active utterances use the saved provider route.
- A main-owned ID, frame sequence, single in-flight command and cancellation
  generations prevent missing frames, queued speech or late finals from silently
  resuming a stopped session. Mic, audio-context, detector, heartbeat and backlog
  failures end capture and cancel adapters; physical Stop does not rely on them.
- Neither ASR nor VAD authenticates the speaker. Background voices and digital
  replay can trigger or suppress recognition. Near-homophones can falsely stop;
  overlapping speech can hide a real stop. No high-consequence actions or
  speech-only permission approvals are introduced. Assistant TTS stays absent.
- Detector and capture buffers are bounded and transient. Default diagnostics
  contain no audio, transcripts, window titles or vocabulary. Local model paths
  and vocabulary are user settings, not cloud selection inputs or action code.
- Speech recognition delay is independent of the executor cancellation fence.
  Stop cannot roll back already-issued effects. Published synthetic results do
  not establish physical room/speaker-loopback or broad speech reliability.

See [Phase 4 setup](phase4.md) and [evaluation](evaluation.md).

## Phase 5 visual boundaries

- Capture consent is a non-persisted main-process permission. It intersects an
  active approved YouTube document and the separate optional i.ytimg.com grant.
  An absent/denied browser adapter never enables native screenshot fallback.
- The adapter captures source assets, not composited browser/desktop pixels.
  Only bounded public JPEG URLs matching reviewed video IDs can be fetched, with
  credentials omitted and redirects denied. Unknown source/target/visibility
  proof blocks; iframe, field, overlay and other-app pixels never enter the
  canvas. No post-capture redaction is relied on.
- Decode dimensions, network bytes, normalized JPEG size, candidate count,
  relay frames, OCR output and provider output are bounded. Images and OCR remain
  transient; default diagnostics/persistence contain neither. Permission loss,
  Stop and generation changes discard late results and pending previews.
- OCR and model content are untrusted. Providers return candidate-ID sets only;
  invented/duplicate IDs, coordinates and extra action fields are rejected.
  Ambiguity asks the user to choose. A proposal cannot navigate by itself.
- Opening rechecks document/epoch/target/source/layout/occlusion and the existing
  reviewed video-navigation effect. There is no generic coordinate click, form
  submission or arbitrary-image action. In-flight navigation retains the same
  uncertainty/no-replay contract as other Chrome effects.
- Source assets may differ from the site's composed appearance or change at a
  stable URL; users review the exact captured preview. General adversarial-site,
  photo/person and real local vision-model accuracy are not certified. Tests
  distinguish controlled cloud/OCR results and unavailable-provider failures.

See [Phase 5 setup](phase5.md) and [evaluation](evaluation.md).
