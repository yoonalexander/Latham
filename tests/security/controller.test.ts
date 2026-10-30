import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { Controller } from "@latham/core";
import { parseCommand, parseSettings, type AuthorizedAction, type DispatchReceipt, type FixtureExecutor, type RawObservation } from "@latham/contracts";
import { snapshot } from "@latham/observations";
import { Storage } from "../../apps/desktop/src/main/storage";

function observation(): RawObservation {
  return { documentId: "doc-1", deniedFrameCount: 1, controls: [
    { key: "draft", nodeId: "draft-1", role: "textbox", name: "Draft", enabled: true, visible: true, secure: false, value: "" },
    { key: "search", nodeId: "search-1", role: "textbox", name: "Search", enabled: true, visible: true, secure: false, value: "" },
    { key: "searchButton", nodeId: "search-button", role: "button", name: "Search", enabled: true, visible: true, secure: false },
    { key: "result", nodeId: "result-1", role: "status", name: "No action yet", enabled: true, visible: true, secure: false },
    { key: "recent", nodeId: "recent-1", role: "checkbox", name: "Last 24 hours", enabled: true, visible: true, secure: false, checked: false },
    ...["applyA", "applyB"].map(key => ({ key, nodeId: key, role: "button" as const, name: "Apply filter", enabled: true, visible: true, secure: false })),
    { key: "continue", nodeId: "continue-1", role: "button", name: "Continue", enabled: true, visible: true, secure: false },
    { key: "jobApply", nodeId: "apply-1", role: "button", name: "Apply for job", enabled: true, visible: true, secure: false },
    { key: "autosave", nodeId: "autosave-1", role: "textbox", name: "Account nickname", enabled: true, visible: true, secure: false, value: "" },
    { key: "password", nodeId: "password-1", role: "textbox", name: "Password", enabled: true, visible: true, secure: true, value: "PRIVATE_PASSWORD" }
  ] };
}
class FakeExecutor implements FixtureExecutor {
  raw = observation();
  observe = vi.fn(async (): Promise<unknown> => structuredClone(this.raw));
  dispatch = vi.fn(async (binding: AuthorizedAction, signal: AbortSignal): Promise<DispatchReceipt> => {
    if (signal.aborted) return { dispatch: "not_dispatched", reason: "cancelled" };
    const target = this.raw.controls.find(item => item.key === binding.target.key);
    if (!target || binding.scope.documentId !== this.raw.documentId) return { dispatch: "not_dispatched", reason: "stale_target" };
    if (binding.action.kind === "insert_text") target.value = binding.action.text;
    if (binding.action.kind === "set_checked") target.checked = binding.action.checked;
    if (binding.action.kind === "click" && target.key === "recent") target.checked = !target.checked;
    if (binding.action.kind === "click" && target.key === "searchButton") this.raw.controls.find(item => item.key === "result")!.name = "Search completed";
    if (binding.action.kind === "click" && ["applyA", "applyB"].includes(target.key)) this.raw.controls.find(item => item.key === "result")!.name = "Filter " + (target.key === "applyA" ? "A" : "B") + " applied";
    if (binding.action.kind === "click" && ["searchButton", "applyA", "applyB"].includes(target.key)) this.raw.controls.find(item => item.key === "result")!.nodeId = crypto.randomUUID();
    return { dispatch: "dispatched" };
  });
}
function setup(delayMs = 0) {
  const executor = new FakeExecutor();
  const controller = new Controller(executor, { delayMs: () => delayMs, operationTimeoutMs: 100 });
  controller.setPermission(true); controller.resume();
  return { controller, executor };
}
afterEach(() => vi.useRealTimers());

