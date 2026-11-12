# Implemented trust boundaries

Status: implementation-backed boundary notes and regression coverage, not a
complete independent security audit.

## Universal Windows development route

[Phase 10](universal-desktop.md) has a separate main-owned Computer controller and
disposable Windows worker. First-run terms/permissions acceptance precedes access.
The chosen foreground text/value, image and browser scopes and provider persist
in version-2 computer.json with the agreement version, including an explicit disable.
New installs and older version-1 state require the one-time agreement. Known
denials and uncertainty survive migration. Malformed/future agreement state never
auto-enables access. A speech key or extension grant supplies no agreement.
No microphone, observation or task resumes on restart. No idle capture or
full-desktop fallback is used. UIA/image content is untrusted data and cannot
grant permission or dispatch provider-generated code.

Explicit single-control commands may dispatch without a question only when the
user names one unique accessible control and the action/payload matches exactly;
explicit scrolling and allowlisted navigation keys except Enter also qualify.
The direct grant covers only the first action, not extra model-selected steps.
Other input requires a 30-second one-use task confirmation in the companion.
That approval lasts only for the current bounded run. Coordinate clicks always
require a separate one-use marked-point confirmation. Approval restores
only the selected window through the normal Windows API,
then reobserves; unrelated foreground changes or stale revisions block dispatch.
The worker independently checks HWND/PID/start time, input activity, geometry and
the observation lease. Coordinate clicks additionally require the current image
hash, a hit-tested unoccluded point and exclusion from masked regions. UIA scroll
avoids sending wheel input to another window under the cursor. Held modifiers
and focused password regions block key input.

Detected password/terminal regions are omitted and masked with physical UIA
bounds mapped into the target's PrintWindow rendering DPI. A synthetic pixel
regression covers an unaware app at the current scaled display. Custom painted
secrets, misleading accessibility providers and hidden control effects cannot be
reliably classified; masking is not a guarantee for arbitrary apps. Known elevated,
secure, shell and security-tool processes are excluded, including recognized
original executable identities. Unknown custom embedded terminals remain a limit.

Notepad denial propagates from its existing adapter to observation, restoration,
and execution. Direct and planner-selected launches enforce the same app
blocks before dispatch. The native worker checks blocked executable names with
or without `.exe` and recognizes Calculator aliases through the system frame
host's app identity. Site revocation records a
separate durable universal-browser block: any such block excludes every browser
window until explicitly cleared, because UIA cannot establish embedded origin
exclusions. Broader consent never automatically retries an extension denial.

The model receives only bounded permitted window text, optional PNG, the goal
and in-memory action history, not OS handles or credentials. Native input
completion/readback and the model's fresh effect check are distinct. Model
verification is fallible; identified consequential
effects remain excluded. No general send/delete/payment/security integration is
authorized. A misleading label can conceal an effect, so this is not a formal
guarantee that arbitrary reviewed controls are low consequence.

Stop aborts model work, rejects approval and kills the bounded worker. Timeouts,
worker loss or ambiguous dispatched input persist uncertainty before another
task can start; executor fences also apply when switching back to legacy routes.
Only access/agreement choices and blocks/uncertainty persist in computer.json,
never screenshots or task text. Recovery requires the user to inspect the prior
app result and explicitly choose **I've checked — continue** in Settings; neither
restart nor accepting the agreement clears uncertainty or replays input.
Confirmation IPC is guarded by exact webContents/frame/URL and current nonce, and its sandboxed renderer
has no provider/settings/executor API. Renderer loss cancels work.

