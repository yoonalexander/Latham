# Cursor companion

First launch opens a one-time terms/permissions setup. After acceptance, Latham
opens as a small transparent glyph beside your cursor; Settings stays hidden.
Universal access/provider choices and disable state are remembered. The cursor follower is
click-through and cannot take focus from the app you are using.

The first Settings request waits for the renderer's mounted UI before showing
the window, and native show/focus is deferred until the tray callback returns.
Work-area bounds and minimum size are prepared before showing/restoring; the
native show event does not resize the window.
The development launcher leaves GUI visibility to Electron rather than applying
a hidden Windows startup flag. Settings shows with `showInactive()` followed by
explicit focus, including when an external launcher starts the app hidden.
An early startup click is kept pending and opens Settings once ready; no second
click is required. A minimized Settings window is restored when requested.

If Ctrl shows **Check the last task**, Latham has an unverified action from an
earlier task. Check the app you were using, open tray **Settings…**, and select
**I've checked — continue** in the recovery card at the
top. This enables a fresh command without replaying the old task. Agreement
acceptance does not clear this separate recovery state. If the previous input
worker has not stopped, the card explains why Continue is disabled.

## Live words

In **Gemini key mode**, active utterance audio streams to Google's
`gemini-3.5-transcribe-live` model. The same recognizer supplies interim captions
while speaking and committed words after release/speech-end. There is no second
batch-transcription request or Windows guess in this route. Only committed text
from the released utterance can enter the command path. Live setup has a
five-second deadline and finalization a four-second deadline after setup;
failure stops the turn without silently selecting another model. Google lists a
[free tier](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-transcribe-live),
but account access, quotas, network conditions and provider terms still apply.

In **local/managed mode**, a separate installed Windows recognizer still supplies
display-only provisional text. Local Whisper or the selected managed service
supplies the final transcript. That preview can differ from the final words;
missing/unsupported Windows language engines do not disable the final provider.
Local-only audio never takes the Gemini live route. Fixed Stop/wake/approval
detectors remain separate and local in every mode. Wake-idle audio never enters
either transcription route.

The caption says **Live transcript · may change**, then **Finishing transcript…**
on release. Final words remain for eight seconds; Stop/new activation clears
them. No audio/transcript history or model download is added. Speech language
and vocabulary settings are passed as recognition hints. These controls apply
to Settings recordings and explicitly enabled hands-free commands too.

Windows recognition hypotheses use
[SpeechHypothesized](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine.speechhypothesized?view=netframework-4.8.1)
with a separate
[DictationGrammar](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.dictationgrammar?view=netframework-4.8.1).

| State | Appearance |
|---|---|
| Idle, microphone off | Three rounded vertical bars: short–long–short |
| Listening, silence | Three dots |
| Listening, speech | Dots extend into bars driven by actual microphone energy |
| Transcribing, executing or verifying | Three orbiting dots |
| Finished, stopped or blocked | Original idle bars; brief status notice |

Windows reduced-motion preference stops the orbit and transition animations.
Switching above/below or left/right of the cursor now eases over 220 ms in one
rendering layer. A 12-DIP return margin prevents repeated flipping at a boundary,
and an interrupted switch continues from its current visible position. Normal
cursor movement stays immediate. Extra transparent, click-through window space
contains both placements during the transition; the visible glyph and brief
notice retain their original size. Reduced motion skips the placement animation.
No decorative waveform simulates microphone activity. The idle follower collects
only local cursor/display coordinates for its own placement, without screen capture.

## Controls and setup

- **Hold Ctrl**: after 250 ms alone, Latham starts capture. Speak when the
  microphone is ready, then release to close capture and process one command.
  Pauses while holding do not submit early. Either Ctrl key works; if both are
  held, release both. Quick taps, additional keys, mouse clicks/wheels and a
  missed release discard the recording. This preserves ordinary Ctrl shortcuts
  and selections. Holding while a command is processing does not queue another.
  Capture cancels at 15 seconds rather than submitting automatically.
- **Ctrl+Alt+Space** or tray **Talk · one command**: an alternative that authorizes one spoken command.
  Speak, then pause. About 0.8 seconds of silence ends the utterance. The existing
  provider transcribes it, the approved target executes/verifies it, then capture
  turns off. Another activation is needed for the next command. Pressing Talk
  during capture or processing stops the current turn instead.
- **Ctrl+Alt+.**, tray **Stop**, or the settings Stop button: cancel independently
  of the microphone, renderer and model. The existing English local
  **stop assistant** detector also stays active while capture is open. Ctrl
  release closes the detector with the microphone; use the hotkey or tray to
  stop processing after release.
- Tray **Settings…**: stops current work and opens provider, microphone,
  permissions, detailed results and advanced controls. **Back to companion**
  hides settings and pauses work. The **Try listening** button in General
  starts the silence-ended alternative and hides settings once capture starts.
- Tray **Command app**: Universal computer use (default), the optional browser
  extension, or an explicitly prepared Notepad editor. Selection does not grant
  computer context, a site or editor permission.
- **Ctrl+Alt+Enter**: confirm the current universal companion question. During an
  explicitly enabled universal hands-free session, “approve action” is the
  local voice alternative. Neither can approve an expired/replaced proposal.
- Uncheck tray **Follow cursor** to keep the glyph at the current display's
  right edge. **Show companion** restores it; **Hide companion** also stops work.
  **Quit Latham** exits. Nothing automatically captures audio on launch/restart.

