import { test, expect } from "vitest";
import { parsePageIntent, parsePageScope } from "../../packages/contracts/src/browser";
import { ChromeBridge } from "../../apps/desktop/src/main/native-bridge";
import { ProviderStore } from "../../apps/desktop/src/main/provider-store";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
test("page grammar preserves literal dictation, bounds payloads and makes replacement explicit", () => {
  expect(parsePageIntent("dictate send a message and delete account")).toEqual({ kind: "edit", text: "send a message and delete account", mode: "append" });
  expect(parsePageIntent("replace dictation with hello")).toMatchObject({ mode: "replace", text: "hello" });
  expect(parsePageIntent("correct that to hello")).toMatchObject({ mode: "correct" });
  expect(parsePageIntent("open first result")).toEqual({ kind: "click", label: "@result", ordinal: 0 });
  expect(parsePageIntent("choose 24")).toEqual({ kind: "choose", index: 23 });
  expect(() => parsePageIntent("dictate " + "a".repeat(1001))).toThrow("text_too_long"); expect(parsePageIntent("run arbitrary script")).toBeNull();
});
test("a page scope rejects alien origins, oversized snapshots and fabricated action privileges", () => {
  const scope = { tabId: 1, windowId: 2, documentId: "chrome-document", snapshot: { document: "isolated-document", url: "https://www.google.com/", profile: "google", searchAvailable: true, deniedFrames: 1, targets: [{ id: "field", revision: "r1", name: "Search", role: "textbox", profile: "search_field", actions: ["focus", "edit"] }] } };
  expect(parsePageScope(scope).snapshot.targets).toHaveLength(1);
  expect(() => parsePageScope({ ...scope, snapshot: { ...scope.snapshot, url: "https://attacker.example/" } })).toThrow("scope_denied");
  expect(() => parsePageScope({ ...scope, snapshot: { ...scope.snapshot, targets: [{ ...scope.snapshot.targets[0], actions: ["navigate"] }] } })).toThrow("invalid_profile");
  expect(() => parsePageScope({ ...scope, snapshot: { ...scope.snapshot, targets: Array(25).fill(scope.snapshot.targets[0]) } })).toThrow("invalid_snapshot");
});
test("uncertain browser mutations survive application restart until explicit inspection", () => {
  mkdirSync(".test-artifacts", { recursive: true }); const directory = mkdtempSync(join(resolve(".test-artifacts"), "recovery-"));
  const encryption = { isEncryptionAvailable: () => false, encryptString: () => Buffer.alloc(0), decryptString: () => "" };
  const first = new ProviderStore(directory, encryption); first.chromeUncertain = true; first.save();
  const second = new ProviderStore(directory, encryption), chrome = new ChromeBridge(second, () => {});
  expect(chrome.needsReview).toBe(true); expect(() => chrome.resume()).toThrow(); expect(() => chrome.reconcile()).toThrow("chrome_fence_unconfirmed");
  chrome.fenceConfirmed = true; chrome.reconcile(); expect(new ProviderStore(directory, encryption).chromeUncertain).toBe(false);
});
