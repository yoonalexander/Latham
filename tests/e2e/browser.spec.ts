import { test, expect, _electron, chromium, type Page } from "@playwright/test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { extensionId, hostName } from "../../apps/desktop/src/main/native-bridge";
import { wav } from "../../packages/speech/src/providers";

const google = `<!doctype html><html><head><title>Search fixture</title></head><body style="min-height:2400px"><form action="https://www.google.com/search" method="get"><label>Search<textarea name="q" aria-label="Search"></textarea></label><input type="submit" name="btnK" aria-label="Google Search" value="Google Search"></form><label>Password<input type="password" value="PRIVATE_PASSWORD_SENTINEL"></label><input type="file"><button id="continue">Continue</button><button>Apply for job</button><label>Nickname<input id="autosave"></label><button>Easy Apply</button><iframe src="https://denied.example/frame"></iframe><output id="effects">0</output><script>document.querySelector('#continue').onclick=()=>document.querySelector('#effects').textContent='1';document.querySelector('#autosave').oninput=()=>document.querySelector('#effects').textContent='1';</script></body></html>`;
const youtube = `<!doctype html><html><head><title>YouTube fixture</title></head><body style="min-height:2400px"><yt-searchbox><form action="/results" method="get"><label>Search<input name="search_query" type="text"></label></form><button aria-label="Search">Search</button></yt-searchbox><ytd-video-renderer><a id="video-title" href="/watch?v=abcdefghijk">Piano lesson</a></ytd-video-renderer><ytd-video-renderer><a id="video-title" href="/watch?v=lmnopqrstuv">Piano lesson</a></ytd-video-renderer><button>Send message</button></body></html>`;
function backupRegistry(): () => void {
  const values = ["Google\\Chrome", "Chromium"].map(browser => { const path = `HKCU\\Software\\${browser}\\NativeMessagingHosts\\${hostName}`; try { return { path, value: execFileSync("reg.exe", ["QUERY", path, "/ve"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).match(/REG_SZ\s+(.+)/)?.[1]?.trim() }; } catch { return { path }; } });
  return () => { for (const item of values) { try { if (item.value) execFileSync("reg.exe", ["ADD", item.path, "/ve", "/t", "REG_SZ", "/d", item.value, "/f"], { stdio: "ignore" }); else execFileSync("reg.exe", ["DELETE", item.path, "/f"], { stdio: "ignore" }); } catch {} } };
}
async function setup() {
  mkdirSync(".test-artifacts", { recursive: true }); const restore = backupRegistry(), directory = mkdtempSync(resolve(".test-artifacts/page-app-"));
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const tone = new Int16Array(32000); for (let i = 0; i < tone.length; i++) tone[i] = Math.round(8000 * Math.sin(i * Math.PI * 880 / 16000)); const capture = join(directory, "capture.wav"); writeFileSync(capture, wav(new Uint8Array(tone.buffer)));
  const app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${capture}`], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  await expect.poll(() => app.context().pages().some(page => page.url() === "latham://app/index.html")).toBe(true);
  const desk = app.context().pages().find(page => page.url() === "latham://app/index.html")!; await desk.evaluate(() => window.setup.installHost());
  // Install-time grants are an isolated fixture arrangement. Production optional prompts have separate native acceptance.
  const extension = mkdtempSync(resolve(".test-artifacts/page-extension-")); cpSync("dist/chrome-extension", extension, { recursive: true }); const manifest = JSON.parse(readFileSync(join(extension, "manifest.json"), "utf8")); manifest.host_permissions = manifest.optional_host_permissions; delete manifest.optional_host_permissions; writeFileSync(join(extension, "manifest.json"), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(mkdtempSync(resolve(".test-artifacts/page-browser-")), { executablePath: resolve(".test-artifacts/chromium-runtime/latham-test-browser.exe"), headless: false, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  await context.route("https://www.google.com/**", route => route.fulfill({ contentType: "text/html", body: google })); await context.route("https://www.youtube.com/**", route => route.fulfill({ contentType: "text/html", body: youtube })); await context.route("https://denied.example/**", route => route.fulfill({ body: "DENIED_FRAME_SENTINEL" }));
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`); await popup.getByRole("button", { name: "Connect to Latham" }).click();
  await expect.poll(() => desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true);
  for (let index = 0; index < 2; index++) await popup.locator(".site").nth(index).getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => desk.evaluate(async () => (await window.setup.state()).sites.every(site => site.effective))).toBe(true);
  const page = await context.newPage(); await page.goto("https://www.google.com/");
  await desk.evaluate(() => window.setup.chromeResume());
  return { desk, page, context, app, directory, close: async () => { for (const worker of context.serviceWorkers()) await worker.evaluate("port?.disconnect()").catch(() => {}); await context.close(); await app.close(); restore(); } };
}
async function run(desk: Page, command: string): Promise<void> { await desk.evaluate(command => window.setup.chromeRun(command), command); }
async function verified(desk: Page): Promise<void> { expect((await desk.evaluate(() => window.setup.state())).page.last?.outcome).toBe("verified"); }
test("Chrome scoped fields, literal dictation, correction, undo, search and excluded effects", async () => {
  test.setTimeout(60000); const f = await setup();
  try {
    await run(f.desk, "inspect page"); await verified(f.desk);
    const state = await f.desk.evaluate(() => window.setup.state()); expect(JSON.stringify(state)).not.toContain("PRIVATE_PASSWORD_SENTINEL"); expect(JSON.stringify(state)).not.toContain("DENIED_FRAME_SENTINEL");
    expect(state.page.targets).toEqual([{ name: "Search", role: "textbox" }, { name: "Search", role: "button" }]);
    await run(f.desk, "focus Search"); await verified(f.desk); await run(f.desk, "start dictation"); await verified(f.desk);
    await run(f.desk, "dictate piano"); await verified(f.desk); await expect(f.page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("piano");
    await run(f.desk, "correct that to violin"); await verified(f.desk); await expect(f.page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("violin");
    await run(f.desk, "undo dictation"); await verified(f.desk); await expect(f.page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("");
    await run(f.desk, "replace dictation with open a new tab"); await verified(f.desk); await expect(f.page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("open a new tab");
    await run(f.desk, "click Search"); await verified(f.desk); await expect(f.page).toHaveURL("https://www.google.com/search?q=open+a+new+tab");
    await run(f.desk, "filter images"); await verified(f.desk); await expect(f.page).toHaveURL("https://www.google.com/search?q=open+a+new+tab&udm=2");
    await run(f.desk, "scroll down"); await verified(f.desk); expect(await f.page.evaluate(() => scrollY)).toBeGreaterThan(0);
    for (const command of ["focus Password", "click Continue", "click Apply for job", "click Easy Apply", "click Send message", "focus Account nickname"]) { await run(f.desk, command); expect((await f.desk.evaluate(() => window.setup.state())).page.last?.outcome).toBe("blocked"); }
    await expect(f.page.locator("#effects")).toHaveText("0");
  } finally { await f.close(); }
});
test("100 bound DOM operations verify effects through both reviewed site profiles", async () => {
  test.setTimeout(120000); const f = await setup(), samples: number[] = [];
  try {
    for (const origin of ["https://www.google.com/", "https://www.youtube.com/"]) {
      await f.desk.evaluate(() => window.latham.stop()); await f.page.goto(origin);
      await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true); await f.desk.evaluate(() => window.setup.chromeResume());
      for (const command of ["focus Search", "start dictation"]) { await run(f.desk, command); await verified(f.desk); samples.push((await f.desk.evaluate(() => window.setup.state())).page.last!.elapsedMs); }
      for (let index = 0; index < 12; index++) {
        for (const command of [`replace dictation with base ${index}`, "dictate extra", "correct that to fixed", "undo dictation"]) { await run(f.desk, command); await verified(f.desk); samples.push((await f.desk.evaluate(() => window.setup.state())).page.last!.elapsedMs); }
        await expect(f.page.locator(origin.includes("google") ? 'textarea[name="q"]' : 'input[name="search_query"]')).toHaveValue(`base ${index}`);
      }
    }
    expect(samples).toHaveLength(100); const sorted = [...samples].sort((a, b) => a - b);
    writeFileSync(".test-artifacts/phase2-dom-benchmark.json", JSON.stringify({ at: new Date().toISOString(), setup: "isolated routed-origin fixtures with explicit Latham consent and test install-time host grants", route: "deterministic; no model calls", verified: 100, wrongEffects: 0, medianMs: sorted[49], p95Ms: sorted[94], samples }, null, 2));
  } finally { await f.close(); }
});
test("Prepare Search dictation keeps the field bound while the user records in Latham", async () => {
  test.setTimeout(60000); const f = await setup();
  try {
    await f.desk.evaluate(async () => { const s = await window.setup.state(); await window.setup.save({ ...s.settings, mode: "cloud" }); await window.setup.key("FAKE_SYNTHETIC_PROVIDER_KEY_123456"); });
    await f.app.evaluate(() => { Reflect.set(globalThis, "fetch", async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "piano music" }] } }] })); });
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true);
    await f.desk.getByRole("button", { name: "Prepare Search dictation", exact: true }).click();
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).page.dictation)).toBe("Search");
    const talk = f.desk.getByRole("button", { name: "Hold to talk", exact: true }); const bounds = await talk.boundingBox(); expect(bounds).not.toBeNull();
    await f.desk.mouse.move(bounds!.x + 20, bounds!.y + 15); await f.desk.mouse.down();
    await expect(f.desk.getByTestId("voice-status")).toHaveText("Voice: recording");
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).page.dictation)).toBe("Search");
    await f.desk.waitForTimeout(1200); await f.desk.mouse.up();
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).voice)).toBe("idle");
    expect((await f.desk.evaluate(() => window.setup.state())).error).toBe("");
    await expect(f.desk.getByLabel("Final transcript", { exact: true })).toHaveValue("piano music");
    await expect(f.desk.getByRole("button", { name: "Replace field with transcript", exact: true })).toBeEnabled();
    await f.desk.getByRole("button", { name: "Replace field with transcript", exact: true }).click();
    await expect(f.page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("piano music");
    await f.desk.getByRole("radio", { name: "Use local AI", exact: true }).check(); await expect(talk).toBeDisabled();
  } finally { await f.close(); }
});
test("dictation suspends on user edits and focus changes; documents, pause and revoke prevent stale entry", async () => {
  test.setTimeout(60000); const f = await setup();
  try {
    await run(f.desk, "focus Search"); await run(f.desk, "start dictation"); await run(f.desk, "dictate owned");
    await f.page.getByRole("textbox", { name: "Search", exact: true }).fill("USER_EDIT");
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).chromeActive)).toBe(false);
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true);
    await f.desk.evaluate(() => window.setup.chromeResume()); await run(f.desk, "undo dictation"); expect((await f.desk.evaluate(() => window.setup.state())).page.last?.outcome).toBe("blocked"); await expect(f.page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("USER_EDIT");
    await run(f.desk, "focus Search"); await run(f.desk, "start dictation"); await f.page.locator("#autosave").focus();
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).page.dictation)).toBeNull();
    await f.desk.evaluate(() => window.setup.revoke("https://www.google.com")); expect((await f.desk.evaluate(() => window.setup.state())).sites[0]!.effective).toBe(false);
    await expect(f.page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("USER_EDIT");
  } finally { await f.close(); }
});
test("duplicate result clarification stays bound and safe read navigation is verified", async () => {
  test.setTimeout(60000); const f = await setup();
  try {
    await f.page.goto("https://www.youtube.com/results?search_query=piano");
    await f.desk.evaluate(() => window.latham.stop());
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true); await f.desk.evaluate(() => window.setup.chromeResume());
    await run(f.desk, "click Piano lesson"); expect((await f.desk.evaluate(() => window.setup.state())).page.clarification).toHaveLength(2);
    await run(f.desk, "choose 2"); await verified(f.desk); await expect(f.page).toHaveURL("https://www.youtube.com/watch?v=lmnopqrstuv");
    await run(f.desk, "search music"); await verified(f.desk); await expect(f.page).toHaveURL("https://www.youtube.com/results?search_query=music");
  } finally { await f.close(); }
});
test("replaced nodes and late provider replies never reach a new document or session", async () => {
  test.setTimeout(60000); const f = await setup();
  try {
    await f.page.goto("https://www.youtube.com/results?search_query=piano"); await f.desk.evaluate(() => window.latham.stop());
    await f.desk.evaluate(async () => { const s = await window.setup.state(); await window.setup.save({ ...s.settings, mode: "cloud" }); await window.setup.key("FAKE_SYNTHETIC_PROVIDER_KEY_123456"); });
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true); await f.desk.evaluate(() => window.setup.chromeResume());
    await f.app.evaluate(() => {
      Reflect.set(globalThis, "fetch", (_url: unknown, init: { body: string }) => new Promise(resolve => {
        const candidates = JSON.parse(JSON.parse(init.body).contents[0].parts[0].text).candidates;
        Reflect.set(globalThis, "releaseSyntheticSelection", () => resolve(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ candidateId: candidates[0].id }) }] } }] })));
      }));
    });
    const pending = run(f.desk, "click the piano video");
    await expect.poll(() => f.app.evaluate(() => typeof Reflect.get(globalThis, "releaseSyntheticSelection"))).toBe("function");
    await f.page.locator("a#video-title").first().evaluate(node => node.replaceWith(node.cloneNode(true)));
    await f.app.evaluate(() => Reflect.get(globalThis, "releaseSyntheticSelection")()); await pending;
    expect((await f.desk.evaluate(() => window.setup.state())).page.last?.outcome).toBe("blocked"); await expect(f.page).toHaveURL(/\/results/);
    await f.app.evaluate(() => Reflect.deleteProperty(globalThis, "releaseSyntheticSelection"));
    const late = run(f.desk, "click the piano video"); await expect.poll(() => f.app.evaluate(() => typeof Reflect.get(globalThis, "releaseSyntheticSelection"))).toBe("function");
    await f.desk.evaluate(() => window.latham.stop()); await f.app.evaluate(() => Reflect.get(globalThis, "releaseSyntheticSelection")()); await late;
    expect((await f.desk.evaluate(() => window.setup.state())).chromeActive).toBe(false); await expect(f.page).toHaveURL(/\/results/);
  } finally { await f.close(); }
});
test("lost edit acknowledgement stays uncertain and correction cannot erase a later page change", async () => {
  test.setTimeout(60000); const f = await setup();
  try {
    await run(f.desk, "focus Search"); await run(f.desk, "start dictation");
    await f.page.evaluate(() => { document.querySelector('textarea[name="q"]')!.addEventListener("input", () => setTimeout(() => { (document.querySelector('textarea[name="q"]') as HTMLTextAreaElement).value = "PAGE_CHANGED_AFTER_INPUT"; }, 10), { once: true }); });
    await run(f.desk, "dictate assistant edit");
    expect((await f.desk.evaluate(() => window.setup.state())).chromeNeedsReview).toBe(true);
    expect(JSON.parse(readFileSync(join(f.directory, "providers.json"), "utf8")).chromeUncertain).toBe(true);
    await expect(f.page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("PAGE_CHANGED_AFTER_INPUT");
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true);
    await f.desk.evaluate(() => window.setup.reconcileChrome()); await f.desk.evaluate(() => window.setup.chromeResume());
    await run(f.desk, "undo dictation"); expect((await f.desk.evaluate(() => window.setup.state())).page.last?.outcome).toBe("blocked");
    await expect(f.page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("PAGE_CHANGED_AFTER_INPUT");
  } finally { await f.close(); }
});
