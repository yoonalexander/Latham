import { build } from "esbuild";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
const common = { bundle: true, sourcemap: true, logLevel: "info" };
await mkdir("dist/renderer", { recursive: true });
await mkdir("dist/fixture", { recursive: true });
await mkdir("dist/chrome-extension", { recursive: true });
await Promise.all([
  build({ ...common, entryPoints: ["apps/desktop/src/main/index.ts"], outfile: "dist/main.cjs", platform: "node", format: "cjs", target: "node22", external: ["electron"] }),
  build({ ...common, entryPoints: ["apps/desktop/src/preload/index.ts"], outfile: "dist/preload.cjs", platform: "node", format: "cjs", target: "node22", external: ["electron"] }),
  build({ ...common, entryPoints: ["apps/desktop/src/renderer/index.tsx"], outfile: "dist/renderer/renderer.js", platform: "browser", format: "esm", target: "es2022", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } }),
  build({ ...common, entryPoints: ["tests/fixtures/browser.ts"], outfile: "dist/fixture/fixture.js", platform: "browser", format: "esm", target: "es2022" })
]);
await Promise.all([
  copyFile("apps/desktop/src/renderer/index.html", "dist/renderer/index.html"),
  copyFile("tests/fixtures/browser.html", "dist/fixture/index.html"),
  copyFile("tests/fixtures/denied.html", "dist/fixture/denied.html")
]);
await writeFile("dist/package.json", JSON.stringify({ type: "commonjs" }) + "\n");
await Promise.all(["manifest.json", "background.js", "popup.html", "popup.js", "popup.css"].map(file => copyFile("apps/chrome-extension/" + file, "dist/chrome-extension/" + file)));
