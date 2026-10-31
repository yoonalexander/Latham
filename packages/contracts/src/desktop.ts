import { record } from "./index";

export const desktopApps = ["notepad"] as const;
export type DesktopApp = "notepad" | "fixture";
export type NativeWindow = { id: string; name: string };
export type NativeState = {
  approved: boolean; denied: boolean; active: boolean; busy: boolean; bound: boolean;
  fenceConfirmed: boolean; needsReview: boolean; windows: NativeWindow[];
  result: string; last: { outcome: "verified" | "blocked" | "unknown"; reason: string; elapsedMs: number } | null;
};
export const emptyNativeState = (): NativeState => ({ approved: false, denied: false, active: false, busy: false, bound: false, fenceConfirmed: true, needsReview: false, windows: [], result: "Desktop session paused", last: null });
export type NativeIntent = { kind: "inspect" | "focus" | "undo" | "unbind" } | { kind: "edit"; text: string; mode: "append" | "replace" | "correct" };
export function parseNativeIntent(input: unknown): NativeIntent {
  if (typeof input !== "string" || !input.trim() || input.length > 2000) throw new Error("invalid_request");
  const simple: Record<string, NativeIntent> = { "inspect editor": { kind: "inspect" }, "focus editor": { kind: "focus" }, "undo dictation": { kind: "undo" }, "stop dictation": { kind: "unbind" } };
  const text = input.trim(); const known = simple[text.toLowerCase().replace(/[.!]$/, "")]; if (known) return known;
  const match = /^(dictate|replace dictation with|correct that to)\s+(.+)$/is.exec(text);
  if (!match || match[2]!.length > 1000) throw new Error("unsupported_native_command");
  return { kind: "edit", mode: match[1]!.toLowerCase() === "dictate" ? "append" : match[1]!.toLowerCase() === "correct that to" ? "correct" : "replace", text: match[2]! };
}
export function parseNativeWindows(input: unknown): NativeWindow[] {
  if (!Array.isArray(input) || input.length > 12) throw new Error("invalid_native_reply");
  return input.map(item => {
    if (!record(item) || typeof item.id !== "string" || !/^[a-f0-9]{32}$/.test(item.id) || typeof item.name !== "string" || item.name.length > 80) throw new Error("invalid_native_reply");
    return { id: item.id, name: item.name };
  });
}
