import { test, expect, _electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

type Running = { application: ElectronApplication; page: Page; fixture: Page; directory: string };
const running = new Set<ElectronApplication>();
async function launch(directory?: string): Promise<Running> {
  const root = resolve(".test-artifacts");
  mkdirSync(root, { recursive: true });
  directory ??= mkdtempSync(join(root, "electron-"));
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const application = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: directory }, timeout: 30000 });
  running.add(application);
  await expect.poll(() => application.context().pages().some(item => item.url() === "latham://app/index.html")).toBe(true);
  const page = application.context().pages().find(item => item.url() === "latham://app/index.html")!;
  await page.getByRole("button", { name: "Show fixture tools", exact: true }).click();
  await expect(page.getByTestId("session-status")).toHaveText("Paused");
  const fixture = application.context().pages().find(item => item.url() === "latham://fixture/index.html");
  expect(fixture).toBeDefined();
  await fixture!.waitForFunction(() => typeof window.fixtureApi?.observe === "function");
  return { application, page, fixture: fixture!, directory };
}
async function start(page: Page): Promise<void> {
  await page.getByLabel("Allow local fixture").check();
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect(page.getByTestId("session-status")).toHaveText("Ready");
}
async function command(page: Page, text: string): Promise<void> {
  await page.getByLabel("Your command").fill(text);
  await page.getByRole("button", { name: /^Run command/ }).click();
}
test.afterEach(async () => { for (const app of running) { await app.close().catch(() => {}); running.delete(app); } });

test("typed fixture workflow, blocked effects, redaction and sandbox boundaries", async () => {
  const { application, page, fixture } = await launch();
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await expect(page.getByRole("button", { name: /^Run command/ })).toBeDisabled();
  expect(await fixture.evaluate(() => typeof window.latham)).toBe("undefined");
  expect(await page.evaluate(() => window.latham.runtime)).toEqual({ sandboxed: true, contextIsolated: true });
  expect(await page.evaluate(() => typeof Reflect.get(window, "require"))).toBe("undefined");
  expect(await fixture.evaluate(() => typeof Reflect.get(window, "require"))).toBe("undefined");
  expect(await application.evaluate(({ globalShortcut }) => globalShortcut.isRegistered("CommandOrControl+Alt+."))).toBe(true);
  expect(await application.evaluate(({ session }) => session.fromPartition("latham-phase0").isPersistent())).toBe(false);
  await start(page);
  await command(page, "type Hello Latham");
  await expect(page.getByTestId("action-result")).toContainText("verified success");
  await expect(fixture.getByLabel("Draft", { exact: true })).toHaveValue("Hello Latham");
  await command(page, "search music");
  await expect(fixture.locator("#result")).toHaveText("Search completed");
  await expect(page.getByTestId("session-status")).toHaveText("Ready");
  await command(page, "click Apply filter");
  await expect(page.getByTestId("action-result")).toContainText("Two controls match");
  await command(page, "click second Apply filter");
  await expect(fixture.locator("#result")).toHaveText("Filter B applied");
  await command(page, "click Continue");
  await expect(page.getByTestId("action-result")).toContainText("effect is unknown");
  await command(page, "click Apply for job");
  await expect(page.getByTestId("action-result")).toContainText("Consequential actions");
  await command(page, "write Account nickname: changed");
  await expect(page.getByTestId("action-result")).toContainText("Consequential actions");
  await command(page, "write Password: changed");
  await expect(page.getByTestId("action-result")).toContainText("Secure fields");
  await expect(fixture.locator("#counts")).toHaveText("Consequential events: 0");
  const observed = await fixture.evaluate(() => window.fixtureApi.observe());
  expect(JSON.stringify(observed)).not.toContain("PRIVATE_FIXTURE_PASSWORD");
  expect(JSON.stringify(observed)).not.toContain("DENIED_FRAME_PRIVATE_SENTINEL");
  expect(observed.deniedFrameCount).toBe(1);
  const state = await page.evaluate(() => window.latham.getState());
  expect(JSON.stringify(state)).not.toContain("PRIVATE_FIXTURE_PASSWORD");
  expect(state.targets.every(item => !("value" in item))).toBe(true);
  await fixture.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(fixture.locator("#counts")).toHaveText("Consequential events: 1");
  expect(await fixture.evaluate(async () => { try { await fetch("https://example.com"); return false; } catch { return true; } })).toBe(true);
  await page.screenshot({ path: ".test-artifacts/phase0-desktop.png" });
  await fixture.screenshot({ path: ".test-artifacts/phase0-fixture.png" });
  expect(errors).toEqual([]);
});

