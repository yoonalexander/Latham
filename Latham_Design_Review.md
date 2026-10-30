# Latham design review

Reviewed October 30, 2026 against `Latham_Design_Document.md` version 1.0. Document line numbers below refer to that version. The original design is unchanged.

The architecture is a sound direction for a Windows voice assistant: deterministic commands first, structured observations before vision, and authorization outside the model. It is ready for a focused feasibility prototype. The **implementation-ready MVP** status is premature until the execution, permission, cancellation, and release contracts below are settled.

This is a design and selected-source review, not a runtime evaluation or a full security audit. P1 means resolve before exposing the affected capability to real user applications; P2 means resolve before treating the MVP specification as complete.

## Findings

### 1. P1: Generic UI actions do not yet have an enforceable consequence policy

**Design locations:** sections 5.5 and 8.1, lines 247–254 and 369–376.

The policy distinguishes drafting, submitting, purchasing, and deleting, but the executor mainly receives `click`, `insert_text`, and shortcuts. A button labelled “Continue” can submit an order; a textbox change can save remotely without a separate Submit button. A current target ID proves which control was selected, not that its effect is low risk. Page-provided labels and model confidence cannot establish that effect.

**Recommendation:** Define a concrete supported-action policy. Classify effects locally using trusted adapter/site knowledge where available. Treat unknown effects conservatively: block them in the first release, or require confirmation that accurately describes the uncertainty. Do not claim that arbitrary-site drafting is side-effect-free. Give the first release a small set of supported surfaces and explicit exclusions. Confirmation creation and consumption must belong to the local controller; the model's `request_confirmation` variant must not be the authority for deciding whether confirmation is necessary.

**Acceptance evidence:** A misleading button label, implicit submission, autosaving field, and generic shortcut cannot bypass the same consequence rules as an explicit send/submit operation. Changing the destination, content, or target invalidates approval.

### 2. P1: UIA and vision fallback could bypass a denied browser origin

**Design locations:** journey B, FR-06, sections 5.3 and 11.1; lines 98, 141, 210–217, and 531.

The extension has per-origin restrictions, while unavailable extension access leads to UI Automation fallback. The design does not distinguish “adapter unavailable” from “site access denied.” Reading the same page through UIA, OCR, or a screenshot would defeat a browser-only denial. A Chrome-level app grant is also too broad to establish consent for every page inside it.

**Recommendation:** Enforce app/site scope before observation as well as before mutation, consistently across adapters. Preserve explicit denial reasons. A denied origin remains denied under UIA and vision; when browser origin or frame identity cannot be established, stop and request user intervention. Cross-origin frames need their own scope checks.

**Acceptance evidence:** Revoke access, remove the extension, navigate to a denied origin, and embed a denied cross-origin frame. None of these paths may expose content through another adapter or execute against it.

### 3. P1: The voice-stop guarantee lacks a listening path during execution

**Design locations:** FR-10, sections 5.6–5.7, and evaluation; lines 145, 276, 291–295, and 511.

The lifecycle resumes listening after execution and audio feedback. The requirement nevertheless says Stop works during transcription, planning, and execution. If the command microphone is inactive, a spoken stop cannot reach cancellation. Dictation reserves “stop dictation,” while the global meaning of “stop” is not resolved. A token also cannot retract input already delivered to an application.

**Recommendation:** Specify cancellation separately from ordinary speech routing. Keep a global hotkey/tray stop available in every state. For hands-free operation, define an independent local stop detector that remains active during planning/execution, including the playback policy; alternatively narrow the voice-stop promise explicitly. Define dictation escape phrases and a way to dictate those phrases literally. Invalidate the turn and pending confirmations, discard late provider responses, and check cancellation at every executor dispatch boundary.

**Acceptance evidence:** From the instant cancellation is accepted locally, no further mutation is dispatched. Already-dispatched effects are reported accurately. Exercise delayed transcripts, late model responses, held confirmation, repeated dictation, and a stalled helper. Document the speech-detection delay separately from dispatch cancellation.

### 4. P1: Phase 1 dictation depends on grounding scheduled for Phase 2

**Design locations:** action contract, dictation rules, and phase plan; lines 253, 264, 308, 474, and 480.

`insert_text` requires a current snapshot and element ID, and the specification promises secure-field exclusion and intentional field selection. Phase 1 includes dictation, but Phase 2 introduces the observation schema and helpers that make those guarantees possible. Checking only that Chrome is foreground cannot distinguish a search box, message composer, address bar, or password field.

**Recommendation:** Bring a minimal field observation/execution adapter into Phase 1, or move external-app dictation into Phase 2. Bind a dictation session to an exact field and revalidate each insertion. Pause on focus or document changes. Define append versus replace, cursor/selection handling, and correction behavior. “Undo last insertion” should undo only an identified assistant edit after validating that the user has not changed it; a blind global Ctrl+Z is insufficient.

