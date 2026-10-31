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

`SpeechDetector.cs` is the Phase 4 fixed-phrase recognizer, compiled separately
for an installed Windows System.Speech en-US engine. Two independent child
processes consume bounded PCM pipes for stop and optional wake. They have no
microphone, network or action API; health/progress monitoring and detector exit
cause main to cancel hands-free sessions. See [hands-free setup](../../docs/phase4.md).
