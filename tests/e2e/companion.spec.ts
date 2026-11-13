import { test, expect, _electron } from "@playwright/test";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { setup, mockLiveSpeech } from "./browser-fixture";
import { wav } from "../../packages/speech/src/providers";
import { spawn, execFileSync } from "node:child_process";

function rememberAgreement(directory: string, uncertain = false): void {
  writeFileSync(join(directory, "computer.json"), JSON.stringify({ version: 2, agreementVersion: 1, options: { allowed: true, images: true, browserAllowed: true, route: "cloud", model: "gemini-3.1-flash-lite" }, uncertain, deniedApps: [], deniedOrigins: [] }));
}

test("uncertain-result guidance points to explicit recovery without replaying the previous task", async () => {
  const directory = mkdtempSync(resolve(".test-artifacts/computer-recovery-ui-")), bootstrap = join(directory, "bootstrap.cjs");
  rememberAgreement(directory, true);
  writeFileSync(bootstrap, `const child = require("node:child_process"), spawn = child.spawn; globalThis.recoveryWorkerCalls = 0;
    child.spawn = (file, ...args) => { if (file.endsWith("Latham.ComputerAgent.exe")) { globalThis.recoveryWorkerCalls++; throw new Error("Unexpected input replay"); } return spawn(file, ...args); };
    require(${JSON.stringify(resolve("dist/main.cjs"))});`);
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const app = await _electron.launch({ args: [bootstrap, "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  try {
    await expect.poll(() => app.context().pages().some(page => page.url() === "latham://companion/index.html")).toBe(true);
    const settings = app.context().pages().find(page => page.url() === "latham://app/index.html")!, overlay = app.context().pages().find(page => page.url() === "latham://companion/index.html")!;
    await expect(overlay.locator("#caption")).toHaveText("Check the last task");
    await expect(overlay.locator("#detail")).toHaveText("Settings → I've checked — continue");
    expect((await overlay.evaluate(() => window.companion.state())).sessionId).toBeNull();
    const recovery = settings.getByRole("region", { name: "Previous task recovery", exact: true });
    await expect(recovery).toBeVisible(); expect(JSON.parse(readFileSync(join(directory, "computer.json"), "utf8")).uncertain).toBe(true);
    await recovery.screenshot({ path: ".test-artifacts/computer-recovery-card.png" });
    await overlay.screenshot({ path: ".test-artifacts/companion-recovery-guide.png" });
    const fits = await overlay.evaluate(() => { const box = document.getElementById("companion")!.getBoundingClientRect(), detail = document.getElementById("detail")!.getBoundingClientRect(); return detail.top >= box.top && detail.bottom <= box.bottom; }); expect(fits).toBe(true);
    await recovery.getByRole("button", { name: "I've checked — continue", exact: true }).click();
    await expect(recovery).toHaveCount(0);
    await expect.poll(async () => (await settings.evaluate(() => window.setup.state())).computer.needsReview).toBe(false);
    expect((await settings.evaluate(() => window.setup.state())).computer).toMatchObject({ allowed: true, agreementAccepted: true, fenceConfirmed: true, phase: "ready" });
    expect(JSON.parse(readFileSync(join(directory, "computer.json"), "utf8")).uncertain).toBe(false);
    expect(await app.evaluate(() => Reflect.get(globalThis, "recoveryWorkerCalls"))).toBe(0);
    expect((await overlay.evaluate(() => window.companion.state())).recoveryRequired).toBe(false);
    await expect(overlay.locator("#caption")).toHaveText("Previous result checked. Hold Ctrl for a new command.");
  } finally { await app.close(); }
});

test("one click enables app access without starting capture, and disable survives restart", async () => {
  const directory = mkdtempSync(resolve(".test-artifacts/computer-onboarding-"));
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const launch = () => _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test", "--latham-companion"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  let app = await launch();
  const settings = async () => { await expect.poll(() => app.context().pages().some(page => page.url() === "latham://companion/index.html")).toBe(true); return app.context().pages().find(page => page.url() === "latham://app/index.html")!; };
  try {
    let page = await settings();
    const agreement = page.getByRole("region", { name: "Latham first-run agreement", exact: true });
    await expect(agreement).toBeVisible();
    await expect(page.getByRole("button", { name: "Enable Latham", exact: true })).toBeEnabled();
    await expect(page.getByRole("heading", { name: "Universal assistant", exact: true })).toBeHidden();
    await page.screenshot({ path: ".test-artifacts/computer-first-run-agreement.png" });
    expect((await page.evaluate(() => window.setup.state())).computer).toMatchObject({ agreementAccepted: false, allowed: false });
    const overlay = app.context().pages().find(page => page.url() === "latham://companion/index.html")!;
    expect((await overlay.evaluate(() => window.companion.state())).sessionId).toBeNull();
    await agreement.getByRole("button", { name: "Enable Latham", exact: true }).click();
    await expect(agreement).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open Notepad", exact: true })).toBeEnabled();
    expect((await page.evaluate(() => window.setup.state())).computer).toMatchObject({ agreementAccepted: true, allowed: true, images: false, browserAllowed: false });
    expect((await overlay.evaluate(() => window.companion.state())).sessionId).toBeNull();
    await page.screenshot({ path: ".test-artifacts/computer-remembered-access.png" });
    await page.getByRole("button", { name: "App access", exact: true }).click();
    await expect(page.getByLabel("Allow window images", { exact: true })).not.toBeChecked();
    await expect(page.getByLabel("Include browser windows without the extension", { exact: true })).not.toBeChecked();
    await page.getByText("Provider and app blocks", { exact: true }).click();
    await page.getByLabel("Blocked process names (comma separated)", { exact: true }).fill("notepad");
    await page.getByRole("button", { name: "Save universal access settings", exact: true }).click();
    await expect.poll(async () => (await page.evaluate(() => window.setup.state())).computer.deniedApps).toEqual(["notepad"]);
    await app.close(); app = await launch(); page = await settings();
    expect((await page.evaluate(() => window.setup.state())).computer).toMatchObject({ agreementAccepted: true, allowed: true, images: false, browserAllowed: false, deniedApps: ["notepad"], needsReview: false });
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html")!.isVisible())).toBe(false);
    await page.evaluate(() => window.setup.computerRun("open notepad"));
    expect((await page.evaluate(() => window.setup.state())).computer.message).toContain("computer_app_denied");
    await page.evaluate(() => window.setup.computerDisable());
    await app.close(); app = await launch(); page = await settings();
    expect((await page.evaluate(() => window.setup.state())).computer).toMatchObject({ agreementAccepted: true, allowed: false });
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html")!.isVisible())).toBe(false);
  } finally { await app.close(); }
});

test("plain Electron launch opens Settings on the first request without a debugger", async () => {
  const directory = mkdtempSync(resolve(".test-artifacts/settings-plain-launch-")), bootstrap = join(directory, "bootstrap.cjs");
  rememberAgreement(directory);
  // Playwright's Electron debugger changes this first-show behavior; use a plain child process.
  writeFileSync(bootstrap, `const { app, BrowserWindow, Tray } = require("electron");
    let menu; const original = Tray.prototype.setContextMenu;
    Tray.prototype.setContextMenu = function(value) { menu = value; return original.call(this, value); };
    app.on("browser-window-created", (_event, window) => window.webContents.on("did-finish-load", () => {
      if (window.webContents.getURL() !== "latham://companion/index.html") return;
      setTimeout(() => {
        const settings = BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html");
        const before = settings.isVisible(); menu.items.find(item => item.label === "Settings…").click();
        setTimeout(async () => {
            const first = { visible: settings.isVisible(), rendered: await settings.webContents.executeJavaScript("!!document.querySelector('.quick-start h2')") };
          settings.webContents.sendInputEvent({ type: "mouseDown", x: 30, y: 30, button: "left", clickCount: 1 });
          settings.webContents.sendInputEvent({ type: "mouseUp", x: 30, y: 30, button: "left", clickCount: 1 });
          setTimeout(() => {
            const afterClick = settings.isVisible(); settings.hide(); menu.items.find(item => item.label === "Settings…").click();
            setTimeout(() => { console.log("SETTINGS_FIRST_OPEN " + JSON.stringify({ before, first, afterClick, secondVisible: settings.isVisible() })); app.quit(); }, 150);
          }, 100);
        }, 250);
      }, 100);
    })); require(${JSON.stringify(resolve("dist/main.cjs"))});`);
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  for (const windowsHide of [true, false]) {
    const output = execFileSync(resolve("node_modules/electron/dist/electron.exe"), [bootstrap, "--latham-test", "--latham-companion"], { env: { ...env, LATHAM_TEST_DATA_DIR: directory }, windowsHide, encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "pipe"] });
    const report = JSON.parse(output.split(/\r?\n/).find(line => line.startsWith("SETTINGS_FIRST_OPEN "))!.slice("SETTINGS_FIRST_OPEN ".length));
    expect(report, `windowsHide: ${windowsHide}`).toEqual({ before: false, first: { visible: true, rendered: true }, afterClick: true, secondVisible: true });
  }
});

test("a Settings request during startup waits for the UI instead of exposing an empty window", async () => {
  mkdirSync(".test-artifacts", { recursive: true });
  const directory = mkdtempSync(resolve(".test-artifacts/settings-startup-")), bootstrap = join(directory, "bootstrap.cjs");
  rememberAgreement(directory);
  writeFileSync(bootstrap, `const { app, Tray, session } = require("electron"); const original = Tray.prototype.setContextMenu; Tray.prototype.setContextMenu = function(menu) { globalThis.lathamTestTray = { tray: this, menu }; return original.call(this, menu); }; app.on("ready", () => { const protocol = session.fromPartition("latham-phase0").protocol; const handle = protocol.handle.bind(protocol); protocol.handle = (scheme, handler) => handle(scheme, async request => { if (request.url === "latham://app/renderer.js") await new Promise(resolve => { globalThis.releaseSettingsScript = resolve; }); return handler(request); }); }); require(${JSON.stringify(resolve("dist/main.cjs"))});`);
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const app = await _electron.launch({ args: [bootstrap, "--latham-test", "--latham-companion"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  try {
    await expect.poll(() => app.evaluate(() => typeof Reflect.get(globalThis, "releaseSettingsScript"))).toBe("function");
    const visibleBeforeReady = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html")!;
      const menu = Reflect.get(globalThis, "lathamTestTray").menu as Electron.Menu;
      menu.items.find(item => item.label === "Settings…")!.click();
      await new Promise(resolve => setTimeout(resolve, 200)); return window.isVisible();
    });
    expect(visibleBeforeReady, "The first Settings click must not expose its window before the renderer loads.").toBe(false);
    await app.evaluate(() => Reflect.get(globalThis, "releaseSettingsScript")());
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html")!.isVisible())).toBe(true);
    const settings = app.context().pages().find(page => page.url() === "latham://app/index.html")!;
    await expect(settings.getByRole("heading", { name: "Try Latham", exact: true })).toBeVisible();
    await settings.locator("h1").click();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html")!.isVisible())).toBe(true);
  } finally { await app.evaluate(() => Reflect.get(globalThis, "releaseSettingsScript")?.()).catch(() => {}); await app.close(); }
});

test("the first tray Settings click after companion startup paints settings and keeps them open", async () => {
  mkdirSync(".test-artifacts", { recursive: true });
  const directory = mkdtempSync(resolve(".test-artifacts/settings-first-open-")), bootstrap = join(directory, "bootstrap.cjs");
  rememberAgreement(directory);
  writeFileSync(bootstrap, `const { Tray } = require("electron"); const setContextMenu = Tray.prototype.setContextMenu; Tray.prototype.setContextMenu = function(menu) { globalThis.lathamTestTray = { tray: this, menu }; return setContextMenu.call(this, menu); }; require(${JSON.stringify(resolve("dist/main.cjs"))});`);
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const app = await _electron.launch({ args: [bootstrap, "--latham-test", "--latham-companion"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  try {
    await expect.poll(() => app.context().pages().some(page => page.url() === "latham://companion/index.html")).toBe(true);
    const settings = app.context().pages().find(page => page.url() === "latham://app/index.html")!;
    const first = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html")!;
      const events: string[] = []; window.on("show", () => events.push("show")); window.on("hide", () => events.push("hide"));
      Reflect.set(globalThis, "settingsFirstOpenEvents", events);
      const fixture = window.contentView.children.find(child => "webContents" in child) as Electron.WebContentsView;
      const before = { visible: window.isVisible(), fixture: fixture.getBounds() };
      const menu = Reflect.get(globalThis, "lathamTestTray").menu as Electron.Menu;
      menu.items.find(item => item.label === "Settings…")!.click();
      const shownInsideMenuCallback = window.isVisible();
      await new Promise(resolve => setTimeout(resolve, 350));
      return { before, shownInsideMenuCallback, visible: window.isVisible(), fixture: fixture.getBounds(), events };
    });
    expect(first.before.visible).toBe(false); expect(first.shownInsideMenuCallback).toBe(false); expect(first.visible).toBe(true);
    expect(first.fixture).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    await expect(settings.getByRole("heading", { name: "Try Latham", exact: true })).toBeVisible();
    await settings.screenshot({ path: ".test-artifacts/settings-first-open.png" });
    await settings.locator("h1").click();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html")!.isVisible())).toBe(true);
    expect(await app.evaluate(() => Reflect.get(globalThis, "settingsFirstOpenEvents"))).toEqual(["show"]);
  } finally { await app.close(); }
});

test("first Settings open prepares geometry before entering the native show call", async () => {
  const directory = mkdtempSync(resolve(".test-artifacts/settings-show-order-")), bootstrap = join(directory, "bootstrap.cjs");
  rememberAgreement(directory);
  writeFileSync(bootstrap, `const { Tray } = require("electron"); const original = Tray.prototype.setContextMenu; Tray.prototype.setContextMenu = function(menu) { globalThis.settingsTrayMenu = menu; return original.call(this, menu); }; require(${JSON.stringify(resolve("dist/main.cjs"))});`);
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const app = await _electron.launch({ args: [bootstrap, "--latham-test", "--latham-companion"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  try {
    await expect.poll(() => app.context().pages().some(page => page.url() === "latham://companion/index.html")).toBe(true);
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html")!;
      const events: string[] = []; Reflect.set(globalThis, "settingsShowOrder", events);
      const show = window.showInactive.bind(window); window.showInactive = () => { events.push("show:begin"); show(); events.push("show:end"); };
      const bounds = window.setBounds.bind(window); window.setBounds = (...args) => { events.push("bounds"); bounds(...args); };
      const minimum = window.setMinimumSize.bind(window); window.setMinimumSize = (...args) => { events.push("minimum"); minimum(...args); };
      (Reflect.get(globalThis, "settingsTrayMenu") as Electron.Menu).items.find(item => item.label === "Settings…")!.click();
    });
    await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, "settingsShowOrder").includes("show:end"))).toBe(true);
    const events = await app.evaluate(() => Reflect.get(globalThis, "settingsShowOrder") as string[]);
    expect(events.indexOf("minimum"), events.join(", ")).toBeLessThan(events.indexOf("show:begin"));
    expect(events.indexOf("bounds"), events.join(", ")).toBeLessThan(events.indexOf("show:begin"));
    expect(events.slice(events.indexOf("show:begin") + 1, events.indexOf("show:end"))).toEqual([]);
    const settings = app.context().pages().find(page => page.url() === "latham://app/index.html")!;
    await expect(settings.getByRole("heading", { name: "Try Latham", exact: true })).toBeVisible();
    await settings.locator("h1").click();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html")!.isVisible())).toBe(true);
  } finally { await app.close(); }
});

test("Windows Ctrl helper installs hooks, reports only fixed gesture states and exits when its parent pipe closes", async () => {
  const helper = spawn(resolve("dist/native/Latham.ControlKey.exe"), [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const states: unknown[] = []; let buffer = "", exit: number | null | undefined;
  helper.stdout.setEncoding("utf8"); helper.stdout.on("data", (chunk: string) => {
    buffer += chunk; let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) { const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); states.push(JSON.parse(line)); }
  });
  helper.stderr.resume(); helper.once("exit", code => { exit = code; });
  try {
    await expect.poll(() => states.some(value => (value as { kind: string }).kind === "ready")).toBe(true);
    await expect.poll(() => states.some(value => (value as { kind: string }).kind === "health")).toBe(true);
    expect(states.every(value => Object.keys(value as object).length === 1 && ["ready", "health", "down", "up", "cancel"].includes((value as { kind: string }).kind))).toBe(true);
    helper.stdin.end(); await expect.poll(() => exit).toBe(0);
  } finally { helper.kill(); }
});

test("default shell is a transparent non-focusing companion with isolated APIs and no idle microphone", async () => {
  mkdirSync(".test-artifacts", { recursive: true });
  const directory = mkdtempSync(resolve(".test-artifacts/companion-"));
  rememberAgreement(directory);
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test", "--latham-companion", "--use-fake-device-for-media-stream"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  try {
    await expect.poll(() => app.context().pages().some(page => page.url() === "latham://companion/index.html")).toBe(true);
    const overlay = app.context().pages().find(page => page.url() === "latham://companion/index.html")!;
    await expect(overlay.locator("#companion")).toHaveAttribute("data-phase", "idle");
    await expect.poll(() => overlay.evaluate(async () => (await window.companion.state()).controlHoldReady)).toBe(true);
    const windows = await app.evaluate(({ BrowserWindow, globalShortcut }) => ({ windows: BrowserWindow.getAllWindows().map(win => ({ url: win.webContents.getURL(), visible: win.isVisible(), focusable: win.isFocusable(), top: win.isAlwaysOnTop(), color: win.getBackgroundColor(), bounds: win.getBounds() })), talk: globalShortcut.isRegistered("CommandOrControl+Alt+Space"), stop: globalShortcut.isRegistered("CommandOrControl+Alt+.") }));
    expect(windows.windows.find(win => win.url === "latham://app/index.html")?.visible).toBe(false);
    const companionWindow = windows.windows.find(win => win.url === "latham://companion/index.html")!;
    expect(companionWindow).toMatchObject({ visible: true, focusable: false, top: true });
    // Windows rounds outer bounds at the active DPI; validate the actual content alpha.
    expect(companionWindow.bounds.height).toBeLessThanOrEqual(308);
    expect(companionWindow.bounds.width).toBeGreaterThanOrEqual(568); expect(companionWindow.bounds.width).toBeLessThanOrEqual(570);
    expect(await overlay.locator("#companion").evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }))).toEqual({ width: 264, height: 136 });
    expect(await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://companion/index.html")!.webContents.capturePage()).toBitmap()[3])).toBe(0);
    expect(windows.talk).toBe(true); expect(windows.stop).toBe(true);
    expect(await overlay.evaluate(() => [typeof window.setup, typeof window.latham, typeof Reflect.get(window, "require")])).toEqual(["undefined", "undefined", "undefined"]);
    expect(await overlay.evaluate(() => Object.keys(window.companion).sort())).toEqual(["confirm", "confirmationImage", "failure", "frame", "interact", "state", "subscribe"]);
    expect((await overlay.evaluate(() => window.companion.state())).sessionId).toBeNull();
    expect(await overlay.evaluate(async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach(track => track.stop()); return false; } catch { return true; } })).toBe(true);
    expect(await overlay.evaluate(async () => { try { await fetch("https://example.com"); return false; } catch { return true; } })).toBe(true);
    await overlay.screenshot({ path: ".test-artifacts/companion-idle.png", omitBackground: true });
    const settings = app.context().pages().find(page => page.url() === "latham://app/index.html")!;
    await settings.evaluate(() => window.setup.beginTurn());
    // Hidden settings cannot acquire a microphone, even with an otherwise valid turn.
    expect(await settings.evaluate(async () => { try { await navigator.mediaDevices.getUserMedia({ audio: true }); return false; } catch { return true; } })).toBe(true);
    expect(await overlay.evaluate(async () => { try { await navigator.mediaDevices.getUserMedia({ audio: true }); return false; } catch { return true; } })).toBe(true);
    await settings.evaluate(() => window.latham.stop());
  } finally { await app.close(); }
});

