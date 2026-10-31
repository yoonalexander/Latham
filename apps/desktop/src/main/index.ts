import { app, BrowserWindow, WebContentsView, ipcMain, protocol, session, globalShortcut, Tray, Menu, nativeImage, safeStorage, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { join, resolve } from "node:path";
import { parseSettings, parseBounds, type DesktopState } from "@latham/contracts";
import { Controller } from "@latham/core";
import { LocalFixtureExecutor } from "./fixture-executor";
import { Storage } from "./storage";
import { ProviderStore } from "./provider-store";
import { Voice } from "./voice";
import { ChromeBridge, extensionId } from "./native-bridge";
import { installHost, launchChrome } from "./host-install";
import type { SetupState } from "../../../../packages/contracts/src/setup";
import { BrowserController } from "./browser-controller";

protocol.registerSchemesAsPrivileged([{ scheme: "latham", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setName("Latham");
if (process.argv.includes("--latham-test") && process.env.LATHAM_TEST_DATA_DIR) {
  const path = resolve(process.env.LATHAM_TEST_DATA_DIR);
  mkdirSync(path, { recursive: true }); app.setPath("userData", path);
}
let win: BrowserWindow;
let fixture: WebContentsView;
let tray: Tray;
let quitting = false;
let stopShortcutRegistered = false;
const shortcut = "CommandOrControl+Alt+.";
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
app.on("second-instance", () => { win?.show(); win?.focus(); });

async function boot(): Promise<void> {
  const storage = new Storage(app.getPath("userData"));
  const localSession = session.fromPartition("latham-phase0");
  const routes = new Map([
    ["latham://app/index.html", ["renderer/index.html", "text/html"]],
    ["latham://app/renderer.js", ["renderer/renderer.js", "text/javascript"]],
    ["latham://app/renderer.css", ["renderer/renderer.css", "text/css"]],
    ["latham://fixture/index.html", ["fixture/index.html", "text/html"]],
    ["latham://fixture/fixture.js", ["fixture/fixture.js", "text/javascript"]],
    ["latham://denied/index.html", ["fixture/denied.html", "text/html"]]
  ]);
  localSession.protocol.handle("latham", async request => {
    const route = routes.get(request.url);
    if (request.method !== "GET" || !route) return new Response("Unavailable", { status: 403 });
    try {
      return new Response(new Uint8Array(await readFile(join(__dirname, route[0]!))), { headers: { "content-type": route[1]!, "x-content-type-options": "nosniff" } });
    } catch { return new Response("Unavailable", { status: 404 }); }
  });
  let voice: Voice;
  const microphoneAllowed = (contents: Electron.WebContents | null): boolean => !!win && contents === win.webContents && contents.getURL() === "latham://app/index.html" && voice?.status === "recording";
  localSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(microphoneAllowed(contents) && permission === "media" && details.isMainFrame && "mediaTypes" in details && details.mediaTypes.length > 0 && details.mediaTypes.every(type => type === "audio")));
  localSession.setPermissionCheckHandler((contents, permission, origin, details) => microphoneAllowed(contents) && permission === "media" && origin === "latham://app" && details.mediaType === "audio");
  localSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !routes.has(details.url) }));
  win = new BrowserWindow({ width: 1220, height: 940, minWidth: 1000, minHeight: 780, show: false, backgroundColor: "#f3f6f2",
    webPreferences: { preload: join(__dirname, "preload.cjs"), session: localSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false } });
  fixture = new WebContentsView({ webPreferences: { session: localSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false } });
  win.contentView.addChildView(fixture);
  fixture.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  for (const contents of [win.webContents, fixture.webContents]) {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", event => event.preventDefault());
    contents.on("will-attach-webview", event => event.preventDefault());
  }
  const controller = new Controller(new LocalFixtureExecutor(fixture.webContents), {
    delayMs: () => storage.settings.delayMs, diagnostic: event => storage.record(event)
  });
  controller.setPermission(storage.settings.fixtureAllowed);
  let resetting = false;
  const state = (): DesktopState => ({ ...controller.getState(), settings: { ...storage.settings }, stopShortcutRegistered });
  const send = (): void => { if (!win.webContents.isDestroyed()) win.webContents.send("latham:state", state()); };
  controller.subscribe(send);
  const guard = (event: IpcMainEvent | IpcMainInvokeEvent): void => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== "latham://app/index.html") throw new Error("forbidden_sender");
  };
  const providerStore = new ProviderStore(app.getPath("userData"), safeStorage);
  let browser: BrowserController;
  let utteranceBinding: string | null = null;
  const setupState = (): SetupState => ({ canImportEnvironmentKey: !app.isPackaged, canInsertTranscript: !!voice.transcript && !!utteranceBinding && utteranceBinding === browser.bindingId, settings: { ...providerStore.settings }, keyStored: providerStore.keyStored, vaultAvailable: providerStore.available, voice: voice.status, transcript: voice.transcript, error: voice.error, notice: voice.notice, chromeConnected: chrome.connected, chromeActive: chrome.active, chromeFenceConfirmed: chrome.fenceConfirmed, chromeNeedsReview: chrome.needsReview, chromeResult: chrome.result, sites: chrome.siteState, extensionId, page: browser.state });
  const setupSend = (): void => { if (voice && !win.webContents.isDestroyed()) win.webContents.send("setup:state", setupState()); };
  voice = new Voice(providerStore, setupSend);
  const chrome = new ChromeBridge(providerStore, setupSend);
  browser = new BrowserController(chrome, providerStore, setupSend);
  chrome.onInvalidate = () => { browser.stop(); voice.cancel(); };
  await chrome.start();
  const hostDirectory = join(app.getPath("userData"), "native");
  chrome.writeConfig(hostDirectory);
  const stopAll = (): void => { controller.stop(); voice.cancel(); chrome.pause(); };
  ipcMain.handle("setup:state", event => { guard(event); return setupState(); });
  ipcMain.handle("setup:save", (event, input: unknown) => { guard(event); stopAll(); voice.save(input); });
  ipcMain.handle("setup:key", (event, input: unknown) => { guard(event); stopAll(); providerStore.setKey(input); setupSend(); });
  ipcMain.handle("setup:remove-key", event => { guard(event); stopAll(); providerStore.removeKey(); setupSend(); });
  ipcMain.handle("setup:import-key", async event => { guard(event); stopAll(); if (app.isPackaged) throw new Error("development_only"); const values = parseEnv(await readFile(resolve(".env.local"), "utf8")); providerStore.setKey(values.GEMINI_API_KEY); setupSend(); });
  ipcMain.handle("setup:test", event => { guard(event); return voice.test(); });
  ipcMain.handle("setup:begin", event => { guard(event); utteranceBinding = browser.bindingId; return voice.begin(); });
  ipcMain.handle("setup:finish", (event, id: unknown, pcm: unknown) => { guard(event); return voice.finish(id, pcm); });
  ipcMain.handle("setup:cancel", event => { guard(event); voice.cancel(); });
  ipcMain.handle("setup:clear-transcript", event => { guard(event); voice.cancel(); });
  ipcMain.handle("setup:chrome-resume", event => { guard(event); chrome.resume(); });
  ipcMain.handle("setup:reconcile-chrome", event => { guard(event); chrome.reconcile(); });
  ipcMain.handle("setup:chrome-run", (event, command: unknown) => { guard(event); if (typeof command === "string" && /^(stop|pause)( assistant)?[.!]?$/i.test(command.trim())) { stopAll(); return; } return browser.run(command); });
  ipcMain.handle("setup:prepare-dictation", async event => { guard(event); voice.cancel(); utteranceBinding = null; if (!chrome.active) chrome.resume(); await browser.run("focus Search"); if (browser.state.last?.outcome === "verified") await browser.run("start dictation"); setupSend(); });
  ipcMain.handle("setup:insert-transcript", (event, mode: unknown) => { guard(event); if (!["append", "replace"].includes(String(mode)) || !utteranceBinding || utteranceBinding !== browser.bindingId || !voice.transcript || voice.transcript.length > 1000) throw new Error("transcript_binding_changed"); return browser.run(`${mode === "replace" ? "replace dictation with" : "dictate"} ${voice.transcript}`); });
  ipcMain.handle("setup:revoke", (event, origin: unknown) => { guard(event); chrome.revoke(origin); });
  ipcMain.handle("setup:install-host", event => { guard(event); stopAll(); installHost(hostDirectory, join(__dirname, "native/Latham.NativeHost.exe")); chrome.writeConfig(hostDirectory); });
  ipcMain.handle("setup:launch-chrome", event => { guard(event); launchChrome(); });
  ipcMain.handle("latham:state", event => { guard(event); return state(); });
  ipcMain.handle("latham:run", (event, command: unknown) => { guard(event); if (resetting) throw new Error("executor_unavailable"); return controller.run(command); });
  ipcMain.handle("latham:resume", event => { guard(event); if (resetting) throw new Error("executor_unavailable"); controller.resume(); });
  ipcMain.handle("latham:stop", event => { guard(event); stopAll(); });
  ipcMain.handle("latham:settings", (event, input: unknown) => {
    guard(event);
    const settings = parseSettings(input), changed = settings.fixtureAllowed !== storage.settings.fixtureAllowed;
    storage.save(settings);
    if (changed) controller.setPermission(settings.fixtureAllowed);
    send();
  });
  ipcMain.handle("latham:clear", event => { guard(event); storage.clearDiagnostics(); controller.clearDiagnostics(); });
  ipcMain.handle("latham:reset", async event => {
    guard(event); if (resetting) return; resetting = true; controller.stop();
    try { await fixture.webContents.loadURL("latham://fixture/index.html"); controller.resetExecutor(); }
    finally { resetting = false; send(); }
  });
  ipcMain.on("latham:bounds", (event, input: unknown) => {
    try {
      guard(event); const bounds = parseBounds(input), [width = 0, height = 0] = win.getContentSize();
      if (bounds.x + bounds.width <= width && bounds.y + bounds.height <= height) fixture.setBounds(bounds);
    } catch { /* Ignore invalid geometry without broadening the bridge. */ }
  });
  const bitmap = Buffer.alloc(24 * 24 * 4);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const offset = (y * 24 + x) * 4, letter = (x >= 6 && x <= 9 && y >= 5 && y <= 18) || (x >= 6 && x <= 17 && y >= 15 && y <= 18);
    bitmap[offset] = letter ? 184 : 45; bitmap[offset + 1] = letter ? 224 : 61; bitmap[offset + 2] = letter ? 201 : 36; bitmap[offset + 3] = 255;
  }
  tray = new Tray(nativeImage.createFromBitmap(bitmap, { width: 24, height: 24 }));
  tray.setToolTip("Latham — Chrome assistant");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Latham", click: () => win.show() },
    { label: "Start fixture session", click: () => controller.resume() },
    { label: "Pause / Stop", click: stopAll },
    { type: "separator" }, { label: "Quit Latham", click: () => app.quit() }
  ]));
  tray.on("click", () => win.show());
  stopShortcutRegistered = globalShortcut.register(shortcut, stopAll);
  Menu.setApplicationMenu(null);
  win.on("close", event => { if (!quitting) { event.preventDefault(); win.hide(); } });
  win.on("hide", stopAll);
  win.on("closed", () => { if (!fixture.webContents.isDestroyed()) fixture.webContents.close(); });
  fixture.webContents.on("render-process-gone", () => { controller.resetExecutor(); });
  app.on("before-quit", () => { quitting = true; stopAll(); chrome.close(); });
  await fixture.webContents.loadURL("latham://fixture/index.html");
  await win.loadURL("latham://app/index.html");
  win.show();
}
app.on("will-quit", () => { globalShortcut.unregisterAll(); tray?.destroy(); });
if (locked) void app.whenReady().then(boot).catch(() => { console.error("Latham startup failed."); app.exit(1); });
