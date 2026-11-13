import { test, expect, _electron } from "@playwright/test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setup, run, verified } from "./browser-fixture";
import { extensionId } from "../../apps/desktop/src/main/native-bridge";

test("Edge switching isolates approval and rejects an Edge host claiming Chrome even through registry fallback", async () => {
  test.setTimeout(60000); const f = await setup(false, false, "edge");
  try {
    expect((await f.desk.evaluate(() => window.setup.state())).browser).toBe("edge");
    expect(await f.context.serviceWorkers()[0]!.evaluate("new Promise(resolve => chrome.extension.isAllowedIncognitoAccess(resolve))")).toBe(false);
    await run(f.desk, "focus Search"); await verified(f.desk); await run(f.desk, "start dictation"); await verified(f.desk);
    await run(f.desk, "dictate piano"); await verified(f.desk);
    const popup = f.context.pages().find(p => p.url() === `chrome-extension://${extensionId}/popup.html`)!;
    await f.desk.evaluate(() => window.setup.chooseBrowser("chrome"));
    let state = await f.desk.evaluate(() => window.setup.state()); expect(state.chromeConnected).toBe(false); expect(state.chromeActive).toBe(false); expect(state.sites.every(s => !s.consent)).toBe(true);
    const configPath = join(f.directory, "native/edge/connection.json"), previous = readFileSync(configPath, "utf8");
    // Even a fallback manifest claiming Chrome must fail against the actual Edge ancestor.
    writeFileSync(configPath, JSON.stringify({ ...JSON.parse(previous), browser: "chrome" }));
    await popup.getByRole("button", { name: "Connect to Latham", exact: true }).click();
    await expect.poll(() => f.context.serviceWorkers()[0]!.evaluate("connection")).toContain("Disconnected");
    expect((await f.desk.evaluate(() => window.setup.state())).chromeConnected).toBe(false);
    writeFileSync(configPath, previous);
    await f.desk.evaluate(() => window.setup.chooseBrowser("edge"));
    await popup.getByRole("button", { name: "Connect to Latham", exact: true }).click();
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).chromeConnected)).toBe(true);
    state = await f.desk.evaluate(() => window.setup.state()); expect(state.chromeActive).toBe(false); expect(state.sites[0]?.consent).toBe(true);
  } finally { await f.close(); }
});

test("keyboard navigation, Escape, display recovery and explicit local task evaluation survive restart", async () => {
  test.setTimeout(60000);
  const directory = mkdtempSync(resolve(".test-artifacts/phase9-ui-"));
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  let app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  const pageFor = async () => { await expect.poll(() => app.context().pages().some(p => p.url() === "latham://app/index.html")).toBe(true); return app.context().pages().find(p => p.url() === "latham://app/index.html")!; };
  try {
    let page = await pageFor();
    await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Skip to assistant setup" })).toBeFocused();
    await page.keyboard.press("Enter"); await expect(page.locator("#assistant-setup")).toBeFocused(); expect(page.url()).toBe("latham://app/index.html");
    await page.evaluate(() => window.setup.beginTurn()); await page.keyboard.press("Escape"); expect((await page.evaluate(() => window.setup.state())).voice).toBe("idle");
    await page.evaluate(() => window.setup.beginTurn());
    await app.evaluate(({ screen, BrowserWindow }) => { BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html")!.setBounds({ x: -15000, y: -15000, width: 900, height: 600 }); screen.emit("display-removed", {}, screen.getPrimaryDisplay()); });
    expect((await page.evaluate(() => window.setup.state())).voice).toBe("idle");
    expect(await app.evaluate(({ screen, BrowserWindow }) => { const bounds = BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html")!.getBounds(), area = screen.getDisplayMatching(bounds).workArea; return bounds.x >= area.x && bounds.y >= area.y && bounds.x + bounds.width <= area.x + area.width && bounds.y + bounds.height <= area.y + area.height; })).toBe(true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html")!.setSize(680, 520));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Advanced settings", exact: true }).click();
    const panel = page.getByRole("region", { name: "Compatibility and evaluation", exact: true });
    await panel.getByText("Record a task evaluation on this device", { exact: true }).click();
    await expect(panel.getByRole("button", { name: "Save task evaluation", exact: true })).toBeDisabled();
    await panel.getByLabel("Completion time in seconds", { exact: true }).fill("42");
    await panel.getByRole("checkbox").check(); await panel.getByRole("button", { name: "Save task evaluation", exact: true }).click();
    await expect.poll(() => page.evaluate(async () => (await window.setup.state()).evaluation.trials.length)).toBe(1);
    await page.screenshot({ path: ".test-artifacts/phase9-keyboard-window.png" });
    // Keep sticky controls out of a full-region capture; the viewport capture above retains them.
    await panel.screenshot({ path: ".test-artifacts/phase9-keyboard-feedback.png", style: ".app-header,.skip-link { visibility:hidden !important; }" });
    await app.close(); app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } }); page = await pageFor();
    expect((await page.evaluate(() => window.setup.state())).evaluation.trials[0]?.seconds).toBe(42);
    expect((await page.evaluate(() => window.setup.state())).voice).toBe("idle");
    await page.evaluate(() => window.setup.clearEvaluation()); expect((await page.evaluate(() => window.setup.state())).evaluation.trials).toEqual([]);
  } finally { await app.close(); }
});
