import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseProviderSettings, providerDefaults, type ProviderSettings } from "../../../../packages/contracts/src/setup";
export interface Encryption { isEncryptionAvailable(): boolean; encryptString(value: string): Buffer; decryptString(value: Buffer): string; }
export class ProviderStore {
  settings = { ...providerDefaults };
  consent: string[] = [];
  constructor(readonly directory: string, private encryption: Encryption) {
    mkdirSync(directory, { recursive: true });
    try { const value = JSON.parse(readFileSync(join(directory, "providers.json"), "utf8")); this.settings = parseProviderSettings(value.settings); if (Array.isArray(value.consent)) this.consent = value.consent.filter((item: unknown) => typeof item === "string"); } catch { /* No grant on malformed storage. */ }
  }
  get available(): boolean { return process.platform === "win32" && this.encryption.isEncryptionAvailable(); }
  get keyStored(): boolean { return existsSync(join(this.directory, "provider-key.bin")); }
  save(settings: ProviderSettings = this.settings): void {
    const temp = join(this.directory, "providers.json.tmp");
    writeFileSync(temp, JSON.stringify({ settings, consent: this.consent }) + "\n", { mode: 0o600 }); renameSync(temp, join(this.directory, "providers.json")); this.settings = settings;
  }
  key(): string {
    if (!this.available || !this.keyStored) throw new Error("key_setup_required");
    try { return this.encryption.decryptString(readFileSync(join(this.directory, "provider-key.bin"))); } catch { throw new Error("key_unavailable"); }
  }
  setKey(value: unknown): void {
    if (!this.available) throw new Error("os_vault_unavailable");
    if (typeof value !== "string" || value.length < 20 || value.length > 256 || /[^\x21-\x7e]/.test(value)) throw new Error("invalid_key");
    const temp = join(this.directory, "provider-key.bin.tmp"); writeFileSync(temp, this.encryption.encryptString(value), { mode: 0o600 }); renameSync(temp, join(this.directory, "provider-key.bin"));
  }
  removeKey(): void { if (this.keyStored) unlinkSync(join(this.directory, "provider-key.bin")); }
}
