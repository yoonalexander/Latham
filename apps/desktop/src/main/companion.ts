import { BrowserWindow, ipcMain, screen, type Session, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { join } from "node:path";
import { companionPosition, companionHeight, type CompanionState } from "../../../../packages/contracts/src/companion";
import { fitWindow } from "./window-bounds";

export class Companion {
  readonly window: BrowserWindow;
  follow = true;
  mirrored = false;
  above = false;
  left = 0;
  top = 0;
  private timer: ReturnType<typeof setInterval>;
  private displayId: number | undefined;
  private confirmationId: string | null = null;
  constructor(session: Session, private state: () => CompanionState, frame: (id: unknown, sequence: unknown, pcm: unknown) => void, failure: (id: unknown) => void, stop: () => void, confirm: (id: unknown, approved: boolean) => void, confirmationImage: (id: string) => string) {
    // Transparent space contains both placements so one compositor can tween them.
    this.window = new BrowserWindow({ width: 568, height: 304, show: false, title: "Latham companion", frame: false, thickFrame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false, resizable: false, maximizable: false, minimizable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true,
      webPreferences: { preload: join(__dirname, "companion-preload.cjs"), session, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false, backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required" } });
    this.window.setIgnoreMouseEvents(true, { forward: true });
    this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.window.webContents.on("will-navigate", event => event.preventDefault());
    this.window.webContents.on("will-attach-webview", event => event.preventDefault());
    const guard = (event: IpcMainEvent | IpcMainInvokeEvent): void => {
      if (event.sender !== this.window.webContents || event.senderFrame !== this.window.webContents.mainFrame || event.senderFrame.url !== "latham://companion/index.html") throw new Error("forbidden_sender");
    };
    ipcMain.handle("companion:state", event => { guard(event); return state(); });
    const question = (id: unknown): string => { if (typeof id !== "string" || id !== state().confirmation?.id) throw new Error("stale_computer_approval"); return id; };
    ipcMain.handle("companion:confirm", (event, id: unknown, approved: unknown) => { guard(event); question(id); if (typeof approved !== "boolean") throw new Error("invalid_confirmation"); confirm(id, approved); });
    ipcMain.handle("companion:image", (event, id: unknown) => { guard(event); return confirmationImage(question(id)); });
    ipcMain.handle("companion:interact", (event, id: unknown, enabled: unknown) => { guard(event); question(id); if (typeof enabled !== "boolean") throw new Error("invalid_confirmation"); this.window.setIgnoreMouseEvents(!enabled, { forward: true }); });
    ipcMain.on("companion:frame", (event, id: unknown, sequence: unknown, pcm: unknown) => { try { guard(event); } catch { return; } frame(id, sequence, pcm); });
    ipcMain.handle("companion:failure", (event, id: unknown) => { guard(event); failure(id); });
    this.window.on("hide", stop);
    this.window.on("close", stop);
    this.window.webContents.on("render-process-gone", stop);
    this.timer = setInterval(() => this.position(), 16);
    this.window.on("closed", () => clearInterval(this.timer));
  }
  send(): void {
    if (this.window.isDestroyed() || this.window.webContents.isDestroyed()) return;
    let state = this.state(); const id = state.confirmation?.id ?? null;
    if (id !== this.confirmationId) { this.confirmationId = id; this.window.setIgnoreMouseEvents(true, { forward: true }); this.position(true); state = this.state(); }
    this.window.webContents.send("companion:state", state);
  }
  position(force = false): void {
    if (this.window.isDestroyed() || (!force && (!this.window.isVisible() || this.confirmationId))) return;
    const cursor = screen.getCursorScreenPoint(), bounds = this.window.getBounds();
    const display = this.follow ? screen.getDisplayNearestPoint(cursor) : screen.getDisplayMatching(bounds), area = display.workArea;
    const sameDisplay = this.displayId === display.id, size = { width: 264, height: companionHeight(this.state().confirmation) };
    // A small return margin prevents alternating sides at the same boundary pixel.
    const mirrored = !this.follow || cursor.x + 24 + size.width > area.x + area.width - (sameDisplay && this.mirrored ? 12 : 0);
    const above = this.follow && cursor.y + 16 + size.height > area.y + area.height - (sameDisplay && this.above ? 12 : 0);
    const point = companionPosition(cursor, area, size, this.follow, { mirrored, above });
    const viewport = fitWindow({ x: this.follow ? cursor.x - 280 : area.x + area.width - 568, y: this.follow ? cursor.y - size.height - 16 : point.y - (size.height + 32) / 2, width: 568, height: 2 * (size.height + 16) }, [area]);
    viewport.x = Math.round(viewport.x); viewport.y = Math.round(viewport.y);
    const left = point.x - viewport.x, top = point.y - viewport.y;
    this.displayId = display.id;
    if (mirrored !== this.mirrored || above !== this.above || left !== this.left || top !== this.top) { this.mirrored = mirrored; this.above = above; this.left = left; this.top = top; this.send(); }
    // Windows/DPI rounding can enlarge a frameless window on each setPosition.
    if (bounds.x !== viewport.x || bounds.y !== viewport.y || Math.abs(bounds.width - viewport.width) > 2 || Math.abs(bounds.height - viewport.height) > 2) this.window.setBounds(viewport, false);
  }
  show(): void { if (!this.confirmationId) this.position(true); this.window.showInactive(); }
}