**Acceptance evidence:** Change focus mid-utterance, open the assistant UI, replace the page, select a secure field, and manually edit before requesting undo. Text must never land in a different field or erase unrelated work.

### 5. P2: Chrome's `activeTab` grant needs a real extension invocation

**Design locations:** sections 8.2, 9.3, and 13; lines 387, 461, and 559.

The architecture calls for active-tab-first access, but its primary activation is an Electron hotkey. Chrome documents temporary `activeTab` access as following user invocation of the extension, with access revoked on navigation to another origin. An Electron-side voice session should not be assumed to grant that permission. This affects the new-tab/YouTube/LinkedIn demo. [Chrome activeTab documentation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)

**Recommendation:** Choose and prototype the permission journey now: an extension invocation grants temporary tab access, or onboarding grants specific optional host permissions. Specify navigation, revocation, reconnect, and restricted-page behavior. Native messaging is a reasonable first transport to test, with a registered host and restricted extension origins; it still requires desktop/extension installation and identity handling. [Chrome native messaging documentation](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)

**Acceptance evidence:** From a fresh Chrome profile, complete installation, permission grant, navigation to a second origin, revocation, and recovery without broadening permissions silently.

### 6. P2: Shared contracts cannot yet express several promised behaviors

**Design locations:** sections 5.4–5.5, 6.2, 7.4, and the demo; lines 223–261, 312, 363, and 579.

The action union lacks app launching, option selection/toggle operations, text replacement/correction, and the distinct send operation described in section 6.2. Several could be deferred, but that must match the release promise. Shortcuts and scrolling lack explicit context binding. The result contract combines `success` with a boolean `verified`, while section 7.4 requires an unverified outcome. It also cannot clearly distinguish a mutation that definitely failed from one whose effect is unknown after a timeout.

**Recommendation:** Finish only the contracts needed for the chosen release. Give every executable action a locally owned ID, turn/session identity, exact target context, preconditions, and verification rule. Browser targets need frame/document identity in addition to tab/window identity; include relevant state and visibility checks. Separate dispatch outcome from verification outcome, and explicitly represent unknown effects so they cannot trigger automatic retry. Specify how a target is restored and checked after confirmation UI takes focus. Keep app launching allowlisted rather than accepting arbitrary executable paths.

**Acceptance evidence:** A same-tab navigation, rerender, confirmation-focus change, timed-out click, and late reply cannot reuse an invalid target or produce a false success. Deferred capabilities are removed from the first-release demo.

### 7. P2: MVP scope and offline acceptance disagree across sections

**Design locations:** modes, requirements, phases, and test matrix; lines 82, 140–148, 474–496, and 530.

Complex tasks are P2 in the mode table and P1 in FR-13. Both UIA and the extension are P0, although the introduction calls the extension optional. The offline test says local shortcuts still work, but the first speech provider is cloud-only and local ASR is deferred. The executor can remain local while newly spoken commands remain unavailable offline.

**Recommendation:** Name a single first-release milestone and map each P0 requirement and demo step to it. A practical first public release is a polished Phase 2: Windows/Chrome, push-to-talk, basic navigation, grounded field entry and clicking, local policy, cancellation, and verification. Label Phase 1 a preliminary milestone. State that hotkeys/typed commands and cancellation remain available offline; new voice commands require local ASR if offline voice is promised. Hands-free need not wait for vision if it becomes the next priority; neither is a technical prerequisite for the other.

### 8. P2: The native helper needs a failure and recovery contract

**Design locations:** sections 9.3 and 11.1; lines 460 and 527–531.

Request IDs and timeouts are a good start, but the design does not say what happens when a UIA call stalls, a helper disconnects after dispatch, or a process restarts with work outstanding. Retrying an unresolved mutation can duplicate it. Microsoft also documents UIA threading hazards and recommends a separate non-window-owning MTA thread for desktop-wide clients. [Microsoft UIA threading guidance](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-threading)

**Recommendation:** Keep UIA work off the helper's UI/control path, bound observation size and duration, and allow the controller to abandon/restart an unresponsive worker. Invalidate snapshots and approvals on restart; never replay mutations automatically. Treat lost execution acknowledgements as potentially applied, then reacquire state. Test mixed display scaling and secondary monitors before enabling coordinate fallback. The existing warning about elevated apps is correct: SendInput is restricted by integrity level. [Microsoft SendInput documentation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput)

## What Capri contributes

Sources inspected at Capri commit `6eaf523a956d39b33c963f63e64fa37f517fbad1` and jev-use commit `b22e568adf110eeb64f89bf4d731a69d23c461dc`. These are source observations, not validated product benchmarks.

