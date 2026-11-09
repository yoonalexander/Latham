import type { SpeechPreviewState } from "../../../../packages/contracts/src/speech-preview";
import type { Detector, DetectorFactory } from "./local-detector";
import type { LiveSpeech } from "../../../../packages/speech/src/live-transcribe";

// Interim text is display-only; a cloud stream supplies committed text separately on release.
export class SpeechPreview {
  state: SpeechPreviewState = { text: "", status: "off" };
  private detector: Detector | undefined;
  private live: LiveSpeech | undefined;
  private liveBytes = 0;
  private liveResult: Promise<string> | undefined;
  private generation = 0;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  constructor(private factory: DetectorFactory, private changed: () => void, private liveFactory?: (partial: (text: string) => void) => LiveSpeech | undefined) {}
  start(): void {
    this.clear(); const generation = this.generation;
    this.state = { text: "", status: "listening" }; this.changed();
    try {
      this.live = this.liveFactory?.(text => { if (generation === this.generation && text.length <= 2000) { this.state = { text, status: this.liveResult ? "processing" : "partial" }; this.changed(); } });
      if (this.live) return;
    } catch (error) { this.liveResult = Promise.reject(error); void this.liveResult.catch(() => {}); this.state = { text: "", status: "unavailable" }; this.changed(); return; }
    try {
      const detector = this.factory("preview", event => {
        if (generation !== this.generation) return;
        if (event.kind === "failed") { this.finishInput(); this.state = { text: "", status: "unavailable" }; this.changed(); }
        else if (event.kind === "partial" && typeof event.text === "string" && event.text.length <= 2000 && event.text !== this.state.text) { this.state = { text: event.text, status: "partial" }; this.changed(); }
      });
      if (generation === this.generation) this.detector = detector; else detector.close();
    } catch { this.finishInput(); this.state = { text: "", status: "unavailable" }; this.changed(); }
  }
  push(bytes: Buffer): void { if (this.live) { this.liveBytes += bytes.length; this.live.push(bytes); } else this.detector?.push(bytes); }
  complete(bytes: Uint8Array): Promise<string> | undefined {
    if (this.live && !this.liveBytes && !this.liveResult) for (let at = 0; at < bytes.length; at += 8192) this.push(Buffer.from(bytes.subarray(at, at + 8192)));
    this.finishInput(); return this.liveResult;
  }
  finishInput(): void {
    if (this.live) {
      if (!this.liveResult) {
        const generation = this.generation; this.liveResult = this.live.finish();
        void this.liveResult.catch(() => { if (generation === this.generation) { this.state = { text: "", status: "unavailable" }; this.changed(); } });
      }
    } else { this.generation++; const detector = this.detector; this.detector = undefined; detector?.close(); }
    if (this.state.status === "partial" || this.state.status === "listening") { this.state.status = "processing"; this.changed(); }
  }
  final(text: string): void {
    this.finishInput(); this.generation++; this.live?.cancel(); clearTimeout(this.expiry);
    this.state = { text: text.slice(0, 2000), status: "final" }; this.changed();
    const generation = this.generation; this.expiry = setTimeout(() => { if (generation === this.generation) this.clear(); }, 8000);
  }
  clear(): void { this.generation++; clearTimeout(this.expiry); const detector = this.detector; this.detector = undefined; detector?.close(); this.live?.cancel(); this.live = undefined; this.liveResult = undefined; this.liveBytes = 0; const changed = this.state.status !== "off" || !!this.state.text; this.state = { text: "", status: "off" }; if (changed) this.changed(); }
}
