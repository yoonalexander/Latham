# Evaluation and acceptance

## Phase 10D app-denial follow-up — November 11, 2026

The universal controller now checks inherited Notepad denial on planned
launches and passes the effective app blocks to each native request. The native
worker applies Calculator aliases to the Windows-hosted frame and accepts
blocked names with an `.exe` suffix.

`npm run check` passed with 156 unit tests, including planned launch denial
before dispatch and denial changed during review. A native identity probe on an
existing hosted Calculator window blocked `calculator`, `CalculatorApp.exe`,
`calc`, and `applicationframehost.exe`. Empty and unrelated deny lists
permitted the same window. The probe used the worker's policy check without
activating Calculator, capturing contents, or dispatching input. The foreground
observation and restoration regression is included in the native suite and
still needs an interactive run.

## Phase 10D Windows acceptance — November 11, 2026

- **10D.1 startup and shutdown passed.** The plain Electron cold-start and tray
  Settings regressions passed, including early startup and window geometry.
  The native supervisor exit regression passed with Settings destroyed. The
  first interactive run passed all nine targeted native checks, including
  Notepad and Calculator launch and restore, fixture editing, and Stop during a
  stalled native provider.
- **10D.2, 10D.5, and 10D.6 still need a reliable foreground run.** The longer
  runs could not consistently focus the WinForms or isolated Chrome window.
  The final Calculator probe returned `computer_focus_denied`. Windows
  reported `GameInputSvc` as the foreground process during diagnosis. The
  desktop control tool reported “failed to activate captured window” on both
  attempts. The browser fixture now checks Windows foreground before accessing
  the test page. A new cross-app regression checks clarification, one review,
  two verified actions in the synthetic editor, and a fresh Calculator
  observation. It stopped at the fixture focus check on this run. Editing in
  multiple ordinary Windows apps and the live Gemini planner rerun remain open.
- **10D.3 and 10D.4 have synthetic audio evidence.** Companion tests passed
  live captions, execution from final words only, and capture closing. Live
  Gemini streaming passed with generated speech. In one simulated hands-free
  session the installed Windows detectors recognized two distinct approvals and
  “stop assistant” during a third pending operation. The test supplied generated
  PCM and controlled command results. The companion recovery test verified
  explicit reconciliation and zero replay. Physical microphone, hold-Ctrl,
  spoken approval, and Stop still need hands-on acceptance.
- **10D.7 has controlled privacy evidence.** First-run consent, no idle
  microphone, remembered disable, launch denials, synthetic password masking,
  and the unit tests for provider context and scope passed. The extension-free
  Chrome deny rerun and a real secure or elevated window check remain open.
- **10D.8 placement passed on both available displays.** Both were 1920×1080
  at 100% scaling. The companion stayed within each work area at all four
  corners, including on the monitor with negative desktop coordinates.
  Simulated display recovery also passed. Native targeting on the secondary
  monitor and mixed-DPI coverage remain open.
- **10D.9 package built with one acceptance failure.** The unsigned Windows
  archive and checksum manifest were generated. The packaged verifier passed
  25 checks, including first-run consent, Stop, restart with simulated
  uncertainty, blocked execution before recovery, and explicit recovery.
  Packaged Calculator launch reported an uncertain result, so the verifier
  recorded the failure and exited nonzero.

`npm run check` passed type checking, 154 unit tests, and both builds.
The 14 companion and compatibility integration checks passed. Local reports
are in `.test-artifacts/` under `phase10-native-baseline.json`,
`phase10-native-followup.json`, `phase10-handsfree-audio.json`,
`phase10-companion-displays.json`, `phase10-companion-displays-run.json`, and
`preview-acceptance-chrome.json`.

## Phase 10D launch and shutdown follow-up — November 9, 2026

