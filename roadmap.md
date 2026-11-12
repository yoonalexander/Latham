# Latham Roadmap

**Updated:** November 2, 2026\
**Status:** Phases 0–9 retain their published scope; Phase 10A–10C have a working implementation preview. Phase 10D physical voice, broader native-app and display acceptance is open. Billing is disabled; other platforms and public launch remain gated.\
**Companion specification:** [Latham_Design_Document.md](Latham_Design_Document.md), version 1.23.

**Current product direction:** the owner clarified that Latham should be a
universal voice-driven Windows assistant: observe the app/screen, use AI to
choose an action, execute it and check the result across applications. The
Chrome extension is optional in the new primary route. The completed narrow
Phases 0–9 supplied the foundation; [Phase 10](docs/universal-desktop.md) adds the
shared engine and retains its outstanding acceptance gates.

Latham is an independent voice-controlled computer assistant. Start with a useful Chrome assistant on Windows, add desktop applications as the next major step, then expand coverage and capabilities. Other projects remain conceptual references; Latham is not a fork or a port of their implementations.

This roadmap covers the whole project, including later ambitions. It has acceptance gates rather than promised dates. “Public release” means a user-facing build, not a decision that the source must be public. Distribution licensing, contribution terms, and any later private/commercial release are separate decisions. The design document owns execution/privacy contracts; this roadmap owns sequence. When a milestone changes, update both without marking unverified work complete.

The fixture foundation, voice/providers, reviewed Chrome workflows, scoped Notepad editing, opt-in hands-free sessions and scoped visual thumbnail matching are implemented. [Evaluation](docs/evaluation.md) records automated boundaries/integration flows, real-site workflows, microphone insertion, native editing and recovery, remembered permissions, speech-detection limits and packaging. [Chrome setup](docs/phase2.md), [desktop setup](docs/phase3.md) and [hands-free setup](docs/phase4.md) publish exact support sets and limits. The current channel is an unsigned Windows developer preview.

## Decisions already made

The primary UI is now a small cursor-following companion with short–long–short
bars, input-driven microphone feedback and orbiting processing dots. Setup and
advanced controls are a separate window. Each companion activation authorizes
one command; continuous hands-free remains a separate opt-in.
The companion also supports holding physical Ctrl to listen and releasing to
process with the microphone off; ordinary Ctrl chords discard capture. See
[controls, implementation and acceptance](docs/companion.md). This UI refinement
does not change the capability/release gates below.

| Decision | Delivery consequence |
|---|---|
| Chrome first on Windows | Phases 0–2 build the Chrome MVP; general native UIA and desktop dictation are not release blockers. |
| Desktop applications next | Phase 3 is the next major capability milestone after the Chrome MVP. |
| A few websites initially | Publish exactly which sites and actions work; start with fixture tests, then a small real-site set. |
| Many websites later, ideally every website | Phase 6 grows general coverage; near-universal compatibility is the long-term ambition, subject to technical and legitimate access limits. |
| Users supply AI access | P0 offers supported cloud API keys or a validated local setup; no Latham-managed account is required. |
| Local models are a real option | Initially target Ollama for local text decisions plus a separate local speech recognizer. Installing a text model alone does not complete the voice pipeline. |
| Remember approved websites | Explicit per-site consent and optional Chrome host grants persist until revoked; observation/actions still require an active session and current scope. |
| Latham-managed AI later | Phase 8 adds the optional hosted service/account experience. It does not block local/BYOK development. |
| Independent implementation | Write Latham's own code and assets; select normal dependencies under suitable licenses and record their provenance. |
| Universal Windows computer use is the primary target | Phase 10 adds a generic accessibility/vision and native-action loop; a browser extension is optional for that mode. The Chrome-first rows above record the delivered foundation. |

## Milestone sequence

