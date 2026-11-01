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
async function setup(imageGrant = true) {
  mkdirSync(".test-artifacts", { recursive: true }); const restore = backupRegistry(), directory = mkdtempSync(resolve(".test-artifacts/page-app-"));
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const tone = new Int16Array(32000); for (let i = 0; i < tone.length; i++) tone[i] = Math.round(8000 * Math.sin(i * Math.PI * 880 / 16000)); const capture = join(directory, "capture.wav"); writeFileSync(capture, wav(new Uint8Array(tone.buffer)));
  const app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${capture}`], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  await expect.poll(() => app.context().pages().some(page => page.url() === "latham://app/index.html")).toBe(true);
  const desk = app.context().pages().find(page => page.url() === "latham://app/index.html")!; await desk.evaluate(() => window.setup.installHost());
  // Install-time grants are an isolated fixture arrangement. Production optional prompts have separate native acceptance.
  const extension = mkdtempSync(resolve(".test-artifacts/page-extension-")); cpSync("dist/chrome-extension", extension, { recursive: true }); const manifest = JSON.parse(readFileSync(join(extension, "manifest.json"), "utf8")); manifest.host_permissions = manifest.optional_host_permissions.filter((origin: string) => imageGrant || !origin.includes("ytimg")); manifest.optional_host_permissions = manifest.optional_host_permissions.filter((origin: string) => !manifest.host_permissions.includes(origin)); writeFileSync(join(extension, "manifest.json"), JSON.stringify(manifest));
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
async function verified(desk: Page): Promise<void> { const result = (await desk.evaluate(() => window.setup.state())).page.last; expect(result?.outcome, result?.reason).toBe("verified"); }
const visualIds = ["abcdefghijk", "lmnopqrstuv", "12345678901", "ZXCVBNMasdf"];
async function visualFixture(imageGrant = true) {
  const f = await setup(imageGrant);
  const html = `<!doctype html><html><body style="min-height:2400px;font:16px Arial"><yt-searchbox><form><input name="search_query" aria-label="Search"></form><button aria-label="Search">Search</button></yt-searchbox><main style="display:grid;grid-template-columns:240px 240px;gap:16px;margin:20px">${visualIds.map(id => `<ytd-video-renderer style="display:block"><a href="/watch?v=${id}"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" width="192" height="108"></a><a id="video-title" style="display:block" href="/watch?v=${id}">Same video title</a></ytd-video-renderer>`).join("")}</main><input type="password" value="PRIVATE_VISUAL_PASSWORD" style="position:fixed;right:0;top:0"><iframe src="https://denied.example/frame" style="position:fixed;right:0;bottom:0"></iframe><div style="position:fixed;right:0;top:100px">PRIVATE_VISUAL_OVERLAY</div></body></html>`;
  await f.context.route("https://www.youtube.com/**", route => route.fulfill({ contentType: "text/html", body: html }));
  const assets = visualIds.map((id, index) => ({ url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, image: readFileSync(resolve(`.test-artifacts/visual-corpus/${index}.jpg`)).toString("base64") }));
  await f.context.route("https://i.ytimg.com/**", route => { const address = new URL(route.request().url()), asset = assets.find(a => a.url === address.origin + address.pathname); return route.fulfill({ contentType: "image/jpeg", body: Buffer.from(asset?.image ?? "", "base64") }); });
  const worker = f.context.serviceWorkers()[0]!;
  await worker.evaluate(({ assets }) => {
    const request = globalThis.fetch; Reflect.set(globalThis, "visualAssetRequests", []);
    Reflect.set(globalThis, "fetch", async (...args: Parameters<typeof fetch>) => { const asset = assets.find(a => a.url === String(args[0])); if (!asset) return request(...args); (Reflect.get(globalThis, "visualAssetRequests") as string[]).push(asset.url); return new Response(Uint8Array.from(atob(asset.image), c => c.charCodeAt(0)), { headers: { "Content-Type": "image/jpeg" } }); });
  }, { assets });
  await f.desk.evaluate(() => window.latham.stop()); await f.page.goto("https://www.youtube.com/results?search_query=visual"); await f.page.bringToFront(); await f.page.locator("img").first().waitFor();
  await f.page.evaluate(() => { document.querySelector("img")!.src += "?sqp=synthetic_layout&rs=synthetic_signature"; });
  await expect.poll(() => f.page.evaluate(() => [...document.images].every(img => img.complete && img.naturalWidth > 0))).toBe(true);
  await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true); await f.desk.evaluate(() => window.setup.chromeResume());
  await f.desk.evaluate(() => window.setup.visualPermission(true)); return { ...f, worker };
}

test("visual source capture excludes denied pixels and OCR proposes then verifies a reviewed navigation", async () => {
  test.setTimeout(90000); const f = await visualFixture();
  try {
    await f.desk.evaluate(() => window.setup.visualFind({ text: "text PIANO", route: "ocr", model: "llava" }));
    const state = (await f.desk.evaluate(() => window.setup.state())).visual;
    expect(state.message).toContain("outlined"); expect(state.candidates).toHaveLength(4); expect(state.proposed).toBe(state.candidates[0]!.id);
    expect(state.candidates.map(c => c.text).join(" ")).not.toMatch(/PRIVATE|PASSWORD|DENIED/);
    writeFileSync(".test-artifacts/visual-captured-fixture.json", JSON.stringify({ source: "synthetic approved JPEG assets through the real extension capture/OCR path; not full-screen capture", candidates: state.candidates }, null, 2));
    expect((await f.worker.evaluate(() => Reflect.get(globalThis, "visualAssetRequests")) as string[])).toEqual(visualIds.map(id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`));
    await f.page.evaluate(() => { document.body.style.zoom = "1.1"; });
    await f.desk.evaluate(() => window.setup.visualFind({ text: "text PIANO", route: "ocr", model: "llava" }));
    expect((await f.desk.evaluate(() => window.setup.state())).visual.candidates[0]!.rect.width).toBeGreaterThan(state.candidates[0]!.rect.width);
    await expect(f.page.locator('[aria-label="Latham proposed video"]')).toBeVisible();
    await f.desk.getByRole("region", { name: "Visual thumbnail matching" }).screenshot({ path: ".test-artifacts/phase5-visual-preview.png" });
    await f.desk.getByRole("button", { name: "Open highlighted video", exact: true }).click();
    await expect(f.page).toHaveURL("https://www.youtube.com/watch?v=abcdefghijk"); await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).visual.message)).toBe("Video navigation verified.");
  } finally { await f.close(); }
});