An exact standalone Notepad/Calculator launch is bound to a fixed Windows
executable and explicit app intent, rather than the current window's UIA lease.
It requires the remembered agreement and enabled access, runs without a per-launch question, rechecks app denials, and uses
the same uncertainty/Stop boundary. It reads no window content or model context;
native success requires the named same-user, non-elevated app's foreground window.
Only those fixed executables are accepted, with no arguments or shell text.
For hosted Calculator, the worker checks the system frame host and Calculator's
fixed Windows app ID. A minimized frame can be selected by its shell app ID.
Success also requires the restored foreground frame to contain a same-user,
same-session, non-elevated child with Calculator's process app ID. The broker
keeps the last verified window handle per app in memory as a selection hint.
Each launch revalidates it against current policy and window identity.
Compound/model-selected actions retain the normal observation/revalidation path.

The optional continuous-session approval recognizer receives real audio only
while a proposal exists. Start/end audio positions and proposal identity reject
late earlier speech. PTT release closes all detectors. Microphone speech is not
speaker authentication: background voices/playback can still approve or stop a
displayed proposal. Physical audio/real-app acceptance remains an open gate.

## Companion surface

Gemini key mode streams active utterance PCM to one fixed Google WebSocket
endpoint using `gemini-3.5-transcribe-live`. Its key remains in main, never the
renderer or diagnostics. Interim words are display-only. Only committed text
after the local end-of-utterance boundary can populate Voice's final transcript.
Setup/final deadlines, audio/queue/message/text bounds and generation cancellation
reject late or malformed results. Failure stops the utterance without a second
batch request or silent model fallback. There is no wake-idle audio, idle socket,
screen context, TTS or action API in this transport.

Local/managed preview still uses a separate local System.Speech worker. Its
partial text never populates final ASR or field bindings; failure is cosmetic and
does not disable local/managed final recognition or the independent Stop worker.
Caption state is ephemeral (2,000-character bound, eight-second final expiry)
and cleared on Stop/new activation.
Manual voice-preview IPC checks the Settings sender/frame/URL, microphone owner,
turn, frame sequence/size and 30-second audio bound. The worker has no network,
file output or microphone API, and disables acoustic adaptation for its instance.

Settings renderer readiness is a separate, exact-sender/frame/URL-guarded IPC
notification. It resolves presentation readiness only; it grants no microphone,
screen, provider or execution permission. A user Settings request still stops
work immediately, even when its window is waiting for the first UI commit.

The primary surface is now a transparent, click-through, non-focusable cursor
follower. Its placement uses only local cursor/display coordinates. Its separate
sandboxed preload exposes presentation state, session-bound audio frames and
capture failure, plus answering the current confirmation, fetching its masked
image once for display and toggling mouse interaction for that question. Those
operations require its exact current nonce. There is no settings, key, arbitrary
observation, permission or executor API. The companion freezes position during
a question and becomes mouse-interactive only while the pointer is over it.
Every channel checks exact webContents, main frame and local URL. Main routes
audio only from the explicit owner; settings frames cannot feed a companion turn.
Media grants require that visible owner and active capture, audio only. Idle,
hidden windows and the other renderer cannot acquire capture.

Talk from the native hotkey, tray or settings explicitly authorizes one spoken
command under the selected target's existing policy. It uses the same bounded
utterance/local stop detector, transcription and verified executor as hands-free;
success closes detectors/capture and pauses executors instead of listening again.
Stop, failure, invalidation, hiding/crashing the primary companion or changing
displays cancels work. Late replies cannot authorize another command. Nothing
grants a new website or broadens supported actions. See [companion](companion.md).

Holding a physical Ctrl alone for 250 ms is an explicit push-to-talk activation.
The native helper emits only fixed gesture/health states and forwards input;
injected presses cannot activate capture. Chords, clicks/wheels, quick taps,
missed releases, helper loss and the 15-second capture cap discard work. Main
invalidates pending preparation on release; a late open is cancelled. Release
closes capture/local detectors and processes only the bounded current utterance.
The processing session retains its cancellation fence without an audio heartbeat;
it cannot acquire the microphone again. Spoken Stop ends with capture, while the
native Stop shortcut and tray remain available. No character/keycode logging,
keyboard injection, driver or action API is added.

