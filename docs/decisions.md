# Decision index

The [technical design](../Latham_Design_Document.md) defines the product contracts;
the [roadmap](../roadmap.md) defines sequence.

| Topic | Current decision | Location |
|---|---|---|
| Project foundation | Independent Latham code/assets; reference repos remain conceptual | Design 1.2 |
| First scope | Chrome on Windows; desktop applications next | Design 1.1 and roadmap |
| Phase 0 execution | Bundled local fixture only, no live-site/OS adapter | architecture.md |
| UI | Electron/React command desk with tray and always-available Stop | apps/desktop |
| Permissions | Fixture consent persists; every launch stays paused | core and main/storage |
| AI access | Gemini user key; whisper.cpp base.en plus Ollama Qwen2.5 1.5B locally; no silent fallback | phase2.md |
| Cancellation | Local controller fence; preserve in-flight uncertainty and require reset | core |
| Logs | Off-by-default bounded metadata, no command/page values | storage and evaluation |
| Website grants | Remembered optional Google/YouTube grants intersect Latham consent; start paused | phase2.md |
| Native relay | Own C# .NET Framework stdio/duplex-pipe Chrome relay; separate desktop agent | NativeHost.cs |
| Final utterances | Push-to-talk uses reviewed explicit dispatch; opt-in hands-free automatically dispatches one final command at a time | phase4.md |
| Chrome page scope | Root-only compiled profiles for signed-out English Google Search/YouTube; current document/control/epoch required | phase2.md |
| Dictation | Prepare Search, record under that binding, explicitly append/replace; guarded correction/undo | phase2.md |
| Unknown effects | Persist uncertainty before mutation; reconcile explicitly after failed verification/restart; never replay | browser-controller and native-bridge |
| Local speech retention | Bounded stdin/stdout; no temporary audio/transcript files | speech/providers.ts |
| Preview distribution | 0.4.0 unsigned portable Windows x64 ZIP plus unpacked MV3 extension; Chrome protocol 2 | phase4.md |
| Native scope | Same-user unelevated Notepad document text only; per-app approval and block override; browsers/other apps excluded | phase3.md |
| Native runtime | Framework 4.8 supervisor plus disposable non-window-owning MTA UIA worker; no new .NET SDK | DesktopAgent.cs |
| Native cancellation | Priority current-user event, worker exit acknowledgement, persisted uncertainty before dispatch and no replay | desktop-controller.ts |
| Hands-free | Explicit non-persisted sessions; 90-second idle/five-minute cap; existing app permissions only | phase4.md |
| Stop and wake | Separate Windows System.Speech en-US processes; local fixed grammars; no idle cloud audio; detector/mic failure cancels | phase4.md |
| Speech resources | Two CPU threads by default; preflight installed GGML model; configurable language and vocabulary; no resident ASR server or auto-download | phase4.md |
| Playback | No assistant TTS output while hands-free is active; no speaker-identity guarantee | phase4.md |

## Phase 0 provenance and release checkpoint

Direct dependency versions/licenses are recorded in [dependencies.md](dependencies.md).
The application, fixtures, UI and icon were implemented independently. No
reference-app code/assets or models are included. Dependency/runtime downloads
are explicit development setup; generated bundles and test data are not committed.

This checkpoint establishes provenance records, not a new distribution license.
Latham's source license, contributor terms and installer distribution terms
remain unselected. Review them before accepting external contributions,
advertising a licensed public release, distributing a packaged installer, or
adding third-party/model material. The user's requested source commit/push
does not imply a choice of license or completion of a legal review.

The Phase 2 preview's site-task set and local package/recovery mechanics are
published in [phase2.md](phase2.md). Remaining decisions include proven minimum
hardware, additional speech languages, signed distribution and update mechanics.
The small model corpus is setup evidence, not a general accuracy claim.
