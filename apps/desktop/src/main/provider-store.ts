import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseProviderSettings, providerDefaults, type ProviderSettings } from "../../../../packages/contracts/src/setup";
import { parseBrowser, type BrowserId } from "../../../../packages/contracts/src/compatibility";
import { sites } from "../../../../packages/contracts/src/sites";
export interface Encryption { isEncryptionAvailable(): boolean; encryptString(value: string): Buffer; decryptString(value: Buffer): string; }
export class ProviderStore {
  settings = { ...providerDefaults };
  browser: BrowserId = "chrome";
  private browserConsent: Record<BrowserId, string[]> = { chrome: [], edge: [] };
  get consent(): string[] { return this.browserConsent[this.browser]; }
  set consent(value: string[]) { this.browserConsent[this.browser] = value; }
  chromeUncertain = false;
  locked = false;
  constructor(readonly directory: string, private encryption: Encryption) {
    mkdirSync(directory, { recursive: true });
    try {
      const value = JSON.parse(readFileSync(join(directory, "providers.json"), "utf8"));
      if (value.version !== undefined && value.version !== 2) throw new Error("unsupported_settings_version");
      if (value.chromeUncertain !== undefined && typeof value.chromeUncertain !== "boolean") throw new Error("invalid_uncertainty");
      const settings = parseProviderSettings(value.settings), browser = value.version === 2 ? parseBrowser(value.browser) : "chrome";
      const consent = (input: unknown): string[] => Array.isArray(input) ? [...new Set(input.filter((item): item is string => typeof item === "string" && sites.some(s => s.origin === item)))] : [];
      const browserConsent = value.version === 2 ? { chrome: consent(value.browserConsent?.chrome), edge: consent(value.browserConsent?.edge) } : { chrome: consent(value.consent), edge: [] };
      this.settings = settings; this.browser = browser; this.browserConsent = browserConsent; this.chromeUncertain = value.chromeUncertain === true;
    } catch { this.locked = this.chromeUncertain = existsSync(join(directory, "providers.json")); /* Malformed recovery state cannot erase uncertainty. */ }
  }
  get available(): boolean { return process.platform === "win32" && this.encryption.isEncryptionAvailable(); }
  get keyStored(): boolean { return existsSync(join(this.directory, "provider-key.bin")); }
  save(settings: ProviderSettings = this.settings): void {
    if (this.locked) throw new Error("provider_settings_locked");
    const temp = join(this.directory, "providers.json.tmp");
    writeFileSync(temp, JSON.stringify({ version: 2, settings, browser: this.browser, browserConsent: this.browserConsent, chromeUncertain: this.chromeUncertain }) + "\n", { mode: 0o600 }); renameSync(temp, join(this.directory, "providers.json")); this.settings = settings;
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