| Reference | Useful contribution to Latham | Boundary |
|---|---|---|
| [Capri Desktop](https://github.com/lachydotmcg/capri-desktop/tree/6eaf523a956d39b33c963f63e64fa37f517fbad1) | Windows-native implementation details: UIA targets and desktop actions, mic diagnostics, speech lifecycle, and local ASR. | Companion behavior and broad automation are different product goals. Do not import its authority model as Latham's policy. |
| [jev-use](https://github.com/savka777/jev-use/tree/b22e568adf110eeb64f89bf4d731a69d23c461dc) | Accessibility-first read/choose/act/check loop, bounded target choices, literal dictation, and evidence-based completion. | macOS-specific APIs; its README says wake detection uses Apple Speech and may process audio online. It does not establish offline Windows wake behavior. |
| [HeyClicky](https://www.hiclicky.com/) | Resident-assistant presentation, onboarding, and interaction inspiration. | The public product page does not establish its internal implementation or Latham's performance targets. |
| OpenAI, Microsoft, and Chrome documentation | Provider contracts and platform constraints. | API capabilities and permissions still need integration tests on the target machine. |

Specific Capri files worth studying:

- [Computer.cs](https://github.com/lachydotmcg/capri-desktop/blob/6eaf523a956d39b33c963f63e64fa37f517fbad1/app/Computer.cs): UIA target representation and input dispatch. It also contains a permission-bypass mode and label-based risk heuristics; those are poor foundations for Latham's stricter guarantees. The inspected action path includes coordinate clicks and fixed delays, which do not demonstrate verified completion.
- [Dictation.cs](https://github.com/lachydotmcg/capri-desktop/blob/6eaf523a956d39b33c963f63e64fa37f517fbad1/app/Dictation.cs): explicit microphone/privacy failures and recognition lifecycle. Windows online speech and a selected custom mic are distinct integration concerns.
- [Ears.cs](https://github.com/lachydotmcg/capri-desktop/blob/6eaf523a956d39b33c963f63e64fa37f517fbad1/app/Ears.cs): a local Parakeet/sherpa-onnx recognition path. Treat it as a candidate to benchmark against cloud speech, including model download, memory, startup, language coverage, and endpointing costs.
- [Windows build script](https://github.com/lachydotmcg/capri-desktop/blob/6eaf523a956d39b33c963f63e64fa37f517fbad1/ci/build-windows.ps1): Capri's Windows build uses .NET Framework 4.8 and Windows Forms references. It is not an Electron/.NET 8 reference application; adapt concepts instead of assuming code drops into the proposed helper.
- [License](https://github.com/lachydotmcg/capri-desktop/blob/6eaf523a956d39b33c963f63e64fa37f517fbad1/LICENSE.md): the repository declares PolyForm Noncommercial 1.0.0 and required credit notices. Record those constraints before deciding to copy code or assets. Use independently implemented patterns for the current design exercise.

Capri strengthens the case for the proposed Windows helper. It does not, by itself, justify replacing Electron or adding a mascot, persistent personality, screen commentary, or unattended jobs to the MVP.

## API assumptions checked

The named OpenAI APIs are current in the official documentation reviewed:

- `gpt-live-transcribe` is the documented starting model for live transcription. Its transcription session does not support server/semantic VAD, so the proposed client-side VAD or push-to-talk boundary is appropriate. It provides no transcription confidence scores. Add turn/item reconciliation, reconnect handling, and late-final-transcript rejection to the implementation contract. [Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)
- Decisions supports bounded choices with `gpt-6-luna`. The document's fallback choice and application-specific confidence calibration are appropriate. Its illustrative selection JSON should be labelled an internal contract rather than a complete vendor request. [Decisions guide](https://developers.openai.com/api/docs/guides/decisions)
- The [computer-use guide](https://developers.openai.com/api/docs/guides/tools-computer-use) is useful integration context, but a typed-tool system acting in a user's ordinary desktop still needs its own concrete policy and verification contract.

## Recommended next revision

1. Change the status to “proposed architecture; feasibility and execution contracts pending.”
2. Resolve findings 1–4 and make the first-public-release boundary consistent throughout.
3. Run one small vertical slice: push-to-talk → final transcript → explicitly permitted Chrome page → grounded field action → verification, with hotkey cancellation and no planner or vision.
4. Validate fresh-profile extension permissions and helper failure recovery before expanding app coverage.
5. Add Capri to section 15 with its role, inspected commit, selected files, and license note. Preserve jev-use as the accessibility/decision-loop reference and HeyClicky as product inspiration.
6. Report baseline success, wrong-action, abstention, intervention, and latency figures separately. Keep the proposed targets labelled as targets until measured.

No code, reference binaries, or model downloads were executed. Runtime latency, recognition quality, site compatibility, and real cancellation timing remain unverified.
