# Implemented architecture

Status: local fixture plus Phase 1 voice/provider and Chrome setup.
The [technical design](../Latham_Design_Document.md) defines broader contracts;
the [roadmap](../roadmap.md) defines delivery order.

```mermaid
flowchart LR
  UI[React command desk] --> Bridge[Named preload operations]
  Bridge --> Main[Main-process controller]
  Main --> Scope[Session and scope gate]
  Scope --> Observe[Validate root-document snapshot]
  Observe --> Route[Deterministic command and target]
  Route --> Policy[Local effect profile]
  Policy --> Fence[Cancellation and binding checks]
  Fence --> Fixture[Sandboxed local fixture]
  Fixture --> Verify[Observe expected effect]
  Verify --> Main
  Stop[Button / tray / global shortcut] --> Main
```

## Process ownership

- The main process owns settings, controller state, local authorization, the
  executor, tray, and stop shortcut. Storage is isolated from the renderer.
- The sandboxed, context-isolated preload exposes named commands, settings and
  state subscription. IPC validates top-frame sender identity and payloads.
  It does not expose generic channels, file access or code execution.
- The React shell shows state, the last result, target summaries and a bounded
  metadata trail. It sends command strings, never authorized action objects.
- A separate WebContentsView displays the bundled fixture without a preload or
  Node integration. A fixed custom protocol map serves bundled resources;
  navigation, popup, network and permission requests are denied.
- The browser partition is in-memory. Explicit settings and opted-in diagnostic
  metadata are the application's persistent records.

## Module boundaries

| Module | Implemented responsibility |
|---|---|
| contracts | Typed states, requests/results and runtime boundary parsers |
| core | Serial queue, session scope, epochs, deadlines and cancellation fence |
| observations | Observation validation, redaction, identity/revisions |
| decisions | Bounded deterministic fixture grammar and target selection |
| actions | Reviewed fixture profiles and expected-effect assertions |
| desktop main | Concrete fixture transport, storage and guarded IPC |
| desktop renderer/preload | Command desk, settings, status and narrow bridge |

Visual grounding, DOM website actions, general native UIA and planning remain
later phases. The diagram above describes the fixture path only.

## Phase 1 ownership

The renderer owns bounded audio capture and physical press/release. It sends
PCM16 through named preload operations. Main owns turn IDs, abort/deadline
signals, final transcripts, provider routing and Windows DPAPI key storage.
Gemini requests originate only in main; local mode uses a trusted whisper.cpp
child and fixed loopback Ollama endpoint, with no cloud fallback. Provider
output is a validated candidate ID/abstention, never an authorized action.

The Chrome MV3 worker owns optional host grants and actual tab API calls.
Explicit popup gestures request access; main consent and Chrome grants are
reconciled on connection/removal. The independently implemented C# host only
frames stdio/duplex-pipe messages. Pairing checks the extension origin and a
session token in a current-user-only config directory.

Chrome execution has its own epoch and single outstanding request. Stop
invalidates it locally, then the extension acknowledges the paused epoch.
UI reports an unconfirmed fence until that acknowledgement arrives. Unknown
in-flight effects block resume until the user inspects Chrome and clears the
uncertain result. Disconnects never replay commands. All physical Stop entry
points cancel fixture, speech and Chrome work together.

See [protocol and data destinations](phase1.md) and [evaluation](evaluation.md).

## Execution and cancellation

A command is scope-gated before observation. A capture receives unique target
IDs, document identity and current permission/executor epochs. The local profile
checks the target's known role/name and permitted effect. After the configured
test delay, the controller rechecks cancellation immediately before adapter
invocation; the fixture rechecks document, node identity and control revision
inside the same browser call that mutates the target.

Stop invalidates queued/delayed work and aborts waiting operations. Its local
fixture fence is immediate because that path has no separate native executor. Calls
already begun may still have effects; deadlines, lost replies and cancellation
preserve dispatched/unknown states and do not trigger automatic retries.
Unknown effects require reset to a freshly loaded fixture before another session.

The two-step search reacquires state between filling the field and submitting
the fixture query. Click verification requires a fresh expected result, not
merely a pre-existing success label.