test("visual geometry, zoom, overlays and replaced images invalidate proposals without a coordinate click", async () => {
  test.setTimeout(180000); const f = await visualFixture();
  try {
    for (const change of ["scroll", "scale", "replace", "overlay"]) {
      await expect.poll(() => f.page.evaluate(() => [...document.images].every(img => img.complete && img.naturalWidth > 0))).toBe(true);
      await f.desk.evaluate(() => window.setup.visualFind({ text: "text PIANO", route: "ocr", model: "llava" }));
      const state = (await f.desk.evaluate(() => window.setup.state())).visual; expect(state.proposed, state.message).toBeTruthy();
      await f.page.evaluate(change => {
        if (change === "scroll") scrollBy(0, 10);
        if (change === "scale") document.body.style.zoom = "1.1";
        if (change === "replace") { const image = document.querySelector("img")!; image.replaceWith(image.cloneNode(true)); }
        if (change === "overlay") { const cover = document.createElement("div"); cover.id = "test-cover"; cover.style.cssText = "position:fixed;inset:0;background:white;z-index:999"; document.body.append(cover); }
      }, change);
      await expect(f.page.locator('[aria-label="Latham proposed video"]')).toHaveCount(0);
      await f.desk.evaluate(() => window.setup.visualOpen()); expect((await f.desk.evaluate(() => window.setup.state())).visual.ready).toBe(false); await expect(f.page).toHaveURL(/\/results\?/);
      await f.page.evaluate(() => { document.body.style.zoom = ""; document.getElementById("test-cover")?.remove(); scrollTo(0, 0); });
    }
  } finally { await f.close(); }
});

