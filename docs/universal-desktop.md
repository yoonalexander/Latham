# Universal Windows assistant direction

**Owner clarification:** November 1, 2026. **Status:** Phase 10 implementation
preview in the working tree. 10A–10C are implemented; 10D physical voice,
broader native-app and display acceptance remains open. Existing 0.9 release ZIPs
have not been replaced by this development build.

## Intended experience

Latham is a small voice-controlled desktop companion. The user speaks a goal
and Latham works through the visible interface of ordinary Windows applications:
open an app, find a control, click, scroll, enter text and check the outcome.
This should work through a shared computer-use engine, without requiring a
browser extension or a separately authored integration for every app/site.
Explicit hands-free mode should allow continued use without holding a key.

Examples: “Open Calculator and work out 35 times 17”; “In this app, open the
settings”; “Find the search field and look for piano music”; “Read this dialog
and explain what it means.” These are target acceptance scenarios, not current
support claims. Broad coverage is the goal; every application is not a guarantee.

## What currently exists

The default companion target is now the shared Windows computer-use engine.
It observes the foreground window through UI Automation, optionally captures a
window-only image, asks Gemini or an explicitly selected local model for one
structured action, asks for confirmation when needed, revalidates the target, applies input,
then observes again for model verification. The old Chrome/Notepad/thumbnail
adapters remain separate optional tools with their existing protections.

There is no extension connection prerequisite for the new route. Capturing the
desktop or starting a microphone on launch remains disabled. Computer access is
enabled by a one-time terms/permissions agreement. Chosen access scopes and the
reasoning provider persist across updates/restarts, including an explicit disable.
Merely storing a provider key never accepts the agreement. Remembered access
does not resume a task, microphone or observation.

## Use the preview

1. First launch opens Settings for one-time setup; later use tray **Settings…**.
   Save Gemini AI setup with your existing key, or
   configure the existing local speech setup. Computer reasoning and speech
   routing are separate choices; neither silently changes the other.
2. Under **Universal assistant**, read the Latham terms and permissions. Universal
   access, foreground-window images and browser inclusion are selected by default;
   change them or the provider if needed, check the agreement box, then choose
   **Agree & enable Latham**. These choices are remembered. Later changes use
   **Save universal access settings**; **Disable universal mode / Stop** stays off
   after restart. Existing app/site blocks and uncertain outcomes are preserved.
3. Return to the companion, click the ordinary app you intend to use, hold Ctrl,
   speak a short goal and release. Start with a disposable text field, for
   example “replace Draft with hello”, or “explain the current window”. A typed
   **Run universal task** is also available; select the target window first.
4. Simple explicit commands run directly, including “open Notepad” and a single
   uniquely named control operation. Longer or ambiguous action requests show
   **Continue with this task?** beside the companion. Choose **Continue** or
   **Cancel**; **Ctrl+Alt+Enter** also confirms and **Ctrl+Alt+.** stops.
   The companion stays put while the question is open. Confirmation expires
   after 30 seconds. Changes to the target invalidate the pending action.
   Image-coordinate clicks always ask separately and show the marked point.
5. For repeated hands-free commands, explicitly enable **Universal computer use**
   in the hands-free panel. While that session is active, “approve action” can
   approve the displayed proposal; “stop assistant” cancels. Keep the settings
   capture window visible for this existing hands-free mode. Hold-Ctrl releases
   the microphone before processing, so spoken approval is unavailable then.

No background screenshots, transcript/image history or model downloads are
enabled. The tray's **Show task status** resurfaces the companion's status.
Opening Settings stops current work.

## Implemented scope and limits

- Foreground window only, same user/session, visible and non-elevated, on the
  ordinary input desktop. No whole-desktop image fallback. Physical window
  geometry and the target's rendering DPI are mapped independently; image
  coordinates are normalized to that exact window.
- Accessibility observation is bounded to 700 nodes, depth 14 and 120 targets.
  Oversized or unresponsive trees stop the task. Values are bounded; editable
  content above 20,000 characters is not exposed as an editable target.
- UIA focus/invoke/selection, whole-field replacement up to 1,000 characters,
  accessible vertical scrolling and a small navigation-key allowlist. Writable
  TextPattern editors use paired Unicode input and readback; no clipboard or
  arbitrary shell/code tool is exposed. Direct launch is limited to Calculator
  and Notepad. Other apps can be selected manually or reached through their UI.
