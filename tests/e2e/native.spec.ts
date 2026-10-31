import { test, expect, _electron, type Page } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

let focusFixture: (() => Promise<void>) | undefined;
async function fixture() {
  const child = spawn(resolve("dist/native/Latham.NativeFixture.exe"), [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: false });
  let latest: Record<string, unknown> = {}, count = 0, buffer = "";
  child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk: string) => { buffer += chunk; let end; while ((end = buffer.indexOf("\n")) >= 0) { latest = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); count++; } });
  child.stderr.resume();
  await expect.poll(() => latest.kind).toBe("ready");
  focusFixture = async () => {
    const beforeFocus = count; child.stdin.write('{"kind":"focus"}\n'); await expect.poll(() => count).toBeGreaterThan(beforeFocus);
  };
  return { child, state: () => latest, send: async (kind: string, extra = {}) => { const previous = count; child.stdin.write(JSON.stringify({ kind, ...extra }) + "\n"); await expect.poll(() => count).toBeGreaterThan(previous); }, close: () => child.kill() };
}
async function setup(directory?: string) {
  mkdirSync(".test-artifacts", { recursive: true }); directory ??= mkdtempSync(resolve(".test-artifacts/desktop-native-"));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && key !== "ELECTRON_RUN_AS_NODE"));
  const app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: directory, LATHAM_TEST_NATIVE_FIXTURE: "1" } });
  await expect.poll(() => app.context().pages().some(page => page.url() === "latham://app/index.html")).toBe(true);
  const desk = app.context().pages().find(page => page.url() === "latham://app/index.html")!;
  return { app, desk, directory };
}
async function prepare(desk: Page) {
  await desk.evaluate(() => window.setup.desktopScan());
  const windows = (await desk.evaluate(() => window.setup.state())).desktop.windows; expect(windows).toHaveLength(1);
  await focusFixture?.();
  await desk.evaluate(id => window.setup.desktopPrepare(id), windows[0]!.id);
  await expect.poll(() => desk.evaluate(async () => (await window.setup.state()).desktop.busy)).toBe(false);
  const state = (await desk.evaluate(() => window.setup.state())).desktop;
  expect(state.last?.reason).toBe("The intended native editor state was verified."); expect(state.bound).toBe(true);
}
async function run(desk: Page, command: string) {
  await desk.evaluate(command => window.setup.desktopRun(command), command);
  const state = (await desk.evaluate(() => window.setup.state())).desktop;
  expect(state.last?.reason).toBe("The intended native editor state was verified."); expect(state.last?.outcome).toBe("verified");
}

test("native app consent, exact editor binding, literal correction/undo and redaction", async () => {
  const f = await fixture(), ui = await setup();
  try {
    await ui.desk.evaluate(() => window.setup.desktopScan()); expect((await ui.desk.evaluate(() => window.setup.state())).desktop.windows).toEqual([]);
    await ui.desk.evaluate(() => window.setup.desktopPermission(true, false)); await prepare(ui.desk);
    await run(ui.desk, "replace dictation with open a new tab"); await expect.poll(() => f.state().text).toBe("open a new tab");
    await run(ui.desk, "dictate extra"); expect(f.state().text).toBe("open a new tab extra");
    await run(ui.desk, "correct that to fixed"); expect(f.state().text).toBe("open a new tab fixed");
    await run(ui.desk, "undo dictation"); expect(f.state().text).toBe("open a new tab");
    expect(JSON.stringify(await ui.desk.evaluate(() => window.setup.state()))).not.toContain("PRIVATE_NATIVE_SENTINEL");
    await ui.desk.evaluate(() => window.setup.desktopPermission(true, true));
    expect((await ui.desk.evaluate(() => window.setup.state())).desktop.approved).toBe(false);
    await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).desktop.fenceConfirmed)).toBe(true);
    expect(readFileSync(join(ui.directory, "desktop.json"), "utf8")).not.toContain("open a new tab");
  } finally { await ui.app.close(); f.close(); }
});

test("native user edits, replaced controls and wrong-field focus suspend instead of overwriting", async () => {
  const f = await fixture(), ui = await setup();
  try {
    await ui.desk.evaluate(() => window.setup.desktopPermission(true, false)); await prepare(ui.desk); await run(ui.desk, "dictate owned");
    await f.send("edit", { text: "USER_EDIT" });
    await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).desktop.bound)).toBe(false);
    expect(await ui.desk.evaluate(async () => { try { await window.setup.desktopRun("undo dictation"); return false; } catch { return true; } })).toBe(true); expect(f.state().text).toBe("USER_EDIT");
    await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).desktop.fenceConfirmed)).toBe(true);
    await prepare(ui.desk); await f.send("replace");
    await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).desktop.bound)).toBe(false);
    await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).desktop.fenceConfirmed)).toBe(true);
    await prepare(ui.desk); await f.send("focus_other");
    await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).desktop.bound)).toBe(false);
    await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).desktop.fenceConfirmed)).toBe(true);
    await prepare(ui.desk); await f.send("wrong_window");
    await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).desktop.bound)).toBe(false);
  } finally { await ui.app.close(); f.close(); }
});