test("visual capture respects image grants, blocked overlays, ambiguous matches and Stop", async () => {
  test.setTimeout(90000); const f = await visualFixture();
  try {
    await f.page.evaluate(() => { const cover = document.createElement("div"); cover.id = "test-cover"; cover.style.cssText = "position:fixed;inset:0;background:white;z-index:999"; document.body.append(cover); });
    await f.desk.evaluate(() => window.setup.visualFind({ text: "PIANO", route: "ocr", model: "llava" })); expect((await f.desk.evaluate(() => window.setup.state())).visual.candidates).toEqual([]);
    expect(await f.worker.evaluate(() => (Reflect.get(globalThis, "visualAssetRequests") as string[]).length)).toBe(0); await f.page.locator("#test-cover").evaluate(node => node.remove());
    await f.desk.evaluate(() => window.setup.visualFind({ text: "topmost thumbnail", route: "ocr", model: "llava" })); const state = (await f.desk.evaluate(() => window.setup.state())).visual;
    expect(state.message).toContain("Several"); expect(state.proposed).toBe(null); await expect(f.desk.getByRole("button", { name: "Open highlighted video", exact: true })).toBeDisabled();
    await f.worker.evaluate("send({ type: 'context_changed' })"); await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).visual.consent)).toBe(false);
    await f.desk.evaluate(() => window.latham.stop()); expect((await f.desk.evaluate(() => window.setup.state())).visual).toMatchObject({ consent: false, candidates: [], proposed: null });
    await expect(f.page.locator('[aria-label="Latham proposed video"]')).toHaveCount(0);
  } finally { await f.close(); }
  const denied = await visualFixture(false);
  try { await denied.desk.evaluate(() => window.setup.visualFind({ text: "PIANO", route: "ocr", model: "llava" })); expect((await denied.desk.evaluate(() => window.setup.state())).visual.message).toContain("extension"); expect(await denied.worker.evaluate(() => (Reflect.get(globalThis, "visualAssetRequests") as string[]).length)).toBe(0); }
  finally { await denied.close(); }
});

