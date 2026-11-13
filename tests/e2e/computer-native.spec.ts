import { test, expect, chromium, _electron } from "@playwright/test";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { Computer, WindowsComputer, computerDecision } from "../../apps/desktop/src/main/computer";
import type { ComputerAction } from "../../packages/contracts/src/computer";
import { localDetector, type DetectorEvent } from "../../apps/desktop/src/main/local-detector";
import { emptyComputer } from "../../packages/contracts/src/computer";
import { GeminiLiveSpeech } from "../../packages/speech/src/live-transcribe";
import { Handsfree } from "../../apps/desktop/src/main/handsfree";
// Live provider tests retain metadata and synthetic screenshots, never execution traces.
test.use({ trace: "off" });

function detectorSample(index: number): Buffer {
  const file = readFileSync(resolve(`.test-artifacts/detector-corpus/zira-${index}.wav`));
  for (let at = 12; at + 8 <= file.length;) {
    const length = file.readUInt32LE(at + 4);
    if (file.toString("ascii", at, at + 4) === "data") return file.subarray(at + 8, at + 8 + length);
    at += 8 + length + length % 2;
  }
  throw new Error("Missing PCM data in synthetic detector sample");
}

test("live Gemini streams and commits synthetic speech without a second transcription request", async () => {
  test.skip(process.env.LATHAM_LIVE_GEMINI !== "1", "Live provider acceptance is explicitly enabled separately."); test.setTimeout(25000);
  const key = parseEnv(readFileSync(resolve(".env.local"), "utf8")).GEMINI_API_KEY!;
  const audio = detectorSample(9);
  const started = performance.now(); let firstMs = 0, updates = 0;
  const speech = new GeminiLiveSpeech(key, { speechLanguage: "en", speechVocabulary: "" }, () => { if (!firstMs) firstMs = performance.now() - started; updates++; });
  try {
    for (let at = 0; at < audio.length; at += 4096) { speech.push(audio.subarray(at, at + 4096)); await new Promise(resolve => setTimeout(resolve, 128)); }
    const ended = performance.now(), text = await speech.finish();
    expect(text.toLowerCase()).toContain("open notepad"); expect(updates).toBeGreaterThan(1); expect(firstMs).toBeLessThan(ended - started);
    writeFileSync(resolve(".test-artifacts/gemini-live-native.json"), JSON.stringify({ synthetic: true, firstWordMs: Math.round(firstMs), finalAfterEndMs: Math.round(performance.now() - ended), updates, matchedNotepad: true, beforeSpeechEnd: true }));
  } finally { speech.cancel(); }
});

test("Windows dictation emits live provisional words before microphone input finishes", async () => {
  test.setTimeout(25000);
  const events: DetectorEvent[] = [], started = performance.now(); let firstPartialMs = 0;
  const detector = localDetector(resolve("dist/native/Latham.SpeechDetector.exe"))("preview", event => { events.push(event); if (event.kind === "partial" && event.text && !firstPartialMs) firstPartialMs = performance.now() - started; });
  try {
    await expect.poll(() => events.some(event => event.kind === "ready")).toBe(true);
    const file = readFileSync(resolve(".test-artifacts/detector-corpus/zira-9.wav")); let audio: Buffer | undefined;
    for (let at = 12; at + 8 <= file.length;) { const length = file.readUInt32LE(at + 4); if (file.toString("ascii", at, at + 4) === "data") { audio = file.subarray(at + 8, at + 8 + length); break; } at += 8 + length + length % 2; }
    const input = Buffer.concat([Buffer.alloc(16000), audio!, Buffer.alloc(48000)]); let beforeSpeechEnd = false;
    for (let at = 0; at < input.length; at += 4096) { detector.push(input.subarray(at, at + 4096)); await new Promise(resolve => setTimeout(resolve, 128)); if (at < 16000 + audio!.length && events.some(event => event.kind === "partial" && !!event.text)) beforeSpeechEnd = true; }
    expect(events.some(event => event.kind === "failed")).toBe(false); expect(beforeSpeechEnd).toBe(true);
    const partials = events.filter(event => event.kind === "partial"); expect(partials.length).toBeGreaterThan(1); expect(partials.some(event => /open|note|write/i.test(event.text!))).toBe(true);
    writeFileSync(resolve(".test-artifacts/live-preview-native.json"), JSON.stringify({ synthetic: true, firstPartialMs: Math.round(firstPartialMs), partials: partials.length, beforeSpeechEnd, matchedExpectedWords: true }));
  } finally { detector.close(); }
});

