# Voice, providers and Chrome setup

This records the Phase 1 configuration. For the current preview use
[Phase 2 setup](phase2.md): it recommends base.en, adds reviewed DOM/dictation,
uses relay protocol 2 and removes temporary local-ASR audio files.

Phase 1 is an internal development milestone. It connects speech and basic
browser controls; DOM observation, clicking website controls, scrolling and
field-bound dictation belong to Phase 2. Google Search and YouTube are optional
navigation origins here, not advertised site-task support.

## Run and configure

From the repository root on Windows with Node 22+:

```powershell
npm ci
npm run setup:electron
npm run dev
```

The build compiles Latham's own small C# relay using Windows' .NET Framework
compiler, without a separate .NET SDK. Windows .NET Framework 4.8 is the tested
runtime; this is a relay, not the future Phase 3 UIA helper.

Scroll to **Voice & Chrome**. Choose a route and **Save AI setup**. Saving,
changing/removing a key, Stop, hiding the window and exit invalidate speech
turns. Both routes show one final transcript; nothing executes automatically.
Use **Use transcript as Chrome command**, inspect/edit it, then explicitly run.

### Use my API key — Gemini

The supported cloud model is `gemini-3.1-flash-lite`, via Google's
`generateContent` endpoint. Audio is a bounded inline WAV request after key
release. Selection sends only the instruction and supplied candidate labels,
roles and IDs. No website content is captured by this phase.

Enter the key in the app and choose **Store key**, or, in a development checkout,
create ignored `.env.local` with `GEMINI_API_KEY=...` and choose **Import
GEMINI_API_KEY from .env.local**. Import reads only that variable. The app does
not return the key to the renderer, extension or state/diagnostic APIs. Windows
DPAPI protects `provider-key.bin`; unavailable/decryption-failed protection
blocks use. **Remove key** removes the app copy; remove your development env
file separately when no longer needed. Never commit either file.

**Test saved decision setup** sends synthetic Search/Cancel candidates. Then
hold **Hold to talk**, speak, and release. Google's key/project terms, free-tier
availability and quotas apply; this build neither requires nor configures paid
billing. Authentication, quota/rate limits, unavailable models, refusals and
timeouts produce explicit errors. Requests are not automatically retried.

### Use local AI

Install trusted binaries/models yourself. The app never downloads or executes
an installer automatically and has no cloud fallback. The tested configuration:

