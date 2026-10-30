import { controlRevision } from "@latham/observations";
import type { Action, RawControl, RawObservation, DispatchReceipt } from "@latham/contracts";
type Request = { documentId: string; key: string; nodeId: string; revision: string; action: Action };
declare global { interface Window { fixtureApi: { observe(): RawObservation; apply(request: Request): DispatchReceipt } } }
let documentId: string = crypto.randomUUID();
const nodeIds = new WeakMap<HTMLElement, string>();
let consequences = 0;
function read(element: HTMLElement): RawControl {
  let nodeId = nodeIds.get(element);
  if (!nodeId) { nodeId = crypto.randomUUID(); nodeIds.set(element, nodeId); }
  const input = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
  const secure = element instanceof HTMLInputElement && element.type === "password";
  const role: RawControl["role"] = element instanceof HTMLInputElement && element.type === "checkbox" ? "checkbox" : input ? "textbox" : element instanceof HTMLOutputElement ? "status" : "button";
  const name = (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 120);
  return { key: element.dataset.lathamKey ?? "", nodeId, role, name,
    enabled: !("disabled" in element && element.disabled), visible: element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden", secure,
    ...(input && !secure && role === "textbox" ? { value: element.value.slice(0, 2000) } : {}),
    ...(element instanceof HTMLInputElement && element.type === "checkbox" ? { checked: element.checked } : {}) };
}
function observe(): RawObservation {
  return { documentId, controls: Array.from(document.querySelectorAll<HTMLElement>("[data-latham-key]")).map(read).filter(control => control.visible),
    deniedFrameCount: document.querySelectorAll("iframe").length };
}
function apply(request: Request): DispatchReceipt {
  const element = Array.from(document.querySelectorAll<HTMLElement>("[data-latham-key]")).find(item => item.dataset.lathamKey === request.key);
  if (!element || request.documentId !== documentId) return { dispatch: "not_dispatched", reason: "stale_target" };
  const current = read(element);
  if (current.nodeId !== request.nodeId || controlRevision(current) !== request.revision || !current.visible || !current.enabled) return { dispatch: "not_dispatched", reason: "stale_target" };
  if (current.secure) return { dispatch: "not_dispatched", reason: "secure_field" };
  if (request.action.kind === "insert_text" && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    element.value = request.action.text;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (request.action.kind === "set_checked" && element instanceof HTMLInputElement && element.type === "checkbox") {
    element.checked = request.action.checked;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (request.action.kind === "click") element.click();
  else return { dispatch: "not_dispatched", reason: "invalid_request" };
  return { dispatch: "dispatched" };
}
const result = document.getElementById("result")!;
document.getElementById("searchButton")!.addEventListener("click", () => { result.textContent = "Search completed"; nodeIds.delete(result); });
for (const key of ["applyA", "applyB"]) document.getElementById(key)!.addEventListener("click", () => { result.textContent = "Filter " + (key === "applyA" ? "A" : "B") + " applied"; nodeIds.delete(result); });
const consequential = (): void => { consequences++; document.getElementById("counts")!.textContent = "Consequential events: " + consequences; };
document.getElementById("continue")!.addEventListener("click", consequential);
document.getElementById("jobApply")!.addEventListener("click", consequential);
document.getElementById("autosave")!.addEventListener("input", consequential);
document.getElementById("replacePage")!.addEventListener("click", () => {
  const draft = document.getElementById("draft")!;
  draft.replaceWith(draft.cloneNode(true));
  documentId = crypto.randomUUID();
  result.textContent = "Document replaced";
});
window.fixtureApi = { observe, apply };