test("cursor follower stays beside the cursor after repeated movement and at the bottom edge", async () => {
  mkdirSync(".test-artifacts", { recursive: true });
  const directory = mkdtempSync(resolve(".test-artifacts/companion-position-"));
  rememberAgreement(directory);
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test", "--latham-companion"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  try {
    await expect.poll(() => app.context().pages().some(page => page.url() === "latham://companion/index.html")).toBe(true);
    const overlay = app.context().pages().find(page => page.url() === "latham://companion/index.html")!;
    await overlay.locator("#glyph").waitFor();
    const movements = await app.evaluate(async ({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://companion/index.html")!;
      const original = screen.getCursorScreenPoint, area = screen.getPrimaryDisplay().workArea;
      const before = win.getBounds(); const sizes: { width: number; height: number }[] = [];
      try {
        for (let index = 0; index < 80; index++) {
          screen.getCursorScreenPoint = () => ({ x: area.x + 300 + index % 100, y: area.y + area.height - 4 });
          await new Promise(resolve => setTimeout(resolve, 20)); const { width, height } = win.getBounds(); sizes.push({ width, height });
        }
        const bounds = win.getContentBounds();
        const glyph = await win.webContents.executeJavaScript("(() => { const r = document.getElementById('glyph').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()");
        const displays = [];
        for (const { bounds: displayBounds, workArea, scaleFactor } of screen.getAllDisplays()) {
          const corners = [];
          for (const x of [workArea.x + 3, workArea.x + workArea.width - 3]) for (const y of [workArea.y + 3, workArea.y + workArea.height - 3]) {
            screen.getCursorScreenPoint = () => ({ x, y }); await new Promise(resolve => setTimeout(resolve, 300));
            const content = win.getContentBounds();
            const rect = await win.webContents.executeJavaScript("(() => { const r = document.getElementById('glyph').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()");
            corners.push({ cursor: { x, y }, glyph: { x: content.x + rect.x + rect.width / 2, y: content.y + rect.y + rect.height / 2 } });
          }
          displays.push({ bounds: displayBounds, workArea, scaleFactor, corners });
        }
        return { before, after: win.getBounds(), sizes, displays, cursor: { x: area.x + 379, y: area.y + area.height - 4 }, glyph: { x: bounds.x + glyph.x + glyph.width / 2, y: bounds.y + glyph.y + glyph.height / 2 } };
      } finally { screen.getCursorScreenPoint = original; }
    });
    for (const dimension of ["width", "height"] as const) expect(Math.max(...movements.sizes.map(size => size[dimension])) - Math.min(...movements.sizes.map(size => size[dimension])), JSON.stringify(movements)).toBeLessThanOrEqual(2);
    expect(Math.abs(movements.glyph.y - movements.cursor.y), JSON.stringify(movements)).toBeLessThan(80);
    expect(Math.abs(movements.glyph.x - movements.cursor.x), JSON.stringify(movements)).toBeLessThan(80);
    for (const { workArea, corners } of movements.displays) {
      for (const { glyph, cursor } of corners) {
        expect(Math.abs(glyph.y - cursor.y)).toBeLessThan(80);
        expect(Math.abs(glyph.x - cursor.x)).toBeLessThan(80);
        expect(glyph.x).toBeGreaterThanOrEqual(workArea.x);
        expect(glyph.x).toBeLessThan(workArea.x + workArea.width);
        expect(glyph.y).toBeGreaterThanOrEqual(workArea.y);
        expect(glyph.y).toBeLessThan(workArea.y + workArea.height);
      }
    }
    writeFileSync(resolve(".test-artifacts/phase10-companion-displays.json"), JSON.stringify(movements.displays, null, 2));
  } finally { await app.close(); }
});

