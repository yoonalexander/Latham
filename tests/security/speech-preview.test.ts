import { expect, test, vi, afterEach } from "vitest";
import { SpeechPreview } from "../../apps/desktop/src/main/speech-preview";
import type { DetectorEvent, DetectorFactory } from "../../apps/desktop/src/main/local-detector";
import { Handsfree } from "../../apps/desktop/src/main/handsfree";
import { Voice } from "../../apps/desktop/src/main/voice";
import { ProviderStore } from "../../apps/desktop/src/main/provider-store";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

afterEach(() => vi.useRealTimers());
function fixture() {
  let receive!: (event: DetectorEvent) => void;
  const push = vi.fn(), close = vi.fn(), changed = vi.fn();
  const factory = vi.fn<DetectorFactory>((_role, callback) => { receive = callback; return { push, close }; });
  const preview = new SpeechPreview(factory, changed);
  return { preview, factory, push, close, changed, receive: (event: DetectorEvent) => receive(event), callback: () => receive };
}
test("provisional words are display-only, stop rejects late events and a new utterance starts empty", () => {
  const f = fixture(); f.preview.start(); const old = f.callback(); f.receive({ kind: "partial", text: "open note" });
  expect(f.preview.state).toEqual({ text: "open note", status: "partial" });
  f.preview.push(Buffer.alloc(4096)); expect(f.push).toHaveBeenCalledOnce();
  f.preview.finishInput(); old({ kind: "partial", text: "late command" }); expect(f.preview.state).toEqual({ text: "open note", status: "processing" });
  f.preview.start(); old({ kind: "partial", text: "old utterance" }); expect(f.preview.state.text).toBe("");
  f.receive({ kind: "match" }); expect(f.preview.state.text).toBe(""); f.preview.clear(); expect(f.preview.state).toEqual({ text: "", status: "off" });
});
test("final transcript replaces the provisional words and is cleared after eight seconds or Stop", () => {
  vi.useFakeTimers(); const f = fixture(); f.preview.start(); f.receive({ kind: "partial", text: "open note" });
  f.preview.final("open Notepad"); expect(f.preview.state).toEqual({ text: "open Notepad", status: "final" }); expect(f.close).toHaveBeenCalled();
  vi.advanceTimersByTime(8000); expect(f.preview.state).toEqual({ text: "", status: "off" });
  f.preview.final("private words"); f.preview.clear(); vi.advanceTimersByTime(8000); expect(f.preview.state.text).toBe("");
});
test("preview failure cannot provide an executable transcript and unavailable engines degrade visibly", () => {
  const f = fixture(); f.preview.start(); f.receive({ kind: "failed" }); f.receive({ kind: "partial", text: "send something" });
  expect(f.preview.state).toEqual({ text: "", status: "unavailable" }); expect(f.close).toHaveBeenCalled();
  f.factory.mockImplementationOnce(() => { throw Error("missing_engine"); }); f.preview.start(); expect(f.preview.state.status).toBe("unavailable");
});
test("wake-idle audio never reaches live dictation and provisional text never executes", async () => {
  const f = fixture(), events = new Map<string, (event: DetectorEvent) => void>(), run = vi.fn(async () => true);
  const handsfree = new Handsfree((role, callback) => { events.set(role, callback); return { push: vi.fn(), close: vi.fn() }; }, { available: () => true, transcribe: async () => "final words", run, cancel: () => f.preview.clear(), changed: () => {}, preview: f.preview });
  const id = handsfree.start({ target: "chrome", wake: true }); events.get("stop")!({ kind: "ready" }); events.get("wake")!({ kind: "ready" });
  let sequence = 0; const frame = (): void => handsfree.frame(id, sequence++, new Int16Array(2048).fill(2000).buffer);
  frame(); expect(f.factory).not.toHaveBeenCalled(); events.get("wake")!({ kind: "match" }); frame();
  f.receive({ kind: "partial", text: "this preview must not execute" }); expect(run).not.toHaveBeenCalled();
  const old = f.callback(); handsfree.end(); old({ kind: "partial", text: "late preview" }); expect(f.preview.state.text).toBe(""); expect(run).not.toHaveBeenCalled();
});

