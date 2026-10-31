import { _electron, chromium } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import readline from "node:readline/promises";
const root = resolve(".test-artifacts"); mkdirSync(root, { recursive: true });
const prior = process.argv.includes("--resume") ? JSON.parse(readFileSync(join(root, "phase2-session.json"), "utf8")) : null;
const appDirectory = prior?.appDirectory ?? mkdtempSync(root + "/live-page-app-"), browserDirectory = prior?.browserDirectory ?? mkdtempSync(root + "/live-page-browser-");
for (const directory of [appDirectory, browserDirectory]) assert.ok(resolve(directory).startsWith(root + sep));
writeFileSync(join(root, "phase2-session.json"), JSON.stringify({ appDirectory, browserDirectory }));
const registry = ["Google\\Chrome", "Chromium"].map(browser => { const path = `HKCU\\Software\\${browser}\\NativeMessagingHosts\\com.latham.host`; try { return { path, value: execFileSync("reg.exe", ["QUERY", path, "/ve"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).match(/REG_SZ\s+(.+)/)?.[1]?.trim() }; } catch { return { path }; } });
const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && key !== "ELECTRON_RUN_AS_NODE"));
const input = readline.createInterface({ input: process.stdin, output: process.stdout });
const navigationOnly = process.argv.includes("--navigation-only");
const report = process.argv.includes("--manual-only") || navigationOnly ? JSON.parse(readFileSync(join(root, "live-browser-evaluation.json"), "utf8")) : { at: new Date().toISOString(), channel: "signed-out live websites, production optional-permission manifest", operations: [], interventions: [], failures: [] };
const save = () => writeFileSync(join(root, "live-browser-evaluation.json"), JSON.stringify(report, null, 2));
const wait = async (check, timeout = 20000) => { const until = Date.now() + timeout; while (Date.now() < until) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("acceptance_timeout"); };
let app, context, desk, site;
async function reconcile() { await wait(async () => (await desk.evaluate(() => window.setup.state())).chromeFenceConfirmed); if ((await desk.evaluate(() => window.setup.state())).chromeNeedsReview) await desk.evaluate(() => window.setup.reconcileChrome()); if (!(await desk.evaluate(() => window.setup.state())).chromeActive) await desk.evaluate(() => window.setup.chromeResume()); }
async function command(mode, origin, text) {
  const start = performance.now(); await desk.evaluate(text => window.setup.chromeRun(text), text); const state = await desk.evaluate(() => window.setup.state());
  report.operations.push({ mode, origin, command: text, outcome: state.page.last?.outcome ?? state.chromeResult, elapsedMs: Math.round(performance.now() - start) }); save();
  assert.equal(state.page.last?.outcome, "verified", state.page.last?.reason ?? state.chromeResult);
}
function pcm(file) { const buffer = readFileSync(file); for (let at = 12; at + 8 < buffer.length;) { const size = buffer.readUInt32LE(at + 4); if (buffer.toString("ascii", at, at + 4) === "data") return [...buffer.subarray(at + 8, at + 8 + size)]; at += 8 + size + size % 2; } throw new Error("missing_audio"); }
try {
  app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: appDirectory } });
  await wait(() => app.context().pages().some(page => page.url() === "latham://app/index.html")); desk = app.context().pages().find(page => page.url() === "latham://app/index.html"); await desk.evaluate(() => window.setup.installHost());
  const extension = resolve("dist/chrome-extension"); context = await chromium.launchPersistentContext(browserDirectory, { executablePath: resolve(".test-artifacts/chromium-runtime/latham-test-browser.exe"), headless: false, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--mute-audio"] });
  const popup = await context.newPage(); await popup.goto("chrome-extension://plggaillpeoabjjmpjedmblaakepbhdb/popup.html"); await popup.getByRole("button", { name: "Connect to Latham" }).click(); await wait(async () => (await desk.evaluate(() => window.setup.state())).chromeConnected);
  for (let index = 0; index < 2; index++) {
    if (!(await desk.evaluate(() => window.setup.state())).sites[index].effective) {
      await popup.locator(".site").nth(index).getByRole("button", { name: "Approve", exact: true }).click(); console.log(`Waiting for the approved isolated-profile ${index ? "YouTube" : "Google"} permission prompt.`);
      await wait(async () => (await desk.evaluate(() => window.setup.state())).sites[index].effective, 300000);
    }
  }
  site = await context.newPage();
  for (const mode of process.argv.includes("--manual-only") ? [] : process.argv.includes("--cloud") || navigationOnly ? ["cloud", "local"] : ["local"]) {
    await desk.evaluate(async ({ mode, root }) => { const state = await window.setup.state(); await window.setup.save({ ...state.settings, mode, whisperExecutable: root + "/local-ai/whisper/Release/whisper-cli.exe", whisperModel: root + "/local-ai/ggml-base.en.bin", ollamaModel: "qwen2.5:1.5b" }); if (mode === "cloud") await window.setup.importEnvironmentKey(); }, { mode, root });
    for (const origin of ["https://www.google.com", "https://www.youtube.com"]) {
      try {
        await desk.evaluate(() => window.latham.stop()); await site.goto(origin + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
        await site.waitForLoadState("load", { timeout: 30000 }); await site.locator(origin.includes("google") ? 'textarea[name="q"],input[name="q"]' : 'input[name="search_query"]').first().waitFor({ state: "visible", timeout: 20000 }); await reconcile();
        await command(mode, origin, "focus Search"); await command(mode, origin, "start dictation");
        if (navigationOnly) await command(mode, origin, "replace dictation with piano music");
        else {
          const id = await desk.evaluate(() => window.setup.beginTurn()); await desk.evaluate(({ id, bytes }) => window.setup.finishTurn(id, Uint8Array.from(bytes).buffer), { id, bytes: pcm(root + "/speech-corpus/02.wav") });
          const transcript = (await desk.evaluate(() => window.setup.state())).transcript; assert.match(transcript, /orchestral music/i); await desk.evaluate(() => window.setup.insertTranscript("replace"));
          assert.equal((await desk.evaluate(() => window.setup.state())).page.last?.outcome, "verified"); report.operations.push({ mode, origin, command: "bound speech insertion", outcome: "verified" }); save();
        }
        await command(mode, origin, "correct that to piano music"); await command(mode, origin, "undo dictation"); await command(mode, origin, "replace dictation with piano music");
        try { await command(mode, origin, "click Search"); }
        catch (error) {
          if (!site.url().includes("/sorry/")) throw error;
          report.interventions.push({ origin, kind: "Google CAPTCHA requires human completion" }); save(); console.log("Google presented a CAPTCHA. No bypass was attempted.");
          await input.question("Complete the CAPTCHA manually in the test browser, then press Enter to continue (or type skip). ").then(answer => { if (answer.trim().toLowerCase() === "skip") throw new Error("Google live acceptance blocked by CAPTCHA"); });
          assert.equal(site.url().includes("/sorry/"), false); await reconcile();
        }
        await command(mode, origin, "inspect page"); await command(mode, origin, "scroll down"); await command(mode, origin, "scroll up");
        if (origin.includes("google")) await command(mode, origin, "filter images");
        else { await site.locator('ytd-video-renderer a#video-title').first().waitFor({ state: "visible", timeout: 20000 }); await command(mode, origin, "open first result"); assert.ok(site.url().includes("/watch?")); }
      } catch (error) { report.failures.push({ mode, origin, error: error.message }); save(); console.log(`${mode} ${origin}: ${error.message}`); }
    }
  }
  if (!navigationOnly) {
  await desk.evaluate(async ({ root }) => { const state = await window.setup.state(); await window.setup.save({ ...state.settings, mode: "local", whisperExecutable: root + "/local-ai/whisper/Release/whisper-cli.exe", whisperModel: root + "/local-ai/ggml-base.en.bin" }); }, { root });
  await site.goto("https://www.youtube.com/results?search_query=microphone+test+start", { waitUntil: "load", timeout: 30000 }); await wait(async () => (await desk.evaluate(() => window.setup.state())).chromeFenceConfirmed);
  await desk.evaluate(() => window.setup.prepareDictation());
  console.log("Manual local-microphone check is prepared. Hold to talk, say 'piano music', release, then click Replace field with transcript. The field must change from 'microphone test start' to your words.");
  const answer = await input.question("Complete the real microphone insertion, then press Enter here (or type skip). ");
  if (answer.trim().toLowerCase() === "skip") report.microphone = "not manually accepted";
  else { assert.match(await site.locator('input[name="search_query"]').first().inputValue(), /piano music/i); report.microphone = "physical microphone -> local base.en -> reviewed transcript -> verified Chrome field insertion"; }
  save();
  }
} finally {
  input.close(); save(); for (const worker of context?.serviceWorkers() ?? []) await worker.evaluate("port?.disconnect()").catch(() => {}); await context?.close(); await app?.close();
  for (const { path, value } of registry) { try { if (value) execFileSync("reg.exe", ["ADD", path, "/ve", "/t", "REG_SZ", "/d", value, "/f"], { stdio: "ignore" }); else execFileSync("reg.exe", ["DELETE", path, "/f"], { stdio: "ignore" }); } catch {} }
}
