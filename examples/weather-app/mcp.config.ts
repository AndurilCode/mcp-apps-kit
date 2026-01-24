/**
 * Weather App Configuration
 *
 * Single source of truth for the app.
 * Run with: pnpm start
 */

import { defineConfig } from "@mcp-apps-kit/codegen";
import { iconFromFile } from "@mcp-apps-kit/core";

export default defineConfig({
  name: "weather-app",
  version: "0.1.0",

  // Server icon - displayed in MCP client UIs
  icon: iconFromFile("./logo.png").src,

  // Directory configuration
  directories: {
    tools: "tools",
    workflows: "workflows",
    uiWidgets: "ui/widgets",
    middleware: "middleware",
    handlers: "handlers",
  },

  // Server configuration
  config: {
    protocol: "openai",
    cors: {
      origin: true,
    },
    debug: {
      logTool: true,
      level: "debug",
    },
  },
});