test("manual preview frames are turn-bound, size/sequence bounded, and Stop clears their text", () => {
  const f = fixture();
  const store = new ProviderStore(mkdtempSync(join(tmpdir(), "latham-preview-")), { isEncryptionAvailable: () => false, encryptString: () => Buffer.alloc(0), decryptString: () => "" });
  const voice = new Voice(store, () => {}, undefined, f.preview), id = voice.begin();
  voice.frame(id - 1, 0, new ArrayBuffer(4096)); expect(f.push).not.toHaveBeenCalled();
  voice.frame(id, 0, new ArrayBuffer(4096)); f.receive({ kind: "partial", text: "live display only" });
  expect(voice.transcript).toBe(""); expect(f.push).toHaveBeenCalledOnce();
  voice.frame(id, 2, new ArrayBuffer(4096)); expect(voice.status).toBe("idle"); expect(f.preview.state.text).toBe("");
  const second = voice.begin(); for (let sequence = 0; sequence < 120; sequence++) voice.frame(second, sequence, new ArrayBuffer(8192));
  expect(voice.status).toBe("idle"); expect(f.preview.state.status).toBe("off");
});

test("an unavailable preview does not interrupt final ASR or execute provisional words", async () => {
  const f = fixture(), events = new Map<string, (event: DetectorEvent) => void>(), run = vi.fn(async () => true);
  const h = new Handsfree((role, callback) => { events.set(role, callback); return { push: vi.fn(), close: vi.fn() }; }, { available: () => true, transcribe: async () => "final approved words", run, cancel: () => f.preview.clear(), changed: () => {}, preview: f.preview });
  const id = h.start({ target: "chrome", wake: false }, "hold"); events.get("stop")!({ kind: "ready" });
  h.frame(id, 0, new Int16Array(2048).fill(2000).buffer); f.receive({ kind: "partial", text: "wrong provisional command" }); f.receive({ kind: "failed" });
  expect(h.state.phase).toBe("capturing"); h.release(id);
  await vi.waitFor(() => expect(run).toHaveBeenCalledWith("final approved words", "chrome"));
  expect(h.state.phase).toBe("off"); expect(run).toHaveBeenCalledOnce();
});

test("streaming cloud words and final transcription share one recognizer, without a second batch request", async () => {
  let partial!: (text: string) => void, commit!: (text: string) => void;
  const live = { push: vi.fn(), cancel: vi.fn(), finish: vi.fn(() => new Promise<string>(resolve => { commit = resolve; })) }, local = vi.fn<DetectorFactory>();
  const preview = new SpeechPreview(local, () => {}, receive => { partial = receive; return live; });
  const store = new ProviderStore(mkdtempSync(join(tmpdir(), "latham-stream-")), { isEncryptionAvailable: () => false, encryptString: () => Buffer.alloc(0), decryptString: () => "" }); store.settings.mode = "cloud";
  const voice = new Voice(store, () => {}, undefined, preview), id = voice.begin(); const pcm = new Int16Array(2048).fill(2000).buffer;
  voice.frame(id, 0, pcm); partial("open note"); expect(voice.transcript).toBe("");
  const result = voice.finish(id, pcm); expect(voice.status).toBe("transcribing"); expect(local).not.toHaveBeenCalled(); expect(live.push).toHaveBeenCalledOnce();
  commit("open Notepad"); await result; expect(voice.transcript).toBe("open Notepad"); expect(preview.state).toEqual({ text: "open Notepad", status: "final" }); expect(live.finish).toHaveBeenCalledOnce();
  partial("late wrong words"); expect(preview.state).toEqual({ text: "open Notepad", status: "final" });
  voice.cancel();
});

test("stopping streaming transcription discards late finals and direct-record completion feeds missing frames once", async () => {
  let commit!: (text: string) => void;
  const live = { push: vi.fn(), cancel: vi.fn(), finish: vi.fn(() => new Promise<string>(resolve => { commit = resolve; })) };
  const preview = new SpeechPreview(vi.fn<DetectorFactory>(), () => {}, () => live);
  const store = new ProviderStore(mkdtempSync(join(tmpdir(), "latham-stream-cancel-")), { isEncryptionAvailable: () => false, encryptString: () => Buffer.alloc(0), decryptString: () => "" }); store.settings.mode = "cloud";
  const voice = new Voice(store, () => {}, undefined, preview), id = voice.begin(), result = voice.finish(id, new Int16Array(2048).fill(2000).buffer);
  expect(live.push).toHaveBeenCalledOnce(); voice.cancel(); commit("late command"); await result;
  expect(voice.transcript).toBe(""); expect(preview.state.text).toBe(""); expect(live.cancel).toHaveBeenCalled();
});
