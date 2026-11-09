import { test, expect, vi, afterEach } from "vitest";
import { Handsfree } from "../../apps/desktop/src/main/handsfree";
import type { DetectorEvent, DetectorRole } from "../../apps/desktop/src/main/local-detector";
import { parseHandsfreeConfig } from "../../packages/contracts/src/handsfree";
import { parseProviderSettings, providerDefaults } from "../../packages/contracts/src/setup";
import { inspectLocalModel } from "../../packages/speech/src/providers";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers();
  const callbacks = new Map<DetectorRole, (event: DetectorEvent) => void>(), pushes = { stop: vi.fn(), wake: vi.fn(), approve: vi.fn(), preview: vi.fn() }, closes = { stop: vi.fn(), wake: vi.fn(), approve: vi.fn(), preview: vi.fn() };
  const hooks = { available: vi.fn(() => true), transcribe: vi.fn(async () => "scroll down"), run: vi.fn(async () => true), cancel: vi.fn(), changed: vi.fn(), approve: vi.fn(), approvalId: vi.fn((): string | null => null) };
  const h = new Handsfree((role, receive) => { callbacks.set(role, receive); return { push: pushes[role], close: closes[role] }; }, hooks);
  let sequence = 0;
  const frame = (voiced = false, id = h.state.id!): void => h.frame(id, sequence++, new Int16Array(2048).fill(voiced ? 2000 : 0).buffer);
  const utterance = (): void => { frame(true); frame(true); for (let i = 0; i < 7; i++) frame(); };
  const start = (wake = false): string => { sequence = 0; const id = h.start({ target: "chrome", wake }); callbacks.get("stop")!({ kind: "ready" }); if (wake) callbacks.get("wake")!({ kind: "ready" }); return id; };
  return { h, hooks, callbacks, pushes, closes, frame, utterance, start };
}
test("session opt-in is strict, unavailable targets cannot open capture, and no state persists", () => {
  for (const value of [null, {}, { target: "all", wake: true }, { target: "chrome", wake: false, autoApprove: true }]) expect(() => parseHandsfreeConfig(value)).toThrow();
  const f = fixture(); expect(f.h.state.phase).toBe("off"); f.hooks.available.mockReturnValue(false); expect(() => f.start()).toThrow("prepare_handsfree_target"); expect(f.h.state.id).toBe(null);
});
test("idle wake audio stays local, waits for both detectors and discards pre-wake audio", async () => {
  const f = fixture(); f.h.start({ target: "chrome", wake: true }); f.callbacks.get("wake")!({ kind: "ready" });
  expect(f.h.state.audioReady).toBe(false); f.frame(true); expect(f.h.state.audioReady).toBe(true); expect(f.h.state.phase).toBe("starting"); f.callbacks.get("stop")!({ kind: "ready" });
  f.utterance(); await Promise.resolve(); expect(f.hooks.transcribe).not.toHaveBeenCalled(); expect(f.pushes.stop).toHaveBeenCalled(); expect(f.pushes.wake).toHaveBeenCalled();
  f.callbacks.get("wake")!({ kind: "match" }); expect(f.h.state.phase).toBe("listening"); f.utterance(); await vi.waitFor(() => expect(f.hooks.run).toHaveBeenCalledTimes(1)); expect(f.h.state.phase).toBe("listening"); f.h.end();
});
test("successive commands serialize without a queue; stop is independent of delayed ASR", async () => {
  const f = fixture(); f.start(); f.utterance(); await vi.waitFor(() => expect(f.hooks.run).toHaveBeenCalledTimes(1));
  let resolve!: (value: string) => void; f.hooks.transcribe.mockImplementationOnce(() => new Promise<string>(done => { resolve = done; }));
  f.utterance(); expect(f.h.state.phase).toBe("transcribing"); const count = f.pushes.stop.mock.calls.length;
  f.utterance(); expect(f.pushes.stop.mock.calls.length).toBeGreaterThan(count); expect(f.hooks.transcribe).toHaveBeenCalledTimes(2);
  f.callbacks.get("stop")!({ kind: "match" }); expect(f.h.state.phase).toBe("off"); expect(f.hooks.cancel).toHaveBeenCalledOnce();
  resolve("dictate stale result"); await Promise.resolve(); expect(f.hooks.run).toHaveBeenCalledTimes(1); expect(f.closes.stop).toHaveBeenCalledOnce();
});
test("stop during execution/verification cannot revive listening after the late result", async () => {
  const f = fixture(); let resolve!: (value: boolean) => void; f.hooks.run.mockImplementation(() => new Promise<boolean>(done => { resolve = done; }));
  f.start(); f.utterance(); await vi.waitFor(() => expect(f.h.state.phase).toBe("executing")); f.frame(true);
  f.callbacks.get("stop")!({ kind: "match" }); resolve(true); await Promise.resolve(); expect(f.h.state.phase).toBe("off"); expect(f.hooks.cancel).toHaveBeenCalledOnce();
});
test("lost frames, invalid audio, microphone and detector failure end the session", () => {
  for (const failure of ["sequence", "audio", "mic", "detector", "stalled", "target"]) {
    const f = fixture(), id = f.start();
    if (failure === "sequence") f.h.frame(id, 2, new ArrayBuffer(4096));
    if (failure === "audio") f.h.frame(id, 0, new ArrayBuffer(100000));
    if (failure === "mic") f.h.fail(id);
    if (failure === "detector") f.callbacks.get("stop")!({ kind: "failed" });
    if (failure === "stalled") vi.advanceTimersByTime(2750);
    if (failure === "target") { f.hooks.available.mockReturnValue(false); vi.advanceTimersByTime(250); }
    expect(f.h.state.phase, failure).toBe("off"); expect(f.hooks.cancel).toHaveBeenCalledOnce();
    f.h.frame(id, 0, new ArrayBuffer(4096)); expect(f.hooks.transcribe).not.toHaveBeenCalled();
  }
});
test("idle and total timeouts close capture even when frames and background noise continue", () => {
  const f = fixture(); f.start(true);
  for (let i = 0; i < 91; i++) { f.frame(true); vi.advanceTimersByTime(1000); } expect(f.h.state.phase).toBe("off");
  const g = fixture(); g.start(); for (let i = 0; i < 120; i++) g.frame(true); expect(g.h.state.phase).toBe("off"); expect(g.h.state.message).toContain("15 seconds");
});
test("reserved stop text cannot be inserted; blocked and failed commands never auto-retry", async () => {
  for (const text of ["stop assistant", "dictate stop assistant", "exit session", "STOP."]) {
    const f = fixture(); f.hooks.transcribe.mockResolvedValue(text); f.start(); f.utterance(); await vi.waitFor(() => expect(f.h.state.phase).toBe("off")); expect(f.hooks.run).not.toHaveBeenCalled();
  }
  const f = fixture(); f.hooks.run.mockResolvedValue(false); f.start(); f.utterance(); await vi.waitFor(() => expect(f.h.state.phase).toBe("off")); expect(f.hooks.run).toHaveBeenCalledOnce();
});
test("old detector events and audio cannot stop or authorize a replacement session", () => {
  const f = fixture(), old = f.start(), receive = f.callbacks.get("stop")!; f.h.end(); const next = f.start();
  receive({ kind: "match" }); f.h.fail(old); f.frame(true, old); expect(f.h.state.id).toBe(next); expect(f.h.state.phase).toBe("listening"); f.h.end();
});
test("companion activation authorizes exactly one verified command and closes the mic and detector", async () => {
  const f = fixture(); const id = f.h.start({ target: "chrome", wake: false }, "single");
  f.callbacks.get("stop")!({ kind: "ready" }); f.utterance();
  await vi.waitFor(() => expect(f.h.state.phase).toBe("off"));
  expect(f.hooks.run).toHaveBeenCalledOnce(); expect(f.hooks.cancel).toHaveBeenCalledOnce();
  expect(f.closes.stop).toHaveBeenCalledOnce(); expect(f.h.state.message).toBe("Command verified. Microphone off.");
  f.frame(true, id); expect(f.hooks.run).toHaveBeenCalledOnce();
  f.start(); f.utterance(); await vi.waitFor(() => expect(f.hooks.run).toHaveBeenCalledTimes(2));
  expect(f.h.state.phase).toBe("listening"); f.h.end();
});
test("hold capture waits through silence; release closes the mic and transcribes exactly once", async () => {
  const f = fixture(); const id = f.h.start({ target: "chrome", wake: false }, "hold"); f.callbacks.get("stop")!({ kind: "ready" });
  f.utterance(); await Promise.resolve(); expect(f.hooks.transcribe).not.toHaveBeenCalled(); expect(f.h.capturingAudio).toBe(true);
  f.h.release("stale"); expect(f.h.capturingAudio).toBe(true); f.h.release(id);
  expect(f.h.capturingAudio).toBe(false); expect(f.h.state.phase).toBe("transcribing"); expect(f.closes.stop).toHaveBeenCalledOnce();
  f.h.release(id); f.frame(true); await vi.waitFor(() => expect(f.h.state.phase).toBe("off"));
  expect(f.hooks.transcribe).toHaveBeenCalledOnce(); expect(f.hooks.run).toHaveBeenCalledOnce();
});
test("release without speech discards audio; missed key release cancels at the held limit", () => {
  const f = fixture(); const id = f.h.start({ target: "chrome", wake: false }, "hold"); f.callbacks.get("stop")!({ kind: "ready" }); f.frame(); f.h.release(id);
  expect(f.h.state.phase).toBe("off"); expect(f.hooks.transcribe).not.toHaveBeenCalled();
  const g = fixture(); g.h.start({ target: "chrome", wake: false }, "hold"); g.callbacks.get("stop")!({ kind: "ready" });
  for (let i = 0; i < 16 && g.h.active; i++) { g.frame(); vi.advanceTimersByTime(1000); }
  expect(g.h.state.phase).toBe("off"); expect(g.hooks.transcribe).not.toHaveBeenCalled();
});
test("released hold inference needs no audio heartbeat and Stop still fences late replies", async () => {
  const f = fixture(); let finish!: (text: string) => void;
  f.hooks.transcribe.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const id = f.h.start({ target: "chrome", wake: false }, "hold"); f.callbacks.get("stop")!({ kind: "ready" }); f.utterance(); f.h.release(id);
  vi.advanceTimersByTime(4000); expect(f.h.state.phase).toBe("transcribing"); expect(f.h.capturingAudio).toBe(false);
  f.callbacks.get("stop")!({ kind: "ready" }); expect(f.h.state.phase).toBe("transcribing");
  f.h.end(); finish("scroll down"); await Promise.resolve(); expect(f.hooks.run).not.toHaveBeenCalled();
});
test("a companion turn cannot execute late transcription after Stop, or report success after cancellation", async () => {
  for (const stage of ["transcribe", "run"] as const) {
    const f = fixture(); let finish!: (value: never) => void;
    if (stage === "transcribe") f.hooks.transcribe.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    else f.hooks.run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    f.h.start({ target: "chrome", wake: false }, "single"); f.callbacks.get("stop")!({ kind: "ready" }); f.utterance();
    await vi.waitFor(() => expect(f.h.state.phase).toBe(stage === "run" ? "executing" : "transcribing"));
    f.callbacks.get("stop")!({ kind: "match" }); const message = f.h.state.message;
    finish((stage === "run" ? true : "scroll down") as never); await Promise.resolve(); await Promise.resolve();
    expect(f.h.state.phase).toBe("off"); expect(f.h.state.message).toBe(message);
    expect(f.hooks.run).toHaveBeenCalledTimes(stage === "run" ? 1 : 0);
  }
});
test("detector startup exceptions/readiness timeouts fail closed and the five-minute cap is absolute", async () => {
  const f = fixture(); const broken = new Handsfree(() => { throw Error("missing_runtime"); }, f.hooks);
  expect(() => broken.start({ target: "chrome", wake: false })).toThrow("local_detector_unavailable"); expect(broken.state.phase).toBe("off");
  const pending = fixture(); pending.h.start({ target: "chrome", wake: false }); for (let i = 0; i < 9; i++) { pending.frame(); vi.advanceTimersByTime(1000); } expect(pending.h.state.phase).toBe("off");
  const g = fixture(); g.start(); for (let i = 0; i < 301 && g.h.active; i++) { g.frame(); if (i % 30 === 0) { g.utterance(); await Promise.resolve(); await Promise.resolve(); } vi.advanceTimersByTime(1000); }
  expect(g.h.state.phase).toBe("off"); expect(g.hooks.run.mock.calls.length).toBeGreaterThan(8);
});
test("local model options migrate old settings and reject malformed resources/language before spawn", () => {
  const { speechLanguage: _language, speechVocabulary: _vocabulary, speechThreads: _threads, ...old } = providerDefaults;
  expect(parseProviderSettings(old).speechThreads).toBe(2);
  for (const extra of [{ speechThreads: 0 }, { speechLanguage: "xx" }, { speechVocabulary: "a\nb" }]) expect(() => parseProviderSettings({ ...providerDefaults, ...extra })).toThrow();
  const directory = mkdtempSync(join(tmpdir(), "latham-speech-model-")), executable = join(directory, "whisper-cli.exe"), model = join(directory, "ggml-base.en.bin");
  writeFileSync(executable, "TEST_FIXTURE_NOT_EXECUTED"); const bytes = Buffer.alloc(1000000); bytes.write("lmgg"); writeFileSync(model, bytes);
  expect(inspectLocalModel(executable, model)).toMatchObject({ bytes: 1000000, englishOnly: true, threads: 2 });
  expect(() => inspectLocalModel(executable, model, { speechLanguage: "ko", speechThreads: 2, speechVocabulary: "" })).toThrow("english_model_language_mismatch");
  writeFileSync(model, "broken"); expect(() => inspectLocalModel(executable, model)).toThrow("local_model_unavailable_or_invalid");
});

