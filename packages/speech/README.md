# @latham/speech

`src/providers.ts` implements bounded Gemini audio/target selection,
whisper.cpp final-utterance ASR and loopback-only Ollama selection. It is bundled
into the desktop main process; it is never imported by the renderer/extension.
Capture and turn ownership live in the desktop application. Model output is a
candidate ID or abstention, with no action authority. See
[setup/evaluation](../../docs/phase1.md) for tested models and limits.
