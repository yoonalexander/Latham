import type { Action, Element, Reason, Snapshot } from "@latham/contracts";
export type Step = { targetKey: string; action: Action } | { label: string; ordinal?: number; action: Action };
export function route(command: string): Step[] | Reason {
  const text = command.trim();
  const write = /^write ([^:]+): (.+)$/i.exec(text);
  if (write?.[1] && write[2]) return [{ label: write[1], action: { kind: "insert_text", text: write[2] } }];
  if (/^type\s+\S/i.test(text)) return [{ targetKey: "draft", action: { kind: "insert_text", text: text.replace(/^type\s+/i, "") } }];
  if (/^search\s+\S/i.test(text)) return [
    { targetKey: "search", action: { kind: "insert_text", text: text.replace(/^search\s+/i, "") } },
    { targetKey: "searchButton", action: { kind: "click" } }
  ];
  const click = /^click\s+(?:(first|second)\s+)?(.+)$/i.exec(text);
  if (click?.[2]) return [{ label: click[2], ...(click[1] ? { ordinal: click[1].toLowerCase() === "first" ? 0 : 1 } : {}), action: { kind: "click" } }];
  const filter = /^filter\s+(on|off)$/i.exec(text);
  if (filter?.[1]) return [{ targetKey: "recent", action: { kind: "set_checked", checked: filter[1].toLowerCase() === "on" } }];
  return "unknown_command";
}
export function select(step: Step, observation: Snapshot): Element | Reason {
  const candidates = observation.elements.filter(element => element.visible && element.enabled &&
    (step.action.kind !== "click" || element.role === "button" || element.role === "checkbox") &&
    ("targetKey" in step ? element.key === step.targetKey : element.name.toLowerCase() === step.label.toLowerCase()));
  if ("ordinal" in step && step.ordinal !== undefined) return candidates[step.ordinal] ?? "target_missing";
  return candidates.length === 1 ? candidates[0]! : candidates.length === 0 ? "target_missing" : "ambiguous_target";
}
