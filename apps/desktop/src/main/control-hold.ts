import { spawn } from "node:child_process";
import { record } from "../../../../packages/contracts/src/index";

type HoldHooks = {
  start(stillHeld: () => boolean): Promise<string | null>;
  release(id: string): void;
  cancel(id: string): void;
};
export class ControlHold {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private down = false;
  private id: string | null = null;
  constructor(private hooks: HoldHooks) {}
  event(kind: "down" | "up" | "cancel"): void {
    if (kind === "down") {
      if (this.down) return;
      this.down = true; const generation = ++this.generation;
      this.timer = setTimeout(() => {
        void this.hooks.start(() => this.down && generation === this.generation).then(id => {
          if (this.down && generation === this.generation) this.id = id;
          else if (id) this.hooks.cancel(id);
        }).catch(() => { if (generation === this.generation) this.event("cancel"); });
      }, 250);
      return;
    }
    clearTimeout(this.timer); this.down = false; this.generation++;
    const id = this.id; this.id = null;
    if (id) { if (kind === "up") this.hooks.release(id); else this.hooks.cancel(id); }
  }
}

export function watchControl(executable: string, hold: ControlHold, available: (ready: boolean) => void): () => void {
  const child = spawn(executable, [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let buffer = "", closed = false, ready = false, health = performance.now();
  const close = (): void => { if (closed) return; closed = true; clearInterval(timer); hold.event("cancel"); available(false); child.kill(); };
  const timer = setInterval(() => { if (performance.now() - health > 2000) close(); }, 250);
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    if (closed) return;
    buffer += chunk; if (buffer.length > 8192) { close(); return; }
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0 && !closed) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try {
        const value: unknown = JSON.parse(line);
        if (!record(value) || Object.keys(value).length !== 1 || !["ready", "health", "down", "up", "cancel"].includes(String(value.kind))) throw new Error("invalid_control_event");
        if (value.kind === "ready") { ready = true; health = performance.now(); available(true); }
        else if (!ready) throw new Error("control_not_ready");
        else if (value.kind === "health") health = performance.now();
        else hold.event(value.kind as "down" | "up" | "cancel");
      } catch { close(); }
    }
  });
  child.stderr.resume(); child.stdin.on("error", close); child.once("error", close); child.once("exit", close);
  return close;
}