test("companion side switches ease continuously, resist boundary jitter and honor reduced motion", async () => {
  mkdirSync(".test-artifacts", { recursive: true });
  const directory = mkdtempSync(resolve(".test-artifacts/companion-motion-"));
  rememberAgreement(directory);
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test", "--latham-companion"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  try {
    await expect.poll(() => app.context().pages().some(page => page.url() === "latham://companion/index.html")).toBe(true);
    const overlay = app.context().pages().find(page => page.url() === "latham://companion/index.html")!;
    await overlay.locator("#glyph").waitFor();
    for (const reduced of [false, true]) {
      await overlay.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      const result = await app.evaluate(async ({ BrowserWindow, screen }) => {
        const win = BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://companion/index.html")!;
        const originalCursor = screen.getCursorScreenPoint;
        const area = screen.getPrimaryDisplay().workArea;
        const threshold = area.y + area.height - 136 - 16;
        let cursor = { x: area.x + 300, y: threshold - 30 };
        const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
        const snapshot = async () => {
          const glyph = await win.webContents.executeJavaScript("(() => { const g = document.getElementById('glyph'), r = g.getBoundingClientRect(); return { y: r.y + r.height / 2, active: g.getAnimations().some(a => a.id === 'companion-placement' && a.playState === 'running'), above: document.getElementById('companion').classList.contains('above') }; })()");
          return { y: win.getContentBounds().y + glyph.y, active: Boolean(glyph.active), above: Boolean(glyph.above) };
        };
        try {
          screen.getCursorScreenPoint = () => cursor;
          await pause(350); cursor = { ...cursor, y: threshold - 2 }; await pause(80);
          const before = await snapshot(); cursor = { ...cursor, y: threshold + 2 };
          const samples = [];
          for (let index = 0; index < 20; index++) { await pause(16); samples.push(await snapshot()); }
          const jitter = [];
          for (let index = 0; index < 8; index++) { cursor = { ...cursor, y: threshold + (index % 2 ? -2 : 2) }; await pause(24); jitter.push((await snapshot()).above); }
          cursor = { ...cursor, y: threshold - 24 }; const returning = [];
          for (let index = 0; index < 20; index++) { await pause(16); returning.push(await snapshot()); }
          cursor = { ...cursor, y: threshold + 2 }; await pause(65); const atTurn = await snapshot();
          cursor = { ...cursor, y: threshold - 24 }; const reversed = [];
          for (let index = 0; index < 20; index++) { await pause(16); reversed.push(await snapshot()); }
          return { before, samples, jitter, returning, atTurn, reversed };
        } finally { screen.getCursorScreenPoint = originalCursor; }
      });
      expect(result.before.above).toBe(false); expect(result.samples.at(-1)!.above).toBe(true);
      expect(result.jitter.every(Boolean)).toBe(true); expect(result.returning.at(-1)!.above).toBe(false);
      if (reduced) {
        expect(result.samples.every(sample => !sample.active)).toBe(true);
        expect(Math.abs(result.samples[0]!.y - result.samples.at(-1)!.y)).toBeLessThan(3);
      } else {
        expect(result.samples.some(sample => sample.active)).toBe(true);
        const positions = [result.before.y, ...result.samples.map(sample => sample.y)];
        const jumps = positions.slice(1).map((y, index) => Math.abs(y - positions[index]!));
        expect(Math.max(...jumps), JSON.stringify(result)).toBeLessThan(45);
        expect(result.samples.some(sample => sample.y < result.before.y - 5 && sample.y > result.samples.at(-1)!.y + 5)).toBe(true);
        expect(result.returning.some(sample => sample.active)).toBe(true);
        expect(result.atTurn.active).toBe(true); expect(result.reversed.some(sample => sample.active)).toBe(true);
        const reversalPositions = [result.atTurn.y - 26, ...result.reversed.map(sample => sample.y)];
        expect(Math.max(...reversalPositions.slice(1).map((y, index) => Math.abs(y - reversalPositions[index]!))), JSON.stringify(result.reversed)).toBeLessThan(45);
      }
    }
  } finally { await app.close(); }
});

