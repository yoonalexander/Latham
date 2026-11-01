import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
await build({ entryPoints: ["packages/speech/src/providers.ts", "packages/contracts/src/visual.ts"], outdir: ".test-artifacts/visual-eval", bundle: true, platform: "node", format: "esm", target: "node22" });
const { selectVisual } = await import(pathToFileURL(resolve(".test-artifacts/visual-eval/speech/src/providers.js")));
const { visualMatches } = await import(pathToFileURL(resolve(".test-artifacts/visual-eval/contracts/src/visual.js")));
const corpus = JSON.parse(readFileSync(".test-artifacts/visual-captured-fixture.json", "utf8")); const candidates = corpus.candidates;
const cases = [
  ["text PIANO", [0]], ["text VIOLIN", [1]], ["text JAZZ", [2]], ["text NEWS", [3]], ["text ABSENT", []],
  ["topmost thumbnail", [0, 1]], ["leftmost thumbnail", [0, 2]], ["bottommost thumbnail", [2, 3]]
];
const results = cases.map(([query, indexes]) => { const matches = visualMatches(query, candidates), expected = indexes.map(i => candidates[i].id); return { route: "ocr", query, expected: expected.length === 1 ? "unique" : expected.length ? "clarify" : "abstain", pass: JSON.stringify(matches.sort()) === JSON.stringify(expected.sort()) }; });
if (process.argv.includes("--cloud")) {
  const key = parseEnv(readFileSync(".env.local", "utf8")).GEMINI_API_KEY;
  const tasks = [["the blue circle", [0]], ["the red square", [1]], ["the green circle", [2]], ["the orange square", [3]], ["a purple triangle", []], ["a circle", [0, 2]], ["a square", [1, 3]], ["the image with the word VIOLIN", [1]]];
  for (const [query, indexes] of tasks) {
    const start = performance.now();
    try { const ids = await selectVisual({ mode: "cloud", key }, query, candidates.map(c => ({ ...c, text: "" })), AbortSignal.timeout(20000)), expected = indexes.map(i => candidates[i].id); results.push({ route: "cloud", query, expected: expected.length > 1 ? "clarify" : expected.length ? "unique" : "abstain", pass: JSON.stringify([...ids].sort()) === JSON.stringify(expected.sort()), abstained: ids.length === 0, clarified: ids.length > 1, elapsedMs: Math.round(performance.now() - start) }); }
    catch (error) { results.push({ route: "cloud", query, pass: false, error: ["provider_unavailable", "quota_or_rate_limit", "authentication_failed", "provider_abstained", "invalid_selection"].includes(error.message) ? error.message : "visual_provider_failed", elapsedMs: Math.round(performance.now() - start) }); }
    await new Promise(resolve => setTimeout(resolve, 4000));
  }
}
const summaries = ["ocr", "cloud"].map(route => { const rows = results.filter(r => r.route === route); return { route, tasks: rows.length, correct: rows.filter(r => r.pass).length, failures: rows.filter(r => r.error).length }; }).filter(r => r.tasks);
const report = { at: new Date().toISOString(), source: corpus.source, scope: "four synthetic text/color/icon images in a 2x2 layout; no real-photo or face accuracy claim", results, summaries };
const json = JSON.stringify(report, null, 2); writeFileSync(".test-artifacts/visual-evaluation.json", json); writeFileSync(`.test-artifacts/visual-evaluation-${report.at.replaceAll(/[:.]/g, "-")}.json`, json); console.log(JSON.stringify(summaries));
if (results.some(r => !r.pass)) process.exitCode = 1;
