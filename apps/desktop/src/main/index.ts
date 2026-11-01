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
import { DesktopController } from "./desktop-controller";
import { Handsfree } from "./handsfree";
import { localDetector } from "./local-detector";
import { parsePageIntent } from "../../../../packages/contracts/src/browser";
import { VisualController } from "./visual-controller";
import { imageOcr } from "./image-ocr";
import { WorkflowController } from "./workflow-controller";
import { WorkflowShortcuts } from "./workflow-shortcuts";

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
  let handsfree: Handsfree;
  let visual: VisualController;
  const microphoneAllowed = (contents: Electron.WebContents | null): boolean => !!win && contents === win.webContents && contents.getURL() === "latham://app/index.html" && (voice?.status === "recording" || handsfree?.active);
  localSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(microphoneAllowed(contents) && permission === "media" && details.isMainFrame && "mediaTypes" in details && details.mediaTypes.length > 0 && details.mediaTypes.every(type => type === "audio")));
  localSession.setPermissionCheckHandler((contents, permission, origin, details) => microphoneAllowed(contents) && permission === "media" && origin === "latham://app" && details.mediaType === "audio");
  localSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !routes.has(details.url) }));
  win = new BrowserWindow({ width: 1220, height: 940, minWidth: 1000, minHeight: 780, show: false, backgroundColor: "#f3f6f2",
    webPreferences: { preload: join(__dirname, "preload.cjs"), session: localSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false, backgroundThrottling: false } });
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
  // A completed fence cannot revive an activation invalidated by Stop or reset.
  let activation = 0;
  const state = (): DesktopState => ({ ...controller.getState(), settings: { ...storage.settings }, stopShortcutRegistered });
  const send = (): void => { if (!win.webContents.isDestroyed()) win.webContents.send("latham:state", state()); };
  controller.subscribe(send);
  const guard = (event: IpcMainEvent | IpcMainInvokeEvent): void => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== "latham://app/index.html") throw new Error("forbidden_sender");
  };
  const providerStore = new ProviderStore(app.getPath("userData"), safeStorage);
  const shortcuts = new WorkflowShortcuts(app.getPath("userData"), safeStorage);
  let workflow: WorkflowController;
  let browser: BrowserController;
  let desktop: DesktopController;
  let utteranceBinding: string | null = null;
  const setupState = (): SetupState => ({ canImportEnvironmentKey: !app.isPackaged, canInsertTranscript: !!voice.transcript && !!utteranceBinding && utteranceBinding === browser.bindingId, canInsertDesktopTranscript: !!voice.transcript && !!utteranceBinding && utteranceBinding === desktop.bindingId, desktop: desktop.state, handsfree: handsfree.state, visual: visual.state, workflow: workflow.state, shortcuts: shortcuts.list, shortcutStorageAvailable: shortcuts.available, shortcutStorageLocked: shortcuts.locked, localModel: voice.localModel, settings: { ...providerStore.settings }, keyStored: providerStore.keyStored, vaultAvailable: providerStore.available, voice: voice.status, transcript: voice.transcript, error: voice.error, notice: voice.notice, chromeConnected: chrome.connected, chromeActive: chrome.active, chromeFenceConfirmed: chrome.fenceConfirmed, chromeNeedsReview: chrome.needsReview, chromeResult: chrome.result, sites: chrome.siteState, extensionId, page: browser.state });
  const setupSend = (): void => { if (voice && !win.webContents.isDestroyed()) win.webContents.send("setup:state", setupState()); };
  voice = new Voice(providerStore, setupSend);
  const chrome = new ChromeBridge(providerStore, setupSend);
  browser = new BrowserController(chrome, providerStore, setupSend);
  workflow = new WorkflowController(chrome, setupSend);
  const nativeTesting = !app.isPackaged && process.argv.includes("--latham-test") && process.env.LATHAM_TEST_NATIVE_FIXTURE === "1";
  const nativeApp = nativeTesting ? "fixture" : "notepad";
  desktop = new DesktopController(app.getPath("userData"), join(__dirname, "native/Latham.DesktopAgent.exe"), () => Number(win.getNativeWindowHandle().readBigUInt64LE()), setupSend, nativeTesting);
  desktop.onInvalidate = () => { voice.cancel(); if (handsfree?.state.target === "desktop") handsfree.end("Editor binding changed. Microphone off; prepare the editor again."); };
  chrome.onInvalidate = () => { workflow.cancel("workflow_interrupted"); visual?.stop(); browser.stop(); voice.cancel(); if (handsfree?.state.target === "chrome") handsfree.end("Chrome context changed. Microphone off; inspect Chrome before restarting."); };
  await chrome.start();
  const hostDirectory = join(app.getPath("userData"), "native");
  chrome.writeConfig(hostDirectory);
  const stopExecutors = (): void => { activation++; workflow.cancel(); visual?.stop(); controller.stop(); voice.cancel(); chrome.pause(); desktop.pause(); };
  handsfree = new Handsfree(localDetector(join(__dirname, "native/Latham.SpeechDetector.exe")), {
    available: target => target === "chrome" ? chrome.connected && chrome.active && !chrome.needsReview : desktop.state.active && desktop.state.bound && !desktop.state.needsReview,
    transcribe: async pcm => { utteranceBinding = desktop.bindingId ?? browser.bindingId; const id = voice.begin(); await voice.finish(id, pcm); if (voice.error || !voice.transcript) throw new Error("handsfree_transcription_failed"); return voice.transcript; },
    run: async (text, target) => {
      if (target === "desktop") { await desktop.run(text, nativeApp); return desktop.state.last?.outcome === "verified"; }
      await browser.run(text); return parsePageIntent(text) ? browser.state.last?.outcome === "verified" : chrome.result === "Verified Chrome result";
    },
    cancel: stopExecutors, changed: setupSend
  });
  visual = new VisualController(chrome, (image, signal) => imageOcr(join(__dirname, "native/Latham.ImageOcr.exe"), image, signal), () => providerStore.key(), setupSend);
  const stopAll = (): void => { if (handsfree.active) handsfree.end(); else stopExecutors(); };
  const manual = (): void => { if (workflow.active || handsfree.active || visual?.state.busy) throw new Error("end_active_mode_first"); };
  const waitFence = async (confirmed: () => boolean): Promise<void> => {
    const deadline = Date.now() + 3500;
    while (!confirmed() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    if (!confirmed()) throw new Error("executor_fence_unconfirmed");
  };
  const useChrome = async (): Promise<void> => {
    manual();
    const turn = ++activation, epoch = chrome.sessionEpoch;
    visual.stop(false);
    controller.stop(); desktop.pause(); await waitFence(() => desktop.state.fenceConfirmed);
    if (turn !== activation || epoch !== chrome.sessionEpoch) throw new Error("cancelled");
    if (desktop.state.needsReview || controller.needsReview) throw new Error("executor_reconciliation_required");
  };
  const useDesktop = async (): Promise<void> => {
    manual();
    const turn = ++activation;
    visual.stop();
    controller.stop(); chrome.pause(); const epoch = chrome.sessionEpoch; await waitFence(() => !chrome.connected || chrome.fenceConfirmed);
    if (turn !== activation || epoch !== chrome.sessionEpoch) throw new Error("cancelled");
    if (chrome.needsReview || controller.needsReview) throw new Error("executor_reconciliation_required");
  };
  ipcMain.handle("setup:state", event => { guard(event); return setupState(); });
  ipcMain.handle("setup:workflow-prepare", async (event, goal: unknown) => {
    guard(event);
    const idle = (): void => { if (handsfree.active || visual.state.busy || voice.status !== "idle" || browser.state.busy || desktop.state.busy) throw new Error("end_active_mode_first"); };
    idle(); if (workflow.state.phase !== "prepared") await useChrome(); idle();
    browser.stop(); voice.cancel(); return workflow.prepare(goal);
  });
  ipcMain.handle("setup:workflow-run", (event, id: unknown) => { guard(event); return workflow.run(id); });
  ipcMain.handle("setup:workflow-cancel", event => { guard(event); stopAll(); });
  ipcMain.handle("setup:workflow-shortcut-save", (event, name: unknown, id: unknown) => { guard(event); manual(); const goal = workflow.completedGoal(); shortcuts.save(name, goal, id); stopAll(); setupSend(); });
  ipcMain.handle("setup:workflow-shortcut-delete", (event, id: unknown) => { guard(event); stopAll(); shortcuts.remove(id); setupSend(); });
  ipcMain.handle("setup:workflow-shortcut-clear", event => { guard(event); stopAll(); shortcuts.clear(); setupSend(); });
  ipcMain.handle("setup:save", (event, input: unknown) => { guard(event); stopAll(); voice.save(input); });
  ipcMain.handle("setup:key", (event, input: unknown) => { guard(event); stopAll(); providerStore.setKey(input); setupSend(); });
  ipcMain.handle("setup:remove-key", event => { guard(event); stopAll(); providerStore.removeKey(); setupSend(); });
  ipcMain.handle("setup:import-key", async event => { guard(event); stopAll(); if (app.isPackaged) throw new Error("development_only"); const values = parseEnv(await readFile(resolve(".env.local"), "utf8")); providerStore.setKey(values.GEMINI_API_KEY); setupSend(); });
  ipcMain.handle("setup:test", event => { guard(event); manual(); return voice.test(); });
  ipcMain.handle("setup:begin", event => { guard(event); manual(); utteranceBinding = desktop.bindingId ?? browser.bindingId; return voice.begin(); });
  ipcMain.handle("setup:check-local-model", event => { guard(event); manual(); voice.checkLocalModel(); });
  ipcMain.handle("setup:visual-permission", (event, value: unknown) => { guard(event); if (value === false) stopAll(); else manual(); visual.permission(value); });
  ipcMain.handle("setup:visual-find", (event, query: unknown) => { guard(event); manual(); browser.stop(); voice.cancel(); return visual.find(query); });
  ipcMain.handle("setup:visual-highlight", (event, id: unknown) => { guard(event); manual(); return visual.highlight(id); });
  ipcMain.handle("setup:visual-open", event => { guard(event); manual(); return visual.open(); });
  ipcMain.handle("setup:handsfree-start", (event, config: unknown) => { guard(event); if (workflow.active || visual.state.busy || voice.status !== "idle" || browser.state.busy || desktop.state.busy || controller.needsReview) throw new Error("voice_busy"); voice.prepareSession(); visual.stop(); controller.stop(); return handsfree.start(config); });
  ipcMain.on("setup:handsfree-frame", (event, id: unknown, sequence: unknown, pcm: unknown) => { try { guard(event); } catch { return; } handsfree.frame(id, sequence, pcm); });
  ipcMain.handle("setup:handsfree-failure", (event, id: unknown) => { guard(event); handsfree.fail(id); });
  ipcMain.handle("setup:finish", (event, id: unknown, pcm: unknown) => { guard(event); manual(); return voice.finish(id, pcm); });
  ipcMain.handle("setup:cancel", event => { guard(event); if (handsfree.active) stopAll(); else voice.cancel(); });
  ipcMain.handle("setup:clear-transcript", event => { guard(event); if (handsfree.active) stopAll(); else voice.cancel(); });
  ipcMain.handle("setup:chrome-resume", async event => { guard(event); await useChrome(); chrome.resume(); });
  ipcMain.handle("setup:reconcile-chrome", event => { guard(event); chrome.reconcile(); });
  ipcMain.handle("setup:chrome-run", async (event, command: unknown) => { guard(event); if (typeof command === "string" && /^(stop|pause)( assistant)?[.!]?$/i.test(command.trim())) { stopAll(); return; } await useChrome(); return browser.run(command); });
  ipcMain.handle("setup:prepare-dictation", async event => { guard(event); await useChrome(); voice.cancel(); utteranceBinding = null; if (!chrome.active) chrome.resume(); await browser.run("focus Search"); if (browser.state.last?.outcome === "verified") await browser.run("start dictation"); setupSend(); });
  ipcMain.handle("setup:insert-transcript", (event, mode: unknown) => { guard(event); manual(); if (!["append", "replace"].includes(String(mode)) || !utteranceBinding || utteranceBinding !== browser.bindingId || !voice.transcript || voice.transcript.length > 1000) throw new Error("transcript_binding_changed"); return browser.run(`${mode === "replace" ? "replace dictation with" : "dictate"} ${voice.transcript}`); });
  ipcMain.handle("setup:revoke", (event, origin: unknown) => { guard(event); chrome.revoke(origin); });
  ipcMain.handle("setup:install-host", event => { guard(event); stopAll(); installHost(hostDirectory, join(__dirname, "native/Latham.NativeHost.exe")); chrome.writeConfig(hostDirectory); });
  ipcMain.handle("setup:launch-chrome", event => { guard(event); launchChrome(); });
  ipcMain.handle("setup:desktop-permission", (event, approved: unknown, denied: unknown) => { guard(event); stopAll(); desktop.permission(approved, denied); });
  ipcMain.handle("setup:desktop-scan", async event => { guard(event); await useDesktop(); return desktop.scan(nativeApp); });
  ipcMain.handle("setup:desktop-open", async event => { guard(event); await useDesktop(); return desktop.open(); });
  ipcMain.handle("setup:desktop-prepare", async (event, id: unknown) => { guard(event); await useDesktop(); return desktop.prepare(id, nativeApp); });
  ipcMain.handle("setup:desktop-run", (event, input: unknown) => { guard(event); if (typeof input === "string" && /^(stop|pause)( assistant)?[.!]?$/i.test(input.trim())) { stopAll(); return; } manual(); return desktop.run(input, nativeApp); });
  ipcMain.handle("setup:desktop-insert", (event, mode: unknown) => { guard(event); manual(); if (!["append", "replace"].includes(String(mode)) || !utteranceBinding || utteranceBinding !== desktop.bindingId || !voice.transcript || voice.transcript.length > 1000) throw new Error("transcript_binding_changed"); return desktop.run(`${mode === "replace" ? "replace dictation with" : "dictate"} ${voice.transcript}`, nativeApp); });
  ipcMain.handle("setup:desktop-reconcile", event => { guard(event); desktop.reconcile(); });
  ipcMain.handle("latham:state", event => { guard(event); return state(); });
  ipcMain.handle("latham:run", (event, command: unknown) => { guard(event); if (resetting || desktop.state.active || desktop.state.busy || chrome.active) throw new Error("executor_unavailable"); return controller.run(command); });
  ipcMain.handle("latham:resume", async event => { guard(event); manual(); if (resetting) throw new Error("executor_unavailable"); if (controller.needsReview) { controller.resume(); return; } const turn = ++activation; desktop.pause(); chrome.pause(); const epoch = chrome.sessionEpoch; await waitFence(() => desktop.state.fenceConfirmed && (!chrome.connected || chrome.fenceConfirmed)); if (turn !== activation || epoch !== chrome.sessionEpoch || resetting) throw new Error("cancelled"); if (desktop.state.needsReview || chrome.needsReview) throw new Error("executor_reconciliation_required"); controller.resume(); });
  ipcMain.handle("latham:stop", event => { guard(event); stopAll(); });
  ipcMain.handle("latham:settings", (event, input: unknown) => {
    guard(event);
    manual(); const settings = parseSettings(input), changed = settings.fixtureAllowed !== storage.settings.fixtureAllowed;
    storage.save(settings);
    if (changed) controller.setPermission(settings.fixtureAllowed);
    send();
  });
  ipcMain.handle("latham:clear", event => { guard(event); storage.clearDiagnostics(); controller.clearDiagnostics(); });
  ipcMain.handle("latham:reset", async event => {
    guard(event); manual(); if (resetting) return; activation++; resetting = true; controller.stop();
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
  tray.setToolTip("Latham — Windows assistant");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Latham", click: () => win.show() },
    { label: "Start fixture session", click: () => { if (!workflow.active) controller.resume(); } },
    { label: "Pause / Stop", click: stopAll },
    { type: "separator" }, { label: "Quit Latham", click: () => app.quit() }
  ]));
  tray.on("click", () => win.show());
  stopShortcutRegistered = globalShortcut.register(shortcut, stopAll);
  Menu.setApplicationMenu(null);
  win.on("close", event => { if (!quitting) { event.preventDefault(); win.hide(); } });
  win.on("hide", stopAll);
  win.webContents.on("render-process-gone", stopAll);
  win.on("closed", () => { if (!fixture.webContents.isDestroyed()) fixture.webContents.close(); });
  fixture.webContents.on("render-process-gone", () => { controller.resetExecutor(); });
  app.on("before-quit", () => { quitting = true; stopAll(); chrome.close(); desktop.close(); });
  await fixture.webContents.loadURL("latham://fixture/index.html");
  await win.loadURL("latham://app/index.html");
  win.show();
}
app.on("will-quit", () => { globalShortcut.unregisterAll(); tray?.destroy(); });
if (locked) void app.whenReady().then(boot).catch(() => { console.error("Latham startup failed."); app.exit(1); });