test("direct native launch rejects denied apps and opens Notepad without foreground accessibility observation", async () => {
  test.setTimeout(15000);
  const broker = new WindowsComputer(resolve("dist/native/Latham.ComputerAgent.exe")), signal = new AbortController().signal;
  const options = { ...emptyComputer(), allowed: true, selected: true };
  try {
    await expect(broker.launch("notepad", { ...options, deniedApps: ["notepad"] }, signal)).rejects.toThrow("computer_app_denied");
    await expect(broker.launch("calculator", { ...options, deniedApps: ["calculatorapp"] }, signal)).rejects.toThrow("computer_app_denied");
    await expect(broker.launch("powershell" as "notepad", options, signal)).rejects.toThrow("computer_launch_blocked");
    await broker.launch("notepad", options, signal);
    // Intentionally leave the app open: Notepad can reuse a process containing the user's documents.
  } finally { await broker.stop(); }
});

for (const appName of ["Notepad", "Calculator"] as const) test(`Electron opens ${appName} directly without a provider key, confirmation or review window`, async () => {
  test.setTimeout(30000);
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const app = await _electron.launch({ args: [resolve("dist/main.cjs"), "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: mkdtempSync(resolve(".test-artifacts/computer-launch-")) } });
  try {
    await expect.poll(() => app.context().pages().some(page => page.url() === "latham://companion/index.html")).toBe(true);
    const settings = app.context().pages().find(page => page.url() === "latham://app/index.html")!;
    expect((await settings.evaluate(() => window.setup.state())).keyStored).toBe(false);
    await settings.getByRole("button", { name: "Enable Latham", exact: true }).click();
    if (appName === "Notepad") {
      await settings.getByRole("button", { name: "Open Notepad", exact: true }).click();
    } else {
      expect(await settings.evaluate(() => window.setup.computerRun("open Calculator"))).toBe(true);
    }
    await expect.poll(async () => (await settings.evaluate(() => window.setup.state())).computer.message).toBe(`${appName} is open.`);
    const state = await settings.evaluate(() => window.setup.state());
    expect(state.computer).toMatchObject({ phase: "complete", message: `${appName} is open.`, needsReview: false });
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(win => win.webContents.getURL()).sort())).toEqual(["latham://app/index.html", "latham://companion/index.html"]);
  } finally { await app.close(); }
});

test("a native supervisor exit after Settings is destroyed does not throw in Electron main", async () => {
  const directory = mkdtempSync(resolve(".test-artifacts/computer-shutdown-")), bootstrap = resolve(directory, "bootstrap.cjs");
  writeFileSync(bootstrap, `const child = require("node:child_process"), spawn = child.spawn;
    child.spawn = (file, ...args) => {
      const worker = spawn(file, ...args);
      if (file.endsWith("Latham.DesktopAgent.exe")) globalThis.shutdownTestWorker = worker;
      return worker;
    };
    require(${JSON.stringify(resolve("dist/main.cjs"))});`);
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const app = await _electron.launch({ args: [bootstrap, "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  try {
    await expect.poll(() => app.context().pages().some(page => page.url() === "latham://companion/index.html")).toBe(true);
    const settings = app.context().pages().find(page => page.url() === "latham://app/index.html")!;
    await settings.evaluate(async () => { await window.setup.desktopPermission(true, false); await window.setup.desktopScan(); });
    await app.evaluate(({ BrowserWindow }) => {
      const settings = BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://app/index.html")!;
      const worker = Reflect.get(globalThis, "shutdownTestWorker");
      if (!worker?.listenerCount("exit")) throw new Error("Expected an active native supervisor");
      settings.destroy();
      worker.kill();
      // Deliver the exit synchronously so any main-process error fails this assertion without a dialog.
      worker.emit("exit", 0, null);
    });
  } finally { await app.close(); }
});

for (const app of ["notepad", "calculator"] as const) test(`opening ${app} brings its existing background and minimized window to the foreground`, async () => {
  test.setTimeout(30000);
  const fixture = spawn(resolve("dist/native/Latham.NativeFixture.exe"), [], { windowsHide: false, stdio: ["pipe", "pipe", "pipe"] });
  let report: Record<string, unknown> = {}, buffer = "", count = 0;
  fixture.stdout.setEncoding("utf8"); fixture.stdout.on("data", (chunk: string) => { buffer += chunk; let end: number; while ((end = buffer.indexOf("\n")) >= 0) { report = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); count++; } }); fixture.stderr.resume();
  const send = async (kind: string): Promise<void> => {
    const previous = count;
    fixture.stdin.write(JSON.stringify({ kind, app }) + "\n");
    await expect.poll(() => count > previous && report.kind !== "changed" ? report.kind : undefined).toBe(kind);
  };
  const broker = new WindowsComputer(resolve("dist/native/Latham.ComputerAgent.exe")), signal = new AbortController().signal;
  const options = { ...emptyComputer(), allowed: true, selected: true };
  try {
    await expect.poll(() => report.kind).toBe("ready");
    await test.step("Open and identify the app window", async () => {
      await broker.launch(app, options, signal);
      await send("remember_launched_app");
    });
    const hwnd = report.launchedWindow; expect(hwnd).not.toBe(0);
    await send("focus"); expect(report.foreground).toBe(report.hwnd);
    await test.step("Bring the existing background window forward", async () => {
      await broker.launch(app, options, signal); await send("inspect");
      expect(report.foreground).toBe(hwnd); expect(report.launchedMinimized).toBe(false);
    });
    await send("minimize_launched_app"); expect(report.launchedMinimized).toBe(true);
    await test.step("Restore and activate the same minimized window", async () => {
      await broker.launch(app, options, signal); await send("inspect");
      expect(report.foreground).toBe(hwnd); expect(report.launchedMinimized).toBe(false);
    });
    if (app === "calculator") {
      await test.step("Honor Calculator blocks on an already open window", async () => {
        const current = await broker.observe(false, false, [], false, signal);
        expect(current.hwnd).toBe(String(hwnd));
        for (const denied of ["calculator", "CalculatorApp.exe", "calc"]) {
          await expect(broker.observe(false, false, [denied], false, signal)).rejects.toThrow("computer_app_denied");
          await expect(broker.restore(current, { ...options, deniedApps: [denied] }, signal)).rejects.toThrow("computer_app_denied");
        }
      });
    }
    writeFileSync(resolve(`.test-artifacts/${app}-launch-foreground.json`), JSON.stringify({ backgroundRestored: true, minimizedRestored: true, sameWindow: true }));
  } finally { await broker.stop(); if (fixture.exitCode === null) await send("restore_launched_app").catch(() => {}); fixture.kill(); }
});

test("local spoken approval reports bounded audio timestamps with the actual Windows recognizer", async () => {
  test.setTimeout(25000);
  const events: DetectorEvent[] = [], detector = localDetector(resolve("dist/native/Latham.SpeechDetector.exe"))("approve", event => events.push(event));
  try {
    await expect.poll(() => events.some(event => event.kind === "ready")).toBe(true);
    const input = Buffer.concat([Buffer.alloc(16000), detectorSample(8), Buffer.alloc(48000)]);
    for (let at = 0; at < input.length; at += 4096) { detector.push(input.subarray(at, at + 4096)); await new Promise(resolve => setTimeout(resolve, 128)); }
    await expect.poll(() => events.some(event => event.kind === "match")).toBe(true);
    expect(events.some(event => event.kind === "failed")).toBe(false);
    const match = events.find(event => event.kind === "match")!; expect(match.audioStartMs).toBeGreaterThanOrEqual(0); expect(match.audioEndMs).toBeGreaterThan(match.audioStartMs!);
  } finally { detector.close(); }
});

test("two spoken approvals and Stop route through the real Windows detectors in one synthetic hands-free session", async () => {
  test.setTimeout(45000);
  let proposal: string | null = null;
  let finish: ((verified: boolean) => void) | undefined;
  let runs = 0, cancellations = 0;
  const approved: string[] = [];
  const settle = (verified: boolean): void => { proposal = null; finish?.(verified); finish = undefined; };
  const session = new Handsfree(localDetector(resolve("dist/native/Latham.SpeechDetector.exe")), {
    available: () => true,
    transcribe: async () => "scroll down",
    run: async () => {
      proposal = `proposal-${++runs}`;
      return new Promise(resolve => { finish = resolve; });
    },
    approvalId: () => proposal,
    approve: id => { approved.push(id); settle(true); },
    cancel: () => { cancellations++; settle(false); },
    changed: () => {},
  });
  const id = session.start({ target: "computer", wake: false });
  let sequence = 0;
  const feed = async (sample: number): Promise<void> => {
    const audio = Buffer.concat([Buffer.alloc(16000), detectorSample(sample), Buffer.alloc(48000)]);
    for (let at = 0; at < audio.length && session.active; at += 4096) {
      const frame = new Uint8Array(4096);
      frame.set(audio.subarray(at, at + 4096));
      session.frame(id, sequence++, frame.buffer);
      await new Promise(resolve => setTimeout(resolve, 128));
    }
  };
  try {
    await expect.poll(() => session.state.phase).toBe("listening");
    for (const turn of [1, 2]) {
      await feed(2);
      expect(proposal).toBe(`proposal-${turn}`);
      await feed(8);
      expect(approved).toHaveLength(turn);
      expect(session.state.phase).toBe("listening");
    }
    await feed(2);
    expect(proposal).toBe("proposal-3");
    await feed(0);
    expect(session.state.phase).toBe("off");
    expect(session.state.message).toContain("Heard stop assistant");
    expect(cancellations).toBe(1);
    expect(approved).toEqual(["proposal-1", "proposal-2"]);
  } finally { session.end(); }
});

test("universal native worker observes and edits a real foreground fixture without a browser extension", async () => {
  test.setTimeout(45000); mkdirSync(".test-artifacts", { recursive: true });
  const fixture = spawn(resolve("dist/native/Latham.NativeFixture.exe"), [], { windowsHide: false, stdio: ["pipe", "pipe", "pipe"] });
  let report: Record<string, unknown> = {}, buffer = ""; fixture.stdout.setEncoding("utf8"); fixture.stdout.on("data", (chunk: string) => { buffer += chunk; let end: number; while ((end = buffer.indexOf("\n")) >= 0) { report = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); } }); fixture.stderr.resume();
  const broker = new WindowsComputer(resolve("dist/native/Latham.ComputerAgent.exe"));
  try {
    await expect.poll(() => report.kind).toBe("ready"); fixture.stdin.write('{"kind":"focus"}\n');
    await expect.poll(() => report.foreground === report.hwnd, { message: "Windows must focus the synthetic native fixture before acceptance can proceed." }).toBe(true);
    const signal = new AbortController().signal;
    await expect(broker.observe(false, false, ["latham.nativefixture"], false, signal)).rejects.toThrow("computer_app_denied");
    const observation = await broker.observe(true, false, [], false, signal);
    expect(observation.app.toLowerCase()).toBe("latham.nativefixture"); expect(observation.image.startsWith("iVBOR")).toBe(true);
    writeFileSync(resolve(".test-artifacts/phase10-window-mask.png"), Buffer.from(observation.image, "base64"));
    execFileSync("powershell.exe", ["-NoProfile", "-Command", "Add-Type -AssemblyName System.Drawing; $image = [Drawing.Bitmap]::new((Join-Path (Get-Location) '.test-artifacts/phase10-window-mask.png')); try { $pixel = $image.GetPixel(200, 300); if (($pixel.R + $pixel.G + $pixel.B) -ne 0) { throw 'Synthetic password region was not masked at target DPI' } } finally { $image.Dispose() }"], { windowsHide: true, stdio: "pipe" });
    expect(JSON.stringify(observation.targets)).not.toContain("PRIVATE_NATIVE_SENTINEL"); expect(observation.targets.some(target => /password/i.test(target.name))).toBe(false);
    const decide = async (_goal: string, current: typeof observation, history: string[]): Promise<ComputerAction> => history.length ? { kind: "done", target: "", text: "Fixture field updated", x: 0, y: 0, reason: "Fresh field observation", verifiedPrevious: true } : { kind: "type", target: current.targets.find(target => target.name === "Draft")!.id, text: "Phase 10 shared native action", x: 0, y: 0, reason: "Replace the synthetic Draft field", verifiedPrevious: true };
    const computer = new Computer(mkdtempSync(resolve(".test-artifacts/computer-native-")), broker, decide, () => {}, () => false);
    computer.configure({ allowed: true, images: false, browserAllowed: false, route: "cloud", model: "gemini-3.1-flash-lite", deniedApps: [] });
    const run = computer.run("Replace Draft with Phase 10 shared native action");
    expect(await run, computer.state.message).toBe(true); await expect.poll(() => report.text).toBe("Phase 10 shared native action");
    const fresh = await broker.observe(false, false, [], false, signal);
    fixture.stdin.write('{"kind":"edit","text":"manual change"}\n'); await expect.poll(() => report.text).toBe("manual change");
    await expect(broker.act(fresh, { kind: "type", target: fresh.targets.find(target => target.name === "Draft")!.id, text: "stale input", x: 0, y: 0, verifiedPrevious: true, reason: "Synthetic stale edit" }, computer.state, signal)).rejects.toThrow("computer_observation_changed");
  } finally { await broker.stop(); fixture.kill(); }
});

test("a reviewed task verifies two native actions before switching to Calculator", async () => {
  test.setTimeout(45000);
  const fixture = spawn(resolve("dist/native/Latham.NativeFixture.exe"), [], { stdio: ["pipe", "pipe", "pipe"] });
  const broker = new WindowsComputer(resolve("dist/native/Latham.ComputerAgent.exe"));
  let report: Record<string, unknown> = {}, buffer = "";
  fixture.stdout.setEncoding("utf8");
  fixture.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      report = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
    }
  });
  fixture.stderr.resume();
  const sample = "Latham cross-app fixture";
  const computer = new Computer(mkdtempSync(resolve(".test-artifacts/computer-cross-app-")), broker, async (goal, observation, history) => {
    const result = { target: "", text: "", x: 0, y: 0, verifiedPrevious: true, reason: "" };
    if (history.length === 3) {
      expect(observation.hwnd).not.toBe(String(report.hwnd));
      expect(observation.title).toMatch(/^Calculator$/i);
      expect(observation.targets.some(target => target.name.startsWith("Display is "))).toBe(true);
      return { ...result, kind: "done", text: "The draft was updated and Calculator is open." };
    }
    expect(observation.pid).toBe(fixture.pid);
    if (goal === "Update the field") return { ...result, kind: "ask", text: "Which field should I update?" };
    const draft = observation.targets.find(target => target.name === "Draft")!;
    const other = observation.targets.find(target => target.name === "Other field")!;
    if (history.length === 0) return { ...result, kind: "type", target: draft.id, text: sample };
    expect(draft.value).toBe(sample);
    if (history.length === 1) return { ...result, kind: "type", target: other.id, text: "Second verified edit" };
    expect(other.value).toBe("Second verified edit");
    return { ...result, kind: "open", text: "calculator" };
  }, () => {}, () => false);
  try {
    await expect.poll(() => report.kind).toBe("ready");
    fixture.stdin.write('{"kind":"focus"}\n');
    await expect.poll(() => report.kind === "focus" && report.foreground === report.hwnd).toBe(true);
    computer.configure({ allowed: true, images: false, browserAllowed: false, route: "cloud", model: "gemini-3.1-flash-lite", deniedApps: [] });
    expect(await computer.run("Update the field")).toBe(false);
    expect(computer.state).toMatchObject({ steps: 0, pending: null, message: "Which field should I update?" });
    expect(report.text).toBe("");

    const task = computer.run("Write the sample into Draft, update Other field, and open Calculator.");
    await expect.poll(() => computer.state.pending?.scope).toBe("task");
    expect(report.text).toBe("");
    computer.approve(computer.state.pending!.id, true);
    const completed = await task;
    expect(completed, `After ${computer.state.steps} verified actions: ${computer.state.message}`).toBe(true);
    expect(computer.state).toMatchObject({ steps: 3, pending: null, message: "The draft was updated and Calculator is open." });
    expect(report.text).toBe(sample);
  } finally { await computer.stop(); fixture.kill(); }
});

