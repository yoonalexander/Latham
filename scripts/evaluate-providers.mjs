import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import os from "node:os";
await mkdir(".test-artifacts", { recursive: true });
await build({ entryPoints: ["packages/speech/src/providers.ts"], outfile: ".test-artifacts/providers.mjs", bundle: true, platform: "node", format: "esm", target: "node22" });
const { localTranscribe, cloudTranscribe, selectCandidate, cloudModel } = await import(pathToFileURL(resolve(".test-artifacts/providers.mjs")).href + "?" + Date.now());
const root = resolve(".test-artifacts/local-ai"), signal = () => AbortSignal.timeout(60000);
const localModel = process.argv.find(arg => arg.startsWith("--model="))?.slice(8) ?? "qwen2.5:0.5b";
const audio = await readFile(root + "/jfk.wav");
const results = { at: new Date().toISOString(), hardware: { cpu: os.cpus()[0].model, threads: os.cpus().length, ramBytes: os.totalmem() }, cloudModel, localModel, speech: [], decisions: [] };
for (const mode of process.argv.includes("--cloud") ? ["local", "cloud"] : ["local"]) {
  if (mode === "cloud") { process.loadEnvFile(".env.local"); if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing"); }
  let start = performance.now();
  try {
    const text = mode === "cloud" ? await cloudTranscribe(audio, process.env.GEMINI_API_KEY, signal()) : await localTranscribe(audio, root + "/whisper/Release/whisper-cli.exe", root + "/ggml-tiny.en.bin", signal());
    results.speech.push({ mode, elapsedMs: Math.round(performance.now() - start), usable: /fellow americans/i.test(text) && /country/i.test(text), words: text.split(/\s+/).length });
  } catch (error) { results.speech.push({ mode, error: error.message }); }
  const cases = [
    { name: "unique", instruction: "Choose the Search button", candidates: [{ id: "a", label: "Search", role: "button" }, { id: "b", label: "Cancel", role: "button" }], expected: "a" },
    { name: "ambiguous", instruction: "Choose Apply filter", candidates: [{ id: "a", label: "Apply filter", role: "button" }, { id: "b", label: "Apply filter", role: "button" }], expected: null },
    { name: "missing", instruction: "Choose Delete account", candidates: [{ id: "a", label: "Search", role: "button" }], expected: null }
  ];
  for (const item of cases) {
    start = performance.now();
    try { const value = await selectCandidate(mode === "cloud" ? { mode, key: process.env.GEMINI_API_KEY } : { mode, model: localModel }, item.instruction, item.candidates, signal()); results.decisions.push({ mode, case: item.name, elapsedMs: Math.round(performance.now() - start), pass: value.candidateId === item.expected }); }
    catch (error) { results.decisions.push({ mode, case: item.name, error: error.message }); }
  }
}
delete process.env.GEMINI_API_KEY;
await writeFile(".test-artifacts/provider-evaluation.json", JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results, null, 2));
if (results.speech.some(item => !item.usable) || results.decisions.some(item => !item.pass)) process.exitCode = 1;