- Coordinate clicks require image consent, an unchanged image, current window
  identity and an unoccluded point inside that window. Password/known terminal
  regions are omitted from context, masked in images and excluded from clicks.
  Secure/elevated apps, known terminals/security tools and detected password
  input are excluded. Custom painted secrets cannot be reliably detected; choose
  windows carefully. This is not a certified content-redaction system.
- One explicit single-control operation runs directly only when its exact
  target/payload matches the user's command and its accessible name is unique.
  Navigation keys except Enter and explicit vertical scrolling also have direct
  paths. Extra model-selected steps require task confirmation. One task approval
  covers that run's bounded steps; each image-coordinate click needs its own
  approval. These questions use the companion, never a separate review window.
  Known consequential labels/reasons
  are blocked, as are privileged/script URI entry in recognized URL fields.
  Labels and pixels cannot prove a control's hidden effect; ordinary-action
  approval is not authorization to send, pay, delete or change security settings.
  No dedicated consequential integration is enabled.
- Remembered Notepad denial applies here too. Explicit browser/site revocations
  create a persistent universal-browser block; any such block conservatively
  excludes all browser windows because UIA cannot reliably exclude an embedded
  origin. Clearing it requires an explicit separate action. Extension host grants
  remain separate and do not automatically grant computer access.
- Eight input actions, nine model decisions and 75 seconds per task; each native
  worker has a six-second deadline. Fresh identity, UIA revision, input activity
  and a 15-second observation lease are checked before dispatch. Dynamic UI
  changes can conservatively block a harmless action. Nothing is replayed.
- Exact standalone requests such as “open Notepad” or “launch Calculator” use a
  fixed app-launch path before observation. They still need the agreement and enabled access,
  app-denial checks, but no per-launch confirmation. They read no current-window text/images
  and make no reasoning-model request. The worker verifies the named ordinary
  app is foreground before reporting success. Compound goals still use the
  observe/act/check loop; there is no action fallback after a failed tree scan.
- Input completion/readback is distinct from goal completion. The model must
  check the intended effect in the next observation. Its verification can be
  wrong; inspect important results. Unknown dispatched input persists a minimal
  uncertainty flag and blocks another task until explicitly reconciled.
- Independent Stop aborts requests, rejects pending approval and terminates the
  disposable native worker. Cross-adapter fences prevent another route starting
  over an uncertain/unconfirmed executor. Changing display configuration stops work.
- Spoken approval uses the installed en-US recognizer, confidence 0.85, proposal
  identity and audio start/end boundaries. Speech outside a displayed proposal
  is replaced with silence for that detector, and late earlier speech cannot
  approve a replacement proposal. Background voices/playback may still trigger
  recognition; the preview does not authenticate a speaker.

Gemini uses the existing **gemini-3.1-flash-lite** model with Latham's structured
action schema and optional PNG input, not Google's built-in computer-use tool.
The supplied key passed real synthetic-window image/action/verification checks;
this does not guarantee quota, free access or reliability for other accounts.
There is no paid-model upgrade or fallback. The loopback Ollama adapter refuses
remote models and requires vision capability when images are selected. Its
actual local model/hardware acceptance remains open; no model was downloaded.

## Evidence and remaining acceptance

See [evaluation](evaluation.md) for the exact runs. Native acceptance includes a
real WinForms window, Chrome without an extension, stale-edit rejection, browser
denial propagation, masked window capture and live Gemini planning/verification.
The controlled Electron confirmation restores its selected synthetic window through the
normal Windows focus API and completes the edit. The actual Windows recognizer
recognizes synthetic approval audio with bounded timestamps. These are controlled
tests, not human-microphone or broad application studies.

10D remains open for physical hold-Ctrl speech and hands-free approval/Stop in
this new route, multiple unrelated real native apps and multi-step cross-app
goals, coordinate/scroll/key behavior across diverse apps, physical mixed-DPI
displays and a newly packaged build. Existing narrow-adapter acceptance does not
close these gates. OS focus refusal still causes a blocker, never a bypass.

## Shared computer-use loop

1. **Activate and understand.** Reuse hold-Ctrl voice capture and explicit
   hands-free sessions. Transcribe through the selected provider. A browser
   connection must not gate universal voice activation or screen questions.
2. **Observe.** Identify the current permitted foreground app/window or selected
   display. Use generic Windows accessibility controls and permitted screenshots
   as complementary inputs. Both must carry current window/process identity,
   display geometry, observation time and session/permission generation.
