import { test, expect, _electron, chromium } from "@playwright/test";
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { extensionId, hostName } from "../../apps/desktop/src/main/native-bridge";

function registryBackup(): () => void {
  const values = ["Google\\Chrome", "Chromium"].map(browser => {
    const path = `HKCU\\Software\\${browser}\\NativeMessagingHosts\\${hostName}`;
    try { const value = execFileSync("reg.exe", ["QUERY", path, "/ve"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).match(/REG_SZ\s+(.+)/)?.[1]?.trim(); return { path, value }; }
    catch { return { path, value: undefined }; }
  });
  return () => { for (const { path, value } of values) { if (value) execFileSync("reg.exe", ["ADD", path, "/ve", "/t", "REG_SZ", "/d", value, "/f"], { stdio: "ignore" }); else { try { execFileSync("reg.exe", ["DELETE", path, "/f"], { stdio: "ignore" }); } catch { /* Already absent. */ } } } };
}
test("saving a Gemini key also saves the cloud provider chosen in settings", async () => {
  mkdirSync(".test-artifacts", { recursive: true });
  const directory = mkdtempSync(resolve(".test-artifacts/gemini-setup-"));
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  try {
    await expect.poll(() => app.context().pages().some(page => page.url() === "latham://app/index.html")).toBe(true);
    const page = app.context().pages().find(page => page.url() === "latham://app/index.html")!;
    await expect.poll(() => app.context().pages().some(page => page.url() === "latham://companion/index.html")).toBe(true);
    const companion = app.context().pages().find(page => page.url() === "latham://companion/index.html")!;
    expect((await companion.evaluate(() => window.companion.state())).message).toBe("Choose Gemini or configure local speech in Settings.");
    await page.getByLabel("Use my API key (Gemini)", { exact: true }).check();
    await page.getByLabel("Gemini API key", { exact: true }).fill("FAKE_SETUP_FLOW_KEY_123456789012345");
    await page.getByRole("button", { name: /Store key|Save Gemini setup/, exact: true }).click();
    await expect.poll(() => page.evaluate(async () => (await window.setup.state()).keyStored)).toBe(true);
    await expect.poll(() => page.evaluate(async () => (await window.setup.state()).settings.mode)).toBe("cloud");
    expect(JSON.parse(readFileSync(join(directory, "providers.json"), "utf8")).settings.mode).toBe("cloud");
    await page.evaluate(() => window.setup.selectCompanionTarget("chrome"));
    await page.evaluate(() => window.setup.talkFromCompanion());
    expect((await companion.evaluate(() => window.companion.state())).message).toBe("Connect Latham's browser extension in Settings.");
    await companion.locator("#notice").evaluate(element => element.classList.remove("visible"));
    await page.evaluate(() => window.setup.talkFromCompanion());
    await expect(companion.locator("#notice")).toHaveClass(/visible/);
  } finally { await app.close(); }
});

test("real native messaging host pairs an MV3 worker, starts paused, executes deterministic tabs, reconnects without replay", async () => {
  test.setTimeout(60000);
  mkdirSync(".test-artifacts", { recursive: true });
  const restore = registryBackup(), directory = mkdtempSync(resolve(".test-artifacts/native-electron-"));
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    await expect.poll(() => app.context().pages().some(page => page.url() === "latham://app/index.html")).toBe(true);
    const page = app.context().pages().find(page => page.url() === "latham://app/index.html")!;
    await page.evaluate(() => window.setup.installHost());
    const extension = resolve("dist/chrome-extension");
    const repaired = resolve(".test-artifacts/chromium-runtime/chrome.exe");
    context = await chromium.launchPersistentContext(mkdtempSync(resolve(".test-artifacts/chromium-")), { channel: "chromium", ...(existsSync(repaired) ? { executablePath: repaired } : {}), headless: false, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole("button", { name: "Connect to Latham" }).click();
    try { await expect.poll(() => page.evaluate(async () => (await window.setup.state()).chromeConnected)).toBe(true); }
    catch (error) { console.log("Extension connection:", await popup.locator("#status").textContent()); throw error; }
    expect((await page.evaluate(() => window.setup.state())).chromeActive).toBe(false);
    await expect.poll(() => page.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true);
    await page.evaluate(() => window.setup.chromeResume()); const before = context.pages().length;
    await page.evaluate(() => window.setup.chromeRun("new tab"));
    await expect.poll(() => context!.pages().length).toBe(before + 1);
    expect((await page.evaluate(() => window.setup.state())).chromeResult).toBe("Verified browser result");
    await page.evaluate(() => window.setup.chromeRun("previous tab"));
    expect((await page.evaluate(() => window.setup.state())).chromeResult).toBe("Verified browser result");
    await page.evaluate(() => window.latham.stop()); expect((await page.evaluate(() => window.setup.state())).chromeActive).toBe(false);
    const denied = await page.evaluate(async () => { try { await window.setup.chromeRun("new tab"); return false; } catch { return true; } }); expect(denied).toBe(true);
    for (const worker of context.serviceWorkers()) await worker.evaluate("port?.disconnect()");
    await context.close(); context = undefined;
    await expect.poll(() => page.evaluate(async () => (await window.setup.state()).chromeConnected)).toBe(false);
    expect((await page.evaluate(() => window.setup.state())).chromeActive).toBe(false);
    expect(readFileSync(join(directory, "native/chrome/com.latham.host.json"), "utf8")).toContain(extensionId);
  } finally { for (const worker of context?.serviceWorkers() ?? []) await worker.evaluate("port?.disconnect()").catch(() => {}); await app.close(); await context?.close(); restore(); }
});

test("microphone capture is gated, buffers are bounded and Stop cancels a real capture", async () => {
  mkdirSync(".test-artifacts", { recursive: true });
  const directory = mkdtempSync(resolve(".test-artifacts/microphone-"));
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test", "--use-fake-device-for-media-stream"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  try {
    await expect.poll(() => app.context().pages().some(page => page.url() === "latham://app/index.html")).toBe(true);
    const page = app.context().pages().find(page => page.url() === "latham://app/index.html")!;
    expect(await page.evaluate(async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach(track => track.stop()); return false; } catch { return true; } })).toBe(true);
    const allowed = await page.evaluate(async () => { await window.setup.beginTurn(); try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const track = stream.getAudioTracks()[0]!; const state = track.readyState; stream.getTracks().forEach(item => item.stop()); return state; } catch (error) { return (error as Error).name; } });
    expect(allowed).toBe("live");
    await page.evaluate(() => window.latham.stop()); await expect(page.getByTestId("voice-status")).toHaveText("Voice: idle");
    expect((await page.evaluate(() => window.setup.state())).transcript).toBe("");
    await page.evaluate(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => { const stream = await original(constraints); Reflect.set(window, "testCapturedStream", stream); return stream; };
    });
    const talk = page.getByRole("button", { name: "Hold to talk", exact: true }); await talk.scrollIntoViewIfNeeded();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
      const fixture = BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html")!.contentView.children.find(child => "webContents" in child && (child as Electron.WebContentsView).webContents.getURL() === "latham://fixture/index.html");
      return fixture?.getBounds().height;
    })).toBe(0);
    const bounds = await talk.boundingBox(); expect(bounds).not.toBeNull(); await page.mouse.move(bounds!.x + 20, bounds!.y + 15); await page.mouse.down();
    await expect.poll(() => page.evaluate(() => (Reflect.get(window, "testCapturedStream") as MediaStream | undefined)?.getAudioTracks()[0]?.readyState)).toBe("live");
    await page.evaluate(() => window.latham.stop());
    await expect.poll(() => page.evaluate(() => (Reflect.get(window, "testCapturedStream") as MediaStream).getAudioTracks()[0]!.readyState)).toBe("ended");
    await page.mouse.up(); expect((await page.evaluate(() => window.setup.state())).transcript).toBe("");
    await page.screenshot({ path: ".test-artifacts/phase1-setup.png" });
  } finally { await app.close(); }
});
