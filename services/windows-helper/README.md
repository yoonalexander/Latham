# Windows helper

`NativeHost.cs` is Latham's independently written, non-elevated native-messaging
framing relay. It checks Chrome's extension-origin argument, reads a protected
current-user connection config, and relays bounded JSON frames between stdio
and the desktop application's duplex named pipe. It exposes no shell or UIA API.

`scripts/build-host.mjs` uses Windows' .NET Framework compiler. The tested
runtime is Framework 4.8; asynchronous pipe handles are required for concurrent
read/write without blocking replies. See [setup](../../docs/phase1.md).
The future general Windows UI Automation worker remains Phase 3 and may use
.NET 8+ independently of this small bootstrap relay.
