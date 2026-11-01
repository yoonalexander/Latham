import { build } from "esbuild";
await build({ entryPoints: ["services/release/main.ts"], outfile: ".test-artifacts/release-tools/integrity.cjs", bundle: true, platform: "node", format: "cjs", target: "node22", logLevel: "info" });
