# Chrome workflows — Phase 2

The current Windows preview is **0.7.0**, with [expanded website coverage](phase6.md), including [Phase 3 desktop editing](phase3.md) and [Phase 4 hands-free sessions](phase4.md).
The supported Chrome operations below remain the Phase 2 profile set.

Latham's Phase 2 adapter adds reviewed Chrome page actions and field-bound
dictation to the Phase 1 provider/permission foundation. It is a Windows x64
developer preview, with a small, published support set. Desktop editing is
documented separately in Phase 3. Hands-free listening, screenshot capture and
general planning remain later work.

## Supported site/action matrix

The accepted browser configuration is signed out, with English UI. Other
languages, signed-in/private workflows, regional consent pages and site
experiments have not been accepted. A changed or unsupported page blocks.

| Exact origin / paths | Reviewed operations | Exclusions |
|---|---|---|
| `https://www.google.com` `/`, `/webhp`, `/search` | Inspect the plain Search field; focus; bounded dictation/correction/undo; read-query search; Images/Videos/News/All filter navigation; 600 px scrolling | External search-result destinations, AI Mode, account controls, CAPTCHA and consent pages |
| `https://www.youtube.com` `/`, `/results`, `/watch` | Plain Search field; dictation/correction/undo; read-query search; visible ordinary video-result links to same-origin `/watch?v=…`; 600 px scrolling | Shorts, playlists, channels, filters, ads, comments, likes, subscriptions, account controls |

Google may require human CAPTCHA completion. Latham reports the unverified
navigation and stops; it never solves or bypasses that challenge. After manual
completion, inspect Chrome, clear the uncertain result, then start a session.
YouTube video navigation may cause normal browser playback; automated acceptance
uses a muted test browser. This build does not control playback or account state.

## Install the Windows preview

For a source checkout, use Node 22+ and run:

```powershell
npm ci
npm run setup:electron
npm run dev
```

For a prepared preview, extract `Latham-0.7.0-win-x64-preview.zip` into a stable
folder and run `Latham.exe`. No administrator access or global Node/.NET SDK
installation is required. The package includes Electron, its notices and
Latham's small .NET Framework relay; Windows .NET Framework 4.8 is the tested
helper runtime.

1. Configure **Use my API key** (Gemini) or **Use local AI**. Save changes before
   recording. Changing saved provider settings pauses work and clears old speech.
2. Choose **Register Chrome host**. In Chrome's extension developer screen,
   load the extracted `Latham-extension-0.7.0.zip` directory, or the included
   `resources/app/chrome-extension` directory. A source build uses
   `dist/chrome-extension`.
3. Open the extension, choose **Connect to Latham**, and approve the supported
   websites through their optional-host prompts. Returning to an approved site
   retains permission. Every app/host/worker restart starts paused.
4. Open a supported page. Choose **Start Chrome session** for commands, or
   **Prepare Search dictation** to explicitly start a ready session, focus Search
   and bind that field. No page snapshots are collected while paused.

Desktop/extension version **0.7.0**, relay protocol **2**, and Chrome **120+**
must agree. An incompatible extension stays disconnected. Reload the extension
and register the current host after updating. The fixed unpacked extension ID
uses a public key; no private signing key is included.

The release channel is **unsigned developer preview**. The ZIP checksum detects
changes relative to the accompanying manifest; it does not establish a trusted
publisher. Actual Authenticode status is **NotSigned** for both `Latham.exe`
and the native relay. Public signed installers, automatic
updates, Web Store distribution, and the project's source/contribution license
remain separately reviewed release decisions. Artifacts are prepared locally;
the packaging script does not publish them.

## Voice and dictation

On a supported page, choose **Prepare Search dictation**, then hold **Hold to
talk**, speak, and release. Review the final transcript, then choose **Append
transcript** or **Replace field with transcript**. These buttons require the
same field binding that existed when recording started. Preparing again clears
an older unbound transcript; record again afterward.

Only the reviewed plain search field can receive text. A real field change,
user edit, tab/document change, lost grant or Stop suspends dictation. Moving
between the same Chrome field and Latham's microphone window preserves that
field identity. OS focus does not replace document/tab/control checks, and no
blind keyboard or clipboard input is used.

Append adds at the field end, with one separating space when needed. Replace
replaces the whole field. Correction replaces the most recent unchanged
Latham utterance while preserving its append/replace mode. Undo restores the
value before that utterance only while the resulting value, field, focus and
edit history still match. User/page edits make correction and undo unavailable.
Each utterance is limited to 1,000 characters; fields are limited to 2,000.

