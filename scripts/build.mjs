import { build } from "esbuild";
import { mkdir, copyFile, writeFile, readFile } from "node:fs/promises";
const common = { bundle: true, sourcemap: true, logLevel: "info" };
await mkdir("dist/renderer", { recursive: true });
await mkdir("dist/fixture", { recursive: true });
await mkdir("dist/chrome-extension", { recursive: true });
await Promise.all([
  build({ ...common, entryPoints: ["apps/desktop/src/main/index.ts"], outfile: "dist/main.cjs", platform: "node", format: "cjs", target: "node22", external: ["electron"] }),
  build({ ...common, entryPoints: ["apps/desktop/src/preload/index.ts"], outfile: "dist/preload.cjs", platform: "node", format: "cjs", target: "node22", external: ["electron"] }),
  build({ ...common, entryPoints: ["apps/desktop/src/renderer/index.tsx"], outfile: "dist/renderer/renderer.js", platform: "browser", format: "esm", target: "es2022", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } }),
  build({ ...common, entryPoints: ["tests/fixtures/browser.ts"], outfile: "dist/fixture/fixture.js", platform: "browser", format: "esm", target: "es2022" }),
  build({ ...common, entryPoints: ["apps/chrome-extension/src/page.ts"], outfile: "dist/chrome-extension/page.js", platform: "browser", format: "iife", target: "es2022" }),
  build({ ...common, entryPoints: ["apps/chrome-extension/src/catalog.ts"], outfile: "dist/chrome-extension/catalog.js", platform: "browser", format: "iife", target: "es2022" })
]);
await Promise.all([
  copyFile("apps/desktop/src/renderer/index.html", "dist/renderer/index.html"),
  copyFile("tests/fixtures/browser.html", "dist/fixture/index.html"),
  copyFile("tests/fixtures/denied.html", "dist/fixture/denied.html")
]);
const metadata = JSON.parse(await readFile("package.json", "utf8"));
await writeFile("dist/package.json", JSON.stringify({ name: "latham", version: metadata.version, type: "commonjs", main: "main.cjs" }) + "\n");
await Promise.all(["manifest.json", "background.js", "visual.js", "popup.html", "popup.js", "popup.css"].map(file => copyFile("apps/chrome-extension/" + file, "dist/chrome-extension/" + file)));
