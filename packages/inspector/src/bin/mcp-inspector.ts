/**
 * MCP Inspector CLI
 *
 * Start the MCP Inspector Server for testing and debugging MCP servers.
 */

import { createStandaloneInspectorServer } from "../standalone-server";
import { createDualInspectorServer } from "../dual-server";

// Parse command line arguments
const args = process.argv.slice(2);

interface CLIOptions {
  port: number;
  debug: boolean;
  maxHistory: number;
  sessionTtl: number;
  dual: boolean;
  url: string | null;
}

function parseArgs(): CLIOptions {
  const options: CLIOptions = {
    port: 6274,
    debug: false,
    maxHistory: 1000,
    sessionTtl: 5 * 60 * 1000, // 5 minutes default
    dual: false,
    url: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--port" || arg === "-p") {
      const value = args[++i];
      if (value === undefined) {
        console.error("Error: --port requires a value");
        process.exit(1);
      }
      const port = parseInt(value, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error("Error: --port must be a valid port number (1-65535)");
        process.exit(1);
      }
      options.port = port;
    } else if (arg === "--debug" || arg === "-d") {
      options.debug = true;
    } else if (arg === "--dual") {
      options.dual = true;
    } else if (arg === "--max-history") {
      const value = args[++i];
      if (value === undefined) {
        console.error("Error: --max-history requires a value");
        process.exit(1);
      }
      const maxHistory = parseInt(value, 10);
      if (isNaN(maxHistory) || maxHistory < 0) {
        console.error("Error: --max-history must be a non-negative number");
        process.exit(1);
      }
      options.maxHistory = maxHistory;
    } else if (arg === "--ttl") {
      const value = args[++i];
      if (value === undefined) {
        console.error("Error: --ttl requires a value");
        process.exit(1);
      }
      const ttl = parseInt(value, 10);
      if (isNaN(ttl) || ttl < 0) {
        console.error("Error: --ttl must be a non-negative number (milliseconds)");
        process.exit(1);
      }
      options.sessionTtl = ttl;
    } else if (arg === "--url" || arg === "-u") {
      const value = args[++i];
      if (value === undefined) {
        console.error("Error: --url requires a value");
        process.exit(1);
      }
      // Validate URL format
      try {
        new URL(value);
      } catch {
        console.error(`Error: --url must be a valid URL (got: ${value})`);
        process.exit(1);
      }
      options.url = value;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      console.log("@mcp-apps-kit/inspector v0.5.0");
      process.exit(0);
    } else {
      console.error(`Unknown option: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  // Validate incompatible flag combinations
  if (options.url && options.dual) {
    console.error("Error: --url cannot be used with --dual mode");
    process.exit(1);
  }

  return options;
}

function printHelp(): void {
  console.log(`
MCP Inspector Server

Usage: mcp-inspector [options]

Options:
  -p, --port <number>      Port to listen on (default: 6274)
  -d, --debug              Enable debug logging
  -u, --url <url>          Auto-connect to MCP server URL (standalone mode only)
  --dual                   Enable dual-endpoint mode for real ChatGPT testing
  --max-history <number>   Maximum call history entries (default: 1000)
  --ttl <ms>               Session TTL in milliseconds (default: 300000 = 5 min)
  -h, --help               Show this help message
  -v, --version            Show version number

Modes:
  Single (default):
    - One endpoint at /mcp with all inspector tools
    - Use for development and debugging

  Auto-connect (--url):
    - Automatically connects to the specified MCP server on startup
    - Disables connect_to_server/disconnect tools (locked to that server)
    - Cannot be used with --dual mode

  Dual (--dual):
    - /agent/mcp: Observation-only tools for coding agents
    - /apps/mcp: Proxy tools for ChatGPT (available after connect_to_server)
    - Use for real testing with ChatGPT

Examples:
  mcp-inspector                                Start in single mode on port 6274
  mcp-inspector --url http://localhost:3000/mcp  Auto-connect to local server
  mcp-inspector --url http://localhost:3000/mcp --debug  With debug logging
  mcp-inspector --dual                         Start in dual mode for ChatGPT testing
  mcp-inspector --dual --port 8080             Start in dual mode on custom port

Auto-connect Mode Usage:
  1. Start your MCP server (e.g., on http://localhost:3000/mcp)
  2. Run: mcp-inspector --url http://localhost:3000/mcp
  3. Inspector auto-connects and is locked to that server
  4. Use list_tools, call_tool, etc. without needing connect_to_server

Dual Mode Usage:
  1. Start: mcp-inspector --dual
  2. Agent connects to http://localhost:6274/agent/mcp
  3. Agent calls: connect_to_server("http://your-mcp-server:3000")
  4. ChatGPT connects to http://localhost:6274/apps/mcp
  5. ChatGPT sees proxied tools from target server
`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.dual) {
    // Dual mode: separate endpoints for agent and apps
    const server = createDualInspectorServer({
      port: options.port,
      debug: options.debug,
      maxHistorySize: options.maxHistory,
      sessionTtl: options.sessionTtl,
    });

    if (options.debug) {
      console.log(`[inspector] Starting MCP Inspector Server (dual mode)...`);
      console.log(`[inspector] Port: ${options.port}`);
      console.log(`[inspector] Debug: ${options.debug}`);
      console.log(`[inspector] Max History: ${options.maxHistory}`);
      console.log(`[inspector] Session TTL: ${options.sessionTtl}ms`);
    }

    try {
      await server.start(options.port);
      console.log(`\nPress Ctrl+C to stop`);
    } catch (error) {
      console.error("Failed to start MCP Inspector Server:", error);
      process.exit(1);
    }
  } else {
    // Single mode: all tools on one endpoint with custom /execute-tool endpoint
    const server = createStandaloneInspectorServer({
      port: options.port,
      debug: options.debug,
      maxHistorySize: options.maxHistory,
      sessionTtl: options.sessionTtl,
      targetUrl: options.url ?? undefined,
    });

    if (options.debug) {
      console.log(`[inspector] Starting MCP Inspector Server...`);
      console.log(`[inspector] Port: ${options.port}`);
      console.log(`[inspector] Debug: ${options.debug}`);
      console.log(`[inspector] Max History: ${options.maxHistory}`);
      console.log(`[inspector] Session TTL: ${options.sessionTtl}ms`);
      if (options.url) {
        console.log(`[inspector] Target URL: ${options.url}`);
      }
    }

    try {
      await server.start(options.port);
      console.log(`MCP Inspector Server running at http://localhost:${options.port}`);
      console.log(`MCP endpoint: http://localhost:${options.port}/mcp`);
      if (options.url) {
        console.log(`Connected to: ${options.url}`);
      }
      console.log(`\nPress Ctrl+C to stop`);
    } catch (error) {
      console.error("Failed to start MCP Inspector Server:", error);
      process.exit(1);
    }
  }

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });
}

main().catch((error: unknown) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