test("generic computer use works in an isolated Chrome window without an extension and retains browser-denial gates", async () => {
  test.setTimeout(45000); mkdirSync(".test-artifacts", { recursive: true });
  const browser = await chromium.launchPersistentContext(mkdtempSync(resolve(".test-artifacts/computer-chrome-")), { executablePath: resolve(".test-artifacts/chromium-runtime/latham-test-browser.exe"), headless: false, args: ["--force-renderer-accessibility"] });
  const title = "Latham synthetic computer-use page";
  const page = browser.pages()[0] ?? await browser.newPage();
  await page.setContent(`<title>${title}</title><label>Fixture search<input aria-label="Fixture search"></label><label>Password<input type="password" value="SYNTHETIC_PASSWORD_OMITTED"></label><p id="result">Ready</p>`);
  await page.bringToFront();
  const broker = new WindowsComputer(resolve("dist/native/Latham.ComputerAgent.exe")), signal = new AbortController().signal;
  try {
    // Chrome adds a memory-usage suffix to tab accessibility names shortly after startup.
    await page.waitForTimeout(2500);
    await expect.poll(() => spawnSync(resolve("dist/native/Latham.NativeFixture.exe"), ["--focus-test-browser", title], { windowsHide: true, timeout: 1500 }).status, {
      message: "Windows must focus the isolated browser",
    }).toBe(0);
    const browserWindow = await broker.observe(false, true, [], false, signal);
    expect(browserWindow.title.includes(title), "Windows must focus the isolated browser").toBe(true);
    const observation = await broker.observe(true, true, [], false, signal);
    expect(observation.hwnd).toBe(browserWindow.hwnd);
    writeFileSync(resolve(".test-artifacts/phase10-chrome-mask.png"), Buffer.from(observation.image, "base64"));
    const target = observation.targets.find(target => target.name === "Fixture search" && target.actions.includes("type")); expect(target, JSON.stringify(observation.targets.map(target => ({ name: target.name, role: target.role })))).toBeDefined();
    expect(JSON.stringify(observation.targets)).not.toContain("SYNTHETIC_PASSWORD_OMITTED");
    await broker.act(observation, { kind: "type", target: target!.id, text: "piano music", x: 0, y: 0, verifiedPrevious: true, reason: "Replace the synthetic search" }, { ...emptyComputer(), agreementAccepted: true, allowed: true, images: true, browserAllowed: true, selected: true }, signal);
    await expect(page.getByLabel("Fixture search")).toHaveValue("piano music");
    await page.screenshot({ path: resolve(".test-artifacts/phase10-chrome-verified-edit.png") });
    await expect(broker.observe(false, false, [], false, signal)).rejects.toThrow("computer_browser_scope_denied");
    const decide = () => { throw new Error("Revoked browser access must stop before reasoning"); };
    const computer = new Computer(mkdtempSync(resolve(".test-artifacts/computer-chrome-revoke-")), broker, decide, () => {}, () => false);
    computer.configure({ allowed: true, images: true, browserAllowed: true, route: "cloud", model: "gemini-3.1-flash-lite", deniedApps: [] });
    computer.blockOrigin("https://fixture.example");
    await expect.poll(() => computer.state.fenceConfirmed).toBe(true);
    expect(await computer.run("Replace Fixture search with a new value")).toBe(false);
    expect(computer.state.message).toContain("computer_browser_scope_denied");
    await expect(page.getByLabel("Fixture search")).toHaveValue("piano music");
  } finally { await broker.stop(); await browser.close(); }
});