| Phase | Outcome | Depends on |
|---|---|---|
| 0 | Foundation and browser test harness | Design decisions recorded |
| 1 | Voice/provider setup and Chrome connection | Phase 0 |
| 2 | Chrome-first public MVP on a few real sites | Phase 1 and all P0 gates |
| 3 | Desktop applications | Chrome MVP; next major capability |
| 4 | Hands-free interaction | Reliable execution/cancellation; planned after desktop foundation |
| 5 | Visual grounding | Scoped capture and permission tests; independent of hands-free |
| 6 | Many-website coverage | Proven Chrome profiles and evaluation harness; vision where needed |
| 7 | Bounded workflows and reviewed consequential actions | Proven observation, execution, scope, and cancellation |
| 8 | Optional Latham-managed AI and commercial delivery | Stable core plus a separately reviewed service design |
| 9 | Broader platform reach and ongoing compatibility | Stable Windows/browser/desktop contracts |
| 10 | Universal Windows AI computer-use loop, independent of browser extension installation | Reuse voice/Stop foundations; add explicit desktop scope, generic observation/execution, model reasoning and cross-app acceptance |

Phases 0–9 establish the narrow current preview within their published acceptance limits. Phase 10 owns the missing universal Windows computer-use capability. The Chrome-first ordering records delivery history and is not a browser-extension prerequisite for the new route. Managed AI remains optional; public hosting and other platforms need not delay Windows computer use.

## Phase 0 — Foundation and evaluation harness

**Goal:** a small, inspectable application that can execute a typed fixture action and report its real result.

- [x] Create the Electron/React/TypeScript shell, tray, settings, and state feedback.
- [x] Define typed proposals, controller-owned authorization, snapshot/context identity, permission/executor epochs, and result/unknown-dispatch states.
- [x] Implement one serialized action path, cancellation fences, priority stop control, and safe late-response handling.
- [x] Create browser fixtures for text entry, search/filter controls, duplicate labels, page replacement, denied frames, misleading buttons, and implicit consequential effects.
- [x] Establish the local effect-profile policy and minimum scoped observation/redaction rules.
- [x] Add inspectable metadata-only diagnostics and an evaluation runner. Keep raw audio, page content, and screenshots out of default persistent logs.
- [x] Set up dependency/provenance records and a review point for distribution/contribution terms before public code, external contributions, or a user-facing release.

**Gate:** fixture operations produce evidence-backed outcomes, unknown/excluded effects are blocked, and Stop/Pause prevents subsequent dispatch beyond the executor fence. Nothing requires a cloud call or desktop-app UIA to demonstrate this foundation.

**Accepted:** October 30, 2026, for the local-fixture boundary only. Run `npm run evaluate` to reproduce the automated evidence. This does not establish real-site/native-app safety or complete the full P0 Chrome release.

## Phase 1 — Voice, user-supplied AI, and Chrome setup

**Goal:** a user can configure AI, grant site access, and invoke basic Chrome controls with voice.

- [x] Add microphone selection, push-to-talk, local utterance boundaries, transcript preview, and explicit permission/error states.
- [x] Implement one supported cloud-key configuration; protect keys through the OS-backed store and expose connection/quota errors.
- [x] Implement an Ollama adapter for local bounded target selection using schema-validated candidate IDs and an abstention path.
- [x] Benchmark/select a separate local ASR runtime/model and implement its final-turn/cancellation contract. Record model terms, download size, required setup, supported languages, and tested hardware.
- [x] Offer “Use my API key” and “Use local AI” onboarding. Show the chosen audio/context destinations, test each component, and prohibit silent cloud fallback from local mode.
- [x] Pair the MV3 extension through a registered native-messaging host. Keep any native launch/focus helper narrow; do not build general desktop automation yet.
- [x] Implement deterministic Chrome launch/tab/navigation commands and physical cancellation independent of provider/network state.
- [x] Request supported sites through explicit optional-host permission prompts in extension UI; save Latham consent and show the effective approved-site list.
- [x] Test approved-site revisit/restart, navigation to a new site, browser-side and Latham-side revoke, disconnect/reconnect, and Pause with permission still installed.

**Gate:** both cloud-key and local speech paths produce usable final utterances; candidate-selection fixtures work through both decision routes. Known shortcuts avoid model selection. Local-only tests produce no cloud inference traffic. A remembered site does not prompt again unless effective permission was removed, and a missing/revoked grant never falls back around denial.

**Accepted:** October 30, 2026, for the internal setup/navigation boundary. Gemini 3.1 Flash-Lite and whisper.cpp tiny.en/Ollama Qwen2.5 1.5B passed public-speech and synthetic-candidate checks; real native-host, permission restart/revoke and physical Stop checks passed. Transcripts require review/run. Navigation is reported as dispatched, not a verified loaded-page task. Broader microphone accuracy, stable-Chrome distribution and real-site operations remain Phase 2 gates.

