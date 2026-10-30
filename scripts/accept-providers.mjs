import { _electron } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";
mkdirSync(".test-artifacts", { recursive: true });
const directory = mkdtempSync(resolve(".test-artifacts/provider-app-")), local = resolve(".test-artifacts/local-ai");
const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && key !== "ELECTRON_RUN_AS_NODE"));
const bytes = readFileSync(local + "/jfk.wav"); let offset = 12, audio;
while (offset + 8 <= bytes.length) { const length = bytes.readUInt32LE(offset + 4); if (bytes.toString("ascii", offset, offset + 4) === "data") { audio = [...bytes.subarray(offset + 8, offset + 8 + length)]; break; } offset += 8 + length + length % 2; }
assert.ok(audio);
const results = [];
async function launch() {
  const app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  for (let count = 0; count < 100; count++) { const page = app.context().pages().find(page => page.url() === "latham://app/index.html"); if (page) return { app, page }; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error("app_start_timeout");
}
for (const mode of ["cloud", "local"]) {
  const { app, page } = await launch();
  try {
    await page.evaluate(async ({ mode, local }) => { const state = await window.setup.state(); await window.setup.save({ ...state.settings, mode, whisperExecutable: local + "/whisper/Release/whisper-cli.exe", whisperModel: local + "/ggml-tiny.en.bin", ollamaModel: "qwen2.5:1.5b" }); if (mode === "cloud") await window.setup.importEnvironmentKey(); }, { mode, local });
    if (mode === "cloud") { const key = parseEnv(readFileSync(".env.local", "utf8")).GEMINI_API_KEY; assert.equal(readFileSync(join(directory, "provider-key.bin")).includes(Buffer.from(key)), false); }
    const decision = await page.evaluate(() => window.setup.testDecision()); assert.equal(decision.candidateId, "search");
    const begin = await page.evaluate(() => window.setup.beginTurn());
    await page.evaluate(async ({ begin, audio }) => window.setup.finishTurn(begin, Uint8Array.from(audio).buffer), { begin, audio });
    const state = await page.evaluate(() => window.setup.state()); assert.equal(state.error, ""); assert.match(state.transcript, /fellow americans/i); assert.equal(state.voice, "idle"); assert.equal(state.chromeActive, false);
    results.push({ mode, transcriptUsable: true, decisionPassed: true, osVaultProtected: mode === "cloud", utteranceFinalizedInApp: true });
    await page.evaluate(() => window.latham.stop()); assert.equal((await page.evaluate(() => window.setup.state())).transcript, "");
  } finally { await app.close(); }
}
const { app, page } = await launch();
try { const state = await page.evaluate(() => window.setup.state()); assert.equal(state.settings.mode, "local"); assert.equal(state.keyStored, true); assert.equal(state.voice, "idle"); assert.equal(state.chromeActive, false); } finally { await app.close(); }
writeFileSync(".test-artifacts/app-provider-acceptance.json", JSON.stringify({ at: new Date().toISOString(), restart: "paused_with_saved_settings_and_key", results }, null, 2));
console.log("In-app cloud/local final transcripts, decision setup, protected key storage and restart passed.");
