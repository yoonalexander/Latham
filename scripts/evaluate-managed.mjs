import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const outfile = resolve(".test-artifacts/managed-service/acceptance.mjs");
await build({ entryPoints: ["services/managed-ai/acceptance.ts"], outfile, bundle: true, platform: "node", format: "esm", target: "node22" });
await import(pathToFileURL(outfile).href);
