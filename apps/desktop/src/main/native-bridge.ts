import { createServer, type Server, type Socket } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { record } from "../../../../packages/contracts/src/index";
import { parseChromeCommand, sites, type SetupState } from "../../../../packages/contracts/src/setup";
import { ProviderStore } from "./provider-store";

export const extensionId = "plggaillpeoabjjmpjedmblaakepbhdb";
export const hostName = "com.latham.host";
export function frame(value: unknown): Buffer { const body = Buffer.from(JSON.stringify(value)); if (body.length > 65536) throw new Error("oversize_frame"); const prefix = Buffer.alloc(4); prefix.writeUInt32LE(body.length); return Buffer.concat([prefix, body]); }
export class FrameReader {
  private buffer = Buffer.alloc(0);
  push(chunk: Buffer, receive: (value: unknown) => void): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(); if (!length || length > 65536) throw new Error("invalid_frame");
      if (this.buffer.length < length + 4) break;
      const data = this.buffer.subarray(4, length + 4); this.buffer = this.buffer.subarray(length + 4); receive(JSON.parse(data.toString("utf8")));
    }
    if (this.buffer.length > 65540) throw new Error("oversize_frame");
  }
}
export class ChromeBridge {
  active = false; connected = false; result = "Not connected";
  fenceConfirmed = false; needsReview = false;
  onInvalidate: () => void = () => {};
  private server: Server | undefined;
  private socket: Socket | undefined;
  private grants = new Set<string>();
  private epoch = 0;
  private pending: { id: string; timer: ReturnType<typeof setTimeout>; mutation: boolean; resolve: (value?: unknown) => void } | undefined;
  readonly pipe = "\\\\.\\pipe\\latham-" + randomUUID();
  readonly token = randomBytes(32).toString("hex");
  get sessionEpoch(): number { return this.epoch; }
  constructor(private store: ProviderStore, private changed: () => void) { this.needsReview = store.chromeUncertain; }
  get siteState(): SetupState["sites"] { return sites.map(site => ({ origin: site.origin, name: site.name, consent: this.store.consent.includes(site.origin), chromeGranted: this.grants.has(site.origin), effective: this.connected && this.store.consent.includes(site.origin) && this.grants.has(site.origin) })); }
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer(socket => {
        const reader = new FrameReader(); let authenticated = false;
        const timeout = setTimeout(() => socket.destroy(), 3000);
        socket.on("data", chunk => {
          try { reader.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk), value => {
            if (!authenticated) {
              if (!record(value) || value.type !== "hello" || value.protocol !== 2 || value.token !== this.token || value.origin !== `chrome-extension://${extensionId}/` || this.socket) { socket.destroy(); return; }
              authenticated = true; clearTimeout(timeout); this.socket = socket; this.pause(); this.send({ type: "sync", protocol: 2, consent: this.store.consent }); this.changed(); return;
            }
            this.receive(value);
          }); } catch { socket.destroy(); }
        });
        socket.on("error", () => socket.destroy());
        socket.on("close", () => { clearTimeout(timeout); if (this.socket === socket) { this.socket = undefined; this.connected = false; this.grants.clear(); this.pause(); this.result = "Disconnected. Pending results are unknown; nothing is replayed."; this.changed(); } });
      });
      this.server.once("error", reject); this.server.listen(this.pipe, () => { this.server?.removeListener("error", reject); resolve(); });
    });
  }
  writeConfig(directory: string): void { mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, "connection.json"), JSON.stringify({ pipe: this.pipe.replace("\\\\.\\pipe\\", ""), token: this.token, origin: `chrome-extension://${extensionId}/` }), { mode: 0o600 }); }
  close(): void { this.pause(); this.socket?.destroy(); this.server?.close(); }
  pause(): void {
    this.onInvalidate();
    this.active = false; this.fenceConfirmed = false; this.epoch++; this.send({ type: "pause", epoch: this.epoch });
    if (this.pending) { clearTimeout(this.pending.timer); if (this.pending.mutation) { this.needsReview = true; this.result = "Stopped. An in-flight Chrome effect may already have happened; inspect Chrome before resuming. It will not be retried."; } this.pending.resolve(); this.pending = undefined; }
    this.changed();
  }
  resume(): void { if (!this.connected || !this.fenceConfirmed || this.needsReview) throw new Error("chrome_reconciliation_required"); this.active = true; this.fenceConfirmed = false; this.epoch++; this.send({ type: "resume", epoch: this.epoch }); this.result = "Chrome session ready"; this.changed(); }
  reconcile(): void { if (this.active || !this.fenceConfirmed) throw new Error("chrome_fence_unconfirmed"); this.store.chromeUncertain = false; this.store.save(); this.needsReview = false; this.result = "Chrome inspected. Start a new session when ready."; this.changed(); }
  revoke(origin: unknown): void {
    if (typeof origin !== "string" || !sites.some(site => site.origin === origin)) throw new Error("invalid_origin");
    this.pause(); this.store.consent = this.store.consent.filter(item => item !== origin); this.store.save(); this.send({ type: "revoke", origin }); this.changed();
  }
  async run(input: unknown): Promise<void> {
    const command = parseChromeCommand(input);
    if (!this.connected || !this.active) throw new Error("chrome_session_paused");
    if (this.pending) throw new Error("chrome_busy");
    if (command.kind === "navigate" && !this.siteState.some(site => site.effective && site.origin === new URL(command.url).origin)) throw new Error("site_denied");
    this.result = "Waiting for Chrome"; this.changed();
    this.store.chromeUncertain = true; this.store.save();
    await new Promise<unknown>(resolve => {
      const id = randomUUID();
      this.pending = { id, resolve, mutation: true, timer: setTimeout(() => { this.result = "Chrome acknowledgement missing. Outcome unknown; no automatic retry."; this.pause(); }, 5000) };
      this.send({ type: "command", id, epoch: this.epoch, command });
    });
  }
  async request(request: object, mutation = false): Promise<unknown> {
    if (!this.active || !this.connected || this.needsReview) throw new Error("chrome_session_paused");
    if (this.pending) throw new Error("chrome_busy");
    if (mutation) { this.store.chromeUncertain = true; this.store.save(); }
    return new Promise(resolve => { const id = randomUUID(); this.pending = { id, resolve, mutation, timer: setTimeout(() => { this.result = "Page acknowledgement missing; inspect Chrome before continuing."; this.pause(); }, 18000) }; this.send({ type: "page_request", id, epoch: this.epoch, request }); });
  }
  private send(value: unknown): void { if (this.socket?.writable) this.socket.write(frame(value)); }
  private receive(value: unknown): void {
    if (!record(value)) throw new Error("invalid_message");
    if (value.type === "ready") { this.connected = value.protocol === 2 && value.version === "0.8.0"; if (!this.connected) { this.pause(); this.result = "Incompatible extension. Load Latham extension 0.8.0 and register the current host."; }
    } else if (value.type === "context_changed") { this.pause(); this.result = "Page focus, edit, tab or document changed. Start a new session and rebind dictation.";
    } else if (value.type === "page_result" && value.id === this.pending?.id && value.epoch === this.epoch) {
      const pending = this.pending!; this.pending = undefined; clearTimeout(pending.timer);
      if (["verified", "blocked"].includes(String(value.outcome))) { if (pending.mutation) { this.store.chromeUncertain = false; this.store.save(); } }
      else { this.needsReview = true; this.pause(); }
      pending.resolve(value);
    } else if (value.type === "paused" && value.epoch === this.epoch) { this.fenceConfirmed = true;
    } else if (value.type === "grants" && Array.isArray(value.origins)) {
      const next = new Set(value.origins.filter((origin): origin is string => typeof origin === "string" && sites.some(site => site.origin === origin)));
      const revoked = [...this.grants].filter(origin => !next.has(origin));
      this.grants = next;
      if (revoked.length) { this.pause(); this.store.consent = this.store.consent.filter(origin => !revoked.includes(origin)); this.store.save(); }
    } else if (value.type === "reconcile" && Array.isArray(value.origins)) {
      const kept = this.store.consent.filter(origin => (value.origins as unknown[]).includes(origin) && this.grants.has(origin));
      if (kept.length !== this.store.consent.length) { this.pause(); this.store.consent = kept; this.store.save(); }
    } else if (value.type === "consent" && typeof value.origin === "string" && sites.some(site => site.origin === value.origin) && value.granted === true) {
      if (!this.store.consent.includes(value.origin)) { this.store.consent.push(value.origin); this.store.save(); }
    } else if (value.type === "result" && value.id === this.pending?.id && value.epoch === this.epoch) {
      const results: Record<string, string> = { verified: "Verified Chrome result", dispatched: "Dispatched; page navigation outcome not verified", blocked: "Blocked by scope, permission, or session", failed: "Chrome operation failed", unknown: "Chrome result unknown; inspect Chrome before continuing" };
      this.result = results[String(value.outcome)] ?? results.unknown!;
      const pending = this.pending!; this.pending = undefined; clearTimeout(pending.timer); pending.resolve();
      if (value.outcome === "unknown" || !results[String(value.outcome)]) { this.needsReview = true; this.pause(); }
      else { this.store.chromeUncertain = false; this.store.save(); }
    }
    this.changed();
  }
}
