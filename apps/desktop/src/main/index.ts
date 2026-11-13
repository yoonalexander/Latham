import { app, BrowserWindow, WebContentsView, ipcMain, protocol, session, screen, globalShortcut, Tray, Menu, nativeImage, safeStorage, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
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
import { installHost, launchBrowser, browserPath } from "./host-install";
import { browsers, parseBrowser, type BrowserId } from "../../../../packages/contracts/src/compatibility";
import { EvaluationStore } from "./evaluation-store";
import { fitWindow } from "./window-bounds";
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
import { ManagedClient } from "./managed-client";
import { Companion } from "./companion";
import type { CompanionState } from "../../../../packages/contracts/src/companion";
import type { HandsfreeTarget } from "../../../../packages/contracts/src/handsfree";
import { ControlHold, watchControl } from "./control-hold";
import { Computer, WindowsComputer, computerDecision } from "./computer";
import { SpeechPreview } from "./speech-preview";
import { GeminiLiveSpeech } from "../../../../packages/speech/src/live-transcribe";

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
let showLatham = (): void => {};
app.on("second-instance", () => showLatham());

async function boot(): Promise<void> {
  if (process.platform !== "win32") throw new Error("Windows adapters required; macOS/Linux are not supported");
  const storage = new Storage(app.getPath("userData"));
  const localSession = session.fromPartition("latham-phase0");
  const routes = new Map([
    ["latham://companion/index.html", ["renderer/companion.html", "text/html"]],
    ["latham://companion/companion.js", ["renderer/companion.js", "text/javascript"]],
    ["latham://companion/companion.css", ["renderer/companion.css", "text/css"]],
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
  let speechPreview: SpeechPreview;
  let handsfree: Handsfree;
  let visual: VisualController;
  let companion: Companion | undefined;
  let computer: Computer;
  let controlHold: ControlHold | undefined;
  let controlHoldReady = false;
  let microphoneOwner: "settings" | "companion" | null = null;
  let companionTarget: HandsfreeTarget = "computer";
  let companionNotice = "Ready when you are.";
  let companionNoticeId = 0;
  let talkShortcutRegistered = false;
  const microphoneAllowed = (contents: Electron.WebContents | null): boolean => !!contents && (microphoneOwner === "companion" ? handsfree?.capturingAudio : voice?.status === "recording" || handsfree?.capturingAudio) && (
    microphoneOwner === "settings" && contents === win?.webContents && win.isVisible() && contents.getURL() === "latham://app/index.html" ||
    microphoneOwner === "companion" && contents === companion?.window.webContents && companion.window.isVisible() && contents.getURL() === "latham://companion/index.html"
  );
  localSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(microphoneAllowed(contents) && permission === "media" && details.isMainFrame && "mediaTypes" in details && details.mediaTypes.length > 0 && details.mediaTypes.every(type => type === "audio")));
  localSession.setPermissionCheckHandler((contents, permission, origin, details) => microphoneAllowed(contents) && permission === "media" && origin === (microphoneOwner === "companion" ? "latham://companion" : "latham://app") && details.mediaType === "audio");
  localSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !routes.has(details.url) }));
  const workAreas = () => [screen.getPrimaryDisplay(), ...screen.getAllDisplays().filter(d => d.id !== screen.getPrimaryDisplay().id)].map(d => d.workArea);
  const initialArea = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({ ...fitWindow({ x: initialArea.x + 30, y: initialArea.y + 30, width: 980, height: 800 }, workAreas()), minWidth: Math.min(640, initialArea.width), minHeight: Math.min(480, initialArea.height), title: "Latham settings", show: false, backgroundColor: "#f3f6f2",
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
  const send = (): void => { if (!quitting && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send("latham:state", state()); };
  controller.subscribe(send);
  const guard = (event: IpcMainEvent | IpcMainInvokeEvent): void => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== "latham://app/index.html") throw new Error("forbidden_sender");
  };
  const providerStore = new ProviderStore(app.getPath("userData"), safeStorage);
  const shortcuts = new WorkflowShortcuts(app.getPath("userData"), safeStorage);
  const evaluation = new EvaluationStore(app.getPath("userData"));
  const managed = new ManagedClient(app.getPath("userData"), safeStorage, !app.isPackaged, () => setupSend());
  let workflow: WorkflowController;
  let browser: BrowserController;
  let desktop: DesktopController;
  let utteranceBinding: string | null = null;
  const setupState = (): SetupState => ({ speechPreview: { ...speechPreview.state }, computer: computer.state, providerSettingsLocked: providerStore.locked, browser: providerStore.browser, browserChoices: (Object.keys(browsers) as BrowserId[]).map(id => ({ id, label: browsers[id], installed: !!browserPath(id) })), evaluation: { trials: evaluation.trials, locked: evaluation.locked }, managed: { ...managed.state }, canImportEnvironmentKey: !app.isPackaged, canInsertTranscript: !!voice.transcript && !!utteranceBinding && utteranceBinding === browser.bindingId, canInsertDesktopTranscript: !!voice.transcript && !!utteranceBinding && utteranceBinding === desktop.bindingId, desktop: desktop.state, handsfree: handsfree.state, visual: visual.state, workflow: workflow.state, shortcuts: shortcuts.list, shortcutStorageAvailable: shortcuts.available, shortcutStorageLocked: shortcuts.locked, localModel: voice.localModel, settings: { ...providerStore.settings }, keyStored: providerStore.keyStored, vaultAvailable: providerStore.available, voice: voice.status, transcript: voice.transcript, error: voice.error, notice: voice.notice, chromeConnected: chrome.connected, chromeActive: chrome.active, chromeFenceConfirmed: chrome.fenceConfirmed, chromeNeedsReview: chrome.needsReview, chromeResult: chrome.result, sites: chrome.siteState, extensionId, page: browser.state });
  const setupSend = (): void => {
    if (quitting) return;
    if (voice && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send("setup:state", setupState());
    companion?.send();
  };
  speechPreview = new SpeechPreview(localDetector(join(__dirname, "native/Latham.SpeechDetector.exe"), () => providerStore.settings.speechLanguage), setupSend,
    partial => providerStore.settings.mode === "cloud" ? new GeminiLiveSpeech(providerStore.key(), providerStore.settings, partial) : undefined);
  voice = new Voice(providerStore, setupSend, managed, speechPreview);
  const chrome = new ChromeBridge(providerStore, setupSend);
  browser = new BrowserController(chrome, providerStore, setupSend, managed);
  workflow = new WorkflowController(chrome, setupSend);
  const nativeTesting = !app.isPackaged && process.argv.includes("--latham-test") && process.env.LATHAM_TEST_NATIVE_FIXTURE === "1";
  const nativeApp = nativeTesting ? "fixture" : "notepad";
  desktop = new DesktopController(app.getPath("userData"), join(__dirname, "native/Latham.DesktopAgent.exe"), () => Number(win.getNativeWindowHandle().readBigUInt64LE()), setupSend, nativeTesting);
  computer = new Computer(app.getPath("userData"), new WindowsComputer(join(__dirname, "native/Latham.ComputerAgent.exe")), computerDecision(() => providerStore.key()), setupSend, () => desktop.state.denied);
  chrome.onRevoke = origins => origins.forEach(origin => computer.blockOrigin(origin));
  desktop.onInvalidate = () => { if (handsfree?.state.target !== "computer") voice.cancel(); if (handsfree?.state.target === "desktop") handsfree.end("Editor binding changed. Microphone off; prepare the editor again."); };
  chrome.onInvalidate = () => { workflow.cancel("workflow_interrupted"); visual?.stop(); browser.stop(); if (handsfree?.state.target !== "computer") voice.cancel(); if (handsfree?.state.target === "chrome") handsfree.end("Chrome context changed. Microphone off; inspect Chrome before restarting."); };
  await chrome.start();
  const hostDirectory = join(app.getPath("userData"), "native");
  const selectedHostDirectory = () => join(hostDirectory, providerStore.browser);
  chrome.writeConfig(selectedHostDirectory());
  const stopExecutors = (preserveSpeech = false): void => { const finalSpeech = preserveSpeech && speechPreview.state.status === "final" ? speechPreview.state.text : ""; activation++; controlHold?.event("cancel"); microphoneOwner = null; void computer.stop(true); managed.stop(); workflow.cancel(); visual?.stop(); controller.stop(); voice.cancel(); chrome.pause(); desktop.pause(); if (finalSpeech) speechPreview.final(finalSpeech); };
  handsfree = new Handsfree(localDetector(join(__dirname, "native/Latham.SpeechDetector.exe")), {
    available: target => target === "computer" ? computer.ready || (computer.active && computer.state.allowed && computer.state.fenceConfirmed) : target === "chrome" ? chrome.connected && chrome.active && !chrome.needsReview : desktop.state.active && desktop.state.bound && !desktop.state.needsReview,
    transcribe: async pcm => { utteranceBinding = desktop.bindingId ?? browser.bindingId; const id = voice.begin(false); await voice.finish(id, pcm); if (voice.error || !voice.transcript) throw new Error("handsfree_transcription_failed"); return voice.transcript; },
    run: async (text, target) => {
      if (target === "computer") return computer.run(text);
      if (target === "desktop") { await desktop.run(text, nativeApp); return desktop.state.last?.outcome === "verified"; }
      await browser.run(text); return parsePageIntent(text) ? browser.state.last?.outcome === "verified" : chrome.result === "Verified browser result";
    },
    cancel: stopExecutors, changed: setupSend, preview: speechPreview,
    approvalId: () => computer.state.pending?.id ?? null,
    approve: id => { try { computer.approve(id, true); } catch {} }
  });
  visual = new VisualController(chrome, (image, signal) => imageOcr(join(__dirname, "native/Latham.ImageOcr.exe"), image, signal), () => providerStore.key(), setupSend);
  const stopAll = (): void => { if (handsfree.active) handsfree.end(); else stopExecutors(); };
  const recoverWindow = (): void => {
    if (win.isDestroyed() || quitting) return;
    const areas = workAreas(), bounds = fitWindow(win.getBounds(), areas);
    win.setMinimumSize(Math.min(640, bounds.width), Math.min(480, bounds.height)); win.setBounds(bounds);
  };
  const displaysChanged = (): void => { stopAll(); fixture.setBounds({ x: 0, y: 0, width: 0, height: 0 }); recoverWindow(); };
  screen.on("display-added", displaysChanged); screen.on("display-removed", displaysChanged); screen.on("display-metrics-changed", displaysChanged);
  const manual = (): void => { if (computer.active || workflow.active || handsfree.active || visual?.state.busy) throw new Error("end_active_mode_first"); };
  const waitFence = async (confirmed: () => boolean): Promise<void> => {
    const deadline = Date.now() + 3500;
    while (!confirmed() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    if (!confirmed()) throw new Error("executor_fence_unconfirmed");
  };
  const useChrome = async (): Promise<void> => {
    manual();
    const turn = ++activation, epoch = chrome.sessionEpoch;
    visual.stop(false);
    controller.stop(); desktop.pause(); await waitFence(() => desktop.state.fenceConfirmed && computer.state.fenceConfirmed);
    if (turn !== activation || epoch !== chrome.sessionEpoch) throw new Error("cancelled");
    if (desktop.state.needsReview || controller.needsReview || computer.state.needsReview) throw new Error("executor_reconciliation_required");
  };
  const useDesktop = async (): Promise<void> => {
    manual();
    const turn = ++activation;
    visual.stop();
    controller.stop(); chrome.pause(); const epoch = chrome.sessionEpoch; await waitFence(() => (!chrome.connected || chrome.fenceConfirmed) && computer.state.fenceConfirmed);
    if (turn !== activation || epoch !== chrome.sessionEpoch) throw new Error("cancelled");
    if (chrome.needsReview || controller.needsReview || computer.state.needsReview) throw new Error("executor_reconciliation_required");
  };
  const useComputer = async (): Promise<void> => {
    manual(); if (!computer.ready) throw new Error("computer_setup_required");
    const turn = ++activation; visual.stop(); controller.stop(); desktop.pause(); chrome.pause();
    await waitFence(() => desktop.state.fenceConfirmed && (!chrome.connected || chrome.fenceConfirmed) && computer.state.fenceConfirmed);
    if (turn !== activation) throw new Error("cancelled");
    if (desktop.state.needsReview || chrome.needsReview || controller.needsReview) throw new Error("executor_reconciliation_required");
  };
  ipcMain.handle("setup:state", event => { guard(event); return setupState(); });
  ipcMain.handle("setup:computer-configure", async (event, input: unknown) => { guard(event); stopAll(); await waitFence(() => computer.state.fenceConfirmed && desktop.state.fenceConfirmed && (!chrome.connected || chrome.fenceConfirmed)); computer.configure(input); if (computer.state.allowed) companionTarget = "computer"; setupSend(); });
  ipcMain.handle("setup:computer-disable", async event => { guard(event); stopAll(); await waitFence(() => computer.state.fenceConfirmed); computer.configure({ allowed: false, images: false, browserAllowed: false, route: computer.state.route, model: computer.state.model, deniedApps: computer.state.deniedApps }); setupSend(); });
  ipcMain.handle("setup:computer-review", event => { guard(event); companionNoticeId++; companion?.show(); companion?.send(); });
  ipcMain.handle("setup:computer-reconcile", event => { guard(event); computer.reconcile(); companionNotice = "Previous result checked. Hold Ctrl for a new command."; handsfree.state.message = companionNotice; companionNoticeId++; setupSend(); });
  ipcMain.handle("setup:computer-unblock", (event, origin: unknown) => { guard(event); computer.unblockOrigin(origin); });
  ipcMain.handle("setup:computer-run", async (event, goal: unknown) => { guard(event); await useComputer(); voice.cancel(); const task = computer.run(goal); win.hide(); return task; });
  ipcMain.handle("setup:companion-target", (event, target: unknown) => { guard(event); if (!["computer", "chrome", "desktop"].includes(String(target))) throw new Error("invalid_target"); stopAll(); companionTarget = target as HandsfreeTarget; setupSend(); });
  ipcMain.handle("setup:choose-browser", async (event, input: unknown) => {
    guard(event); const choice = parseBrowser(input); stopAll(); const epoch = chrome.sessionEpoch;
    await waitFence(() => !chrome.connected || chrome.fenceConfirmed);
    if (epoch !== chrome.sessionEpoch || chrome.needsReview || desktop.state.needsReview || controller.needsReview) throw new Error("inspect_previous_result_first");
    chrome.disconnect(); const previous = providerStore.browser;
    try { providerStore.browser = choice; providerStore.save(); } catch (error) { providerStore.browser = previous; throw error; }
    chrome.writeConfig(selectedHostDirectory()); setupSend();
  });
  ipcMain.handle("setup:evaluation-add", (event, input: unknown) => { guard(event); evaluation.add(input); setupSend(); });
  ipcMain.handle("setup:evaluation-clear", event => { guard(event); evaluation.clear(); setupSend(); });
  ipcMain.handle("setup:managed-sign-in", async (event, input: unknown) => { guard(event); stopAll(); await managed.signIn(input); setupSend(); });
  ipcMain.handle("setup:managed-account", async (event, operation: unknown) => { guard(event); stopAll(); await managed.account(operation); setupSend(); });
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
  ipcMain.handle("setup:begin", event => { guard(event); manual(); microphoneOwner = "settings"; utteranceBinding = desktop.bindingId ?? browser.bindingId; return voice.begin(); });
  ipcMain.on("setup:voice-frame", (event, id: unknown, sequence: unknown, pcm: unknown) => { try { guard(event); } catch { return; } if (microphoneOwner === "settings") voice.frame(id, sequence, pcm); });
  ipcMain.handle("setup:check-local-model", event => { guard(event); manual(); voice.checkLocalModel(); });
  ipcMain.handle("setup:visual-permission", (event, value: unknown) => { guard(event); if (value === false) stopAll(); else manual(); visual.permission(value); });
  ipcMain.handle("setup:visual-find", (event, query: unknown) => { guard(event); manual(); browser.stop(); voice.cancel(); return visual.find(query); });
  ipcMain.handle("setup:visual-highlight", (event, id: unknown) => { guard(event); manual(); return visual.highlight(id); });
  ipcMain.handle("setup:visual-open", event => { guard(event); manual(); return visual.open(); });
  ipcMain.handle("setup:handsfree-start", async (event, config: unknown) => { guard(event); if (workflow.active || visual.state.busy || voice.status !== "idle" || browser.state.busy || desktop.state.busy || controller.needsReview) throw new Error("voice_busy"); if (config && typeof config === "object" && "target" in config && config.target === "computer") await useComputer(); voice.prepareSession(); visual.stop(); controller.stop(); microphoneOwner = "settings"; return handsfree.start(config); });
  ipcMain.on("setup:handsfree-frame", (event, id: unknown, sequence: unknown, pcm: unknown) => { try { guard(event); } catch { return; } if (microphoneOwner === "settings") handsfree.frame(id, sequence, pcm); });
  ipcMain.handle("setup:handsfree-failure", (event, id: unknown) => { guard(event); if (microphoneOwner === "settings") handsfree.fail(id); });
  ipcMain.handle("setup:finish", (event, id: unknown, pcm: unknown) => { guard(event); manual(); return voice.finish(id, pcm); });
  ipcMain.handle("setup:cancel", event => { guard(event); if (handsfree.active) stopAll(); else voice.cancel(); });
  ipcMain.handle("setup:clear-transcript", event => { guard(event); if (handsfree.active) stopAll(); else voice.cancel(); });
  ipcMain.handle("setup:chrome-resume", async event => { guard(event); await useChrome(); chrome.resume(); });
  ipcMain.handle("setup:reconcile-chrome", event => { guard(event); chrome.reconcile(); });
  ipcMain.handle("setup:chrome-run", async (event, command: unknown) => { guard(event); if (typeof command === "string" && /^(stop|pause)( assistant)?[.!]?$/i.test(command.trim())) { stopAll(); return; } await useChrome(); return browser.run(command); });
  ipcMain.handle("setup:prepare-dictation", async event => { guard(event); await useChrome(); voice.cancel(); utteranceBinding = null; if (!chrome.active) chrome.resume(); await browser.run("focus Search"); if (browser.state.last?.outcome === "verified") await browser.run("start dictation"); setupSend(); });
  ipcMain.handle("setup:insert-transcript", (event, mode: unknown) => { guard(event); manual(); if (!["append", "replace"].includes(String(mode)) || !utteranceBinding || utteranceBinding !== browser.bindingId || !voice.transcript || voice.transcript.length > 1000) throw new Error("transcript_binding_changed"); return browser.run(`${mode === "replace" ? "replace dictation with" : "dictate"} ${voice.transcript}`); });
  ipcMain.handle("setup:revoke", (event, origin: unknown) => { guard(event); chrome.revoke(origin); });
  ipcMain.handle("setup:install-host", event => { guard(event); stopAll(); installHost(selectedHostDirectory(), join(__dirname, "native/Latham.NativeHost.exe"), providerStore.browser); chrome.writeConfig(selectedHostDirectory()); });
  ipcMain.handle("setup:launch-browser", event => { guard(event); launchBrowser(providerStore.browser); });
  ipcMain.handle("setup:desktop-permission", (event, approved: unknown, denied: unknown) => { guard(event); stopAll(); desktop.permission(approved, denied); });
  ipcMain.handle("setup:desktop-scan", async event => { guard(event); await useDesktop(); return desktop.scan(nativeApp); });
  ipcMain.handle("setup:desktop-open", async event => { guard(event); await useDesktop(); return desktop.open(); });
  ipcMain.handle("setup:desktop-prepare", async (event, id: unknown) => { guard(event); await useDesktop(); return desktop.prepare(id, nativeApp); });
  ipcMain.handle("setup:desktop-run", (event, input: unknown) => { guard(event); if (typeof input === "string" && /^(stop|pause)( assistant)?[.!]?$/i.test(input.trim())) { stopAll(); return; } manual(); return desktop.run(input, nativeApp); });
  ipcMain.handle("setup:desktop-insert", (event, mode: unknown) => { guard(event); manual(); if (!["append", "replace"].includes(String(mode)) || !utteranceBinding || utteranceBinding !== desktop.bindingId || !voice.transcript || voice.transcript.length > 1000) throw new Error("transcript_binding_changed"); return desktop.run(`${mode === "replace" ? "replace dictation with" : "dictate"} ${voice.transcript}`, nativeApp); });
  ipcMain.handle("setup:desktop-reconcile", event => { guard(event); desktop.reconcile(); });
  ipcMain.handle("latham:state", event => { guard(event); return state(); });
  ipcMain.handle("latham:run", (event, command: unknown) => { guard(event); if (resetting || computer.active || !computer.state.fenceConfirmed || computer.state.needsReview || desktop.state.active || desktop.state.busy || chrome.active) throw new Error("executor_unavailable"); return controller.run(command); });
  ipcMain.handle("latham:resume", async event => { guard(event); manual(); if (resetting) throw new Error("executor_unavailable"); if (controller.needsReview) { controller.resume(); return; } const turn = ++activation; desktop.pause(); chrome.pause(); const epoch = chrome.sessionEpoch; await waitFence(() => computer.state.fenceConfirmed && desktop.state.fenceConfirmed && (!chrome.connected || chrome.fenceConfirmed)); if (turn !== activation || epoch !== chrome.sessionEpoch || resetting) throw new Error("cancelled"); if (computer.state.needsReview || desktop.state.needsReview || chrome.needsReview) throw new Error("executor_reconciliation_required"); controller.resume(); });
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
  const idleNotice = (): string => {
    if (providerStore.settings.mode === "local" && (!providerStore.settings.whisperExecutable || !providerStore.settings.whisperModel)) return "Choose Gemini or configure local speech in Settings.";
    if (companionTarget === "computer" && !computer.ready) return computer.state.needsReview ? "Inspect the previous task result in Settings before another command." : !computer.state.agreementAccepted ? "Complete Latham's one-time setup in Settings." : !computer.state.allowed ? "Universal mode is off. Enable it in Settings." : "Waiting for the previous input to stop.";
    if (companionTarget === "chrome" && !chrome.connected) return "Connect Latham's browser extension in Settings.";
    return companionNotice;
  };
  const companionState = (): CompanionState => ({ recoveryRequired: companionTarget === "computer" && computer.state.needsReview && !computer.active, confirmation: computer.state.pending,
    speechPreview: { ...speechPreview.state },
    phase: computer.active || ["transcribing", "executing"].includes(handsfree.state.phase) || ["transcribing", "testing"].includes(voice.status) || browser.state.busy || desktop.state.busy || workflow.active || visual.state.busy ? "processing" : handsfree.active || voice.status === "recording" ? "listening" : "idle",
    sessionId: microphoneOwner === "companion" && handsfree.capturingAudio ? handsfree.state.id : null,
    microphoneId: microphoneOwner === "companion" ? providerStore.settings.microphoneId : "",
    target: companionTarget,
    message: computer.active || (companionTarget === "computer" && ["complete", "blocked"].includes(computer.state.phase)) ? computer.state.message : handsfree.state.message === "Microphone off · hands-free is opt-in each time." ? idleNotice() : handsfree.state.message,
    noticeId: companionNoticeId,
    talkShortcutRegistered, controlHoldReady, holdToTalk: handsfree.holdToTalk, mirrored: companion?.mirrored ?? false, above: companion?.above ?? false, left: companion?.left ?? 0, top: companion?.top ?? 0
  });
  companion = new Companion(localSession, companionState,
    (id, sequence, pcm) => { if (microphoneOwner === "companion") handsfree.frame(id, sequence, pcm); },
    id => { if (microphoneOwner === "companion") handsfree.fail(id); }, stopAll, (id, approved) => computer.approve(id, approved), () => computer.pendingImage);
  showLatham = () => companion!.show();
  let talkStarting = false;
  const talk = async (mode: "single" | "hold" = "single", stillHeld = (): boolean => true): Promise<string | null> => {
    companion!.show();
    if (talkStarting || handsfree.active || voice.status !== "idle") { if (mode === "single") stopAll(); return null; }
    talkStarting = true;
    try {
      if (computer.active || workflow.active || visual.state.busy || browser.state.busy || desktop.state.busy || controller.needsReview) throw new Error("voice_busy");
      voice.prepareSession();
      if (companionTarget === "computer") {
        await useComputer();
      } else if (companionTarget === "chrome") {
        await useChrome(); const turn = activation;
        if (!chrome.active) { await waitFence(() => !chrome.connected || chrome.fenceConfirmed); if (turn !== activation || !stillHeld()) throw new Error("cancelled"); chrome.resume(); }
      } else {
        await useDesktop();
        if (!desktop.state.active || !desktop.state.bound) throw new Error("prepare_editor");
      }
      if (!stillHeld()) throw new Error("cancelled");
      microphoneOwner = "companion";
      const id = handsfree.start({ target: companionTarget, wake: false }, mode);
      if (handsfree.active) win.hide();
      return handsfree.active ? id : null;
    } catch (error) {
      stopAll();
      const code = (error as Error).message;
      companionNotice = code === "cancelled" ? "Stopped. Microphone off."
        : code === "voice_busy" ? "Finish or stop the current task first."
        : code === "prepare_editor" ? "Prepare Notepad in Settings first."
        : code === "computer_setup_required" ? idleNotice()
        : /local_asr|local_model|english_model/.test(code) ? "Connect Gemini in Settings, or configure local speech under Advanced settings."
        : /key/.test(code) ? "Connect Gemini in Settings to use your voice."
        : /managed/.test(code) ? "Sign in to managed AI or select Gemini in Settings."
        : code === "chrome_reconciliation_required" && !chrome.connected ? "Connect Latham's browser extension in Settings."
        : code === "chrome_reconciliation_required" || code === "executor_reconciliation_required" ? "Inspect the previous app result in Settings before resuming."
        : "Check app permissions and setup in Settings.";
      // Replace any prior turn's notice without exposing provider replies or text.
      companionNoticeId++; handsfree.state.message = companionNotice; setupSend(); return null;
    } finally { talkStarting = false; }
  };
  controlHold = new ControlHold({
    start: stillHeld => talk("hold", stillHeld),
    release: id => handsfree.release(id),
    cancel: id => { if (id === handsfree.state.id) handsfree.end("Ctrl shortcut or input changed. Recording discarded; microphone off."); }
  });
  let settingsMounted = (): void => {};
  const settingsReady = new Promise<void>(resolve => { settingsMounted = resolve; });
  ipcMain.handle("setup:ready", event => { guard(event); settingsMounted(); });
  const showSettings = (): void => {
    stopAll();
    // Wait for React's first commit, then let the native tray callback finish before showing.
    void settingsReady.then(() => setImmediate(() => {
      if (quitting || win.isDestroyed()) return;
      // Prepare work-area geometry before the native show operation.
      recoverWindow();
      if (win.isMinimized()) win.restore();
      // This path also works when an external launcher supplies a hidden Windows startup state.
      win.showInactive(); win.focus();
    }));
  };
  ipcMain.handle("setup:companion", event => { guard(event); stopAll(); companion!.show(); win.hide(); });
  ipcMain.handle("setup:companion-talk", async event => { guard(event); await talk(); });
  const bitmap = Buffer.alloc(24 * 24 * 4);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const offset = (y * 24 + x) * 4, bar = x >= 5 && x <= 7 && y >= 8 && y <= 15 || x >= 10 && x <= 13 && y >= 4 && y <= 19 || x >= 16 && x <= 18 && y >= 8 && y <= 15;
    bitmap[offset] = 240; bitmap[offset + 1] = 237; bitmap[offset + 2] = 228; bitmap[offset + 3] = bar ? 255 : 0;
  }
  tray = new Tray(nativeImage.createFromBitmap(bitmap, { width: 24, height: 24 }));
  tray.setToolTip("Latham · Hold Ctrl to talk · Ctrl+Alt+. to stop");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Talk · one command", accelerator: "CommandOrControl+Alt+Space", click: () => void talk() },
    { label: "Stop", accelerator: shortcut, click: stopAll },
    { label: "Show task status", click: () => { companionNoticeId++; companion!.show(); companion!.send(); } },
    { type: "separator" },
    { label: "Command app", submenu: [
      { label: "Universal computer use", type: "radio", checked: true, click: () => { stopAll(); companionTarget = "computer"; companion!.send(); } },
      { label: "Browser extension (optional)", type: "radio", click: () => { stopAll(); companionTarget = "chrome"; companion!.send(); } },
      { label: "Prepared Notepad", type: "radio", click: () => { if (handsfree.active || voice.status !== "idle") stopAll(); companionTarget = "desktop"; companion!.send(); } }
    ] },
    { label: "Follow cursor", type: "checkbox", checked: true, click: item => { companion!.follow = item.checked; companion!.position(); } },
    { label: "Show companion", click: () => companion!.show() },
    { label: "Hide companion", click: () => { stopAll(); companion!.window.hide(); } },
    { label: "Settings…", click: showSettings },
    { type: "separator" }, { label: "Quit Latham", click: () => app.quit() }
  ]));
  tray.on("click", () => { companion!.show(); tray.popUpContextMenu(); });
  stopShortcutRegistered = globalShortcut.register(shortcut, stopAll);
  talkShortcutRegistered = globalShortcut.register("CommandOrControl+Alt+Space", () => void talk());
  globalShortcut.register("CommandOrControl+Alt+Enter", () => { const id = computer.state.pending?.id; if (id) computer.approve(id, true); });
  Menu.setApplicationMenu(null);
  win.on("close", event => { if (!quitting) { event.preventDefault(); win.hide(); } });
  win.on("hide", () => { if (microphoneOwner !== "companion" && !computer.active) stopAll(); });
  win.webContents.on("render-process-gone", stopAll);
  win.on("closed", () => { if (!fixture.webContents.isDestroyed()) fixture.webContents.close(); });
  fixture.webContents.on("render-process-gone", () => { controller.resetExecutor(); });
  app.on("before-quit", () => { quitting = true; stopAll(); chrome.close(); desktop.close(); });
  await fixture.webContents.loadURL("latham://fixture/index.html");
  await win.loadURL("latham://app/index.html");
  companion.position(true);
  await companion.window.loadURL("latham://companion/index.html");
  companion.show();
  const closeControl = watchControl(join(__dirname, "native/Latham.ControlKey.exe"), controlHold, ready => {
    controlHoldReady = ready;
    if (!ready && handsfree.holdToTalk) handsfree.end("Ctrl listener unavailable. Work cancelled; microphone off.");
    companion!.send();
  });
  app.on("before-quit", closeControl);
  // Existing acceptance harnesses inspect settings; production opens only the companion.
  if (!computer.state.agreementAccepted || (process.argv.includes("--latham-test") && !process.argv.includes("--latham-companion"))) showSettings();
}
app.on("will-quit", () => { globalShortcut.unregisterAll(); tray?.destroy(); });
if (locked) void app.whenReady().then(boot).catch(() => { console.error("Latham startup failed."); app.exit(1); });
