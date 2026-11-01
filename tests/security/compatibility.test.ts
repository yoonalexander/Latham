import { expect, test, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "node:net";
import { providerDefaults } from "../../packages/contracts/src/setup";
import { parseBrowser, parseTrial, type Trial, nativeProtocol, appVersion } from "../../packages/contracts/src/compatibility";
import { ProviderStore } from "../../apps/desktop/src/main/provider-store";
import { ChromeBridge, extensionId, frame } from "../../apps/desktop/src/main/native-bridge";
import { EvaluationStore } from "../../apps/desktop/src/main/evaluation-store";
import { fitWindow } from "../../apps/desktop/src/main/window-bounds";
import { hostRegistryPaths } from "../../apps/desktop/src/main/host-install";

const encryption = { isEncryptionAvailable: () => true, encryptString: (v: string) => Buffer.from(v), decryptString: (v: Buffer) => v.toString() };
const directory = () => mkdtempSync(join(tmpdir(), "latham-compatibility-"));
const sample: Trial = { task: "search", browser: "edge", provider: "local", outcome: "intervened", seconds: 40, permissionPrompts: 1, effort: "some", resourceBurden: "low" };
test("legacy settings migrate Chrome consent only, retaining mode/key and uncertainty", () => {
  const path = directory(); writeFileSync(join(path, "providers.json"), JSON.stringify({ settings: { ...providerDefaults, mode: "cloud" }, consent: ["https://www.google.com", "https://unreviewed.example"], chromeUncertain: true }));
  writeFileSync(join(path, "provider-key.bin"), "EXISTING_TEST_KEY");
  const store = new ProviderStore(path, encryption);
  expect(store.browser).toBe("chrome"); expect(store.consent).toEqual(["https://www.google.com"]); expect(store.chromeUncertain).toBe(true); expect(store.settings.mode).toBe("cloud");
  store.browser = "edge"; expect(store.consent).toEqual([]); store.save();
  const restarted = new ProviderStore(path, encryption); expect(restarted.browser).toBe("edge"); expect(restarted.consent).toEqual([]); expect(restarted.key()).toBe("EXISTING_TEST_KEY");
  restarted.consent = ["https://www.youtube.com"]; restarted.save(); restarted.browser = "chrome"; expect(restarted.consent).toEqual(["https://www.google.com"]);
});
test("newer/corrupt provider stores block overwrites and retain uncertain recovery", () => {
  for (const content of ["{bad", JSON.stringify({ version: 3, settings: providerDefaults }), JSON.stringify({ version: 2, browser: "firefox", settings: providerDefaults }), JSON.stringify({ settings: providerDefaults, chromeUncertain: "unknown" })]) {
    const path = directory(); writeFileSync(join(path, "providers.json"), content); const store = new ProviderStore(path, encryption);
    expect(store.locked).toBe(true); expect(store.chromeUncertain).toBe(true); expect(store.consent).toEqual([]); expect(() => store.save()).toThrow("provider_settings_locked"); expect(readFileSync(join(path, "providers.json"), "utf8")).toBe(content);
  }
});
test("browser choices are strict and registrations are separated by browser", () => {
  expect(appVersion).toBe(JSON.parse(readFileSync("package.json", "utf8")).version);
  expect(parseBrowser("edge")).toBe("edge"); for (const v of ["firefox", "Chrome", {}, null, "edge.exe --flag"]) expect(() => parseBrowser(v)).toThrow("unsupported_browser");
  expect(hostRegistryPaths("edge")).toEqual(["HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.latham.host"]);
  expect(hostRegistryPaths("chrome")).toHaveLength(2); expect(hostRegistryPaths("chrome").join()).not.toContain("Microsoft\\Edge");
});
test("wrong-browser and old-protocol relays cannot pair, current selected relay starts paused", async () => {
  const store = new ProviderStore(directory(), encryption), bridge = new ChromeBridge(store, () => {}); await bridge.start();
  try {
    for (const hello of [{ browser: "edge", protocol: nativeProtocol }, { browser: "chrome", protocol: 2 }]) {
      const socket = connect(bridge.pipe), closed = new Promise<void>(resolve => socket.once("close", () => resolve()));
      socket.write(frame({ type: "hello", token: bridge.token, origin: `chrome-extension://${extensionId}/`, ...hello })); await closed; expect(bridge.connected).toBe(false);
    }
    const socket = connect(bridge.pipe); socket.resume();
    try {
      socket.write(frame({ type: "hello", token: bridge.token, origin: `chrome-extension://${extensionId}/`, browser: "chrome", protocol: nativeProtocol }));
      socket.write(frame({ type: "ready", version: appVersion, protocol: nativeProtocol }));
      await vi.waitFor(() => expect(bridge.connected).toBe(true)); expect(bridge.active).toBe(false);
      bridge.disconnect(); expect(bridge.connected).toBe(false); expect(bridge.active).toBe(false); expect(bridge.siteState.every(s => !s.effective)).toBe(true);
      await new Promise<void>(resolve => socket.once("close", () => resolve())); expect(bridge.connected).toBe(false);
    } finally { socket.destroy(); }
  } finally { bridge.close(); }
});
test("window recovery handles negative displays, removal, scaling-sized work areas and oversized windows", () => {
  const primary = { x: 0, y: 0, width: 1280, height: 680 }, secondary = { x: -1920, y: -100, width: 1920, height: 1080 };
  expect(fitWindow({ x: -1800, y: 0, width: 1000, height: 800 }, [primary, secondary])).toEqual({ x: -1800, y: 0, width: 1000, height: 800 });
  expect(fitWindow({ x: -1800, y: 0, width: 1220, height: 940 }, [primary])).toEqual({ x: 0, y: 0, width: 1220, height: 680 });
  expect(fitWindow({ x: 8000, y: 8000, width: 1220, height: 940 }, [{ x: 0, y: 0, width: 640, height: 480 }])).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  expect(() => fitWindow(primary, [])).toThrow("invalid_display_bounds");
});
test("evaluation accepts bounded enum metadata only and rejects raw content/invalid counts", () => {
  expect(parseTrial(sample)).toEqual(sample);
  for (const input of [{ ...sample, url: "PRIVATE_URL" }, { ...sample, task: "PRIVATE_TRANSCRIPT" }, { ...sample, browser: "firefox" }, { ...sample, seconds: 0 }, { ...sample, seconds: NaN }, { ...sample, seconds: 3601 }, { ...sample, permissionPrompts: -1 }]) expect(() => parseTrial(input)).toThrow();
});
test("evaluation is explicit, bounded to fifty, retained across restart and clearable", () => {
  const path = directory(), store = new EvaluationStore(path); expect(store.trials).toEqual([]);
  for (let i = 1; i <= 51; i++) store.add({ ...sample, seconds: i });
  expect(store.trials).toHaveLength(50); expect(store.trials[0]?.seconds).toBe(2);
  expect(new EvaluationStore(path).trials).toEqual(store.trials); store.clear(); expect(new EvaluationStore(path).trials).toEqual([]);
});
test("unknown evaluation schema locks instead of overwriting; explicit clear recovers", () => {
  const path = directory(), bytes = JSON.stringify({ version: 2, trials: [sample] }); writeFileSync(join(path, "evaluation.json"), bytes);
  const store = new EvaluationStore(path); expect(store.locked).toBe(true); expect(() => store.add(sample)).toThrow("evaluation_locked"); expect(readFileSync(join(path, "evaluation.json"), "utf8")).toBe(bytes);
  store.clear(); store.add(sample); expect(store.trials).toEqual([sample]);
});