test("visual provider failure and a late cloud match after Stop cannot open a video", async () => {
  test.setTimeout(90000); const f = await visualFixture();
  try {
    await f.app.evaluate(() => { Reflect.set(globalThis, "fetch", async () => new Response("PRIVATE_ERROR", { status: 503 })); });
    await f.desk.evaluate(() => window.setup.key("FAKE_VISUAL_PROVIDER_KEY_123456789"));
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true); await f.desk.evaluate(() => window.setup.chromeResume()); await f.desk.evaluate(() => window.setup.visualPermission(true));
    await f.desk.evaluate(() => window.setup.visualFind({ text: "blue circle", route: "cloud", model: "llava" })); expect((await f.desk.evaluate(() => window.setup.state())).visual.message).toContain("unavailable");
    await f.app.evaluate(() => { Reflect.set(globalThis, "fetch", (_url: unknown, init: RequestInit) => new Promise<Response>(resolve => { const body = JSON.parse(String(init.body)); const id = JSON.parse(body.contents[0].parts[0].text).candidates[0].id; Reflect.set(globalThis, "releaseVisual", () => resolve(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ candidateIds: [id] }) }] } }] }))); })); });
    const pending = f.desk.evaluate(() => window.setup.visualFind({ text: "blue circle", route: "cloud", model: "llava" }));
    await expect.poll(() => f.app.evaluate(() => typeof Reflect.get(globalThis, "releaseVisual")), { timeout: 30000 }).toBe("function");
    await f.desk.evaluate(() => window.latham.stop()); await f.app.evaluate(() => (Reflect.get(globalThis, "releaseVisual") as () => void)()); await pending;
    expect((await f.desk.evaluate(() => window.setup.state())).visual).toMatchObject({ consent: false, proposed: null, candidates: [] }); await expect(f.page).toHaveURL(/\/results\?/);
  } finally { await f.close(); }
});
function audioPcm(path: string): Buffer {
  const bytes = readFileSync(path); for (let at = 12; at + 8 < bytes.length;) { const length = bytes.readUInt32LE(at + 4); if (bytes.toString("ascii", at, at + 4) === "data") return bytes.subarray(at + 8, at + 8 + length); at += 8 + length + length % 2; } throw Error("missing_audio");
}
async function feedSession(desk: Page, id: string, cursor: { sequence: number }, bytes: Buffer): Promise<void> {
  for (let offset = 0; offset < bytes.length; offset += 4096) {
    if ((await desk.evaluate(() => window.setup.state())).handsfree.id !== id) return;
    const chunk = [...bytes.subarray(offset, offset + 4096)]; if (chunk.length < 320) chunk.push(...new Array(320 - chunk.length).fill(0));
    await desk.evaluate(({ id, sequence, chunk }) => window.setup.handsfreeFrame(id, sequence, new Uint8Array(chunk).buffer), { id, sequence: cursor.sequence++, chunk });
    await new Promise(resolve => setTimeout(resolve, 128));
  }
}
async function configureHandsfree(f: Awaited<ReturnType<typeof setup>>): Promise<void> {
  await f.desk.evaluate(async () => { const s = await window.setup.state(); await window.setup.save({ ...s.settings, mode: "cloud" }); await window.setup.key("FAKE_HANDSFREE_PROVIDER_KEY_123456"); });
  await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true);
  await f.desk.evaluate(() => window.setup.chromeResume());
}

test("hands-free successive commands use current permissions and local stop interrupts delayed cloud transcription", async () => {
  test.setTimeout(60000); const f = await setup();
  try {
    await configureHandsfree(f);
    await f.app.evaluate(() => { Reflect.set(globalThis, "handsfreeRequests", 0); Reflect.set(globalThis, "fetch", async () => { Reflect.set(globalThis, "handsfreeRequests", Number(Reflect.get(globalThis, "handsfreeRequests")) + 1); return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "scroll down" }] } }] }); }); });
    const id = await f.desk.evaluate(() => window.setup.startHandsfree({ target: "chrome", wake: false })), cursor = { sequence: 0 };
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).handsfree.stopReady)).toBe(true);
    const commandAudio = Buffer.concat([audioPcm(resolve(".test-artifacts/speech-corpus/06.wav")), Buffer.alloc(32000)]);
    for (let index = 0; index < 2; index++) {
      await feedSession(f.desk, id, cursor, commandAudio);
      await expect.poll(() => f.app.evaluate(() => Number(Reflect.get(globalThis, "handsfreeRequests")))).toBe(index + 1);
      await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).handsfree.phase)).toBe("listening");
    }
    expect(await f.page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await f.app.evaluate(() => { Reflect.set(globalThis, "fetch", () => new Promise<Response>(resolve => { Reflect.set(globalThis, "resolveHandsfree", () => resolve(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "dictate late text" }] } }] }))); })); });
    await feedSession(f.desk, id, cursor, commandAudio); await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).handsfree.phase)).toBe("transcribing");
    const stopAudio = audioPcm(resolve(".test-artifacts/detector-corpus/zira-0.wav")), started = performance.now();
    await feedSession(f.desk, id, cursor, Buffer.concat([stopAudio, Buffer.alloc(64000)]));
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).handsfree.phase)).toBe("off");
    const stoppedMs = Math.round(performance.now() - started);
    expect((await f.desk.evaluate(() => window.setup.state())).handsfree.message).toContain("stop assistant");
    await f.app.evaluate(() => (Reflect.get(globalThis, "resolveHandsfree") as () => void)());
    expect((await f.desk.evaluate(() => window.setup.state())).transcript).toBe("");
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true);
    await expect(f.page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("");
    writeFileSync(".test-artifacts/handsfree-interruption.json", JSON.stringify({ source: "synthetic PCM through real local detector during deliberately delayed provider", stoppedMs, speechMs: stopAudio.length / 32, noLateInsertion: true, twoVerifiedCommands: true }, null, 2));
  } finally { await f.close(); }
});

