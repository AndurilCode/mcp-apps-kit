/**
 * Weather App Configuration
 *
 * Single source of truth for the app.
 * Run with: pnpm start
 */

import { defineConfig } from "@mcp-apps-kit/codegen";

export default defineConfig({
  name: "weather-app",
  version: "0.1.0",

  // Directory configuration
  directories: {
    tools: "tools",
    workflows: "workflows",
    uiWidgets: "ui/widgets",
  },

  // Server configuration
  config: {
    protocol: "mcp",
    cors: {
      origin: true,
    },
    debug: {
      logTool: true,
      level: "debug",
    },
  },
});
