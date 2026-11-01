import { chromium } from "playwright";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
mkdirSync(".test-artifacts", { recursive: true });
const executablePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const report = { browser: "Microsoft Edge", installed: existsSync(executablePath), version: null, extensionLoaded: false, supported: false, reason: "not_installed" };
if (report.installed) {
  report.version = execFileSync("powershell.exe", ["-NoProfile", "-Command", `(Get-Item -LiteralPath '${executablePath}').VersionInfo.ProductVersion`], { encoding: "utf8", windowsHide: true }).trim();
  let context;
  try {
    context = await chromium.launchPersistentContext(mkdtempSync(resolve(".test-artifacts/edge-evaluation-")), { executablePath, headless: false, args: [`--disable-extensions-except=${resolve("dist/chrome-extension")}`, `--load-extension=${resolve("dist/chrome-extension")}`] });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker", { timeout: 15000 }).catch(() => null);
    report.extensionLoaded = !!worker && worker.url().endsWith("/background.js");
    report.reason = report.extensionLoaded ? "extension_loaded_but_pairing_permissions_and_cancellation_not_accepted" : "isolated_flag_based_unpacked_extension_did_not_load";
  } catch { report.reason = "isolated_launch_failed"; }
  finally { await context?.close(); }
}
writeFileSync(".test-artifacts/phase6-edge.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
