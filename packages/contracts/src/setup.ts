import { record } from "./index";
import type { PageState } from "./browser";
import type { NativeState } from "./desktop";

export const sites = [
  { origin: "https://www.google.com", pattern: "https://www.google.com/*", name: "Google Search" },
  { origin: "https://www.youtube.com", pattern: "https://www.youtube.com/*", name: "YouTube" }
] as const;
export type ProviderSettings = { mode: "local" | "cloud"; microphoneId: string; whisperExecutable: string; whisperModel: string; ollamaModel: string };
export const providerDefaults: ProviderSettings = { mode: "local", microphoneId: "", whisperExecutable: "", whisperModel: "", ollamaModel: "qwen2.5:1.5b" };
export type Candidate = { id: string; label: string; role: string };
export type Selection = { candidateId: string | null };
export type ChromeCommand = { kind: "new_tab" | "next_tab" | "previous_tab" | "back" | "forward" } | { kind: "navigate"; url: string };
export type SetupState = {
  canImportEnvironmentKey: boolean;
  canInsertTranscript: boolean;
  canInsertDesktopTranscript: boolean;
  desktop: NativeState;
  settings: ProviderSettings; keyStored: boolean; vaultAvailable: boolean;
  voice: "idle" | "recording" | "transcribing" | "testing"; transcript: string; error: string; notice: string;
  chromeConnected: boolean; chromeActive: boolean; chromeFenceConfirmed: boolean; chromeNeedsReview: boolean; chromeResult: string; extensionId: string;
  sites: { origin: string; name: string; consent: boolean; chromeGranted: boolean; effective: boolean }[];
  page: PageState;
};
export interface SetupBridge {
  state(): Promise<SetupState>;
  save(settings: ProviderSettings): Promise<void>;
  key(value: string): Promise<void>;
  removeKey(): Promise<void>;
  importEnvironmentKey(): Promise<void>;
  testDecision(): Promise<Selection>;
  beginTurn(): Promise<number>;
  finishTurn(id: number, pcm: ArrayBuffer): Promise<void>;
  cancelTurn(): Promise<void>;
  clearTranscript(): Promise<void>;
  chromeResume(): Promise<void>;
  reconcileChrome(): Promise<void>;
  chromeRun(command: string): Promise<void>;
  insertTranscript(mode: "append" | "replace"): Promise<void>;
  prepareDictation(): Promise<void>;
  desktopPermission(approved: boolean, denied: boolean): Promise<void>;
  desktopScan(): Promise<void>;
  desktopOpen(): Promise<void>;
  desktopPrepare(windowId: string): Promise<void>;
  desktopRun(command: string): Promise<void>;
  desktopInsertTranscript(mode: "append" | "replace"): Promise<void>;
  desktopReconcile(): Promise<void>;
  revoke(origin: string): Promise<void>;
  installHost(): Promise<void>;
  launchChrome(): Promise<void>;
  subscribe(listener: (state: SetupState) => void): () => void;
}
export function parseProviderSettings(value: unknown): ProviderSettings {
  if (!record(value) || Object.keys(value).some(key => !Object.keys(providerDefaults).includes(key)) || !["local", "cloud"].includes(String(value.mode))) throw new Error("invalid_settings");
  for (const key of ["microphoneId", "whisperExecutable", "whisperModel", "ollamaModel"]) if (typeof value[key] !== "string" || (value[key] as string).length > 1024) throw new Error("invalid_settings");
  if (!/^[a-zA-Z0-9_.:/-]{1,100}$/.test(value.ollamaModel as string) || (value.ollamaModel as string).includes("cloud")) throw new Error("local_model_required");
  return { mode: value.mode as ProviderSettings["mode"], microphoneId: value.microphoneId as string, whisperExecutable: value.whisperExecutable as string, whisperModel: value.whisperModel as string, ollamaModel: value.ollamaModel as string };
}
export function parseChromeCommand(input: unknown): ChromeCommand {
  if (typeof input !== "string" || input.length > 2048) throw new Error("unsupported_chrome_command");
  const text = input.trim().replace(/[.!]$/, "").toLowerCase();
  const commands: Record<string, ChromeCommand> = { "new tab": { kind: "new_tab" }, "next tab": { kind: "next_tab" }, "previous tab": { kind: "previous_tab" }, "go back": { kind: "back" }, "go forward": { kind: "forward" } };
  if (commands[text]) return commands[text];
  if (/^open /i.test(input.trim())) {
    const url = new URL(input.trim().slice(5));
    if (url.protocol === "https:" && sites.some(site => site.origin === url.origin) && !url.username && !url.password && url.href.length <= 2000) return { kind: "navigate", url: url.href };
  }
  throw new Error("unsupported_chrome_command");
}
