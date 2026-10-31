import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(".test-artifacts/detector-corpus"), corpus = JSON.parse(readFileSync(root + "/corpus.json", "utf8").replace(/^\uFEFF/, ""));
export function pcm(file) {
  const wav = readFileSync(file); for (let at = 12; at + 8 <= wav.length;) { const length = wav.readUInt32LE(at + 4); if (wav.toString("ascii", at, at + 4) === "data") return wav.subarray(at + 8, at + 8 + length); at += 8 + length + length % 2; } throw Error("missing_pcm");
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [], samples = corpus.samples.map(sample => ({ ...sample, condition: "clean", audio: pcm(root + "/" + sample.file) }));
function mix(a, b, backgroundGain) { const result = Buffer.alloc(Math.max(a.length, b.length)); for (let at = 0; at < result.length; at += 2) result.writeInt16LE(Math.round(Math.max(-32768, Math.min(32767, (at < a.length ? a.readInt16LE(at) : 0) + backgroundGain * (at < b.length ? b.readInt16LE(at) : 0)))), at); return result; }
const background = pcm(root + "/david-4.wav");
for (const index of [0, 1]) { const sample = corpus.samples.find(sample => sample.file === `zira-${index}.wav`); samples.push({ ...sample, condition: "overlapping_background_voice", audio: mix(pcm(root + "/" + sample.file), background, 0.5) }); }
const tone = Buffer.alloc(64000); for (let at = 0; at < tone.length; at += 2) tone.writeInt16LE(Math.round(3000 * Math.sin(at / 2 * 2 * Math.PI * 440 / 16000)), at);
samples.push({ phrase: "silence", stop: false, wake: false, condition: "silence", audio: Buffer.alloc(64000) }, { phrase: "tone", stop: false, wake: false, condition: "tone", audio: tone });
// A digital replay is a spoofing probe, not a physical speaker/microphone test.
samples.push({ phrase: "replayed stop assistant", stop: true, wake: false, condition: "digital_playback", audio: pcm(root + "/zira-0.wav") });
for (const role of ["stop", "wake"]) {
  const child = spawn(resolve("dist/native/Latham.SpeechDetector.exe"), [role], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let ready = false, buffer = "", current, dead = false;
  child.stderr.resume(); child.on("exit", () => { dead = true; }); child.stdin.on("error", () => {});
  child.stdout.on("data", bytes => { buffer += bytes; let end; while ((end = buffer.indexOf("\n")) >= 0) { const event = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); if (event.kind === "ready") ready = true; if (event.kind === "failed") dead = true; if (event.kind === "match" && current) current.matches.push({ confidence: event.confidence, wallMs: Math.round(performance.now() - current.started), audioEndMs: event.audioEndMs }); } });
  try {
    const start = performance.now(); while (!ready && !dead && performance.now() - start < 10000) await sleep(50); if (!ready || dead) throw Error("detector_unavailable");
    let streamOffsetMs = 0;
    for (const { audio, ...sample } of samples) {
      current = { role, ...sample, expected: sample[role], matches: [], started: performance.now() };
      // Stream PCM at microphone speed; silence separates cases without resetting the grammar.
      const input = Buffer.concat([Buffer.alloc(16000), audio, Buffer.alloc(48000)]);
      for (let offset = 0; offset < input.length; offset += 4096) { if (dead) throw Error("detector_failed"); child.stdin.write(input.subarray(offset, offset + 4096)); await sleep(128); }
      results.push({ ...current, started: undefined, durationMs: audio.length / 32, detected: current.matches.length > 0, delayAfterRecognizedSpeechMs: current.matches[0] ? Math.round(current.matches[0].wallMs - (current.matches[0].audioEndMs - streamOffsetMs)) : null });
      streamOffsetMs += input.length / 32;
    }
  } finally { child.kill(); }
}
const summaries = ["stop", "wake"].map(role => { const rows = results.filter(row => row.role === role); return { role, positives: rows.filter(row => row.expected).length, misses: rows.filter(row => row.expected && !row.detected).length, negatives: rows.filter(row => !row.expected).length, falseMatches: rows.filter(row => !row.expected && row.detected).length }; });
const report = { at: new Date().toISOString(), source: corpus.source, thresholds: { stop: 0.55, wake: 0.75 }, summaries, results };
writeFileSync(resolve(".test-artifacts/detector-evaluation.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(summaries));
