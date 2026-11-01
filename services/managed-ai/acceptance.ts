import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { ServiceStore } from "./store";
import { managedService } from "./server";
import { managedPolicy } from "../../packages/contracts/src/managed";
import { wav } from "../../packages/speech/src/providers";

if (!process.argv.includes("--live")) throw new Error("explicit_live_flag_required");
const directory = mkdtempSync(resolve(".test-artifacts/phase8-live-"));
const store = new ServiceStore(join(directory, "service.sqlite"));
const service = managedService({ store, key: process.env.GEMINI_API_KEY ?? "", dailyRequests: 2, totalRequests: 2 });
await new Promise<void>(resolve => service.server.listen(0, "127.0.0.1", resolve));
const address = service.server.address(); if (!address || typeof address === "string") throw new Error("missing_address");
const origin = `http://127.0.0.1:${address.port}`;
const call = (path: string, body?: object, token?: string, method = "POST") => fetch(origin + path, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });
const results: { check: string; passed: boolean; elapsedMs: number }[] = [];
try {
  const invite = store.invite(2);
  const enrollment = await call("/v1/enroll", { invite: invite.invite, policy: managedPolicy }); assert.equal(enrollment.status, 200);
  const { token } = await enrollment.json() as { token: string };
  const selection = { kind: "select", instruction: "Choose Search", candidates: [{ id: "search", label: "Search", role: "button" }, { id: "cancel", label: "Cancel", role: "button" }] };
  let started = Date.now();
  let response = await call("/v1/infer", selection, token); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { candidateId: "search" });
  results.push({ check: "live_candidate_selection", passed: true, elapsedMs: Date.now() - started });
  const file = readFileSync(resolve(".test-artifacts/local-ai/jfk.wav"));
  assert.equal(file.readUInt16LE(22), 1); assert.equal(file.readUInt32LE(24), 16000); assert.equal(file.readUInt16LE(34), 16);
  let pcm: Buffer | undefined;
  for (let offset = 12; offset + 8 <= file.length;) { const size = file.readUInt32LE(offset + 4); if (file.toString("ascii", offset, offset + 4) === "data") { pcm = file.subarray(offset + 8, offset + 8 + size); break; } offset += 8 + size + size % 2; }
  assert.ok(pcm); started = Date.now();
  response = await call("/v1/infer", { kind: "transcribe", audio: wav(pcm).toString("base64") }, token); assert.equal(response.status, 200);
  const speech = await response.json() as { transcript: string }; assert.match(speech.transcript, /fellow americans/i);
  results.push({ check: "public_recording_transcription", passed: true, elapsedMs: Date.now() - started });
  assert.equal((await call("/v1/infer", selection, token)).status, 429);
  assert.equal(store.usage(token, Date.now()).used, 2);
  assert.equal((await call("/v1/account", { confirm: "delete" }, token, "DELETE")).status, 200);
  results.push({ check: "quota_and_deletion", passed: true, elapsedMs: 0 });
  writeFileSync(resolve(".test-artifacts/phase8-live-managed.json"), JSON.stringify({ at: new Date().toISOString(), results, metrics: service.metrics(), billing: "disabled", retainedContent: false }, null, 2));
  console.log(JSON.stringify({ results, billing: "disabled" }));
} finally { await service.stop(); store.close(); }
