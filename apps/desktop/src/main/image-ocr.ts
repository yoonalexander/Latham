import { spawn } from "node:child_process";
import { record } from "../../../../packages/contracts/src/index";
export async function imageOcr(executable: string, image: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const bytes = Buffer.from(image, "base64"); if (bytes.length > 8192 || bytes.length < 100) throw new Error("invalid_visual_image");
  const local = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"], signal: local });
    let output = ""; child.stdout.setEncoding("utf8"); child.stdin.on("error", () => {});
    child.stdout.on("data", (part: string) => { output += part; if (Buffer.byteLength(output) > 12000) child.kill(); });
    child.once("error", () => reject(new Error("local_ocr_unavailable")));
    child.once("close", code => { try { const value: unknown = JSON.parse(output); if (local.aborted || code !== 0 || !record(value) || typeof value.text !== "string" || value.text.length > 2000) throw new Error(); resolve(value.text); } catch { reject(new Error("local_ocr_unavailable")); } });
    child.stdin.end(bytes);
  });
}