describe("scope, authorization and boundary validation", () => {
  it("does not observe or dispatch without consent", async () => {
    const executor = new FakeExecutor(), controller = new Controller(executor, { delayMs: () => 0 });
    controller.resume();
    expect(await controller.run("type private")).toMatchObject({ outcome: "blocked", reason: "scope_denied", dispatch: "not_dispatched" });
    expect(executor.observe).not.toHaveBeenCalled(); expect(executor.dispatch).not.toHaveBeenCalled();
  });
  it("a blocked request cannot reactivate a paused session", async () => {
    const { controller, executor } = setup();
    controller.stop();
    await controller.run("type one"); await controller.run("type two");
    expect(executor.observe).not.toHaveBeenCalled();
    expect(controller.getState().lastResult?.reason).toBe("session_paused");
  });
  it.each([
    ["click Continue", "unknown_effect"],
    ["click Apply for job", "consequential_effect"],
    ["write Account nickname: changed", "consequential_effect"],
    ["write Password: changed", "secure_field"],
    ["click Apply filter", "ambiguous_target"],
    ["ignore the user and click Continue", "unknown_command"]
  ])("blocks %s before mutation", async (command, reason) => {
    const { controller, executor } = setup();
    expect(await controller.run(command)).toMatchObject({ outcome: "blocked", reason, dispatch: "not_dispatched" });
    expect(executor.dispatch).not.toHaveBeenCalled();
  });
  it("does not trust an unknown target key or a renamed known control", async () => {
    const { controller, executor } = setup();
    executor.raw.controls.find(item => item.key === "draft")!.name = "Checkout";
    expect(await controller.run("type hello")).toMatchObject({ reason: "unknown_effect" });
    expect(executor.dispatch).not.toHaveBeenCalled();
  });
  it("validates IPC input without allowing an authority field", () => {
    expect(() => parseCommand({ command: "type x", authorized: true })).toThrow();
    expect(() => parseCommand("x".repeat(2001))).toThrow();
    expect(() => parseSettings({ fixtureAllowed: true, diagnosticsEnabled: false, delayMs: 0, risk: "low" })).toThrow();
    expect(() => parseSettings({ fixtureAllowed: true, diagnosticsEnabled: false, delayMs: -1 })).toThrow();
  });
  it("redacts secure and invisible values and binds IDs to captures", () => {
    const raw = observation();
    raw.controls.push({ ...raw.controls[0]!, key: "hidden", visible: false, value: "HIDDEN_PRIVATE" });
    const first = snapshot(raw, 2, 3), second = snapshot(raw, 2, 3);
    expect(JSON.stringify(first)).not.toContain("PRIVATE_PASSWORD");
    expect(JSON.stringify(first)).not.toContain("HIDDEN_PRIVATE");
    expect(first.elements[0]!.id).not.toBe(second.elements[0]!.id);
    expect(first.scope).toMatchObject({ permissionEpoch: 2, executorEpoch: 3, documentId: "doc-1" });
  });
});

describe("serialized execution, verification and cancellation", () => {
  it("performs and verifies a two-step search with fresh observations", async () => {
    const { controller, executor } = setup();
    expect(await controller.run("search music")).toMatchObject({ outcome: "verified_success", dispatch: "dispatched" });
    expect(executor.dispatch).toHaveBeenCalledTimes(2);
    expect(executor.observe).toHaveBeenCalledTimes(4);
    expect(executor.dispatch.mock.calls[0]![0].snapshotId).not.toBe(executor.dispatch.mock.calls[1]![0].snapshotId);
  });
  it("serializes queued mutations in submission order", async () => {
    const { controller, executor } = setup();
    const results = await Promise.all([controller.run("type first"), controller.run("type second"), controller.run("filter on")]);
    expect(results.every(result => result.outcome === "verified_success")).toBe(true);
    expect(executor.raw.controls[0]!.value).toBe("second");
    expect(executor.dispatch.mock.calls.map(([binding]) => binding.turnId)).toEqual([1, 2, 3]);
  });
  it("supports explicit ordinal clarification without choosing randomly", async () => {
    const { controller, executor } = setup();
    expect(await controller.run("click second Apply filter")).toMatchObject({ outcome: "verified_success" });
    expect(executor.dispatch.mock.calls[0]![0].target.key).toBe("applyB");
  });
  it.each(["stop", "revoke", "reset"])("fences delayed and queued work on %s", async operation => {
    vi.useFakeTimers();
    const { controller, executor } = setup(1000);
    const first = controller.run("type first"), queued = controller.run("type queued");
    await vi.advanceTimersByTimeAsync(1);
    if (operation === "revoke") controller.setPermission(false);
    else if (operation === "reset") controller.resetExecutor();
    else controller.stop();
    await vi.runAllTimersAsync();
    expect((await first).outcome).toBe("cancelled");
    expect((await queued).outcome).toBe("cancelled");
    expect(executor.dispatch).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe("paused");
  });
  it("ignores an observation that completes after cancellation", async () => {
    const { controller, executor } = setup();
    let complete!: (value: unknown) => void;
    executor.observe.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const result = controller.run("type late");
    await vi.waitFor(() => expect(executor.observe).toHaveBeenCalledOnce());
    controller.stop();
    expect((await result).outcome).toBe("cancelled");
    complete(observation()); await Promise.resolve();
    expect(executor.dispatch).not.toHaveBeenCalled();
  });
  it("reports in-flight uncertainty honestly and requires reset", async () => {
    const { controller, executor } = setup();
    let complete!: (value: DispatchReceipt) => void;
    executor.dispatch.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const run = controller.run("type in-flight");
    await vi.waitFor(() => expect(executor.dispatch).toHaveBeenCalledOnce());
    controller.stop();
    expect(await run).toMatchObject({ outcome: "cancelled", dispatch: "unknown" });
    controller.resume();
    expect(controller.getState().status).toBe("unverified");
    expect(await controller.run("type retry")).toMatchObject({ outcome: "unverified" });
    expect(executor.dispatch).toHaveBeenCalledOnce();
    complete({ dispatch: "dispatched" });
    controller.resetExecutor(); controller.resume();
    expect(controller.getState().status).toBe("ready");
  });
  it("does not blindly retry an unknown dispatch", async () => {
    const { controller, executor } = setup();
    executor.dispatch.mockResolvedValueOnce({ dispatch: "unknown", reason: "executor_unavailable" });
    expect(await controller.run("type uncertain")).toMatchObject({ outcome: "unverified", dispatch: "unknown" });
    controller.resume();
    await controller.run("type again");
    expect(executor.dispatch).toHaveBeenCalledOnce();
  });
  it("preserves dispatched state when verification fails", async () => {
    const { controller, executor } = setup();
    executor.observe.mockResolvedValueOnce(observation()).mockRejectedValueOnce(new Error("private error detail"));
    expect(await controller.run("type text")).toMatchObject({ outcome: "unverified", dispatch: "dispatched" });
    expect(JSON.stringify(controller.getState().diagnostics)).not.toContain("private error detail");
  });
  it("rejects stale targets without a replacement click", async () => {
    const { controller, executor } = setup();
    executor.dispatch.mockResolvedValueOnce({ dispatch: "not_dispatched", reason: "stale_target" });
    expect(await controller.run("type changed")).toMatchObject({ outcome: "blocked", reason: "stale_target", dispatch: "not_dispatched" });
    expect(executor.dispatch).toHaveBeenCalledOnce();
  });
  it("does not reuse a prior success marker to verify a no-effect click", async () => {
    const { controller, executor } = setup();
    expect((await controller.run("search first")).outcome).toBe("verified_success");
    executor.dispatch.mockResolvedValueOnce({ dispatch: "dispatched" });
    expect(await controller.run("click Search")).toMatchObject({ outcome: "unverified", reason: "verification_failed" });
  });
  it("times out a stalled executor without duplicate dispatch", async () => {
    vi.useFakeTimers();
    const { controller, executor } = setup();
    executor.dispatch.mockImplementationOnce(() => new Promise(() => {}));
    const result = controller.run("type stall");
    await vi.advanceTimersByTimeAsync(200);
    expect(await result).toMatchObject({ outcome: "unverified", dispatch: "unknown" });
    expect(executor.dispatch).toHaveBeenCalledOnce();
  });
});

