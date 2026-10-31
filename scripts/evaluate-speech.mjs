import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
await build({ entryPoints: ["packages/speech/src/providers.ts"], outfile: ".test-artifacts/providers.mjs", bundle: true, platform: "node", format: "esm", target: "node22" });
const { localTranscribe, cloudTranscribe } = await import(pathToFileURL(resolve(".test-artifacts/providers.mjs")).href + "?" + Date.now());
const root = resolve(".test-artifacts"), corpus = JSON.parse((await readFile(root + "/speech-corpus/corpus.json", "utf8")).replace(/^\uFEFF/, ""));
const model = process.argv.includes("--base") ? "base.en" : "tiny.en";
const speechThreads = Number(process.argv.find(arg => arg.startsWith("--threads="))?.slice(10) ?? 2);
const speechLanguage = process.argv.find(arg => arg.startsWith("--language="))?.slice(11) ?? "en";
const speechVocabulary = process.argv.includes("--vocabulary") ? "Latham, orchestral music, piano music" : "";
const words = text => text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/);
function distance(a, b) { let row = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); row = next; } return row[b.length]; }
const results = [];
for (const mode of process.argv.includes("--cloud") ? ["local", "cloud"] : ["local"]) {
  const key = mode === "cloud" ? parseEnv(await readFile(".env.local", "utf8")).GEMINI_API_KEY : null;
  for (const sample of corpus.samples) {
    const start = performance.now(); try {
      const wav = await readFile(root + "/speech-corpus/" + sample.file), signal = AbortSignal.timeout(60000);
      const transcript = mode === "cloud" ? await cloudTranscribe(wav, key, signal) : await localTranscribe(wav, root + "/local-ai/whisper/Release/whisper-cli.exe", root + `/local-ai/ggml-${model}.bin`, signal, { speechThreads, speechLanguage, speechVocabulary });
      results.push({ mode, reference: sample.reference, transcript, elapsedMs: Math.round(performance.now() - start), editDistance: distance(words(sample.reference), words(transcript)), referenceWords: words(sample.reference).length });
    } catch (error) { results.push({ mode, reference: sample.reference, error: error.message }); }
  }
}
const report = { at: new Date().toISOString(), model, source: corpus.source, voice: corpus.voice, results, summaries: ["local", "cloud"].filter(mode => results.some(item => item.mode === mode)).map(mode => { const rows = results.filter(item => item.mode === mode); return { mode, samples: rows.length, exact: rows.filter(item => item.editDistance === 0).length, failures: rows.filter(item => item.error).length, wordErrorRate: rows.reduce((sum, item) => sum + (item.editDistance ?? words(item.reference).length), 0) / rows.reduce((sum, item) => sum + (item.referenceWords ?? words(item.reference).length), 0) }; }) };
Object.assign(report, { speechThreads, speechLanguage, speechVocabulary });
await writeFile(root + `/speech-evaluation-${model}-${speechThreads}${speechVocabulary ? "-vocabulary" : ""}.json`, JSON.stringify(report, null, 2));
await writeFile(root + "/speech-evaluation.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report.summaries));