test("an uncertain real mutation stays unverified until an explicit fixture reset", async () => {
  const { page, fixture } = await launch();
  await start(page);
  await fixture.evaluate(() => {
    const original = window.fixtureApi.apply;
    window.fixtureApi.apply = request => { original(request); throw new Error("PRIVATE_RESPONSE_LOST"); };
  });
  await command(page, "type DISPATCHED_BEFORE_RESPONSE_LOSS");
  await expect(page.getByTestId("session-status")).toHaveText("Unverified");
  await expect(fixture.getByLabel("Draft", { exact: true })).toHaveValue("DISPATCHED_BEFORE_RESPONSE_LOSS");
  const state = await page.evaluate(() => window.latham.getState());
  expect(state.lastResult).toMatchObject({ outcome: "unverified", dispatch: "unknown" });
  expect(JSON.stringify(state.diagnostics)).not.toContain("PRIVATE_RESPONSE_LOST");
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect(page.getByTestId("session-status")).toHaveText("Unverified");
  await page.getByRole("button", { name: "Reset fixture", exact: true }).click();
  await expect(page.getByTestId("session-status")).toHaveText("Paused");
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await command(page, "type recovered");
  await expect(page.getByTestId("action-result")).toContainText("verified success");
  await expect(fixture.getByLabel("Draft", { exact: true })).toHaveValue("recovered");
});

test("Stop fences active/queued actions and replacement invalidates a captured target", async () => {
  const { page, fixture } = await launch();
  await start(page);
  await page.evaluate(async () => { const state = await window.latham.getState(); await window.latham.updateSettings({ ...state.settings, delayMs: 1500 }); });
  const pending = page.evaluate(() => window.latham.run("type MUST_NOT_LAND"));
  await expect(page.getByTestId("session-status")).toHaveText("Acting");
  const queued = page.evaluate(() => window.latham.run("type QUEUED_MUST_NOT_LAND"));
  await page.getByRole("button", { name: /^■ Stop/ }).click();
  expect(await pending).toMatchObject({ outcome: "cancelled", dispatch: "not_dispatched" });
  expect(await queued).toMatchObject({ outcome: "cancelled", dispatch: "not_dispatched" });
  await expect(fixture.getByLabel("Draft", { exact: true })).toHaveValue("");
  await expect(page.getByTestId("session-status")).toHaveText("Paused");
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  const stale = page.evaluate(() => window.latham.run("type STALE_MUST_NOT_LAND"));
  await expect(page.getByTestId("session-status")).toHaveText("Acting");
  await fixture.locator("summary").click();
  await fixture.getByRole("button", { name: "Replace the document identity and Draft node" }).click();
  expect(await stale).toMatchObject({ outcome: "blocked", dispatch: "not_dispatched", reason: "stale_target" });
  await expect(fixture.getByLabel("Draft", { exact: true })).toHaveValue("");
  await page.getByLabel("Allow local fixture").uncheck();
  const denied = await page.evaluate(() => window.latham.run("type DENIED"));
  expect(denied).toMatchObject({ outcome: "blocked", reason: "scope_denied" });
});

test("saved consent survives restart, starts paused, and diagnostics retain metadata only", async () => {
  const first = await launch();
  await start(first.page);
  await first.page.getByLabel("Save diagnostic metadata").check();
  await command(first.page, "type PRIVATE_COMMAND_PAYLOAD");
  await expect(first.page.getByTestId("action-result")).toContainText("verified success");
  const persisted = readFileSync(join(first.directory, "diagnostics.jsonl"), "utf8");
  expect(persisted).not.toContain("PRIVATE_COMMAND_PAYLOAD");
  expect(persisted).not.toContain("PRIVATE_FIXTURE_PASSWORD");
  expect(persisted).not.toContain("documentId");
  await first.application.close(); running.delete(first.application);
  const second = await launch(first.directory);
  await expect(second.page.getByLabel("Allow local fixture")).toBeChecked();
  await expect(second.page.getByTestId("session-status")).toHaveText("Paused");
  await second.page.getByRole("button", { name: "Clear diagnostics", exact: true }).click();
  expect(readFileSync(join(second.directory, "diagnostics.jsonl"), "utf8")).toBe("");
});
