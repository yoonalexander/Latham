# Desktop foundation

Phase 0 is implemented. The main process owns the local controller, fixture
executor, settings, diagnostics, tray, stop shortcut, and guarded IPC.
The sandboxed preload exposes named operations only; the React renderer never
receives generic IPC, Node APIs, secrets, or an OS-execution capability.

The fixture uses a separate sandboxed WebContentsView and no preload. Both
surfaces use an in-memory session and an allowlisted custom protocol serving
bundled files only. Runtime network/permission requests and popup navigation are
denied. This is not a general-purpose browser.

Run `npm run dev` at the repository root. See the root README for commands and
`tests/e2e/desktop.spec.ts` for acceptance coverage. Production packaging, speech,
real Chrome access, and provider credentials are not part of this phase.