The interactive baseline reproduced Calculator's unverified result. Its
top-level window is owned by the system's ApplicationFrameHost. Minimizing that
frame detaches Calculator's child window, which Windows reports as cloaked.
The worker now selects the minimized frame by its fixed app ID, skips cloaked
windows, and verifies Calculator's process app ID in the restored foreground
frame. The broker rechecks any remembered window before acting.
[Windows window attributes](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwmwindowattribute)
and [process app identity](https://learn.microsoft.com/en-us/windows/win32/api/appmodel/nf-appmodel-getapplicationusermodelid)
document the APIs.

The five launch cases passed twice on the interactive Windows desktop. They
covered app denials, direct Notepad and Calculator requests through Electron
without a provider key, and activation of the same background and minimized
windows. In the broader run, the universal editing fixture did not acquire
foreground focus, and the legacy editor and Stop cases failed during window
discovery or editor focus. These runs used automation without microphone input.

The broader tests also surfaced an Electron shutdown race when a late native
supervisor exit tried to publish state after Settings had been destroyed. State
publication now checks window lifetime and stops during quit. The focused
shutdown regression was added after interactive testing was stopped.
Physical voice, wider native-app and display checks, and packaged acceptance
remain open.

## Gemini live speech instead of split recognizers — November 2, 2026

The owner reported an incorrect Windows caption (“were no hard” for “open
Notepad”) that was replaced by the correct final transcript about 15 seconds
later. Desktop Gemini mode previously combined local provisional dictation with
a separate post-release batch request. It now uses one main-owned Google
`gemini-3.5-transcribe-live` stream for interim and committed final text.
Language/vocabulary hints are sent as recognition data; no phrase substitutions
or forced command guesses were added. Interim text never executes. Local and
managed modes retain their existing Windows preview/final-provider routes.

Live checks with the supplied development key and synthetic Windows Zira audio:

| Sample | First text from stream start | Final after client speech-end | Result |
|---|---:|---:|---|
| “open notepad” | 983 ms | 211 ms | “Open Notepad.”; interim arrived before speech ended |
| Longer Notepad sentence | 641 ms | 236 ms | Correct sentence; interim arrived before speech ended |
| Repeat through opt-in maintained live test | 923 ms | 263 ms | Correct Notepad phrase; eight updates, before speech ended |

These are individual network/synthetic measurements, not human-microphone
accuracy, p95 latency or a universal speed guarantee. A batch baseline probe did
not return a usable result; no measured batch/live speed ratio is claimed.

- `npm run check` passes type checking, **154 unit/security tests**, and both
  JavaScript/native builds. New cases cover bounded audio/setup/backpressure,
  provider errors, connection/final deadlines, committed-only completion,
  cancelled/late finals, one shared recognizer, and missing-frame completion
  for the direct recording API. Final captions cannot be replaced by late interim text.
- Both changed Electron capture flows pass with real synthetic getUserMedia
  input and an explicit WebSocket fixture: interim text appears while recording,
  does not act, one connection supplies the final, there is no second batch
  transcription request, execution occurs after release, and Stop/hide discards
  late replies. These fixtures do not establish live-provider accuracy.
- The maintained live-provider case passes using `LATHAM_LIVE_GEMINI=1` and
  synthetic audio only. Default diagnostics contain no personal audio, transcript,
  key, socket URL or raw provider exception. No npm package or model was downloaded.

Evidence: `.test-artifacts/live-speech-client-evidence.json`,
`gemini-live-native.json`, `gemini-live-companion-results.json` and
`gemini-live-provider-results.json`. Temporary probe source was removed after
verification; the maintained opt-in test is in `computer-native.spec.ts`.
Physical voice/accent/noise, service availability for other keys and packaged
acceptance remain open. Google protocol/model and free-tier eligibility were
checked against [live transcription](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe)
and [pricing](https://ai.google.dev/gemini-api/docs/pricing).

## Clear recovery guidance — November 2, 2026

The owner encountered a persisted uncertain-task block after accepting the
agreement. Read-only metadata confirmed agreement accepted and access enabled,
with `uncertain: true`; no task history was read or inferred. The companion now
shows the exact Settings path and the matching **I've checked — continue** control.
That control is in a recovery card at the top of Universal assistant, explains
checking the prior app result, and stays disabled until the worker has stopped.
Acknowledgement resets the visible phase/status to Ready without replaying input.

Type checking, the JavaScript build, all 19 controller cases and two targeted
Electron cases pass. The UI case starts with persisted uncertainty, verifies no
idle microphone, exact guidance and caption bounds, leaves the saved block in
place until the explicit click, then verifies Ready, saved uncertainty cleared,
and zero native action/observation worker calls. Screenshots were inspected:
`.test-artifacts/companion-recovery-guide.png` and `computer-recovery-card.png`.
The report is `recovery-guidance-results.json`. The real user's recovery state
was not cleared on their behalf.

Verification initially encountered a full drive (ENOSPC), including a failed
fixture copy and state-write-dependent test failure. Closed generated test
profiles under the workspace were removed after checking paths and active
processes, freeing approximately 289 MB; rebuild and targeted tests then pass.
The user's profile, keys, models and documents were outside that cleanup.

## One-time setup and remembered universal access — November 2, 2026

The owner chose one agreement during setup rather than reapplying session consent
after each launch. First run now opens Settings with Latham's terms/permissions
and an unchecked agreement box. Universal access, window images and browser
inclusion are selected by default and adjustable before acceptance. After
**Agree & enable Latham**, version-2 computer.json stores the agreement version,
chosen scopes/provider, disable state and existing denial/uncertainty metadata.
Returning launches show only the companion. No task, observation or microphone
starts just because access is remembered. The current portable preview uses
first-run setup; there is no separate installer wizard in this change.

- Type checking and **147 unit/security tests** pass. New cases cover restored
  scopes/provider, persisted disable and denials, no constructor observation,
  legacy state requiring the agreement, malformed/future agreement data, and
  uncertain effects staying blocked until explicit inspection.
- JavaScript and native builds pass. The first native build hit the retiring
  preview's locked Ctrl-helper executable; rebuilding after its exit passes.
- **14 Electron checks pass** across the targeted onboarding/Settings run (four)
  and the remaining companion/setup run (ten). The new onboarding case verifies
  the unchecked agreement gate, default scopes, no idle capture, accepted UI,
  restart without Settings/reconsent, retained Notepad denial, and disable after
  another restart. Existing cursor/motion, live/final captions, microphone-owner,
  Gemini-save and extension checks pass. The plain hidden/normal-launch Settings
  regression remains covered with an explicitly returning-user fixture.
- Agreement and saved-access screenshots were inspected. Tests use isolated
  profiles and synthetic audio; no real user's agreement is fabricated and no
  new live-provider, physical microphone or packaged-installer check is claimed.

Reports: `.test-artifacts/remembered-access-results.json` and
`remembered-access-companion-results.json`. Screenshots:
`computer-first-run-agreement.png` and `computer-remembered-access.png`.

## Settings hidden-launch regression — November 2, 2026

The first-show failure is reproducible without a tray menu or Playwright's Electron
debugger. A plain Electron child using the development launcher's `windowsHide:
true` produces `{ first: { visible: false, rendered: true }, secondVisible: true }`.
The same probe with only `windowsHide` changed to false shows the first window.
With a hidden launch retained, changing Settings to `showInactive()` followed by
`focus()` also shows the first window. This isolates the Windows startup/show path;
React readiness, tray teardown and resizing do not explain the failure.

The development launcher no longer supplies a hidden GUI startup state. Settings
uses the inactive-show path followed by explicit focus so that a hidden external
launcher also works. Startup still shows only the companion, because Settings is
created with `show: false`. Windows can override the first native show request
using the launcher's startup information; see [Microsoft's ShowWindow contract](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-showwindow).

The plain-process regression failed before this change with first visibility and
post-click visibility false, while rendering and second visibility were true.
It now checks both hidden and normal launches, including first visibility,
rendered content, visibility after a click, close/reopen and hidden startup. All
four targeted Settings tests pass. Report: `.test-artifacts/settings-native-show-results.json`.
The plain process intentionally avoids `_electron.launch`, whose startup path
did not reproduce the production failure in the earlier tests.
The final plain-process regression also passes three consecutive repetitions
(six cold process launches across the two startup flags), retained in
`settings-plain-repeat-results.json`. Type checking, all 145 unit tests and the
full desktop/native build pass. One earlier broad check hit the existing
intermittent `computer_operation_failed` controller-test failure; the serial
rerun passes. Physical native-menu verification of this final fix remains a
separate check; the two earlier user retries were of the unsuccessful fixes.
The keyboard/Escape/display-recovery/restart compatibility case passes as well.
Temporary diagnostic bootstrap scripts were removed before returning to the
normal development launcher; the ignored metadata reports remain as evidence.

## Settings first-show geometry — November 2, 2026

The owner reproduced the blank first window after the earlier readiness fix.
A temporary metadata-only trace on the actual tray path showed React loaded
(356 DOM elements) on both attempts. On the first attempt, the show event and
subsequent renderer check still reported the window hidden. Clicking the blank
surface produced no application close/hide call; the second tray request showed
the actual window normally. This disproves renderer readiness as a complete fix.

Window geometry recovery was running synchronously inside the native show event.
The new regression failed with `show:begin, minimum, bounds, show:end`. Geometry
recovery now happens before showing/restoring Settings; the show event no longer
changes minimum size or bounds. Display-change recovery is retained. All three
Settings tests pass, as do type checking, the JavaScript build and all 145 unit
tests. The owner then confirmed that this geometry-only change still opened
blank first and worked second. It is not the root-cause fix; the hidden-launch
regression above supersedes that hypothesis.

The ignored metadata traces are `settings-native-before.jsonl` and
`settings-native-events.jsonl`; the test report is `settings-show-order-results.json`.

## Compact companion confirmation — November 2, 2026

The universal route now runs standalone Notepad/Calculator launches and exact
single-control commands directly. Longer tasks use one confirmation beside the
companion; image-coordinate clicks always ask separately. The separate review
BrowserWindow, renderer and preload were removed. Legacy adapters retain their
own policies.

- `npm run check` passes type checking, **145 unit/security tests** and the build.
  New policy cases cover direct launches, exact/unique target and payload matching,
  unapproved extra model steps, one task confirmation across bounded steps,
  separate coordinate confirmation, denial, Stop and uncertain launch outcomes.
- The real Electron/native Notepad launch passes without a provider key, window
  observation or confirmation. Only Settings and the companion windows exist.
- A controlled actual native field replacement passes directly. An earlier
  controlled Electron two-step edit also passed with one companion confirmation.
  Later native reruns were blocked by Windows refusing foreground focus; they
  are reported as failed focus checks, not counted as additional acceptance.
- The deterministic Electron bubble test uses explicit synthetic model and worker
  responses. It passes three repeated runs: one Continue covers two steps, the
  bubble stays fixed as cursor coordinates change, current-question mouse
  interaction returns to click-through after completion, expired/noncurrent
  confirmation/image/interaction calls fail, an image click shows a marked point,
  and Cancel clears the image/buttons without changing the field. This establishes
  UI/controller wiring, not real native coordinate-click acceptance.
- All **11 companion/setup integration cases** pass: first Settings open,
  cursor bounds/smooth motion, Ctrl helper, API isolation, capture ownership,
  live/final captions, measured microphone bars, provider settings and extension
  regressions. Task and point bubble screenshots were visually inspected.

Screenshots are `.test-artifacts/phase10-companion-confirmation.png` and
`phase10-companion-point.png`. The current bubble report is retained as
`companion-confirmation-results.json`. No new live Gemini call, physical
microphone/hover-click study or packaged-build acceptance was performed. Phase
10D and physical mixed-DPI/app coverage remain open.

## Live speech captions — November 1, 2026

The companion and Settings voice test now display provisional local dictation
during active speech, then the selected final provider's words. The caption stays
through final transcription and expires eight seconds after a final; explicit
Stop/new activation clears it. The preview neither dispatches nor inserts text.

- `npm run check` passes **142 unit/security tests**, type checking and the build.
  Tests cover preview lifecycle/generation, late callbacks, final replacement,
  expiry, failure isolation, wake-idle exclusion and bounded manual-frame routing.
- The actual Windows dictation worker passes with synthetic English speech:
  **12 provisional updates** arrive before speech input finishes. The final
  encoding-aware worker and the independent approval recognizer both pass
  (two native cases, 13.4 seconds). This is not a human recognition/latency study.
- **11 companion/setup cases pass**, including actual getUserMedia capture with
  synthetic spoken audio. Text appears while capture is active, no provisional
  words act, exactly one final-provider request occurs, the final words replace
  the preview and only that final command executes. Stop clears the caption.
  Existing first-Settings, cursor, silence/waveform, capture-owner, provider-save
  and extension regressions pass in the same targeted run.
- The small caption was visually inspected. A four-DIP horizontal viewport offset
  was corrected to contain its right edge while preserving the fixed window size
  and above/below animation. The integration test checks caption bounds.

Evidence: `.test-artifacts/live-preview-native.json`,
`live-preview-regressions.json`, `live-preview-companion-results.json`,
`companion-live-words.png` and `companion-final-words.png`. Final-provider responses
in the UI test are mocked; no additional live Gemini/model acceptance is claimed.
Native preview uses installed System.Speech dictation with adaptation disabled,
not Gemini Live or the planned Handy backend. Missing/unsupported language engines
show unavailable and do not block final ASR. Physical microphone accuracy, other
installed languages, device/resource comparisons and packaged acceptance remain
separate checks.

## First Settings open — November 1, 2026

The owner reported a blank window on the first Settings attempt after restart.
An isolated test using the actual tray Settings callback reproduces the startup
blank-window race by delaying only renderer.js: the original handler showed the
window before the UI existed. Settings now waits for the guarded renderer-mounted
notification and defers show/focus until after the tray callback returns.

The delayed-startup regression passes, as does the full 136-test/type/build check.
All 10 targeted companion/setup integration cases pass, including the two new
first-open cases, native Ctrl helper, motion, capture and extension setup. The
report is `.test-artifacts/settings-first-open-results.json`.
A normal cold-start test verifies the first tray Settings callback displays
content, does not show synchronously inside that callback, keeps the fixture view
at zero size and stays open when its heading is clicked. These tests exercise
the real menu callback and settings renderer, but cannot independently establish
the reported physical native-menu blank/dismiss behavior: native UI inspection
is unavailable in this session. The owner subsequently confirmed that the blank
surface was the full-size Latham Settings window, matching the guarded window
path. Physical confirmation of the rebuilt first-open behavior remains pending.

## Phase 10 universal Windows implementation — November 1, 2026

**Direct-launch correction:** the owner confirmed physical hold-Ctrl capture
and session consent, then reported that opening Notepad failed with
`computer_tree_limit`. A controller regression reproduced the exact error:
every goal observed the current window before considering a launch. Exact
standalone Notepad/Calculator requests now use the existing fixed app allowlist
without scanning that unrelated window or invoking reasoning. The scan limits
and screenshot protections remain unchanged. Oversized ordinary-task scans now
produce a plain-language message. Physical goal completion still needs the owner
to retry after the rebuilt preview restarts.

The corrected check passes **136 unit/security tests**, type checking and the
build. A real native test passes Notepad launch/window verification and rejects
both an explicit Notepad denial and an unsupported PowerShell request without
reading accessibility content or capturing the screen. Notepad is left open;
tests never terminate a process that could contain the owner's documents.
The real Electron direct-launch approval flow also passes with no provider key
stored, alongside the existing observed native-edit regression (two cases,
19.1 seconds). The follow-up report is
`.test-artifacts/phase10-launch-followup.json`.

[Universal desktop setup](universal-desktop.md) defines the implementation preview,
scope and open 10D gate. This development build has not replaced the 0.9 release
ZIPs. Evidence is kept separate from the older narrow-adapter milestones below.

- `npm run check` passes type checking, **133 unit/security tests** and the
  Electron/native build. New tests cover consent-off startup, strict action
  grounding, one-use/expired approvals, changed observations, Stop and late
  providers, persistent uncertainty, revocation propagation, privileged URI
  blocking, local-model/vision restrictions and proposal-bound approval audio.
- Five targeted native tests exercise the actual en-US approval recognizer with
  synthetic speech, the actual Windows observation/edit worker, isolated Chrome
  without an extension, live Gemini on a synthetic window, and the actual Electron
  review/focus-restoration/edit/verification path. The live checks use only
  synthetic content and the existing model/key; no personal desktop is sent.
- Eight companion/setup regressions pass, covering real synthetic capture,
  media ownership, cursor bounds/motion, the native Ctrl helper, Gemini saving
  and the optional native-messaging extension route. These are distinct runs,
  not a new green aggregate of every historical browser/native test.
- The final focused browser revocation check passes. A hands-free follow-up
  exposed an inaccessible exact selector name after adding the universal option;
  Command app now has an explicit accessible name. The corrected synthetic
  capture/disconnect check passes in 15.9 seconds, separately from the first failed
  selector attempt. It confirms the optional legacy Chrome route still works.
- Visual inspection caught a DPI-unaware PrintWindow mask being placed using
  physical UIA coordinates. Rendering dimensions now follow the target's DPI
  context, and a pixel regression checks the actual synthetic password region.
  The corrected image was inspected. This proves the controlled current-display
  mapping, not every custom control or physical mixed-DPI configuration.
- Chrome's delayed tab-memory label correctly invalidated an early observation;
  acceptance now waits for startup settlement before observing. Its asynchronous
  ValuePattern update required bounded readback polling. No stale-input guard
  was weakened. Dynamic real windows can still cause conservative abstentions.
- Initial Electron acceptance could not activate the fixture from a background
  process. Test setup now selects its own known synthetic window through the
  same normal restoration worker used after review. The reviewed action passes;
  unrelated foreground changes and an OS focus refusal remain blockers.

The final five-test native run passes in 53.5 seconds. Ignored evidence includes
`.test-artifacts/phase10-native-results.json`, `phase10-handsfree-followup.json`,
`phase10-window-mask.png`, `phase10-chrome-mask.png` and `phase10-action-review.png`.
Live tests disable retained execution traces and import keys inside main, rather
than exposing a real key through a recorded renderer call. Disposable completed
test profiles are cleaned when disk space is tight; release ZIPs/models and the
real user profile are retained.

**Still open:** physical Ctrl/microphone and repeated hands-free approval/Stop
for this new route; unrelated real native apps and multi-step cross-app goals;
diverse coordinate, scroll, key and TextPattern editor acceptance; local Ollama
reasoning/vision on actual hardware; physical mixed-DPI/multi-monitor behavior;
and a new packaged release. Existing narrow-route voice acceptance does not
close these gates. No every-app compatibility or authenticated-speaker claim is made.

## Cursor companion — November 1, 2026

The default UI now follows the cursor with an independent three-bar glyph and
separate settings. [Companion evidence](companion.md#implementation-and-evidence)
records the 112-test build/check and eleven passing targeted Electron/browser cases,
including actual capture from a synthetic device, one verified browser action,
animations, media-owner isolation, Stop, hide and late replies. Human microphone,
physical display and new packaged-release acceptance remain separate.

Ctrl push-to-talk adds release-only transcription and a native gesture helper.
The full check passes 121 tests; the helper's real hook installation, health
and parent-pipe shutdown pass. Existing hands-free, companion capture and
cursor-corner regressions pass. Physical Ctrl/human speech acceptance remains
distinct from deterministic gesture/audio tests. See the companion guide.

Smooth side switching passes the 121-test build/check and five companion
integration cases. Frame samples cover intermediate movement, interrupted
reversal, boundary jitter, reduced motion and settled corner proximity; the
same run checks native Ctrl helper readiness, idle media denial, microphone
lifecycle and verified single-command execution with synthetic audio. Native
size stability remains checked. Physical multi-display motion remains open.

Gemini setup repair reproduces and fixes the UI case where storing a key left
the saved route at local. The regression checks persisted cloud mode, a specific
missing-browser message and repeated failure feedback. A separate real-profile
check preserves the stored DPAPI key, explicitly saves the intended cloud route
and passes a fixed Search/Cancel Gemini decision fixture, without microphone or
website data. That profile still has no browser connection or approved sites;
successful model authentication does not imply browser or physical-key acceptance.

## Phase 9 Windows evidence — November 1, 2026

The owner selected **Windows only for now; keep other platform gates open**.
The **0.9.0** implementation and support matrix are in [Phase 9](phase9.md).
This is an unsigned developer preview, not universal website/platform support,
trusted signing, physical hardware certification or a public managed-service
launch. Billing remains disabled.

- `npm run check` passes **108 unit/boundary tests**, type checking and the
  Windows build. Eight new cases cover legacy consent/key/mode migration,
  Chrome/Edge consent separation, future/corrupt/invalid-uncertainty settings
  locks, exact browser choices/registry paths, wrong-browser/old-protocol denial,
  retired sockets, negative/offscreen/small work areas, and explicit bounded
  non-content evaluation storage/restart/clear.
- Real **Chrome and Edge native pairing passes** using protocol 3, the selected
  browser family and separate registrations. The Windows Chromium cmd.exe
  intermediary is handled with bounded ancestry and verified system shell path.
  A dedicated Edge case deliberately makes its host claim Chrome while main
  selects Chrome: the actual Edge ancestor is rejected before pairing. Switching
  back preserves Edge consent while requiring a paused fresh connection; Chrome
  starts without that consent. No personal browser profile is used.
- The keyboard/display/evaluation Electron case passes: Tab/Enter skip without
  changing the privileged URL, local Escape Stop, cancellation and window
  recovery after a **simulated** display-removal event, narrow 680×520 layout
  without horizontal overflow, explicit save consent, restart persistence and
  clear. These are controlled UI/data tests, not actual multi-display, mixed-DPI,
  Narrator or real-user-study results. Feedback screenshot:
  `.test-artifacts/phase9-keyboard-feedback.png`.
- The first full Chrome/fixture project passes **42/43** cases, including the
  100-operation DOM benchmark and existing provider, account, visual, hands-free,
  permission, dictation, scope and workflow boundaries. One intervention case
  reported `blocked` instead of `cancelled`; it had not asserted that preparation
  succeeded before intervening. The test now checks that precondition explicitly.
  Its focused follow-up passes (**9.6 seconds**); the earlier failure remains
  recorded and is not relabelled a green aggregate or a proven production fix.
- The independent Edge matrix passes **35/36** on **156.0.4314.50**, including
  its separate 100-operation benchmark, visual/hands-free/dictation and browser
  isolation/UI cases. Its more precise assertion identifies the same remaining
  issue at the **denied iframe preparation** precondition. The fixture had waited
  for the main page's old load event after inserting a new child frame. It now
  verifies the actual synthetic child has loaded and waits for browser tab
  readiness before preparing; production still excludes that child from reads.
  Final focused checks pass **3/3 on the Chrome/default route** (family isolation,
  keyboard/display/feedback and all six workflow interventions) and **1/1 on
  Edge** (all six interventions, 20.0 seconds). Broad first-run failures are
  preserved separately; no guard, expiry, permission or executor limit is relaxed.
- **Live signed-out Edge workflows pass 3/3**: USAJOBS software/remote/first job
  (**3,482 ms**, three steps), Wikipedia piano/first article (**3,529 ms**, two
  steps) and MDN fetch/first documentation (**2,120 ms**, two steps). All seven
  steps verify. These public synthetic queries use no model or API key. There
  is no challenge bypass or user-account automation. Install-time fixture grants
  are distinct from native optional-permission-prompt acceptance.
- **Packaged 0.9 smoke checks pass separately for Chrome and Edge**: actual
  version/startup/sandbox, matching extension/protocol/host, explicit browser
  choice with fresh site consent, idle/off states, incognito disabled, HTTPS-only
  managed setup, no service/user credentials/evaluation data bundled, real DPAPI
  key/shortcut protection, OCR/detectors, tab operation, reviewed search/filter
  workflow and acknowledged Stop. No signing identity or automatic updater is
  configured. The final archives are refreshed with these evidence notes and
  all packaged runtime file hashes are checked unchanged.
- Native-only regression is **not green**: all seven cases stop at the existing
  Windows refusal to focus the fixture editor before editing. No focus guard,
  secure-field policy or native effect check is relaxed. The new browser/UI
  results do not establish a new native editing acceptance claim.

Reports are separate: `phase9-native-results.json`,
`phase9-chrome-results.json`/`phase9-chrome-summary.json`,
`phase9-workflow-followup-results.json` and the Edge/live/package reports produced
by the commands in the guide. Browser metadata identifies the actually measured
runtime; the Chrome fixture version is **156.0.8078.4**. Synthetic speech/grants
and live signed-out site evidence must be read separately from physical
microphone/permission prompts or stable personal-profile/store acceptance.
Final reports: `phase9-final-focused-{chrome|edge}-results.json`,
`phase9-live-edge-workflows.json`, `preview-acceptance-{chrome|edge}.json` and
`phase9-final-package.json`. Full-region and viewport captures are saved
separately; `phase9-keyboard-window.png` retains the actual viewport controls.
Final TypeScript/build and all **108 unit tests pass**. Markdown links were
checked with **184 targets, zero missing** before packaging.

No new npm package, model, paid API enrollment, reference-app code or managed
billing is introduced. Older unpacked 0.2/0.3 build staging duplicates were
removed only after every file matched their retained ZIPs (106/108 files);
all archives, newer rollback builds, reports and personal/earlier profiles remain.
The fixture helper now cleans only its own disposable browser profile after
closing, and restores registrations/resources even if setup fails.

## Phase 8 evidence — November 1, 2026

Implemented for **0.8.0** within the owner's selected **local build/testing,
billing-disabled** scope. [Phase 8](phase8.md) defines exact account, routing,
quota, retention and release contracts; [launch gates](release-operations.md)
remain open for hosting, trusted signing, commercial/provider terms and actual
packaged HTTPS service acceptance. This is not a public managed-service launch.

- **100 unit/boundary tests pass**, including 14 new managed-service/client
  cases and one release-integrity case. Coverage includes single-use invitation
  authentication/policy, exact input schemas, maximum 30-second WAV, no client
  provider credentials, output bounds, no raw content persistence, transactional
  per-account/global budgets across restart/deletion/midnight, counted failures,
  concurrency and rate limits, cancellation/late results, expiry/recovery,
  future-schema rejection, encrypted session persistence, offline/unconfirmed
  sign-out versus local Forget, and no route substitution.
- The real **Electron managed-account flow passes** using a local fake provider
  and actual Windows DPAPI. UI consent is required; sign-in does not select the
  route. Explicit save switches to managed speech/selection without a user key.
  Restart keeps the protected account and route but starts microphone/hands-free
  off, with no transcript or execution. Stop discards a late response; cancellation
  prevents further admissions; deletion removes live identity and local sessions.
  The saved managed route remains managed until an explicit user change.
- **Live local-service acceptance passes** against the existing Gemini key, with
  at most two provider requests: synthetic candidate selection (**11,173 ms**)
  and the previously prepared public JFK speech fixture (**6,891 ms**). The
  two-request cap rejects a third request, usage is exactly two, and account
  deletion passes. This checks the server-owned Gemini adapter and HTTP account
  path, not physical microphone accuracy or production HTTPS/identity. Billing
  enrollment is not performed. Results retain booleans/timing only, no key,
  invitation, bearer session or transcript.
- The aggregate `npm run evaluate` **is not green**: its seven native cases all
  stop at the existing Windows foreground-focus denial before editing; the
  dependent 41 Chrome/fixture cases consequently did not run. Their independent
  follow-up passes **40/41**, including the 100-operation DOM benchmark, scope,
  dictation/undo, permission/restart, visual, workflow and account cases. The
  remaining old wake-detector test hit the real microphone-stall safeguard
  while synchronous Windows CIM lookup stopped synthetic frame delivery. Its
  test harness now performs that lookup asynchronously while feeding silence;
  no production detector, timeout or focus guard was weakened. A focused run
  passed all wake/detector assertions but exceeded the total timeout during
  app/browser cleanup; a further browser launch reported memory exhaustion.
  After this run's disposable Chrome profiles were removed and drive space
  recovered, the **final wake/detector recheck passes (19.3 seconds)** with a
  90-second test setup/cleanup budget. Managed-account acceptance also passes
  again on the final build. The aggregate native focus failures remain open.
- **Packaged 0.8 acceptance passes**: actual portable startup/version/sandbox,
  no development env import, managed starts signed out with no endpoint, rejected
  HTTP managed setup, no service/database/session/key in the bundle, packaged
  helpers/OCR, host/extension pairing, wake idle without transcription, Stop,
  verified search/filter workflow and DPAPI shortcut save/deletion. The fixture
  grants Google at extension install in an isolated profile; no personal profile
  or native permission-prompt approval is used. Packaged HTTPS managed inference
  is not claimed. The Windows release preflight correctly rejects this unsigned
  preview; test signatures do not establish publisher identity. The first
  packaging attempt hit ENOSPC, then succeeded after removing only disposable
  browser profiles from this task, preserving earlier profiles, archives and
  all reports. Final archives are refreshed with these documentation results;
  runtime file hashes are checked unchanged.
- Markdown verification checks **165 local links, zero missing**. The service
  and release tools build separately outside the desktop distribution. Node
  **22.13.0** reports `node:sqlite` as experimental; this is a runtime compatibility
  limitation, not a newly installed dependency.

Ignored evidence: `.test-artifacts/phase8-full-evaluation.json` retains the
aggregate native failures; `phase8-browser-results.json` retains the first broad
browser result; `phase8-live-managed.json` records the live checks. Synthetic
account UI inspection is saved as `phase8-managed-account.png`. No new physical
microphone, native editing or clean-machine/signing acceptance is claimed.
`phase8-focused-first-results.json` preserves the cleanup timeout plus successful
account test; `phase8-wake-infrastructure-results.json` preserves the memory
failure; `phase8-wake-final-results.json` and `preview-acceptance.json` record the
passing follow-up and packaged checks.

No Phase 9 or Handy implementation is included. Managed vision, paid plans,
consumer-service eligibility, automatic updates and public operations remain
outside this local acceptance scope.

## Phase 7 evidence — October 31, 2026

Implemented for the **0.7 unsigned Windows developer preview**. The
[workflow guide](phase7.md) defines the deterministic goal compiler, explicit
review/Run boundary, independent limits, exact-context leases and encrypted
shortcuts. **No consequential integration is enabled.** Phase 8 is unstarted.

- `npm run check` passes type checking, **85 unit/boundary tests** and builds.
  Thirteen new unit cases cover literal queries versus arbitrary tools, strict
  goal combinations, preview nonce/expiry, epoch/permission loss, partial results,
  action/request/time budgets, Stop/late replies, completed-goal-only saving and
  encrypted bounded editable/deletable storage. Corrupt/unavailable encryption
  locks storage without a plaintext fallback or silent overwrite.
- All **eight new workflow integration cases pass** through real Electron,
  MV3/native messaging and isolated Chrome. They cover GUI review before Run,
  verified search/filter/open, actual DPAPI storage/restart with no automatic
  execution, edits/deletion, user/tab/window/reload/revoke interruption, bounded
  missing-result behavior, delayed-step Stop/no replay, unexpected navigation,
  wrong-origin denial before injection, root replacement, explicit executor
  start, rejected consequential tools and independently enforced worker budgets.
- The broad browser/fixture run passed **39/40 cases**. The failing older case
  exposed a fixture recovery race: UI Paused preceded completion of reset, so a
  new Start could arrive while reset was still in progress. Reset now disables
  Start/Run until its acknowledgement, uncertain fixture Resume does not wait on
  unrelated adapters, and mode activation checks a generation/epoch after fences
  so Stop/reset cannot revive a waiting activation. A **12-case final focused
  run passed** all fixture and workflow cases, including that recovery case.
- The aggregate `npm run evaluate` attempt is **not a green aggregate report**:
  four native cases passed and three stopped at the existing Windows foreground
  guard; the dependent 40 browser cases did not run in that invocation. A final
  **native-only follow-up passed all seven**, including 100 targeted editor
  operations, after the activation fix. The focus guard was not weakened and
  intermittent Windows foreground failures remain a preview limitation.
  Earlier failed reports are retained rather than hidden by these follow-ups.
- Initial GUI/fence test failures were corrected to wait for preparation and
  pause acknowledgements. One initial shortcut unit write hit Windows EPERM
  during atomic rename; subsequent unit and actual DPAPI save/update/delete
  checks passed. Writes retain the prior file/list on error and surface failure.
  This does not establish clean-account DPAPI migration or hostile filesystem
  behavior. The shared browser fixture was extracted for reuse without changing
  its isolated permission arrangement or serial execution requirement.

### Live workflow measurement

`node scripts/evaluate-workflows.mjs` tested signed-out public pages in isolated
Chrome for Testing, using explicit install-time fixture grants. It invokes the
actual prepare → single-use Run → scoped verification path. No model request,
provider key, physical voice sample, CAPTCHA interaction or native permission
prompt acceptance is part of this measurement.

| Goal | Result | Action attempts / requests | Measured run time |
|---|---|---|---|
| USAJOBS: software, remote, first visible announcement | Completed; 3/3 steps verified; numeric job announcement reached | 3 / 8 | 3,622 ms |
| Wikipedia: piano, first visible reviewed article | Completed; 2/2 steps verified; Piano article reached | 2 / 7 | 3,111 ms |
| MDN: fetch, first visible reviewed documentation | Completed; 2/2 steps verified; Fetch API documentation reached | 2 / 7 | 2,376 ms |

These **three visits / seven verified steps** are measured examples, not p95,
speech accuracy, a statistical task-success rate or general-site assurance. No
unexpected destination was observed in these runs. Synthetic negative cases
separately prove that apply/send/autosave handlers stay untouched, missing
results stop partially and unknown outcomes cannot resume/replay. Query/page
instruction text cannot create a tool. Closed components, site restrictions,
alternate accounts/locales and broader visual/native workflows remain outside
this acceptance. Edge has only the earlier basic adapter experiment; workflows
are accepted on Chrome.

Explicit shortcuts are the only newly persisted goals. Default application
diagnostics still omit query text, plans, snapshots and raw media. Test artifacts
contain deliberate synthetic/public data and are ignored: `phase7-full-evaluation.json`,
`phase7-browser-first-results.json`, `phase7-focused-results.json`,
`phase7-native-followup-results.json`, `phase7-live-workflows.json`,
`phase7-workflow-preview.png` and their retained Playwright traces. No package,
model or reference-repository implementation was added.

The final **five-case mode regression passed**: 100 bound DOM operations,
hands-free commands, spoken Stop during verification, stale/late responses and
user intervention including a denied cross-origin iframe and another Chrome
window. This follows the activation fix and preserves scoped cancellation.
`phase7-mode-regression-results.json` records that run.

The **0.7 portable package passed** startup/version/sandbox, protected fake-key
storage, hidden development-key import, idle workflow state, eight initially
unapproved sites, bundled helpers/OCR, native host/extension pairing, local
wake/stop, native scan and acknowledged Stop. A copied packaged extension with
an explicit install-time **Google fixture grant** verified a prepared two-step
search/images workflow against a synthetic page. It then saved a DPAPI-encrypted
shortcut and deleted it, with no automatic execution. This is not native
permission-prompt acceptance. The packaged workflow UI was visually checked;
the bundle excludes user keys/configuration/shortcuts and native fixtures.
The Windows executable plus four helpers remain **NotSigned**. ZIPs/checksums
are local ignored preview artifacts, not a published release.

## Phase 6 evidence — October 31, 2026

Implemented for the **0.6 unsigned Windows developer preview**, with eight exact
catalog origins and conservative read-query operations. [Coverage setup](phase6.md)
defines paths, effects, frame behavior, compatibility tiers and restrictions.
Chrome remains supported; Edge is experimental. Phase 7 has not started.

- `npm run check`: type checking, **72 unit/boundary tests**, desktop/native builds
  pass. New tests cover catalog/optional-host alignment, encoded literal queries,
  reviewed paths versus edit/account/application paths, job remote/all filters,
  duplicate/unexpected queries, fixed normalization values and fabricated editing
  privileges on new profiles.
- The separate **31-flow browser/fixture suite passed**, including the Edge
  experiment, new catalog fixtures and all prior visual/hands-free/Chrome/fixture
  flows. The added normalization/no-replay test and strengthened large-page case
  passed separately. A final **four-case affected-path recheck passed** after root
  prioritization and value minimization: GitHub, MDN, dynamic large pages and
  URL normalization/unknown outcomes. There are **32 distinct integration cases**
  in this browser/fixture set, not a randomized accuracy sample.
- The **seven native acceptance flows passed** separately, including 100 targeted
  editor operations, wrong-field/manual-edit protection, stalled providers,
  worker/supervisor loss, Stop and no replay. Earlier Windows foreground failures
  below remain historical evidence of an intermittent limitation; this phase did
  not change or relax the foreground guard. No single combined `npm run evaluate`
  invocation is claimed for this phase.
- Fixture checks use isolated Chrome/Edge profiles with clearly identified
  install-time grants. Production still requests individual optional grants from
  a popup user gesture. New-site native permission-prompt UX, signed-in/private
  content, localization and physical-microphone use on new fields are not accepted.
  New fields remain focus-only. The GitHub fixture replaces the isolated world's
  input-value getter with a throwing getter: observation/focus/search still pass,
  proving the new profile does not read those values. Autosave/input and misleading
  submission handlers remain untouched.
- Root-only observation excludes frames by default. Explicit inspection exposes
  one eligible same-origin frame while excluding cross-origin, hidden and srcdoc
  frames; opening verifies top-level navigation. Open components/already-open
  dialogs, a page with 4,100 extra nodes, 20 competing menu roots, hidden rows and
  recycled result nodes have regressions. Unknown URL changes persist uncertainty
  and block resume; the test observes exactly one dispatch per requested search.

### Live public-site measurement

Chrome for Testing **156.0.8078.4**, signed out, synthetic `piano`, `fetch` and
`software` queries; no live AI/provider calls. `scripts/evaluate-catalog.mjs`
uses the actual desktop/extension/relay and install-time fixture grants. It
records read, search, scroll, filter and open operations separately. The last
six-site run had **23 verified operations / 25 attempts**, with two abstentions
(MDN result discovery and Stack Overflow loading/verification). A subsequent
targeted MDN run after the tested root-order fix passed **5/5** operations.

| Site | Latest measured result | Restrictions / abstention |
|---|---|---|
| Wikipedia | 5/5: inspect, search, scroll, inspect, open visible article | Fulltext search normalizes `ns0=1`; special namespaces excluded |
| GitHub | 5/5: inspect, repository search, scroll, inspect, open visible repository | Signed-out public set only; no issue/account operations |
| MDN | 5/5 targeted follow-up: inspect, search, scroll, inspect, open documentation | Async results must render; open components compete with header menus |
| USAJOBS | 6/6: inspect, search, remote filter, scroll, inspect, open announcement | Job applications, resumes and saved searches remain excluded |
| DuckDuckGo | 3/3: inspect, search, inspect | `ia=web` normalization; external result navigation excluded |
| Stack Overflow | 0/1 in last full run: loading blocked | Human verification/Cloudflare also observed in earlier visits; no challenge interaction or bypass |

**Wrong actions:** zero unexpected destinations were observed among verified
operations; fixture unsafe handlers recorded no effect. This is not a statistical
wrong-action rate, and unknown outcomes are never counted as successes. Earlier
passes had unverified normalized URLs, absent results and loading interruptions;
their reports were retained, not folded into a favorable percentage. Original
Google/YouTube real-site acceptance remains in the Phase 2 section below.

**Maintenance:** this phase needed two explicitly reviewed normalization cases,
GitHub's current search-header marker, MDN's open-component result selector and
USAJOBS `data-search-result` links. Large menus required main/body root priority;
fixtures reproduce those changes. New sites reuse query/name/freshness logic but
still need site-specific route/selector evidence. No unknown effect classifier
was relaxed to obtain a passing result. Search/open measurements here range from
roughly 0.7–3.2 seconds in individual visits; they are not p95 or voice latency.

**Additional browser:** installed Edge **156.0.4314.50** loads the extension in an
isolated profile. Its separate fixture passes native pairing via the documented
Chrome-registry fallback, Google and Wikipedia search, acknowledged Stop before
revocation, and revocation's paused/cleared state. An initial test incorrectly
expected a removed grant to retain fence acknowledgement; that expectation was
corrected, preserving reload/reconciliation when injection is denied. Public
Edge permission prompts, browser selection/launch, store identity and its full
live/regression matrix remain unaccepted. Firefox/Safari are untested.

Reports are ignored artifacts: `phase6-full-browser-results.json`,
`phase6-navigation-large-page-results.json`, `phase6-final-focused-results.json`,
`phase6-native-results.json`, `phase6-live-catalog.json`,
`phase6-live-catalog-mdn.json` and `phase6-edge-adapter.json` under
`.test-artifacts/`. They contain explicit synthetic/public evaluation content,
not default application logging. No new local model or third-party code was
downloaded. Handy integration remains planned separately.

The local **0.6 portable package passed** startup/version/sandbox, hidden env-key
import, protected fake-key storage, eight unapproved catalog entries, bundled
guides/native helpers, packaged OCR, native host/extension pairing, verified tab
navigation, local wake/stop, native scan and acknowledged Stop. The package has
no user secrets or native fixture executable. All five executables are
**NotSigned**. Final guides are included in the refreshed ZIP/checksum manifest;
these remain ignored local artifacts, not a published release.

## Phase 5 evidence — October 31, 2026

Implemented for the **0.5 unsigned Windows developer preview**, limited to
source-isolated, reviewed YouTube thumbnail assets. [Visual setup](phase5.md)
describes the exact scope and remaining acceptance limits. This does not accept
full-screen capture or arbitrary visual computer control. Phase 6 has not started.

- `npm run check` passes type checking, **66 unit/boundary tests** and desktop/
  helper builds. Visual cases cover transient consent, denied/paused scope,
  frame/payload bounds, malformed geometry, invented/duplicate/action-bearing
  model output, OCR/layout ambiguity, no automatic navigation, stale checks
  before external inference, late OCR after Stop and loopback-only vision routing.
- A separate **21-flow browser/fixture suite passed**, with no skipped/flaky
  cases. Four new visual flows use the actual extension, native messaging,
  normalization canvas and Windows OCR. They exercise confirmed video navigation,
  private frame/password/overlay exclusion, recapture/scaling, scroll, replaced
  images, occlusion, grant denial, clarification, provider failure and a late
  visual response after Stop. Effects remain bound DOM navigation; no coordinate
  click API exists.
- The portable 0.5 executable passed startup/version/sandbox, protected fake-key
  storage, hidden development key import, packaged relay/extension pairing,
  verified tab navigation, local wake/stop startup, acknowledged Stop and desktop
  scan. The packaged OCR executable recognized the synthetic PIANO image from
  the package working directory, and visual consent starts off. All **five
  executables are NotSigned**. ZIPs/checksums are local preview artifacts;
  unrelated uncommitted planning documents were excluded from their docs.
- The capture fixture includes visible private text, a secure field and a denied
  frame beside the four approved images. Only the four matching public image
  URLs are fetched. Captured OCR contains none of those private sentinels.
  Denied image access and a fully covering unknown overlay result in **zero
  image fetches**. Minimal visual scope and bounded normalized JPEGs remain
  inside the existing 64 KiB relay limit. Permission/context invalidation clears
  consent and previews; native optional-prompt/revoke UX remains unverified.
- Image matching was benchmarked on four generated text/color/shape thumbnails
  arranged in a 2×2 layout. Labels are identical, so they cannot identify the
  correct image. Cloud shape tasks omit OCR text from the request. Expected
  results include unique targets, a missing target and multi-match clarification:

| Route | Controlled tasks | Correct match/clarification/abstention | Failures |
|---|---|---|---|
| Windows OCR + layout | 8 | 8/8 | 0 |
| Gemini visual, final candidate-set contract | 8 | 8/8 | 0 |

The final cloud set contains five unique matches, two clarifications and one
abstention. Successful request median/sample p95 was **2,250 / 8,519 ms**.
These are model request times, excluding capture/OCR and user confirmation.
The small controlled corpus exceeds the design's proposed 85% target for this
profile; it does not establish photo/person accuracy or broad icon reliability.

Earlier cloud evaluation recorded a timeout and seven provider-unavailable
responses. A later single-choice run completed but got **6/8** correct: it chose
one image for each ambiguous circle/square query. The visual contract now requires
all matching IDs, validates each and presents multiple matches for clarification;
the final live set above passed. Both earlier reports remain separate evidence.
There is no automatic product retry, provider switch or fabricated success.

Local Ollama protocol/capability/remote-model rejection is tested with controlled
responses; no installed vision model was available for live accuracy acceptance.
The Chrome fixtures use explicit install-time grants for positive cases and a
genuinely missing optional image grant for denial. No native permission prompt
was automatically approved. Real public-site thumbnail-layout coverage and the
new grant's native UI flow remain release checks. The known Phase 3 native focus
problem is unchanged; the full native-dependent evaluation is not claimed green.

Image/OCR captures are not persisted by the product. Ignored evidence includes
`visual-captured-fixture.json`, timestamped `visual-evaluation-*.json`, the initial
unavailable and single-choice reports, `phase5-browser-results.json`,
`phase5-final-visual-results.json` and `phase5-visual-preview.png`. Fixture images
are independently generated synthetic assets; only those public test images
were sent to the authorized Gemini key during this acceptance.

## Phase 4 evidence — October 31, 2026

Implemented for the **0.4 unsigned Windows developer preview**. This accepts
the opt-in session/control boundaries and publishes recognition limitations;
it does not establish dependable voice-only interruption in noisy rooms.
See [phase4.md](phase4.md). Phase 5 has not started.

- Type checking and **57 unit/boundary tests pass**. New cases cover strict
  opt-in/target readiness, credential/model preflight, separate wake/stop
  readiness, no pre-wake inference, consecutive serialization, late ASR and
  action results after Stop, failed/blocked commands, reserved stop text,
  stale-session audio/events, microphone loss, missing frames, detector startup
  failures, idle/total limits, bounded utterances and local-model settings.
- A separate browser/fixture invocation passed **17 integration flows**,
  including four new hands-free flows. The real Windows local detector stopped
  delayed fake cloud ASR without late insertion, and stopped an actual Chrome
  edit while verification was deliberately withheld. The already-issued edit
  remained, uncertainty required inspection, and releasing the late verification
  did not restore the session. Consecutive commands, idle wake privacy, actual
  renderer capture cleanup on a simulated track disconnect, and terminating the
  owned detector process were exercised. Cloud responses were controlled fixture
  responses; these tests do not claim new live Gemini acceptance.
- In that integration run, spoken Stop was observed **2,537 ms** after playback
  of a **1,890 ms** synthetic WAV began during delayed ASR. The verification case
  observed Stop at **2,582 ms** from playback start; the subsequent executor-fence
  check completed in **10 ms**. The latter is an additional observation after
  Stop, not an exact isolated IPC latency measurement or a rollback claim.
- Full `npm run evaluate` is **not green**: its seven native fixtures again
  failed at the pre-edit Windows focus check inherited from Phase 3, so the
  dependent 17 browser tests did not run in that invocation. The separate
  `--project=chrome-and-fixture --no-deps` run above establishes their results.
  No focus guard, acceptance assertion or test was skipped to obtain a pass.
- The portable 0.4 executable passed startup/version/sandbox checks, protected
  fake-key storage, hidden development key import, matching extension pairing,
  a verified Chrome tab operation, bundled offline stop/wake startup, idle wake
  without command transcription, microphone-off session state after Stop,
  desktop-agent scan and acknowledged executor fences. Visual review verified
  the session controls; active app/wake choices reflect main's actual session,
  and microphone readiness waits for real input frames. All **four executables
  are NotSigned**. ZIPs and SHA-256 manifests remain local preview artifacts.

The real offline recognizer was `MS-1033-80-DESK` (en-US), using separate
System.Speech processes with confidence thresholds 0.55 for Stop and 0.75 for
wake. **42 streamed synthetic cases** used Zira/David desktop voices, near
matches, overlapping voices, silence, a tone and digital replay:

| Detector | Clean phrase detections | Clean misses | False matches on 14 clean negatives | Expanded positive detections |
|---|---|---|---|---|
| stop assistant | 2/2 | 0/2 | 2/14, both “stop assistance” | 2/4; missed overlapping speech and one later digital replay |
| hey Latham | 2/2 | 0/2 | 0/14 | 2/3; missed overlapping speech |

Clean successful detections arrived **559–596 ms (Stop)** and **485–610 ms
(wake)** after the recognizer-reported acoustic end, using wall time against
stream audio position. This includes input batching/recognition delivery and
is separate from executor cancellation. The sample is too small for general
accuracy or latency claims. A replay miss does not establish spoof resistance:
the detector has no speaker authentication, and identical content was detected
earlier. Background voices and playback remain practical risks. Physical
microphone hands-free speech, real speaker/room echo, accents and multilingual
accuracy remain unverified. Phase 2's microphone insertion evidence is separate.

Local base.en on the same **eight fixed clean Phase 2 phrases**:

| Configuration | Exact phrases / failures | Word error rate | Median / sampled p95 |
|---|---|---|---|
| 2 threads, no vocabulary | 8/8; 0 failures | 0% | 4,040 / 4,443 ms |
| 4 threads, no vocabulary | 8/8; 0 failures | 0% | 3,162 / 3,504 ms |
| 2 threads, vocabulary hints | 8/8; 0 failures | 0% | 4,753 / 6,965 ms |

These are individual short CPU runs, with development checks also running;
they are not a controlled resource benchmark. Two threads trade latency for
CPU headroom and remain the new default. Hints did not improve this already
correct corpus. Model preflight reads metadata/header before spawn and catches
missing/invalid paths or English-model language mismatch; it does not make
Whisper resident or establish faster cold inference. Completion/cancellation
releases the ASR process. No new model/runtime/package downloads occurred.

Ignored evidence: `detector-evaluation.json`, `handsfree-interruption.json`,
`handsfree-verification-stop.json`, `speech-evaluation-base.en-*.json`, the native
failure report, `phase4-e2e-results.json`, `preview-acceptance.json`, signature
statuses, UI capture and fixture traces under `.test-artifacts/`. Test audio is fixed
public/synthetic material; raw audio is never persisted by the product itself.

## Phase 3 evidence — October 31, 2026

Implemented for the **0.3 unsigned Windows developer preview**, limited to the
Notepad configuration and operations in [phase3.md](phase3.md). Phase 4 has not
started. Broader app coverage, signed distribution and mixed-DPI hardware are
not implied by this evidence. The final foreground-focus recheck limitation is
recorded below alongside the earlier passing runs.

- `npm run evaluate`: **46 unit/boundary tests and 20 integration flows passed**,
  with no skipped or flaky cases in the accepted run. Seven native flows cover
  approval/block/revoke, exact field binding, literal edits, correction/undo,
  user edits, replaced controls, wrong fields/windows, secure/read-only fields,
  reactive changes, stalled providers, worker/supervisor loss, restart and shared
  transcript insertion. The original 13 Chrome/fixture flows remain passing.
- Regression tests first reproduced late successful replies restoring a binding
  after Stop, including a verification-observer continuation. Generation checks
  now fence both paths. Failed settings writes neither grant consent nor clear
  uncertainty. Supervisor loss leaves Stop unconfirmed; its worker watchdog and
  explicit restart/inspection recovery were exercised without mutation replay.
- The native fixture benchmark verified **100/100** operations, **0 wrong
  effects**, **226 ms median / 251 ms p95**. A stalled in-flight edit received
  confirmed Stop in **136 ms**. The edit was already present before Stop and
  remained a documented uncertain effect; the test does not claim rollback.
  These are fixture/controller measurements, separate from ASR or broad app
  compatibility.
- Real Notepad 11.2607.14.0 on Windows 11 Home 10.0.26100 passed scoped
  focus/inspection, replacement, append, correction, undo and actual speech
  insertion using both base.en and Gemini. A successful synthetic-speech run
  took **3,980 ms local / 2,198 ms cloud**, including insertion. A later local
  run also verified insertion with Latham's own window in foreground, exercising
  the return-to-review path rather than relying on Notepad retaining foreground.
  These are individual clean synthetic en-US samples, not latency percentiles
  or new physical-microphone accuracy evidence.
- Earlier Gemini checks returned provider-unavailable errors; a later failed
  recheck recorded HTTP **503**. No transcript was inserted, no automatic retry
  occurred and no local/cloud route was substituted. Successful cloud evidence
  and availability failures are retained separately.
- Native fixtures initially lacked a stable foreground when browser windows
  took it. The harness now activates its own editor before preparation, and
  native flows run before Chrome fixtures. The helper's foreign-window checks
  remain enforced. The microphone test waits for actual synthetic PCM callbacks
  rather than assuming capture has started after a fixed sleep.
- A final native-only recheck failed all seven cases at preparation because
  Windows refused editor foreground focus; a single-case recheck did likewise.
  No editor mutation was dispatched. Explicitly focusing Latham before worker
  startup did not resolve it and that test change was removed. The earlier
  passing 20-flow report remains historical evidence, not a claim that the
  final recheck passed. Foreground activation remains an intermittent preview
  limitation; select the intended editor manually and prepare again.
- The 0.3 portable executable passed packaged startup/version/sandbox, protected
  key storage, hidden development key import, matching extension/relay pairing,
  verified Chrome tab operation, bundled desktop-agent scan and acknowledged
  Stop. The package excludes secret files and the native test fixture. All three
  executables have Authenticode status **NotSigned**. ZIPs and SHA-256 manifests
  are generated locally. A real Notepad launch also completed with clean app
  shutdown after isolating the fixed app launch from inherited executor pipes.
- Window movement and **1.5x fixture-layout scaling** passed on one physical
  monitor (96 logical DPI reported by the fixture). Live mixed-DPI/multi-monitor
  hardware is unverified. Phase 2's physical-microphone acceptance remains
  separate from Phase 3's native binding, simulated capture and real-provider
  synthetic-speech evidence.

Ignored evidence includes `native-benchmark.json`, `native-cancellation.json`,
`native-display.json`, `native-live-acceptance.json`, timestamped native live
reports and `e2e-results.json` under `.test-artifacts/`. Live acceptance uses only
an explicitly prepared blank or known synthetic Notepad document; it does not
send native document text to a provider. See the setup guide for reproduction
and the exact English plain-text profile limits.

## Phase 2 evidence — October 30, 2026

Accepted for the **0.2 unsigned Windows developer-preview channel**, with the
exact supported operations and installation/recovery rules in [phase2.md](phase2.md).
This is not a signed production installer, general browser coverage or desktop
automation acceptance.

- `npm run evaluate`: **39 unit/boundary tests and 13 integration flows passed**.
  The seven new page flows cover actual native messaging, root-document binding,
  literal dictation, append/replace/correct/undo, duplicate clarification, unsafe
  and secure controls, user edits/focus loss, replaced nodes, late model replies,
  reactive page changes, uncertainty persistence and button-driven recording.
- The repeated-operation fixture benchmark verified **100/100** supported DOM
  operations, with **0 wrong effects**, **122 ms median / 154 ms p95** controller
  latency. This is a repetition test over two small reviewed profiles, not 100
  independent websites or an ASR-inclusive latency claim. Routed-origin fixture
  manifests use explicit test install-time grants; production optional prompts
  and actual websites were accepted separately.
- Live signed-out Google and YouTube workflows passed with both configured
  routes, including real provider final transcripts inserted into reviewed
  fields. The final 44-operation navigation recheck verified **43/44**:
  cloud configuration 21/22, local configuration 22/22. One changing YouTube
  document stopped safely without an invented success. Google Images filters
  passed on both routes after the off-screen search-form verification fix.
  Known commands were deterministic in both configurations; these numbers do
  not measure model semantic selection accuracy.
- Live navigation/effect median/p95 on successful final-recheck operations:
  cloud configuration **382 / 3,836 ms**, local configuration **268 / 3,260 ms**.
  These include website network load and exclude transcription time.
- Google presented one CAPTCHA; the user completed it manually. Latham stopped
  at that challenge and required reconciliation. No verification bypass occurred.
- The user verified the **physical microphone → local base.en → reviewed
  transcript → Chrome field** path. The initial attempt exposed an already
  suspended binding and disabled insertion. A new explicit Prepare Search step,
  correct window-versus-field focus handling, stable transcript labeling and
  same-binding insertion checks resolved it; a button-driven regression and
  the user's repeat insertion both passed.
- The packaged executable passed startup/version/sandbox checks, hidden
  development-env import, DPAPI key storage, packaged host/extension pairing,
  verified tab operation, acknowledged Stop and absence of user-secret files.
  Actual Authenticode status is **NotSigned** for both `Latham.exe` and the
  relay. ZIPs and checksums are generated locally, not published automatically.

Speech benchmark on eight fixed **synthetic clean en-US** phrases:

| Route | Exact phrases | Request failures | Word error rate | Successful median / p95 |
|---|---|---|---|---|
| Local tiny.en, initial comparison | 7/8 | 0 | 10.5% | 1,466 / 1,740 ms |
| Local base.en, selected configuration | 8/8 | 0 | 0% | 4,596 / 5,772 ms |
| Gemini 3.1 Flash-Lite | 7/8 overall; 7/7 completed | 1 provider-unavailable response | 0% on completed requests; 10.5% counting failed request words | 3,152 / 36,951 ms |

The base model avoids the tiny model's “orchestral music” error, at a CPU latency
cost. On a separate sampled base.en run: **312,303,616 bytes** peak working set,
**825,774,080 bytes** peak private memory, **17.73 CPU seconds / 5.96 wall
seconds**, four threads, sampled every 100 ms. These are measurements, not
minimum hardware requirements or memory guarantees. The tested laptop is an
Intel i7-1065G7, 8 logical processors, 16 GB RAM, Windows 11 Home 10.0.26100.
The browser acceptance runtime is Chrome for Testing 156.0.8078.4; Chrome 120
is the API minimum, not a claim that every intervening release was tested.

The proposed sub-second voice latency and broad accent/noise accuracy targets
are **not achieved or established** by this corpus. Local-only request tests
prove no cloud inference fallback; the speech runtime now receives audio through
stdin, with no temporary WAV/transcript retention. One transient Gemini failure
was recorded without an automatic retry or route switch. Initial dynamic-page
and off-screen-field failures informed the current guards; their raw reports
remain separate from the final recheck.

Ignored evidence: `phase2-dom-benchmark.json`, `live-browser-evaluation.json`,
`speech-evaluation.json`, `speech-evaluation-tiny.json`, `asr-resources.json`,
`preview-acceptance.json`, `release-signatures.json`, `e2e-results.json` and the
preview ZIP/checksum manifest under `.test-artifacts/`. Do not overlap integration
or packaged acceptance runs: they share the current-user host registry key.

Remaining release decisions: signing/trusted distribution, project licensing,
broader hardware/browser/language coverage, and larger human speech datasets.
These limits are explicit in the preview channel; no later implementation phase
was started as part of this delivery.

## Historical Phase 1 evidence — October 30, 2026

Implemented setup and its reproducible commands are in [phase1.md](phase1.md).
The offline suite now has 36 unit/boundary cases and six integration flows
(four fixture flows plus real MV3/native-host tab controls and fake-device
microphone permission/capture boundaries). Run `npm run setup:browser` before
the integration suite. Close other Latham instances so the physical hotkey can
register; concurrent acceptance instances deliberately contend for that key.

Live provider evaluation used the public whisper.cpp `samples/jfk.wav` and
synthetic unique/ambiguous/missing candidate fixtures. Both Gemini
`gemini-3.1-flash-lite` and the local configuration produced usable final
transcripts and passed all three application-level candidate cases. The real
desktop flow also passed both routes, DPAPI ciphertext inspection, saved-key
reuse across restart, final-once preview and paused restart. No personal audio
or page contents were used in these provider checks.

| Route | Speech elapsed | Candidate elapsed (unique / ambiguous / missing) |
|---|---|---|
| whisper.cpp tiny.en + Ollama Qwen2.5 1.5B | 9.214 s | 9.481 / 8.245 / 7.990 s |
| Gemini 3.1 Flash-Lite | 3.329 s | 0.559 / 0.760 / 0.821 s |

These are individual runs under concurrent browser-test load on an i7-1065G7,
8 logical processors and 16 GB RAM, without discrete GPU use. Earlier isolated
speech runs took roughly 1.9–4.8 s. They are setup measurements, not latency
percentiles or a representative speech-accuracy benchmark. The local 0.5B
candidate missed a valid target; larger models still chose between duplicate
labels. Local indistinguishability checks therefore force abstention
independently of model output. One cloud comparison encountered a provider
availability error; no automatic retry or local-to-cloud fallback occurred.

Reports are ignored `.test-artifacts/provider-evaluation.json`,
`app-provider-acceptance.json`, `e2e-results.json`, and the interactive
`permission-acceptance.json` when that flow passes. Native integration caught
and fixed a synchronous duplex-pipe deadlock; the host now uses asynchronous
pipe handles. Tests verify actual returned tab identity/active state, not only
mocked Chrome responses. Navigation remains honestly reported as dispatched.

Interactive permission and physical-stop acceptance passed in a fresh visible
Chrome-for-Testing profile. The user approved Google Search; the authorized
native UI check approved YouTube. Assertions passed remembered restart without
reprompt, unapproved-origin denial, browser-side and Latham-side revoke,
disconnect/reconnect without replay, retained grants while paused, and physical
Ctrl+Alt+. changing an active Chrome session to a confirmed paused fence. The
new-site negative test serves synthetic content under a routed origin, avoiding
external DNS as a test dependency. No personal browser profile was used.

Native composed-window review also found and corrected fixture/setup overlap;
scrolling away now hides the separate fixture view. Real microphone recognition across speakers/noise,
stable-Chrome installation, additional languages/hardware, broad site tasks,
installer/signing and production distribution remain Phase 2 release work.

## Historical Phase 0 acceptance

**Result:** Phase 0 foundation accepted on October 30, 2026, after the checks
below. This is not acceptance of the Chrome MVP or later milestones.

## Reproduce

```powershell
npm ci
npm run setup:electron
npm run evaluate
```

At Phase 0, the evaluation command typechecked, ran contract/policy/storage tests, built
the app and ran actual Electron acceptance flows. That Phase 0-only suite
needed no separate test browser; the current suite also needs `setup:browser`.
Development setup could download dependencies/runtime binaries; that Phase 0
build had no connected external provider or website.

Tested environment: Windows, Node.js 22.13.0, npm 10.9.2, TypeScript 7.0.2,
Electron 45.2.0, Vitest 5.0.5, Playwright 1.64.1. Exact packages are locked.

## Evidence

| Check | Result |
|---|---|
| Shared TypeScript check and deterministic desktop build | Passed |
| 26 contract/policy/cancellation/privacy/storage cases | Passed |
| 4 real Electron flows | Passed |
| Native composed-window inspection | Passed: fixture visible in its separate view; command desk, settings and status legible |
| Physical Ctrl+Alt+. shortcut | Passed: Ready changed to Paused |
| Project whitespace/document links | Passed; 25 local links checked, with staged whitespace rechecked before commit |

The unit cases cover denied observation, paused authority, unknown/consequential
and secure-field blocks, ambiguity, boundary parsing, redaction, capture IDs,
serial dispatch, cancellation/revocation/reset, late results, unknown outcomes,
stale targets, old success markers, deadlines and persistence minimization.

The Electron flows cover:
1. Verified typing/search/filter actions, explicit ordinal disambiguation, effect
   blocks, secure/iframe redaction, runtime isolation and blocked external fetch.
2. A real edit with a lost response: unverified state, no silent continuation,
   and recovery after explicit fixture reset.
3. Stop across delayed/queued work, page replacement and scope revocation.
4. Saved consent with paused restart, and diagnostic content/clearing.

The unsafe fixture controls are also manually operable in the test, proving
that the negative cases prevent mutation rather than rely on inert controls.

## Reports and diagnostic data

`.test-artifacts/e2e-results.json` is the machine-readable Electron report.
Synthetic surface screenshots are saved there; failures retain traces. The
main renderer screenshot omits the separate native fixture view, so composition
was additionally checked through native window capture. Explicit test artifacts
are ignored by Git and may contain synthetic command/fixture contents.

Application diagnostics are separate: off by default, at most 50 metadata
events persisted when enabled, and clearable. Command text, page values,
snapshots and raw exception details are excluded. Test directories isolate
settings and browser state from the normal user profile.

## Gate and remaining scope

All Phase 0 roadmap items have implementation/evidence. No microphone capture,
AI call, Chrome extension connection, real-site automation or native-app control
is claimed. Real-site tasks and the full cloud/local speech configurations are
Phase 1–2 acceptance work. Product-wide latency/recognition targets remain
proposed until representative hardware and audio tests exist.

Use the design's result semantics: a clarified search filter differs from a
blocked application submission; secure fields have no P0 typing override; an
unknown dispatch cannot be retried as though nothing happened.
