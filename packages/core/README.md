# @latham/core

Implemented Phase 0 controller: paused by default, explicit fixture scope,
one serialized command path, per-turn cancellation, permission/executor
epochs, operation deadlines, and a bounded metadata trail.

Observation is scope-gated. Every mutation uses a locally checked profile and
fresh binding; verification failure or unknown dispatch requires reset.
Stop/Pause invalidates queued and delayed work. An already begun adapter call
may have effects and is reported separately rather than treated as rolled back.

The controller depends on a narrow executor interface and has no Electron,
filesystem, microphone, cloud or arbitrary OS-execution dependency.