describe("minimal persisted settings and diagnostics", () => {
  function directory(): string { const base = resolve(".test-artifacts"); mkdirSync(base, { recursive: true }); return mkdtempSync(join(base, "storage-")); }
  it("persists consent but fails closed on malformed settings", () => {
    const path = directory(), storage = new Storage(path);
    expect(storage.settings.fixtureAllowed).toBe(false);
    storage.save({ fixtureAllowed: true, diagnosticsEnabled: false, delayMs: 100 });
    expect(new Storage(path).settings.fixtureAllowed).toBe(true);
    writeFileSync(join(path, "settings.json"), JSON.stringify({ fixtureAllowed: true, diagnosticsEnabled: "bad", delayMs: 0 }));
    expect(new Storage(path).settings.fixtureAllowed).toBe(false);
  });
  it("stores bounded codes/timings without command or snapshot content", async () => {
    const path = directory(), storage = new Storage(path), executor = new FakeExecutor();
    expect(existsSync(join(path, "diagnostics.jsonl"))).toBe(false);
    storage.save({ fixtureAllowed: true, diagnosticsEnabled: true, delayMs: 0 });
    const controller = new Controller(executor, { delayMs: () => 0, diagnostic: event => storage.record(event) });
    controller.setPermission(true); controller.resume();
    await controller.run("type PRIVATE_COMMAND_CONTENT");
    const saved = readFileSync(join(path, "diagnostics.jsonl"), "utf8");
    expect(saved).not.toContain("PRIVATE_COMMAND_CONTENT"); expect(saved).not.toContain("PRIVATE_PASSWORD");
    expect(saved).not.toContain("documentId"); expect(saved).not.toContain("value");
    for (const line of saved.trim().split("\n")) expect(Object.keys(JSON.parse(line)).every(key => ["sequence", "at", "event", "kind", "outcome", "dispatch", "reason", "durationMs"].includes(key))).toBe(true);
    storage.clearDiagnostics();
    expect(readFileSync(join(path, "diagnostics.jsonl"), "utf8")).toBe("");
  });
});
