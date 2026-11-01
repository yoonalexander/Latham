import { _electron, chromium } from "@playwright/test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
// This is a live-site transport evaluation, with explicit install-time test grants.
// Production optional-permission prompts remain a separate manual acceptance path.
mkdirSync(".test-artifacts", { recursive: true });
const catalog = { URL }; runInNewContext(readFileSync("dist/chrome-extension/catalog.js", "utf8"), catalog);
const { sites, siteForPage } = catalog.lathamCatalog;
const selected = process.argv.find(argument => argument.startsWith("--site="))?.slice(7);
if (selected && !sites.slice(2).some(site => site.id === selected)) throw new Error("invalid_catalog_site");
const registry = ["Google\\Chrome", "Chromium"].map(browser => { const path = `HKCU\\Software\\${browser}\\NativeMessagingHosts\\com.latham.host`; try { return { path, value: execFileSync("reg.exe", ["QUERY", path, "/ve"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).match(/REG_SZ\s+(.+)/)?.[1]?.trim() }; } catch { return { path }; } });
const report = { at: new Date().toISOString(), version: JSON.parse(readFileSync("package.json")).version, channel: "signed-out public sites; isolated Chrome; install-time fixture grants; no model calls", results: [] };
const save = () => writeFileSync(`.test-artifacts/phase6-live-catalog${selected ? "-" + selected : ""}.json`, JSON.stringify(report, null, 2) + "\n");
const wait = async check => { const until = Date.now() + 15000; while (Date.now() < until) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("acceptance_timeout"); };
let app, context;
try {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== "ELECTRON_RUN_AS_NODE" && value !== undefined));
  app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: mkdtempSync(resolve(".test-artifacts/catalog-live-app-")) } });
  await wait(() => app.context().pages().some(page => page.url() === "latham://app/index.html"));
  const desk = app.context().pages().find(page => page.url() === "latham://app/index.html"); await desk.evaluate(() => window.setup.installHost());
  const extension = mkdtempSync(resolve(".test-artifacts/catalog-live-extension-")); cpSync("dist/chrome-extension", extension, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(extension, "manifest.json"))); manifest.host_permissions = manifest.optional_host_permissions; manifest.optional_host_permissions = []; writeFileSync(join(extension, "manifest.json"), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(mkdtempSync(resolve(".test-artifacts/catalog-live-browser-")), { executablePath: resolve(".test-artifacts/chromium-runtime/latham-test-browser.exe"), headless: false, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--mute-audio"] });
  const popup = await context.newPage(); await popup.goto("chrome-extension://plggaillpeoabjjmpjedmblaakepbhdb/popup.html"); await popup.getByRole("button", { name: "Connect to Latham" }).click();
  await wait(() => desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed));
  for (let index = 0; index < sites.length; index++) await popup.locator(".site").nth(index).getByRole("button", { name: "Approve", exact: true }).click();
  await wait(() => desk.evaluate(async () => (await window.setup.state()).sites.every(site => site.effective)));
  const page = await context.newPage();
  for (const site of sites.slice(2).filter(site => !selected || site.id === selected)) {
    const row = { site: site.id, tasks: [], restriction: null, wrongActions: 0 }; report.results.push(row);
    try {
      await desk.evaluate(() => window.latham.stop());
      await page.goto(site.origin + "/", { waitUntil: "load", timeout: 30000 }); await page.bringToFront();
      await page.waitForTimeout(1000); await page.waitForLoadState("load");
      await wait(() => desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed));
      if ((await desk.evaluate(() => window.setup.state())).chromeNeedsReview) await desk.evaluate(() => window.setup.reconcileChrome());
      await desk.evaluate(() => window.setup.chromeResume());
      const commands = ["inspect page", site.id === "usajobs" ? "search software" : site.id === "mdn" ? "search fetch" : "search piano", ...(site.id === "usajobs" ? ["filter remote"] : []), ...(site.id !== "duckduckgo" ? ["scroll down"] : []), "inspect page", ...(site.id !== "duckduckgo" ? ["open first result"] : [])];
      for (const command of commands) {
        const started = performance.now(); await desk.evaluate(command => window.setup.chromeRun(command), command); const state = await desk.evaluate(() => window.setup.state());
        const outcome = state.page.last?.outcome ?? (state.chromeNeedsReview ? "unknown" : "interrupted"), destination = page.url();
        row.tasks.push({ command, outcome, reason: state.page.last?.reason ?? state.chromeResult, elapsedMs: Math.round(performance.now() - started), destination, candidates: state.page.targets.length }); save();
        if (outcome !== "verified") { row.restriction = "blocked_or_unverified; no retry, bypass or challenge interaction"; break; }
        if (!siteForPage(destination) || new URL(destination).origin !== site.origin) { row.wrongActions++; throw new Error("unexpected_destination"); }
        if (site.id === "mdn" && command === "search fetch") await page.waitForFunction(() => !!document.querySelector("mdn-site-search")?.shadowRoot?.querySelector(".site-search__results h2 a"), null, { timeout: 8000 });
      }
    } catch (error) { row.restriction = error.message; }
    // Bounded public fixture diagnostics for maintaining reviewed selectors; no values or inner HTML.
    row.structure = await page.evaluate(() => ({ title: document.title.slice(0, 100), controls: [...document.querySelectorAll('input:not([type=password]),button,[role=search],a[href*="/job/"],a[href*="/search"],a[href*="/wiki/"],a[href*="/en-US/docs/"]')].filter(node => /search|keyword|\/job\//i.test([node.id, node.className, node.getAttribute("aria-label"), node.getAttribute("name"), node.getAttribute("href")].join(" "))).slice(0, 24).map(node => ({ tag: node.tagName, id: node.id, class: String(node.className).slice(0, 150), aria: node.getAttribute("aria-label"), name: node.getAttribute("name"), href: node.getAttribute("href")?.slice(0, 150) })) })).catch(() => null);
    save(); console.log(JSON.stringify({ site: row.site, verified: row.tasks.filter(task => task.outcome === "verified").length, tasks: row.tasks.length, restriction: row.restriction, wrongActions: row.wrongActions }));
  }
} catch (error) { report.failure = error.message; process.exitCode = 1; console.log(JSON.stringify({ failure: error.message })); }
finally {
  save(); for (const worker of context?.serviceWorkers() ?? []) await worker.evaluate("port?.disconnect()").catch(() => {}); await context?.close(); await app?.close();
  for (const { path, value } of registry) { try { if (value) execFileSync("reg.exe", ["ADD", path, "/ve", "/t", "REG_SZ", "/d", value, "/f"], { stdio: "ignore" }); else execFileSync("reg.exe", ["DELETE", path, "/f"], { stdio: "ignore" }); } catch {} }
}