test("live Gemini plans and checks a reviewed action using only a synthetic native window", async () => {
  test.skip(process.env.LATHAM_LIVE_GEMINI !== "1", "Live provider acceptance is explicitly enabled separately."); test.setTimeout(90000);
  const key = parseEnv(readFileSync(resolve(".env.local"), "utf8")).GEMINI_API_KEY; expect(!!key).toBe(true);
  const fixture = spawn(resolve("dist/native/Latham.NativeFixture.exe"), [], { windowsHide: false, stdio: ["pipe", "pipe", "pipe"] });
  let report: Record<string, unknown> = {}, buffer = ""; fixture.stdout.setEncoding("utf8"); fixture.stdout.on("data", (chunk: string) => { buffer += chunk; let end: number; while ((end = buffer.indexOf("\n")) >= 0) { report = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); } }); fixture.stderr.resume();
  const broker = new WindowsComputer(resolve("dist/native/Latham.ComputerAgent.exe"));
  const decide = computerDecision(() => key!);
  const computer = new Computer(mkdtempSync(resolve(".test-artifacts/computer-live-")), broker, (goal, observation, history, options, signal) => {
    if (observation.pid !== fixture.pid) throw new Error("computer_live_fixture_focus_changed");
    return decide(goal, observation, history, options, signal);
  }, () => {}, () => false);
  try {
    await expect.poll(() => report.kind).toBe("ready"); fixture.stdin.write('{"kind":"focus"}\n'); await expect.poll(() => report.kind).toBe("focus"); await expect.poll(() => report.foreground === report.hwnd).toBe(true);
    computer.configure({ allowed: true, images: true, browserAllowed: false, route: "cloud", model: "gemini-3.1-flash-lite", deniedApps: [] });
    const run = computer.run('Replace the field named Draft with exactly "Phase ten synthetic hello". Do not change other fields.');
    let finished = false; void run.finally(() => { finished = true; });
    for (let attempt = 0; attempt < 300 && !finished; attempt++) {
      const pending = computer.state.pending;
      if (pending) {
        expect(pending.app.toLowerCase()).toBe("latham.nativefixture"); expect(["type", "focus"]).toContain(pending.action.kind);
        expect(pending.action.text === "" || pending.action.text === "Phase ten synthetic hello").toBe(true);
        computer.approve(pending.id, true);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    expect(await run, computer.state.message).toBe(true); expect(report.text).toBe("Phase ten synthetic hello"); expect(computer.state.steps).toBeGreaterThan(0);
  } finally { await computer.stop(); fixture.kill(); }
});

test("Electron companion confirms a task once, marks image clicks and rejects stale answers with synthetic provider and worker", async () => {
  test.setTimeout(60000);
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE"));
  const directory = mkdtempSync(resolve(".test-artifacts/computer-electron-"));
  const bootstrap = resolve(directory, "bootstrap.cjs");
  writeFileSync(bootstrap, `const { EventEmitter } = require("node:events"), { PassThrough } = require("node:stream"), childProcess = require("node:child_process");
  const originalSpawn = childProcess.spawn; globalThis.fixtureText = ""; let focused = false;
  const image = require("electron").nativeImage.createFromBitmap(Buffer.alloc(400 * 240 * 4, 80), { width: 400, height: 240 }).toPNG().toString("base64");
  childProcess.spawn = (file, ...args) => {
    if (!file.endsWith("Latham.ComputerAgent.exe")) return originalSpawn(file, ...args);
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null });
    child.kill = () => { child.exitCode = 0; queueMicrotask(() => child.emit("exit", 0)); return true; };
    let input = ""; child.stdin.on("data", chunk => input += chunk);
    child.stdin.on("finish", () => queueMicrotask(() => {
      const request = JSON.parse(input), observation = { hwnd: "123", pid: 123, started: "100", app: "Latham.NativeFixture", title: "Synthetic worker window", revision: globalThis.fixtureText + focused, imageHash: request.images ? "synthetic-image" : "", inputTick: 1, capturedAt: Date.now(), width: 400, height: 240, targets: [{ id: "draft", name: "Draft", role: "Edit", actions: ["type", "focus"], value: globalThis.fixtureText, focused }], image: request.images ? image : "" };
      if (request.kind === "act") { if (request.action.kind === "focus") focused = true; if (request.action.kind === "type") globalThis.fixtureText = request.action.text; }
      child.stdout.write(JSON.stringify({ outcome: "verified", observation }) + "\\n");
    })); return child;
  };
  globalThis.fetch = async (url, options) => {
    if (url === "http://127.0.0.1:11434/api/show") return Response.json({ capabilities: ["completion", "vision"] });
    if (url !== "http://127.0.0.1:11434/api/chat") throw new Error("Unexpected fixture request");
    const context = JSON.parse(JSON.parse(options.body).messages[1].content), target = context.targets.find(t => t.name === "Draft" && t.actions.includes("type"));
    if (globalThis.coordinateFixture) return Response.json({ done: true, message: { content: JSON.stringify({ kind: "click", target: "", text: "", x: 200, y: 100, reason: "Synthetic visible point", verifiedPrevious: true }) } });
    const kind = context.history.length === 0 ? "focus" : context.history.length === 1 ? "type" : "done";
    return Response.json({ done: true, message: { content: JSON.stringify({ kind, target: kind === "done" ? "" : target.id, text: kind === "type" ? "Electron universal review verified" : kind === "done" ? "Field verified" : "", x: 0, y: 0, reason: "Synthetic field observation", verifiedPrevious: true }) } });
  }; require(${JSON.stringify(resolve("dist/main.cjs"))});`);
  const app = await _electron.launch({ args: [bootstrap, "--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: directory } });
  try {
    await expect.poll(() => app.context().pages().some(page => page.url() === "latham://companion/index.html")).toBe(true);
    const settings = app.context().pages().find(page => page.url() === "latham://app/index.html")!, overlay = app.context().pages().find(page => page.url() === "latham://companion/index.html")!;
    expect((await settings.evaluate(() => window.setup.state())).computer.allowed).toBe(false);
    expect(await overlay.evaluate(() => [typeof window.setup, typeof window.latham, typeof Reflect.get(window, "require")])).toEqual(["undefined", "undefined", "undefined"]);
    await settings.evaluate(() => window.setup.computerConfigure({ allowed: true, images: false, browserAllowed: false, route: "local", model: "fixture", deniedApps: [] }));
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://companion/index.html")!, original = window.setIgnoreMouseEvents.bind(window);
      const calls: boolean[] = []; Reflect.set(globalThis, "fixtureIgnoreMouse", calls);
      window.setIgnoreMouseEvents = (ignore, options) => { calls.push(ignore); original(ignore, options); };
    });
    const run = settings.evaluate(() => window.setup.computerRun('Replace Draft with exactly "Electron universal review verified". Do not change other controls.'));
    let finished = false; void run.finally(() => { finished = true; }); let approvals = 0;
    for (let attempt = 0; attempt < 300 && !finished; attempt++) {
      const state = (await settings.evaluate(() => window.setup.state())).computer;
      if (state.pending) {
        expect(state.pending.app.toLowerCase()).toBe("latham.nativefixture"); expect(["focus", "type"]).toContain(state.pending.action.kind);
        await expect(overlay.locator("#caption")).toHaveText("Continue with this task?");
        await expect(overlay.locator("#detail")).toContainText("Electron universal review verified");
        const frozen = await app.evaluate(({ BrowserWindow, screen }) => {
          const window = BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://companion/index.html")!;
          const original = screen.getCursorScreenPoint; Reflect.set(globalThis, "restoreFixtureCursor", () => { screen.getCursorScreenPoint = original; });
          screen.getCursorScreenPoint = () => ({ x: 20, y: 20 }); return window.getBounds();
        });
        await overlay.waitForTimeout(150);
        expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === "latham://companion/index.html")!.getBounds())).toEqual(frozen);
        await overlay.screenshot({ path: ".test-artifacts/phase10-companion-confirmation.png" });
        await expect(overlay.evaluate(() => window.companion.confirm("expired-question", true))).rejects.toThrow("stale_computer_approval");
        await expect(overlay.evaluate(() => window.companion.interact("expired-question", true))).rejects.toThrow("stale_computer_approval");
        await expect(overlay.evaluate(() => window.companion.confirmationImage("expired-question"))).rejects.toThrow("stale_computer_approval");
        await overlay.getByRole("button", { name: "Continue", exact: true }).click(); approvals++;
        expect(await app.evaluate(() => Reflect.get(globalThis, "fixtureIgnoreMouse"))).toContain(false);
        await app.evaluate(() => Reflect.get(globalThis, "restoreFixtureCursor")());
        await expect.poll(async () => (await settings.evaluate(() => window.setup.state())).computer.pending?.id !== state.pending!.id).toBe(true);
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    expect(await run, (await settings.evaluate(() => window.setup.state())).computer.message).toBe(true);
    expect(approvals).toBe(1); expect(await app.evaluate(() => Reflect.get(globalThis, "fixtureText"))).toBe("Electron universal review verified");
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(win => win.webContents.getURL()).sort())).toEqual(["latham://app/index.html", "latham://companion/index.html"]);
    expect(readFileSync(resolve(directory, "computer.json"), "utf8")).not.toContain("Electron universal review verified");
    expect(await app.evaluate(() => Reflect.get(globalThis, "fixtureIgnoreMouse").at(-1))).toBe(true);
    await app.evaluate(() => Reflect.set(globalThis, "coordinateFixture", true));
    await settings.evaluate(() => window.setup.computerConfigure({ allowed: true, images: true, browserAllowed: false, route: "local", model: "fixture", deniedApps: [] }));
    const cancel = settings.evaluate(() => window.setup.computerRun("Click the indicated fixture point"));
    await expect(overlay.locator("#caption")).toHaveText("Click this point in Latham.NativeFixture?");
    await expect(overlay.locator("#confirm-image")).toBeVisible();
    expect(await overlay.locator("#confirm-image").evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(100);
    await overlay.screenshot({ path: ".test-artifacts/phase10-companion-point.png" });
    const pendingId = (await settings.evaluate(() => window.setup.state())).computer.pending!.id;
    await overlay.getByRole("button", { name: "Cancel", exact: true }).click(); expect(await cancel).toBe(false);
    await expect(overlay.locator("#confirm-image")).toBeHidden(); await expect(overlay.locator("#confirm-buttons")).toBeHidden();
    await expect(overlay.evaluate(id => window.companion.confirm(id, true), pendingId)).rejects.toThrow("stale_computer_approval");
    expect(await app.evaluate(() => Reflect.get(globalThis, "fixtureText"))).toBe("Electron universal review verified");
  } finally { await app.close(); }
});
