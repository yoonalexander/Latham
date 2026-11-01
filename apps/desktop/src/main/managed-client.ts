import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { record } from "../../../../packages/contracts/src/index";
import { managedOrigin, managedPolicy, parseManagedCredentials, parseManagedUsage, type ManagedCredentials, type ManagedState } from "../../../../packages/contracts/src/managed";
import { boundedJson, validateCandidates, validateSelection, type Fetch } from "../../../../packages/speech/src/providers";
import type { Candidate, Selection } from "../../../../packages/contracts/src/setup";
import type { Encryption } from "./provider-store";

export class ManagedClient {
  private credentials: ManagedCredentials | null = null;
  private control = new AbortController();
  private generation = 0;
  state: ManagedState = { signedIn: false, origin: "", accountId: "", expires: 0, usage: null, busy: false, message: "Optional local managed-service preview. Billing disabled." };
  constructor(private directory: string, private encryption: Encryption, private allowLoopback: boolean, private changed: () => void, private request: Fetch = fetch) {
    if (existsSync(this.path)) {
      try { this.requireVault(); this.accept(parseManagedCredentials(JSON.parse(encryption.decryptString(readFileSync(this.path))), allowLoopback)); }
      catch { this.state.message = "Stored managed session unavailable. Forget it locally, then sign in again explicitly."; }
    }
  }
  private get path(): string { return join(this.directory, "managed-session.bin"); }
  private requireVault(): void { if (process.platform !== "win32" || !this.encryption.isEncryptionAvailable()) throw new Error("os_vault_unavailable"); }
  ready(): void { if (!this.credentials || this.credentials.expires <= Date.now()) throw new Error("managed_sign_in_required"); }
  private accept(credentials: ManagedCredentials): void {
    this.credentials = credentials;
    this.state = { ...this.state, signedIn: true, origin: credentials.origin, accountId: credentials.accountId, expires: credentials.expires, usage: null };
  }
  stop(): void { this.generation++; this.control.abort(); this.control = new AbortController(); this.state.busy = false; }
  private async call(origin: string, path: string, method: string, body: unknown, token: string | null, signal: AbortSignal): Promise<unknown> {
    const response = await this.request(origin + path, { method, headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error", signal });
    const value = await boundedJson(response); signal.throwIfAborted(); return value;
  }
  async signIn(input: unknown): Promise<void> {
    if (this.state.busy) throw new Error("service_busy");
    if (!record(input) || Object.keys(input).length !== 3 || input.consent !== managedPolicy || typeof input.invite !== "string" || !/^[a-f0-9]{64}$/.test(input.invite)) throw new Error("managed_consent_required");
    this.requireVault(); const origin = managedOrigin(input.origin, this.allowLoopback);
    if (existsSync(this.path)) throw new Error("sign_out_or_forget_first");
    this.stop(); const generation = this.generation;
    const signal = AbortSignal.any([this.control.signal, AbortSignal.timeout(15000)]);
    this.state.busy = true; this.changed();
    let issued: ManagedCredentials | null = null;
    try {
      const value = await this.call(origin, "/v1/enroll", "POST", { invite: input.invite, policy: managedPolicy }, null, signal);
      const credentials = parseManagedCredentials({ ...(record(value) ? value : {}), origin }, this.allowLoopback); issued = credentials;
      if (generation !== this.generation) throw new Error("cancelled");
      const temp = this.path + ".tmp";
      writeFileSync(temp, this.encryption.encryptString(JSON.stringify(credentials)), { mode: 0o600 }); renameSync(temp, this.path);
      this.accept(credentials); this.state.message = "Signed in. Select Latham-managed AI and save to switch routes. No payment or automatic capture.";
    } catch {
      // If enrollment succeeded but local storage failed/cancelled, revoke the issued session.
      if (issued) await this.call(origin, "/v1/session", "DELETE", undefined, issued.token, AbortSignal.timeout(5000)).catch(() => {});
      if (generation === this.generation) this.state.message = "Sign-in failed or cancelled. Invitations are single-use; ask the local operator for a replacement if needed.";
    } finally { if (generation === this.generation) { this.state.busy = false; this.changed(); } }
  }
  async account(operation: unknown): Promise<void> {
    if (!["refresh", "sign_out", "cancel", "delete", "forget"].includes(String(operation))) throw new Error("invalid_request");
    if (operation === "forget") { this.stop(); this.forget(); this.state.message = "Forgot this device's session. Offline forgetting does not revoke the server session; ask the operator if needed."; this.changed(); return; }
    if (this.state.busy) throw new Error("service_busy");
    this.ready(); const credentials = this.credentials!, generation = this.generation;
    const signal = AbortSignal.any([this.control.signal, AbortSignal.timeout(15000)]);
    this.state.busy = true; this.changed();
    try {
      if (operation === "refresh") {
        const usage = parseManagedUsage(await this.call(credentials.origin, "/v1/account", "GET", undefined, credentials.token, signal));
        if (usage.accountId !== credentials.accountId) throw new Error("invalid_provider_response");
        if (generation === this.generation) { this.state.usage = usage; this.state.message = `Usage: ${usage.used}/${usage.dailyLimit} admitted requests today (UTC). Failed or cancelled provider attempts count. Billing disabled.`; }
      } else {
        const path = operation === "sign_out" ? "/v1/session" : operation === "cancel" ? "/v1/account/cancel" : "/v1/account";
        const result = await this.call(credentials.origin, path, operation === "cancel" ? "POST" : "DELETE", operation === "sign_out" ? undefined : { confirm: operation }, credentials.token, signal);
        if (!record(result) || result.ok !== true || Object.keys(result).length !== 1) throw new Error("invalid_provider_response");
        if (generation === this.generation) {
          if (operation !== "cancel") this.forget();
          else this.state.usage = null;
          this.state.message = operation === "cancel" ? "Service cancelled. Inference is blocked; you can still delete this account or sign out." : operation === "delete" ? "Server account, sessions and identifiable usage deleted. Anonymous global request totals remain." : "Signed out; this server session was revoked.";
        }
      }
    } catch { if (generation === this.generation) this.state.message = "Service unavailable, session expired or response unconfirmed. No route was substituted. Refresh or retry account management; use Forget only to remove local credentials."; }
    finally { if (generation === this.generation) { this.state.busy = false; this.changed(); } }
  }
  private forget(): void {
    for (const path of [this.path, this.path + ".tmp"]) if (existsSync(path)) unlinkSync(path);
    this.credentials = null; this.state = { ...this.state, signedIn: false, origin: "", accountId: "", expires: 0, usage: null };
  }
  private async infer(body: object, signal: AbortSignal): Promise<unknown> {
    this.ready(); const credentials = this.credentials!;
    return this.call(credentials.origin, "/v1/infer", "POST", body, credentials.token, AbortSignal.any([signal, this.control.signal, AbortSignal.timeout(50000)]));
  }
  async transcribe(audio: Uint8Array, signal: AbortSignal): Promise<string> {
    const value = await this.infer({ kind: "transcribe", audio: Buffer.from(audio).toString("base64") }, signal);
    if (!record(value) || Object.keys(value).length !== 1 || typeof value.transcript !== "string" || !value.transcript.trim() || value.transcript.length > 2000) throw new Error("invalid_provider_response");
    return value.transcript.trim();
  }
  async select(instruction: string, candidates: Candidate[], signal: AbortSignal): Promise<Selection> {
    validateCandidates(candidates);
    const result = validateSelection(await this.infer({ kind: "select", instruction, candidates }, signal), candidates);
    const chosen = candidates.find(c => c.id === result.candidateId);
    return chosen && candidates.filter(c => c.label.toLowerCase() === chosen.label.toLowerCase() && c.role === chosen.role).length > 1 ? { candidateId: null } : result;
  }
}
