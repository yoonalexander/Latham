import { record } from "./index";
import { parsePageScope, type PageScope } from "./browser";
export type VisualRoute = "ocr" | "local" | "cloud";
export type VisualCandidate = { id: string; revision: string; label: string; image: string; rect: { x: number; y: number; width: number; height: number }; text: string };
export type VisualCapture = { scope: PageScope; token: string; candidates: VisualCandidate[] };
export type VisualState = { consent: boolean; busy: boolean; route: VisualRoute; message: string; candidates: VisualCandidate[]; proposed: string | null; ready: boolean };
export const emptyVisual = (): VisualState => ({ consent: false, busy: false, route: "ocr", message: "Visual capture off. Approve thumbnail capture for this session first.", candidates: [], proposed: null, ready: false });
export function parseVisualQuery(value: unknown): { text: string; route: VisualRoute; model: string } {
  if (!record(value) || Object.keys(value).length !== 3 || typeof value.text !== "string" || !value.text.trim() || value.text.length > 300 || !["ocr", "local", "cloud"].includes(String(value.route)) || typeof value.model !== "string" || !/^[a-zA-Z0-9_.:/-]{1,100}$/.test(value.model) || /cloud/i.test(value.model)) throw new Error("invalid_visual_query");
  return { text: value.text.trim(), route: value.route as VisualRoute, model: value.model };
}
export function parseVisualCapture(value: unknown): VisualCapture {
  if (!record(value) || typeof value.token !== "string" || !/^[\w-]{1,64}$/.test(value.token) || !Array.isArray(value.candidates) || value.candidates.length < 1 || value.candidates.length > 4) throw new Error("invalid_visual_capture");
  const scope = parsePageScope(value.scope); if (scope.snapshot.profile !== "youtube") throw new Error("visual_scope_denied");
  const candidates = value.candidates.map((c): VisualCandidate => {
    if (!record(c) || typeof c.id !== "string" || typeof c.revision !== "string" || typeof c.label !== "string" || c.label.length > 120 || typeof c.image !== "string" || !/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(c.image) || c.image.length > 10924 || !record(c.rect)) throw new Error("invalid_visual_candidate");
    const target = scope.snapshot.targets.find(t => t.id === c.id && t.revision === c.revision && t.profile === "result" && t.actions.includes("navigate"));
    if (!target || c.label !== target.name) throw new Error("invalid_visual_candidate");
    for (const key of ["x", "y", "width", "height"]) if (typeof c.rect[key] !== "number" || !Number.isFinite(c.rect[key]) || Number(c.rect[key]) < 0 || Number(c.rect[key]) > 10000) throw new Error("invalid_visual_geometry");
    if (Number(c.rect.width) < 24 || Number(c.rect.height) < 24) throw new Error("invalid_visual_geometry");
    return { id: c.id, revision: c.revision, label: c.label, image: c.image, rect: { x: Number(c.rect.x), y: Number(c.rect.y), width: Number(c.rect.width), height: Number(c.rect.height) }, text: "" };
  });
  if (new Set(candidates.map(c => c.id)).size !== candidates.length) throw new Error("invalid_visual_candidate");
  return { scope, token: value.token, candidates };
}
export function visualMatches(text: string, candidates: VisualCandidate[]): string[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const spatial = /^(?:the )?(leftmost|rightmost|topmost|bottommost) (?:thumbnail|image|video)$/.exec(normalized);
  if (spatial) {
    const axis = ["leftmost", "rightmost"].includes(spatial[1]!) ? "x" : "y", sign = ["rightmost", "bottommost"].includes(spatial[1]!) ? -1 : 1;
    const ordered = [...candidates].sort((a, b) => sign * (a.rect[axis] - b.rect[axis]));
    return ordered.filter(c => Math.abs(c.rect[axis] - ordered[0]!.rect[axis]) < 1).map(c => c.id);
  }
  // OCR is a literal-text route; it does not pretend to recognize faces or icons.
  const wanted = normalized.replace(/^(?:thumbnail|image|video) (?:with|saying|containing) /, "").replace(/^text /, "");
  if (wanted.length < 2) return [];
  return candidates.filter(c => c.text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").includes(wanted)).map(c => c.id);
}
