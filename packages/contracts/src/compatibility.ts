import { record } from "./index";

export const appVersion = "0.9.0";
export const nativeProtocol = 3;
export const browsers = { chrome: "Google Chrome", edge: "Microsoft Edge" } as const;
export type BrowserId = keyof typeof browsers;
export function parseBrowser(value: unknown): BrowserId {
  if (value !== "chrome" && value !== "edge") throw new Error("unsupported_browser"); return value;
}
export type Trial = { task: "search" | "dictation" | "workflow" | "native"; browser: BrowserId; provider: "local" | "cloud" | "managed"; outcome: "completed" | "intervened" | "blocked" | "wrong_action"; seconds: number; permissionPrompts: number; effort: "easy" | "some" | "hard"; resourceBurden: "low" | "moderate" | "high" };
export function parseTrial(value: unknown): Trial {
  if (!record(value) || Object.keys(value).sort().join(",") !== "browser,effort,outcome,permissionPrompts,provider,resourceBurden,seconds,task" || !["search", "dictation", "workflow", "native"].includes(String(value.task)) || !["local", "cloud", "managed"].includes(String(value.provider)) || !["completed", "intervened", "blocked", "wrong_action"].includes(String(value.outcome)) || !["easy", "some", "hard"].includes(String(value.effort)) || !["low", "moderate", "high"].includes(String(value.resourceBurden)) || typeof value.seconds !== "number" || !Number.isInteger(value.seconds) || value.seconds < 1 || value.seconds > 3600 || typeof value.permissionPrompts !== "number" || !Number.isInteger(value.permissionPrompts) || value.permissionPrompts < 0 || value.permissionPrompts > 20) throw new Error("invalid_trial");
  return { ...value, browser: parseBrowser(value.browser) } as Trial;
}
