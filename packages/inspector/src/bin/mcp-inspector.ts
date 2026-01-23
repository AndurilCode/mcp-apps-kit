/**
 * MCP Inspector CLI
 *
 * Start the MCP Inspector Server for testing and debugging MCP servers.
 */

import { createInspectorServer } from "../server";

// Parse command line arguments
const args = process.argv.slice(2);

interface CLIOptions {
  port: number;
  debug: boolean;
  maxHistory: number;
}

function parseArgs(): CLIOptions {
  const options: CLIOptions = {
    port: 6274,
    debug: false,
    maxHistory: 1000,
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

  return options;
}

function printHelp(): void {
  console.log(`
MCP Inspector Server

Usage: mcp-inspector [options]

Options:
  -p, --port <number>      Port to listen on (default: 6274)
  -d, --debug              Enable debug logging
  --max-history <number>   Maximum call history entries (default: 1000)
  -h, --help               Show this help message
  -v, --version            Show version number

Examples:
  mcp-inspector                    Start on default port 6274
  mcp-inspector --port 3001        Start on custom port
  mcp-inspector --debug            Enable debug logging
  mcp-inspector --max-history 500  Limit history to 500 entries

Claude Desktop Configuration:
  Add to claude_desktop_config.json:

  {
    "mcpServers": {
      "mcp-inspector": {
        "command": "npx",
        "args": ["@mcp-apps-kit/inspector"]
      }
    }
  }
`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  const app = createInspectorServer({
    debug: options.debug,
    maxHistorySize: options.maxHistory,
  });

  if (options.debug) {
    console.log(`[inspector] Starting MCP Inspector Server...`);
    console.log(`[inspector] Port: ${options.port}`);
    console.log(`[inspector] Debug: ${options.debug}`);
    console.log(`[inspector] Max History: ${options.maxHistory}`);
  }

  try {
    await app.start({ port: options.port });
    console.log(`MCP Inspector Server running at http://localhost:${options.port}`);
    console.log(`MCP endpoint: http://localhost:${options.port}/mcp`);
    console.log(`\nPress Ctrl+C to stop`);
  } catch (error) {
    console.error("Failed to start MCP Inspector Server:", error);
    process.exit(1);
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
