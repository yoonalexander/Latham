# Latham development handoff

November 9, 2026. This checkpoint includes the Windows companion redesign and
the Phase 10 implementation preview. Remaining work includes launch reliability,
acceptance on real hardware, and a fresh package. Start with [the roadmap](../roadmap.md) and
[the Phase 10 guide](universal-desktop.md) for scope.

## Set up the new PC

Use an interactive Windows 11 desktop, Git, and Node.js 22 or later. The native
build uses Windows' .NET Framework C# compiler under `%WINDIR%\Microsoft.NET`.
Run from PowerShell:

```powershell
git clone https://github.com/yoonalexander/Latham.git
Set-Location Latham
npm ci
npm run setup:electron
npm run dev
```

For an existing checkout, switch to `main` and use `git pull --ff-only origin main`
in place of cloning. `npm run dev` rebuilds the app and helpers. `npm start`
runs the existing build. Quit Latham from the tray before rebuilding so Windows
releases the native executables.

On first launch, choose **Enable Latham** and try **Open Notepad**. Choose
**Set up voice**, enter your key, and select **Connect Gemini**. The key import
is under **Voice → Development setup**. Create an ignored `.env.local` from
`.env.example`, set `GEMINI_API_KEY`, and use **Import GEMINI_API_KEY from
.env.local**. Open **App access** for window image and browser access controls.

Set up the new Windows profile independently. Re-enter credentials and confirm
permissions there. Windows protects saved keys with DPAPI, so copying the old
Electron profile is unsuitable for migrating keys. The Git checkout provides
source and lockfiles. Recreate `dist/`, `node_modules/`, and `.test-artifacts/`
locally. Local speech is optional and needs the configured whisper.cpp binary
and model. Local reasoning uses a separately configured loopback Ollama model.

## Smoke test and continue

1. In an ordinary Windows app, hold **Ctrl**, say “open Notepad”, and release.
   Check that words appear while you speak and that Notepad comes to the front.
   Minimize Notepad and repeat. Try “open Calculator” too. Those two standalone
   commands are the current direct launch allowlist.
2. Open **Settings…** from the tray on the first try after a cold start. Confirm
   it paints and stays open. Back in the companion, move the cursor near the
   bottom edge and check that the companion changes sides smoothly.
3. Try **Ctrl+Alt+.** while the companion is listening or working. If an earlier
   action is uncertain, inspect its result and select **I've checked — continue**
   under **Universal assistant**. The previous command is never replayed.
4. Continue with the [Phase 10D acceptance checklist](../roadmap.md#phase-10d-acceptance-checklist).
   Startup and shutdown passed. Resume with native editing on a desktop that
   grants foreground focus, then continue the real-device and package checks.
   See the [November 11 results](evaluation.md#phase-10d-windows-acceptance--november-11-2026).

## Checks

```powershell
npm run check
node scripts/build-native-fixture.mjs
npx playwright test tests/e2e/computer-native.spec.ts --project=native --grep 'existing background and minimized|direct native launch|Electron opens (Notepad|Calculator)'
```

Run native tests with the desktop unlocked and avoid changing focus while they
run. For the full integration suite, run `npm run setup:browser` followed by
`npm run evaluate`. The full suite builds the fixture and generates synthetic
speech. Live Gemini cases are opt-in with `LATHAM_LIVE_GEMINI=1` and use the key
in `.env.local`. For the live speech case alone, generate detector fixtures with
`powershell.exe -NoProfile -File scripts/generate-detector-fixtures.ps1` and run
the `live Gemini streams` case in `computer-native.spec.ts`.

At handoff, `npm run check` passed type checking, all 154 tests, and both
builds. In the focused Windows run, Electron opened Notepad and the native
regression verified foreground activation and restore of the same Notepad
window. The separate direct Notepad launch hit `computer_provider_timeout`.
The Calculator case returned `computer_result_unknown`. Re-run these on the
new PC before treating app launch as reliable. The
[November 9 follow-up](evaluation.md#phase-10d-launch-and-shutdown-follow-up--november-9-2026)
records the Calculator fix, repeated interactive launch checks and the remaining
editing and shutdown checks.

## Where to work

| Area | Entry points |
| --- | --- |
| Companion and hold Ctrl | `apps/desktop/src/main/companion.ts`, `control-hold.ts`, `services/windows-helper/ControlKey.cs` |
| Speech capture and streaming | `apps/desktop/src/main/voice.ts`, `speech-preview.ts`, `packages/speech/src/live-transcribe.ts` |
| Universal task policy and Windows actions | `apps/desktop/src/main/computer.ts`, `services/windows-helper/ComputerAgent.cs` |
| Restore and verify opened windows | `services/windows-helper/AppWindow.cs`, shared by the universal and legacy Notepad helpers |
| Design and safety | [Design](../Latham_Design_Document.md), [threat model](threat-model.md), [repository guidelines](../AGENTS.md) |

Gemini key mode uses one live stream for interim and final speech. Only the
final transcript can trigger a task. Exact Notepad and Calculator launches
skip the reasoning model and current-window tree scan. The shared launch helper
looks for an existing eligible window, restores it if minimized, and verifies
it is foreground. If Windows refuses, the task reports failure or uncertainty.
Longer tasks use the companion confirmation. Image clicks have their own
confirmation. Preserve explicit activation, target binding, and independent
Stop when changing these paths.

The prior laptop tests verified synthetic Gemini streaming, native Notepad
foreground activation and restore, and the extension-free computer-use path in
controlled windows. See [evaluation](evaluation.md) for run details and limits.
Physical acceptance on the new PC is open. Handy integration is still a design
plan. Public managed hosting, billing, signing, and other operating systems
remain separate release work.
