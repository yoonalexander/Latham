import { randomUUID } from "node:crypto";
import { emptyHandsfree, parseHandsfreeConfig, type HandsfreeState, type HandsfreeTarget } from "../../../../packages/contracts/src/handsfree";
import type { Detector, DetectorFactory } from "./local-detector";

type Hooks = {
  available(target: HandsfreeTarget): boolean;
  transcribe(pcm: ArrayBuffer): Promise<string>;
  run(text: string, target: HandsfreeTarget): Promise<boolean>;
  cancel(): void; changed(): void;
};
export class Handsfree {
  state: HandsfreeState = emptyHandsfree();
  private detectors: Detector[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private started = 0; private activity = 0; private frameAt = 0; private sequence = 0;
  private parts: Buffer[] = []; private pre: Buffer[] = []; private samples = 0; private silence = 0;
  constructor(private factory: DetectorFactory, private hooks: Hooks, private now = () => performance.now()) {}
  get active(): boolean { return this.state.id !== null; }
  start(value: unknown): string {
    if (this.active) throw new Error("handsfree_already_active");
    const config = parseHandsfreeConfig(value); if (!this.hooks.available(config.target)) throw new Error("prepare_handsfree_target");
    const id = randomUUID(); this.state = { ...emptyHandsfree(), ...config, id, phase: "starting", message: "Starting local detectors · microphone requested." };
    this.started = this.activity = this.frameAt = this.now(); this.sequence = 0; this.clearAudio(); this.hooks.changed();
    for (const role of config.wake ? ["stop", "wake"] as const : ["stop"] as const) {
      let detector: Detector;
      try { detector = this.factory(role, event => {
        if (this.state.id !== id) return;
        if (event.kind === "failed") { this.end("Local detector failed. Work cancelled; microphone off."); return; }
        if (event.kind === "match") {
          if (role === "stop") this.end("Heard stop assistant. Work cancelled; microphone off.");
          else if (this.state.phase === "armed" && this.state.stopReady && this.hooks.available(this.state.target)) { this.clearAudio(); this.activity = this.now(); this.state.phase = "listening"; this.state.message = "Wake heard · pause, then speak a command."; this.hooks.changed(); }
          return;
        }
        if (role === "stop") this.state.stopReady = true; else this.state.wakeReady = true;
        if (this.state.stopReady && (!config.wake || this.state.wakeReady)) { this.state.phase = config.wake ? "armed" : "listening"; this.state.message = config.wake ? "Local wake only · say hey Latham, pause, then your command." : "Listening for consecutive commands · say stop assistant to exit."; }
        this.hooks.changed();
      }); } catch { this.end("Local detector could not start. Work cancelled; microphone off."); throw new Error("local_detector_unavailable"); }
      if (this.state.id !== id) { detector.close(); break; } this.detectors.push(detector);
    }
    if (this.state.id === id) this.timer = setInterval(() => this.check(), 250);
    return id;
  }
  end(message = "Session ended. Work cancelled; microphone off."): void {
    if (!this.active) return;
    this.state = { ...emptyHandsfree(), target: this.state.target, message }; clearInterval(this.timer);
    const detectors = this.detectors; this.detectors = []; detectors.forEach(detector => detector.close()); this.clearAudio();
    this.hooks.cancel(); this.hooks.changed();
  }
  fail(id: unknown): void { if (id === this.state.id && this.active) this.end("Microphone capture failed or disconnected. Work cancelled; microphone off."); }
  private clearAudio(): void { this.parts = []; this.pre = []; this.samples = this.silence = 0; }
  private check(): void {
    if (!this.active) return;
    if (this.state.phase === "starting" && this.now() - this.started > 8000) { this.end("Local detectors did not become ready. Microphone off."); return; }
    if (this.now() - this.frameAt > 2500) { this.end("Microphone audio stalled. Work cancelled; microphone off."); return; }
    if (this.now() - this.started > 300000 || this.now() - this.activity > 90000) { this.end("Session idle or time limit reached. Microphone off."); return; }
    if (!this.hooks.available(this.state.target)) this.end("The selected app session changed. Work cancelled; prepare it again.");
  }
  frame(id: unknown, sequence: unknown, pcm: unknown): void {
    if (!this.active || id !== this.state.id) return;
    if (sequence !== this.sequence++ || !(pcm instanceof ArrayBuffer) || pcm.byteLength < 320 || pcm.byteLength > 8192 || pcm.byteLength % 2) { this.end("Invalid or missing microphone audio. Work cancelled."); return; }
    this.frameAt = this.now(); const bytes = Buffer.from(pcm);
    if (!this.state.audioReady) { this.state.audioReady = true; this.hooks.changed(); }
    for (let index = 0; index < this.detectors.length; index++) {
      // Stop receives every frame, including during command inference and verification.
      if (index === 0 || this.state.phase === "armed" || this.state.phase === "starting") this.detectors[index]!.push(bytes);
    }
    if (!["listening", "capturing"].includes(this.state.phase) || !this.state.stopReady) return;
    let energy = 0; for (let offset = 0; offset < bytes.length; offset += 2) energy += (bytes.readInt16LE(offset) / 32768) ** 2;
    const voiced = Math.sqrt(energy / (bytes.length / 2)) >= 0.012;
    if (this.state.phase === "listening") {
      if (!voiced) { this.pre.push(bytes); while (this.pre.reduce((n, part) => n + part.length, 0) > 8192) this.pre.shift(); return; }
      this.parts = this.pre; this.pre = []; this.samples = this.parts.reduce((n, part) => n + part.length / 2, 0); this.silence = 0;
      this.state.phase = "capturing"; this.activity = this.now(); this.state.message = "Capturing command · stop detector stays local and active."; this.hooks.changed();
    }
    this.parts.push(bytes); this.samples += bytes.length / 2; this.silence = voiced ? 0 : this.silence + bytes.length / 2;
    if (this.samples >= 16000 * 15) { this.end("Command exceeded 15 seconds. Work cancelled; speak a shorter command."); return; }
    if (this.silence >= 16000 * 0.8) {
      const audio = Buffer.concat(this.parts); this.clearAudio();
      void this.complete(this.state.id!, audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer);
    }
  }
  private async complete(id: string, pcm: ArrayBuffer): Promise<void> {
    this.state.phase = "transcribing"; this.state.message = "Transcribing active command · local stop detector remains active."; this.hooks.changed();
    try {
      const text = await this.hooks.transcribe(pcm);
      if (id !== this.state.id) return;
      const normalized = text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
      if (/\bstop assistant\b/.test(normalized) || ["stop", "pause", "exit session", "end session"].includes(normalized)) { this.end("Session stopped by speech. Microphone off."); return; }
      if (!text.trim() || !this.hooks.available(this.state.target)) throw new Error("unavailable");
      this.state.phase = "executing"; this.state.message = "Executing and verifying one command · say stop assistant to exit."; this.hooks.changed();
      const verified = await this.hooks.run(text, this.state.target);
      if (id !== this.state.id) return;
      if (!verified || !this.hooks.available(this.state.target)) throw new Error("unverified");
      this.activity = this.now(); this.state.phase = "listening"; this.state.message = "Command verified · listening for the next command."; this.hooks.changed();
    } catch { if (id === this.state.id) this.end("Command failed, was blocked, or needs review. Work cancelled; inspect the result before restarting."); }
  }
}
