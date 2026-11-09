import { _electron } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const root = resolve(".test-artifacts"); mkdirSync(root, { recursive: true });
const directory = mkdtempSync(join(root, "native-live-"));
const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && key !== "ELECTRON_RUN_AS_NODE"));
const report = { at: new Date().toISOString(), app: "Notepad", operations: [], voice: [] };
const wait = async check => { for (let n = 0; n < 200; n++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("native_acceptance_timeout"); };
let app, desk;
async function command(text) {
  await desk.evaluate(text => window.setup.desktopRun(text), text); const state = (await desk.evaluate(() => window.setup.state())).desktop;
  report.operations.push({ command: text, ...state.last }); assert.equal(state.last?.outcome, "verified", state.last?.reason);
}
async function prepare() {
  await wait(async () => (await desk.evaluate(() => window.setup.state())).desktop.fenceConfirmed);
  await desk.evaluate(() => window.setup.desktopScan());
  const state = (await desk.evaluate(() => window.setup.state())).desktop;
  // Only a user-created blank document is eligible for this live test.
  const target = state.windows.find(window => /\*?Latham native acceptance - Notepad$/.test(window.name)) ?? state.windows.find(window => /Untitled - Notepad$/.test(window.name));
  assert.ok(target, "Create an empty Untitled Notepad window before this acceptance test.");
  await desk.evaluate(id => window.setup.desktopPrepare(id), target.id);
  const bound = (await desk.evaluate(() => window.setup.state())).desktop;
  assert.equal(bound.bound, true, JSON.stringify(bound.last));
}
function pcm(file) {
  const buffer = readFileSync(file);
  for (let at = 12; at + 8 < buffer.length;) { const size = buffer.readUInt32LE(at + 4); if (buffer.toString("ascii", at, at + 4) === "data") return [...buffer.subarray(at + 8, at + 8 + size)]; at += 8 + size + size % 2; }
  throw new Error("missing_audio");
}
try {
  app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  await wait(() => app.context().pages().some(page => page.url() === "latham://app/index.html")); desk = app.context().pages().find(page => page.url() === "latham://app/index.html");
  await app.evaluate(() => { const request = globalThis.fetch; Reflect.set(globalThis, "fetch", async (...args) => { const response = await request(...args); Reflect.set(globalThis, "nativeSpeechHttpStatus", response.status); return response; }); });
  await desk.evaluate(() => window.setup.desktopPermission(true, false));
  await prepare();
  for (const text of ["focus editor", "inspect editor", "replace dictation with Latham native acceptance", "dictate verified", "correct that to corrected", "undo dictation"]) {
    await command(text);
  }
  // Keep all test edits inside the selected synthetic document.
  await command("replace dictation with Latham preview ready"); await command("undo dictation");
  if (process.argv.includes("--voice")) for (const mode of process.argv.includes("--cloud-only") ? ["cloud"] : process.argv.includes("--cloud") ? ["local", "cloud"] : ["local"]) {
    const settings = (await desk.evaluate(() => window.setup.state())).settings;
    await desk.evaluate(settings => window.setup.save(settings), { ...settings, mode, whisperExecutable: join(root, "local-ai/whisper/Release/whisper-cli.exe"), whisperModel: join(root, "local-ai/ggml-base.en.bin") });
    if (mode === "cloud") await desk.evaluate(() => window.setup.importEnvironmentKey());
    await prepare(); const audio = pcm(join(root, "speech-corpus/02.wav"));
    const controllerFocused = await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html"); window.show(); window.focus(); return window.isFocused(); });
    assert.equal(controllerFocused, true, "Latham must own foreground focus for the reviewed transcript insertion check.");
    const started = performance.now(); await desk.evaluate(async audio => { const id = await window.setup.beginTurn(); await window.setup.finishTurn(id, new Uint8Array(audio).buffer); }, audio);
    const speech = await desk.evaluate(() => window.setup.state());
    if (!speech.transcript) report.voice.push({ mode, outcome: "transcription_failed", error: speech.error, httpStatus: await app.evaluate(() => Reflect.get(globalThis, "nativeSpeechHttpStatus")), desktop: speech.desktop.result });
    assert.match(speech.transcript, /orchestral music/i, JSON.stringify({ mode, error: speech.error, desktop: speech.desktop.result })); assert.equal(speech.canInsertDesktopTranscript, true);
    await desk.evaluate(() => window.setup.desktopInsertTranscript("replace")); const result = (await desk.evaluate(() => window.setup.state())).desktop.last;
    report.voice.push({ mode, controllerFocused, outcome: result?.outcome, elapsedMs: Math.round(performance.now() - started) }); assert.equal(result?.outcome, "verified", result?.reason);
    await command("undo dictation");
  }
  await command("stop dictation");
  await desk.evaluate(() => window.setup.desktopOpen()); const launch = (await desk.evaluate(() => window.setup.state())).desktop.last;
  report.operations.push({ command: "open Notepad", ...launch }); assert.equal(launch?.outcome, "verified", launch?.reason);
  await desk.screenshot({ path: join(root, "phase3-desktop-preview.png"), fullPage: true });
  console.log(JSON.stringify(report));
} finally { const json = JSON.stringify(report, null, 2); writeFileSync(join(root, "native-live-acceptance.json"), json); writeFileSync(join(root, `native-live-${report.at.replaceAll(/[:.]/g, "-")}.json`), json); await app?.close(); }
