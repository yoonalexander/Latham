# Windows helper

Reserved for the current-user, non-elevated native messaging/launch/focus host.
General Windows UI Automation and desktop-app input begin in Phase 3, after the
Chrome MVP. This directory has no .NET project or executable yet.

Select a supported .NET SDK when implementing the helper. Keep the control path
responsive, validate IPC ownership and schemas, and preserve cancellation and
unknown-effect semantics. This directory does not grant OS control.
