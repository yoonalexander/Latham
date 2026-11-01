import { _electron, chromium } from "@playwright/test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
const browser = process.argv[2] ?? "chrome";
if (!["chrome", "edge"].includes(browser)) throw new Error("unsupported_browser");
const goals = [{ site: "usajobs", query: "software", filter: "remote", open: 1, origin: "https://www.usajobs.gov" }, { site: "wikipedia", query: "piano", filter: null, open: 1, origin: "https://en.wikipedia.org" }, { site: "mdn", query: "fetch", filter: null, open: 1, origin: "https://developer.mozilla.org" }];
mkdirSync(".test-artifacts", { recursive: true });
const registry = ["Google\\Chrome", "Chromium", "Microsoft\\Edge"].map(browser => { const path = `HKCU\\Software\\${browser}\\NativeMessagingHosts\\com.latham.host`; try { return { path, value: execFileSync("reg.exe", ["QUERY", path, "/ve"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).match(/REG_SZ\s+(.+)/)?.[1]?.trim() }; } catch { return { path }; } });
const report = { at: new Date().toISOString(), version: JSON.parse(readFileSync("package.json")).version, browser, channel: `signed-out public pages; isolated ${browser}; explicit install-time fixture grants; deterministic workflows; no model requests`, results: [] };
const save = () => writeFileSync(`.test-artifacts/phase9-live-${browser}-workflows.json`, JSON.stringify(report, null, 2) + "\n");
const wait = async check => { const until = Date.now() + 15000; while (Date.now() < until) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("acceptance_timeout"); };
let app, context;
try {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== "ELECTRON_RUN_AS_NODE" && value !== undefined));
  app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: mkdtempSync(resolve(".test-artifacts/workflow-live-app-")) } });
  await wait(() => app.context().pages().some(page => page.url() === "latham://app/index.html"));
  const desk = app.context().pages().find(page => page.url() === "latham://app/index.html"); if (browser === "edge") await desk.evaluate(() => window.setup.chooseBrowser("edge")); await desk.evaluate(() => window.setup.installHost());
  // Isolated evaluation arrangement, not native permission-prompt acceptance.
  const extension = mkdtempSync(resolve(".test-artifacts/workflow-live-extension-")); cpSync("dist/chrome-extension", extension, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(extension, "manifest.json"))); manifest.host_permissions = manifest.optional_host_permissions; manifest.optional_host_permissions = []; writeFileSync(join(extension, "manifest.json"), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(mkdtempSync(resolve(".test-artifacts/workflow-live-browser-")), { executablePath: browser === "edge" ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" : resolve(".test-artifacts/chromium-runtime/latham-test-browser.exe"), headless: false, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--mute-audio"] });
  const popup = await context.newPage(); await popup.goto("chrome-extension://plggaillpeoabjjmpjedmblaakepbhdb/popup.html"); await popup.getByRole("button", { name: "Connect to Latham" }).click(); await wait(() => desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed));
  for (const goal of goals) await popup.locator(".site").filter({ hasText: goal.origin }).getByRole("button", { name: "Approve", exact: true }).click();
  await wait(() => desk.evaluate(async () => (await window.setup.state()).sites.filter(site => ["https://www.usajobs.gov", "https://en.wikipedia.org", "https://developer.mozilla.org"].includes(site.origin)).every(site => site.effective)));
  const page = await context.newPage();
  for (const { origin, ...goal } of goals) {
    const row = { site: goal.site, result: null, restriction: null }; report.results.push(row);
    try {
      await desk.evaluate(() => window.latham.stop()); await page.goto(origin + "/", { waitUntil: "load", timeout: 30000 }); await page.bringToFront(); await page.waitForTimeout(1000);
      await wait(() => desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed));
      if ((await desk.evaluate(() => window.setup.state())).chromeNeedsReview) await desk.evaluate(() => window.setup.reconcileChrome());
      await desk.evaluate(() => window.setup.chromeResume()); await desk.evaluate(goal => window.setup.prepareWorkflow(goal), goal);
      const preview = (await desk.evaluate(() => window.setup.state())).workflow;
      if (preview.phase === "prepared") await desk.evaluate(id => window.setup.runWorkflow(id), preview.previewId);
      row.result = (await desk.evaluate(() => window.setup.state())).workflow;
      row.destination = page.url();
      if (row.result.phase !== "completed") row.restriction = "partial/blocked/unknown; no retry, challenge bypass or effect substitution";
    } catch (error) { row.restriction = error.message; }
    save(); console.log(JSON.stringify({ site: row.site, phase: row.result?.phase, steps: row.result?.steps.map(step => step.outcome), actions: row.result?.actions, requests: row.result?.requests, elapsedMs: row.result?.elapsedMs, restriction: row.restriction }));
  }
} catch (error) { report.failure = error.message; process.exitCode = 1; }
finally {
  save(); for (const worker of context?.serviceWorkers() ?? []) await worker.evaluate("port?.disconnect()").catch(() => {}); await context?.close(); await app?.close();
  for (const { path, value } of registry) { try { if (value) execFileSync("reg.exe", ["ADD", path, "/ve", "/t", "REG_SZ", "/d", value, "/f"], { stdio: "ignore" }); else execFileSync("reg.exe", ["DELETE", path, "/f"], { stdio: "ignore" }); } catch {} }
}
