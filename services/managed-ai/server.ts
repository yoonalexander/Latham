import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { record } from "../../packages/contracts/src/index";
import { managedPolicy } from "../../packages/contracts/src/managed";
import { cloudTranscribe, selectCandidate, validateCandidates, type Fetch } from "../../packages/speech/src/providers";
import type { Candidate } from "../../packages/contracts/src/setup";
import { ServiceStore } from "./store";

export type ServiceConfig = { store: ServiceStore; key: string; dailyRequests: number; totalRequests: number; request?: Fetch; now?: () => number };
const allowedErrors = new Set(["authentication_failed", "quota_or_rate_limit", "service_cancelled", "provider_unavailable", "provider_abstained", "no_usable_transcript", "invalid_selection", "invalid_provider_response", "model_unavailable", "invalid_request", "invalid_audio", "invalid_candidates", "invalid_instruction", "service_busy", "cancelled"]);
const status = (code: string): number => code === "authentication_failed" ? 401 : code === "service_cancelled" ? 403 : code === "quota_or_rate_limit" || code === "service_busy" ? 429 : code.startsWith("invalid_") ? 400 : 503;
function reply(response: ServerResponse, code: number, value: unknown): void {
  if (!response.destroyed && !response.writableEnded) response.writeHead(code, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" }).end(JSON.stringify(value));
}
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers["content-type"] !== "application/json" || request.headers["content-encoding"]) throw new Error("invalid_request");
  const chunks: Buffer[] = []; let size = 0;
  const deadline = setTimeout(() => request.destroy(), 15000);
  try { for await (const chunk of request) { size += chunk.length; if (size > 1300000) throw new Error("invalid_request"); chunks.push(Buffer.from(chunk)); } }
  finally { clearTimeout(deadline); }
  let value: unknown; try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("invalid_request"); }
  if (!record(value)) throw new Error("invalid_request"); return value;
}
export function parseInference(value: Record<string, unknown>): { kind: "transcribe"; audio: Buffer } | { kind: "select"; instruction: string; candidates: Candidate[] } {
  if (value.kind === "transcribe" && Object.keys(value).length === 2 && typeof value.audio === "string" && value.audio.length <= 1280060 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.audio)) {
    const audio = Buffer.from(value.audio, "base64"), length = audio.length - 44;
    // Only Latham's bounded 16 kHz mono PCM WAV. No compressed/container parser.
    if (length < 3200 || length > 960000 || length % 2 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.readUInt32LE(4) !== length + 36 || audio.toString("ascii", 8, 16) !== "WAVEfmt " || audio.readUInt32LE(16) !== 16 || audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1 || audio.readUInt32LE(24) !== 16000 || audio.readUInt32LE(28) !== 32000 || audio.readUInt16LE(32) !== 2 || audio.readUInt16LE(34) !== 16 || audio.toString("ascii", 36, 40) !== "data" || audio.readUInt32LE(40) !== length) throw new Error("invalid_audio");
    return { kind: "transcribe", audio };
  }
  if (value.kind === "select" && Object.keys(value).length === 3 && typeof value.instruction === "string" && value.instruction.trim() && value.instruction.length <= 2000) {
    validateCandidates(value.candidates as Candidate[]);
    if ((value.candidates as object[]).some(c => Object.keys(c).sort().join(",") !== "id,label,role")) throw new Error("invalid_candidates");
    return { kind: "select", instruction: value.instruction, candidates: value.candidates as Candidate[] };
  }
  throw new Error("invalid_request");
}
export function managedService(config: ServiceConfig) {
  if (!config.key || ![config.dailyRequests, config.totalRequests].every(n => Number.isSafeInteger(n) && n > 0 && n <= 1000000)) throw new Error("service_configuration_required");
  const now = config.now ?? Date.now, active = new Map<string, AbortController>();
  const accountRate = new Map<string, number>();
  let windowStart = now(), requests = 0, authRequests = 0, inFlight = 0;
  const counts = { admitted: 0, succeeded: 0, failed: 0 };
  const abortAccount = (id: string): void => { active.get(id)?.abort(); };
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 15000, headersTimeout: 10000 }, async (request, response) => {
    inFlight++;
    let reserved: string | null = null; let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      if (now() - windowStart >= 60000) { requests = 0; authRequests = 0; accountRate.clear(); windowStart = now(); config.store.prune(now()); }
      if (++requests > 120 || inFlight > 8) throw new Error("quota_or_rate_limit");
      // Native desktop clients have no Origin/cookies. Browser and cross-site clients are excluded.
      if (request.headers.origin || request.headers.cookie || request.headers["transfer-encoding"] || !["GET", "POST", "DELETE"].includes(request.method ?? "")) throw new Error("invalid_request");
      const path = request.url;
      if (path === "/health" && request.method === "GET") { reply(response, 200, { ready: true, policy: managedPolicy }); return; }
      if (path === "/v1/enroll" && request.method === "POST") {
        if (++authRequests > 6) throw new Error("quota_or_rate_limit");
        const input = await body(request);
        if (Object.keys(input).length !== 2 || typeof input.invite !== "string" || input.policy !== managedPolicy) throw new Error("invalid_request");
        reply(response, 200, config.store.enroll(input.invite, input.policy, now())); return;
      }
      if (++authRequests > 60) throw new Error("quota_or_rate_limit");
      const auth = request.headers.authorization;
      const token = typeof auth === "string" && /^Bearer [a-f0-9]{64}$/.test(auth) ? auth.slice(7) : "";
      const account = config.store.authenticate(token, now());
      if (path === "/v1/account" && request.method === "GET") { reply(response, 200, config.store.usage(token, now())); return; }
      if (path === "/v1/session" && request.method === "DELETE") { abortAccount(account.id); config.store.signOut(token); reply(response, 200, { ok: true }); return; }
      if (path === "/v1/account/cancel" && request.method === "POST") {
        const input = await body(request); if (Object.keys(input).length !== 1 || input.confirm !== "cancel") throw new Error("invalid_request");
        config.store.cancel(token, now()); abortAccount(account.id); reply(response, 200, { ok: true }); return;
      }
      if (path === "/v1/account" && request.method === "DELETE") {
        const input = await body(request); if (Object.keys(input).length !== 1 || input.confirm !== "delete") throw new Error("invalid_request");
        config.store.remove(token, now()); abortAccount(account.id); reply(response, 200, { ok: true }); return;
      }
      if (path !== "/v1/infer" || request.method !== "POST") throw new Error("invalid_request");
      if ((accountRate.get(account.id) ?? 0) >= 6 || (!accountRate.has(account.id) && accountRate.size >= 1024)) throw new Error("quota_or_rate_limit");
      if (active.size >= 2 || active.has(account.id)) throw new Error("service_busy");
      const input = parseInference(await body(request));
      // Recheck after reading the body; parallel requests cannot share a reservation.
      if (active.size >= 2 || active.has(account.id)) throw new Error("service_busy");
      if ((accountRate.get(account.id) ?? 0) >= 6) throw new Error("quota_or_rate_limit");
      reserved = config.store.reserve(token, now(), config.dailyRequests, config.totalRequests);
      accountRate.set(reserved, (accountRate.get(reserved) ?? 0) + 1);
      const abort = new AbortController(); active.set(reserved, abort); counts.admitted++;
      deadline = setTimeout(() => abort.abort(), 45000);
      response.once("close", () => { if (!response.writableEnded) abort.abort(); });
      const result = input.kind === "transcribe" ? { transcript: await cloudTranscribe(input.audio, config.key, abort.signal, config.request) } : await selectCandidate({ mode: "cloud", key: config.key }, input.instruction, input.candidates, abort.signal, config.request);
      abort.signal.throwIfAborted();
      // Account/session deletion during a provider call cannot deliver a late answer.
      const current = config.store.authenticate(token, now()); if (current.active !== 1) throw new Error("service_cancelled");
      counts.succeeded++; reply(response, 200, result);
    } catch (error) {
      if (reserved) counts.failed++;
      const message = error instanceof Error && allowedErrors.has(error.message) ? error.message : "provider_unavailable";
      reply(response, status(message), { error: message });
    } finally { clearTimeout(deadline); if (reserved) active.delete(reserved); inFlight = Math.max(0, inFlight - 1); }
  });
  server.maxConnections = 16;
  server.keepAliveTimeout = 2000;
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
  return { server, metrics: () => ({ ...counts, active: active.size }), stop: () => { for (const abort of active.values()) abort.abort(); server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); } };
}
