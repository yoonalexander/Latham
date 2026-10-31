# @latham/speech

`src/providers.ts` implements bounded Gemini audio/target selection,
whisper.cpp final-utterance ASR and loopback-only Ollama selection. It is bundled
into the desktop main process; it is never imported by the renderer/extension.
Capture and turn ownership live in the desktop application. Model output is a
candidate ID or abstention, with no action authority. See
[setup](../../docs/phase2.md) and [evaluation](../../docs/evaluation.md) for
tested models and limits. The recommended local recognizer is base.en. Audio
uses bounded memory-only stdin/stdout; no temporary WAV/transcript files are
created. Local mode never falls back to cloud. This small corpus does not
establish general microphone accuracy or the proposed voice latency targets.