| Component | Tested selection | Setup / terms |
|---|---|---|
| Speech runtime | whisper.cpp v1.8.2 Windows x64 CPU `whisper-cli.exe` | [Official release](https://github.com/ggml-org/whisper.cpp/releases/tag/v1.8.2), MIT; 3,832,432-byte CPU ZIP |
| Speech model | `ggml-tiny.en.bin` | [Model repository](https://huggingface.co/ggerganov/whisper.cpp), MIT model card; 77,704,715 bytes; English only |
| Decision runtime | Ollama v0.40.13, loopback `127.0.0.1:11434` | [Official release](https://github.com/ollama/ollama/releases/tag/v0.40.13), MIT; portable Windows archive about 1.60 GB |
| Decision model | `qwen2.5:1.5b` | [Ollama model page](https://ollama.com/library/qwen2.5:1.5b), Apache-2.0; about 986 MB |

The whisper runtime ZIP SHA-256 is
`b1514ebc099765e39fa37eb780b92a140a94c86bb0b3b3d98226b38825979732`.
The tiny.en model SHA-256 is
`921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f`.
Download the model from its repository's `ggml-tiny.en.bin` entry and verify the
hash before use. Extract the runtime's DLLs alongside its executable.

Run `ollama pull qwen2.5:1.5b`, then run Ollama locally. For an explicit local-only
server, set `OLLAMA_NO_CLOUD=1` before `ollama serve`. Configure absolute paths to
`whisper-cli.exe` and the `.bin` model in Latham. Save and test the decision
setup, then test speech. Latham checks `/api/show` for a local installed model
and refuses remote/cloud metadata; it cannot attest a malicious replacement
server. Custom remote endpoints are not supported.

Test hardware: Intel Core i7-1065G7, 8 logical processors, 16 GB RAM, CPU-only.
This is a tested configuration, not a proven minimum. Allow roughly 3 GB for
the runtime/model downloads and additional working memory; low available RAM
causes substantial slowdowns. Speech uses four CPU threads and reloads the model
per utterance. Decision requests unload after use. Other languages/hardware and
arbitrary model names remain unvalidated.

## Microphone and retention

The app allows audio-only microphone access only to its own top frame during an
explicit recording turn. Camera, fixture and external permissions are denied.
Choose System default initially; device names become available after the first
permission request. Select another microphone and save to use it next time.
Denied permission, missing devices, disconnection and capture failures cancel
the turn. Push-to-talk supports pointer and Space/Enter press/release; blur
cancels capture. Recording ends after 30 seconds. Silent/very short/oversized
audio is rejected. Requests expire after 60 seconds; physical Stop is independent.

Cloud audio stays in memory in Latham. Local whisper.cpp requires a temporary
WAV file; the app deletes its per-turn directory after completion/failure/child
exit. A process/OS crash can leave a temporary `latham-turn-*` directory under
the current user's temp directory. These files are not diagnostics; this
development limitation must be resolved before a privacy-sensitive release.
Transcripts remain in memory until clear/Stop/new turn and are never diagnostic
payloads. Explicit evaluation artifacts contain public/synthetic test material.

## Chrome pairing and access

1. Build and run Latham. Choose **Register Chrome host**. This writes the
   current-user `com.latham.host` registry entries for Chrome and Chromium,
   without elevation. The host/config folder is restricted to the current
   Windows SID. Registration replaces only Latham's named host entry.
2. In Chrome's extension developer screen, load the unpacked
   `dist/chrome-extension` directory. Open Latham's extension popup and choose
   **Connect to Latham**. The fixed development extension ID is
   `plggaillpeoabjjmpjedmblaakepbhdb`; its manifest contains a public key only.
3. Approve Google Search and/or YouTube in the popup. Each explicit user gesture
   requests its exact optional HTTPS host pattern. Denial leaves access off.
4. Start a Chrome session in Latham after the extension confirms its pause
   fence. Try `new tab`, `next tab`, `previous tab`, `go back`, `go forward`, or
   `open https://www.google.com`. Launch Chrome uses a fixed installed executable
   allowlist; there is no generic launch/shell API.

Tab creation/activation verifies returned tab identity/active state. Navigation
and history are reported as dispatched, because an API acknowledgement does
not prove the final loaded page. History requires an approved current origin;
explicit navigation requires an approved destination. Other URL schemes,
credentials in URLs, unsupported origins and arbitrary commands are blocked.
No content script or DOM/keyboard/clipboard fallback is installed.

Effective website access is the intersection of saved Latham consent, current
Chrome host permission and a connected executor. Permission survives revisit
and restart, while execution always restarts paused. A reconnect reconciles
revocations made while disconnected. Revoke in Latham removes consent first,
then requests browser removal. Browser-side removal drops consent and pauses.
Retained grants never activate observation in the background.

The host relays bounded length-prefixed JSON between Chrome stdio and a
per-session random named pipe. Pairing checks a session token and exact
extension origin; tokens are not provider keys. The relay has no UIA, arbitrary
process, shell, filesystem command or HTTP operations. It does not protect
against malware already running as the same Windows user.

Stop invalidates pending requests and asks the extension to acknowledge its
epoch fence. The UI distinguishes requested/unconfirmed and confirmed pause.
Already-issued browser calls can still take effect. Unknown results require
inspection and **I inspected Chrome · clear uncertain result** before a new
session. Disconnect/restart never replays a mutation. Missing acknowledgements
time out after five seconds.

To remove development registration, delete only the `com.latham.host` subkey
under `HKCU\Software\Google\Chrome\NativeMessagingHosts` (and the equivalent
Chromium location), then remove Latham's extension. Do not remove unrelated
native hosts. Installer/signing/Web Store identity are Phase 2 release work.

## Reproduce evaluation

```powershell
npm run setup:browser
npm run evaluate
node scripts/evaluate-providers.mjs --model=qwen2.5:1.5b --cloud
node scripts/accept-providers.mjs
node scripts/accept-permissions.mjs
```

The last three commands are explicit live acceptance, not part of the default
offline test suite. They expect official local runtime/model downloads and the
public `samples/jfk.wav` from whisper.cpp in ignored `.test-artifacts/local-ai`
(runtime under `whisper/Release`, model at that directory's root). The cloud
commands use the authorized Gemini key from `.env.local`, sending that public
sample and synthetic candidates only. The permission script uses a fresh,
visible test browser and asks you to accept its two prompts and physically
press Stop. Close other Latham instances before tests so the global hotkey can
register. Test profiles never use personal Chrome account data.

`setup:browser` downloads Playwright Chromium and prepares a workspace-only
copy with the Windows assembly layout needed by this archive. Automated native
host and interactive acceptance tests restore prior registry values. Register
the normal app when you want to use it afterward. See [evaluation](evaluation.md) for measured results and
remaining release acceptance.