3. **Decide.** Give the user's request and current observation to a validated
   model. It proposes one typed action, completion, clarification or a blocker.
   A vision model's image understanding alone does not supply OS control.
4. **Act.** A Latham-owned Windows executor supports bounded click, scroll,
   type and reviewed key operations. Prefer a current accessible control where
   available; image-grounded coordinates require a fresh observation and valid
   window/display mapping. No provider-generated shell, JavaScript or native code.
5. **Check and repeat.** Observe after dispatch, distinguish verified, blocked
   and uncertain effects, and continue within main-owned step/time/request limits.
   User intervention, changed targets, Stop or lost helpers invalidates pending
   work. An uncertain dispatched action cannot be blindly replayed.

A Chrome DOM adapter can remain an optional accuracy aid. It must be presented
as an additional route; failure or rejection cannot silently switch permission
scope. Universal mode is selected deliberately and has its own clearly explained
desktop observation/control consent, not an automatic fallback after a denial.

## Permissions and user control

Scope capture to the selected window/display and active task. Explain that cloud
vision sends its visible contents to the selected provider; existing permission
to transcribe speech or choose text candidates is not screen-sharing consent.
Keep local mode explicit and validate an installed vision-capable model before
claiming local computer use. Do not download models or substitute providers
silently. Do not retain screenshots, typed text or transcripts in routine logs.

Existing recorded app/site denials remain effective under the relationship
documented above. Extension grants and native context consent are separate;
a broad desktop toggle cannot clear a recorded denial. Revocation from settings,
browser grants or reconnect reconciliation propagates into the universal block.
Historical removals predating this record cannot be reconstructed from the old
grant-only file; users can add a universal process block or exclude browsers.
Screen contents are untrusted task data, never authorization.

Keep Stop independent of model calls and renderer health. PTT closes the mic
after release; voice interruption during processing requires the explicitly
enabled hands-free/local-stop path. Confirmation for sending, purchases, deletion
and other consequential operations must be a separately implemented local
approval flow with exact-action revalidation; until then those operations remain
blocked. Secure fields/desktops, UAC, login/security prompts and elevated apps
remain unsupported or require human handoff. Windows input/focus restrictions
must be reported, not bypassed.

## Phase 10 delivery and acceptance

| Step | Deliverable | Evidence required |
|---|---|---|
| 10A | Independent universal-mode activation, explicit capture consent and screen understanding | No extension needed; no idle capture; no capture/provider transmission before consent; revoked/denied scopes blocked |
| 10B | Generic Windows observation and input broker | Real controls across multiple ordinary apps; fresh coordinate/DPI/window checks; secure/elevated exclusions; wrong-window and interruption tests |
| 10C | Model-driven observe/act/check loop | Multiple-step goals across apps, ambiguity handling, bounded budgets, provider failures, independent Stop and no replay after cancellation |
| 10D | End-to-end voice companion acceptance | Physical Ctrl/mic and hands-free checks, visible result/error feedback, Chrome without the extension, multiple native apps and mixed-display acceptance where hardware exists |

Start with controlled fixtures and low-consequence tasks, then demonstrate the
same generic engine in multiple unrelated apps. A short acceptance set measures
the engine; it must not become a collection of hardcoded scripts advertised as
universal reasoning. Report actual coverage, model errors, latency and resource
use separately. Existing Windows focus failures remain real engineering work.

The live Phase 10 Gemini checks validate the supplied key/model against synthetic
window text/image action reasoning. They do not establish free-tier access,
future quota or cost for every account. No paid access/provider switch is made.
AI-provider choice and the Windows execution engine remain separate components.

## Reference checks

Latham stays independently implemented. No reference source, prompts or assets
are copied, and no reference project is adopted as its foundation.

- [jev-use README](https://github.com/savka777/jev-use/blob/main/README.md),
  reviewed SHA `9a1e631cb3a15415fb0a3bb0e49ce3b16b185ee6`: describes a macOS
  accessibility-driven read/choose/act/check loop without screenshots. This is
  conceptual evidence, not a Windows library or proof of Latham's behavior.
- [Gemini computer use](https://ai.google.dev/gemini-api/docs/computer-use):
  screenshot-based proposed desktop actions still need a client-side executor.
  Supported models and access must be checked during implementation.
- [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding):
  image interpretation is an input capability, not automatic OS interaction.
- [Windows SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput):
  input synthesis has integrity-level and existing-key-state restrictions.
