import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/security/**/*.test.ts"], environment: "node", restoreMocks: true, testTimeout: 5000 } });
