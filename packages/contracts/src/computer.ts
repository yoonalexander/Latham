import { record } from "./index";
export type ComputerAction = { kind: "done" | "ask" | "blocked" | "click" | "focus" | "type" | "scroll" | "key" | "open"; target: string; text: string; x: number; y: number; verifiedPrevious: boolean; reason: string };
export type ComputerTarget = { id: string; name: string; role: string; actions: string[]; value?: string; focused?: boolean };
export type ComputerObservation = { hwnd: string; pid: number; started: string; app: string; title: string; revision: string; imageHash: string; inputTick: number; capturedAt: number; width: number; height: number; targets: ComputerTarget[]; image: string };
export type ComputerConfirmation = { id: string; app: string; title: string; targetName: string; goal: string; scope: "task" | "action"; action: ComputerAction };
export const computerAgreementVersion = 1;
export type ComputerState = { agreementAccepted: boolean; allowed: boolean; images: boolean; browserAllowed: boolean; selected: boolean; route: "cloud" | "local"; model: string; deniedApps: string[]; deniedOrigins: string[]; phase: "off" | "ready" | "observing" | "thinking" | "review" | "acting" | "complete" | "blocked"; message: string; steps: number; pending: ComputerConfirmation | null; needsReview: boolean; fenceConfirmed: boolean };
export const emptyComputer = (): ComputerState => ({ agreementAccepted: false, allowed: false, images: false, browserAllowed: false, selected: false, route: "cloud", model: "gemini-3.1-flash-lite", deniedApps: [], deniedOrigins: [], phase: "off", message: "Complete Latham's one-time setup in Settings.", steps: 0, pending: null, needsReview: false, fenceConfirmed: true });
export function parseComputerOptions(value: unknown): Pick<ComputerState, "allowed" | "images" | "browserAllowed" | "route" | "model" | "deniedApps"> {
  if (!record(value) || Object.keys(value).sort().join() !== "allowed,browserAllowed,deniedApps,images,model,route" || typeof value.allowed !== "boolean" || typeof value.images !== "boolean" || typeof value.browserAllowed !== "boolean" || !["cloud", "local"].includes(String(value.route)) || typeof value.model !== "string" || !/^[a-zA-Z0-9_.:/-]{1,100}$/.test(value.model) || /cloud/i.test(value.model) || !Array.isArray(value.deniedApps) || value.deniedApps.length > 40 || value.deniedApps.some(app => typeof app !== "string" || !/^[a-zA-Z0-9_.-]{1,80}$/.test(app))) throw new Error("invalid_computer_options");
  return { allowed: value.allowed, images: value.allowed && value.images, browserAllowed: value.allowed && value.browserAllowed, route: value.route as "cloud" | "local", model: value.model, deniedApps: [...new Set(value.deniedApps as string[])].map(app => app.toLowerCase()) };
}
export function parseComputerAction(value: unknown, observation: ComputerObservation): ComputerAction {
  const keys = ["kind", "target", "text", "x", "y", "verifiedPrevious", "reason"];
  if (!record(value) || Object.keys(value).sort().join() !== keys.sort().join() || !["done", "ask", "blocked", "click", "focus", "type", "scroll", "key", "open"].includes(String(value.kind)) || typeof value.target !== "string" || value.target.length > 200 || typeof value.text !== "string" || value.text.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.text) || typeof value.reason !== "string" || value.reason.length > 500 || typeof value.verifiedPrevious !== "boolean" || !Number.isInteger(value.x) || !Number.isInteger(value.y) || Number(value.x) < 0 || Number(value.x) > 1000 || Number(value.y) < 0 || Number(value.y) > 1000) throw new Error("invalid_computer_action");
  const action = value as ComputerAction;
  if (["click", "focus", "type", "scroll"].includes(action.kind) && action.target && !observation.targets.some(target => target.id === action.target && target.actions.includes(action.kind))) throw new Error("stale_computer_target");
  if (["focus", "type", "scroll"].includes(action.kind) && !action.target) throw new Error("computer_target_required");
  if (action.kind === "click" && !action.target && !observation.image) throw new Error("computer_image_required");
  if (action.kind === "key" && !["Tab", "Shift+Tab", "Enter", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Ctrl+f", "Ctrl+l", "Ctrl+a"].includes(action.text)) throw new Error("computer_key_blocked");
  if (action.kind === "open" && !["calculator", "notepad"].includes(action.text)) throw new Error("computer_launch_blocked");
  if (action.kind === "scroll" && !["up", "down"].includes(action.text)) throw new Error("invalid_computer_scroll");
  if (["click", "type", "key"].includes(action.kind)) {
    const target = observation.targets.find(target => target.id === action.target);
    if (action.kind === "type" && /address|location|\burl\b/i.test(target?.name ?? "") && /^\s*(?:javascript|data|file|shell|vbscript|ms-[\w-]+):/i.test(action.text)) throw new Error("computer_launch_blocked");
    if (/\b(send|submit|delete|remove|erase|buy|purchase|pay|checkout|transfer|upload|download|install|uninstall|password|sign in|log in|account|security|permission|shutdown|restart|format|publish|post|apply|save|close)\b/i.test(`${target?.name ?? ""} ${action.reason}`)) throw new Error("computer_consequential_blocked");
  }
  return action;
}

// One explicit, uniquely named control/action; model labels cannot broaden the user's words.
export function isDirectComputerAction(goal: string, action: ComputerAction, observation: ComputerObservation): boolean {
  const normalized = (text: string): string => text.trim().replace(/[.!?]+$/, "").trim().toLowerCase();
  const text = normalized(goal).replace(/^please\s+/, "").replace(/\s+please$/, "");
  if (action.kind === "scroll") return text === `scroll ${action.text}`;
  if (action.kind === "key") return action.text !== "Enter" && text === `press ${action.text.toLowerCase()}`;
  const target = observation.targets.find(item => item.id === action.target);
  if (!target || observation.targets.filter(item => normalized(item.name) === normalized(target.name) && item.actions.includes(action.kind)).length !== 1) return false;
  const command = /^(focus|click|select|press)\s+(?:the\s+)?(.+)$/.exec(text);
  if (command && normalized(target.name) === command[2]) return action.kind === "focus" ? command[1] === "focus" : action.kind === "click" && command[1] !== "focus";
  const replacement = /^(?:replace|fill|set)\s+(?:the\s+)?(.+?)\s+(?:with|to)\s+([\s\S]+)$/i.exec(goal.trim().replace(/^please\s+/i, ""));
  if (action.kind !== "type" || !replacement || normalized(replacement[1]!) !== normalized(target.name)) return false;
  const payload = replacement[2]!.trim();
  return payload === action.text || payload.replace(/\.$/, "") === action.text;
}