test("a stalled UIA provider keeps Stop responsive and restart never replays an uncertain edit", async () => {
  test.setTimeout(60000); const f = await fixture(), ui = await setup();
  try {
    await ui.desk.evaluate(() => window.setup.desktopPermission(true, false)); await prepare(ui.desk);
    await f.send("block_after_edit");
    const editing = ui.desk.evaluate(() => window.setup.desktopRun("dictate one uncertain edit"));
    await expect.poll(() => f.state().text).toBe("one uncertain edit");
    const start = performance.now(); await ui.desk.evaluate(() => window.latham.stop());
    await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).desktop.fenceConfirmed)).toBe(true);
    const stopMs = Math.round(performance.now() - start); expect(stopMs).toBeLessThan(2000); await editing;
    expect((await ui.desk.evaluate(() => window.setup.state())).desktop.needsReview).toBe(true);
    await ui.app.close();
    const restarted = await setup(ui.directory);
    try {
      expect((await restarted.desk.evaluate(() => window.setup.state())).desktop).toMatchObject({ approved: true, active: false, needsReview: true });
      await restarted.desk.evaluate(() => window.setup.desktopScan()); expect((await restarted.desk.evaluate(() => window.setup.state())).desktop.windows).toEqual([]);
      await restarted.desk.evaluate(() => window.setup.desktopReconcile());
      await f.send("focus"); await prepare(restarted.desk); await run(restarted.desk, "inspect editor"); expect(f.state().text).toBe("one uncertain edit");
      writeFileSync(resolve(".test-artifacts/native-cancellation.json"), JSON.stringify({ stopMs, inFlight: "effect present before Stop; no replay on restart", recovery: "explicit inspection then fresh binding" }, null, 2));
    } finally { await restarted.app.close(); }
  } finally { await ui.app.close().catch(() => {}); f.close(); }
});