## Phase 2 — Chrome MVP on a few chosen websites

**Goal:** complete useful, verified browser tasks on a small published site set.

The accepted set is **signed-out Google Search and YouTube search/navigation with English UI**. [The support matrix](docs/phase2.md) records exact origins/paths, plain Search fields, permitted filters/video links, root-frame limits and excluded controls. Arbitrary sites, signed-in/private flows and LinkedIn remain outside this release.

- [x] Implement scoped DOM snapshots, current document/frame/element binding, target ranking, and concise clarification.
- [x] Build reviewed profiles for the initial site set, including bounded scrolling, label-based focus/click, plain text entry, read-query search, and permitted navigation/filter changes.
- [x] Add browser field-bound dictation, explicit append/replace behavior, guarded corrections/undo, and suspension on focus/document/grant changes.
- [x] Verify intended outcomes, reject stale targets, handle lost acknowledgements honestly, and reconcile after extension/host restarts without replaying mutations.
- [x] Make blocked and unsupported operations understandable. Clarifying a target does not authorize a forbidden effect.
- [x] Complete the remembered-permission UX, local/cloud settings, installation, recovery, and setup instructions.
- [x] Run the P0 boundary matrix against fixtures and the actual advertised workflows. Fixture coverage distinguishes search-filter “Easy Apply” from consequential application submission; LinkedIn itself is not supported. Always exclude secure fields from P0 dictation.
- [x] Measure cloud/local accuracy, wrong-action rate, abstentions, interventions, latency, and resource use separately; publish tested configuration limits.
- [x] Prepare the Windows/extension distribution method, signing/installation evidence, version compatibility, and a recovery path appropriate to the release channel.

**Gate:** all P0 requirements and the design's definition of done pass on a few real website workflows, not only fixtures. Users can install/configure Latham, approve sites once, return without repeated prompts, navigate/search/dictate through supported controls, interrupt with physical controls, and see true results. At least one complete cloud-key setup and one local voice/decision setup pass on documented hardware. Unknown/high/critical effects, messages, uploads, account changes, and consequential submissions remain blocked.

**Accepted:** October 30, 2026, for the documented **0.2 unsigned Windows developer preview**. The fixture repetition benchmark verified 100/100 operations with zero wrong effects; the final live navigation recheck verified 43/44, with one stale-document stop. Real cloud/local speech insertion, physical microphone insertion, protected storage, versioned packaged host/extension pairing and Stop passed. [Evaluation](docs/evaluation.md) separates synthetic speech, real-site results and latency/resource measurements. Sub-second voice targets, broad accent/noise accuracy, signed distribution and general website compatibility are not claimed. Base.en replaces tiny.en as the recommended local recognizer. No Phase 3 work is included.

**Explicitly deferred:** native-app control/dictation, wake-word/hands-free operation, screenshot vision, general multi-step planning, arbitrary-site coverage, and Latham-hosted AI accounts.

## Phase 3 — Desktop applications: the next major step

**Goal:** extend the Chrome assistant to a small set of Windows applications, starting with a plain text editing task.

- [x] Add the non-elevated C#/.NET UIA helper and a separate non-window-owning worker with deadlines and a responsive cancellation/control path.
- [x] Build a native test app and process/window/control identity contracts; detect focus changes, removed controls, and helper restarts.
- [x] Add explicit per-app consent, a denylist, and a small launch allowlist. Native app permissions never authorize denied browser origins.
- [x] Target Notepad: open/focus, identify the text field, dictate/correct/undo, and verify the edit. Publish the tested app/version rather than assuming every installed version exposes adequate UIA.
- [x] Add targeted native control operations for the accepted app set, reusing the scope/effect/provider/verification contracts.
- [x] Test stalled UIA providers, lost acknowledgement, user edits, wrong-window cases, window movement/scaled layout, cancellation and recovery. One physical monitor was available; mixed-DPI/multi-monitor hardware remains an explicit compatibility limit.

**Gate:** the advertised native-app workflows pass real-app and fixture acceptance. If targeted secure editing cannot be verified, report unsupported behavior rather than using blind keyboard/clipboard input. UAC, secure desktops, elevated targets, and credential fields remain outside supported automation. Browser-content fallback remains governed by its own origin/permission contract.

