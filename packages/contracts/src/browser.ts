import { record } from "./index";
import { siteForPage, sites, type SiteId, type SearchFilter } from "./sites";
export type PageTarget = { id: string; revision: string; name: string; role: "textbox" | "button" | "link"; profile: "search_field" | "search_control" | "search_submit" | "result" | "frame"; actions: ("focus" | "edit" | "navigate")[] };
export type PageSnapshot = { document: string; url: string; profile: SiteId; searchAvailable: boolean; targets: PageTarget[]; deniedFrames: number };
export type PageScope = { tabId: number; windowId: number; documentId: string; snapshot: PageSnapshot };
type EmptyKinds<K extends string> = { [P in K]: { kind: P } }[K];
export type PageAction = { kind: "focus" | "bind" | "click"; targetId: string; revision: string } | { kind: "edit"; text: string; mode: "append" | "replace" | "correct" } | EmptyKinds<"undo" | "unbind"> | { kind: "scroll"; direction: "up" | "down" };
export type PageReply = { outcome: "verified" | "blocked" | "unknown"; reason?: string; scope?: PageScope; destination?: string; bound?: string };
export type PageState = { busy: boolean; status: string; targets: { name: string; role: string }[]; clarification: string[]; dictation: string | null; last: { outcome: string; reason: string; elapsedMs: number } | null };
export const emptyPageState = (): PageState => ({ busy: false, status: "No page observed", targets: [], clarification: [], dictation: null, last: null });
export type PageIntent = EmptyKinds<"observe" | "frames" | "bind" | "unbind" | "undo"> | { kind: "scroll"; direction: "up" | "down" } | { kind: "focus" | "click"; label: string; ordinal?: number } | { kind: "choose"; index: number } | { kind: "edit"; text: string; mode: "append" | "replace" | "correct" } | { kind: "search"; text: string } | { kind: "filter"; filter: SearchFilter };
export function parsePageIntent(value: unknown): PageIntent | null {
  if (typeof value !== "string" || !value.trim() || value.length > 2000) throw new Error("invalid_request");
  const text = value.trim(), lower = text.toLowerCase().replace(/[.!]$/, "");
  const simple: Record<string, PageIntent> = { "inspect page": { kind: "observe" }, "start dictation": { kind: "bind" }, "stop dictation": { kind: "unbind" }, "undo dictation": { kind: "undo" }, "scroll down": { kind: "scroll", direction: "down" }, "scroll up": { kind: "scroll", direction: "up" } };
  if (simple[lower]) return simple[lower];
  if (lower === "inspect frames") return { kind: "frames" };
  const frame = /^open frame ([1-4])$/i.exec(text); if (frame) return { kind: "click", label: "@frame", ordinal: Number(frame[1]) - 1 };
  const choice = /^choose ([1-9]|1\d|2[0-4])$/i.exec(text); if (choice) return { kind: "choose", index: Number(choice[1]) - 1 };
  const edit = /^(dictate|replace dictation with|correct that to)\s+(.+)$/is.exec(text);
  if (edit) { if (edit[2]!.length > 1000) throw new Error("text_too_long"); return { kind: "edit", text: edit[2]!, mode: edit[1]!.toLowerCase() === "dictate" ? "append" : edit[1]!.toLowerCase() === "correct that to" ? "correct" : "replace" }; }
  const search = /^search (.+)$/is.exec(text); if (search) { if (search[1]!.length > 1000) throw new Error("text_too_long"); return { kind: "search", text: search[1]! }; }
  const filter = /^filter (all|images|videos|news|remote)$/i.exec(text); if (filter) return { kind: "filter", filter: filter[1]!.toLowerCase() as SearchFilter };
  const target = /^(click|focus) (?:(first|second|third) )?(.+)$/i.exec(text);
  if (target) return { kind: target[1]!.toLowerCase() as "click" | "focus", label: target[3]!, ...(target[2] ? { ordinal: ["first", "second", "third"].indexOf(target[2].toLowerCase()) } : {}) };
  const result = /^open (?:the )?(first|second|third) result$/i.exec(text); if (result) return { kind: "click", label: "@result", ordinal: ["first", "second", "third"].indexOf(result[1]!.toLowerCase()) };
  return null;
}
export function parsePageScope(value: unknown): PageScope {
  if (!record(value) || !Number.isInteger(value.tabId) || !Number.isInteger(value.windowId) || typeof value.documentId !== "string" || value.documentId.length > 100 || !record(value.snapshot)) throw new Error("invalid_snapshot");
  const s = value.snapshot;
  if (typeof s.document !== "string" || s.document.length > 100 || typeof s.url !== "string" || s.url.length > 4096 || !sites.some(site => site.id === s.profile) || typeof s.searchAvailable !== "boolean" || !Array.isArray(s.targets) || s.targets.length > 24 || !Number.isInteger(s.deniedFrames) || Number(s.deniedFrames) < 0) throw new Error("invalid_snapshot");
  if (siteForPage(s.url)?.id !== s.profile) throw new Error("scope_denied");
  const targets: PageTarget[] = s.targets.map(item => {
    if (!record(item) || typeof item.id !== "string" || !/^[\w-]{1,64}$/.test(item.id) || typeof item.revision !== "string" || item.revision.length > 100 || typeof item.name !== "string" || item.name.length > 120 || !["textbox", "button", "link"].includes(String(item.role)) || !["search_field", "search_control", "search_submit", "result", "frame"].includes(String(item.profile)) || !Array.isArray(item.actions) || item.actions.some(a => !["focus", "edit", "navigate"].includes(a))) throw new Error("invalid_snapshot");
    const expected = { search_field: { role: "textbox", actions: ["focus", "edit"] }, search_control: { role: "textbox", actions: ["focus"] }, search_submit: { role: "button", actions: ["navigate"] }, result: { role: "link", actions: ["navigate"] }, frame: { role: "link", actions: ["navigate"] } }[item.profile as PageTarget["profile"]];
    if (item.role !== expected.role || JSON.stringify(item.actions) !== JSON.stringify(expected.actions)) throw new Error("invalid_profile");
    if (!["google", "youtube"].includes(String(s.profile)) && ["search_field", "search_submit"].includes(String(item.profile))) throw new Error("invalid_profile");
    return { id: item.id, revision: item.revision, name: item.name, role: item.role, profile: item.profile, actions: item.actions } as PageTarget;
  });
  if (new Set(targets.map(item => item.id)).size !== targets.length) throw new Error("invalid_snapshot");
  return { tabId: value.tabId as number, windowId: value.windowId as number, documentId: value.documentId, snapshot: { document: s.document, url: s.url, profile: s.profile as PageSnapshot["profile"], searchAvailable: s.searchAvailable, targets, deniedFrames: s.deniedFrames as number } };
}