Useful typed commands, also usable from a reviewed voice transcript:

```text
inspect page
focus Search
start dictation
dictate piano music
replace dictation with orchestral music
correct that to violin music
undo dictation
stop dictation
click Search
search piano music
scroll down
scroll up
filter images
click Piano lesson
choose 2
open first result
stop
```

Filters above apply to Google search results; result navigation applies to
reviewed YouTube video links. Exact labels/ordinals and known commands avoid
model calls. An unmatched description can invoke the selected provider using
at most 24 bounded candidate labels/roles/IDs. Duplicate labels require explicit
clarification; no answer authorizes an excluded effect. Arbitrary buttons,
messages, uploads, purchases, applications and secure fields stay blocked.

## Providers and data

Gemini uses the user's key and account quotas; the app never enables billing.
Keys use Windows DPAPI in the main process. Development `.env.local` import is
explicit and hidden in packaged builds. Local mode never falls back to cloud.
See [Phase 1 setup](phase1.md) for the verified runtime download and key lifecycle.

Phase 2 recommends **whisper.cpp v1.8.2 + `ggml-base.en.bin`** (English,
four CPU threads) rather than the smaller tiny.en model. Base.en passed the
fixed eight-phrase synthetic corpus that exposed tiny.en's misrecognition.
The model is approximately 142 MiB, with MIT terms in the
[maintainer's model repository](https://huggingface.co/ggerganov/whisper.cpp).
Verify SHA-256
`a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002`.
Ollama `qwen2.5:1.5b` remains the tested local decision setup. Runtime/model
downloads are explicit; no weights are bundled in the preview.

Audio is bounded 16 kHz mono PCM, held only for push-to-talk, with a 30-second
limit and a 60-second provider deadline. The local runtime receives WAV bytes
on stdin and returns transcript text on stdout; the app no longer creates
temporary audio/transcript files. No diagnostic logs contain speech, page
contents, query values, credentials or screenshots.

Only root-frame reviewed controls are inspected. Secure/hidden/unreviewed
controls and frame contents are omitted. A boolean indicating an existing
reviewed search form may be used to verify navigation when that form is outside
the viewport; its value is not transmitted. Candidate text is untrusted data,
never authority. Cloud selection receives labels, not field values or frames.
Page URLs and exact field values needed for freshness/undo stay transient.

## Results, Stop and recovery

Snapshots bind a root Chrome document ID, tab/window, isolated document token,
control reference/revision and connection/permission epoch. The executor
rechecks those bindings immediately before each effect. Edits get a second
readback after 100 ms to catch reactive page changes. Search/video/filter
navigation requires the expected origin/path/query identity and reviewed page
structure after loading. Generic browser history shortcuts retain their honest
dispatched status when the intended destination cannot be established.

Stop, tray Pause/Stop and **Ctrl+Alt+.** cancel providers, invalidate queued
work, and request an acknowledged fence from observed documents. The UI says
unconfirmed until that acknowledgement arrives. An in-flight browser call can
still take effect. Lost acknowledgements, failed verification and crashes leave
a persisted uncertainty marker; inspect Chrome and explicitly clear it before
resuming. Reconnect never replays a mutation.

If a live denied document cannot acknowledge cancellation, close/reload that
affected tab and reconnect. If a worker/host restarted, reconnect and inspect
before continuing. Revoke from the extension, Chrome settings or Latham; both
saved consent and Chrome's effective host grant are necessary. No denied-page
fallback exists. At most 32 document scopes are retained between acknowledged
pauses; Stop clears their transient bindings.

Quit from the tray before replacing a portable build. Disconnect Chrome before
registering a changed helper binary. Keep the prior extracted preview for
rollback; there is no automatic update or mutation replay. Re-register its host
and reload the matching extension after rolling back. To uninstall, remove only
Latham's named host entries and extension as documented in [phase1.md](phase1.md).
Settings/key removal is explicit; deleting application binaries does not erase
your saved settings.

## Build and reproduce evidence

```powershell
npm run setup:browser
npm run evaluate
npm run package:preview
node scripts/evaluate-speech.mjs --base --cloud
node scripts/accept-browser.mjs --cloud
```

Speech evaluation expects `scripts/generate-speech-fixtures.ps1` to have generated
its synthetic corpus and the verified local models in ignored test artifacts.
Live acceptance uses fresh, signed-out test profiles and production optional
permissions. It may require human CAPTCHA/microphone steps; those are recorded
separately. Automated routed-origin fixtures use a clearly marked test-only
install-time grant arrangement, not fabricated live-site support. See
[evaluation](evaluation.md) for measured results, failures and limits.
