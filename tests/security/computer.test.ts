import { test, expect, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { Computer, computerDecision, type ComputerBroker } from "../../apps/desktop/src/main/computer";
import { emptyComputer, parseComputerAction, parseComputerOptions, isDirectComputerAction, type ComputerAction, type ComputerObservation } from "../../packages/contracts/src/computer";
const observation = (): ComputerObservation => ({ hwnd: "123", pid: 10, started: "100", app: "fixture", title: "Synthetic window", revision: "first", imageHash: "", inputTick: 1, capturedAt: Date.now(), width: 600, height: 400, targets: [{ id: "edit", name: "Draft", role: "Edit", actions: ["type", "focus"] }, { id: "search", name: "Search", role: "Button", actions: ["click"] }], image: "" });
const action = (kind: ComputerAction["kind"] = "done", fields: Partial<ComputerAction> = {}): ComputerAction => ({ kind, target: "", text: "", x: 0, y: 0, verifiedPrevious: true, reason: "Synthetic evidence", ...fields });
const options = { allowed: true, images: false, browserAllowed: false, route: "cloud", model: "gemini-3.1-flash-lite", deniedApps: [] };
function fixture(deniedNative = () => false) {
  const directory = mkdtempSync(resolve(".test-artifacts/computer-unit-"));
  const broker: ComputerBroker = { observe: vi.fn(async () => observation()), launch: vi.fn(async () => {}), act: vi.fn(async () => {}), restore: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
  const decide = vi.fn(async () => action()), changed = vi.fn(); const computer = new Computer(directory, broker, decide, changed, deniedNative);
  return { directory, broker, decide, changed, computer };
}
afterEach(() => vi.useRealTimers());

test("opening Notepad does not depend on scanning the current app's oversized accessibility tree", async () => {
  const f = fixture(), launch = vi.fn(async () => {}); Object.assign(f.broker, { launch });
  f.computer.configure(options); vi.mocked(f.broker.observe).mockRejectedValue(new Error("computer_tree_limit"));
  const run = f.computer.run("open notepad");
  expect(await run, f.computer.state.message).toBe(true); expect(launch).toHaveBeenCalledOnce();
  expect(f.computer.state.pending).toBeNull(); expect(f.computer.state.phase).toBe("complete");
  expect(f.broker.observe).not.toHaveBeenCalled(); expect(f.decide).not.toHaveBeenCalled();
});

test("automatic app launches retain app denial, Stop and uncertain-result boundaries", async () => {
  const blocked = fixture(); blocked.computer.configure({ ...options, deniedApps: ["notepad"] }); expect(await blocked.computer.run("open notepad")).toBe(false); expect(blocked.broker.launch).not.toHaveBeenCalled();
  for (const operation of ["stop", "unknown"] as const) {
    const f = fixture(); f.computer.configure(options);
    let finish!: () => void;
    if (operation === "stop") vi.mocked(f.broker.launch).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    if (operation === "unknown") vi.mocked(f.broker.launch).mockRejectedValueOnce(new Error("computer_result_unknown"));
    const run = f.computer.run("Please launch Calculator.");
    if (operation === "stop") { await f.computer.stop(); finish(); }
    expect(await run).toBe(false); expect(f.broker.launch).toHaveBeenCalledOnce();
    expect(f.computer.state.needsReview).toBe(true);
  }
});

test("compound goals keep the normal observation path and explain oversized trees in plain language", async () => {
  const f = fixture(); f.computer.configure(options); vi.mocked(f.broker.observe).mockRejectedValue(new Error("computer_tree_limit"));
  expect(await f.computer.run("open notepad and type hello")).toBe(false);
  expect(f.broker.launch).not.toHaveBeenCalled(); expect(f.computer.state.message).toContain("too many accessibility controls");
});

test("an app denial blocks both direct and planner-selected launches before dispatch", async () => {
  for (const app of ["notepad", "calculator"] as const) {
    const f = fixture(() => app === "notepad");
    f.computer.configure({ ...options, deniedApps: app === "calculator" ? ["Calc.exe"] : [] });
    expect(await f.computer.run(`open ${app}`)).toBe(false);
    expect(f.broker.launch).not.toHaveBeenCalled();

    f.decide.mockResolvedValueOnce(action("open", { text: app }));
    const run = f.computer.run(`open ${app} and describe the window`);
    try {
      await vi.waitFor(() => expect(f.computer.state.phase).toBe("blocked"), { timeout: 500 });
      expect(await run).toBe(false);
      expect(f.computer.state.message).toContain("computer_app_denied");
      expect(f.computer.state.pending).toBeNull();
      expect(f.computer.state.needsReview).toBe(false);
      expect(f.broker.restore).not.toHaveBeenCalled();
      expect(f.broker.act).not.toHaveBeenCalled();
    } finally { await f.computer.stop(); }
  }
});

test("an inherited Notepad denial is rechecked after approval and forwarded for unrelated actions", async () => {
  let denied = false;
  const f = fixture(() => denied);
  f.computer.configure(options);
  f.decide.mockResolvedValueOnce(action("open", { text: "notepad" }));
  const pending = f.computer.run("open Notepad and describe the window");
  await vi.waitFor(() => expect(f.computer.state.pending).not.toBeNull());
  denied = true;
  f.computer.approve(f.computer.state.pending!.id, true);
  expect(await pending).toBe(false);
  expect(f.computer.state.message).toContain("computer_app_denied");
  expect(f.broker.restore).not.toHaveBeenCalled();
  expect(f.broker.act).not.toHaveBeenCalled();

  f.decide.mockResolvedValueOnce(action("focus", { target: "edit" }));
  const unrelated = f.computer.run("get the draft ready for editing");
  await vi.waitFor(() => expect(f.computer.state.pending).not.toBeNull());
  f.computer.approve(f.computer.state.pending!.id, true);
  expect(await unrelated).toBe(true);
  const scope = expect.objectContaining({ deniedApps: ["notepad"] });
  expect(f.broker.observe).toHaveBeenLastCalledWith(false, false, ["notepad"], false, expect.any(AbortSignal));
  expect(f.broker.restore).toHaveBeenCalledWith(expect.anything(), scope, expect.any(AbortSignal));
  expect(f.broker.act).toHaveBeenCalledWith(expect.anything(), expect.anything(), scope, expect.any(AbortSignal));
  expect(f.computer.state.deniedApps).toEqual([]);
});
test("universal capture starts without consent off and cannot be enabled by a model or malformed options", async () => {
  const f = fixture(); expect(f.computer.ready).toBe(false); await expect(f.computer.run("read this window")).rejects.toThrow("computer_setup_required"); expect(f.broker.observe).not.toHaveBeenCalled();
  for (const value of [{ ...options, autoApprove: true }, { ...options, model: "remote/cloud" }, { ...options, deniedApps: ["../path"] }]) expect(() => parseComputerOptions(value)).toThrow();
  f.computer.configure(options); await expect(f.computer.run("read this window")).resolves.toBe(true); expect(f.broker.act).not.toHaveBeenCalled();
  const restarted = new Computer(f.directory, f.broker, f.decide, f.changed, () => false);
  expect(restarted.ready).toBe(true); expect(restarted.active).toBe(false); expect(restarted.state.pending).toBeNull();
});

test("remembered agreement restores chosen scopes and provider, while disable remains off after restart", async () => {
  const f = fixture(); f.computer.configure({ ...options, images: true, browserAllowed: true, route: "local", model: "fixture-vision", deniedApps: ["notepad"] });
  f.computer.blockOrigin("https://www.google.com"); await vi.waitFor(() => expect(f.computer.state.fenceConfirmed).toBe(true));
  const restarted = new Computer(f.directory, f.broker, f.decide, f.changed, () => false);
  expect(restarted.state).toMatchObject({ agreementAccepted: true, allowed: true, images: true, browserAllowed: true, route: "local", model: "fixture-vision", deniedApps: ["notepad"], deniedOrigins: ["https://www.google.com"] });
  expect(restarted.ready).toBe(true); expect(f.broker.observe).not.toHaveBeenCalled(); expect(f.decide).not.toHaveBeenCalled();
  restarted.configure({ ...options, allowed: false });
  const disabled = new Computer(f.directory, f.broker, f.decide, f.changed, () => false);
  expect(disabled.state.agreementAccepted).toBe(true); expect(disabled.ready).toBe(false); expect(disabled.state.allowed).toBe(false);
});

test("old, corrupt or future agreement storage cannot auto-grant access or erase known recovery state", () => {
  const f = fixture(), path = join(f.directory, "computer.json");
  writeFileSync(path, JSON.stringify({ version: 1, uncertain: true, deniedApps: ["notepad"], deniedOrigins: ["https://www.google.com"] }));
  const old = new Computer(f.directory, f.broker, f.decide, f.changed, () => false);
  expect(old.state).toMatchObject({ agreementAccepted: false, allowed: false, needsReview: true, deniedApps: ["notepad"], deniedOrigins: ["https://www.google.com"] });
  for (const raw of ["invalid", JSON.stringify({ version: 3, uncertain: false }), JSON.stringify({ version: 2, agreementVersion: 999, options, uncertain: false, deniedApps: ["notepad"], deniedOrigins: [] })]) {
    writeFileSync(path, raw); const invalid = new Computer(f.directory, f.broker, f.decide, f.changed, () => false);
    expect(invalid.ready).toBe(false); expect(invalid.state.agreementAccepted).toBe(false); expect(invalid.state.needsReview).toBe(true);
  }
});
test("model actions are bounded, grounded and consequential operations and unsupported keys are blocked", () => {
  for (const a of [action("click", { target: "missing" }), action("click"), action("scroll", { text: "down" }), action("key", { text: "Ctrl+Shift+Delete" }), action("open", { text: "powershell" }), action("type", { target: "edit", reason: "send the message" }), { ...action(), x: -1 }, { ...action(), grant: true }]) expect(() => parseComputerAction(a, observation())).toThrow();
  expect(parseComputerAction(action("type", { target: "edit", text: "hello" }), observation()).kind).toBe("type");
});
test("a complex task waits for one-use approval and requires a fresh unchanged window", async () => {
  const f = fixture(); f.computer.configure(options); f.decide.mockResolvedValueOnce(action("type", { target: "edit", text: "hello" })).mockResolvedValueOnce(action("done", { text: "Visible change verified" }));
  const run = f.computer.run("Focus Draft, then replace it with hello"); await vi.waitFor(() => expect(f.computer.state.phase).toBe("review"));
  expect(f.broker.act).not.toHaveBeenCalled(); const id = f.computer.state.pending!.id;
  expect(() => f.computer.approve("wrong", true)).toThrow(); f.computer.approve(id, true); expect(() => f.computer.approve(id, true)).toThrow();
  expect(await run).toBe(true); expect(f.broker.act).toHaveBeenCalledOnce(); expect(f.broker.observe).toHaveBeenCalledTimes(3); expect(f.computer.state.message).toBe("Visible change verified");
  expect(readFileSync(join(f.directory, "computer.json"), "utf8")).not.toContain("hello");
});

test("explicit single-control actions run directly but do not authorize extra model steps", async () => {
  const f = fixture(); f.computer.configure(options); f.decide.mockResolvedValueOnce(action("type", { target: "edit", text: "hello" })).mockResolvedValueOnce(action("click", { target: "search" })).mockResolvedValueOnce(action("done"));
  const run = f.computer.run("replace Draft with hello"); await vi.waitFor(() => expect(f.computer.state.pending).not.toBeNull());
  expect(f.broker.act).toHaveBeenCalledOnce(); expect(f.computer.state.pending?.scope).toBe("task");
  f.computer.approve(f.computer.state.pending!.id, false); expect(await run).toBe(false); expect(f.broker.act).toHaveBeenCalledOnce();
  const g = fixture(); g.computer.configure(options); g.decide.mockResolvedValueOnce(action("click", { target: "search" })).mockResolvedValueOnce(action("done"));
  expect(await g.computer.run("click Search")).toBe(true); expect(g.computer.state.pending).toBeNull(); expect(g.broker.restore).not.toHaveBeenCalled();
});

test("one complex-task confirmation covers bounded steps but coordinate clicks ask separately", async () => {
  const f = fixture(); f.computer.configure(options); f.decide.mockResolvedValueOnce(action("focus", { target: "edit" })).mockResolvedValueOnce(action("type", { target: "edit", text: "hello" })).mockResolvedValueOnce(action("done"));
  const run = f.computer.run("Focus Draft, replace its text, and verify the result"); await vi.waitFor(() => expect(f.computer.state.pending).not.toBeNull()); f.computer.approve(f.computer.state.pending!.id, true);
  expect(await run, f.computer.state.message).toBe(true); expect(f.broker.act).toHaveBeenCalledTimes(2); expect(f.broker.restore).toHaveBeenCalledOnce();
  const g = fixture(); g.computer.configure({ ...options, images: true }); vi.mocked(g.broker.observe).mockResolvedValue({ ...observation(), image: "synthetic-png", imageHash: "unchanged" });
  g.decide.mockResolvedValueOnce(action("focus", { target: "edit" })).mockResolvedValueOnce(action("click", { x: 200, y: 300 })).mockResolvedValueOnce(action("done"));
  const next = g.computer.run("Find the control and perform the task"); await vi.waitFor(() => expect(g.computer.state.pending?.scope).toBe("task")); g.computer.approve(g.computer.state.pending!.id, true);
  await vi.waitFor(() => expect(g.computer.state.pending?.scope).toBe("action")); expect(g.broker.act).toHaveBeenCalledOnce(); g.computer.approve(g.computer.state.pending!.id, false); expect(await next).toBe(false);
});

test("direct action authority must match an unambiguous user-named target and exact payload", () => {
  expect(isDirectComputerAction("click Search", action("click", { target: "search" }), observation())).toBe(true);
  expect(isDirectComputerAction("click Something else", action("click", { target: "search" }), observation())).toBe(false);
  expect(isDirectComputerAction("replace Draft with hello", action("type", { target: "edit", text: "different" }), observation())).toBe(false);
  const duplicate = observation(); duplicate.targets.push({ ...duplicate.targets[1]!, id: "other" }); expect(isDirectComputerAction("click Search", action("click", { target: "search" }), duplicate)).toBe(false);
  expect(isDirectComputerAction("press Enter", action("key", { text: "Enter" }), observation())).toBe(false);
});
test("changed targets after review are blocked before dispatch, and unverified previous effects stop the loop", async () => {
  const f = fixture(); f.computer.configure(options); f.decide.mockResolvedValue(action("click", { target: "search" }));
  vi.mocked(f.broker.observe).mockResolvedValueOnce(observation()).mockResolvedValueOnce({ ...observation(), revision: "changed" });
  const run = f.computer.run("search"); await vi.waitFor(() => expect(f.computer.state.pending).not.toBeNull()); f.computer.approve(f.computer.state.pending!.id, true);
  expect(await run).toBe(false); expect(f.broker.act).not.toHaveBeenCalled();
  const g = fixture(); g.computer.configure(options); g.decide.mockResolvedValueOnce(action("click", { target: "search" })).mockResolvedValueOnce(action("done", { verifiedPrevious: false }));
  const next = g.computer.run("search"); await vi.waitFor(() => expect(g.computer.state.pending).not.toBeNull()); g.computer.approve(g.computer.state.pending!.id, true); expect(await next).toBe(false); expect(g.computer.state.message).toContain("previous_effect_unverified");
});
test("Stop cancels pending inference and cannot authorize a late provider reply", async () => {
  const f = fixture(); f.computer.configure(options); let release!: (a: ComputerAction) => void; f.decide.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const run = f.computer.run("search"); await vi.waitFor(() => expect(f.computer.state.phase).toBe("thinking")); await f.computer.stop(); release(action("click", { target: "search" }));
  expect(await run).toBe(false); expect(f.computer.state.pending).toBeNull(); expect(f.broker.act).not.toHaveBeenCalled();
});
test("approval expiration, revocation and rejection cannot dispatch or leave pending images", async () => {
  vi.useFakeTimers(); const f = fixture(); f.computer.configure(options); f.decide.mockResolvedValueOnce(action("click", { target: "search" }));
  const run = f.computer.run("search"); await vi.waitFor(() => expect(f.computer.state.phase).toBe("review")); await vi.advanceTimersByTimeAsync(31000); expect(await run).toBe(false); expect(f.broker.act).not.toHaveBeenCalled(); expect(f.computer.pendingImage).toBe("");
  const g = fixture(); g.computer.configure(options); g.decide.mockResolvedValue(action("click", { target: "search" })); const next = g.computer.run("search"); await vi.waitFor(() => expect(g.computer.state.pending).not.toBeNull()); const id = g.computer.state.pending!.id; await g.computer.stop(); expect(() => g.computer.approve(id, true)).toThrow(); expect(await next).toBe(false);
});
test("uncertain dispatched input survives restart and cannot silently resume", async () => {
  const f = fixture(); f.computer.configure(options); f.decide.mockResolvedValue(action("click", { target: "search" })); vi.mocked(f.broker.act).mockRejectedValueOnce(new Error("computer_result_unknown"));
  const run = f.computer.run("search"); await vi.waitFor(() => expect(f.computer.state.pending).not.toBeNull()); f.computer.approve(f.computer.state.pending!.id, true); expect(await run).toBe(false); expect(f.computer.state.needsReview).toBe(true);
  const restarted = new Computer(f.directory, f.broker, f.decide, f.changed, () => false); expect(restarted.state.needsReview).toBe(true); expect(restarted.state.agreementAccepted).toBe(true); expect(restarted.ready).toBe(false); restarted.reconcile(); expect(restarted.state.needsReview).toBe(false); expect(restarted.ready).toBe(true);
  f.computer.reconcile(); expect(f.computer.state.phase).toBe("ready"); expect(f.broker.act).toHaveBeenCalledOnce();
});
test("explicit native/site denials propagate independently of browser extension access", async () => {
  const f = fixture(); f.computer.configure(options); f.computer.blockOrigin("https://www.google.com"); await vi.waitFor(() => expect(f.computer.state.fenceConfirmed).toBe(true));
  expect(f.computer.state.deniedOrigins).toEqual(["https://www.google.com"]); await f.computer.run("read"); expect(f.broker.observe).toHaveBeenCalledWith(false, false, [], true, expect.any(AbortSignal));
});
test("provider sends only explicit context, keeps the key in headers and rejects ungrounded replies", async () => {
  const request = vi.fn(async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(action("done", { text: "Synthetic window" })) }] } }] }));
  const decision = computerDecision(() => "SYNTHETIC_GEMINI_SECRET", request); await decision("read", observation(), [], { ...emptyComputer(), ...options, route: "cloud" }, new AbortController().signal);
  const init = request.mock.calls[0] as unknown as [string, RequestInit]; expect(String(init[1].body)).not.toContain("SYNTHETIC_GEMINI_SECRET"); expect(String(init[1].body)).not.toContain('"hwnd"');
});

