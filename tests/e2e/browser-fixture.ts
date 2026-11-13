import { expect, _electron, chromium, type Page, type BrowserContext, type ElectronApplication } from "@playwright/test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, lstatSync, existsSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { extensionId, hostName } from "../../apps/desktop/src/main/native-bridge";
import { wav } from "../../packages/speech/src/providers";

export const google = `<!doctype html><html><head><title>Search fixture</title></head><body style="min-height:2400px"><form action="https://www.google.com/search" method="get"><label>Search<textarea name="q" aria-label="Search"></textarea></label><input type="submit" name="btnK" aria-label="Google Search" value="Google Search"></form><label>Password<input type="password" value="PRIVATE_PASSWORD_SENTINEL"></label><input type="file"><button id="continue">Continue</button><button>Apply for job</button><label>Nickname<input id="autosave"></label><button>Easy Apply</button><iframe src="https://denied.example/frame"></iframe><output id="effects">0</output><script>document.querySelector('#continue').onclick=()=>document.querySelector('#effects').textContent='1';document.querySelector('#autosave').oninput=()=>document.querySelector('#effects').textContent='1';</script></body></html>`;
export const youtube = `<!doctype html><html><head><title>YouTube fixture</title></head><body style="min-height:2400px"><yt-searchbox><form action="/results" method="get"><label>Search<input name="search_query" type="text"></label></form><button aria-label="Search">Search</button></yt-searchbox><ytd-video-renderer><a id="video-title" href="/watch?v=abcdefghijk">Piano lesson</a></ytd-video-renderer><ytd-video-renderer><a id="video-title" href="/watch?v=lmnopqrstuv">Piano lesson</a></ytd-video-renderer><button>Send message</button></body></html>`;
function backupRegistry(): () => void {
  const values = ["Google\\Chrome", "Chromium", "Microsoft\\Edge"].map(browser => { const path = `HKCU\\Software\\${browser}\\NativeMessagingHosts\\${hostName}`; try { return { path, value: execFileSync("reg.exe", ["QUERY", path, "/ve"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).match(/REG_SZ\s+(.+)/)?.[1]?.trim() }; } catch { return { path }; } });
  return () => { for (const item of values) { try { if (item.value) execFileSync("reg.exe", ["ADD", item.path, "/ve", "/t", "REG_SZ", "/d", item.value, "/f"], { stdio: "ignore" }); else execFileSync("reg.exe", ["DELETE", item.path, "/f"], { stdio: "ignore" }); } catch {} } };
}
export async function setup(imageGrant = true, allSites = false, browser: "chrome" | "edge" = process.env.LATHAM_TEST_BROWSER === "edge" ? "edge" : "chrome") {
  mkdirSync(".test-artifacts", { recursive: true }); const restore = backupRegistry(), directory = mkdtempSync(resolve(".test-artifacts/page-app-"));
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const tone = new Int16Array(32000); for (let i = 0; i < tone.length; i++) tone[i] = Math.round(8000 * Math.sin(i * Math.PI * 880 / 16000)); const capture = join(directory, "capture.wav"); writeFileSync(capture, wav(new Uint8Array(tone.buffer)));
  const app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${capture}`], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  let opened: BrowserContext | undefined, profile: string | undefined;
  const close = async (): Promise<void> => {
    try { for (const worker of opened?.serviceWorkers() ?? []) await worker.evaluate("port?.disconnect()").catch(() => {}); await opened?.close(); }
    finally { try { await app.close(); } finally {
      restore();
      if (profile && existsSync(profile)) {
        const target = resolve(profile), root = resolve(".test-artifacts") + sep;
        if (!target.startsWith(root) || lstatSync(target).isSymbolicLink()) throw new Error("unsafe_fixture_cleanup");
        rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      }
    } }
  };
  try {
  await expect.poll(() => app.context().pages().some(page => page.url() === "latham://app/index.html")).toBe(true);
  const desk = app.context().pages().find(page => page.url() === "latham://app/index.html")!; if (browser === "edge") await desk.evaluate(() => window.setup.chooseBrowser("edge")); await desk.evaluate(() => window.setup.installHost());
  await desk.getByText("Advanced settings", { exact: true }).click();
  // Install-time grants are an isolated fixture arrangement. Production optional prompts have separate native acceptance.
  const extension = mkdtempSync(resolve(".test-artifacts/page-extension-")); cpSync("dist/chrome-extension", extension, { recursive: true }); const manifest = JSON.parse(readFileSync(join(extension, "manifest.json"), "utf8")); manifest.host_permissions = manifest.optional_host_permissions.filter((origin: string) => imageGrant || !origin.includes("ytimg")); manifest.optional_host_permissions = manifest.optional_host_permissions.filter((origin: string) => !manifest.host_permissions.includes(origin)); writeFileSync(join(extension, "manifest.json"), JSON.stringify(manifest));
  profile = mkdtempSync(resolve(`.test-artifacts/page-${browser}-`));
  const context = await chromium.launchPersistentContext(profile, { executablePath: browser === "edge" ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" : resolve(".test-artifacts/chromium-runtime/latham-test-browser.exe"), headless: false, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  opened = context;
  await context.route("https://www.google.com/**", route => route.fulfill({ contentType: "text/html", body: google })); await context.route("https://www.youtube.com/**", route => route.fulfill({ contentType: "text/html", body: youtube })); await context.route("https://denied.example/**", route => route.fulfill({ body: "DENIED_FRAME_SENTINEL" }));
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`); await popup.getByRole("button", { name: "Connect to Latham" }).click();
  await expect.poll(() => desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true);
  for (let index = 0; index < (allSites ? 8 : 2); index++) await popup.locator(".site").nth(index).getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => desk.evaluate(async allSites => (await window.setup.state()).sites.filter((_, index) => allSites || index < 2).every(site => site.effective), allSites)).toBe(true);
  const page = await context.newPage(); await page.goto("https://www.google.com/");
  await desk.evaluate(() => window.setup.chromeResume());
  await desk.evaluate(() => window.setup.selectCompanionTarget("chrome"));
  await expect.poll(() => desk.evaluate(async () => (await window.setup.state()).chromeFenceConfirmed)).toBe(true);
  await desk.evaluate(() => window.setup.chromeResume());
  return { desk, page, context, app, directory, profile, close };
  } catch (error) { await close().catch(() => {}); throw error; }
}
export async function run(desk: Page, command: string): Promise<void> { await desk.evaluate(command => window.setup.chromeRun(command), command); }
export async function verified(desk: Page): Promise<void> { const result = (await desk.evaluate(() => window.setup.state())).page.last; expect(result?.outcome, result?.reason).toBe("verified"); }

