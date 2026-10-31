# Latham 0.4 hands-free preview

Phase 4 adds explicit consecutive-command sessions, separate local stop and wake
detectors, and configurable local speech. It keeps the existing reviewed Chrome
and Notepad operations and permissions. Visual grounding and broader applications
remain future phases.

## Install and prepare

Build from source with `npm ci`, `npm run setup:electron`, `npm run dev`, or extract
the **unsigned** `Latham-0.4.0-win-x64-preview.zip` and run `Latham.exe`. Chrome
requires the matching extension **0.4.0** and this build's registered native host;
the relay protocol remains 2. The package includes all three native helpers.
The existing [Chrome/provider](phase2.md) and [Notepad](phase3.md) guides describe
the underlying operations, approval and uncertain-result recovery.

The two detector processes use the Windows-provided .NET Framework 4.8
`System.Speech` **installed en-US desktop recognizer**. No idle audio goes to an
online recognition service. Missing language components or recognizer startup
failure disable hands-free mode; Latham does not download or enable Windows
speech components automatically. The tested machine exposes `MS-1033-80-DESK`.
Command ASR is separate: choose Gemini with your own key, or local whisper.cpp
with installed GGML weights. Ollama handles optional bounded target selection,
not speech or interruption.

1. Save the provider and microphone selection. Test push-to-talk first.
2. Start an already-approved Chrome session, or prepare the intended plain-text
   Notepad editor. Resolve any uncertain previous result before continuing.
3. Under **Hands-free commands**, choose that app. Optionally select
   **Wait for local “hey Latham” first**.
4. Choose **Enable hands-free microphone**. This authorizes automatic dispatch
   of successive recognized commands within that app's existing permissions.
   Both microphone and local-stop readiness are visible. Other manual voice and
   app controls are disabled during the session; the physical Stop remains live.
5. In wake mode, say **hey Latham**, then pause before speaking the command.
   Pre-wake audio is discarded and never sent to command ASR. Once awake, the
   session accepts consecutive commands without repeating the wake phrase.
6. Say commands such as **inspect page**, **scroll down**, **focus Search**,
   **start dictation**, **dictate piano music**, **correct that to violin music**,
   or the supported editor commands from the Notepad guide. Commands remain
   English; configured multilingual transcription does not translate them.
7. Say **stop assistant**, choose **End hands-free session**, press **Stop** or
   **Ctrl+Alt+.**, or use the tray's **Pause / Stop**. Each ends capture and
   cancels all adapters. Hiding/quitting the app also ends capture.

The stop phrase is globally reserved while hands-free is enabled, including
inside dictation. Use push-to-talk to insert those literal words. Final command
transcripts containing that phrase are also rejected as a secondary safeguard;
spoken interruption does not depend on the command ASR finishing.

## Session and failure rules

The renderer captures mono PCM16 at 16 kHz. Main owns a fresh session ID,
monotonic frame sequence, VAD buffers and state. Only one command can transcribe
or execute at a time. Ordinary command audio is discarded while busy; the
independent local stop process continues receiving frames through transcription,
execution and verification. No command queue or late-result replay is introduced.

Command segmentation uses a bounded energy gate and about 0.8 seconds of trailing
silence. This is a simple VAD, with no speaker identity or noise classification.
Commands exceeding 15 seconds end the session. Every session ends after 90
seconds idle or five minutes total, including wake waiting. Settings and app
permissions may persist; microphone activation and wake arming never persist.

Audio input stalled for over 2.5 seconds, disconnected/muted tracks, a suspended
audio context, missing/out-of-order frames, detector exit or heartbeat/backlog
failure all end the session and initiate cancellation. A failed, blocked or
unverified command ends it too. Changing a bound app/document or revoking access
requires a fresh explicit session. No automatic restart, provider fallback,
permission grant or uncertainty clearance occurs.

Each detector has a fixed grammar and inherited PCM input/output pipes. It
cannot access the microphone directly, choose a target or issue an action.
Wake and stop use separate processes; neither waits for Whisper, Gemini or UIA.
Queues are bounded, health and audio progress are monitored, and all child
detectors terminate at exit. The initial implementation has **no assistant TTS
output**. Website/speaker audio can still be heard by the microphone.

Cancellation is separate from speech recognition: recognition takes time and
can miss or falsely match a phrase. The executor fence acknowledges cancellation
of pending work; it does not roll back an already-issued edit. Inspect uncertain
effects and use the existing recovery controls before restarting.

## Local speech and model management

**Local speech model options** adds language codes, up to 400 characters of
vocabulary hints and one to four CPU threads. New defaults use **two threads**
to leave CPU room for the stop detector. Old settings migrate without enabling
capture. Hints are local Whisper prompts, never action authority; incorrect hints
can bias transcripts. Gemini does not receive those hints.

Choose **Check saved local model** to validate the saved absolute runtime/model
paths, regular files, bounded model size and GGML header before an inference
process starts. The UI reports model size, filename-based English/multilingual
profile, selected language and thread count. English `.en` model filenames require
`en`. Other language codes and `auto` need appropriate multilingual weights;
only English base.en is validated in this preview. Header checks are setup
checks, not cryptographic provenance verification. Use the trusted download and
hash instructions in the earlier setup guides.

Switch models by saving a different installed `.bin` path; Latham never replaces
or deletes weights or downloads models by itself. Models load per turn. A
resident ASR server is not introduced: stopping cancels the child, and completed
turns release it. This avoids idle model residency, while retaining per-turn
startup cost. Setup preflight improves failure detection, not a sub-second
recognition promise. Audio/transcripts remain bounded in memory and use stdin/
stdout, with no temporary WAV or transcript files.

## Evaluation

```powershell
npm run evaluate
npm run test:detectors
node scripts/evaluate-speech.mjs --base --threads=2
node scripts/evaluate-speech.mjs --base --threads=4
node scripts/evaluate-speech.mjs --base --threads=2 --vocabulary
npm run package:preview
node scripts/check-preview.mjs
```

The detector corpus uses two synthetic en-US voices, near-match negatives,
overlapping voices, silence, a tone and digital replay. Digital replay tests
spoofing behavior; it does not establish physical speaker/room echo reliability.
The speech evaluation reuses the eight fixed Phase 2 phrases. Regression tests
exercise late ASR/action results, local stop during pending inference and edit
verification, microphone disconnect, detector termination and idle-audio privacy.
See [measured results and limitations](evaluation.md).

This preview cannot distinguish the user from a background speaker or a replay.
“Stop assistance” can falsely trigger Stop. There is no guaranteed detection of
every stop phrase. Physical-microphone hands-free accuracy, real-room speaker
playback, accents and broad noise conditions require further hardware evidence;
the existing Phase 2 microphone result does not establish those claims. Physical
Stop remains essential. The Phase 3 Windows focus-refusal limitation also remains.

Platform references: Microsoft's [continuous recognition API](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine.recognizeasync?view=netframework-4.8.1),
[PCM stream API](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine.setinputtoaudiostream?view=netframework-4.8)
and the pinned [whisper.cpp CLI options](https://github.com/ggml-org/whisper.cpp/blob/v1.8.2/examples/cli/cli.cpp).
