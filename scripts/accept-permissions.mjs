import { _electron, chromium } from "@playwright/test";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import readline from "node:readline/promises";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const root = resolve(".test-artifacts"); mkdirSync(root, { recursive: true });
const resumed = process.argv.includes("--resume") ? JSON.parse(readFileSync(root + "/permission-session.json", "utf8")) : null;
const appDirectory = resumed?.appDirectory ?? mkdtempSync(root + "/permission-app-"), browserDirectory = resumed?.browserDirectory ?? mkdtempSync(root + "/permission-browser-");
for (const directory of [appDirectory, browserDirectory]) assert.ok(resolve(directory).startsWith(root + sep));
writeFileSync(root + "/permission-session.json", JSON.stringify({ appDirectory, browserDirectory }));
const input = readline.createInterface({ input: process.stdin, output: process.stdout });
const registry = ["Google\\Chrome", "Chromium"].map(browser => {
  const path = `HKCU\\Software\\${browser}\\NativeMessagingHosts\\com.latham.host`;
  try { return { path, value: execFileSync("reg.exe", ["QUERY", path, "/ve"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).match(/REG_SZ\s+(.+)/)?.[1]?.trim() }; } catch { return { path }; }
});
let app, context, page, popup;
const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && key !== "ELECTRON_RUN_AS_NODE"));
const extension = resolve("dist/chrome-extension"), extensionUrl = "chrome-extension://plggaillpeoabjjmpjedmblaakepbhdb/popup.html";
async function wait(predicate) { for (let attempt = 0; attempt < 100; attempt++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("acceptance_timeout"); }
async function launch() {
  app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: appDirectory } });
  await wait(() => app.context().pages().some(item => item.url() === "latham://app/index.html")); page = app.context().pages().find(item => item.url() === "latham://app/index.html");
  await page.evaluate(() => window.setup.installHost());
  const alias = resolve(".test-artifacts/chromium-runtime/latham-test-browser.exe");
  context = await chromium.launchPersistentContext(browserDirectory, { executablePath: existsSync(alias) ? alias : resolve(".test-artifacts/chromium-runtime/chrome.exe"), headless: false, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  popup = await context.newPage(); await popup.goto(extensionUrl); await popup.getByRole("button", { name: "Connect to Latham" }).click();
  await wait(() => page.evaluate(async () => (await window.setup.state()).chromeConnected)); await wait(async () => (await popup.locator("#status").textContent()).startsWith("Connected"));
  await wait(() => page.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed));
}
async function close() { for (const worker of context?.serviceWorkers() ?? []) await worker.evaluate("port?.disconnect()").catch(() => {}); await context?.close(); await app?.close(); }
try {
  await launch();
  for (const [index, site] of ["Google Search", "YouTube"].entries()) {
    if ((await page.evaluate(() => window.setup.state())).sites[index].effective) continue;
    await popup.locator(".site").nth(index).getByRole("button", { name: "Approve", exact: true }).click();
    await input.question(`Accept the ${site} permission prompt in this isolated browser, then press Enter here. `);
    await wait(() => page.evaluate(async index => (await window.setup.state()).sites[index].effective, index));
  }
  assert.equal((await page.evaluate(() => window.setup.state())).chromeActive, false);
  await page.evaluate(() => window.setup.chromeResume()); await page.evaluate(() => window.setup.chromeRun("new tab"));
  assert.equal((await page.evaluate(() => window.setup.state())).chromeResult, "Verified Chrome result");
  await page.evaluate(() => window.setup.chromeRun("open https://www.google.com"));
  const unapproved = await context.newPage(); await unapproved.route("https://example.org/**", route => route.fulfill({ contentType: "text/html", body: "Unapproved synthetic origin" })); await unapproved.goto("https://example.org");
  assert.equal(await page.evaluate(async () => { try { await window.setup.chromeRun("open https://example.org"); return false; } catch { return true; } }), true);
  await page.evaluate(() => window.latham.stop());
  assert.equal((await page.evaluate(() => window.setup.state())).chromeActive, false);
  assert.equal((await page.evaluate(() => window.setup.state())).sites.every(site => site.effective), true);
  await close(); await launch();
  await wait(() => page.evaluate(async () => (await window.setup.state()).sites.every(site => site.effective)));
  assert.equal((await page.evaluate(() => window.setup.state())).chromeActive, false);
  assert.equal(await popup.locator(".site").getByRole("button", { name: "Approve", exact: true }).first().isDisabled(), true);
  await page.evaluate(() => window.setup.revoke("https://www.google.com"));
  await wait(() => page.evaluate(async () => !(await window.setup.state()).sites[0].effective));
  await wait(async () => (await context.serviceWorkers()[0].evaluate("chrome.permissions.contains({origins:['https://www.google.com/*']})")) === false);
  await context.serviceWorkers()[0].evaluate("chrome.permissions.remove({origins:['https://www.youtube.com/*']})");
  await wait(() => page.evaluate(async () => !(await window.setup.state()).sites[1].consent));
  assert.equal((await page.evaluate(() => window.setup.state())).chromeActive, false);
  await close(); await launch();
  assert.equal((await page.evaluate(() => window.setup.state())).sites.some(site => site.effective), false);
  await page.evaluate(() => window.setup.chromeResume());
  console.log("Permission persistence/restart/revoke/disconnect/new-site/Pause checks passed. Chrome is active for the physical stop check.");
  await input.question("Press Ctrl+Alt+. physically in Latham, then press Enter here. ");
  assert.equal((await page.evaluate(() => window.setup.state())).chromeActive, false);
  writeFileSync(root + "/permission-acceptance.json", JSON.stringify({ at: new Date().toISOString(), passed: ["user_gesture_prompts", "remembered_restart", "new_site_denied", "latham_revoke", "chrome_revoke", "reconnect_no_replay", "paused_with_grants", "physical_stop"] }, null, 2));
  console.log("Permission and physical-stop acceptance passed.");
} finally { input.close(); await close(); for (const { path, value } of registry) { if (value) execFileSync("reg.exe", ["ADD", path, "/ve", "/t", "REG_SZ", "/d", value, "/f"], { stdio: "ignore" }); else { try { execFileSync("reg.exe", ["DELETE", path, "/f"], { stdio: "ignore" }); } catch {} } } }
