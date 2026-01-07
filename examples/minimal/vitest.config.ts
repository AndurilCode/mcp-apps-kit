import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["./tests/setup.ts"],
  },
});