test("hands-free wake audio stays local until the separate phrase; detector loss cancels the session", async () => {
  test.setTimeout(60000); const f = await setup();
  try {
    await configureHandsfree(f);
    await f.app.evaluate(() => { Reflect.set(globalThis, "handsfreeRequests", 0); Reflect.set(globalThis, "fetch", async () => { Reflect.set(globalThis, "handsfreeRequests", Number(Reflect.get(globalThis, "handsfreeRequests")) + 1); return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "inspect page" }] } }] }); }); });
    const id = await f.desk.evaluate(() => window.setup.startHandsfree({ target: "chrome", wake: true })), cursor = { sequence: 0 };
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).handsfree.phase)).toBe("armed");
    await feedSession(f.desk, id, cursor, Buffer.concat([audioPcm(resolve(".test-artifacts/detector-corpus/zira-4.wav")), Buffer.alloc(32000)]));
    expect(await f.app.evaluate(() => Reflect.get(globalThis, "handsfreeRequests"))).toBe(0);
    await feedSession(f.desk, id, cursor, Buffer.concat([audioPcm(resolve(".test-artifacts/detector-corpus/zira-1.wav")), Buffer.alloc(32000)]));
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).handsfree.phase)).toBe("listening");
    expect(await f.app.evaluate(() => Reflect.get(globalThis, "handsfreeRequests"))).toBe(0);
    const parent = await f.app.evaluate(() => process.pid), executable = resolve("dist/native/Latham.SpeechDetector.exe").replaceAll("'", "''");
    execFileSync("powershell.exe", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${parent} -and $_.ExecutablePath -eq '${executable}' -and $_.CommandLine -match 'stop' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { stdio: "ignore" });
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).handsfree.phase)).toBe("off");
    expect((await f.desk.evaluate(() => window.setup.state())).handsfree.message).toContain("detector failed");
  } finally { await f.close(); }
});

test("hands-free capture uses the selected microphone and disconnect closes it and pauses Chrome", async () => {
  test.setTimeout(60000); const f = await setup();
  try {
    await configureHandsfree(f);
    await f.desk.evaluate(() => { const request = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = async constraints => { const stream = await request(constraints); Reflect.set(globalThis, "handsfreeTrack", stream.getAudioTracks()[0]); return stream; }; });
    await f.desk.getByRole("checkbox", { name: "Wait for local" }).check();
    await f.desk.getByRole("button", { name: "Enable hands-free microphone", exact: true }).click();
    await expect(f.desk.getByTestId("handsfree-status")).toContainText("armed");
    await expect(f.desk.getByRole("button", { name: "Hold to talk", exact: true })).toBeDisabled();
    await f.desk.evaluate(() => (Reflect.get(globalThis, "handsfreeTrack") as MediaStreamTrack).dispatchEvent(new Event("ended")));
    await expect(f.desk.getByTestId("handsfree-status")).toContainText("Microphone: OFF");
    expect((await f.desk.evaluate(() => window.setup.state())).chromeActive).toBe(false);
    expect(await f.desk.evaluate(() => (Reflect.get(globalThis, "handsfreeTrack") as MediaStreamTrack).readyState)).toBe("ended");
  } finally { await f.close(); }
});