## Phase 9 Windows compatibility boundaries

Only the explicitly selected Chrome/Edge family can pair. Browser-specific host
directories/HKCU registrations and protocol-3 greetings intersect the existing
extension origin, process token and single-connection contract. The relay checks
the actual browser ancestor, supporting direct launch or one verified Windows
System32/SysWOW64 cmd.exe intermediary. Edge registry fallback cannot silently
impersonate Chrome. This is family separation, not signed-publisher attestation
against same-user malware/renamed binaries.

Switching stops execution, requires the previous browser fence and no unresolved
result, disconnects the old socket and clears its grants/bindings. Old sockets
cannot deliver state after retirement. Chrome/Edge consent is separate; legacy
consent migrates to Chrome only. Per-profile extension consent and effective
grants remain mandatory. Multi-profile/incognito and simultaneous browsers are
not enabled. Newer/corrupt settings lock without overwrite and retain uncertainty.

Display configuration changes cancel work and re-fit only Latham's own window;
they never convert old target coordinates or resume a binding. Escape is a local
Stop alternative. Keyboard/negative-coordinate/simulated-display checks do not
certify physical mixed-DPI, assistive-technology or cross-platform automation.

Task feedback is explicit per entry, bounded to 50 fixed-category/numeric rows,
stored locally and clearable. No raw text, URLs, accounts, audio, transcripts,
screenshots or identifiers are accepted and nothing uploads automatically.
Self-reported metrics do not become action receipts or provider billing data.
Windows-only startup remains enforced. See [Phase 9](phase9.md).

## Phase 8 managed-service boundaries

The optional local service receives active audio or bounded candidate labels
only after explicit endpoint/routing consent and a saved managed route. It
cannot observe pages, approve scopes or execute actions. Local and BYOK remain
independent routes; no silent fallback or managed vision is introduced. Stop
and executor fences stay local and invalidate late provider results.

Operator-issued single-use high-entropy invitations create expiring bearer
sessions. The server stores hashes; the desktop stores DPAPI ciphertext and
never exposes sessions in renderer state. The API accepts only exact bounded
transcription/selection contracts, rejects browser Origin/cookies, redirects,
arbitrary models/URLs/tools and extra candidate data, and revalidates output.
Provider secrets are server environment only and are never in desktop bundles.

Transactional account/day and global/day/lifetime request reservations precede
provider dispatch. Failed, cancelled and uncertain attempts count, even across
restart/account deletion. Fixed concurrency, request/body/output limits,
per-account/service rate limits and deadlines bound abuse; they are not monetary
billing guarantees. No billing/payment endpoint exists. SQLite is a local
single-instance deployment contract, not multi-host quota coordination.

Cancellation disables account inference and aborts active work. Deletion removes
live account/session/identifiable usage rows with foreign-key cascades and secure
deletion; anonymous service spend totals remain. Sign-out revokes the session;
offline Forget explicitly does not. Response loss never claims confirmed server
deletion or silently clears credentials. Operator backups/provider retention
need separate deletion/revocation procedures. No raw content is logged or backed
up by default. Current Gemini unpaid-service retention and audience eligibility
need review before a hosted launch; local synthetic tests do not certify that.

Packaged clients require HTTPS. The development exception allows exact HTTP
127.0.0.1 only. The service binds loopback, has no public admin endpoint, and needs
reviewed TLS/secret management/monitoring before deployment. OS administrators,
same-user malware, compromised service operators and remote provider retention
are outside this local test assurance.

Offline Ed25519 verification binds a manifest, both archive hashes, expected
platform/channel and a newer version. It requires an independently pinned public
key and never installs anything. A separate fail-closed Authenticode preflight
requires the owner's trusted timestamped publisher signatures. The current
preview is unsigned; no production key/feed/certificate has been provisioned.
See [Phase 8](phase8.md) and [launch gates](release-operations.md).

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
