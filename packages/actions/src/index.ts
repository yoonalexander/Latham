import { fixtureSurface, type Action, type Element, type Reason, type Snapshot } from "@latham/contracts";
type Profile = { name: string; role: Element["role"]; kinds: Action["kind"][]; effect: "local_edit" | "search" | "filter" | "high" | "unknown" };
const profiles: Record<string, Profile> = {
  draft: { name: "Draft", role: "textbox", kinds: ["insert_text"], effect: "local_edit" },
  search: { name: "Search", role: "textbox", kinds: ["insert_text"], effect: "local_edit" },
  searchButton: { name: "Search", role: "button", kinds: ["click"], effect: "search" },
  applyA: { name: "Apply filter", role: "button", kinds: ["click"], effect: "filter" },
  applyB: { name: "Apply filter", role: "button", kinds: ["click"], effect: "filter" },
  recent: { name: "Last 24 hours", role: "checkbox", kinds: ["set_checked", "click"], effect: "filter" },
  continue: { name: "Continue", role: "button", kinds: ["click"], effect: "unknown" },
  jobApply: { name: "Apply for job", role: "button", kinds: ["click"], effect: "high" },
  autosave: { name: "Account nickname", role: "textbox", kinds: ["insert_text"], effect: "high" }
};
export function authorize(action: Action, target: Element, observation: Snapshot): { profileId: string } | Reason {
  if (observation.scope.surface !== fixtureSurface) return "scope_denied";
  if (target.secure) return "secure_field";
  const profile = Object.hasOwn(profiles, target.key) ? profiles[target.key] : undefined;
  if (!profile || profile.name !== target.name || profile.role !== target.role || !profile.kinds.includes(action.kind)) return "unknown_effect";
  if (profile.effect === "unknown") return "unknown_effect";
  if (profile.effect === "high") return "consequential_effect";
  if (action.kind === "insert_text" && action.text.length > 1000) return "invalid_request";
  return { profileId: "fixture-v1:" + target.key + ":" + action.kind };
}
export function verify(action: Action, before: Element, prior: Snapshot, after: Snapshot): boolean {
  const target = after.elements.find(element => element.key === before.key && element.nodeId === before.nodeId);
  if (!target) return false;
  if (action.kind === "insert_text") return target.value === action.text;
  if (action.kind === "set_checked") return target.checked === action.checked;
  if (before.key === "recent") return target.checked === !before.checked;
  const oldResult = prior.elements.find(element => element.key === "result");
  const newResult = after.elements.find(element => element.key === "result");
  if (!newResult || newResult.nodeId === oldResult?.nodeId) return false;
  if (before.key === "searchButton") return after.elements.some(element => element.key === "result" && element.name === "Search completed");
  if (before.key === "applyA" || before.key === "applyB") return after.elements.some(element => element.key === "result" && element.name === "Filter " + (before.key === "applyA" ? "A" : "B") + " applied");
  return false;
}