test("companion live words arrive during capture and final provider words alone execute", async () => {
  test.setTimeout(45000); const f = await setup();
  try {
    await f.desk.evaluate(async () => { const s = await window.setup.state(); await window.setup.save({ ...s.settings, mode: "cloud" }); await window.setup.key("FAKE_LIVE_PREVIEW_KEY_1234567890"); });
    const file = await import("node:fs").then(fs => fs.readFileSync(resolve(".test-artifacts/detector-corpus/zira-9.wav"))); let speech: Buffer | undefined;
    for (let at = 12; at + 8 <= file.length;) { const size = file.readUInt32LE(at + 4); if (file.toString("ascii", at, at + 4) === "data") { speech = file.subarray(at + 8, at + 8 + size); break; } at += 8 + size + size % 2; }
    writeFileSync(join(f.directory, "capture.wav"), wav(Buffer.concat([Buffer.alloc(64000), speech!, Buffer.alloc(96000)])));
    await mockLiveSpeech(f.app);
    await f.app.evaluate(() => { Reflect.set(globalThis, "previewProviderRequests", 0); Reflect.set(globalThis, "fetch", () => { Reflect.set(globalThis, "previewProviderRequests", 1); throw Error("Unexpected batch transcription"); }); });
    const overlay = f.app.context().pages().find(page => page.url() === "latham://companion/index.html")!;
    await f.desk.evaluate(() => window.setup.talkFromCompanion());
    await expect.poll(() => overlay.evaluate(async () => (await window.companion.state()).speechPreview.status), { timeout: 10000 }).toBe("partial");
    await expect(overlay.locator("#caption")).toHaveText("open note"); await expect(overlay.locator("#detail")).toHaveText("Live transcript · may change");
    expect(await overlay.locator("#notice").evaluate(element => { const r = element.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })).toBe(true);
    expect(await f.page.evaluate(() => scrollY)).toBe(0); expect((await f.desk.evaluate(() => window.setup.state())).transcript).toBe("");
    await overlay.screenshot({ path: ".test-artifacts/companion-live-words.png", omitBackground: true });
    await expect(overlay.locator("#companion")).toHaveAttribute("data-phase", "processing", { timeout: 12000 });
    expect(await f.app.evaluate(() => Reflect.get(globalThis, "previewProviderRequests"))).toBe(0);
    expect(await f.app.evaluate(() => Reflect.get(globalThis, "liveSpeechConnections"))).toBe(1);
    await f.app.evaluate(() => Reflect.get(globalThis, "finishLiveSpeech")());
    await expect(overlay.locator("#caption")).toHaveText("scroll down"); await expect(overlay.locator("#detail")).toHaveText("Heard · final transcript");
    await expect.poll(() => f.page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await overlay.screenshot({ path: ".test-artifacts/companion-final-words.png", omitBackground: true });
    await f.desk.evaluate(() => window.latham.stop()); await expect.poll(() => overlay.evaluate(async () => (await window.companion.state()).speechPreview.text)).toBe("");
  } finally { await f.close(); }
});

test("companion real capture shows silent dots, input bars and processing orbit, verifies one task then closes capture", async () => {
  test.setTimeout(60000); const f = await setup();
  try {
    await f.desk.evaluate(async () => { const s = await window.setup.state(); await window.setup.save({ ...s.settings, mode: "cloud" }); await window.setup.key("FAKE_COMPANION_PROVIDER_KEY_123456"); });
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true);
    const overlay = f.app.context().pages().find(page => page.url() === "latham://companion/index.html")!;
    // A synthetic device supplies silence, a tone and silence through real getUserMedia.
    const audio = new Int16Array(16000 * 15);
    for (let i = 16000 * 2; i < 16000 * 4; i++) audio[i] = Math.round(8000 * Math.sin(i * Math.PI * 880 / 16000));
    writeFileSync(join(f.directory, "capture.wav"), wav(new Uint8Array(audio.buffer)));
    await overlay.evaluate(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => { const stream = await original(constraints); Reflect.set(window, "companionTestStream", stream); return stream; };
    });
    await mockLiveSpeech(f.app);
    await f.desk.evaluate(() => window.setup.talkFromCompanion());
    await expect(overlay.locator("#companion")).toHaveAttribute("data-phase", "listening");
    await expect.poll(() => overlay.evaluate(() => (Reflect.get(window, "companionTestStream") as MediaStream | undefined)?.getAudioTracks()[0]?.readyState)).toBe("live");
    await expect.poll(() => overlay.locator("#glyph i").first().evaluate(bar => getComputedStyle(bar).height)).toBe("4px");
    await overlay.screenshot({ path: ".test-artifacts/companion-silent.png", omitBackground: true });
    await expect.poll(() => overlay.locator("#glyph i").nth(1).evaluate(bar => parseFloat(getComputedStyle(bar).height)), { timeout: 6000 }).toBeGreaterThan(8);
    await overlay.screenshot({ path: ".test-artifacts/companion-speaking.png", omitBackground: true });
    await expect(overlay.locator("#companion")).toHaveAttribute("data-phase", "processing", { timeout: 10000 });
    expect(await overlay.locator("#glyph").evaluate(glyph => getComputedStyle(glyph).animationName)).toBe("orbit");
    expect(await overlay.locator("#glyph i").nth(1).evaluate(bar => getComputedStyle(bar).height)).toBe("4px");
    await overlay.screenshot({ path: ".test-artifacts/companion-processing.png", omitBackground: true });
    // The settings renderer cannot send audio or acquire a second microphone for this turn.
    await f.desk.evaluate(async () => { const id = (await window.setup.state()).handsfree.id!; window.setup.handsfreeFrame(id, 9999, new ArrayBuffer(100000)); });
    expect((await f.desk.evaluate(() => window.setup.state())).handsfree.phase).toBe("transcribing");
    expect(await f.desk.evaluate(async () => { try { await navigator.mediaDevices.getUserMedia({ audio: true }); return false; } catch { return true; } })).toBe(true);
    await f.app.evaluate(() => (Reflect.get(globalThis, "finishLiveSpeech") as () => void)());
    await expect(overlay.locator("#companion")).toHaveAttribute("data-phase", "idle");
    await expect.poll(() => overlay.evaluate(() => (Reflect.get(window, "companionTestStream") as MediaStream).getAudioTracks()[0]!.readyState)).toBe("ended");
    expect((await f.desk.evaluate(() => window.setup.state())).handsfree.message).toBe("Command verified. Microphone off.");
    expect(await f.page.evaluate(() => scrollY)).toBeGreaterThan(0);
    expect(await f.app.evaluate(() => Number(Reflect.get(globalThis, "liveSpeechConnections")))).toBe(1);
    await expect.poll(() => overlay.locator("#glyph i").nth(1).evaluate(bar => getComputedStyle(bar).height)).toBe("24px");
    await overlay.screenshot({ path: ".test-artifacts/companion-done.png", omitBackground: true });
    // Stop also closes capture during delayed inference; a late reply cannot act.
    const scrollBeforeStop = await f.page.evaluate(() => scrollY);
    await f.desk.evaluate(() => window.setup.talkFromCompanion());
    await expect(overlay.locator("#companion")).toHaveAttribute("data-phase", "processing", { timeout: 12000 });
    await f.desk.evaluate(() => window.latham.stop());
    await expect(overlay.locator("#companion")).toHaveAttribute("data-phase", "idle");
    await expect.poll(() => overlay.evaluate(() => (Reflect.get(window, "companionTestStream") as MediaStream).getAudioTracks()[0]!.readyState)).toBe("ended");
    await f.app.evaluate(() => (Reflect.get(globalThis, "finishLiveSpeech") as () => void)());
    expect((await f.desk.evaluate(() => window.setup.state())).handsfree.phase).toBe("off");
    expect(await f.page.evaluate(() => scrollY)).toBe(scrollBeforeStop);
    // Hiding the primary status surface is another independent Stop path.
    await f.desk.evaluate(() => window.setup.talkFromCompanion());
    await expect.poll(() => overlay.evaluate(() => (Reflect.get(window, "companionTestStream") as MediaStream).getAudioTracks()[0]!.readyState)).toBe("live");
    await f.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://companion/index.html")!.hide());
    await expect.poll(() => overlay.evaluate(() => (Reflect.get(window, "companionTestStream") as MediaStream).getAudioTracks()[0]!.readyState)).toBe("ended");
    expect((await f.desk.evaluate(() => window.setup.state())).handsfree.phase).toBe("off");
  } finally { await f.close(); }
});
