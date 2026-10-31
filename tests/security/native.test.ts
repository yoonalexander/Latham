import { test, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseNativeIntent, parseNativeWindows } from "../../packages/contracts/src/desktop";
import { DesktopController } from "../../apps/desktop/src/main/desktop-controller";

function directory() { return mkdtempSync(join(tmpdir(), "latham-native-boundary-")); }
test("native grammar preserves literal text and exposes no arbitrary app, key, click or shell action", () => {
  expect(parseNativeIntent("dictate delete account and send email")).toEqual({ kind: "edit", mode: "append", text: "delete account and send email" });
  expect(parseNativeIntent("replace dictation with a\nb")).toEqual({ kind: "edit", mode: "replace", text: "a\nb" });
  expect(parseNativeIntent("correct that to piano")).toMatchObject({ mode: "correct" });
  for (const command of ["open chrome", "focus Password", "click Send", "run powershell.exe", "dictate " + "x".repeat(1001)]) expect(() => parseNativeIntent(command)).toThrow();
});
test("native window proposals are bounded opaque identifiers rather than caller-selected handles", () => {
  expect(parseNativeWindows([{ id: "a".repeat(32), name: "Notepad" }])).toHaveLength(1);
  for (const input of [[{ id: "123", name: "Notepad" }], Array(13).fill({ id: "a".repeat(32), name: "Notepad" }), [{ id: "a".repeat(32), name: "x".repeat(81) }]]) expect(() => parseNativeWindows(input)).toThrow();
});
test("desktop deny overrides remembered approval and every restart is paused", () => {
  const path = directory(), first = new DesktopController(path, "unused", () => 0, () => {});
  first.permission(true, true); expect(first.state).toMatchObject({ approved: false, denied: true, active: false });
  first.permission(true, false); const second = new DesktopController(path, "unused", () => 0, () => {});
  expect(second.state).toMatchObject({ approved: true, denied: false, active: false, bound: false });
  expect(() => second.permission("yes", false)).toThrow(); expect(readFileSync(join(path, "desktop.json"), "utf8")).not.toContain("text");
});
test("native uncertainty and malformed recovery records cannot silently enable work", async () => {
  const path = directory(); writeFileSync(join(path, "desktop.json"), JSON.stringify({ approved: true, denied: false, uncertain: true }));
  const first = new DesktopController(path, "unused", () => 0, () => {}); expect(first.state.needsReview).toBe(true);
  await first.scan(); expect(first.state.windows).toEqual([]); first.reconcile(); expect(first.state.needsReview).toBe(false);
  first.state.fenceConfirmed = false; expect(() => first.reconcile()).toThrow("native_fence_unconfirmed");
  writeFileSync(join(path, "desktop.json"), "broken"); const malformed = new DesktopController(path, "unused", () => 0, () => {});
  expect(malformed.state).toMatchObject({ approved: false, active: false, needsReview: true });
});

test("a verified reply arriving after Stop cannot restore a cancelled native binding", async () => {
  const controller = new DesktopController(directory(), "unused", () => 0, () => {});
  controller.permission(true, false); const id = "a".repeat(32); controller.state.windows = [{ id, name: "Notepad" }];
  let release!: (value: object) => void;
  // Model the transport resolving a reply just as a cancellation event crosses it.
  Reflect.set(controller, "request", () => new Promise(resolve => { release = resolve; }));
  const preparing = controller.prepare(id); controller.pause(); release({ outcome: "verified", reason: "bound" }); await preparing;
  expect(controller.state).toMatchObject({ active: false, bound: false }); expect(controller.bindingId).toBeNull();
});

test("Stop from a verification observer also fences the preparation continuation", async () => {
  let stopOnce = true;
  const controller = new DesktopController(directory(), "unused", () => 0, () => {
    if (stopOnce && controller.state.last?.outcome === "verified" && !controller.state.busy) { stopOnce = false; controller.pause(); }
  });
  controller.permission(true, false); const id = "b".repeat(32); controller.state.windows = [{ id, name: "Notepad" }];
  Reflect.set(controller, "request", async () => ({ outcome: "verified", reason: "bound" }));
  await controller.prepare(id); expect(controller.state).toMatchObject({ active: false, bound: false }); expect(controller.bindingId).toBeNull();
});

test("failed settings writes do not grant consent or clear mutation uncertainty", () => {
  const path = directory(), controller = new DesktopController(path, "unused", () => 0, () => {});
  mkdirSync(join(path, "desktop.json"));
  expect(() => controller.permission(true, false)).toThrow(); expect(controller.state.approved).toBe(false);
  controller.state.needsReview = true; expect(() => controller.reconcile()).toThrow(); expect(controller.state.needsReview).toBe(true);
});
