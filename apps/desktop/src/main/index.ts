import { app, BrowserWindow, WebContentsView, ipcMain, protocol, session, globalShortcut, Tray, Menu, nativeImage, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseSettings, parseBounds, type DesktopState } from "@latham/contracts";
import { Controller } from "@latham/core";
import { LocalFixtureExecutor } from "./fixture-executor";
import { Storage } from "./storage";

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
  localSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  localSession.setPermissionCheckHandler(() => false);
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
  ipcMain.handle("latham:state", event => { guard(event); return state(); });
  ipcMain.handle("latham:run", (event, command: unknown) => { guard(event); if (resetting) throw new Error("executor_unavailable"); return controller.run(command); });
  ipcMain.handle("latham:resume", event => { guard(event); if (resetting) throw new Error("executor_unavailable"); controller.resume(); });
  ipcMain.handle("latham:stop", event => { guard(event); controller.stop(); });
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
  tray.setToolTip("Latham — local fixture foundation");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Latham", click: () => win.show() },
    { label: "Start fixture session", click: () => controller.resume() },
    { label: "Pause / Stop", click: () => controller.stop() },
    { type: "separator" }, { label: "Quit Latham", click: () => app.quit() }
  ]));
  tray.on("click", () => win.show());
  stopShortcutRegistered = globalShortcut.register(shortcut, () => controller.stop());
  Menu.setApplicationMenu(null);
  win.on("close", event => { if (!quitting) { event.preventDefault(); win.hide(); } });
  win.on("closed", () => { if (!fixture.webContents.isDestroyed()) fixture.webContents.close(); });
  fixture.webContents.on("render-process-gone", () => { controller.resetExecutor(); });
  app.on("before-quit", () => { quitting = true; controller.stop(); });
  await fixture.webContents.loadURL("latham://fixture/index.html");
  await win.loadURL("latham://app/index.html");
  win.show();
}
app.on("will-quit", () => { globalShortcut.unregisterAll(); tray?.destroy(); });
if (locked) void app.whenReady().then(boot).catch(() => { console.error("Latham startup failed."); app.exit(1); });