**Implemented preview:** October 31, 2026, for the documented **0.3 unsigned Windows developer preview**, limited to the tested Notepad document-text profile. The separate Framework 4.8 supervisor/MTA worker, app approval/block override, literal bound editing, guarded undo, persisted uncertainty and no-replay recovery have fixture and real-app evidence in [evaluation](docs/evaluation.md). Local base.en and Gemini speech reached real Notepad. The earlier full integration run passed; the final native recheck was blocked by Windows refusing editor focus before editing. Foreground activation remains an intermittent preview limitation. Cloud availability failures and broader hardware/speech limits are recorded separately, without fallback or invented success. Signing and general app coverage are not claimed. No Phase 4 work is included.

## Phase 4 — Hands-free interaction and local speech refinement

**Goal:** reduce repeated physical activation while keeping a dependable interruption path.

- [x] Add opt-in consecutive-command sessions, visible microphone/session state, idle timeouts, and explicit exit controls.
- [x] Implement the independent local “stop assistant” detector across transcription, execution, and verification; retain physical stop controls.
- [x] Add opt-in local wake detection independently of the stop detector. Do not send idle wake audio to cloud transcription.
- [x] Test false activation, missed stops, overlapping background voices, digital speaker-content replay, microphone disconnects, and detector failure. Physical room/speaker-loopback reliability remains unverified.
- [x] Keep assistant TTS disabled while the stop detector is active; echo-aware spoken feedback remains outside the preview.
- [x] Add local-ASR startup/model preflight, language/vocabulary selection, model-switch controls and bounded CPU use; compare the existing evaluation corpus. Resident ASR/model downloads and broad multilingual acceptance are not included.

**Gate:** publish recognition/false-stop/miss results and distinguish speech-detection latency from executor cancellation latency. Mic/detector failure cancels work and ends hands-free mode. No guaranteed recognition of every spoken stop is claimed.

**Implemented preview:** opt-in sessions use separate Windows offline en-US wake and stop recognizers, bounded transient capture, single-command execution and failure-triggered cancellation. [Setup](docs/phase4.md) and [evaluation](docs/evaluation.md) distinguish synthetic phrase recognition, hardware limits and executor fences. Automatic sessions never grant site/app access, resume uncertainty or persist microphone activation. This checkpoint excludes Phase 5.

## Phase 5 — Visual understanding and grounding

**Goal:** handle visual references that DOM/UIA labels cannot resolve, such as a described thumbnail.

- [x] Add explicit per-session visual consent, source-isolated thumbnail capture, Windows OCR/layout matching, and opt-in Ollama/Gemini visual providers. General viewport/desktop screenshots remain unsupported.
- [x] Exclude denied pixels by construction: only approved matching JPEG assets enter an isolated canvas. Unknown sources/targets and surfaces without safe candidates block; frames, fields and overlays are not screenshot inputs.
- [x] Bind images to the Chrome window/tab/document, video target, source, revision and current geometry; reject zoom, scroll, mutation, overlay and replacement staleness. Effects use the existing DOM/navigation gateway rather than coordinates.
- [x] Add proposed-target outlines, explicit opening and multi-match clarification. Visual similarity never bypasses an effect block.
- [x] Evaluate controlled thumbnail text/color/icon/layout cases, ambiguity, denied/private content, overlays, grants, stale targets, provider failures and late results. Publish dataset and provider/hardware limits.

**Gate:** controlled visual tasks meet measured success/abstention targets and never silently use stale coordinates or transmit denied pixels. Structured adapters remain preferred. This phase does not need to delay desktop-app support or require every local model to support vision.

**Implemented preview:** [Visual setup](docs/phase5.md) and [evaluation](docs/evaluation.md) publish the narrow YouTube source-capture profile. Local OCR/layout and the final live Gemini benchmark each returned the correct result on 8/8 controlled tasks, including clarification/abstention. Earlier cloud failures and ambiguity errors remain recorded. General photo/person matching, native permission-prompt UX and actual local vision-model accuracy are not established. Capture/recognition does not authorize navigation by itself. Phase 6 coverage is recorded below.

## Phase 6 — Many websites and broader browser coverage

