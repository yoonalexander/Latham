import { describe, test, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "node:net";
import { providerDefaults, parseChromeCommand, parseProviderSettings } from "../../packages/contracts/src/setup";
import { boundedJson, cloudTranscribe, selectCandidate, validateSelection, wav } from "../../packages/speech/src/providers";
import { ProviderStore } from "../../apps/desktop/src/main/provider-store";
import { Voice } from "../../apps/desktop/src/main/voice";
import { ChromeBridge, extensionId, frame, FrameReader } from "../../apps/desktop/src/main/native-bridge";

function store() {
  const directory = mkdtempSync(join(tmpdir(), "latham-provider-test-"));
  const encryption = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from([...Buffer.from(value)].map(byte => byte ^ 0x77)), decryptString: (value: Buffer) => Buffer.from([...value].map(byte => byte ^ 0x77)).toString() };
  return new ProviderStore(directory, encryption);
}
const candidates = [{ id: "search", label: "Search", role: "button" }];
describe("provider boundaries", () => {
  test("settings fail closed and deterministic shortcuts reject arbitrary schemes and origins", () => {
    expect(parseProviderSettings(providerDefaults).mode).toBe("local");
    for (const input of [{ ...providerDefaults, mode: "auto" }, { ...providerDefaults, ollamaModel: "qwen-cloud" }, { ...providerDefaults, endpoint: "https://example.com" }]) expect(() => parseProviderSettings(input)).toThrow();
    expect(parseChromeCommand("new tab")).toEqual({ kind: "new_tab" });
    expect(parseChromeCommand("open https://www.google.com/search?q=music").kind).toBe("navigate");
    for (const command of ["open javascript:alert(1)", "open file:///C:/", "open https://www.google.com.attacker.com", "open https://user@www.google.com", "delete tab", "click Search"]) expect(() => parseChromeCommand(command)).toThrow();
  });
  test("key ciphertext survives restart; unavailable OS encryption has no plaintext fallback", () => {
    const first = store(), secret = "AIza_TEST_SECRET_1234567890"; first.setKey(secret);
    expect(readFileSync(join(first.directory, "provider-key.bin"), "utf8")).not.toContain(secret);
    expect(first.key()).toBe(secret); expect(first.keyStored).toBe(true);
    first.removeKey(); expect(first.keyStored).toBe(false);
    const unavailable = new ProviderStore(first.directory, { isEncryptionAvailable: () => false, encryptString: vi.fn(), decryptString: vi.fn() });
    expect(() => unavailable.setKey(secret)).toThrow("os_vault_unavailable");
    expect(readdirSync(first.directory)).not.toContain("provider-key.bin");
  });
  test("bounded output, exact candidate IDs, abstention, and schema failures", async () => {
    expect(validateSelection({ candidateId: null }, candidates)).toEqual({ candidateId: null });
    for (const value of [{ candidateId: "invented" }, { candidateId: "search", code: "run" }, {}, "search"]) expect(() => validateSelection(value, candidates)).toThrow();
    await expect(boundedJson(new Response("x".repeat(66000)))).rejects.toThrow("invalid_provider_response");
    for (const [status, error] of [[401, "authentication_failed"], [429, "quota_or_rate_limit"], [500, "provider_unavailable"]] as const) await expect(boundedJson(new Response("PRIVATE_ERROR_BODY", { status }))).rejects.toThrow(error);
  });
  test("local route only calls loopback and never falls back to Gemini", async () => {
    const urls: string[] = [];
    const request = vi.fn(async (url: string | URL | Request) => { urls.push(String(url)); return Response.json(String(url).endsWith("/show") ? { model_info: {} } : { done: true, message: { content: '{"candidateId":"search"}' } }); }) as unknown as typeof fetch;
    expect(await selectCandidate({ mode: "local", model: "qwen2.5:0.5b" }, "Search", candidates, new AbortController().signal, request)).toEqual({ candidateId: "search" });
    expect(urls).toEqual(["http://127.0.0.1:11434/api/show", "http://127.0.0.1:11434/api/chat"]);
    const failure = vi.fn(async () => { throw new Error("offline"); });
    await expect(selectCandidate({ mode: "local", model: "qwen" }, "Search", candidates, new AbortController().signal, failure)).rejects.toThrow("offline"); expect(failure).toHaveBeenCalledTimes(1);
    const remote = vi.fn(async () => Response.json({ remote_host: "https://ollama.com", model_info: {} }));
    await expect(selectCandidate({ mode: "local", model: "qwen" }, "Search", candidates, new AbortController().signal, remote)).rejects.toThrow("local_model_required"); expect(remote).toHaveBeenCalledTimes(1);
  });
  test("cloud key is a header, synthetic content is schema constrained and refusals abstain", async () => {
    const request = vi.fn(async (url, init) => {
      expect(String(url)).not.toContain("SECRET"); expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("SECRET");
      expect(JSON.parse(String(init?.body)).generationConfig.responseJsonSchema.required).toEqual(["candidateId"]);
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"candidateId":null}' }] } }] });
    }) as typeof fetch;
    expect(await selectCandidate({ mode: "cloud", key: "SECRET" }, "Find absent control", candidates, new AbortController().signal, request)).toEqual({ candidateId: null });
    await expect(cloudTranscribe(wav(new Uint8Array(3200)), "SECRET", new AbortController().signal, async () => Response.json({ candidates: [{ finishReason: "SAFETY" }] }))).rejects.toThrow("provider_abstained");
  });
  test("audio bounds, pause during recording, stale finals, silence and invalid local setup", async () => {
    expect(() => wav(new Uint8Array(960002))).toThrow("invalid_audio"); expect(() => wav(new Uint8Array(3201))).toThrow("invalid_audio");
    const voice = new Voice(store(), () => {}); const id = voice.begin(); voice.cancel(); await voice.finish(id, new ArrayBuffer(3200)); expect(voice.transcript).toBe("");
    const second = voice.begin(); await voice.finish(second, new ArrayBuffer(3200)); expect(voice.error).toBe("no_usable_transcript");
    const third = voice.begin(), samples = new Int16Array(1600).fill(1000); await voice.finish(third, samples.buffer); expect(voice.error).toBe("local_asr_setup_required"); expect(voice.status).toBe("idle");
    voice.cancel();
  });
  test("Stop rejects a late cloud final and duplicate finals never start another request", async () => {
    const storage = store(); storage.setKey("AIza_TEST_SECRET_1234567890"); storage.settings.mode = "cloud";
    let respond!: (value: Response) => void;
    const request = vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })); vi.stubGlobal("fetch", request);
    try {
      const voice = new Voice(storage, () => {}), samples = new Int16Array(1600).fill(1000);
      const id = voice.begin(), pending = voice.finish(id, samples.buffer); expect(voice.status).toBe("transcribing");
      voice.cancel(); respond(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "new tab" }] } }] })); await pending;
      expect(voice.transcript).toBe(""); expect(voice.status).toBe("idle"); await voice.finish(id, samples.buffer); expect(request).toHaveBeenCalledTimes(1);
      expect(readdirSync(storage.directory)).toEqual(["provider-key.bin"]);
    } finally { vi.unstubAllGlobals(); }
  });
});
describe("native messaging boundary", () => {
  test("a wrong session token never pairs an executor", async () => {
    const chrome = new ChromeBridge(store(), () => {}); await chrome.start(); const client = connect(chrome.pipe);
    try { const closed = new Promise<void>(resolve => client.on("close", () => resolve())); client.write(frame({ type: "hello", token: "wrong", origin: `chrome-extension://${extensionId}/` })); await closed; expect(chrome.connected).toBe(false); expect(() => chrome.resume()).toThrow(); }
    finally { client.destroy(); chrome.close(); }
  });
  test("frames handle fragmentation, multiple messages and hostile lengths", () => {
    const reader = new FrameReader(), messages: unknown[] = [], body = frame({ test: 1 });
    reader.push(body.subarray(0, 2), value => messages.push(value)); expect(messages).toEqual([]);
    reader.push(Buffer.concat([body.subarray(2), frame({ test: 2 })]), value => messages.push(value)); expect(messages).toEqual([{ test: 1 }, { test: 2 }]);
    const oversize = Buffer.alloc(4); oversize.writeUInt32LE(999999); expect(() => reader.push(oversize, () => {})).toThrow();
  });
  test("auth, persistent consent, revoke, reconnect, pause, stale acknowledgements, no mutation replay", async () => {
    const storage = store(), chrome = new ChromeBridge(storage, () => {}); await chrome.start();
    const client = connect(chrome.pipe), responses: unknown[] = [], reader = new FrameReader(); client.on("data", chunk => reader.push(Buffer.from(chunk), value => { responses.push(value); const message = value as { type: string; epoch: number }; if (message.type === "pause") client.write(frame({ type: "paused", epoch: message.epoch })); }));
    const send = (value: unknown) => client.write(frame(value));
    try {
      send({ type: "hello", protocol: 2, token: chrome.token, origin: `chrome-extension://${extensionId}/` }); send({ type: "ready", protocol: 2, version: "0.3.0" }); await vi.waitFor(() => expect(chrome.connected).toBe(true));
      expect(chrome.active).toBe(false);
      await vi.waitFor(() => expect(chrome.fenceConfirmed).toBe(true));
      send({ type: "consent", origin: "https://www.google.com", granted: true }); send({ type: "grants", origins: ["https://www.google.com"] }); await vi.waitFor(() => expect(chrome.siteState[0]!.effective).toBe(true));
      chrome.resume(); const running = chrome.run("new tab"); await vi.waitFor(() => expect(responses.some(value => (value as { type: string }).type === "command")).toBe(true));
      chrome.pause(); await running; expect(chrome.active).toBe(false); expect(chrome.result).toContain("in-flight");
      expect(() => chrome.resume()).toThrow("chrome_reconciliation_required"); await vi.waitFor(() => expect(chrome.fenceConfirmed).toBe(true)); chrome.reconcile();
      chrome.resume(); chrome.revoke("https://www.google.com"); expect(chrome.siteState[0]!.effective).toBe(false); expect(JSON.parse(readFileSync(join(storage.directory, "providers.json"), "utf8")).consent).toEqual([]);
      await vi.waitFor(() => expect(chrome.fenceConfirmed).toBe(true)); chrome.resume(); await expect(chrome.run("open https://www.google.com")).rejects.toThrow("site_denied");
      client.destroy(); await vi.waitFor(() => expect(chrome.connected).toBe(false)); expect(chrome.active).toBe(false);
    } finally { client.destroy(); chrome.close(); }
  });
});
