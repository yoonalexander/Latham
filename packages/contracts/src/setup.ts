import { record } from "./index";
import type { PageState } from "./browser";
import type { NativeState } from "./desktop";
import type { HandsfreeState } from "./handsfree";
import type { VisualState, VisualRoute } from "./visual";
import type { WorkflowState, WorkflowGoal, WorkflowShortcut } from "./workflow";
import type { ManagedState } from "./managed";

import { siteForPage } from "./sites";
export { sites } from "./sites";
export const speechLanguages = ["en", "es", "fr", "de", "it", "pt", "ko", "ja", "zh", "auto"] as const;
export type ProviderSettings = { mode: "local" | "cloud" | "managed"; microphoneId: string; whisperExecutable: string; whisperModel: string; ollamaModel: string; speechLanguage: string; speechVocabulary: string; speechThreads: number };
export const providerDefaults: ProviderSettings = { mode: "local", microphoneId: "", whisperExecutable: "", whisperModel: "", ollamaModel: "qwen2.5:1.5b", speechLanguage: "en", speechVocabulary: "", speechThreads: 2 };
export type Candidate = { id: string; label: string; role: string };
export type Selection = { candidateId: string | null };
export type ChromeCommand = { kind: "new_tab" | "next_tab" | "previous_tab" | "back" | "forward" } | { kind: "navigate"; url: string };
export type SetupState = {
  managed: ManagedState;
  canImportEnvironmentKey: boolean;
  canInsertTranscript: boolean;
  canInsertDesktopTranscript: boolean;
  desktop: NativeState;
  handsfree: HandsfreeState;
  visual: VisualState;
  workflow: WorkflowState;
  shortcuts: WorkflowShortcut[];
  shortcutStorageAvailable: boolean;
  shortcutStorageLocked: boolean;
  localModel: string;
  settings: ProviderSettings; keyStored: boolean; vaultAvailable: boolean;
  voice: "idle" | "recording" | "transcribing" | "testing"; transcript: string; error: string; notice: string;
  chromeConnected: boolean; chromeActive: boolean; chromeFenceConfirmed: boolean; chromeNeedsReview: boolean; chromeResult: string; extensionId: string;
  sites: { origin: string; name: string; consent: boolean; chromeGranted: boolean; effective: boolean }[];
  page: PageState;
};
export interface SetupBridge {
  managedSignIn(input: { origin: string; invite: string; consent: string }): Promise<void>;
  managedAccount(operation: "refresh" | "sign_out" | "cancel" | "delete" | "forget"): Promise<void>;
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
  startHandsfree(config: { target: "chrome" | "desktop"; wake: boolean }): Promise<string>;
  handsfreeFrame(id: string, sequence: number, pcm: ArrayBuffer): void;
  handsfreeFailure(id: string): Promise<void>;
  checkLocalModel(): Promise<void>;
  visualPermission(allowed: boolean): Promise<void>;
  visualFind(query: { text: string; route: VisualRoute; model: string }): Promise<void>;
  visualHighlight(id: string): Promise<void>;
  visualOpen(): Promise<void>;
  prepareWorkflow(goal: WorkflowGoal): Promise<void>;
  runWorkflow(previewId: string): Promise<void>;
  cancelWorkflow(): Promise<void>;
  saveWorkflowShortcut(name: string, id: string | null): Promise<void>;
  deleteWorkflowShortcut(id: string): Promise<void>;
  clearWorkflowShortcuts(): Promise<void>;
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
export function parseProviderSettings(input: unknown): ProviderSettings {
  if (!record(input) || Object.keys(input).some(key => !Object.keys(providerDefaults).includes(key)) || !["local", "cloud", "managed"].includes(String(input.mode))) throw new Error("invalid_settings");
  // Migrate the smaller Phase 1–3 settings without starting a microphone session.
  const value: Record<string, unknown> = { speechLanguage: "en", speechVocabulary: "", speechThreads: 2, ...input };
  for (const key of ["microphoneId", "whisperExecutable", "whisperModel", "ollamaModel"]) if (typeof value[key] !== "string" || (value[key] as string).length > 1024) throw new Error("invalid_settings");
  if (!/^[a-zA-Z0-9_.:/-]{1,100}$/.test(value.ollamaModel as string) || (value.ollamaModel as string).includes("cloud")) throw new Error("local_model_required");
  if (!speechLanguages.includes(value.speechLanguage as typeof speechLanguages[number]) || typeof value.speechVocabulary !== "string" || value.speechVocabulary.length > 400 || /[\x00-\x1f]/.test(value.speechVocabulary) || !Number.isInteger(value.speechThreads) || Number(value.speechThreads) < 1 || Number(value.speechThreads) > 4) throw new Error("invalid_speech_options");
  return { mode: value.mode as ProviderSettings["mode"], microphoneId: value.microphoneId as string, whisperExecutable: value.whisperExecutable as string, whisperModel: value.whisperModel as string, ollamaModel: value.ollamaModel as string, speechLanguage: value.speechLanguage as string, speechVocabulary: value.speechVocabulary, speechThreads: Number(value.speechThreads) };
}
export function parseChromeCommand(input: unknown): ChromeCommand {
  if (typeof input !== "string" || input.length > 2048) throw new Error("unsupported_chrome_command");
  const text = input.trim().replace(/[.!]$/, "").toLowerCase();
  const commands: Record<string, ChromeCommand> = { "new tab": { kind: "new_tab" }, "next tab": { kind: "next_tab" }, "previous tab": { kind: "previous_tab" }, "go back": { kind: "back" }, "go forward": { kind: "forward" } };
  if (commands[text]) return commands[text];
  if (/^open /i.test(input.trim())) {
    const url = new URL(input.trim().slice(5));
    if (siteForPage(url.href) && url.href.length <= 2000) return { kind: "navigate", url: url.href };
  }
  throw new Error("unsupported_chrome_command");
}
