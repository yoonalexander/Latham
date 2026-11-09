# Latham: Voice-First AI Desktop Assistant

**Technical Design Document**  
**Version:** 1.23\
**Date:** November 2, 2026\
**Status:** Phases 0–9 retain their published scope; Phase 10A–10C universal Windows implementation preview and controlled Gemini/native acceptance are in place; Phase 10D physical voice, wider native-app/display and packaged acceptance remain open\
**Platform:** Windows 11 first; extension-free foreground computer use in the Phase 10 development route\
**Product name:** Latham

**Project roadmap:** [roadmap.md](roadmap.md) defines the full milestone sequence, including desktop applications immediately after the Chrome MVP, expanding website coverage, and optional managed AI/commercial delivery. This document defines the implementation contracts; the roadmap defines delivery order. All milestones remain planned until implementation and acceptance evidence exist.

**Product-direction clarification — November 1, 2026:** The intended product is a universal, voice-driven Windows assistant that reads the current app/screen, reasons with AI, acts through Windows and verifies results. A browser extension must not be required for that primary experience. [Section 1.3](#13-universal-desktop-direction) and [the universal-desktop specification](docs/universal-desktop.md) define the new Phase 10 direction and supersede Chrome-first/extension-required choices for that future mode. The existing 0.9 requirements and guards below describe the narrow implemented foundation; they do not establish universal computer-use support and must not simply be removed to imply it exists.

> **Product thesis:** The keyboard and mouse should be optional for ordinary computer workflows. Users should be able to state an intent out loud, have the assistant identify the relevant on-screen controls, perform actions, and verify the result, while remaining in control of their computer.

## 1. Executive Summary

Latham is an independently developed resident Windows desktop application that translates natural speech into safe, verified computer interactions. A user can say "open a new tab and go to YouTube," "click the video with Ludwig in the thumbnail," "scroll down," "open LinkedIn Jobs and filter for recent software engineering positions," or "type this reply into the message box."

The system combines four complementary capabilities:

1. **Low-latency speech processing:** microphone capture, local voice activity detection, and streaming transcription.
2. **Structured environment observation:** a required Chrome extension for the first release, followed by Windows UI Automation for desktop applications, exposing interactive elements, roles, labels, state, and bounds.
3. **Tiered decision-making:** deterministic handling of known commands, bounded AI selection for ambiguous targets, and an optional full planning agent for multi-step workflows.
4. **Guarded execution:** type, click, scroll, navigate, and keyboard shortcuts through permission-checked adapters, with result verification and recovery.

The first release is **not** a general autonomous agent. It is a foreground, user-directed assistant for common desktop and browser actions. Truly hands-free interaction, visual description matching, and complex workflows are progressive capabilities, not prerequisites for initial usefulness.

The **first public MVP is the completion of Phase 2**: Windows-hosted, Chrome-only control; push-to-talk; deterministic Chrome navigation; grounded selection and dictation on a few supported websites; user-supplied API keys or a validated local-AI configuration; remembered per-site permissions; local policy enforcement; hotkey/tray cancellation; and verified results. Phase 1 is an internal voice/navigation milestone. **Desktop-application control is Phase 3, the next major milestone after the Chrome MVP**, and is not a first-release requirement. Unknown-effect actions, consequential submissions, and arbitrary-site message drafting are outside the MVP.

Use fixtures to develop and test the infrastructure, then validate a small real-site set before public release. The accepted preview supports signed-out English Google Search/YouTube workflows and Notepad document-text editing, with exact operations and limits in [Chrome setup](docs/phase2.md) and [desktop setup](docs/phase3.md). LinkedIn and other integrations can follow. Long-term coverage should expand to many websites, with every website as an ambition rather than an unconditional compatibility promise; permissions and platform boundaries continue to apply.

### 1.1 Key product decisions

| Decision | Rationale |
|---|---|
| Windows 11 host, Chrome-only MVP, desktop apps next | Validates browser usefulness before building general native-app control. |
| Electron + TypeScript desktop shell | Makes the UI, orchestration, settings, and model integrations easy to iterate. |
| Small .NET/C# Windows helper when needed | P0 may use a narrow launch/focus helper; general UIA observation and native-app control begin in Phase 3. |
| Accessibility/DOM before screenshot vision | Structured controls are cheaper to process, easier to validate, and often more reliable. |
| Fast path before large-agent path | Simple actions should not incur model planning latency. |
| Explicit pause and confirmation | Always-on audio and powerful OS control require visible, enforceable user authority. |
| User-supplied cloud keys or local AI | P0 supports a validated cloud configuration and a local configuration; managed Latham accounts/service come later. |
| Planned Handy speech backend | Integrate Handy's public transcribe.cpp library through a Latham-owned adapter; benchmark before replacing the current local default (section 6.1.1). |
| Remember explicitly approved websites | Per-site browser permission and Latham consent persist until revoked; neither permits idle/background observation. |
| Few websites first, broad coverage later | Validate useful real workflows before expanding toward general website support. |
| Deny unknown effects in the MVP | A valid control ID or plausible label does not establish what activating it will do. |
| One permission policy across all adapters | UIA, OCR, and vision must not circumvent browser/site denials. |
| Chrome-page dictation begins in Phase 2 | Field grounding precedes external text entry; desktop-app dictation follows in Phase 3. |
| Independent Latham implementation | Reference projects inform ideas and tradeoffs; none is the fork or imported foundation of Latham. |

### 1.2 Independent implementation and reference policy

Latham has its own codebase, architecture, product identity, and implementation. Capri, Clicky/HeyClicky, jev-use, and the other references remain available for learning general concepts, evaluating interaction patterns, and understanding platform constraints. Implement Latham from its own requirements and official platform/API documentation. Do not fork these applications or copy, port, closely translate, or ask an AI to rewrite their source, prompts, tests, or assets into Latham. Reference-derived notes should describe concepts and observable requirements in original wording, without reproducing implementation details.

This policy does not prohibit ordinary SDKs, packages, or platform libraries selected for Latham's needs under suitable licenses. Record direct dependencies and their licenses as they are introduced. Any later proposal to incorporate material from a reference project requires an explicit change to this decision and review of the material's terms; a permissive license alone is not a reason to import it.

Preserve the option for future private/commercial development under the Latham name. The project's distribution license and contribution terms remain a separate decision; this document does not select a license or promise that future versions will be public. Keep provenance clear so that reference use and independently authored implementation remain distinguishable.

### 1.3 Universal desktop direction

The user clarified that “assistant” means speaking an ordinary goal and having Latham identify and operate visible controls across applications. The released 0.9 speech, reviewed Chrome/Notepad actions and thumbnail matching did not fulfill this. The Phase 10 development route now adds generic foreground UIA/window-image observation, structured Gemini or local-model action proposals and a Latham-owned Windows input broker. Controlled synthetic native and extension-free Chrome checks pass; broad real-app and physical voice acceptance remains open.

Phase 10 adds a shared observe–decide–act–check engine with generic Windows accessibility and opt-in screenshot grounding, a Latham-owned bounded input executor, fresh window/display identity checks, per-action verification and independent cancellation. The extension becomes an optional aid for the new mode; its absence must not gate universal activation. This is a new explicitly consented route, not a fallback that bypasses existing denials. Cloud screen context requires consent separate from the stored speech key. Existing screen/target denials, secure-surface exclusions and consequential-operation gates remain enforceable. See [scope, architecture, acceptance and references](docs/universal-desktop.md).

**Companion approval policy — November 2, 2026:** Ordinary standalone Notepad/Calculator launches run directly after the one-time agreement and app-denial checks. A single explicit uniquely named control operation with matching payload, explicit scrolling or an allowlisted navigation key except Enter can also run directly; that grant does not cover extra model steps. Longer tasks ask once beside the companion, with Continue/Cancel and a 30-second expiry. Image-coordinate clicks always ask separately with a marked preview. Questions freeze the companion's position and never open a separate review window. Each input still needs fresh target checks and subsequent effect verification; Stop, uncertainty recovery and consequential-operation exclusions remain. This supersedes the universal preview's earlier blanket per-input approval requirement, without changing the legacy adapters' policies.

**Remembered setup policy — November 2, 2026:** First launch presents a versioned Latham terms-and-permissions agreement explaining explicit microphone activation, foreground accessibility text/field values, optional window images, browser control and selected-provider sharing. Universal access, images and browser inclusion are selected by default in that setup; the user can change them before accepting. Acceptance and chosen provider/scopes persist across normal updates and restarts, as does an explicit disable. Later launches open only the companion, ready for Ctrl activation. No microphone, observation or task starts merely because access is remembered. Existing app/site denials, unresolved effects, independent Stop and task/point confirmations remain enforced. The current portable preview uses first-run setup; a separate installer is not implemented.

“All apps” is the coverage ambition, not a promise that OS-protected, inaccessible or unsupported interfaces always work. A completion claim requires cross-app, extension-free and physical voice acceptance; a successful text-model key test or the completed narrow milestones is insufficient. Retain the independent-reference policy: jev-use informs the shared accessibility/action loop; a suitable Gemini model can provide reasoning/vision; neither supplies a working Windows control backend merely by adding a key.

## 2. Problem, Users, and Goals

### 2.1 Problem statement

Most computer workflows require users to translate clear intent into many low-level interactions: locating the correct control, switching focus, typing, scrolling, and checking that the intended screen appeared. Existing speech dictation handles text input, while voice-command software often requires rigid phrases. New AI computer-use systems can reason over interfaces but may be too slow, expensive, or unpredictable for simple everyday navigation.

The proposed assistant combines the predictability of traditional shortcuts with flexible natural-language interpretation. Its success depends less on whether a model *can* click a button and more on whether it does so quickly, safely, and consistently enough that the user prefers speaking.

### 2.2 Target users

- **Everyday computer users:** browsing, navigating, searching, switching applications, and drafting messages.
- **Multitaskers:** controlling windows while hands are occupied.
- **Accessibility-oriented users:** an additional input option, without claiming to replace specialist assistive technology or all physical input.
- **Power users:** invoking common workflows and shortcuts naturally.

### 2.3 Goals

- Support common single-step computer interactions using speech rather than physical input.
- Resolve target references such as "the Jobs tab" or "the search box" using the live UI state.
- Support efficient dictation into an intentionally selected text field.
- Support optional visual references, such as "the video with Ludwig in its thumbnail."
- Make each action inspectable, cancellable, and, where feasible, reversible.
- Allow users to choose push-to-talk, wake-word, or explicit hands-free sessions.
- Produce a clean, measurable foundation for multi-step workflows.

### 2.4 Non-goals for MVP

- Full replacement of a keyboard or mouse in every application.
- General desktop-application control or native-app dictation; these are the next milestone after the Chrome release.
- Latham-hosted AI accounts/billing or universal website compatibility; these are later roadmap capabilities.
- Unattended automation across arbitrary websites and accounts.
- Purchases, account changes, payments, message sending, file deletion, uploads, or consequential form submission, even with confirmation. Later releases may add reviewed, separately typed operations with exact-action approval.
- Reliably controlling games or latency-critical creative software.
- Bypassing operating-system security boundaries, login screens, CAPTCHAs, or elevated application protections.
- Building custom speech recognition or foundation models from scratch.
- Long-term autonomous learning from everything the user sees and says.

## 3. User Experience and Core Workflows

### 3.1 Operating modes

| Mode | Trigger | Behavior | MVP status |
|---|---|---|---|
| Push-to-talk | Configurable hotkey or tray control | Captures one utterance and executes one bounded command. | P0 |
| Dictation | "Start dictation" after selecting a supported field | Binds to that field; push-to-talk captures each insertion until exited. | P0, Phase 2 |
| Hands-free session | User explicitly enables session | Listens for successive commands, with activity indicator, timeout, and voice stop control. | P1 |
| Wake-word idle | Local wake detector | Waits for an opt-in phrase before enabling command transcription. | P1 |
| Complex-task session | User assigns a bounded objective | Executes a step-limited plan with visible progress and confirmation gates. | P2 |

**Important:** Always-on microphone access does not imply constantly recording or sending audio to a cloud provider. In idle mode, wake detection should run locally and retain no persistent audio by default. Speech is transmitted to cloud transcription only during an explicitly activated capture/session, unless the user selects a clearly labeled cloud-listening mode.

In P0, the global stop hotkey and tray control work independently of microphone, network, and provider state. Spoken cancellation is available only when capture is active; speech cannot interrupt execution while push-to-talk capture is closed. P1 hands-free mode requires a separate local stop detector before it can promise spoken interruption during work (section 5.8).

### 3.2 Primary journeys

**Journey A: Quick navigation**

1. User presses push-to-talk and says, "Open a new tab and go to YouTube."
2. Speech finalizes; the router recognizes a new-tab operation and explicit URL navigation, each with its own local profile and risk check.
3. The executor focuses the selected browser, opens a new tab, enters the allowed URL, and waits for navigation.
4. UI reports "YouTube opened" only after verifying a matching active tab or location. Inspecting or acting on the destination requires its current grants; an opened URL alone grants neither.

**Journey B: Grounded clicking**

1. User says, "Click Jobs."
2. The app verifies the active tab, current document, and Chrome/application grants before capturing permitted DOM controls. If the extension is absent, denied, or cannot establish the document identity, browser-content observation stops; UIA is not a bypass.
3. It creates a numbered, minimal snapshot of interactive targets.
4. The decision layer chooses a target or returns `CLARIFY`.
5. The local policy checks the proposed effect against an enabled action profile. The executor revalidates the target and invokes it only if supported; otherwise it reports `blocked`. A supported action is verified against its expected result, not merely any page change.

**Journey C: Visual reference**

1. User says, "Click the video with Ludwig in the thumbnail."
2. Text labels alone may not identify the intended video.
3. The visual adapter captures a scoped screenshot with explicit session permission, identifies candidate thumbnail regions, and uses image understanding to rank them.
4. The UI highlights a proposed video when ambiguity is high.
5. The assistant clicks only a grounded, current target and verifies navigation.

**Journey D: LinkedIn search**

This is a P2 workflow example, subject to a validated LinkedIn profile and current site permissions.

1. User says, "Go to Jobs, search software engineer, filter to the last 24 hours and Easy Apply."
2. The planner decomposes this into page navigation, text entry, and filter-selection steps.
3. Each step reads the current page, acts, then checks the resulting state.
4. User can use the global stop control at any point; spoken interruption also works when the P1 local stop detector is active.
5. The run ends with a report of applied filters and an explicit note if any filter was not found. The assistant does not automatically apply for jobs.

**Journey E: Message drafting**

This is a future integration example, not a P0 promise for arbitrary chat applications. Message sending remains blocked in P0.

1. User says, "Open Discord and write: I'll be there at seven."
2. A reviewed integration verifies the exact conversation and supported draft field before insertion. If typing can submit, autosave consequential changes, or has unknown effects, the action is blocked. Field labels alone cannot establish draft-only behavior.
3. User can say "change seven to eight."
4. In a later release with a dedicated send operation, "send it" creates a local pending action showing the recipient and exact draft. The app restores and revalidates the conversation and content after approval, then dispatches once. Any mismatch invalidates approval.

### 3.3 Interaction feedback

The default surface is a small transparent, non-focusing, click-through desktop companion that follows the cursor with a short offset. It displays three rounded vertical strokes, short–long–short, without a permanent panel. Idle has no microphone capture. Holding either physical **Ctrl** key alone for 250 ms starts push-to-talk under existing approved-app permissions. Release closes capture and processes exactly one utterance; pauses while held do not submit it. Quick taps, other keys, mouse clicks/wheels, missing releases, helper failure and Stop discard capture. Both Ctrl keys must be released when held together. Injected keyboard input cannot activate it, and no input is swallowed. **Ctrl+Alt+Space** or tray **Talk · one command** remains a separate silence-ended alternative. During listening, silence displays three dots and measured microphone energy extends them into bars. Three dots orbit during transcription/execution/verification. Completion returns to idle bars; blocked, failed or uncertain outcomes return to idle with a brief notice and retain review requirements. Reduced-motion mode uses static processing dots.

The follower samples only cursor coordinates for its own placement; it does not inspect the screen, grant access or alter the cursor. Work-area clamping supports negative monitor coordinates. The tray can pin it to the current screen edge or hide it; hiding/crashing the companion cancels work. **Ctrl+Alt+.** and tray **Stop** remain independent of the renderer, speech and provider. Repeating Talk while a turn is active stops it. Continuous hands-free mode remains a separate explicit settings opt-in.

Side switches use a 220 ms eased transition within one renderer layer, including the glyph and notice, with a 12-DIP return margin against boundary flicker. A reversal starts from the current visible position. Transparent click-through space contains both placements; the visible glyph remains small and ordinary cursor following stays immediate. Reduced-motion preference disables this transition. The native window is moved with explicit fixed dimensions to prevent cumulative Windows/DPI size drift.

The native Ctrl helper emits only fixed gesture/health states, never key codes, typed characters or mouse positions. Its local hooks pass events through. Parent loss closes it; startup with Ctrl already down requires a fresh press. Capture has a 15-second cap and does not execute on a timeout. Releasing while activation is still preparing invalidates it. Ctrl release also closes the local speech detector: spoken Stop is unavailable with the microphone off, while the independent Stop hotkey and tray remain active. Holding Ctrl during an already-processing command does not queue another command.

Configuration, reviewed push-to-talk transcripts, selected targets, detailed results, reconciliation and advanced fixture/workflow tools live in a separate **Settings** window, hidden on normal startup. Opening settings from the tray cancels current work. A narrow companion preload receives only presentation/capture state and can submit audio for its main-owned session; it cannot read credentials, change permissions or dispatch arbitrary commands. Audio-only media permission belongs to exactly one explicitly activated, visible window and its main frame. See [companion controls](docs/companion.md). Clicky and Capri inform the interaction direction; Latham's glyph, implementation and assets are independent.

## 4. Functional Requirements

Priority definitions: **P0** is required by the end of Phase 2 for the Chrome-first public MVP; **P1** covers subsequent product capabilities, with desktop apps first in Phase 3; **P2** covers later advanced capabilities. Phases 0 and 1 are internal milestones. The exact delivery order is in [roadmap.md](roadmap.md); priority labels do not override it.

| ID | Priority | Requirement | Acceptance condition |
|---|---|---|---|
| FR-01 | P0 | User can activate/pause capture with a global hotkey or tray. | Microphone state is unambiguous and changes immediately. |
| FR-02 | P0 | Speech-to-text produces an owned final utterance; streaming partials are an optional latency improvement. | Only a final transcript from the active turn can be offered for dispatch; duplicate or late events are ignored. Phase 1 requires explicit transcript review/run. |
| FR-03 | P0 | Router separates command, dictation, clarification, and non-command speech. | Unknown or incomplete instructions do not trigger speculative actions. |
| FR-04 | P0 | Deterministic common commands: allowlisted Chrome launch, tab navigation, scrolling, basic shortcuts. | Actions use known local profiles without a remote decision call when parameters are unambiguous; unknown effects are blocked. |
| FR-05 | P1, Phase 3 | Windows UI Automation adapter enumerates controls on supported desktop applications. | Native snapshots carry process/window identity and current control state; this adapter never circumvents browser-content denials. |
| FR-06 | P0 | Chrome extension enumerates controls on active documents of explicitly approved sites. | Remembered Chrome host permissions and Latham consent must both remain valid; each frame is independently scoped; revocation stops affected work. |
| FR-07 | P0 | Target-selection engine chooses a live target or asks to clarify. | Stale or missing targets never execute unchecked. |
| FR-08 | P0 | Phase 2 dictation inserts editable text into a supported Chrome-page field; native-app fields follow in Phase 3. | Each insertion checks field identity, focus, edit revision, and intended effect; focus changes pause dictation; undo cannot erase unrelated edits. |
| FR-09 | P0 | All actions are locally policy checked, logged minimally, and verified. | Unknown/high/critical effects are blocked in P0; unsupported effects cannot be approved through a generic confirmation. |
| FR-10 | P0 | Global hotkey/tray cancellation works during transcription, planning, or execution. | Controller stops issuing work immediately; executor cancellation fences prevent subsequent mutation dispatch; in-flight effects are reported separately (section 5.8). |
| FR-11 | P1 | Explicit hands-free sessions process consecutive commands with a local stop detector. | Detector stays active during transcription, execution, and verification; speech-detection delay and executor cancellation are evaluated separately. |
| FR-12 | P1 | Visual fallback resolves image- or layout-based references. | Ambiguous visual matches request target clarification; this does not authorize a blocked effect. |
| FR-13 | P2 | Bounded multi-step tasks coordinate observation, planning, and verification. | Per-run step/time budgets and visible progress are enforced. |
| FR-14 | P1 | Local wake-word activation is available as an opt-in. | Background speech is not sent to cloud STT while idle. |
| FR-15 | P1 | User can inspect an optional local activity history. | P0 already provides clearing for any retained diagnostics; raw audio/screenshot retention remains off by default. |
| FR-16 | P2 | Reusable user-approved workflow shortcuts. | Each shortcut is editable, scoped, and revocable. |
| FR-17 | P0 | Onboarding supports user-supplied API keys and a validated local-AI configuration, initially targeting Ollama for local text decisions. | Cloud credentials stay OS-protected; local decision and local speech components are configured/tested separately; no silent local-to-cloud fallback. |
| FR-18 | P0 | Site approvals are remembered and revocable. | An approved-site revisit/restart needs no repeat approval while both grants remain valid; a new site requires explicit approval, and Pause prevents observation despite stored grants. |

## 5. Architecture

### 5.1 Overview

```text
Microphone -> Local VAD / Wake Detector -> Streaming Speech Provider
                                            |
                                            v
                                        Final Transcript
                                            |
                                            v
                                    Intent / Mode Router
                                            |
                     +----------------------+---------------------+
                     |                      |                     |
                     v                      v                     v
              Deterministic           Bounded Decision       Task Planner
                 Commands             (target choice)       (multi-step)
                     |                      |                     |
                     +----------------------+---------------------+
                                            |
                                            v
                                   Policy / Confirmation
                                            |
                                            v
                               Action Orchestrator / Queue
                                            |
                      +---------------------+------------------+
                      |                     |                  |
                      v                     v                  v
               Windows UIA Helper    Chrome Extension     Vision Adapter
                 + Input API          + DOM actions        (fallback)
                      |                     |                  |
                      +---------------------+------------------+
                                            |
                                            v
                                  Observe -> Verify -> Report
```

**Process boundary:** Electron controls application UI and orchestration. The Chrome extension can access only approved origins and communicates through a narrow authenticated local channel. A narrow P0 native host may launch/focus Chrome and relay messages; general UI Automation calls and desktop-app input are added in Phase 3 through a current-user, non-elevated helper. The diagram includes future UIA/vision/planner modules, not requirements to build them for P0. Cloud or local AI providers receive the smallest necessary sanitized observation and never unrestricted OS capabilities.

The diagram shows the action path. A scope gate also runs **before every observation**, including local UIA/OCR and screenshots. An independent hotkey/tray cancellation path reaches the controller and executors without passing through transcription, a model, or the normal command queue.

### 5.2 Major modules

| Module | Responsibilities | Preferred implementation |
|---|---|---|
| Desktop shell | Tray, settings, overlay, session control, shortcut registration | Electron main + React renderer |
| Audio engine | Capture, VAD, wake state, playback suppression, P1 independent stop detector | Native/Web Audio capture + local VAD/keyword detector |
| Transcription provider | Partial/final transcript events and local utterance completion | User-key cloud transcription or a separately validated local ASR backend |
| Intent router | Mode switching, deterministic parsing, clarification | TypeScript rules then bounded decision |
| Observation service | Snapshot current permitted surface and target state | Chrome DOM in P0; Windows UIA in Phase 3; later scoped vision |
| Decision provider | Select a candidate from provided IDs or abstain | User-key cloud adapter or local Ollama structured output, normalized to one contract |
| Planner | Break multi-step goals into typed, bounded next actions | Responses API through tool contracts |
| Policy engine | Pre-observation scope checks, reviewed effect profiles, authorization, budgets | Local deterministic TypeScript rules |
| Executor | Validate target, enforce focus, dispatch operations, cancel | Native helper/Chrome extension |
| Verifier | Compare expected versus observed changes, classify errors | Programmatic assertions; model fallback |
| History and telemetry | Local non-sensitive activity summaries and timings | SQLite, opt-in diagnostics |

### 5.3 Observation priority

1. **Chrome DOM:** prefer semantic element role, accessible name, text, checked state, and field type when inside a user-authorized tab.
2. **Windows UI Automation (Phase 3):** read current foreground native-app controls with name, control type, automation patterns, bounding rectangle, focus, and enabled state.
3. **OCR and local UI detection (later):** use only if structural sources are missing or incomplete.
4. **Vision model (later):** use for genuinely visual concepts, ambiguous thumbnails, icons, and image semantics, with consent and tightly scoped screen capture.

**Do not:** continuously send full screenshots for every command, blindly click stale coordinates, or assume that web page text is a trusted instruction.

The priority list selects an adapter only **after** the same scope policy has allowed the surface. A narrow local identity query may obtain process/window identifiers and browser-supplied tab/origin/frame metadata needed to check scope; it must not collect page labels, values, titles, images, or model context before that check. If the broker cannot establish identity within its available permissions, stop. Permission errors are typed as `denied`, `grant_required`, `identity_unknown`, or `adapter_unavailable`; they must not be flattened into “try another adapter.” Denials take precedence over app-level grants. Revocation increments a permission epoch, invalidates queued actions/snapshots, and discards late observations before any model transmission; already transmitted data cannot be recalled.

**P0 browser decision:** browser content is observed and controlled through the extension only. An absent or denied extension does not enable UIA, OCR, or screenshot fallback. P0 has no general native-app UIA adapter; narrow Chrome window/tab commands use a separately identified browser-chrome surface. Phase 3 native UIA remains scoped to supported native applications. Later browser fallbacks require a trusted current origin/frame identity and the same grants; inability to establish identity is a stop condition.

Origin grants apply separately to the top-level document and each observed frame. DOM collection omits ungranted frames. A later screenshot path may capture only regions demonstrably free of denied content; if frame/overlay boundaries cannot be excluded reliably, block capture of the whole surface. A screenshot permission never overrides an app/site denial. A reconnect or new document requires fresh identity and permission checks before reading content.

The Phase 5 preview implements a deliberately narrower **source-isolated
thumbnail capture** path. With per-session consent, YouTube approval and a separate
optional image grant, only public JPEG assets belonging to reviewed video links
enter an isolated canvas. It never captures the viewport/desktop and therefore
does not read denied frame, overlay or form pixels for later redaction. Missing
source/target proof blocks capture. Windows OCR/layout or an explicitly selected
Ollama/Gemini visual provider returns bounded candidate-ID sets. Multiple matches
clarify; a unique match proposes an outline. A separate user action opens only a
freshly validated reviewed video URL through the existing navigation gateway.
Scroll/zoom/mutations/occlusion/replacement, lost grants and Stop invalidate
pending authority. No coordinate click or provider fallback is introduced.
[Visual setup](docs/phase5.md) and [evaluation](docs/evaluation.md) distinguish
the controlled text/color/icon/layout results from unproven general photo/person
matching and full-screen capture.

### 5.3.1 Phase 6 website expansion

The 0.6 preview compiles eight exact approved origins and read-query recipes from
one shared catalog: Google, YouTube, Wikipedia, GitHub repositories, MDN,
USAJOBS, DuckDuckGo and Stack Overflow. Shared semantics resolve bounded labels,
visible results and open shadow roots; effect authority remains in reviewed URL
and control profiles. Newly added fields are focus-only. Search constructs a
known read URL without invoking page submit/input handlers; USAJOBS remote/all
filters never authorize an application, upload or saved search.

Root-only observation remains the default. Explicit `inspect frames` may read
bounded supported-control counts from at most four visible same-origin child
documents with reviewed paths. `open frame N` revalidates node, child Document,
URL and root scope before opening the reviewed frame URL in the main tab. It
does not mutate the child. Cross-origin, hidden, srcdoc, inaccessible, nested
and unreviewed documents remain excluded, regardless of other site approvals.

Dynamic/recycled controls require current identity and fingerprints. Closed
components and unrendered virtual rows remain unsupported. Navigation must
match the expected loaded URL and a reviewed page marker after URL stability;
only explicitly reviewed normalization parameters are accepted. Unexpected
changes pause or produce an unknown outcome without replay. Per-site consent,
active epochs and Stop still gate all observations and actions.

[Coverage setup](docs/phase6.md) and [evaluation](docs/evaluation.md) publish live
versus fixture support, restrictions and maintenance. An isolated Edge experiment
does not change Chrome's supported-browser status. General workflows and
consequential operations remain Phase 7; Handy remains separately planned.

### 5.4 Snapshot contract

A snapshot is ephemeral and bound to the application/process instance, target window, browser session/tab/frame/document when applicable, grant/permission epoch, executor epoch, and capture timestamp. Element IDs are **not global** and must not be reused across captures. Capture and dispatch both verify visibility, enabled state, relevant control state, and identity; a timestamp alone never proves freshness.

```json
{
  "snapshotId": "snap_0142",
  "capturedAt": "2026-10-29T15:30:00-04:00",
  "source": "browser_dom",
  "app": "Chrome",
  "windowId": "window_4",
  "browserSessionId": "browser_1",
  "tabId": "tab_9",
  "frameId": "frame_0",
  "documentId": "document_17",
  "origin": "https://www.linkedin.com",
  "grantId": "grant_7",
  "permissionEpoch": 3,
  "executorEpoch": 1,
  "elements": [
    {"id": "e1", "role": "link", "name": "Home", "enabled": true},
    {"id": "e2", "role": "link", "name": "Jobs", "enabled": true},
    {"id": "e3", "role": "textbox", "name": "Search", "enabled": true}
  ]
}
```

Element names, text fields, and images must be redacted or omitted when the content is sensitive. Trim element sets to visible/relevant candidates, respecting model input limits and user-granted scopes.

The JSON illustrates identity fields; production element records also carry role, accessible name, supported operations, enabled/visible state, bounds, and a local control-state revision. Native records carry process-instance identity instead of browser fields. Browser navigations, detached/replaced controls, changed revisions, permission revocation, and executor restart invalidate affected bindings. A fresh snapshot may be acquired, but the executor must not silently substitute a similarly named target for an invalid one.

### 5.5 Action contract

The orchestrator accepts typed proposals only. The model may suggest an operation and observed target; it cannot create grants, set risk classifications, authorize itself, or decide that confirmation is unnecessary. Model output is **never** executed as unrestricted shell commands, browser JavaScript, or arbitrary operating-system code in the user's normal desktop session.

The following is an internal contract, not an OpenAI request schema:

```ts
type ActionProposal =
  | { kind: 'open_app'; appId: 'chrome' }
  | { kind: 'open_url'; url: string }
  | { kind: 'shortcut'; command: 'new_tab' | 'close_tab' | 'back' }
  | { kind: 'scroll'; direction: 'up' | 'down'; units: number }
  | { kind: 'click'; elementId: string }
  | { kind: 'focus'; elementId: string }
  | { kind: 'select_option'; elementId: string; optionId: string }
  | { kind: 'set_checked'; elementId: string; checked: boolean }
  | { kind: 'insert_text'; elementId: string; text: string;
      editMode: 'append_at_end' | 'replace_all'; expectedEditRevision: string }
  | { kind: 'undo_text'; elementId: string; editId: string;
      expectedEditRevision: string }
  | { kind: 'submit_search'; elementId: string };

// Constructed locally after resolving the target and applying policy.
// The opaque handles resolve to controller-owned records, never model data.
type AuthorizedAction = {
  actionId: string;
  sessionId: string;
  turnId: number;
  proposal: ActionProposal;
  contextHandle: string;       // launch allowlist, exact window or document
  snapshotId?: string;         // required for element operations
  authorizationHandle: string; // grant/epoch, profile, effect and preconditions
};

type ActionResult = {
  actionId: string;
  dispatch: 'not_dispatched' | 'dispatched' | 'unknown';
  outcome: 'verified_success' | 'failed' | 'blocked' | 'cancelled' | 'unverified';
  editId?: string;
  reason?: string;
};
```

Every operation, including shortcuts and scrolling, binds to an exact context; app launch binds to its local allowlist entry rather than a nonexistent target window. The local authorization record contains the current permission/executor epochs, reviewed profile version, allowed effect, bounded arguments, relevant preconditions, and verification rule. Validate all fields at the IPC boundary; opaque handles are not authorization without lookup and ownership/epoch checks. The executor rechecks context, authorization, and cancellation immediately before the final adapter call.

Allowlisted URL schemes are initially `https:` and `http:` for explicit user-directed navigation. New-origin navigation can open a page but does not grant permission to inspect or control its content. App IDs resolve through a local launch allowlist; arbitrary executable paths are excluded. Clipboard copy/paste and unrestricted key chords are omitted from P0. Closing a tab with unsaved content or unknown effects is blocked. Search submission is a reviewed, read-query operation; it is never implemented as an unrestricted Enter key in whichever field has focus.

`verified_success` requires observed evidence matching the verification rule. A timeout or lost acknowledgement after possible dispatch yields `unverified` with `dispatch: 'unknown'`, not an automatic retry or a claim that nothing happened. `cancelled` describes stopped work, not rollback; report any dispatched or unresolved effect explicitly. Later send/upload/account operations require separate typed contracts and exact-action confirmation; they cannot be smuggled through `click` or `submit_search`.

### 5.6 Simple command lifecycle

1. **Activate:** user explicitly requests voice capture.
2. **Transcribe:** stream partial text for feedback; dispatch only after the active audio turn is committed and its final transcript is accepted.
3. **Route:** map to known command, dictation, target choice, or planner.
4. **Observe:** validate current scope/grants, then obtain the minimum permitted current UI state if required.
5. **Decide:** produce a typed action or clarification, never executable free-form instructions.
6. **Authorize:** resolve a reviewed effect profile and enforce app/site policy locally; block unknown or excluded effects. Future confirmed operations enter a controller-owned approval state.
7. **Execute:** perform one operation against a freshly validated target.
8. **Verify:** observe result; report success, recovery, or failure.
9. **Listen again:** in P0, wait for the next push-to-talk activation. In P1, resume ordinary command transcription after execution; the independent local stop detector remains active throughout.

### 5.7 State machine

```text
DISABLED -> IDLE -> LISTENING -> TRANSCRIBING -> ROUTING
                                  |              |
                                  |              +-> CLARIFYING
                                  |              +-> PLANNING
                                  |              +-> CONFIRMING
                                  |                     |
                                  +---------------------+-> EXECUTING -> VERIFYING
                                                                    |          |
                                                                    |          +-> IDLE / LISTENING
                                                                    +-> ERROR
ANY ACTIVE STATE --Stop/Pause/Cancel--> CANCELLING --> PAUSED
IDLE --Pause--> PAUSED
```

The session controller owns one action queue, one cancellation token per turn, and a monotonic turn ID. A superseded turn cannot execute queued actions. The executor serializes UI mutations; observation may run concurrently only when it cannot race against active mutations. `CONFIRMING` is reserved for later reviewed operations; P0 blocked effects have no approval override. Stop or Pause leaves the assistant paused until an explicit user activation. Scope revocation initiates the same cancellation path for affected work and advances its permission epoch; it cannot leave previously authorized queued actions running.

### 5.8 Cancellation contract

Cancellation has three observable boundaries, because a controller and an out-of-process executor cannot retract an operation already sent to an application:

1. **Request received:** the controller invalidates the turn, stops issuing actions, clears queued work and pending approvals, closes the command stream, and ignores late transcript/model results. The UI shows **Stopping**.
2. **Executor fence:** a priority cancel message invalidates the session/turn at every active executor. Each executor checks this fence on its serialized dispatch path immediately before each UI mutation, including each chunk of a text insertion. Queued IPC requests cannot execute after this fence. An adapter call already begun is in flight and may still take effect.
3. **Acknowledged:** all active executors acknowledge the fence; the UI shows **Paused** and reports completed, cancelled, and unresolved actions. If an executor is unresponsive, show that cancellation is unconfirmed, stop/replace the worker as appropriate, and require reconciliation of possible effects before permitting more automation. Restart never replays pending work.

Tests assert no new mutation invocation after the executor fence, and no new controller action issuance after receipt. Measure request-to-fence acknowledgement and speech-end-to-request latency separately. Do not label a stuck executor “stopped” solely because a local token was cancelled.

P0 guarantees hotkey/tray interruption in all active states without cloud access. Spoken “stop” is routed only during an active command capture. P1 hands-free additionally requires a small independent **local** detector for the reserved phrase “stop assistant,” active during transcription, planning, execution, and verification; it can only cancel and never authorize an action. In the initial hands-free implementation, assistant TTS is disabled while that detector is active, avoiding a playback window in which interruption would be unavailable. If the detector or mic fails, end hands-free mode, initiate cancellation, and retain hotkey/tray controls. Speaker spoofing/false stops and recognition misses remain measured limitations, not grounds for a 100% speech-recognition promise.

The Phase 4 preview implements separate Windows System.Speech offline en-US
fixed-grammar processes for stop and optional “hey Latham” wake. Main owns
session IDs, bounded PCM/VAD state, single-command routing and generation fences.
Wake waiting never reaches command ASR; command capture pauses during inference
and verification while local stop audio continues. Sessions end after 90 seconds
idle/five minutes total, or on mic/detector/session failure. No assistant TTS is
enabled. The narrow synthetic corpus includes missed overlapping-speech stops
and false matches for “stop assistance”; physical controls remain essential.
[Phase 4 setup](docs/phase4.md) and [evaluation](docs/evaluation.md) define exact
behavior and distinguish recognition delay from executor cancellation.

## 6. Speech and Intent Design

### 6.1 Recognition strategy

The companion now shows a provisional local transcript during active speech.
Gemini key mode now streams explicitly active utterance audio to Google's
`gemini-3.5-transcribe-live`, using one bounded main-process WebSocket session.
The same recognizer supplies interim words during speech and committed text
after the local release/speech-end boundary; no second batch request is made.
Interim/model-response text cannot authorize actions. Only the final committed
transcript enters the existing task policy. Stream setup/final deadlines,
buffer/audio/message limits and cancellation generations bound the lifecycle.
Failure stops the turn without a silent model/provider fallback. The model is
free-tier eligible under Google's published account limits; quotas and actual
key availability are not guaranteed. Controlled synthetic checks are recorded
in evaluation; human accent/noise and wider physical acceptance remain open.

Local/managed mode retains the separate Windows System.Speech display-only
dictation worker and the chosen Whisper/managed final provider. Preview failure
there does not disable final recognition. Fixed Stop/wake/approval workers remain
local and separate. No wake-idle audio reaches transcription, and local-only
mode never opens a cloud socket. No model downloads, transcript files or acoustic
adaptation are added. Final text expires after eight seconds; Stop/new activation
clears it immediately. Handy integration below remains planned.

P0 offers two user-configured paths: a cloud provider using the user's API key, or local AI without a required paid provider key. The historical Phase 1 route uses Google Gemini `gemini-3.1-flash-lite` for completed-recording transcription and target selection, following the user's free-tier-key choice. Its batch path remains available to separately scoped service/standalone adapters. The current desktop Gemini speech route is the live recognizer above; decision/computer models remain separate. Push-to-talk release remains the local dispatch boundary. No partial transcript can authorize an action.

Reconcile provider item IDs with the local session/turn; local ASR adapters must produce equivalent locally owned turn/final events. Accept each final once. Reconnect, cancellation, and stream failure invalidate outstanding turn mappings. A late final must not enter a new dictation session or execute after a pause. An internet outage disables a cloud-only voice configuration; a validated local configuration continues supported local commands and can operate on loaded pages, but cannot load remote website content offline. Tray/hotkeys and typed local commands remain available in either configuration.

A local ASR backend is part of the P0 local voice path, not a promise inferred from installing Ollama. The Phase 2 preview selects whisper.cpp v1.8.2 Windows x64 CPU with Whisper base.en (English, four threads) and Ollama Qwen2.5 1.5B. Base.en improved the fixed synthetic corpus over Phase 1's tiny.en, at a latency cost. Audio/transcripts now use bounded memory-only stdin/stdout rather than temporary files. Terms, hashes, hardware, physical microphone acceptance and separate cloud/local measurements are recorded in [Phase 2 setup](docs/phase2.md) and [evaluation](docs/evaluation.md). The small clean corpus does not establish broad accent/noise accuracy, minimum hardware or the proposed sub-second voice targets. Do not conflate open model weights with a hosted model identifier.

### 6.1.1 Planned Handy speech integration

**Decision: use Handy's transcription stack in a future local-speech upgrade. Status: planned; implementation and acceptance have not started.** Integrate the public `transcribe-cpp` library through its official TypeScript/Node binding in a Latham-owned child process. Keep Latham's Electron shell, microphone/session ownership, routing, permission checks, field-bound dictation, independent stop/wake detectors, and execution/verification contracts. Handy remains a reference application under section 1.2; this plan selects an ordinary library dependency, without importing Handy application code, assets, or its internal worker protocol.

The [Handy adoption review](docs/handy-upstream-review.md) records the inspected source versions and rationale. Handy's reviewed source uses a newer engine stack than its downloadable release; pin and validate the actual library, native runtime, and model artifacts selected during implementation. The current preview continues using whisper.cpp base.en. This future speech workstream remains separate from the roadmap's capability sequence.

Implement the upgrade in bounded steps:

1. **Optional backend first:** add an explicit local-backend/model choice with migration for existing Whisper settings. Start with one English Parakeet candidate, initially Parakeet Unified EN, using batch recognition with a model retained between turns. Final model/quantization and device selection depend on measurements; model loading must not activate the microphone. Preserve the existing Whisper route as a user-selectable option and prohibit silent cloud fallback.
2. **Owned worker and lifecycle:** pass bounded in-memory 16 kHz PCM to an independently authored child process, converting PCM16 to the library's float32 input. Serialize inference, bound model lifetime/resources, expose loading/readiness/failure, and support deadlines, cancellation, worker termination, and explicit recovery. Preserve existing turn/session generation fences; accept one final per active turn and discard late or cancelled results. Partial and engine-committed text are feedback only. No temporary audio/transcript files, persistent dictation history, clipboard insertion, or new action authority are introduced.
3. **Same-machine comparison:** replay the existing corpus and add representative physical-microphone commands/dictation, names, negation, punctuation, silence, noise, and background speech. Measure cold loading, warm median/p95 transcription, speech-end-to-verified-action latency, peak memory, and CPU use with stop/wake detectors active. Establish CPU results first; measure any supported Vulkan device separately. Published Handy/engine figures are motivation, not Latham acceptance evidence. Retain current utterance boundaries initially; evaluate streaming and endpoint tuning separately after the batch baseline.
4. **Packaging and failure validation:** package the binding, native addon, and Windows runtime/backend files with the portable executable. Test startup without development tooling, missing/invalid models, worker hangs/crashes, Stop during loading/inference, field/permission changes, and stale results after cancellation/restart. Verify no regression in microphone opt-in, local-only behavior, independent interruption, or bound edits. Record exact library/model versions, hashes, licenses, attribution, and explicit download sizes before distribution.
5. **Promote after acceptance:** make the new backend the recommended local route only when it gives a material, repeatable latency improvement on the target laptop, acceptable cold-start/resident resource use, representative recognition at least as useful as the current route, and passing cancellation/privacy/packaged-operation checks. Update setup, dependency provenance, decisions, and evaluation with actual evidence. Keep the current default if these gates fail; no sub-second or broad accuracy claim follows from adoption alone.

### 6.2 Mode selection and utterance routing

- **Command mode:** interpret "open," "scroll," "click," "switch," and other imperatives.
- **Dictation mode:** each push-to-talk utterance is text except the exact standalone controls “stop dictation” and “undo last insertion,” and the explicit correction prefix “replace text” (for example, “replace text seven with eight”). Corrections require a unique current-field match and unambiguous old/new text; otherwise clarify without editing. The exact prefix “literal text” takes precedence and makes the rest literal, so “literal text stop dictation” inserts those words. Bare “stop” is text in this mode; the hotkey/tray always cancels. In P1 hands-free, “stop assistant” is globally reserved and cannot be inserted verbatim while its independent detector is enabled; use push-to-talk dictation for that literal phrase.
- **Clarification mode:** answer a narrow pending question, e.g., "the second one."
- **Hands-free mode:** accept multiple turns only while activated by the user.

Because "send" and "type" have different consequences, they must never map to the same operation. P0 can enter text only into supported fields and blocks requests to send. A later send integration may prepare a draft and request exact-action confirmation. For ambiguous speech, ask what the user intended rather than acting optimistically.

### 6.3 Field-bound dictation and editing

External text entry begins with supported Chrome-page dictation in Phase 2, after the DOM adapter exists. Desktop-app dictation follows in Phase 3 after native UIA grounding. Phase 1 transcribes into the assistant's own preview only. Starting dictation records the exact app/process/window, browser session/tab/frame/document where applicable, field identity, permission epoch, profile, and local edit revision. Secure fields are excluded; an ordinary textbox label does not establish that entry is safe or draft-only.

- P0 supports plain text fields exposed by reviewed profiles. `append_at_end` requires a confirmed collapsed caret at the end; `replace_all` requires an explicit replacement instruction and a matching prior field revision. Unsupported contenteditable/rich-text controls, unknown autosave effects, and unavailable caret/value evidence are blocked.
- Each insertion acquires a current observation and checks that the same field is focused, editable, non-secure, in scope, and unchanged since the expected revision. A focus event, document change, grant revocation, or opening the assistant/settings UI suspends the session and invalidates pending insertions, even if focus later returns. The user explicitly reselects/rebinds the field; the assistant must not guess where to type.
- Insert no implicit Enter, Tab, blur, or send shortcut. A known search uses the separate reviewed `submit_search` action. If the profile cannot rule out consequential effects from text entry itself, do not dispatch it.
- Verification records an ephemeral local edit ID and the minimum prior/post-edit value and selection needed for correction. A requested replacement must identify a unique range in the current verified field; otherwise clarify. In P0, the local editor computes the resulting plain text and uses `replace_all` only against the matching revision. “Undo last insertion” restores only that edit when the same field and exact post-edit revision still match. Manual changes invalidate it. Never substitute a global Ctrl+Z, which could undo unrelated work.
- Stop, field suspension, and permission revocation discard buffered/uncommitted audio and pending insertions. Ending the session clears transient edit contents; no persistent dictation history is implied. Physical user edits and OS focus races cannot be made atomic with generic SendInput, so P0 field entry uses targeted DOM/UIA editing operations where supported; blind keyboard/clipboard fallback is excluded.

### 6.4 Fast command examples

```text
"New tab"                 -> shortcut(new_tab)
"Scroll down a little"    -> scroll(down, 1)
"Scroll down three times" -> scroll(down, 3)
"Go back"                 -> shortcut(back), browser context only
"Open youtube.com"        -> open_url(https://www.youtube.com)
"Stop" in command capture -> cancel current turn/session action
```

Define grammar for frequent commands, synonym resolution, and bounded parameter ranges. Route any ambiguous phrase to the decision provider instead of inventing parameters.

### 6.5 User-supplied cloud keys and local AI

Onboarding offers **Use my API key**, **Use local AI**, or the optional **Latham-managed AI** local preview. Configure speech recognition and target decisions separately and show where audio and page context will go. Selecting local-only must not silently route either component to cloud services. Managed sign-in requires endpoint-bound routing consent, does not select the route, and uses a separately saved explicit choice. Provider keys stay server-side; DPAPI protects expiring invitation-account sessions. Billing is disabled. Managed vision is unavailable; visual routes remain separately chosen. See [Phase 8](docs/phase8.md) for exact service, retention, request-budget, cancellation/deletion and launch contracts.

- **User-key mode:** the user supplies credentials for the supported speech/decision adapter(s). Store keys in the OS-backed secret store, make calls from the main process, provide connection tests and clear authentication/quota errors, and expose request/time limits. Do not bundle a shared service key in the desktop or extension. Estimate/report usage only when the adapter can substantiate it; no price is promised here.
- **Local mode:** initially target an installed Ollama runtime with a locally executed text model for bounded target selection, plus the separate local ASR component in section 6.1. Onboarding checks runtime availability, model installation/capabilities, and a sample speech/selection task. Prefer a validated downloadable model with no required provider API fee; local compute/storage and model terms still apply. Any model download is explicit, showing size and provenance. Hardware requirements and the default model are selected after benchmarking, not assumed universal.
- The Ollama adapter uses the documented local chat endpoint and a JSON schema for candidate choice/abstention, then independently validates the result. Invalid schemas, fabricated target IDs, timeouts, and unsupported capabilities cannot dispatch actions. A valid JSON result is not evidence of a correct choice. Local models need not supply cloud-style confidence fields; choose clarification using the same candidate/evidence rules and adapter-specific evaluation.
- Local-only means inference and ASR execute locally; an Ollama cloud model or a remote server is not implicitly local. Default to a loopback endpoint. A custom remote endpoint requires explicit disclosure and opt-in. Model output still passes the same local scope, effect, epoch, cancellation, and verification gates.
- Validate at least one cloud-key configuration and one complete local voice/decision configuration before P0 release. Benchmark both on documented hardware; local/cloud performance targets are reported separately. Provider failure leaves the session paused or requests user action; it never silently switches data destinations.

## 7. Decision System and Agent Design

### 7.1 Three tiers

| Tier | When used | Action mechanism |
|---|---|---|
| Tier 0: deterministic | Fixed shortcuts, tab actions, bounded scroll, simple URLs | Local intent rules and typed actions |
| Tier 1: bounded decision | Select one of N observed targets, distinguish command/dictation | User-key cloud or local Ollama adapter chooses candidate IDs or abstains |
| Tier 2: bounded workflows | Reviewed multi-step search/filter/navigation goals | Implemented deterministic goal compiler and scoped typed executor; a general model planner remains future work |

Tier 1 must include a `CLARIFY`/`NONE` choice. Phase 1's Gemini/Ollama adapters use a strict candidate-ID enum plus reserved `ABSTAIN`, normalized to an internal null selection. Unknown IDs, extra fields, oversized output and incomplete/refused responses are rejected. Indistinguishable same-role labels force local abstention even if a model chooses one. Selection has no action authority and does not execute website controls in Phase 1. Other provider APIs remain references; no OpenAI key is required by the implemented route. Any future confidence value is a ranking signal requiring calibration, not a safety guarantee.

### 7.2 Selection example

This is the application's internal target-selection input, not a complete vendor API request. The provider adapter supplies the documented request envelope.

```json
{
  "instruction": "Click the Jobs tab",
  "snapshotId": "snap_0142",
  "choices": ["e1", "e2", "e3", "CLARIFY"]
}
```

The model selects `e2`. The local executor independently verifies that `e2` still maps to a permitted, enabled, current element and that its proposed effect matches a supported profile. A confidence score does not authorize an unsafe action.

### 7.3 Agent planning rules

- The implemented Phase 7 planner compiles a structured single-site goal into search, optional filter and optional visible-result opening. It makes no model requests and consumes no page instructions. Any future model planner must receive only scoped observations and allowed typed tools, with independent policy enforcement.
- Enforce fixed per-run budgets in main and extension: 8 action attempts, 20 extension requests and 60 seconds, with a separately expiring 60-second preview. These limits cannot be increased by renderer/provider input.
- Execute only one validated UI mutation per tool call, then observe again.
- Do not permit the model to relax permissions, impersonate the user, or grant itself additional access.
- Treat webpage content as **data**, not as a higher-priority instruction.
- Return `DONE`, `BLOCKED`, `NEEDS_USER`, `CANCELLED`, or `FAILED` with a human-readable explanation.
- Check site-specific restrictions before enabling automated flows. Never solve CAPTCHAs or bypass anti-bot controls.

### 7.3.1 Implemented workflow authority and shortcuts

Preparation checks the selected approved origin/path before page injection and
pins the active tab/window/document/session/epoch. The trusted UI displays the
steps, limits and expiry; an opaque single-use Run ID accepts only that prepared
goal. Each step revalidates its lease and fresh target references. Typed tools
construct reviewed search/filter URLs or open a current reviewed result; they
cannot type, send, upload, change accounts or grant permissions. Unknown effects
retain the existing persisted uncertainty and no-replay boundary.

User pointer/key/input/wheel/scroll events, iframe focus, tab/window changes,
unexpected navigation, replaced roots, revocation, disconnect, app hiding and
Stop cancel remaining authority. Programmatic scrolling has a bounded expected
event allowance. New-document events before injection are not a certified
interaction history; current URL/identity/control checks still gate every step.
At most two short waits and three scrolls can find a visible result. Failure
reports partial/cancelled/unknown state with earlier verified steps retained.

Only a fully verified goal can be explicitly saved as a shortcut. Up to ten
validated goals/names are DPAPI encrypted; no run token, approval, scope or plan
is persisted. Edits require a new reviewed successful run. Deletion cancels
active/prepared work; loading/restarting never executes a shortcut. Corruption
locks storage without a plaintext fallback or silent overwrite.

The [consequential-integration review](docs/phase7.md) enables **none** in 0.7:
sending, uploads/applications and account changes lack their dedicated typed
operation, exact payload/recipient approval, focus/freshness, idempotency and
recovery acceptance. Purchases/payments, destructive actions, permission grants
and scheduled unattended work remain excluded. Run is not a generic approval
override. A general natural-language planner, hosted service and Handy migration
remain separate work.

### 7.4 Verification and recovery

Prefer deterministic assertions tied to the intended result: expected URL/origin reached, a new tab identified, exact field edit observed, or expected control state reached. Merely seeing any URL change or receiving an input-API success is insufficient. If the effect is not observable, return `unverified` rather than claiming success. Unknown dispatch/effects are never automatically retried. A retry after a definite pre-dispatch failure requires fresh identity, scope, cancellation, and policy checks. Future consequential operations are never blindly retried.

## 8. Safety, Security, and Privacy

### 8.1 Action risk policy

| Risk class | Example | P0 handling |
|---|---|---|
| Low | Scoped observation, bounded scroll, new tab | Execute only in an active session with current scope and a recognized operation profile. |
| Medium | Explicit URL navigation, supported field entry, reviewed search/filter action | Execute within current scope after matching the local effect profile and preconditions; show feedback. |
| High | Send a message, consequential form submission, document upload, account changes | Block in P0; later releases need a dedicated operation and exact-action confirmation. |
| Critical | Payment, purchase, file deletion, credential exposure, permission grants to third parties | Block in P0; later support requires separate review and trusted authorization. |
| Unknown | Generic click/typing/shortcut whose effects cannot be established by an enabled profile | Block in P0; no “approve anyway” override. |

An **action profile** is reviewed local adapter/configuration code shipped with the application, not instructions extracted from a page or generated by a model. It specifies the supported surface, identity/control predicates, allowed operation and intended effect, argument bounds, preconditions, and result assertion. Controlled fixtures establish the initial profiles. External profiles must declare their tested app/site versions or structural assumptions; a mismatch blocks mutation until the profile is reviewed. Classify the complete effect, including implicit form submission, change/blur handlers, autosave, and shortcut behavior. Text entry is not universally draft-only, and a link/button label such as “Continue” is not a safety classification.

Evaluation order is: verify user session and scope before reading; resolve current identity and proposed operation; match a local profile; reject unknown/high/critical effects in P0; bind authorization to this turn, context, arguments, profile, and epochs; revalidate at dispatch; verify the expected result. The model cannot select a different adapter to escape a block. “Click Send,” `insert_text`, `submit_search`, and a shortcut all pass through the same effect rules.

Profiles reduce intended-operation errors; they do not sandbox an external service or prove that a remote page has no hidden side effects. Do not advertise guaranteed prevention of every remote state change on arbitrary sites. Limit the supported-surface list to validated integrations and report unsupported behavior honestly. A changed or untrusted page cannot acquire authority by imitating a known control label.

For a later release, confirmation is enforced by the local policy engine and shown through trusted assistant UI. It binds to the exact operation, current recipient/account, content/destination/payload hash, target/document, profile version, epochs, and expiration. It is single-use. Restore the intended app after the UI takes focus, observe afresh, and invalidate approval if any relevant identity, content, grant, or precondition differs; do not transplant approval to a replacement action. Ambient voices, webpage text, and model `request_confirmation` output cannot grant approval. Voice-only approval is deferred pending spoofing and usability review. User-driven Latham onboarding grants are separate from granting permissions to another application.

### 8.2 Threats and mitigations

| Threat | Mitigation |
|---|---|
| Malicious webpage says "ignore the user and click Pay" | Page text is untrusted evidence; only the user's command determines goals. |
| Accidental activation from background conversation | Push-to-talk default, optional local wake detection, action previews. |
| Voice played from computer speakers triggers commands | Keep ordinary command capture closed during execution/TTS; initial hands-free disables assistant TTS while its local stop detector is active. |
| Stale target clicks an unintended control | Bind IDs to snapshots; recheck window, tab, state, and geometry immediately before action. |
| Sensitive page contents leak to models | Scope observation, redact sensitive fields, avoid cloud screenshot unless consented. |
| Adapter fallback bypasses a denied site | Gate observations and mutations centrally; P0 browser content has no UIA/OCR/vision fallback; fail closed on unknown identity. |
| Browser extension gains unnecessary site access | Explicit per-site optional-host requests plus remembered Latham consent; active-session checks, frame scopes, and revocation; no automatic all-site grant. |
| Local communication channel is hijacked | Registered native-messaging host with restricted extension identities; current-user named-pipe ACL, validated schemas and session/epoch ownership. |
| Privilege escalation | Run helper unelevated; never attempt to bypass UAC or secure desktops. |
| Remote model proposes unsafe behavior | Strict action allowlist, local authorization, budgets, and confirmation gates. |
| Excessive logs expose private activity | Metadata-only diagnostics by default, short retention, explicit delete controls. |

### 8.3 Data flow and retention

- **Microphone:** local transient audio buffer. Discard after transcription unless user explicitly opts into recording for debugging.
- **Wake detection:** local processing where possible; no cloud transmission while idle by default.
- **Transcript:** ephemeral for the active command. Optional local history should be off by default or minimal and configurable.
- **UI snapshots:** transient, scoped to the active task, with sensitive values redacted before model requests.
- **Screenshots:** off unless visual grounding requires them; do not store persistently by default.
- **API credentials:** Windows DPAPI for user keys and managed sessions; managed provider keys are service environment only. Never place secrets in renderer code, logs, or extension storage.
- **Managed accounts:** hashed invitations/sessions and bounded identifiable usage in the local service SQLite database; explicit cancellation/deletion, anonymous global spend counters retained, provider retention separate. See [Phase 8](docs/phase8.md).
- **Provider configuration:** record the selected speech/decision routes and local model/endpoint settings; local-only routes must not fall back to cloud without a new explicit choice.
- **Website approvals:** persist per-site Latham consent locally, separately from Chrome's host grant. Remember permission choices, not page contents. Stored approval never enables idle capture or access to other Chrome profiles/incognito sessions.
- **Telemetry:** aggregate timing, failure categories, and action outcomes without recording page contents.

These retention defaults describe Latham's local behavior. Cloud providers receive active-session audio or sanitized observations as described by their adapter; provider-side processing/retention is a separate disclosed dependency, not erased by discarding local buffers. Dictation undo content stays transient and local and is cleared on session end or revocation.

Provide an obvious "Pause assistant" control, a per-app denylist, a per-site permission manager, and a one-click history deletion action.

### 8.4 Platform boundaries

Microsoft UI Automation coverage varies by application and developer implementation. The Windows `SendInput` API is constrained by User Interface Privilege Isolation and cannot be assumed to inject input into higher-integrity applications. Some secure dialogs, protected applications, DRM content, and embedded canvases will not be controllable by the standard adapters. These are surfaced as explicit limitations rather than bypassed.

## 9. Technology Stack and Repository Structure

### 9.1 Stack and later proposals

The current 0.9 preview uses Electron/React, lightweight JSON settings with
DPAPI-protected keys/sessions, Gemini or local speech/Ollama, and an optional
local managed speech/selection service with billing disabled. It includes the
Chrome relay, scoped Notepad supervisor/worker, independent wake/stop detectors,
thumbnail grounding and bounded read-query workflows. Its portable ZIP and
extension are unsigned. Public managed hosting, broader app coverage, trusted
signing and automatic updates remain gated future work.

| Layer | Choice | Notes |
|---|---|---|
| UI and tray | Electron + React + TypeScript | Disable Node integration in renderer; use context-isolated IPC. |
| Orchestration | TypeScript | State machine, action queue, routing, provider adapters. |
| Windows helper | Own C# .NET Framework 4.8 relay and desktop supervisor/MTA worker | Separate Chrome framing and scoped Notepad execution; no .NET SDK installation. |
| Browser helper | Chrome extension, Manifest V3, native messaging | Remembered user-granted per-site optional hosts plus Latham scopes; required for browser content. |
| Speech | Gemini user key, local managed Gemini, or whisper.cpp base.en | Routes chosen explicitly; narrow English corpus and hardware limits published. |
| Planned local speech upgrade | Handy's transcribe.cpp via official TypeScript binding in a Latham-owned child process | Future work under section 6.1.1; resident model and Parakeet candidate require local benchmarking and packaged acceptance. |
| Bounded decision | User-key cloud adapter, local managed service or local Ollama | Same validated target-choice contract; add other providers only when needed. |
| Optional managed service | Separate Node 22.13+ HTTP/SQLite service | Loopback preview, invitation accounts, server-only keys, transactional request limits; public launch gated. |
| Planner | Deterministic structured search-goal compiler and scoped typed tools | Optional reviewed workflow mode; 8 actions, 20 requests, 60 seconds; no model requests. |
| Visual grounding | Source-isolated YouTube thumbnails, Windows OCR/layout, opt-in local/cloud vision | Candidate-ID sets, explicit clarification/highlight/open; no viewport/desktop capture or coordinate click. |
| Local storage | SQLite or lightweight configuration store | Settings, approvals, optional history, metrics. |
| Packaging | Current portable Windows ZIP/unpacked extension; signed installer later | Version 0.9.0, native protocol 3; Latham binaries unsigned. |
| Testing | Vitest + Playwright; .NET tests as helper behavior requires | P0 browser/provider/IPC tests; native UIA fixtures and real-app tests in Phase 3. |

### 9.2 Repository layout

```text
latham/
  apps/
    desktop/                 # Electron main, React renderer, tray, settings
    chrome-extension/        # Scoped DOM observer and browser actions
  services/
    windows-helper/          # Narrow P0 host; Phase 3 UIA/native input
    managed-ai/              # Optional local invitation-account inference service
    release/                 # Offline manifest signing/verification; never installs
  packages/
    contracts/               # Shared types and validation schemas
    core/                    # Intent, orchestrator, cancellation, policy
    speech/                  # Transcription and VAD provider adapters
    decisions/               # Deterministic + Decisions/Jev selection
    planner/                 # Reviewed bounded search-goal compiler
    observations/            # Snapshot normalization and redaction
    actions/                 # Typed action executors and verification
  tests/
    fixtures/                # Synthetic pages; Windows test app in Phase 3
    e2e/                     # Scripted workflows and evaluation harness
    security/                # Permission and prompt-injection regressions
  docs/
    architecture.md
    decisions.md             # Architecture decision records
    threat-model.md
    evaluation.md
  .env.example               # Names only; no secret values
  roadmap.md                 # Whole-project sequence and milestone gates
  README.md
```

### 9.3 Communication interfaces

- Electron renderer communicates with its main process through a minimal, typed, context-isolated preload bridge.
- Main process communicates with the Windows helper through a current-user-restricted named pipe, with request IDs, session/turn identity, epochs, bounded messages, timeouts, and validation. Cancellation uses a priority control path and an executor-side dispatch fence.
- P0 browser transport uses a registered Chrome native-messaging host with restricted extension origins. Validate the installed extension identity and every message; a relay connects to the desktop controller through its restricted IPC. Page scripts cannot call this host as an authorized client.
- Model requests originate in the main process, never untrusted page scripts. The explicitly selected managed route passes bounded speech/selection through the separately authenticated service; its provider credentials stay on the server and it has no action authority.

**Chrome permission journey:** onboarding installs/pairs the extension. For a supported site, explain the requested access in extension UI and request its declared `optional_host_permissions` through a user gesture, then record Latham's per-site consent. Request only the particular scheme/host patterns needed for that integration; do not grant `<all_urls>` or wildcard subdomains by default. Chrome host-pattern scope and any additional Latham restrictions must be shown accurately. Permission choices persist across app/browser restarts until revoked. The Electron push-to-talk hotkey does not itself grant Chrome permissions. Temporary `activeTab` access may be an explicitly chosen one-session fallback, not the default remembered-permission mechanism. See references 14–15 for the optional-host lifecycle.

At observation and dispatch, require the intersection of Chrome's current grant, Latham's stored consent, the supported operation/profile, and an active user session on the intended tab/document. Revisiting an approved site does not ask again while those conditions hold; navigating to a new/unapproved origin asks for that site's approval before content access. A navigation/reconnect always creates fresh document identity even when site permission persists. Cross-origin frames require their own grants. Incognito and other Chrome profiles are outside P0; permission is not silently synced or extended to them.

Provide a website-permissions list with per-site revoke and clear-all controls. Revoke in Latham removes its consent and requests removal of the optional Chrome host grant; a Chrome-side removal also disables effective Latham access and cancels affected work. A stale stored consent must never silently re-request or reinstate a removed grant. On any inconsistency, mark the site unavailable until explicit reapproval. Pause/Stop prevents observation and execution even if host permission remains installed. Test persistence, approved-site revisits, new-site prompts, app/browser restarts, revocation from either UI, extension reinstall, and denied/missing frame identity. Restricted pages remain unsupported.

**Helper failure behavior:** on timeout/disconnect, distinguish a definitely undispatched request from an unknown-effect invocation. Discard snapshots, pending approvals, and outstanding work on executor restart by advancing its epoch. Never replay a mutation. Reacquire state and reconcile unresolved effects before resuming; if reconciliation is impossible, require user intervention. In P0 test native-host/extension disconnects and lost acknowledgements. Phase 3 adds UIA calls on a separate non-window-owning MTA worker, bounded tree traversal/deadlines, and stalled-provider tests; its control path must remain responsive.

## 10. MVP Implementation Plan

Public release requires completion of **Phases 0–2**, all P0 requirements, and section 14. No phase is accepted solely because actions appear to work: denied-scope, unknown-effect, cancellation, and wrong-field cases must pass before enabling external surfaces. Start with synthetic browser fixtures, then accept a few real website workflows. Publish the supported sites/operations and validated cloud/local configurations. P0 requires one user-key cloud path and one local voice/decision path; it does not require every provider, desktop UIA, vision, a planner, or managed Latham accounts. [roadmap.md](roadmap.md) is the full-project delivery plan.

### Phase 0: Foundation and evaluation harness

**Build:** repository scaffold, Electron tray window, settings, logging abstraction, action proposals/local authorization, permission epochs, dispatch fences, test webpages, and a small transcript/debug panel. Establish deny-unknown effect profiles and result/unknown-dispatch semantics before real browser mutations. Add provider interfaces and saved-site consent records; no general native-app test fixture is required yet.

**Done when:** a typed test command triggers a verified fixture action, unsupported effects/scopes are blocked, and cancellation prevents subsequent fixture mutations. The UI distinguishes Stopping, Paused, and unverified effects.

### Phase 1: Voice and deterministic controls

**Build:** microphone capture, push-to-talk, cloud-key and local-ASR transcript paths into the assistant's own preview, command router, allowlisted Chrome launch, narrow browser-chrome controls, and hotkey/tray pause/stop. Prove native-messaging pairing, optional per-site grants with remembered consent/revocation, and a local Ollama/cloud-key target-choice fixture. General native UIA grounding is deferred to Phase 3; Chrome-page dictation begins in Phase 2.

**Done when:** an evaluator can launch Chrome and perform supported browser-chrome actions using voice without decision-model calls for known shortcuts. Unknown speech/effects are blocked, late transcripts cannot execute, and physical cancellation works during stalled provider/IPC requests. Both speech paths produce reconciled final turns; local-only routing does not send audio/context to the cloud. Approved-site consent survives restart/revisit and revocation cancels affected work. No ungrounded text is sent to another app.

### Phase 2: Chrome grounding and first public MVP

**Build:** Chrome DOM observation/execution, snapshot/context schema, cloud/local bounded target selection, local action profiles, field-bound browser dictation and guarded undo, result verification, ambiguity/blocked UI, and host/extension restart reconciliation. Use targeted DOM field operations. Validate a small real-site set, initially targeting Google Search and YouTube search/navigation; publish only tested operations. Finish provider/site-permission onboarding and installation instructions.

**Done when:** fixtures and the published small real-site set pass labelled selection, bound text entry, reviewed search/navigation, clarification, denial, cancellation, and verification tests for each supported operation. Both validated cloud and local configurations complete representative tasks; performance is recorded separately. Real-site limits are visible, persistent consent/revocation works, and no native-app UIA or unvalidated-site success is implied. A fixture-only demonstration is an internal milestone, not the Chrome public-release gate.

### Phase 3: Desktop applications — next after Chrome

**Build (P1):** the Windows UIA helper and worker, native context/field snapshots, per-app permissions, targeted native actions, supported app profiles, and a Windows fixture app. Start with a simple editor workflow such as Notepad: open/focus, identify its text field, dictate/correct text, and verify the edit. Reuse the existing policy/cancellation/provider contracts without importing a reference implementation.

**Done when:** a small published desktop-app set passes real-app and fixture tests, including wrong-window/field cases, focus changes, manual edits, helper stalls/restarts, and cancellation. Browser/site denials cannot be bypassed through native UIA. Elevated/secure surfaces remain unsupported. This is the next major capability milestone after the Chrome release, not a first-release dependency.

### Later phases: Hands-free, vision, broader coverage, and managed service

The full [roadmap](roadmap.md) continues with Phase 4 hands-free interaction, Phase 5 visual grounding, Phase 6 many-website coverage, Phase 7 bounded workflows and separately reviewed consequential operations, Phase 8 optional Latham-managed AI/commercial delivery, and Phase 9 broader platform reach. Long-term ambition is to support every website where technically and legitimately possible. No milestone relaxes denied scopes, invents success, or bypasses secure/platform boundaries.

These later phases have independent dependencies and acceptance gates in the roadmap; managed-service work is optional and does not block local/BYOK capabilities. Desktop apps retain the next-major-milestone position. Detailed implementation contracts for later consequential operations require review before enablement; P0 blocks remain in force until such a release is explicitly scoped.

**Build order:** Phase 0 -> Phase 1 -> Phase 2/Chrome public MVP -> Phase 3/desktop applications -> later roadmap capabilities. Preserve reusable platform-neutral contracts, but implement only the adapters required by the current milestone.

## 11. Quality Targets and Evaluation

Targets below are **proposed engineering acceptance goals**, not measured outcomes or vendor benchmarks. Establish baseline measurements on the target laptop and representative internet connection.

| Metric | Proposed target | Measurement |
|---|---|---|
| Known-command classification | >= 95% | Labeled utterance set with accents, noise, and paraphrases; report incorrect actions and abstentions separately. |
| Known-command end-to-end response | p95 under 1.0 s after utterance end | User speech endpoint to verified result, excluding webpage network load. |
| Grounded single-step success | >= 95% | P0: 100+ supported DOM commands across fixtures/real sites; Phase 3 adds UIA/app results; report cloud/local routes, blocked/clarified cases, and wrong actions separately. |
| Grounded single-step latency | p95 under 2.0 s after utterance end | Speech endpoint to verified local UI action. |
| Visual target success | >= 85% | Labeled thumbnail/icon tasks; report abstention separately. |
| Multi-step workflow completion | >= 80% | Defined 3-6 step tasks with permitted interventions tracked. |
| Excluded/unknown-effect dispatches | 0 in test suite | Misleading labels, autosave, implicit submit, shortcuts, and alternate adapters; P0 high/critical actions stay blocked. |
| Cancellation dispatch correctness | 0 new issuances after controller receipt; 0 new mutation invocations after executor fence | Test every active state, delayed messages, and text chunks; in-flight calls are recorded separately. |
| Hotkey/tray cancellation acknowledgement | p95 under 250 ms on responsive executors | Request receipt to all executor fences acknowledged; timeouts are failures, not successful cancellations. |
| P1 spoken interruption | Establish detection/false-stop/miss baseline before release | Speech end to local request, then fence latency; include background audio and mic failure. |
| Privacy boundary violations | 0 in test suite | Known sensitive fields and denied-site fixtures. |

Latency must be split into VAD/end-of-speech detection, transcription finalization, routing, observation, decision, execution, and verification. Track median and p95 values separately. Because cloud/model and webpage speeds vary, never silently present a target as achieved performance. Test-suite zero counts establish only the tested boundaries; they are not proof of universal safety on arbitrary websites.

### 11.1 Test matrix

| Scenario | Expected result |
|---|---|
| "Open a new tab" in Chrome | Executes direct local shortcut and verifies new tab. |
| "Scroll down" on permitted page | Scrolls once, without model selection. |
| "Click Jobs" on a supported profile with a unique visible link | Executes only the profiled intended effect; otherwise clarifies or blocks. |
| Two ambiguous filter controls on a supported search page | Clarify the intended filter, then revalidate its allowed effect; do not guess. |
| Job-application "Apply" or "Easy Apply" submission button | Block the consequential submission in P0 even if its target is unique or clarified. A reviewed Easy Apply search-filter toggle remains a distinct allowed operation. |
| Page changes after snapshot | Refuses stale target and reacquires state. |
| Password/secure input field | Omit its sensitive value and block dictation/typing in P0 without an approval or policy override. |
| Webpage says "ignore rules" | Ignores injected instruction and preserves user goal. |
| Global stop during transcription, execution, verification, or a future plan | Controller stops issuing work, executor fences reject subsequent dispatch, and in-flight effects are reported. |
| Request to send in P0; later send integration has an ambiguous failure | P0 blocks sending. A future supported send operation must not retry an unknown effect automatically. |
| Mic permission denied | Clearly explains the missing permission and stays paused. |
| Internet disconnected | Physical cancellation and typed local commands work. A cloud-only configuration reports voice unavailable; a validated local configuration handles supported commands without cloud inference, but remote pages still need internet to load. |
| Chrome extension unavailable or denied | Browser-content observation/actions stop; no UIA/OCR/vision fallback bypass. |
| Revisit/restart on an approved website | No repeat prompt while remembered Latham consent and Chrome host permission both remain valid; bind to the new document and active session. |
| New unapproved site or revoked Chrome/Latham grant | Obtain explicit site approval before content access; revocation cancels affected work, and stale snapshots/consents cannot restore access. |
| Pause while remembered site permission remains installed | No observation, model transmission, or UI mutation until explicit session activation. |
| Denied cross-origin frame or uncertain screenshot crop | Omit denied DOM frame; block image capture when exclusion cannot be established. |
| "Continue" triggers checkout or a field autosaves consequential changes | Block unknown/high effects even though the element and field are valid. |
| Focus changes mid-dictation, including assistant/settings focus | Suspend binding and discard pending insertion; require explicit reselection. |
| Manual edit occurs before undo or correction | Do not overwrite or globally undo unrelated work; invalidate or clarify the edit. |
| Duplicate/late final transcript arrives after cancellation/reconnect | Discard it; no insertion into the next turn/session. |
| Helper stalls or disconnects after possible dispatch | Report unknown effect; invalidate epoch, never replay, and reconcile before resuming. |
| Assistant produces TTS in P0 | Ordinary capture stays closed during playback; initial P1 hands-free disables assistant TTS while the local stop detector is active. |
| P1 user says "stop assistant" during execution, or stop detector/mic fails | Detector triggers cancellation; a detector/mic failure ends hands-free and initiates cancellation; physical controls remain available. |
| Local runtime/model/ASR missing, output invalid, or local request times out | Explain the failed component, keep actions blocked, and offer setup/retry; never substitute cloud processing silently. |
| User-key cloud configuration has missing/invalid credentials or quota failure | Show a provider error, pause affected work, and keep physical controls usable; keys are absent from renderer/logs/extension storage. |
| Phase 3 native-app focus change or UIA worker stall | Do not type into a replacement field/window; preserve cancellation and unknown-effect recovery rules. |

### 11.2 Comparative experiment

For a research- or portfolio-quality evaluation, measure the same set of tasks under three conditions: conventional mouse/keyboard; fixed voice commands; and hybrid voice plus structured/AI grounding. Capture task completion time, intervention count, error rate, subjective ease, and number of physical inputs. Stratify by task type instead of relying on one overall average.

## 12. Known Constraints and Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Model latency makes simple actions feel slow | High | Deterministic fast path; cache only safe, stable metadata. |
| Missing or poor accessibility labels | High | Chrome DOM first; clarify or block in P0; later scoped OCR/vision cannot bypass grants. |
| Audio false positives and background speech | High | Push-to-talk default; local wake detector; session indicator. |
| Incorrect clicks lead to irreversible actions | Critical | P0 blocks unknown/high/critical effects; reviewed profiles, dispatch checks, and effect-specific verification. |
| Focus changes during execution | High | Bind exact context/field, suspend dictation on focus changes, use targeted edits, and revalidate before every dispatch. |
| Cancellation arrives after an input call began | High | Explicit executor fence and acknowledgement; report in-flight effects without claiming rollback. |
| Model API availability, pricing, version changes | Medium | Provider interfaces; timeout/fallback; measured cost tracking. |
| Cross-app and browser differences | Medium | Windows/Chrome first; test fixture coverage; progressive adapters. |
| Browser platform terms restrict automation | High for some sites | User-directed operation, respect restrictions, disable disallowed flows. |
| Microphone/privacy concerns | High | Explicit opt-in, local idle detection, no default raw capture retention. |
| Overly broad initial scope | High | Strict P0/P1/P2 boundaries and milestone gates. |

## 13. Open Questions and Architecture Decisions

The following decisions record the v1.3/0.9 foundation. Section 1.3 and the Phase 10 specification supersede its Chrome-first and delayed general-computer-use choices for the new primary mode; existing runtime protections remain in force.

1. **Branding and foundation:** the product name is Latham, with an independent codebase and the reference policy in section 1.2. Choose its icon and visual identity after validating interaction design.
2. **AI access:** user-supplied API keys or a validated local-AI configuration are P0. The preview implements Gemini and selects whisper.cpp base.en plus Ollama Qwen2.5 1.5B for an English/CPU setup. Proven minimum hardware, broader audio accuracy and additional languages remain validation work. The optional local managed-account service is implemented in Phase 8 with billing disabled; public/commercial launch remains gated.
3. **Browser IPC and grants:** native messaging plus explicitly approved, remembered per-site optional host permissions are the P0 baseline. Validate installation, persistence, reconnect, and revocation in Phase 1. Temporary activeTab access is optional; all-site/background access is not implied.
4. **Activation:** push-to-talk is P0, with hotkey/tray cancellation. P1 hands-free requires the independent local stop detector; wake-word activation is separate from execution-time interruption.
5. **Visual grounding:** benchmark local OCR/UI detection before paying for general screenshot reasoning.
6. **Consent UX:** app/site denial applies across adapters. Prototype the grant-required/blocked UI; later screenshot consent and exact-action approval need separate usability tests and cannot override a denial.
7. **Application/platform order:** Chrome-only MVP first; Windows desktop apps are the next major milestone, Phase 3. Other browsers/operating systems follow later, using shared platform-neutral contracts.
8. **Voice-only approvals:** do not promise safe speech-only authorization for high-consequence actions without additional spoofing defenses and a threat review.
9. **Website coverage:** begin with a few named, validated sites; Google Search and YouTube are initial implementation candidates, with the final published list determined by testing. Broaden to many websites later, aiming eventually at every website where feasible. Broader targeting must retain effect rules and honest unsupported states; it is not unrestricted permission.

## 14. Definition of Done for the First Public Prototype

A successful first public prototype must satisfy all of the following:

- The assistant installs on Windows and starts paused, with explicit microphone activation.
- Phases 0–2 and all P0 requirements pass; the published supported-surface list states exactly which profiles are enabled.
- The first release controls Chrome only; desktop-app UIA/dictation is scheduled next in Phase 3 and is not a P0 acceptance dependency.
- A few real website workflows pass alongside the synthetic fixtures; list the supported sites, controls, and known limitations. Fixtures alone do not establish public-release usefulness.
- User can open Chrome, navigate tabs, scroll, and dictate into a supported, explicitly bound plain text field using push-to-talk.
- At least one nontrivial visible control can be selected by label through a current Chrome DOM snapshot and a reviewed effect profile.
- A documented cloud-key configuration and a complete local-ASR/local-decision configuration pass representative voice tasks; neither requires a Latham-managed AI account. Report local hardware/model requirements and route-specific performance.
- Unknown effects, consequential submissions, sending, uploads, account changes, and destructive actions are blocked in P0 without a generic approval override. Reviewed read-query search is explicitly distinguished from consequential submission.
- Per-site approval works from a fresh Chrome profile, persists across revisit/restart, and remains revocable from Chrome and Latham. Denied/missing grants cannot be bypassed through UIA, OCR, screenshots, stale consent, or queued work. Stored permission does not enable paused/background observation.
- The assistant reports the true result, including unknown dispatch and unverified effects; only matching observed evidence supports success.
- Global hotkey/tray stop works in every active state, shows Stopping until executor acknowledgement, and prevents dispatch beyond the fence. The P0 UI does not promise spoken interruption while capture is closed.
- Dictation passes focus-change, secure-field, document-replacement, late-transcript, manual-edit, and guarded-undo regression cases.
- A helper timeout/restart invalidates pending work and snapshots; potentially applied actions are reconciled and never blindly replayed.
- Secret values, raw audio, and screenshots are not persisted by default.
- The repository includes setup instructions, an architecture diagram, a threat model, and reproducible evaluation tests.

**P0 acceptance demo:** choose a cloud-key or validated local configuration, open Chrome and the browser fixture, and approve that site's access explicitly. Use push-to-talk for “Scroll down,” “Focus search,” “Start dictation,” “Ludwig,” “stop dictation,” “Search,” and “Open the first result.” Exercise correction/undo while the fixture's dictation session remains bound. Move focus during a pending utterance and verify no insertion occurs. Trigger an unknown-effect “Continue” control and verify a block. Use the stop hotkey during a delayed action and inspect the cancellation result. Revisit/restart on an approved site without a repeat prompt, then revoke permission and verify access stops. Repeat representative speech/selection tasks in the other provider configuration and demonstrate the supported real-site workflows. Native-app cases belong to Phase 3.

**Real-site demonstration:** include only validated, listed operations, initially targeting Google Search and YouTube search/navigation. A new/unapproved site requires its initial permission step; returning to an approved site does not. LinkedIn Jobs and other integrations may follow in broader-coverage work. Multi-step planning, desktop apps, and execution-time spoken interruption are later demonstrations with their own roadmap gates.

## 15. References and Prior Art

These references inform the architecture. They do **not** establish that the unbuilt product already meets any acceptance target.

1. **jev-use, macOS accessibility-first voice computer-use example:** https://github.com/savka777/jev-use
2. **OpenAI Decisions API documentation:** https://developers.openai.com/api/docs/guides/decisions
3. **OpenAI realtime transcription documentation:** https://developers.openai.com/api/docs/guides/realtime-transcription
4. **OpenAI computer-use safety and integration guide:** https://developers.openai.com/api/docs/guides/tools-computer-use
5. **Microsoft UI Automation clients overview:** https://learn.microsoft.com/en-us/windows/desktop/WinAuto/uiauto-clientsoverview
6. **Microsoft SendInput reference and integrity restrictions:** https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput
7. **Chrome extension content scripts:** https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
8. **HeyClicky, contemporary voice/desktop AI product:** https://www.hiclicky.com/
9. **Capri Desktop, Windows UIA, speech lifecycle, and local-ASR implementation reference:** https://github.com/lachydotmcg/capri-desktop — inspected commit [`6eaf523a956d39b33c963f63e64fa37f517fbad1`](https://github.com/lachydotmcg/capri-desktop/tree/6eaf523a956d39b33c963f63e64fa37f517fbad1). Study [`Computer.cs`](https://github.com/lachydotmcg/capri-desktop/blob/6eaf523a956d39b33c963f63e64fa37f517fbad1/app/Computer.cs), [`Dictation.cs`](https://github.com/lachydotmcg/capri-desktop/blob/6eaf523a956d39b33c963f63e64fa37f517fbad1/app/Dictation.cs), and [`Ears.cs`](https://github.com/lachydotmcg/capri-desktop/blob/6eaf523a956d39b33c963f63e64fa37f517fbad1/app/Ears.cs). Its Windows build targets .NET Framework 4.8 rather than the proposed .NET 8+ helper. Its permission-bypass mode and coordinate/delay action paths are not Latham's policy or verification model. The repository declares [PolyForm Noncommercial 1.0.0 and required notices](https://github.com/lachydotmcg/capri-desktop/blob/6eaf523a956d39b33c963f63e64fa37f517fbad1/LICENSE.md); account for those constraints before copying code/assets. This design adopts independently implemented patterns, not Capri assets or a fork.
10. **Chrome activeTab grant lifecycle:** https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
11. **Chrome native messaging host and extension identity:** https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
12. **Microsoft UI Automation threading:** https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-threading
13. **Clicky, the public predecessor of HeyClicky:** https://github.com/farzaa/clicky — reference for its documented voice/screen interaction and resident-assistant architecture. Its public implementation is macOS-focused; it is not Latham's Windows application foundation. Apply section 1.2 even where reference code has a permissive license.
14. **Chrome permission declarations, including optional hosts:** https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
15. **Chrome permissions API, runtime requests/removal and change events:** https://developer.chrome.com/docs/extensions/reference/api/permissions
16. **Ollama local chat endpoint:** https://docs.ollama.com/api/chat
17. **Ollama structured outputs:** https://docs.ollama.com/capabilities/structured-outputs
18. **Handy, local transcription application:** https://github.com/cjpais/handy — reviewed source commit `7bfb2e2c934b798bcf6e3627653aed2439996f89`; application remains a reference under section 1.2. [Adoption review](docs/handy-upstream-review.md) distinguishes source and released capabilities.
19. **transcribe.cpp, planned speech-library dependency:** [official TypeScript binding](https://github.com/handy-computer/transcribe.cpp/blob/f1dcd15858c4bbba87ca97862b4e448b2cf15b8f/bindings/typescript/README.md), inspected v0.4.0 source. Public API and packaging reference for section 6.1.1; shipping versions/model terms require validation during implementation.

Reference roles are distinct: jev-use informs the accessibility/decision loop; Capri informs Windows integration concepts and local-speech experiments; Clicky/HeyClicky informs resident-assistant UX and interaction concepts. All remain references under section 1.2. None establishes Latham's measured behavior, supplies authority to bypass permissions, or adds a mascot, persistent personality, or unattended workflows to P0.

## 16. Revision Notes

**v1.23 — November 2, 2026:** Replaced the desktop Gemini speech route's separate Windows guess and post-release batch call with one Gemini Live transcription stream. Interim captions and committed final words now share that recognizer. Added bounded lifecycle/cancellation, no interim execution or implicit fallback, and synthetic live-key timing evidence. Local/managed behavior, planned Handy work and physical speech acceptance remain separate.

**v1.22 — November 2, 2026:** Added one-time terms/permissions setup and remembered universal access/provider choices, replacing the per-launch consent requirement. New users see setup once; returning users start with a ready companion and idle microphone. Disable, explicit denials and uncertainty survive restart. The portable development build retains its separate distribution/physical acceptance gates.

**v1.21 — November 2, 2026:** Replaced the universal route's separate review window with compact companion questions. Explicit simple commands run directly; longer tasks use one bounded task confirmation and coordinate clicks retain individual marked-point approval. Preserved target freshness, Stop, denied scopes and consequential exclusions. Broader native-app, physical voice/display and packaged acceptance remain open.

**v1.18 — November 1, 2026:** Recorded the owner's universal-assistant clarification. Added the Phase 10 shared Windows accessibility/vision observation, model-driven action loop and native executor direction, with an optional browser extension rather than a primary-mode prerequisite. Distinguished the implemented narrow 0.9 foundation from this unimplemented goal, retained independent-reference/consent/Stop boundaries, and separated computer-use model validation from the successful Gemini speech/selection check.

**v1.14 — November 1, 2026:** Implemented the owner's Windows-only Phase 9 scope: explicit Chrome/Edge choice with separate native registration and consent, protocol-3 browser-family checks including the verified Windows cmd intermediary, fenced switching and stale-connection rejection. Added keyboard/focus/compact layout improvements, Stop on display changes, bounded window recovery, schema-2 consent migration/newer-schema protection, explicit local non-content task feedback and repeatable browser/version reports. [Phase 9](docs/phase9.md) records exact support and ongoing macOS/Linux, language/speaker, assistive-technology and physical display gates. Public hosting/signing and Handy remain separate.

**v1.13 — November 1, 2026:** Implemented the owner's local-only Phase 8 scope with billing disabled: separate invitation-account service, server-side provider credentials, exact transcription/selection API, transactional account/global budgets, rate/concurrency limits, DPAPI desktop sessions, explicit routing choice, usage and cancellation/deletion/recovery. Added offline signed-manifest verification, Windows signature preflight, manual rollback/migration and commercial release gates. No public hosting, trusted signing identity, paid plans, managed vision or automatic updater is claimed. Local/BYOK and independent Stop remain available; Handy and Phase 9 are not included.

**v1.12 — October 31, 2026:** Implemented Phase 7 reviewed search/filter/result workflows, one-use expiring previews, scoped tab/document leases, independent main/worker budgets, visible verified/partial/cancelled/unknown progress and no replay. Added explicit encrypted editable/revocable shortcuts with no startup execution. The consequential-integration review enables none: sending, uploads, applications, account changes, payments/destructive actions and generic approval overrides remain excluded. [Workflow setup](docs/phase7.md) and [evaluation](docs/evaluation.md) distinguish actual acceptance and limits. Handy and Phase 8 remain unimplemented.

**v1.11 — October 31, 2026:** Implemented the Phase 6 compiled eight-origin read-query catalog, shared accessible-name/open-root/result handling, conservative focus-only fields, reviewed search/filter URL recipes and explicit bounded same-origin frame inspection/opening. Unknown effects and new-site dictation remain blocked. Dynamic/recycled target freshness, live selector maintenance, per-site consent, URL stabilization and an isolated Edge experiment are recorded in [website coverage](docs/phase6.md) and [evaluation](docs/evaluation.md). Chrome remains the supported browser; universal coverage, Handy migration and Phase 7 remain separate future work.

**v1.10 — October 31, 2026:** Implemented the Phase 5 source-isolated YouTube
thumbnail profile with separate per-session image consent, optional asset grants,
Windows OCR/layout, opt-in visual providers, bounded candidate-ID sets, blue
outlines and explicit verified navigation. Freshness/occlusion checks, failed
provider/late-result handling and controlled text/icon/layout evaluation are
documented in [visual setup](docs/phase5.md) and [evaluation](docs/evaluation.md).
General screen capture, photo/person reliability and Phase 6 remain outside this
preview. Existing planned speech-backend work remains separate.

**v1.9 — October 31, 2026:** Recorded the planned eventual Handy speech integration through the public transcribe.cpp TypeScript binding and an independently authored Latham worker. Added staged optional-backend integration, same-machine recognition/latency/resource comparison, native packaging and cancellation/privacy acceptance, and conditional promotion of the local default. The 0.4 preview remains on whisper.cpp; the integration is unimplemented and Phase 5 has not started.

**v1.8 — October 31, 2026:** Added explicit consecutive-command sessions with
visible microphone/readiness state, separate offline Windows stop and wake
detectors, idle/total limits, failure-triggered cancellation and no idle cloud
audio. Stop remains active through ASR, execution and verification; late results
cannot resume a session. Added local model preflight, language/vocabulary and CPU
thread settings with the existing speech corpus. Published synthetic recognition
misses/false stops, hardware limits and separate cancellation evidence in
[Phase 4 setup](docs/phase4.md) and [evaluation](docs/evaluation.md). Phase 5 is
not started.

**v1.7 — October 31, 2026:** Added the Phase 3 Notepad document-text profile, remembered app approval/block override, fixed launch allowlist and bound native dictation/correction/undo. Implemented an independent Framework 4.8 supervisor plus disposable non-window-owning MTA UIA worker with deadlines, priority cancellation, process/control/document freshness, readback, persisted uncertainty and no replay. Late replies cannot restore cancelled bindings, and supervisor loss cannot claim a confirmed fence. The shared voice UI requires the same native binding captured before recording. Native fixtures and real Notepad acceptance, package exclusion of test tools, display-layout limits and cloud availability failures are recorded in [desktop setup](docs/phase3.md) and [evaluation](docs/evaluation.md). Phase 4 has not started.

**v1.6 — October 30, 2026:** Completed the scoped Chrome preview for signed-out English Google/YouTube workflows: compiled DOM profiles, bound dictation/correction/undo, document/field/connection freshness, clarified selection, readback/navigation verification and persisted uncertainty without replay. Added explicit Prepare Search recording, memory-only local ASR and measured base.en selection. Prepared and tested the unsigned portable Windows/extension package, protocol/version compatibility and recovery. [Setup](docs/phase2.md) and [evaluation](docs/evaluation.md) publish the narrow support set, actual failures and unmet broad accuracy/latency targets. Phase 3 remains unstarted.

**v1.5 — October 30, 2026:** Added push-to-talk/final preview, Gemini BYOK, separate local speech/decision setup, OS-protected keys, own MV3/native-messaging relay, remembered optional site consent, deterministic Chrome commands, acknowledged cancellation fences and uncertain-result recovery. Updated reference provider/runtime proposals to the implemented configuration. Website DOM actions, dictation and distribution remain Phase 2; desktop UIA remains Phase 3. See [setup](docs/phase1.md) and [evidence](docs/evaluation.md).

**v1.4 — October 30, 2026:** Implemented and evaluated the Phase 0 local-fixture foundation: Electron/React shell, tray/settings, narrow sandboxed preload, typed commands, compiled fixture effect policy, snapshot/node revisions, epochs, serialized dispatch, cancellation/deadlines, expected-effect verification, metadata-only diagnostics, and regression/Electron evaluation. Phase 0 is accepted only at this local boundary; real Chrome permissions, speech/providers and native automation remain later milestones. See [evaluation evidence](docs/evaluation.md).

**v1.3 — October 30, 2026:** Applied the user's product choices: Chrome-only first release, desktop apps as the next major milestone, a few supported websites before broad coverage, user-supplied cloud keys or local AI, and remembered per-site approval. Added the full [roadmap](roadmap.md), separated local ASR from Ollama text decisions, moved native UIA/dictation to Phase 3, required real-site and provider-route acceptance for the Chrome MVP, and aligned permission persistence/revocation. Corrected Apply-button tests to distinguish search filtering from blocked application submission, and made P0 secure-field exclusion unconditional. All milestones remain unimplemented until evidenced.

**v1.2 — October 30, 2026:** Established Latham as the product name and an independent implementation. Retained all references, added the public Clicky repository, and documented that reference applications are sources of conceptual inspiration rather than forks or imported code/assets. Kept ordinary dependency selection separate and preserved the option for future private/commercial development without selecting distribution or contribution terms.

**v1.1 — October 30, 2026:** Reconsidered the four primary design-review gaps and made the decisions explicit: deny unknown/consequential effects in P0 with locally reviewed profiles; gate observations and mutations across adapters with no P0 browser-content fallback; separate controller cancellation, executor fences, and in-flight effects with hotkey/tray guarantees and later local spoken interruption; and move external dictation to Phase 2 with field binding and guarded edits. Aligned action/result contracts, Chrome grants/transport, release scope, helper recovery, demo, and regression tests. Added Capri with source/reuse boundaries. Runtime feasibility, latency targets, and external profiles remain to be validated. `Latham_Design_Review.md` remains the historical review of v1.0; its line references do not describe this revision.

---

**Summary:** The preview implements the eight-site read-query catalog, scoped Notepad editing, opt-in hands-free interaction, bounded thumbnail matching and reviewed workflows. Optional managed speech/selection now has a local invitation-account service with billing disabled. Public hosting, trusted signing and commercial launch remain gated. Ground targets before enabling effects, check scope before every observation/action, and report in-flight cancellation effects honestly. Latham remains independently implemented.