export async function mockLiveSpeech(app: ElectronApplication, text = "scroll down", deferred = true): Promise<void> {
  await app.evaluate((_electron, options) => {
    Reflect.set(globalThis, "liveSpeechConnections", 0);
    class SyntheticSpeechSocket extends EventTarget {
      bufferedAmount = 0; binaryType = "arraybuffer"; private captioned = false;
      constructor(_url: string) { super(); Reflect.set(globalThis, "liveSpeechConnections", Number(Reflect.get(globalThis, "liveSpeechConnections")) + 1); queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
      send(data: string): void {
        const value = JSON.parse(data);
        if (value.setup) queueMicrotask(() => this.message({ setupComplete: {} }));
        if (value.realtimeInput?.audio && !this.captioned) { this.captioned = true; this.message({ serverContent: { interimInputTranscription: { text: "open note" } } }); }
        if (value.realtimeInput?.activityEnd) {
          const finish = () => this.message({ serverContent: { inputTranscription: { text: options.text } } });
          Reflect.set(globalThis, "finishLiveSpeech", finish); if (!options.deferred) queueMicrotask(finish);
        }
      }
      private message(value: object): void { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) })); }
      close(): void {}
    }
    Reflect.set(globalThis, "WebSocket", SyntheticSpeechSocket);
  }, { text, deferred });
}
