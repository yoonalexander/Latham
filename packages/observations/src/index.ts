import { record, fixtureSurface, type RawControl, type RawObservation, type Scope, type Snapshot } from "@latham/contracts";
export function controlRevision(control: RawControl): string {
  return JSON.stringify([control.nodeId, control.name, control.role, control.enabled, control.visible, control.secure, control.secure ? null : control.value ?? null, control.checked ?? null]);
}
export function parseObservation(value: unknown): RawObservation {
  if (!record(value) || typeof value.documentId !== "string" || !value.documentId || value.documentId.length > 100 ||
      !Array.isArray(value.controls) || value.controls.length > 32 || !Number.isInteger(value.deniedFrameCount) || (value.deniedFrameCount as number) < 0) throw new Error("invalid_observation");
  const keys = new Set<string>();
  const controls = value.controls.map((item: unknown): RawControl => {
    if (!record(item) || typeof item.key !== "string" || !item.key || item.key.length > 80 || keys.has(item.key) ||
        typeof item.nodeId !== "string" || !item.nodeId || item.nodeId.length > 100 ||
        !["textbox", "button", "checkbox", "status"].includes(String(item.role)) || typeof item.name !== "string" || item.name.length > 120 ||
        typeof item.enabled !== "boolean" || typeof item.visible !== "boolean" || typeof item.secure !== "boolean" ||
        (item.value !== undefined && (typeof item.value !== "string" || item.value.length > 2000)) ||
        (item.checked !== undefined && typeof item.checked !== "boolean")) throw new Error("invalid_observation");
    keys.add(item.key);
    return { key: item.key, nodeId: item.nodeId, role: item.role as RawControl["role"], name: item.name, enabled: item.enabled, visible: item.visible, secure: item.secure,
      ...(!item.secure && typeof item.value === "string" ? { value: item.value } : {}), ...(typeof item.checked === "boolean" ? { checked: item.checked } : {}) };
  });
  return { documentId: value.documentId, controls: controls.filter(control => control.visible), deniedFrameCount: value.deniedFrameCount as number };
}
export function snapshot(value: unknown, permissionEpoch: number, executorEpoch: number): Snapshot {
  const raw = parseObservation(value), id = crypto.randomUUID();
  const scope: Scope = { surface: fixtureSurface, documentId: raw.documentId, permissionEpoch, executorEpoch };
  return { id, scope, deniedFrameCount: raw.deniedFrameCount, elements: raw.controls.map((control, index) => ({ ...control, id: id + ":e" + (index + 1), revision: controlRevision(control) })) };
}
