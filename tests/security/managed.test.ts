import { afterEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ServiceStore } from "../../services/managed-ai/store";
import { managedService, parseInference } from "../../services/managed-ai/server";
import { managedOrigin, managedPolicy } from "../../packages/contracts/src/managed";
import { ManagedClient } from "../../apps/desktop/src/main/managed-client";
import { ProviderStore } from "../../apps/desktop/src/main/provider-store";
import { Voice } from "../../apps/desktop/src/main/voice";
import { wav } from "../../packages/speech/src/providers";

const encryption = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from([...Buffer.from(value)].map(b => b ^ 0x77)), decryptString: (value: Buffer) => Buffer.from([...value].map(b => b ^ 0x77)).toString() };
const candidates = [{ id: "search", label: "Search", role: "button" }, { id: "cancel", label: "Cancel", role: "button" }];
const selection = { kind: "select", instruction: "Choose Search", candidates };
const providerResponse = (text = '{"candidateId":"search"}') => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }] });
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const clean of cleanup.splice(0)) await clean(); vi.unstubAllGlobals(); });
async function service(options: { daily?: number; total?: number; request?: typeof fetch } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "latham-service-")), store = new ServiceStore(join(directory, "accounts.sqlite"));
  const request = options.request ?? vi.fn(async (_url, init) => {
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("SERVER_ONLY_KEY");
    expect(String(init?.body)).not.toContain("SERVER_ONLY_KEY");
    return providerResponse(String(init?.body).includes("audio/wav") ? "piano music" : undefined);
  }) as typeof fetch;
  const server = managedService({ store, key: "SERVER_ONLY_KEY", dailyRequests: options.daily ?? 100, totalRequests: options.total ?? 1000, request });
  await new Promise<void>(resolve => server.server.listen(0, "127.0.0.1", resolve));
  const address = server.server.address(); if (!address || typeof address === "string") throw new Error("missing_address");
  const origin = `http://127.0.0.1:${address.port}`;
  cleanup.push(async () => { await server.stop(); store.close(); });
  const call = (path: string, method = "GET", body?: object, token?: string) => fetch(origin + path, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  async function enroll(limit = 20) {
    const invitation = store.invite(limit);
    const response = await call("/v1/enroll", "POST", { invite: invitation.invite, policy: managedPolicy });
    expect(response.status).toBe(200);
    return { ...await response.json() as { token: string; accountId: string; expires: number }, invite: invitation.invite };
  }
  return { store, server, origin, call, enroll, request, directory };
}
describe("managed service authority and retention", () => {
  test("single-use invitations, explicit policy and authentication never expose provider credentials", async () => {
    const s = await service(), account = await s.enroll();
    expect((await s.call("/v1/enroll", "POST", { invite: account.invite, policy: managedPolicy })).status).toBe(401);
    expect((await s.call("/v1/infer", "POST", selection)).status).toBe(401);
    expect((await s.call("/v1/infer", "POST", selection, "a".repeat(64))).status).toBe(401);
    const result = await s.call("/v1/infer", "POST", selection, account.token);
    expect(await result.json()).toEqual({ candidateId: "search" }); expect(result.headers.get("cache-control")).toBe("no-store");
    const usage = await (await s.call("/v1/account", "GET", undefined, account.token)).json();
    expect(usage).toMatchObject({ accountId: account.accountId, used: 1, billing: "disabled", active: true });
    expect(JSON.stringify(usage)).not.toContain("SERVER_ONLY_KEY");
    const disk = readFileSync(join(s.directory, "accounts.sqlite")).toString("utf8");
    for (const secret of [account.token, account.invite, "SERVER_ONLY_KEY", selection.instruction, "piano music"]) expect(disk).not.toContain(secret);
  });
  test("schema rejects extra tools, remote URLs, images, oversized/invalid WAV and extra candidate data before spending", async () => {
    const s = await service(), a = await s.enroll();
    const audio = wav(new Uint8Array(3200)); expect(parseInference({ kind: "transcribe", audio: audio.toString("base64") }).kind).toBe("transcribe");
    expect(parseInference({ kind: "transcribe", audio: wav(new Uint8Array(960000)).toString("base64") }).kind).toBe("transcribe");
    const malformed = Buffer.from(audio); malformed.writeUInt32LE(48000, 24);
    for (const input of [{ ...selection, url: "https://example.com" }, { ...selection, candidates: [{ ...candidates[0], value: "PRIVATE" }] }, { kind: "visual", images: [] }, { kind: "transcribe", audio: malformed.toString("base64") }, { kind: "transcribe", audio: "abcd" }, { kind: "transcribe", audio: "A".repeat(1280064) }]) {
      expect((await s.call("/v1/infer", "POST", input, a.token)).status).toBe(400);
    }
    expect(s.request).not.toHaveBeenCalled();
    const usage = s.store.usage(a.token, Date.now()); expect(usage.used).toBe(0);
    expect((await fetch(s.origin + "/health", { headers: { Origin: "https://untrusted.example" } })).status).toBe(400);
  });
  test("per-account and service-wide reservations survive restart and account deletion", async () => {
    const directory = mkdtempSync(join(tmpdir(), "latham-quota-")), path = join(directory, "db.sqlite");
    let store = new ServiceStore(path), now = Date.now();
    const invite = store.invite(1, now), a = store.enroll(invite.invite, managedPolicy, now);
    store.reserve(a.token, now, 2, 2);
    expect(() => store.reserve(a.token, now, 2, 2)).toThrow("quota_or_rate_limit");
    store.close(); store = new ServiceStore(path);
    try {
      expect(store.usage(a.token, now).used).toBe(1);
      store.remove(a.token, now);
      const b = store.enroll(store.invite(10, now).invite, managedPolicy, now);
      store.reserve(b.token, now, 2, 2); now += 86400000;
      expect(() => store.reserve(b.token, now, 2, 2)).toThrow("quota_or_rate_limit");
    } finally { store.close(); }
  });
  test("outage/refusal responses are sanitized and failed reservations are not refunded", async () => {
    const request = vi.fn(async () => new Response("PRIVATE_UPSTREAM_ERROR_SECRET", { status: 500 }));
    const s = await service({ request }), a = await s.enroll(1);
    expect(await (await s.call("/v1/infer", "POST", selection, a.token)).json()).toEqual({ error: "provider_unavailable" });
    expect((await s.call("/v1/infer", "POST", selection, a.token)).status).toBe(429);
    expect(request).toHaveBeenCalledTimes(1); expect(s.store.usage(a.token, Date.now()).used).toBe(1);
    expect(s.server.metrics()).toEqual({ admitted: 1, succeeded: 0, failed: 1, active: 0 });
  });
  test("concurrent account inference cannot exceed budgets or duplicate one reservation", async () => {
    let release!: (response: Response) => void;
    const s = await service({ request: vi.fn(() => new Promise<Response>(resolve => { release = resolve; })) }), a = await s.enroll();
    const first = s.call("/v1/infer", "POST", selection, a.token);
    await vi.waitFor(() => expect(s.server.metrics().active).toBe(1));
    expect((await s.call("/v1/infer", "POST", selection, a.token)).status).toBe(429);
    release(providerResponse()); expect((await first).status).toBe(200); expect(s.store.usage(a.token, Date.now()).used).toBe(1);
  });
  test("cancellation aborts active work and deletion removes identity but preserves anonymous spend guard", async () => {
    let release!: (response: Response) => void;
    const s = await service({ request: vi.fn(() => new Promise<Response>(resolve => { release = resolve; })) }), a = await s.enroll();
    const pending = s.call("/v1/infer", "POST", selection, a.token);
    await vi.waitFor(() => expect(s.server.metrics().active).toBe(1));
    expect((await s.call("/v1/account/cancel", "POST", { confirm: "cancel" }, a.token)).status).toBe(200);
    release(providerResponse()); expect((await pending).status).toBe(503);
    expect((await s.call("/v1/infer", "POST", selection, a.token)).status).toBe(403);
    expect((await s.call("/v1/account", "DELETE", { confirm: "delete" }, a.token)).status).toBe(200);
    expect((await s.call("/v1/account", "GET", undefined, a.token)).status).toBe(401);
    expect(readFileSync(join(s.directory, "accounts.sqlite")).toString("utf8")).not.toContain(a.accountId);
  });
  test("operator recovery invalidates all prior sessions, expiry and pruning fail closed", () => {
    const store = new ServiceStore(":memory:"), now = Date.now();
    try {
      const invite = store.invite(20, now), a = store.enroll(invite.invite, managedPolicy, now);
      const replacement = store.invite(10, now, a.accountId);
      expect(() => store.authenticate(a.token, now)).toThrow("authentication_failed");
      const b = store.enroll(replacement.invite, managedPolicy, now);
      expect(() => store.authenticate(b.token, b.expires)).toThrow("authentication_failed");
      store.prune(b.expires); expect(() => store.invite(20, b.expires, b.accountId)).toThrow("account_missing");
    } finally { store.close(); }
  });
  test("invalid service caps cannot start a server", () => {
    const store = new ServiceStore(":memory:");
    try { for (const dailyRequests of [0, -1, NaN, 1.5, 1000001]) expect(() => managedService({ store, key: "key", dailyRequests, totalRequests: 100 })).toThrow("service_configuration_required"); }
    finally { store.close(); }
  });
  test("account minute and enrollment limits prevent additional provider admissions", async () => {
    const s = await service(), a = await s.enroll();
    for (let i = 0; i < 6; i++) expect((await s.call("/v1/infer", "POST", selection, a.token)).status).toBe(200);
    expect((await s.call("/v1/infer", "POST", selection, a.token)).status).toBe(429);
    expect(s.store.usage(a.token, Date.now()).used).toBe(6);
    for (let i = 0; i < 6; i++) await s.call("/v1/enroll", "POST", { invite: "a".repeat(64), policy: managedPolicy });
    expect((await s.call("/v1/enroll", "POST", { invite: "a".repeat(64), policy: managedPolicy })).status).toBe(429);
  });
  test("future service schema is refused without resetting it", () => {
    const path = join(mkdtempSync(join(tmpdir(), "latham-future-schema-")), "db.sqlite"), db = new DatabaseSync(path);
    db.exec("PRAGMA user_version=2"); db.close();
    expect(() => new ServiceStore(path)).toThrow("service_schema_too_new");
    const reopened = new DatabaseSync(path); expect(reopened.prepare("PRAGMA user_version").get()?.user_version).toBe(2); reopened.close();
  });
});
describe("managed desktop route", () => {
  test("origin validation rejects unsafe schemes, credentials, paths and production loopback HTTP", () => {
    expect(managedOrigin("http://127.0.0.1:1234", true)).toBe("http://127.0.0.1:1234");
    for (const origin of ["http://localhost:1234", "file:///C:/", "https://u:p@example.com", "https://example.com/api", "https://example.com?key=x", "https://example.com#x"]) expect(() => managedOrigin(origin, true)).toThrow();
    expect(() => managedOrigin("http://127.0.0.1:1234")).toThrow();
  });
  test("explicit consent, encrypted persistence, no provider key and no automatic route switch", async () => {
    const s = await service(), directory = mkdtempSync(join(tmpdir(), "latham-managed-client-"));
    const storage = new ProviderStore(directory, encryption), client = new ManagedClient(directory, encryption, true, () => {});
    const invite = s.store.invite(20);
    await expect(client.signIn({ origin: s.origin, invite: invite.invite, consent: "no" })).rejects.toThrow("managed_consent_required");
    await client.signIn({ origin: s.origin, invite: invite.invite, consent: managedPolicy });
    expect(client.state.signedIn).toBe(true); expect(storage.settings.mode).toBe("local");
    const disk = readFileSync(join(directory, "managed-session.bin")); expect(disk.toString()).not.toContain(s.origin);
    const restarted = new ManagedClient(directory, encryption, true, () => {}); expect(restarted.state.accountId).toBe(invite.accountId);
    const voice = new Voice(storage, () => {}, restarted); voice.save({ ...storage.settings, mode: "managed" });
    expect((await voice.test()).candidateId).toBe("search"); expect(storage.keyStored).toBe(false);
    const id = voice.begin(); await voice.finish(id, new Int16Array(1600).fill(1000).buffer); expect(voice.transcript).toBe("piano music");
    await restarted.account("refresh"); expect(restarted.state.usage?.used).toBe(2);
    await restarted.account("sign_out"); expect(restarted.state.signedIn).toBe(false); expect(readdirSync(directory)).not.toContain("managed-session.bin");
    expect(() => voice.prepareSession()).toThrow("managed_sign_in_required");
  });
  test("Stop discards late managed transcription and never falls back", async () => {
    let release!: (response: Response) => void;
    const s = await service({ request: vi.fn(() => new Promise<Response>(resolve => { release = resolve; })) });
    const directory = mkdtempSync(join(tmpdir(), "latham-managed-stop-")), client = new ManagedClient(directory, encryption, true, () => {});
    await client.signIn({ origin: s.origin, invite: s.store.invite(20).invite, consent: managedPolicy });
    const storage = new ProviderStore(directory, encryption), voice = new Voice(storage, () => {}, client); voice.save({ ...storage.settings, mode: "managed" });
    const id = voice.begin(), pending = voice.finish(id, new Int16Array(1600).fill(1000).buffer);
    await vi.waitFor(() => expect(s.server.metrics().active).toBe(1)); voice.cancel(); client.stop(); release(providerResponse("late private words")); await pending;
    expect(voice.transcript).toBe(""); expect(voice.status).toBe("idle"); expect(s.request).toHaveBeenCalledTimes(1);
  });
  test("unavailable vault, offline sign-out and local forget do not claim server deletion", async () => {
    const directory = mkdtempSync(join(tmpdir(), "latham-managed-offline-"));
    const unavailable = new ManagedClient(directory, { ...encryption, isEncryptionAvailable: () => false }, true, () => {});
    await expect(unavailable.signIn({ origin: "http://127.0.0.1:1234", invite: "a".repeat(64), consent: managedPolicy })).rejects.toThrow("os_vault_unavailable");
    const s = await service(), invitation = s.store.invite(20), client = new ManagedClient(directory, encryption, true, () => {});
    await client.signIn({ origin: s.origin, invite: invitation.invite, consent: managedPolicy });
    const offline = new ManagedClient(directory, encryption, true, () => {}, vi.fn(async () => { throw new Error("offline"); }));
    await offline.account("sign_out"); expect(offline.state.signedIn).toBe(true); expect(offline.state.message).toContain("unconfirmed");
    await offline.account("forget"); expect(offline.state.signedIn).toBe(false); expect(offline.state.message).toContain("does not revoke");
  });
});
