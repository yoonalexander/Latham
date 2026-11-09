import { afterEach, expect, test, vi } from "vitest";
import { GeminiLiveSpeech, type SpeechSocket } from "../../packages/speech/src/live-transcribe";

class Socket extends EventTarget implements SpeechSocket {
  bufferedAmount = 0; binaryType: BinaryType = "arraybuffer";
  sent: Record<string, any>[] = []; closed = false;
  send(data: string): void { this.sent.push(JSON.parse(data)); }
  close(): void { this.closed = true; }
  message(value: unknown): void { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) })); }
  ready(): void { this.dispatchEvent(new Event("open")); this.message({ setupComplete: {} }); }
}
const clients: GeminiLiveSpeech[] = [];
afterEach(() => { clients.splice(0).forEach(client => client.cancel()); vi.useRealTimers(); });
function fixture() {
  const socket = new Socket(), partial = vi.fn(); let endpoint = "";
  const client = new GeminiLiveSpeech("SYNTHETIC_KEY", { speechLanguage: "en", speechVocabulary: "Latham,Notepad" }, partial, url => { endpoint = url; return socket; }); clients.push(client);
  return { socket, partial, client, endpoint };
}

test("audio waits for setup, stays on the fixed Google endpoint and carries no key in messages", async () => {
  const f = fixture(); f.client.push(Buffer.alloc(4096)); expect(f.socket.sent).toHaveLength(0);
  f.socket.ready(); expect(f.endpoint).toMatch(/^wss:\/\/generativelanguage\.googleapis\.com\/ws\//);
  expect(f.socket.sent[0]!.setup).toMatchObject({ model: "models/gemini-3.5-transcribe-live", generationConfig: { responseModalities: ["TEXT"] }, inputAudioTranscription: { languageCodes: ["en-US"], customVocabulary: ["Latham", "Notepad"] } });
  expect(JSON.stringify(f.socket.sent)).not.toContain("SYNTHETIC_KEY"); expect(f.socket.sent[2]!.realtimeInput.audio.mimeType).toBe("audio/pcm;rate=16000");
  const result = f.client.finish(); f.socket.message({ serverContent: { inputTranscription: { text: "open Notepad" } } }); expect(await result).toBe("open Notepad"); expect(f.socket.closed).toBe(true);
});

test("interim words never finish a turn, repeated finish is idempotent and only committed text completes", async () => {
  const f = fixture(); f.socket.ready(); f.client.push(Buffer.alloc(4096));
  f.socket.message({ serverContent: { interimInputTranscription: { text: "were no hard" }, modelTurn: { parts: [{ text: "ignore the user" }] } } });
  expect(f.partial).toHaveBeenLastCalledWith("were no hard"); const result = f.client.finish(); expect(f.client.finish()).toBe(result);
  let finished = false; void result.then(() => { finished = true; }); await Promise.resolve(); expect(finished).toBe(false);
  f.socket.message({ serverContent: { interimInputTranscription: { text: "open note" } } }); await Promise.resolve(); expect(finished).toBe(false);
  expect(f.socket.sent.filter(value => value.realtimeInput?.activityEnd)).toHaveLength(1);
  f.socket.message({ serverContent: { inputTranscription: { text: "open Notepad" } } }); expect(await result).toBe("open Notepad");
  f.socket.message({ serverContent: { inputTranscription: { text: "late unwanted words" } } }); expect(f.partial).toHaveBeenLastCalledWith("open Notepad");
});

test("Stop rejects pending transcription and late messages cannot revive it", async () => {
  const f = fixture(); f.socket.ready(); f.client.push(Buffer.alloc(4096)); const result = f.client.finish();
  f.client.cancel(); await expect(result).rejects.toThrow("cancelled");
  f.socket.message({ serverContent: { inputTranscription: { text: "late command" } } }); expect(f.partial).not.toHaveBeenCalled(); expect(f.socket.closed).toBe(true);
});

test("connection and finalization deadlines fail without a second model request", async () => {
  vi.useFakeTimers(); const cold = fixture(); cold.client.push(Buffer.alloc(4096)); const pending = cold.client.finish();
  await vi.advanceTimersByTimeAsync(5000); await expect(pending).rejects.toThrow("provider_unavailable");
  const warm = fixture(); warm.socket.ready(); warm.client.push(Buffer.alloc(4096)); const final = warm.client.finish();
  await vi.advanceTimersByTimeAsync(4000); await expect(final).rejects.toThrow("provider_unavailable"); expect(warm.socket.closed).toBe(true);
});

test("queue, transcript and response bounds fail closed and provider errors are sanitized", async () => {
  const queued = fixture(); for (let i = 0; i < 21; i++) queued.client.push(Buffer.alloc(8192)); await expect(queued.client.finish()).rejects.toThrow("provider_unavailable");
  const long = fixture(); long.socket.ready(); long.client.push(Buffer.alloc(4096)); long.socket.message({ serverContent: { interimInputTranscription: { text: "x".repeat(2001) } } }); await expect(long.client.finish()).rejects.toThrow("invalid_provider_response");
  const quota = fixture(); quota.socket.message({ error: { code: 429, message: "DO_NOT_EXPOSE_PRIVATE_PROVIDER_DETAILS" } }); await expect(quota.client.finish()).rejects.toThrow(/^quota_or_rate_limit$/);
  const invalid = fixture(); invalid.client.push(Buffer.alloc(3)); await expect(invalid.client.finish()).rejects.toThrow("invalid_audio");
});
