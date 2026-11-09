import { test, expect, vi, afterEach } from "vitest";
import { ControlHold, watchControl } from "../../apps/desktop/src/main/control-hold";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers();
  const hooks = { start: vi.fn(async (_valid: () => boolean): Promise<string | null> => "turn"), release: vi.fn(), cancel: vi.fn() };
  return { hooks, hold: new ControlHold(hooks) };
}
test("a quick Ctrl tap and normal Ctrl chords never open a microphone", async () => {
  for (const event of ["up", "cancel"] as const) {
    const f = fixture(); f.hold.event("down"); await vi.advanceTimersByTimeAsync(249); f.hold.event(event);
    await vi.advanceTimersByTimeAsync(300); expect(f.hooks.start).not.toHaveBeenCalled();
  }
});
test("a held Ctrl starts once and release finishes exactly its own utterance", async () => {
  const f = fixture(); f.hold.event("down"); f.hold.event("down"); await vi.advanceTimersByTimeAsync(250);
  expect(f.hooks.start).toHaveBeenCalledOnce(); expect(f.hooks.start.mock.calls[0]![0]()).toBe(true);
  f.hold.event("up"); f.hold.event("up"); expect(f.hooks.release).toHaveBeenCalledExactlyOnceWith("turn"); expect(f.hooks.cancel).not.toHaveBeenCalled();
});
test("a chord or shutdown discards a held recording instead of executing it", async () => {
  const f = fixture(); f.hold.event("down"); await vi.advanceTimersByTimeAsync(250); f.hold.event("cancel"); f.hold.event("up");
  expect(f.hooks.cancel).toHaveBeenCalledExactlyOnceWith("turn"); expect(f.hooks.release).not.toHaveBeenCalled();
});
test("release during preparation invalidates activation and a late opened session is cancelled", async () => {
  for (const event of ["up", "cancel"] as const) {
    const f = fixture(); let finish!: (id: string) => void;
    f.hooks.start.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    f.hold.event("down"); await vi.advanceTimersByTimeAsync(250); const valid = f.hooks.start.mock.calls[0]![0];
    f.hold.event(event); expect(valid()).toBe(false); finish("late"); await Promise.resolve();
    expect(f.hooks.cancel).toHaveBeenCalledExactlyOnceWith("late"); expect(f.hooks.release).not.toHaveBeenCalled();
  }
});
test("holding Ctrl while busy never queues another turn and errors cannot leave a held session", async () => {
  const f = fixture(); f.hooks.start.mockResolvedValueOnce(null); f.hold.event("down"); await vi.advanceTimersByTimeAsync(1000); f.hold.event("up");
  expect(f.hooks.start).toHaveBeenCalledOnce(); expect(f.hooks.release).not.toHaveBeenCalled(); expect(f.hooks.cancel).not.toHaveBeenCalled();
  f.hooks.start.mockRejectedValueOnce(new Error("unavailable")); f.hold.event("down"); await vi.advanceTimersByTimeAsync(300); f.hold.event("up"); expect(f.hooks.release).not.toHaveBeenCalled();
});
test("native listener failure, malformed events and stale health cancel capture without restarting", async () => {
  for (const failure of ["exit", "invalid", "health"] as const) {
    const f = fixture(), child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: vi.fn() });
    vi.mocked(spawn).mockReturnValueOnce(child as unknown as ChildProcessWithoutNullStreams);
    const available = vi.fn(), close = watchControl("fixed-control-helper.exe", f.hold, available);
    child.stdout.write('{"kind":"ready"}\n{"kind":"down"}\n'); await vi.advanceTimersByTimeAsync(250);
    if (failure === "exit") child.emit("exit", 1);
    if (failure === "invalid") child.stdout.write('{"kind":"down","key":"SYNTHETIC_UNEXPECTED_FIELD"}\n');
    if (failure === "health") await vi.advanceTimersByTimeAsync(2250);
    expect(f.hooks.cancel).toHaveBeenCalledExactlyOnceWith("turn"); expect(available).toHaveBeenLastCalledWith(false); expect(child.kill).toHaveBeenCalledOnce();
    child.stdout.write('{"kind":"down"}\n'); await vi.advanceTimersByTimeAsync(300); expect(f.hooks.start).toHaveBeenCalledOnce(); close();
  }
});