Choose **Enable Latham** in Settings to permit active-app access. Try
**Open Notepad**, or choose **Set up voice** and connect Gemini with your key.
**App access** contains window images, browser access, and app blocks.
**Advanced settings** contains local Whisper, Ollama setup, and optional
managed speech. [Universal setup and permissions](universal-desktop.md)

The optional older browser route still requires its connection and explicit
site approvals; prepared Notepad keeps its field binding. **scroll down**,
**search piano music** and **click first result** on reviewed profiles remain
legacy commands. The shared engine runs explicit simple commands directly and
asks once beside the icon for longer tasks. Image-coordinate clicks still ask
separately, showing a marked preview. The question stays still and offers Continue
and Cancel; it expires after 30 seconds. Broad real-app and physical voice acceptance is still open; no TTS
or automatic microphone restart is added.

**Save Gemini setup** and development-key import save both the key and the
selected AI settings. Previously **Store key** saved only the encrypted key,
leaving the saved mode at local unless **Save AI setup** was also pressed. The
corrected flow is covered by an isolated UI/persistence regression. No existing
key is printed or substituted. Before setup completes, the companion names the
missing local speech setup or browser connection. A failed activation shows its
specific setup/review reason again on each attempt.

For native commands, prepare the specific approved Notepad editor in Settings,
select Prepared Notepad in the tray, focus that editor, then activate Talk.
Closing settings normally pauses and clears native bindings; prepare again
when necessary. A native turn still requires current focus/control binding and
verified UIA support. Windows focus refusal remains a blocker, not a fallback to
keyboard injection. See [native support and limits](phase3.md).

Continuous hands-free remains a separate Settings opt-in. Its start button still
authorizes consecutive commands; it is not enabled by showing the companion.
Shortcuts can conflict with other software; the companion notice reports a failed
Talk registration and the tray remains available. The existing settings warning
reports a failed Stop registration.

## Implementation and evidence

The native Ctrl helper passes through keyboard/mouse events and reports only
fixed gesture/health states. It never transmits characters, key codes or pointer
coordinates. Injected keystrokes cannot activate it; startup with Ctrl already
held requires a fresh press. Main debounces gestures, cancels late activation
after release, and closes held turns on helper failure/health loss. The helper
exits when its parent pipe closes. No npm dependency or driver is added.

The companion has its own sandboxed preload and exact local-URL IPC guard.
It receives minimal presentation/session state, never credentials or transcripts.
Audio permission requires a visible explicitly activated owner; the two renderers
cannot feed each other's capture. It reuses the existing bounded audio path and
local Stop detector; single-command mode ends after verification. Hide, crash,
display changes, target invalidation and Stop cancel work; late replies are fenced.

`npm run check` passes type checking, **112 unit/boundary tests** and the Windows
build. Eleven targeted Electron/browser cases pass, including hidden-settings default startup,
transparent pixels/non-focusable/always-on-top state and idle media denial;
real getUserMedia with a synthetic input device, dots/bars/orbit, one verified
browser scroll, ownership isolation, mic shutdown, delayed-reply Stop and hide;
existing settings hold-to-talk/Stop; keyboard/display/feedback; continuous
hands-free/local Stop and wake detection; microphone disconnect; field-binding
invalidation; fixture policy/redaction; persisted consent and native browser pairing.
The first run exposed test assumptions about window order and native color/DPI
reporting; tests now select settings by URL and check actual transparent pixels.
These are fixture and synthetic-audio results. A real person's microphone,
physical multi-display/mixed-DPI behavior and packaged release are not newly
certified by them. Existing Phase 9 release ZIPs remain unchanged.

The cursor-edge regression additionally moves the real Electron window 80 times
and checks its width/height remain stable, then checks glyph proximity at all four
screen corners. The earlier `setPosition` path grew the frameless window under
the current Windows display scaling (108 DIP taller after 80 moves), pushing the
glyph away when edge clamping ran. Moves now supply fixed width and height via
`setBounds`, preventing cumulative native size drift. This covers the installed
display configuration; physical multi-monitor/mixed-DPI acceptance remains open.

The movement regression samples the rendered glyph throughout the switch and
checks for intermediate positions, bounded frame-to-frame movement, return
movement, reversal before completion, boundary jitter and reduced-motion behavior.
Corner proximity is checked after the short transition settles. These checks use
the real Electron window/compositor with controlled cursor positions.

Ctrl push-to-talk passes the full **121-test** type/unit/build check, including
quick taps/chords, repeated Ctrl events, release, pending activation cancellation,
silent holds, release-only transcription, the 15-second cap, late-reply Stop,
malformed helper events, health loss and helper exits.
Native helper readiness/health/parent-pipe exit and existing companion/voice
regressions are checked separately. Physical Ctrl-key and human microphone
acceptance are not implied by the deterministic gesture tests.

## Inspiration and provenance

The [Clicky README](https://github.com/farzaa/clicky/blob/main/README.md) describes
a cursor companion with a separate control window. The
[Capri Desktop README](https://github.com/lachydotmcg/capri-desktop) demonstrates
a resident desktop companion with separate controls. These informed interaction
research only. Latham's glyph, CSS, window/capture integration and assets are
independently authored; no reference code, mascot, model or asset is imported.
Window behavior uses existing Electron APIs:
[BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
and [screen](https://www.electronjs.org/docs/latest/api/screen).
The independent Ctrl helper uses Microsoft's
[low-level keyboard hook](https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelkeyboardproc),
[mouse hook](https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelmouseproc)
and [key-state API](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getasynckeystate).
