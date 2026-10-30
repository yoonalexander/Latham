import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "tests/e2e", workers: 1, fullyParallel: false, timeout: 40000, expect: { timeout: 8000 }, reporter: [["list"], ["json", { outputFile: ".test-artifacts/e2e-results.json" }]], outputDir: ".test-artifacts/playwright", use: { trace: "retain-on-failure" } });
