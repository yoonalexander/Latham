import { build } from "esbuild";
await build({ entryPoints: ["services/managed-ai/main.ts"], outfile: ".test-artifacts/managed-service/server.cjs", bundle: true, platform: "node", format: "cjs", target: "node22", logLevel: "info" });
