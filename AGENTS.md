# Repository Guidelines

## Project Structure & Module Organization

Latham is a Windows-first Electron/React/TypeScript assistant with npm workspaces.

- `apps/desktop/src/`: Electron main, preload, and renderer UI/static assets.
- `apps/chrome-extension/`: Manifest V3 permissions and scoped DOM operations.
- `packages/`: shared contracts, orchestration, observations, actions, decisions, speech, and deferred planning.
- `services/windows-helper/`: C# Chrome relay, UIA agent, and speech detectors.
- `tests/`: security/boundary tests, Electron integration tests, and controlled fixtures.
- `scripts/` builds/packages; `docs/` records architecture and evidence. Generated output belongs in ignored `dist/` and `.test-artifacts/`.

## Build, Test, and Development Commands

Use Windows and Node.js 22+. Run from the repository root:

- `npm ci`: install locked dependencies.
- `npm run setup:electron`: prepare the pinned Electron runtime.
- `npm run dev`: build desktop/native components, then launch; `npm start` runs the existing build.
- `npm run check`: typecheck, run Vitest, and build.
- `npm run setup:browser`: prepare integration browsers.
- `npm run evaluate`: typecheck, unit tests, and Playwright integration flows.
- `npm run package:preview`: create local unsigned Windows/extension ZIPs and checksums.

## Coding Style & Naming Conventions

Follow adjacent code: two-space TypeScript indentation, four-space C# indentation, double-quoted TypeScript strings, semicolons, camelCase TypeScript functions/variables, and PascalCase types/components/C# methods. Preserve strict TypeScript settings and runtime IPC validation. Use kebab-case filenames where established, such as `provider-store.ts`. No formatter or linter is configured; avoid unrelated reformatting.

## Testing Guidelines

Vitest discovers `tests/security/**/*.test.ts`; Playwright uses `tests/e2e/*.spec.ts`. Add focused behavior tests for changed policy, cancellation, provider, or adapter logic. Run one suite with `npm test -- tests/security/setup.test.ts`. No numeric coverage threshold is configured.

Native integration tests require an interactive Windows desktop and run serially. Report focus failures and skipped checks explicitly. For acceptance work, read `docs/evaluation.md` and distinguish fixture, live-provider, physical-microphone, and packaged evidence.

## Commit & Pull Request Guidelines

Use concise imperative subjects matching history, for example `Implement Phase 4 opt-in hands-free sessions`. Keep commits focused. PRs should describe behavior, link relevant issues/design sections, list validation and limitations, and include screenshots for UI changes.

## Security & Architecture Boundaries

Before changing permissions, IPC, dictation, or execution, read `Latham_Design_Document.md` and `docs/threat-model.md`. Preserve explicit activation, field binding, independent Stop, and verified results. Keep credentials in DPAPI/ignored `.env.local` and raw audio/transcripts out of logs. Reference-app code remains separate; record library/model provenance in `docs/dependencies.md`. Handy integration is planned in design section 6.1.1, not implemented.
