import { _electron, chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const browser = process.argv[2] ?? "chrome";
assert.ok(["chrome", "edge"].includes(browser));
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const root = resolve(".test-artifacts"), packageRoot = join(root, `releases/Latham-${version}-win-x64-preview`); mkdirSync(root, { recursive: true });
const registry = ["Google\\Chrome", "Chromium", "Microsoft\\Edge"].map(browser => { const path = `HKCU\\Software\\${browser}\\NativeMessagingHosts\\com.latham.host`; try { return { path, value: execFileSync("reg.exe", ["QUERY", path, "/ve"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).match(/REG_SZ\s+(.+)/)?.[1]?.trim() }; } catch { return { path }; } });
const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && key !== "ELECTRON_RUN_AS_NODE"));
const wait = async check => { for (let n = 0; n < 150; n++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("preview_acceptance_timeout"); };
let app, context;
try {
  for (const file of ["docs/companion.md", "docs/universal-desktop.md"]) assert.ok(readFileSync(join(packageRoot, file), "utf8").length > 0);
  for (const file of ["SETUP.md", "docs/phase9.md", "docs/phase8.md", "docs/release-operations.md", "docs/phase7.md", "docs/phase6.md", "docs/phase5.md", "docs/phase4.md", "docs/phase3.md", "docs/phase2.md", "docs/phase1.md", "docs/evaluation.md"]) assert.ok(readFileSync(join(packageRoot, file), "utf8").length > 0);
  const data = mkdtempSync(join(root, "packaged-app-"));
  const launch = () => _electron.launch({ executablePath: join(packageRoot, "Latham.exe"), args: ["--latham-test"], env: { ...env, LATHAM_TEST_DATA_DIR: data } });
  const settingsPage = async () => {
    await wait(() => app.context().pages().some(page => page.url() === "latham://app/index.html"));
    return app.context().pages().find(page => page.url() === "latham://app/index.html");
  };
  app = await launch();
  let desk = await settingsPage();
  assert.deepEqual(await app.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged })), { version, packaged: true });
  const initialComputer = await desk.evaluate(async () => (await window.setup.state()).computer);
  assert.equal(initialComputer.agreementAccepted, false);
  assert.equal(initialComputer.allowed, false);
  await wait(() => app.context().pages().some(page => page.url() === "latham://companion/index.html"));
  const companion = app.context().pages().find(page => page.url() === "latham://companion/index.html");
  assert.equal((await companion.evaluate(() => window.companion.state())).sessionId, null);
  await desk.evaluate(() => window.setup.computerConfigure({ allowed: true, images: false, browserAllowed: false, route: "cloud", model: "gemini-3.1-flash-lite", deniedApps: [] }));
  const launched = await desk.evaluate(() => window.setup.computerRun("open Calculator"));
  const launchMessage = (await desk.evaluate(() => window.setup.state())).computer.message;
  await desk.evaluate(() => window.latham.stop());
  await wait(async () => (await desk.evaluate(() => window.setup.state())).computer.fenceConfirmed);
  assert.equal((await companion.evaluate(() => window.companion.state())).sessionId, null);

  await app.close();
  const computerFile = join(data, "computer.json");
  const savedAccess = JSON.parse(readFileSync(computerFile, "utf8"));
  writeFileSync(computerFile, JSON.stringify({ ...savedAccess, uncertain: true }));
  app = await launch();
  desk = await settingsPage();
  const recovery = desk.getByRole("region", { name: "Previous task recovery", exact: true });
  await recovery.waitFor({ state: "visible" });
  assert.equal((await desk.evaluate(() => window.setup.state())).computer.needsReview, true);
  await assert.rejects(desk.evaluate(() => window.setup.computerRun("open Calculator")), /computer_setup_required/);
  await recovery.getByRole("button", { name: "I've checked — continue", exact: true }).click();
  await wait(async () => !(await desk.evaluate(() => window.setup.state())).computer.needsReview);
  assert.equal(JSON.parse(readFileSync(computerFile, "utf8")).uncertain, false);
  assert.equal((await desk.evaluate(() => window.setup.state())).canImportEnvironmentKey, false);
  assert.equal(await desk.getByRole("button", { name: "Import GEMINI_API_KEY from .env.local" }).count(), 0);
  assert.deepEqual(await desk.evaluate(() => window.latham.runtime), { sandboxed: true, contextIsolated: true });
  assert.equal((await desk.evaluate(() => window.setup.state())).handsfree.phase, "off");
  assert.equal((await desk.evaluate(() => window.setup.state())).visual.consent, false);
  assert.equal((await desk.evaluate(() => window.setup.state())).workflow.phase, "idle");
  assert.equal((await desk.evaluate(() => window.setup.state())).browser, "chrome");
  assert.equal((await desk.evaluate(() => window.setup.state())).providerSettingsLocked, false);
  assert.deepEqual((await desk.evaluate(() => window.setup.state())).evaluation.trials, []);
  assert.equal((await desk.evaluate(() => window.setup.state())).managed.signedIn, false);
  assert.equal((await desk.evaluate(() => window.setup.state())).managed.origin, "");
  assert.equal(await desk.evaluate(async () => { try { await window.setup.managedSignIn({ origin: "http://127.0.0.1:47831", invite: "a".repeat(64), consent: "latham-managed-local-v1" }); return false; } catch { return true; } }), true);
  assert.equal((await desk.evaluate(() => window.setup.state())).managed.signedIn, false);
  assert.deepEqual((await desk.evaluate(() => window.setup.state())).shortcuts, []);
  const catalog = (await desk.evaluate(() => window.setup.state())).sites;
  assert.equal(catalog.length, 8); assert.equal(catalog.every(site => !site.consent && !site.effective), true);
  const ocr = JSON.parse(execFileSync(join(packageRoot, "resources/app/native/Latham.ImageOcr.exe"), [], { cwd: packageRoot, input: readFileSync(join(root, "visual-corpus/0.jpg")), encoding: "utf8", windowsHide: true, timeout: 5000 })); assert.match(ocr.text, /PIANO/);
  await desk.evaluate(() => window.setup.key("FAKE_PACKAGED_KEY_STORAGE_CHECK_123456789")); assert.equal(readFileSync(join(data, "provider-key.bin")).includes(Buffer.from("FAKE_PACKAGED_KEY_STORAGE_CHECK_123456789")), false);
  await desk.evaluate(async () => window.setup.save({ ...(await window.setup.state()).settings, mode: "cloud" }));
  if (browser === "edge") await desk.evaluate(() => window.setup.chooseBrowser("edge"));
  await desk.evaluate(() => window.setup.installHost());
  const extension = mkdtempSync(join(root, "packaged-extension-")); cpSync(join(packageRoot, "resources/app/chrome-extension"), extension, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(extension, "manifest.json"))); assert.equal(manifest.host_permissions, undefined); assert.equal(manifest.incognito, "not_allowed");
  // Explicit install-time Google grant in this isolated fixture, not native prompt acceptance.
  manifest.host_permissions = ["https://www.google.com/*"]; manifest.optional_host_permissions = manifest.optional_host_permissions.filter(origin => !manifest.host_permissions.includes(origin)); writeFileSync(join(extension, "manifest.json"), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(mkdtempSync(join(root, "packaged-browser-")), { executablePath: browser === "edge" ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" : join(root, "chromium-runtime/latham-test-browser.exe"), headless: false, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const popup = await context.newPage(); await popup.goto("chrome-extension://plggaillpeoabjjmpjedmblaakepbhdb/popup.html"); await popup.getByRole("button", { name: "Connect to Latham" }).click();
  await wait(async () => { const state = await desk.evaluate(() => window.setup.state()); return state.chromeConnected && state.chromeFenceConfirmed; });
  await desk.evaluate(() => window.setup.chromeResume()); await desk.evaluate(() => window.setup.chromeRun("new tab"));
  assert.equal((await desk.evaluate(() => window.setup.state())).chromeResult, "Verified browser result");
  const handsfreeId = await desk.evaluate(() => window.setup.startHandsfree({ target: "chrome", wake: true }));
  for (let sequence = 0; sequence < 16; sequence++) { await desk.evaluate(({ id, sequence }) => window.setup.handsfreeFrame(id, sequence, new ArrayBuffer(4096)), { id: handsfreeId, sequence }); await new Promise(resolve => setTimeout(resolve, 128)); }
  assert.equal((await desk.evaluate(() => window.setup.state())).handsfree.phase, "armed");
  assert.equal((await desk.evaluate(() => window.setup.state())).voice, "idle");
  assert.equal(await desk.getByRole("checkbox", { name: "Wait for local" }).isChecked(), true);
  await desk.getByRole("region", { name: "Hands-free session", exact: true }).screenshot({ path: join(root, "phase4-handsfree-preview.png") });
  await desk.evaluate(() => window.latham.stop()); await wait(async () => (await desk.evaluate(() => window.setup.state())).chromeFenceConfirmed);
  assert.equal((await desk.evaluate(() => window.setup.state())).handsfree.phase, "off");
  await context.route("https://www.google.com/**", route => route.fulfill({ contentType: "text/html", body: '<html><title>Packaged workflow fixture</title><form action="/search" method="get"><label>Search<textarea name="q"></textarea></label></form></html>' }));
  await popup.locator(".site").first().getByRole("button", { name: "Approve", exact: true }).click();
  await wait(() => desk.evaluate(async () => (await window.setup.state()).sites[0].effective));
  const page = await context.newPage(); await page.goto("https://www.google.com/"); await page.bringToFront(); await desk.evaluate(() => window.setup.chromeResume());
  const workflowPanel = desk.getByRole("region", { name: "Bounded workflows", exact: true });
  await workflowPanel.getByLabel("Workflow website").selectOption("google"); await workflowPanel.getByLabel("Search for", { exact: true }).fill("packaged piano"); await workflowPanel.getByLabel("Workflow filter").selectOption("images");
  await desk.evaluate(() => window.setup.prepareWorkflow({ site: "google", query: "packaged piano", filter: "images", open: 0 }));
  const preview = (await desk.evaluate(() => window.setup.state())).workflow; assert.equal(preview.phase, "prepared"); assert.equal(preview.actions, 0);
  await desk.evaluate(id => window.setup.runWorkflow(id), preview.previewId); assert.equal((await desk.evaluate(() => window.setup.state())).workflow.phase, "completed");
  assert.equal(page.url(), "https://www.google.com/search?q=packaged+piano&udm=2");
  await desk.getByRole("region", { name: "Bounded workflows", exact: true }).screenshot({ path: join(root, "phase7-packaged-workflow.png") });
  await desk.evaluate(() => window.setup.saveWorkflowShortcut("Packaged fixture", null));
  assert.equal(readFileSync(join(data, "workflow-shortcuts.bin")).includes(Buffer.from("packaged piano")), false);
  const saved = (await desk.evaluate(() => window.setup.state())).shortcuts[0]; await desk.evaluate(id => window.setup.deleteWorkflowShortcut(id), saved.id);
  assert.deepEqual((await desk.evaluate(() => window.setup.state())).shortcuts, []);
  await wait(async () => (await desk.evaluate(() => window.setup.state())).chromeFenceConfirmed);
  await desk.evaluate(() => window.setup.desktopPermission(true, false));
  await desk.evaluate(() => window.setup.desktopScan());
  assert.equal((await desk.evaluate(() => window.setup.state())).desktop.last?.outcome, "verified");
  await desk.evaluate(() => window.latham.stop()); await wait(async () => (await desk.evaluate(() => window.setup.state())).desktop.fenceConfirmed);
  await desk.screenshot({ path: join(root, "phase2-preview.png") });
  const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]);
  assert.equal(walk(packageRoot).some(file => /(?:^|[\\/])(?:\.env(?:\..*)?|provider-key\.bin|managed-session\.bin(?:\.tmp)?|accounts\.sqlite.*|server\.cjs|integrity\.cjs|workflow-shortcuts\.bin|evaluation\.json(?:\.tmp)?|providers\.json|connection\.json|Latham.NativeFixture.exe)$/.test(file)), false);
  assert.ok(walk(packageRoot).some(file => file.endsWith("Latham.DesktopAgent.exe")));
  assert.ok(walk(packageRoot).some(file => file.endsWith("Latham.ComputerAgent.exe")));
  assert.ok(walk(packageRoot).some(file => file.endsWith("Latham.ControlKey.exe")));
  assert.ok(walk(packageRoot).some(file => file.endsWith("Latham.SpeechDetector.exe")));
  assert.ok(walk(packageRoot).some(file => file.endsWith("Latham.ImageOcr.exe")));
  const passed = ["bundled_setup_guides", "packaged_universal_consent",
    "packaged_universal_stop", "packaged_uncertainty_recovery", "managed_starts_signed_out",
    "packaged_managed_requires_https", "managed_service_and_secrets_not_bundled", "workflow_starts_idle",
    "packaged_workflow_search_filter", "encrypted_explicit_shortcut_and_deletion", "packaged_startup", "sandbox",
    "dev_env_import_hidden", "protected_key_storage", "packaged_native_host", "packaged_desktop_agent",
    "packaged_ocr_on_synthetic_image", "visual_consent_starts_off", "packaged_local_speech_detectors",
    "idle_wake_no_transcription", "microphone_off_on_start_and_stop", "extension_version_pairing",
    "verified_tab_operation", "acknowledged_stop", "no_user_secrets_or_native_fixture_in_package"];
  const launchVerified = launched && launchMessage === "Calculator is open.";
  if (launchVerified) passed.push("packaged_calculator_launch");
  const failures = launchVerified ? [] : [{ check: "packaged_calculator_launch", message: launchMessage }];
  writeFileSync(join(root, `preview-acceptance-${browser}.json`), JSON.stringify({ at: new Date().toISOString(), version, browser, channel: "unsigned-developer-preview", passed, failures }, null, 2));
  assert.ok(launchVerified, launchMessage);
  console.log("Windows preview startup, universal launch, Stop, recovery, protected storage, and host/extension pairing passed.");
} finally { for (const worker of context?.serviceWorkers() ?? []) await worker.evaluate("port?.disconnect()").catch(() => {}); await context?.close(); await app?.close(); for (const { path, value } of registry) { try { if (value) execFileSync("reg.exe", ["ADD", path, "/ve", "/t", "REG_SZ", "/d", value, "/f"], { stdio: "ignore" }); else execFileSync("reg.exe", ["DELETE", path, "/f"], { stdio: "ignore" }); } catch {} } }
