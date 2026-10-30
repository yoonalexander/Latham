# Desktop application

Reserved Electron + React + TypeScript application. Source boundaries are
`src/main`, `src/preload`, and `src/renderer`.

The main process will own orchestration, secrets and provider calls; the preload
will expose a narrow typed bridge; the renderer will own user feedback/settings.
Node integration stays disabled in the renderer and context isolation stays on.
These are design requirements, not implemented runtime settings.

The entry points are empty scaffold modules. No Electron/React runtime or launch
command exists yet. Begin implementation in Phase 0.
