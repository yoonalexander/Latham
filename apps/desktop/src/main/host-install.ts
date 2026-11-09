import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extensionId, hostName } from "./native-bridge";
import { browsers, type BrowserId } from "../../../../packages/contracts/src/compatibility";
export function hostRegistryPaths(browser: BrowserId): string[] {
  return (browser === "edge" ? ["Microsoft\\Edge"] : ["Google\\Chrome", "Chromium"]).map(name => `HKCU\\Software\\${name}\\NativeMessagingHosts\\${hostName}`);
}
export function installHost(directory: string, binary: string, browser: BrowserId = "chrome"): void {
  if (process.platform !== "win32" || !existsSync(binary)) throw new Error("native_host_build_required");
  mkdirSync(directory, { recursive: true });
  const identity = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true });
  const sid = identity.match(/S-1-5-[0-9-]+/)?.[0]; if (!sid) throw new Error("host_identity_unavailable");
  execFileSync("icacls.exe", [directory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`], { windowsHide: true, stdio: "ignore" });
  const path = join(directory, "Latham.NativeHost.exe"); copyFileSync(binary, path);
  const manifest = join(directory, "com.latham.host.json");
  writeFileSync(manifest, JSON.stringify({ name: hostName, description: "Latham native messaging relay", path, type: "stdio", allowed_origins: [`chrome-extension://${extensionId}/`] }));
  for (const path of hostRegistryPaths(browser)) execFileSync("reg.exe", ["ADD", path, "/ve", "/t", "REG_SZ", "/d", manifest, "/f"], { windowsHide: true, stdio: "ignore" });
}
export function browserPath(browser: BrowserId): string | undefined {
  const relative = browser === "edge" ? "Microsoft/Edge/Application/msedge.exe" : "Google/Chrome/Application/chrome.exe";
  return [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter((root): root is string => !!root).map(root => join(root, relative)).find(existsSync);
}
export function launchBrowser(browser: BrowserId): void {
  const path = browserPath(browser); if (!path) throw new Error(`${browsers[browser]}_not_installed`);
  const child = spawn(path, ["--new-window", browser === "edge" ? "edge://newtab/" : "chrome://newtab/"], { windowsHide: false, detached: true, stdio: "ignore" }); child.on("error", () => {}); child.unref();
}