test("local spoken stop reaches the executor fence while an actual edit waits for verification", async () => {
  test.setTimeout(60000); const f = await setup();
  try {
    await configureHandsfree(f); await run(f.desk, "focus Search"); await run(f.desk, "start dictation");
    await f.app.evaluate(() => { Reflect.set(globalThis, "fetch", async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "dictate pending edit" }] } }] })); });
    const worker = f.context.serviceWorkers()[0]!;
    await worker.evaluate("const originalHandsfreeCall = callPage; callPage = async (scope, request) => { if (request.op === 'verify') return new Promise(resolve => { globalThis.releaseHandsfreeVerification = async () => resolve(await originalHandsfreeCall(scope, request)); }); return originalHandsfreeCall(scope, request); };");
    const id = await f.desk.evaluate(() => window.setup.startHandsfree({ target: "chrome", wake: false })), cursor = { sequence: 0 };
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).handsfree.stopReady)).toBe(true);
    await feedSession(f.desk, id, cursor, Buffer.concat([audioPcm(resolve(".test-artifacts/speech-corpus/06.wav")), Buffer.alloc(32000)]));
    await expect(f.page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("pending edit");
    await expect.poll(() => worker.evaluate("typeof globalThis.releaseHandsfreeVerification")).toBe("function");
    expect((await f.desk.evaluate(() => window.setup.state())).handsfree.phase).toBe("executing");
    const started = performance.now(); await feedSession(f.desk, id, cursor, Buffer.concat([audioPcm(resolve(".test-artifacts/detector-corpus/zira-0.wav")), Buffer.alloc(64000)]));
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).handsfree.phase)).toBe("off"); const detectedMs = Math.round(performance.now() - started), fenceStarted = performance.now();
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true);
    const fenceObservedAfterStopMs = Math.round(performance.now() - fenceStarted);
    expect((await f.desk.evaluate(() => window.setup.state())).chromeNeedsReview).toBe(true);
    await worker.evaluate("globalThis.releaseHandsfreeVerification()");
    await expect(f.page.getByRole("textbox", { name: "Search", exact: true })).toHaveValue("pending edit");
    expect((await f.desk.evaluate(() => window.setup.state())).handsfree.phase).toBe("off");
    writeFileSync(".test-artifacts/handsfree-verification-stop.json", JSON.stringify({ detectedMs, fenceObservedAfterStopMs, alreadyDispatchedEditPreserved: true, uncertaintyRequired: true, lateResultDidNotResume: true }, null, 2));
  } finally { await f.close(); }
});
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
      await f.desk.evaluate(() => window.latham.stop()); await f.page.goto(origin); await f.page.bringToFront();
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
    await f.desk.evaluate(() => {
      const original = AudioContext.prototype.createScriptProcessor;
      AudioContext.prototype.createScriptProcessor = function (...args) { const node = original.apply(this, args); node.addEventListener("audioprocess", event => Reflect.set(globalThis, "testCapturedSamples", Number(Reflect.get(globalThis, "testCapturedSamples") ?? 0) + event.inputBuffer.length)); return node; };
    });
    const talk = f.desk.getByRole("button", { name: "Hold to talk", exact: true }); const bounds = await talk.boundingBox(); expect(bounds).not.toBeNull();
    await f.desk.mouse.move(bounds!.x + 20, bounds!.y + 15); await f.desk.mouse.down();
    await expect(f.desk.getByTestId("voice-status")).toHaveText("Voice: recording");
    await expect.poll(() => f.desk.evaluate(async () => (await window.setup.state()).page.dictation)).toBe("Search");
    await expect.poll(() => f.desk.evaluate(() => Number(Reflect.get(globalThis, "testCapturedSamples") ?? 0))).toBeGreaterThanOrEqual(8000); await f.desk.mouse.up();
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
