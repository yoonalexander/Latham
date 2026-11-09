# Windows helper

`NativeHost.cs` is Latham's independently written, non-elevated native-messaging
framing relay. It checks Chrome's extension-origin argument, reads a protected
current-user connection config, and relays bounded JSON frames between stdio
and the desktop application's duplex named pipe. It exposes no shell or UIA API.

`scripts/build-host.mjs` uses Windows' .NET Framework compiler. The tested
runtime is Framework 4.8; asynchronous pipe handles are required for concurrent
read/write without blocking replies. The hello advertises protocol 2; the
desktop rejects incompatible relays/extensions. See [setup](../../docs/phase2.md).

`DesktopAgent.cs` is the separate Phase 3 desktop supervisor and disposable MTA
UIA worker. It accepts only the compiled Notepad profile through inherited stdio,
with a current-user cancellation event, bounded traversal and verification.
The supervisor contains no UIA calls or windows; Stop terminates the worker and
acknowledges exit. It shares the existing Framework 4.8 compiler/runtime, avoiding
an additional SDK requirement. General app coverage is not enabled. See
[desktop setup](../../docs/phase3.md).

`SpeechDetector.cs` is the fixed-phrase recognizer, compiled separately
for an installed Windows System.Speech en-US engine. Independent child
processes consume bounded PCM pipes for stop, optional wake and universal-session
approval. They have no
microphone, network or action API; health/progress monitoring and detector exit
cause main to cancel hands-free sessions. See [hands-free setup](../../docs/phase4.md).

Its separate `preview` role uses DictationGrammar/SpeechHypothesized to emit
bounded provisional words from active PCM only. It never emits action matches,
uses the installed selected-language recognizer and disables acoustic adaptation
for that process. Main rejects late events and preview failure does not cancel
the independent fixed Stop grammar or final ASR. No audio/text files or network
calls are used. See [live words](../../docs/companion.md#live-words).

`ControlKey.cs` is the independent Ctrl push-to-talk gesture helper. Local
keyboard/mouse hooks pass through input and report only fixed Ctrl gesture and
health states, never key codes, characters or pointer positions. Injected Ctrl
cannot activate it; other keys/clicks/wheels cancel the gesture. It exits on
parent-pipe closure. Main applies the hold delay, capture deadline and cancellation
fence. It has no microphone, network, execution or injection API. See
[companion controls](../../docs/companion.md).

`ComputerAgent.cs` is the separate Phase 10 foreground-window worker. One bounded
request observes UIA text/values and optional masked PrintWindow PNG, restores an
approved window, or applies one reviewed bounded action. Main supplies scope,
identity and deadlines, validates replies and kills the worker on Stop. Its UIA
bounds are physical pixels; target-aware rendering dimensions map image masking
and normalized click grounding correctly for DPI-unaware windows too. No window
enumeration, idle capture, arbitrary shell/code or full-desktop capture fallback
is exposed. The existing DesktopAgent remains the narrower Notepad adapter.
SpeechDetector additionally recognizes local approval with bounded audio positions;
main binds that audio to the current one-use proposal. See
[universal desktop scope and evidence](../../docs/universal-desktop.md).

`ImageOcr.cs` is the disposable Phase 5 Windows OCR adapter. It consumes one
bounded encoded image from stdin, uses installed WinRT OCR/imaging components,
and returns bounded English text. It cannot capture the screen or receive a file
path. Main enforces its deadline and termination. Its Framework/WinMetadata
compile references come from Windows; no SDK download is needed. See
[visual setup](../../docs/phase5.md).
