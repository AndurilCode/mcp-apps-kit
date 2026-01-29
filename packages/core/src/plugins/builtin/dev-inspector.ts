/**
 * Dev Inspector Plugin
 *
 * Automatically spawns the MCP Inspector and connects it to this server.
 * Used internally by createApp when autoInspector config is enabled.
 *
 * @internal - Not exported publicly, used by createApp when autoInspector is enabled
 */

import { spawn, type ChildProcess } from "child_process";
import type { Plugin } from "../types";
import type { AutoInspectorConfig } from "../../types/config";

/**
 * Resolve auto-inspector config to full config object with defaults
 */
function resolveConfig(config: AutoInspectorConfig | true): Required<AutoInspectorConfig> {
  if (config === true) {
    return {
      port: 6274,
      debug: false,
      devOnly: true,
    };
  }
  return {
    port: config.port ?? 6274,
    debug: config.debug ?? false,
    devOnly: config.devOnly ?? true,
  };
}

/**
 * Create dev inspector plugin with given config
 *
 * @param config - Auto-inspector configuration
 * @param serverRoute - The MCP server route path (e.g., "/mcp")
 * @returns Plugin that spawns inspector on start
 *
 * @internal - Not exported publicly, used by createApp when autoInspector is enabled
 */
export function createDevInspectorPlugin(
  config: AutoInspectorConfig | true,
  serverRoute: string
): Plugin {
  const resolvedConfig = resolveConfig(config);

  // Keep inspector process state scoped to this plugin instance
  let inspectorProcess: ChildProcess | null = null;

  return {
    name: "dev-inspector",
    version: "1.0.0",

    onStart: async (context) => {
      // Skip in production if devOnly is true
      if (resolvedConfig.devOnly && process.env.NODE_ENV === "production") {
        return;
      }

      // Only works with HTTP transport
      if (context.transport !== "http" || !context.port) {
        // eslint-disable-next-line no-console
        console.warn("[autoInspector] Skipped: only works with HTTP transport");
        return;
      }

      const serverUrl = `http://localhost:${context.port}${serverRoute}`;
      const args = ["--url", serverUrl, "--port", String(resolvedConfig.port)];

      if (resolvedConfig.debug) {
        args.push("--debug");
      }

      // eslint-disable-next-line no-console
      console.log(`[autoInspector] Starting inspector on port ${resolvedConfig.port}`);
      // eslint-disable-next-line no-console
      console.log(`[autoInspector] Connecting to: ${serverUrl}`);

      // Spawn mcp-inspector using npx to find the CLI
      // We use npx to ensure we find the installed mcp-inspector binary
      inspectorProcess = spawn("npx", ["mcp-inspector", ...args], {
        stdio: "inherit",
        detached: false,
        shell: true,
      });

      inspectorProcess.on("error", (err) => {
        // eslint-disable-next-line no-console
        console.error(`[autoInspector] Failed to spawn inspector: ${err.message}`);
      });

      inspectorProcess.on("exit", (code) => {
        if (code !== null && code !== 0) {
          // eslint-disable-next-line no-console
          console.warn(`[autoInspector] Inspector exited with code ${code}`);
        }
        inspectorProcess = null;
      });
    },

    onShutdown: async () => {
      if (inspectorProcess) {
        // eslint-disable-next-line no-console
        console.log("[autoInspector] Stopping inspector...");
        inspectorProcess.kill();
        inspectorProcess = null;
      }
    },
  };
}