test("local reasoning refuses remote and non-vision models without fallback or a cloud request", async () => {
  for (const metadata of [{ capabilities: ["completion"], remote_host: "https://remote.invalid" }, { capabilities: ["completion"] }]) {
    const request = vi.fn(async () => Response.json(metadata));
    await expect(computerDecision(() => { throw Error("must_not_read_key"); }, request)("read", { ...observation(), image: "synthetic" }, [], { ...emptyComputer(), ...options, route: "local", model: "installed-model", images: true }, new AbortController().signal)).rejects.toThrow("local_vision_model_required");
    expect(request).toHaveBeenCalledOnce(); expect((request.mock.calls as unknown as [string, RequestInit][])[0]![0]).toBe("http://127.0.0.1:11434/api/show");
  }
});

test("URL fields cannot be used to execute script or privileged URI schemes", () => {
  const current = observation(); current.targets[0]!.name = "Address and search bar";
  for (const text of ["javascript:alert(1)", "file:///C:/private.txt", "ms-settings:privacy", "data:text/html,script"]) expect(() => parseComputerAction(action("type", { target: "edit", text }), current)).toThrow("computer_launch_blocked");
  expect(parseComputerAction(action("type", { target: "edit", text: "https://example.com" }), current).text).toBe("https://example.com");
});
