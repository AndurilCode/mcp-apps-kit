import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config";

export default mergeConfig(
  rootConfig,
  defineConfig({
    test: {
      include: ["tests/**/*.{test,spec}.{ts,tsx}"],
      server: {
        deps: {
          // Allow vitest to resolve the MCP SDK's subpath exports (e.g. /client/auth.js)
          inline: [/@modelcontextprotocol\/sdk/],
        },
      },
    },
  })
);