test("native worker loss preserves uncertainty; secure/read-only fields and reactive edits fail closed", async () => {
  test.setTimeout(60000); const f = await fixture(), ui = await setup();
  try {
    await ui.desk.evaluate(() => window.setup.desktopPermission(true, false)); await prepare(ui.desk); await f.send("block_after_edit");
    const editing = ui.desk.evaluate(() => window.setup.desktopRun("dictate lost reply")); await expect.poll(() => f.state().text).toBe("lost reply");
    const pid = await ui.app.evaluate(() => process.pid);
    const workers = JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-Command", `$agents = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Latham.DesktopAgent.exe' -and $_.ExecutablePath -eq '${resolve("dist/native/Latham.DesktopAgent.exe").replaceAll("'", "''")}' }); $supervisors = @($agents | Where-Object { $_.ParentProcessId -eq ${pid} }); @($agents | Where-Object { $_.ParentProcessId -in $supervisors.ProcessId -and $_.CommandLine -like '*--worker*' } | Select-Object -ExpandProperty ProcessId) | ConvertTo-Json -Compress`], { encoding: "utf8" }));
    const ids = Array.isArray(workers) ? workers : [workers]; expect(ids.length).toBe(1); expect(pid).toBeGreaterThan(0);
    execFileSync("taskkill.exe", ["/PID", String(ids[0]), "/F"], { stdio: "ignore" }); await editing;
    await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).desktop.needsReview)).toBe(true);
    await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).desktop.fenceConfirmed)).toBe(true);
    await ui.desk.evaluate(() => window.setup.desktopReconcile()); await f.send("focus"); await prepare(ui.desk);
    await f.send("reactive"); await ui.desk.evaluate(() => window.setup.desktopRun("replace dictation with overwritten"));
    expect((await ui.desk.evaluate(() => window.setup.state())).desktop.last?.outcome).toBe("unknown"); expect(f.state().text).toBe("PAGE_CHANGED_LATER");
    await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).desktop.fenceConfirmed)).toBe(true); await ui.desk.evaluate(() => window.setup.desktopReconcile());
    await f.send("readonly"); await ui.desk.evaluate(() => window.setup.desktopScan()); const windows = (await ui.desk.evaluate(() => window.setup.state())).desktop.windows;
    await ui.desk.evaluate(id => window.setup.desktopPrepare(id), windows[0]!.id); expect((await ui.desk.evaluate(() => window.setup.state())).desktop.bound).toBe(false);
    await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).desktop.fenceConfirmed)).toBe(true);
    if ((await ui.desk.evaluate(() => window.setup.state())).desktop.needsReview) await ui.desk.evaluate(() => window.setup.desktopReconcile());
    await f.send("replace"); await f.send("password"); await ui.desk.evaluate(() => window.setup.desktopScan()); const secureWindows = (await ui.desk.evaluate(() => window.setup.state())).desktop.windows;
    await ui.desk.evaluate(id => window.setup.desktopPrepare(id), secureWindows[0]!.id); expect((await ui.desk.evaluate(() => window.setup.state())).desktop.bound).toBe(false);
  } finally { await ui.app.close(); f.close(); }
});

test("window movement does not redirect edits and the shared transcript inserts only into its captured native binding", async () => {
  test.setTimeout(60000); const f = await fixture(), ui = await setup();
  try {
    await ui.desk.evaluate(async () => { const state = await window.setup.state(); await window.setup.save({ ...state.settings, mode: "cloud" }); await window.setup.key("FAKE_SYNTHETIC_PROVIDER_KEY_123456"); await window.setup.desktopPermission(true, false); });
    await ui.app.evaluate(() => { Reflect.set(globalThis, "fetch", async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "native piano music" }] } }] })); });
    await prepare(ui.desk); await f.send("move", { x: 200, y: 140 }); await f.send("scale"); await run(ui.desk, "inspect editor");
    await ui.desk.evaluate(async () => { const id = await window.setup.beginTurn(); const pcm = new Int16Array(16000); for (let n = 0; n < pcm.length; n++) pcm[n] = Math.sin(n * 0.1) * 3000; await window.setup.finishTurn(id, pcm.buffer); });
    expect((await ui.desk.evaluate(() => window.setup.state())).canInsertDesktopTranscript).toBe(true);
    await ui.desk.getByRole("button", { name: "Replace editor with transcript", exact: true }).click(); await expect.poll(() => f.state().text).toBe("native piano music");
    await f.send("focus_other"); await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).canInsertDesktopTranscript)).toBe(false);
    expect(await ui.desk.evaluate(async () => { try { await window.setup.desktopInsertTranscript("replace"); return false; } catch { return true; } })).toBe(true);
    writeFileSync(resolve(".test-artifacts/native-display.json"), JSON.stringify({ dpi: f.state().dpi, screens: f.state().screens, movedWindow: true, fixtureLayoutScale: 1.5, coordinateInput: false, limit: "one physical monitor; live mixed-DPI hardware not available" }, null, 2));
  } finally { await ui.app.close(); f.close(); }
});

test("100 targeted native editor operations verify their exact field values", async () => {
  test.setTimeout(90000); const f = await fixture(), ui = await setup(), elapsed: number[] = [];
  try {
    await ui.desk.evaluate(() => window.setup.desktopPermission(true, false)); await prepare(ui.desk);
    for (let n = 0; n < 25; n++) {
      for (const text of [`replace dictation with base ${n}`, "dictate extra", "correct that to fixed", "undo dictation"]) { await run(ui.desk, text); elapsed.push((await ui.desk.evaluate(() => window.setup.state())).desktop.last!.elapsedMs); }
      expect(f.state().text).toBe(`base ${n}`);
    }
    const sorted = [...elapsed].sort((a, b) => a - b);
    writeFileSync(resolve(".test-artifacts/native-benchmark.json"), JSON.stringify({ operations: elapsed.length, verified: elapsed.length, wrongEffects: 0, medianMs: sorted[49], p95Ms: sorted[94] }, null, 2));
  } finally { await ui.app.close(); f.close(); }
});

test("supervisor loss leaves Stop unconfirmed until restart and never replays an in-flight edit", async () => {
  test.setTimeout(60000); const f = await fixture(), ui = await setup();
  try {
    await ui.desk.evaluate(() => window.setup.desktopPermission(true, false)); await prepare(ui.desk); await f.send("block_after_edit");
    const editing = ui.desk.evaluate(() => window.setup.desktopRun("dictate supervisor loss")); await expect.poll(() => f.state().text).toBe("supervisor loss");
    const parent = await ui.app.evaluate(() => process.pid);
    const supervisor = Number(execFileSync("powershell.exe", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Latham.DesktopAgent.exe' -and $_.ParentProcessId -eq ${parent} -and $_.ExecutablePath -eq '${resolve("dist/native/Latham.DesktopAgent.exe").replaceAll("'", "''")}' } | Select-Object -ExpandProperty ProcessId`], { encoding: "utf8" }).trim());
    expect(supervisor).toBeGreaterThan(0); execFileSync("taskkill.exe", ["/PID", String(supervisor), "/F"], { stdio: "ignore" }); await editing;
    await expect.poll(() => ui.desk.evaluate(async () => (await window.setup.state()).desktop)).toMatchObject({ active: false, bound: false, needsReview: true, fenceConfirmed: false });
    expect(await ui.desk.evaluate(async () => { try { await window.setup.desktopReconcile(); return false; } catch { return true; } })).toBe(true);
    await expect.poll(() => execFileSync("powershell.exe", ["-NoProfile", "-Command", `@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Latham.DesktopAgent.exe' -and $_.ParentProcessId -eq ${supervisor} }).Count`], { encoding: "utf8" }).trim()).toBe("0");
    await ui.app.close(); const recovered = await setup(ui.directory);
    try { expect((await recovered.desk.evaluate(() => window.setup.state())).desktop.needsReview).toBe(true); await recovered.desk.evaluate(() => window.setup.desktopReconcile()); await f.send("focus"); await prepare(recovered.desk); await run(recovered.desk, "inspect editor"); expect(f.state().text).toBe("supervisor loss"); }
    finally { await recovered.app.close(); }
  } finally { await ui.app.close().catch(() => {}); f.close(); }
});
