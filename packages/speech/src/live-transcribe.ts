import { record } from "../../contracts/src/index";

export const liveSpeechModel = "gemini-3.5-transcribe-live";
export interface LiveSpeech { push(bytes: Buffer): void; finish(): Promise<string>; cancel(): void; }
export interface SpeechSocket extends EventTarget { bufferedAmount: number; binaryType: BinaryType; send(data: string): void; close(): void; }

// One explicitly activated utterance. Only committed provider text can finish it.
export class GeminiLiveSpeech implements LiveSpeech {
  private socket: SpeechSocket;
  private closed = false; private ready = false; private ending = false;
  private queue: Buffer[] = []; private bytes = 0; private queued = 0;
  private committed = "";
  private result: Promise<string>; private resolve!: (text: string) => void; private reject!: (error: Error) => void;
  private timer: ReturnType<typeof setTimeout>;
  constructor(key: string, options: { speechLanguage: string; speechVocabulary: string }, private partial: (text: string) => void, create: (url: string) => SpeechSocket = url => new WebSocket(url)) {
    this.result = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; }); void this.result.catch(() => {});
    this.socket = create(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`);
    this.socket.binaryType = "arraybuffer";
    this.timer = setTimeout(() => this.fail("provider_unavailable"), 5000);
    this.socket.addEventListener("open", () => {
      const languageCodes = options.speechLanguage === "auto" ? [] : [options.speechLanguage === "en" ? "en-US" : options.speechLanguage];
      this.send({ setup: { model: `models/${liveSpeechModel}`, generationConfig: { responseModalities: ["TEXT"] }, inputAudioTranscription: { languageCodes, customVocabulary: options.speechVocabulary.split(/[,;]/).map(term => term.trim()).filter(Boolean).slice(0, 100) }, realtimeInputConfig: { automaticActivityDetection: { disabled: true } } } });
    });
    this.socket.addEventListener("message", event => this.receive((event as MessageEvent).data));
    this.socket.addEventListener("error", () => this.fail("provider_unavailable"));
    this.socket.addEventListener("close", () => this.fail("provider_unavailable"));
  }
  private send(value: object): void {
    if (this.closed) return;
    try { if (this.socket.bufferedAmount > 128000) throw Error(); this.socket.send(JSON.stringify(value)); } catch { this.fail("provider_unavailable"); }
  }
  private receive(data: unknown): void {
    if (this.closed) return;
    try {
      const text = typeof data === "string" ? data : data instanceof ArrayBuffer && data.byteLength <= 65536 ? Buffer.from(data).toString("utf8") : "";
      if (!text || text.length > 65536) throw Error();
      const value: unknown = JSON.parse(text); if (!record(value)) throw Error();
      if (record(value.error)) { this.fail(value.error.code === 429 ? "quota_or_rate_limit" : value.error.code === 401 || value.error.code === 403 ? "authentication_failed" : value.error.code === 404 ? "model_unavailable" : "provider_unavailable"); return; }
      if (record(value.setupComplete) && !this.ready) {
        this.ready = true; clearTimeout(this.timer);
        this.send({ realtimeInput: { activityStart: {} } });
        for (const bytes of this.queue) this.audio(bytes); this.queue = []; this.queued = 0;
        if (this.ending) this.endInput();
      }
      if (!record(value.serverContent)) return;
      const content = value.serverContent;
      if (record(content.interimInputTranscription)) this.partial(this.join(content.interimInputTranscription.text));
      if (record(content.inputTranscription)) {
        this.committed = this.join(content.inputTranscription.text); this.partial(this.committed);
        if (this.ending && this.committed) { const result = this.committed; this.close(); this.resolve(result); }
      }
    } catch { this.fail("invalid_provider_response"); }
  }
  private join(value: unknown): string {
    if (typeof value !== "string" || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw Error();
    const text = `${this.committed} ${value}`.trim(); if (text.length > 2000) throw Error(); return text;
  }
  private audio(bytes: Buffer): void { this.send({ realtimeInput: { audio: { data: bytes.toString("base64"), mimeType: "audio/pcm;rate=16000" } } }); }
  push(bytes: Buffer): void {
    if (this.closed || this.ending) return;
    this.bytes += bytes.length;
    if (!bytes.length || bytes.length > 8192 || bytes.length % 2 || this.bytes > 960000) { this.fail("invalid_audio"); return; }
    if (this.ready) this.audio(bytes);
    else { this.queued += bytes.length; if (this.queued > 160000) this.fail("provider_unavailable"); else this.queue.push(Buffer.from(bytes)); }
  }
  finish(): Promise<string> {
    if (!this.closed && !this.ending) {
      this.ending = true;
      if (!this.bytes) this.fail("no_usable_transcript");
      else if (this.ready) this.endInput();
    }
    return this.result;
  }
  private endInput(): void {
    this.send({ realtimeInput: { activityEnd: {} } }); this.send({ realtimeInput: { audioStreamEnd: true } });
    clearTimeout(this.timer); this.timer = setTimeout(() => this.fail("provider_unavailable"), 4000);
  }
  private close(): void { if (this.closed) return; this.closed = true; clearTimeout(this.timer); this.queue = []; this.queued = 0; try { this.socket.close(); } catch {} }
  private fail(code: string): void { if (this.closed) return; this.close(); this.reject(new Error(code)); }
  cancel(): void { this.fail("cancelled"); }
}
