import { chromium } from "@playwright/test";
import { cp, mkdir, readdir, copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
if (process.platform === "win32") {
  const source = dirname(chromium.executablePath()), target = resolve(".test-artifacts/chromium-runtime");
  await cp(source, target, { recursive: true });
  // A distinct process name separates this profile from personal Chrome in native UI tools.
  await copyFile(join(target, "chrome.exe"), join(target, "latham-test-browser.exe"));
  // Chromium's flat Windows archive needs this assembly directory for the Windows SxS loader.
  const manifest = (await readdir(source)).find(name => /^\d+\.\d+\.\d+\.\d+\.manifest$/.test(name));
  if (manifest) { const assembly = join(target, manifest.slice(0, -9)); await mkdir(assembly, { recursive: true }); await copyFile(join(source, manifest), join(assembly, manifest)); await copyFile(join(source, "chrome_elf.dll"), join(assembly, "chrome_elf.dll")); }
}
