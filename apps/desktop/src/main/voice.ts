import { cloudTranscribe, localTranscribe, selectCandidate, wav, inspectLocalModel } from "../../../../packages/speech/src/providers";
import { parseProviderSettings, type SetupState, type Candidate } from "../../../../packages/contracts/src/setup";
import { ProviderStore } from "./provider-store";
import type { ManagedClient } from "./managed-client";
import type { SpeechPreview } from "./speech-preview";

const managedErrors = ["managed_sign_in_required", "service_cancelled", "service_busy"];

const errors = new Set([...managedErrors, "authentication_failed", "quota_or_rate_limit", "provider_unavailable", "model_unavailable", "no_usable_transcript", "local_asr_setup_required", "local_asr_unavailable", "local_asr_failed", "local_model_required", "local_model_unavailable_or_invalid", "english_model_language_mismatch", "invalid_speech_options", "key_setup_required", "key_unavailable", "invalid_selection", "provider_abstained", "invalid_provider_response"]);
export class Voice {
  status: SetupState["voice"] = "idle";
  transcript = ""; error = ""; notice = "";
  localModel = "Local model not checked. No automatic download or model replacement.";
  private turn = 0;
  private controller = new AbortController();
  private recordingTimer: ReturnType<typeof setTimeout> | undefined;
  private previewOwned = false; private sequence = 0; private previewSamples = 0;
  constructor(readonly store: ProviderStore, private changed: () => void, private managed?: ManagedClient, private preview?: SpeechPreview) {}
  prepareSession(): void {
    const settings = this.store.settings;
    if (settings.mode === "local") inspectLocalModel(settings.whisperExecutable, settings.whisperModel, settings);
    else if (settings.mode === "managed") { if (!this.managed) throw new Error("managed_sign_in_required"); this.managed.ready(); }
    else this.store.key();
  }
  checkLocalModel(): void {
    try { const s = this.store.settings, model = inspectLocalModel(s.whisperExecutable, s.whisperModel, s); this.localModel = `Model ready · ${Math.round(model.bytes / 1048576)} MiB · ${model.englishOnly ? "English only" : "multilingual weights"} · ${model.language} · ${model.threads} CPU threads. Loaded only during a turn.`; }
    catch (error) { this.localModel = `Model unavailable: ${(error as Error).message}. Check the saved model/runtime and language.`; }
    this.changed();
  }
  cancel(notify = true, clearPreview = true): void {
    clearTimeout(this.recordingTimer); this.turn++; this.controller.abort(); this.controller = new AbortController(); this.status = "idle"; this.transcript = ""; this.previewOwned = false; if (clearPreview) this.preview?.clear(); if (notify) this.changed();
  }
  save(value: unknown): void { const settings = parseProviderSettings(value); if (settings.mode === "managed") { if (!this.managed) throw new Error("managed_sign_in_required"); this.managed.ready(); } this.cancel(); this.store.save(settings); this.error = ""; this.localModel = "Settings changed · check the saved local model."; this.notice = "Settings saved. Run the decision test and record a short speech test."; this.changed(); }
  begin(withPreview = true): number {
    if (this.store.settings.mode === "managed") { if (!this.managed) throw new Error("managed_sign_in_required"); this.managed.ready(); }
    this.cancel(false, withPreview); this.status = "recording"; this.error = ""; this.notice = "Release to transcribe. Nothing runs automatically."; this.previewOwned = withPreview; this.sequence = this.previewSamples = 0; if (withPreview) this.preview?.start();
    this.recordingTimer = setTimeout(() => { this.cancel(); this.error = "recording_timeout"; this.changed(); }, 31000);
    this.changed(); return this.turn;
  }
  frame(id: unknown, sequence: unknown, pcm: unknown): void {
    if (id !== this.turn || this.status !== "recording" || !this.previewOwned) return;
    if (sequence !== this.sequence++ || !(pcm instanceof ArrayBuffer) || pcm.byteLength < 320 || pcm.byteLength > 8192 || pcm.byteLength % 2) { this.cancel(); return; }
    this.previewSamples += pcm.byteLength / 2; if (this.previewSamples > 16000 * 30) { this.cancel(); return; }
    this.preview?.push(Buffer.from(pcm));
  }
  async finish(id: unknown, pcm: unknown): Promise<void> {
    if (id !== this.turn || this.status !== "recording") return;
    clearTimeout(this.recordingTimer);
    const generation = this.turn, signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(60000)]);
    this.status = "transcribing"; this.changed();
    try {
      if (!(pcm instanceof ArrayBuffer)) throw new Error("invalid_audio");
      const bytes = new Uint8Array(pcm), audio = wav(bytes);
      let energy = 0; const view = new DataView(pcm); for (let offset = 0; offset < bytes.length; offset += 2) energy += (view.getInt16(offset, true) / 32768) ** 2;
      if (Math.sqrt(energy / (bytes.length / 2)) < 0.003) throw new Error("no_usable_transcript");
      const settings = this.store.settings;
      const liveResult = this.preview?.complete(bytes);
      const text = settings.mode === "managed" ? await this.managedTranscribe(audio, signal) : settings.mode === "cloud" ? await (liveResult ?? cloudTranscribe(audio, this.store.key(), signal)) : await localTranscribe(audio, settings.whisperExecutable, settings.whisperModel, signal, settings);
      if (generation === this.turn && !signal.aborted) { this.transcript = text; this.preview?.final(text); this.notice = "Final transcript. Review it, then insert into the prepared field or use it as an app command."; }
    } catch (error) { if (generation === this.turn) { this.preview?.clear(); this.error = signal.aborted ? "transcription_cancelled_or_timed_out" : errors.has((error as Error).message) ? (error as Error).message : "speech_failed"; } }
    finally { if (generation === this.turn) { this.status = "idle"; this.changed(); } }
  }
  async test(): Promise<{ candidateId: string | null }> {
    this.cancel(); const generation = this.turn, signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(60000)]); this.status = "testing"; this.error = ""; this.changed();
    try {
      const candidates = [{ id: "search", label: "Search", role: "button" }, { id: "cancel", label: "Cancel", role: "button" }];
      const result = this.store.settings.mode === "managed" ? await this.managedSelect("Choose the Search button", candidates, signal) : await selectCandidate(this.store.settings.mode === "local" ? { mode: "local", model: this.store.settings.ollamaModel } : { mode: "cloud", key: this.store.key() }, "Choose the Search button", candidates, signal);
      if (generation !== this.turn || signal.aborted) throw new Error("cancelled");
      if (result.candidateId !== "search") throw new Error("invalid_selection");
      this.notice = "Decision fixture passed: Search. No website content was sent and no action was executed."; return result;
    } catch (error) { if (generation === this.turn) this.error = signal.aborted ? "test_cancelled_or_timed_out" : errors.has((error as Error).message) ? (error as Error).message : "decision_test_failed"; return { candidateId: null }; }
    finally { if (generation === this.turn) { this.status = "idle"; this.changed(); } }
  }
  private managedTranscribe(audio: Uint8Array, signal: AbortSignal): Promise<string> {
    if (!this.managed) throw new Error("managed_sign_in_required"); return this.managed.transcribe(audio, signal);
  }
  private managedSelect(instruction: string, candidates: Candidate[], signal: AbortSignal): Promise<{ candidateId: string | null }> {
    if (!this.managed) throw new Error("managed_sign_in_required"); return this.managed.select(instruction, candidates, signal);
  }
}
