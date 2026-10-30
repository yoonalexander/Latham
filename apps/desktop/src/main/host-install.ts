import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extensionId, hostName } from "./native-bridge";
export function installHost(directory: string, binary: string): void {
  if (process.platform !== "win32" || !existsSync(binary)) throw new Error("native_host_build_required");
  mkdirSync(directory, { recursive: true });
  const identity = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true });
  const sid = identity.match(/S-1-5-[0-9-]+/)?.[0]; if (!sid) throw new Error("host_identity_unavailable");
  execFileSync("icacls.exe", [directory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`], { windowsHide: true, stdio: "ignore" });
  const path = join(directory, "Latham.NativeHost.exe"); copyFileSync(binary, path);
  const manifest = join(directory, "com.latham.host.json");
  writeFileSync(manifest, JSON.stringify({ name: hostName, description: "Latham native messaging relay", path, type: "stdio", allowed_origins: [`chrome-extension://${extensionId}/`] }));
  execFileSync("reg.exe", ["ADD", `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`, "/ve", "/t", "REG_SZ", "/d", manifest, "/f"], { windowsHide: true, stdio: "ignore" });
  // Chromium's isolated integration profiles use the same host contract.
  execFileSync("reg.exe", ["ADD", `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${hostName}`, "/ve", "/t", "REG_SZ", "/d", manifest, "/f"], { windowsHide: true, stdio: "ignore" });
}
export function launchChrome(): void {
  const path = [join(process.env.PROGRAMFILES ?? "", "Google/Chrome/Application/chrome.exe"), join(process.env["PROGRAMFILES(X86)"] ?? "", "Google/Chrome/Application/chrome.exe"), join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe")].find(existsSync);
  if (!path) throw new Error("chrome_not_installed");
  const child = spawn(path, ["--new-window", "chrome://newtab/"], { windowsHide: true, detached: true, stdio: "ignore" }); child.on("error", () => {}); child.unref();
}