**Goal:** grow beyond a handful of individually supported sites toward general, user-directed website interaction.

- [x] Expand the named site/action catalog with regression fixtures and clear compatibility reports; include job-search/filter workflows when validated.
- [x] Generalize reusable semantic control handling, labels, navigation, text fields, and safe search/filter patterns while keeping effect classifications local and conservative.
- [x] Define evidence for enabling general patterns versus needing a site-specific profile; test page changes, misleading labels, unknown handlers, and autosave effects.
- [x] Improve permitted frames, dynamic pages, virtualized lists, dialogs, and web components where browser APIs allow access; publish unsupported cases.
- [x] Maintain remembered, explicit per-site consent as coverage expands. Broader capability does not imply blanket permission or idle monitoring.
- [x] Evaluate additional browsers once Chrome behavior is stable; treat browser/platform differences as new adapters with their own tests.

**Gate:** demonstrate a diverse, published website evaluation set beyond the original profiles, with task success, wrong actions, abstentions, maintenance effort, and site restrictions reported separately. Unknown consequential effects remain blocked unless a later dedicated operation is enabled.

**Implemented preview:** [Coverage setup](docs/phase6.md) and [evaluation](docs/evaluation.md) distinguish live successes, fixture-only operations, abstentions and site restrictions. New fields are focus-only, frames are same-origin/read-only and Edge remains experimental. This milestone establishes expansion mechanics and a diverse measured catalog; it does not complete universal compatibility.

**Long-term ambition:** ideally every website is usable through Latham. Treat this as a direction for expanding capability, not a guarantee that secure pages, restricted APIs, inaccessible controls, CAPTCHAs, or sites that prohibit a flow can be controlled. Never bypass those boundaries to satisfy a compatibility claim.

## Phase 7 — Bounded workflows and reviewed consequential operations

**Goal:** carry out a user goal over several verified steps, then selectively add higher-consequence operations with explicit authority.

- [x] Add a bounded planner, per-run action/time/request budgets, visible progress, supported typed tools, and honest completion/failure states.
- [x] Begin with navigation/search/filter workflows, using existing supported controls. Do not equate searching jobs with applying for them.
- [x] Test interruption, user intervention, navigation changes, stale plans, prompt injection, and unknown outcomes. Never replay an uncertain mutation.
- [x] Add editable/revocable user-approved shortcuts only after the underlying workflow is reliable.
- [x] Separately design and review each proposed send/upload/account-changing integration, including its typed operation, exact payload/recipient UI, single-use approval, focus restoration/revalidation, expiry, and duplicate prevention.
- [x] Keep purchases, payments, destructive operations, permission grants, and unattended work excluded unless a future separately scoped design and trusted authorization process is approved. Broad automation is not implied by this milestone.

**Implemented preview:** [Workflow setup](docs/phase7.md) records the typed goal compiler, 8 action/20 request/60-second budgets, single-use review, exact context leases, partial/unknown results and explicit encrypted shortcuts. The consequential-integration review enables none: each proposed effect remains blocked until it has a dedicated approved design and acceptance suite. This completes the read-query workflow milestone, not a generic autonomous agent or a send/upload integration.

**Gate:** supported workflows complete within configured budgets and report partial/unverified outcomes accurately. Any newly enabled consequential integration passes its own approval and recovery suite. P0 exclusions stay in force for every operation not explicitly introduced by such a release.

## Phase 8 — Optional Latham-managed AI and commercial delivery

**Goal:** offer a simpler account-based AI experience for users who do not want to manage provider keys or local models.

- [x] Implement the local managed-service backend with server-only credentials, operator-issued invitation accounts, access control, rate/concurrency limits and persistent transactional budgets.
- [x] Implement explicit onboarding, usage, request limits, outage behavior and cancellation/deletion. Billing is disabled; admitted failed/uncertain requests count. Monetary billing is not offered.
- [x] Disclose managed audio/control-label routing and retention separately; sign-in does not change the route, and switching requires an explicit saved choice.
- [x] Preserve supported local and user-key modes with no managed-service dependency or silent fallback.
- [x] Record the source/dependency/model/asset, rights/terms, branding, privacy and operations review in [Phase 8](docs/phase8.md). Keep Latham; owner/external commercial decisions remain explicit launch gates.
- [x] Establish offline signed-manifest verification, a fail-closed Windows signature preflight, manual rollback/migration guidance, opt-in counters, local operator support/recovery and readiness checks for the preview channel.
- [ ] Before a public/commercial launch: provision hosting/TLS/authentication operations, trusted signing/publisher-key distribution, actual packaged HTTPS acceptance, provider/privacy eligibility, distribution/contribution terms, production cost ceilings/support/monitoring and backup/deletion reconciliation. See [release gates](docs/release-operations.md).