test("universal continuous approval waits for local readiness and only authorizes the current execution", async () => {
  const f = fixture(); let finish!: (value: boolean) => void;
  f.hooks.run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  f.h.start({ target: "computer", wake: false }); f.callbacks.get("stop")!({ kind: "ready" });
  expect(f.h.state.phase).toBe("starting"); f.callbacks.get("approve")!({ kind: "ready" }); expect(f.h.state.phase).toBe("listening");
  const approve = f.callbacks.get("approve")!; approve({ kind: "match" }); expect(f.hooks.approve).not.toHaveBeenCalled();
  f.utterance(); await vi.waitFor(() => expect(f.h.state.phase).toBe("executing"));
  f.hooks.approvalId.mockReturnValue("first"); f.frame(); expect(f.pushes.approve).toHaveBeenCalled();
  approve({ kind: "match", audioStartMs: 0, audioEndMs: 100 }); expect(f.hooks.approve).not.toHaveBeenCalled();
  approve({ kind: "match", audioStartMs: 1152, audioEndMs: 1280 }); expect(f.hooks.approve).toHaveBeenCalledWith("first");
  f.hooks.approvalId.mockReturnValue("second"); approve({ kind: "match", audioStartMs: 1152, audioEndMs: 1280 }); f.frame(); approve({ kind: "match", audioStartMs: 1152, audioEndMs: 1280 }); expect(f.hooks.approve).toHaveBeenCalledOnce();
  f.callbacks.get("stop")!({ kind: "match" }); approve({ kind: "match" }); finish(true); await Promise.resolve();
  expect(f.h.state.phase).toBe("off"); expect(f.hooks.approve).toHaveBeenCalledOnce(); expect(f.closes.approve).toHaveBeenCalledOnce();
  const g = fixture(); g.h.start({ target: "computer", wake: false }, "hold"); expect(g.callbacks.has("approve")).toBe(false); g.h.end();
});
