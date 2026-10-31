import { spawn } from "node:child_process";
import { record } from "../../../../packages/contracts/src/index";
export type DetectorRole = "stop" | "wake";
export type DetectorEvent = { kind: "ready" | "match" | "failed" };
export interface Detector { push(bytes: Buffer): void; close(): void; }
export type DetectorFactory = (role: DetectorRole, receive: (event: DetectorEvent) => void) => Detector;
export function localDetector(executable: string): DetectorFactory {
  return (role, receive) => {
    const child = spawn(executable, [role], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let closed = false, buffer = "", lastHealth = performance.now(), fed = 0, processed = 0;
    const fail = (): void => { if (!closed) { receive({ kind: "failed" }); close(); } };
    const timer = setInterval(() => { if (performance.now() - lastHealth > 3000 || fed / 32 - processed > 5000) fail(); }, 250);
    const close = (): void => { if (closed) return; closed = true; clearInterval(timer); child.kill(); };
    child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk: string) => {
      buffer += chunk; if (buffer.length > 8192) { fail(); return; }
      let end; while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        try {
          const value: unknown = JSON.parse(line);
          if (!record(value) || value.role !== role || !["ready", "match", "health"].includes(String(value.kind))) { fail(); return; }
          if (value.kind === "health") { if (typeof value.processedMs !== "number" || !Number.isFinite(value.processedMs) || value.processedMs < 0) { fail(); return; } lastHealth = performance.now(); processed = value.processedMs; }
          else if (value.kind === "match") { if (typeof value.confidence !== "number" || value.confidence < (role === "stop" ? 0.55 : 0.75) || value.confidence > 1) { fail(); return; } receive({ kind: "match" }); }
          else receive({ kind: "ready" });
        } catch { fail(); return; }
      }
    });
    child.stderr.resume(); child.stdin.on("error", fail); child.once("error", fail); child.once("exit", fail);
    return { close, push(bytes) { if (closed) return; if (child.stdin.writableLength + bytes.length > 96000) { fail(); return; } fed += bytes.length; child.stdin.write(bytes); } };
  };
}