**Owner-scoped local preview:** the owner explicitly selected “Build locally; billing disabled.” [Phase 8](docs/phase8.md) implements that scope. Production deployment and trusted signing are deferred external gates, not passed by fixture tests or test signatures. Managed vision, payments and an automatic updater are not enabled. [Evaluation](docs/evaluation.md) separates real-provider, local fixture, packaged and interactive-native evidence.

**Gate:** end-to-end account/usage/privacy/deletion and failure/recovery flows are tested; desktop releases do not expose service keys; service costs and user limits are enforceable. This is optional product/service work, not a prerequisite for the independent local assistant.

## Phase 9 — Broader platforms and sustained compatibility

**Goal:** extend a proven Windows product to other environments while maintaining its guarantees and broadening useful reach.

- [x] Evaluate platform readiness and publish the Windows dependencies and independent macOS/Linux acceptance requirements in [Phase 9](docs/phase9.md).
- [x] Add explicit Windows Edge selection, dedicated native registration/launch, browser-family relay checks, separate remembered consent, fenced switching and repeatable browser regression reporting.
- [x] Improve keyboard access with a skip link, visible focus, local Escape Stop, narrow layouts and work-area recovery; cancel active work on display configuration changes.
- [x] Publish the current support/limitation matrix and retain the eight-site reviewed catalog and explicit per-origin/effect gates. Universal-site compatibility remains an ongoing ambition.
- [x] Maintain provider/model/site/app regression entry points, version/protocol compatibility, legacy consent migration, newer-schema protection and recovery/rollback documentation for the current preview.
- [x] Add explicit local task evaluations for completion time/outcome, interventions, incorrect actions, permission friction, effort and resource/cost burden, with no automatic collection/upload or raw activity content.
- [ ] Implement and accept independent macOS/Linux/native/browser adapters when machines and demand are available. No cross-platform support is claimed from shared TypeScript.
- [ ] Expand actual language/speaker, assistive-technology, physical mixed-DPI/multi-monitor, stable browser/store and longitudinal real-user acceptance. Synthetic UI/data tests do not close these gates.

**Owner-scoped Windows milestone:** the owner selected “Windows only for now; keep other platform gates open.” [Phase 9](docs/phase9.md) defines the 0.9 implementation and exact browser/hardware limits. [Evaluation](docs/evaluation.md) separates fixture, live, packaged, simulated-display and native-focus evidence. Ongoing compatibility and real-user studies remain continuous work, not completed universal support.

**Gate:** each new platform/browser has its own tested support claims. A shared TypeScript core is not evidence that its native controls or permissions behave identically. Continue revising compatibility targets as evidence changes.

## Phase 10 — Universal Windows computer use

**Status: implementation preview; acceptance incomplete.** The default companion
route now uses the shared Windows engine independently of the extension.
[The Phase 10 guide](docs/universal-desktop.md) records its consent, bounded
operations, provider checks, actual evidence and remaining acceptance gates.

- [x] 10A: Activate independently of the extension with one-time terms/permissions setup. Remember universal access, chosen image/browser scopes, provider and disable state across restarts; keep idle capture off and enforce app/site blocks and uncertain-result recovery.
- [x] Companion speech: use one Gemini live transcription stream for real interim and final words in user-key mode; retain explicit activation, release-before-dispatch, Stop, local-only isolation and bounded failure. Physical microphone/accent/noise acceptance remains in 10D.
- [x] 10B: Implement generic Windows accessibility observation and bounded native click/type/scroll/key execution with fresh target, input and geometry checks. Controlled native and extension-free Chrome checks pass; wider app/input coverage remains in 10D.
- [x] 10C: Implement the bounded AI observe/act/check loop, clarification, direct simple commands, one compact companion confirmation for longer tasks, separate coordinate-click confirmation, independent Stop and explicit uncertainty recovery. Controlled Gemini/native evidence is recorded in the evaluation guide; broader multi-step/cross-app acceptance remains in 10D.

