import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { record } from "../../../../packages/contracts/src/index";
import { emptyNativeState, parseNativeIntent, parseNativeWindows, type DesktopApp, type NativeState } from "../../../../packages/contracts/src/desktop";

const reasons: Record<string, string> = {
  app_denied: "Approve Notepad first. Browsers, terminals, password managers and all other apps are excluded.",
  blocked_app: "Notepad is on your desktop denylist. Remove the block before approving it.",
  unsupported_editor: "This editor does not expose a supported plain-text control. No keyboard or clipboard fallback is available.",
  ambiguous_editor: "More than one editable surface is present. Select a plain document and refresh.",
  plain_text_required: "Use an English Notepad plain-text document with its Plain text status indicator visible. Markdown and hidden mode indicators are unsupported.",
  dictation_suspended: "Prepare an editor field before recording or editing.",
  stale_window: "The window changed or the worker restarted. Refresh the window list and prepare again.",
  stale_control: "The captured editor control was removed or replaced. Prepare it again.",
  focus_changed: "Focus left the selected editor. Refresh and prepare it again.",
  focus_or_edit_changed: "The selected field, document or foreground app changed. Dictation is paused.",
  user_edit: "The editor changed since it was bound. Correction and undo cannot overwrite that edit.",
  document_changed: "The editor document changed. Refresh and prepare it again.",
  focus_denied: "Windows did not grant editor focus. Select the editor manually, then prepare again.",
  read_only: "This editor is read-only.", secure_field: "Password fields are excluded.",
  elevated_or_other_user: "Elevated or other-user windows are excluded.", secure_desktop: "Secure desktops are excluded.",
  unsupported_native_command: "Use inspect editor, focus editor, dictate text, replace dictation with text, correct that to text, or undo dictation.",
  text_too_long: "Use at most 1,000 characters per utterance and a document of at most 20,000 characters.",
  undo_unavailable: "No unchanged Latham edit is available to correct or undo.",
  verification_failed: "The editor effect could not be verified. Inspect the document before continuing.",
  worker_lost: "The desktop worker stopped. Inspect the document; no pending command will be replayed.",
  supervisor_lost: "The desktop helper connection was lost. Restart Latham and inspect the document before rebinding.",
  timeout: "The desktop provider timed out. Inspect the document before continuing.",
  native_busy: "Wait for the desktop operation or press Stop.", cancelled: "Stopped. An already-issued app call may still take effect.",
  invalid_request: "Use a supported desktop command.", tree_limit: "This window exceeds the bounded UIA profile. It is unsupported."
};
type Pending = { id: string; mutation: boolean; timer: ReturnType<typeof setTimeout>; resolve: (reply: Record<string, unknown>) => void };
export class DesktopController {
  state: NativeState = emptyNativeState();
  bindingId: string | null = null;
  onInvalidate: () => void = () => {};
  private generation = 0;
  private child: ChildProcessWithoutNullStreams | undefined;
  private pending: Pending | undefined;
  private stopId: string | undefined;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly file: string;
  constructor(directory: string, private executable: string, private desk: () => number, private changed: () => void, private testing = false) {
    this.file = join(directory, "desktop.json");
    try {
      const value = JSON.parse(readFileSync(this.file, "utf8"));
      if (!record(value) || typeof value.approved !== "boolean" || typeof value.denied !== "boolean" || typeof value.uncertain !== "boolean") throw new Error("invalid_settings");
      this.state.approved = value.approved && !value.denied; this.state.denied = value.denied; this.state.needsReview = value.uncertain;
    } catch { this.state.needsReview = existsSync(this.file); }
  }
  private save(uncertain = this.state.needsReview): void {
    writeFileSync(this.file + ".tmp", JSON.stringify({ approved: this.state.approved, denied: this.state.denied, uncertain }) + "\n", { mode: 0o600 }); renameSync(this.file + ".tmp", this.file);
  }
  private emit(): void { this.changed(); }
  permission(approved: unknown, denied: unknown): void {
    if (typeof approved !== "boolean" || typeof denied !== "boolean") throw new Error("invalid_request");
    this.pause(); const previous = { approved: this.state.approved, denied: this.state.denied };
    this.state.approved = approved && !denied; this.state.denied = denied;
    try { this.save(); } catch (error) { Object.assign(this.state, previous); this.emit(); throw error; } this.emit();
  }
  private invalidate(): void { this.generation++; this.bindingId = null; this.state.active = false; this.state.bound = false; this.state.windows = []; this.onInvalidate(); }
  pause(): void {
    this.invalidate(); this.state.result = reasons.cancelled!;
    if (this.pending) {
      const pending = this.pending; this.pending = undefined; clearTimeout(pending.timer);
      // Mutation uncertainty was persisted before dispatch; Stop must not depend on another disk write.
      if (pending.mutation) this.state.needsReview = true;
      pending.resolve({ outcome: pending.mutation ? "unknown" : "blocked", reason: "cancelled" });
    }
    this.state.busy = false;
    if (this.child && !this.child.killed && this.child.stdin.writable) {
      this.state.fenceConfirmed = false; this.stopId = randomUUID(); clearTimeout(this.stopTimer);
      this.child.stdin.write(JSON.stringify({ id: this.stopId, kind: "stop" }) + "\n");
      this.stopTimer = setTimeout(() => { this.state.needsReview = true; try { this.save(); } catch {} this.child?.kill(); this.state.result = "Desktop cancellation is unconfirmed. Restart Latham and inspect the document."; this.emit(); }, 3000);
    }
    this.emit();
  }
  reconcile(): void {
    if (this.state.active || !this.state.fenceConfirmed) throw new Error("native_fence_unconfirmed");
    this.save(false); this.state.needsReview = false; this.state.result = "Editor inspected. Refresh windows and prepare a new session."; this.emit();
  }
  close(): void { this.pause(); this.child?.stdin.end(); }
  private connect(): void {
    if (this.child && !this.child.killed) return;
    const child = spawn(this.executable, [String(process.pid), ...(this.testing ? ["--test"] : [])], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }); this.child = child;
    let buffered = "";
    child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk: string) => {
      if (this.child !== child) return; buffered += chunk;
      if (Buffer.byteLength(buffered) > 65536) { child.kill(); return; }
      let end: number;
      while ((end = buffered.indexOf("\n")) >= 0) {
        const line = buffered.slice(0, end); buffered = buffered.slice(end + 1);
        try { this.receive(JSON.parse(line)); } catch { child.kill(); }
      }
    });
    child.stdin.on("error", () => {}); child.stderr.resume();
    const lost = (): void => {
      if (this.child !== child) return; this.child = undefined; clearTimeout(this.stopTimer); this.state.fenceConfirmed = false;
      if (this.pending) { const pending = this.pending; this.pending = undefined; clearTimeout(pending.timer); this.state.needsReview ||= pending.mutation; pending.resolve({ outcome: pending.mutation ? "unknown" : "blocked", reason: "supervisor_lost" }); }
      this.invalidate(); this.state.busy = false; this.state.result = reasons.supervisor_lost!; try { this.save(); } catch {} this.emit();
    };
    child.once("error", lost); child.once("exit", lost);
  }
  private receive(value: unknown): void {
    if (!record(value)) throw new Error("invalid_reply");
    if (value.eventKind === "invalidated") { this.pause(); this.state.result = reasons[String(value.reason)] ?? reasons.worker_lost!; this.emit(); return; }
    if (value.id === this.stopId) { clearTimeout(this.stopTimer); this.stopId = undefined; this.state.fenceConfirmed = value.outcome === "verified"; this.emit(); return; }
    const pending = this.pending; if (!pending || value.id !== pending.id) return;
    if (!["verified", "blocked", "unknown"].includes(String(value.outcome))) throw new Error("invalid_reply");
    this.pending = undefined; clearTimeout(pending.timer);
    try {
      if (value.outcome === "unknown") { this.state.needsReview = true; this.save(); this.pause(); }
      else if (pending.mutation) this.save(false);
    } catch {
      this.state.needsReview = true; this.pause(); pending.resolve({ outcome: "unknown", reason: "recovery_storage_unavailable" }); return;
    }
    pending.resolve(value);
  }
  private async request(kind: string, payload: object = {}, mutation = false, app: DesktopApp = "notepad"): Promise<Record<string, unknown>> {
    if (!this.state.approved || this.state.denied) throw new Error(this.state.denied ? "blocked_app" : "app_denied");
    if (this.state.needsReview || !this.state.fenceConfirmed) throw new Error("native_reconciliation_required");
    if (this.pending) throw new Error("native_busy");
    this.connect(); if (mutation) this.save(true);
    return new Promise(resolve => {
      const id = randomUUID(); this.pending = { id, mutation, resolve, timer: setTimeout(() => { this.state.result = reasons.timeout!; this.pause(); }, 5000) };
      this.child!.stdin.write(JSON.stringify({ id, kind, app, desk: this.desk(), ...payload }) + "\n");
    });
  }
  private async operation(kind: string, payload: object, mutation: boolean, app: DesktopApp): Promise<Record<string, unknown> | null> {
    if (this.state.busy) throw new Error("native_busy"); this.state.busy = true; this.state.last = null; const generation = this.generation, started = performance.now(); this.emit();
    try {
      const reply = await this.request(kind, payload, mutation, app), outcome = reply.outcome as "verified" | "blocked" | "unknown";
      if (generation !== this.generation && (outcome !== "unknown" || !this.state.needsReview)) return null;
      const reason = outcome === "verified" ? (reply.reason === "launch_dispatched" ? "Notepad launch requested. Refresh windows when it opens." : "The intended native editor state was verified.") : reasons[String(reply.reason)] ?? "This native operation is unsupported. Inspect the document if an effect is uncertain.";
      this.state.last = { outcome, reason, elapsedMs: Math.round(performance.now() - started) }; this.state.result = reason;
      if (outcome !== "verified") { this.bindingId = null; this.state.bound = false; this.state.active = false; return null; }
      return reply;
    } catch (error) {
      if (generation !== this.generation) return null;
      this.state.last = { outcome: "blocked", reason: reasons[(error as Error).message] ?? "Inspect any uncertain result, then refresh and prepare the editor.", elapsedMs: Math.round(performance.now() - started) }; this.state.result = this.state.last.reason; return null;
    } finally { if (generation === this.generation) this.state.busy = false; this.emit(); }
  }
  async scan(app: DesktopApp = "notepad"): Promise<void> {
    if (this.state.busy) throw new Error("native_busy"); const generation = ++this.generation;
    this.bindingId = null; this.state.active = false; this.state.bound = false; this.onInvalidate();
    const reply = await this.operation("scan", {}, false, app); if (generation === this.generation) this.state.windows = reply ? parseNativeWindows(reply.windows) : []; this.emit();
  }
  async open(): Promise<void> { await this.operation("open", {}, true, "notepad"); }
  async prepare(windowId: unknown, app: DesktopApp = "notepad"): Promise<void> {
    if (this.state.busy) throw new Error("native_busy");
    if (typeof windowId !== "string" || !this.state.windows.some(window => window.id === windowId)) throw new Error("stale_window");
    const generation = ++this.generation;
    this.bindingId = null; this.state.bound = false; this.onInvalidate();
    const reply = await this.operation("prepare", { windowId }, true, app);
    if (reply && generation === this.generation) { this.bindingId = randomUUID(); this.state.bound = true; this.state.active = true; } this.emit();
  }
  async run(input: unknown, app: DesktopApp = "notepad"): Promise<void> {
    if (!this.state.active || !this.bindingId) throw new Error("dictation_suspended");
    const generation = this.generation, intent = parseNativeIntent(input); await this.operation(intent.kind, intent, intent.kind !== "inspect" && intent.kind !== "unbind", app);
    if (intent.kind === "unbind" && generation === this.generation) { this.bindingId = null; this.state.bound = false; this.state.active = false; this.onInvalidate(); this.emit(); }
  }
}