Keep the existing Chrome/Notepad paths as separate implemented adapters. Do not
remove their guards as a substitute for building the new backend. Do not claim
every app works or that a Gemini text/ASR key check validates computer-use models.

### Phase 10D acceptance checklist

- [x] **10D.1 — Windows startup and shutdown.** The cold-start tray Settings checks passed, including the first request during startup. The native supervisor exit regression passed after Settings was destroyed. [November 11 results](docs/evaluation.md#phase-10d-windows-acceptance--november-11-2026)
- [ ] **10D.2 — Native window discovery and editing.** Resolve the known window discovery and focus failures in the universal and legacy editing tests. Verify that Latham finds, edits, and checks the result in multiple unrelated Windows apps. Include a changed-window or changed-field case that blocks the edit and a stalled native operation that can be stopped safely.
- [ ] **10D.3 — Hold-Ctrl with a real microphone.** Check that live words appear while speaking, the microphone closes on release, and the final transcript runs the intended command once. Check cancellation while listening and record recognition problems observed with the available speakers and room conditions.
- [ ] **10D.4 — Hands-free approval, Stop, and recovery.** Run repeated commands in an opt-in session. Verify that approval applies only to the visible proposal, spoken Stop interrupts active work, the independent Stop shortcut works during processing, and recovery does not replay a command.
- [ ] **10D.5 — Chrome without the extension.** Complete and verify a permitted, low-consequence task in a real Chrome window using the Windows engine. Repeat with browser access revoked and verify that the operation is blocked.
- [ ] **10D.6 — Multi-step and cross-app tasks.** Verify a multi-step goal within one app and a goal spanning apps. Check that Latham clarifies ambiguous requests, asks for approval when required, and shows the verified result or a clear error.
- [ ] **10D.7 — Consent and privacy.** Verify that idle capture stays off and that capture and provider transmission respect consent. Exercise app and site blocks, protected fields, and secure or elevated windows. App-denial unit tests and the hosted Calculator identity check passed. [App-denial follow-up](docs/evaluation.md#phase-10d-app-denial-follow-up--november-11-2026)
- [ ] **10D.8 — Displays and scaling.** Verify companion positioning and action targeting on the available monitor layouts and DPI settings, including mixed-DPI setups where available. Record the configurations tested and any gaps.
- [ ] **10D.9 — Packaged Windows preview.** Build with `npm run package:preview` and run `node scripts/check-preview.mjs`. Smoke-test setup, launch, Stop, and recovery from the packaged app. Record the tested workflows and outstanding limits in [evaluation.md](docs/evaluation.md) before closing Phase 10.

## Work that accompanies every milestone

- Keep the independent-reference policy, dependency/model provenance, and user-authority boundary intact.
- Extend effect/scope, privacy, prompt-injection, stale-target, cancellation, and recovery tests with every new capability.
- Make retained diagnostics optional/minimal, provide clearing controls, and avoid raw activity-content persistence by default.
- Include clear supported/unsupported states and an accessible physical stop/pause path.
- Measure representative cloud/local behavior on named hardware. Targets stay labelled as targets until evidence exists.
- Review distribution signing/update integrity and setup/recovery instructions before the relevant release; do not defer essential release work until the managed-service phase.

## Open implementation choices

The universal Windows development route is implemented alongside the older narrow adapters. Controlled Gemini/native/Chrome acceptance does not establish every-app coverage, local-model performance or physical voice/display reliability. No paid model or cloud screen sharing is selected silently. Proven hardware, languages, distribution terms, signing and updates remain separate work. Preserve explicit denials and user-key/local choices.

## Next milestone

**Resume the foreground checks with 10D.2.** The November 11 run verified
startup and shutdown. Windows denied foreground activation during the longer
native run, leaving native editing, extension-free Chrome, cross-app actions,
and packaged launch open. The [Phase 10D checklist](#phase-10d-acceptance-checklist)
and [November 11 results](docs/evaluation.md#phase-10d-windows-acceptance--november-11-2026)
record the remaining physical voice, privacy, and display work.
