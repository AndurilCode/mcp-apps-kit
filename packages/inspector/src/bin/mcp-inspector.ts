/**
 * MCP Inspector CLI
 *
 * Start the MCP Inspector Server for testing and debugging MCP servers.
 */

/* eslint-disable no-console -- CLI entry point, console output is intentional */

import { createStandaloneInspectorServer } from "../standalone-server";
import { createDualInspectorServer } from "../dual-server";
import {
  hasPresetFlags,
  resolvePresetConfig,
  createPresetProvider,
  createProviderFromDiscovery,
  checkExistingTokens,
  type PresetCLIFlags,
} from "../oauth/preset-config";
import { discoverAuthRequirements } from "../oauth/discovery";
import { isAuthError } from "../connection";

// Parse command line arguments
const args = process.argv.slice(2);

interface CLIOptions {
  port: number;
  debug: boolean;
  maxHistory: number;
  sessionTtl: number;
  dual: boolean;
  url: string | null;
  oauthClientId: string | null;
  oauthClientSecret: string | null;
  oauthScopes: string | null;
  oauthConfig: string | null;
  oauthAutoRegister: boolean;
  noAutoAuth: boolean;
  interactive: boolean;
}

function parseArgs(): CLIOptions {
  const options: CLIOptions = {
    port: 6274,
    debug: false,
    maxHistory: 1000,
    sessionTtl: 5 * 60 * 1000, // 5 minutes default
    dual: false,
    url: null,
    oauthClientId: null,
    oauthClientSecret: null,
    oauthScopes: null,
    oauthConfig: null,
    oauthAutoRegister: false,
    noAutoAuth: false,
    interactive: !process.env.CI,
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
    } else if (arg === "--oauth-client-id") {
      const value = args[++i];
      if (value === undefined) {
        console.error("Error: --oauth-client-id requires a value");
        process.exit(1);
      }
      options.oauthClientId = value;
    } else if (arg === "--oauth-client-secret") {
      const value = args[++i];
      if (value === undefined) {
        console.error("Error: --oauth-client-secret requires a value");
        process.exit(1);
      }
      options.oauthClientSecret = value;
    } else if (arg === "--oauth-scopes") {
      const value = args[++i];
      if (value === undefined) {
        console.error("Error: --oauth-scopes requires a value");
        process.exit(1);
      }
      options.oauthScopes = value;
    } else if (arg === "--oauth-config") {
      const value = args[++i];
      if (value === undefined) {
        console.error("Error: --oauth-config requires a value");
        process.exit(1);
      }
      options.oauthConfig = value;
    } else if (arg === "--oauth-auto-register") {
      options.oauthAutoRegister = true;
    } else if (arg === "--no-auto-auth") {
      options.noAutoAuth = true;
    } else if (arg === "--interactive") {
      options.interactive = true;
    } else if (arg === "--no-interactive") {
      options.interactive = false;
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

  // OAuth preset flags require --url (need a target server for auth)
  const oauthFlags: PresetCLIFlags = {
    oauthClientId: options.oauthClientId ?? undefined,
    oauthClientSecret: options.oauthClientSecret ?? undefined,
    oauthScopes: options.oauthScopes ?? undefined,
    oauthConfig: options.oauthConfig ?? undefined,
    oauthAutoRegister: options.oauthAutoRegister || undefined,
  };

  if (hasPresetFlags(oauthFlags) && !options.url) {
    console.error("Error: OAuth preset flags require --url to specify the target MCP server");
    process.exit(1);
  }

  if (hasPresetFlags(oauthFlags) && options.dual) {
    console.error("Error: OAuth preset flags cannot be used with --dual mode");
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
  --interactive            Launch visible Chromium with dashboard (default: true unless CI)
  --no-interactive         Force headless mode
  -h, --help               Show this help message
  -v, --version            Show version number

OAuth Options:
  --oauth-client-id <id>       OAuth client ID (requires --url)
  --oauth-client-secret <sec>  OAuth client secret (confidential clients, requires --url)
  --oauth-scopes <scopes>      Comma-separated OAuth scopes (requires --url)
  --oauth-config <path.json>   Load OAuth config from a JSON file (requires --url)
  --oauth-auto-register        Enable Dynamic Client Registration (RFC 7591, requires --url)
  --no-auto-auth               Skip auto-discovery on 401 (fail with raw error)

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

  # Auto-auth: server requires OAuth → auto-discovers + registers + opens browser
  mcp-inspector --url https://mcp.notion.com/mcp

  # Skip auto-auth (debug raw errors):
  mcp-inspector --url https://mcp.notion.com/mcp --no-auto-auth

  # OAuth preset (agent/CI mode — no browser needed):
  mcp-inspector --url http://api.example.com/mcp --oauth-client-id my-id
  mcp-inspector --url http://api.example.com/mcp --oauth-config ./oauth.json
  mcp-inspector --url http://api.example.com/mcp --oauth-auto-register --oauth-scopes read,write

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

/**
 * Handle 401 auto-discovery and authentication.
 *
 * Called when auto-connect fails with an auth error and no --oauth-* flags
 * were provided. Discovers the server's auth requirements and either:
 * - Creates a provider via DCR, opens browser, waits for auth → returns provider
 * - Prints a helpful error for pre-registration-only servers → returns null
 * - Prints a generic error if discovery fails → returns null
 *
 * @param options - CLI options (needs url, port, debug)
 * @returns An authenticated InspectorOAuthProvider, or null if auth can't proceed
 */
async function handleAutoAuth(
  options: CLIOptions & { url: string }
): Promise<import("../oauth/provider").InspectorOAuthProvider | null> {
  const serverUrl = options.url;

  console.log(`\n🔍 Server requires authentication. Discovering OAuth configuration...`);

  let discovery;
  try {
    discovery = await discoverAuthRequirements(serverUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `\n❌ Failed to discover OAuth requirements for ${serverUrl}\n` +
        `  ${message}\n\n` +
        `You may need to configure OAuth manually:\n` +
        `  mcp-inspector --url ${serverUrl} \\\n` +
        `    --oauth-client-id YOUR_CLIENT_ID \\\n` +
        `    --oauth-client-secret YOUR_CLIENT_SECRET`
    );
    return null;
  }

  if (options.debug) {
    console.log(`[inspector] Discovery results:`);
    console.log(`[inspector]   Auth server: ${discovery.authServerUrl ?? "unknown"}`);
    console.log(`[inspector]   DCR: ${discovery.supportsDCR}`);
    console.log(`[inspector]   CIMD: ${discovery.supportsCIMD}`);
    console.log(`[inspector]   Pre-registration: ${discovery.requiresPreRegistration}`);
    console.log(`[inspector]   Scopes: ${discovery.suggestedScopes.join(", ") || "none"}`);
  }

  // Pre-registration only — can't auto-register, show helpful message
  if (discovery.requiresPreRegistration) {
    const authServer = discovery.authServerUrl ?? "unknown";
    const scopes =
      discovery.suggestedScopes.length > 0
        ? discovery.suggestedScopes.join(", ")
        : "(not specified)";

    console.error(
      `\n⚠️  Server requires OAuth authentication but doesn't support automatic registration.\n\n` +
        `Auth server: ${authServer}\n` +
        `Supported scopes: ${scopes}\n\n` +
        `You need to register a client manually and provide credentials:\n` +
        `  mcp-inspector --url ${serverUrl} \\\n` +
        `    --oauth-client-id YOUR_CLIENT_ID \\\n` +
        `    --oauth-client-secret YOUR_CLIENT_SECRET`
    );
    return null;
  }

  // DCR available — create provider, auto-register, open browser
  console.log(`✅ Server supports Dynamic Client Registration`);
  if (discovery.authServerUrl) {
    console.log(`  Auth server: ${discovery.authServerUrl}`);
  }
  if (discovery.suggestedScopes.length > 0) {
    console.log(`  Scopes: ${discovery.suggestedScopes.join(", ")}`);
  }

  const provider = createProviderFromDiscovery({
    serverUrl,
    discoveryResults: discovery,
    callbackPort: options.port,
    debug: options.debug,
  });

  // Trigger the SDK auth flow which will:
  // 1. Call clientInformation() → auto-register via DCR
  // 2. Call redirectToAuthorization() → open browser
  // 3. We wait for the callback to complete
  console.log(`\n🌐 Opening browser for authorization...`);

  try {
    const { auth } = await import("@modelcontextprotocol/sdk/client/auth.js");
    const result = await auth(provider, { serverUrl });

    if (result === "AUTHORIZED") {
      console.log(`✅ Authorization successful!\n`);
      return provider;
    }

    // result === "REDIRECT" means browser was opened, wait for callback
    console.log(`Waiting for authorization in browser (timeout: 5 minutes)...`);
    await provider.waitForAuthorization();
    console.log(`✅ Authorization successful!\n`);
    return provider;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `\n❌ Auto-authentication failed: ${message}\n\n` +
        `You may need to configure OAuth manually:\n` +
        `  mcp-inspector --url ${serverUrl} \\\n` +
        `    --oauth-client-id YOUR_CLIENT_ID \\\n` +
        `    --oauth-client-secret YOUR_CLIENT_SECRET`
    );
    return null;
  }
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Resolve OAuth preset config if flags are present
  const oauthFlags: PresetCLIFlags = {
    oauthClientId: options.oauthClientId ?? undefined,
    oauthClientSecret: options.oauthClientSecret ?? undefined,
    oauthScopes: options.oauthScopes ?? undefined,
    oauthConfig: options.oauthConfig ?? undefined,
    oauthAutoRegister: options.oauthAutoRegister || undefined,
  };

  let oauthProvider: import("../oauth/provider").InspectorOAuthProvider | undefined;

  if (options.url && hasPresetFlags(oauthFlags)) {
    try {
      const oauthConfig = await resolvePresetConfig(oauthFlags);
      oauthProvider = createPresetProvider({
        serverUrl: options.url,
        config: oauthConfig,
        callbackPort: options.port,
        debug: options.debug,
      });

      // Check for existing tokens
      const tokenStatus = await checkExistingTokens(options.url);
      if (options.debug) {
        console.log(`[inspector] OAuth preset configured for: ${options.url}`);
        console.log(
          `[inspector] OAuth client ID: ${oauthConfig.clientId ?? "(dynamic registration)"}`
        );
        if (oauthConfig.scopes) {
          console.log(`[inspector] OAuth scopes: ${oauthConfig.scopes}`);
        }
        console.log(
          `[inspector] Existing tokens: ${tokenStatus.hasTokens ? "yes" : "no"}` +
            (tokenStatus.hasRefreshToken ? " (with refresh token)" : "")
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  }

  // Declare server in outer scope so signal handlers can access it
  let server:
    | ReturnType<typeof createDualInspectorServer>
    | ReturnType<typeof createStandaloneInspectorServer>
    | undefined;

  // Handle graceful shutdown
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      // Force exit on second signal
      console.log(`\nForce exit.`);
      process.exit(1);
    }
    isShuttingDown = true;
    console.log(`\n${signal} received. Shutting down...`);
    try {
      await server?.stop();
    } catch (error) {
      console.error("Error during shutdown:", error);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  if (options.dual) {
    // Dual mode: separate endpoints for agent and apps
    server = createDualInspectorServer({
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
    server = createStandaloneInspectorServer({
      port: options.port,
      debug: options.debug,
      maxHistorySize: options.maxHistory,
      sessionTtl: options.sessionTtl,
      targetUrl: options.url ?? undefined,
      oauthProvider,
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
      if (oauthProvider) {
        console.log(`OAuth: preset auth configured (non-interactive)`);
      }
      console.log(`\nPress Ctrl+C to stop`);

      // Interactive mode: launch visible browser with dashboard
      if (options.interactive && server) {
        const dashboardPage = await launchInteractiveBrowser(options.port);
        if (dashboardPage && "setDashboardPage" in server) {
          (server as { setDashboardPage: (p: import("playwright").Page) => void }).setDashboardPage(
            dashboardPage
          );
        }
      }
    } catch (error) {
      // Check if this is an auth error on auto-connect that we can handle
      if (options.url && isAuthError(error) && !hasPresetFlags(oauthFlags) && !options.noAutoAuth) {
        // Stop the failed server before retrying
        await server.stop().catch(() => {});

        // Attempt auto-discovery (options.url is guaranteed non-null by outer guard)
        const autoAuthResult = await handleAutoAuth(options as CLIOptions & { url: string });
        if (!autoAuthResult) {
          process.exit(1);
        }

        // Rebuild the server with the auto-discovered provider
        server = createStandaloneInspectorServer({
          port: options.port,
          debug: options.debug,
          maxHistorySize: options.maxHistory,
          sessionTtl: options.sessionTtl,
          targetUrl: options.url,
          oauthProvider: autoAuthResult,
        });

        try {
          await server.start(options.port);
          console.log(`MCP Inspector Server running at http://localhost:${options.port}`);
          console.log(`MCP endpoint: http://localhost:${options.port}/mcp`);
          console.log(`Connected to: ${options.url}`);
          console.log(`OAuth: auto-discovered and authenticated`);
          console.log(`\nPress Ctrl+C to stop`);
        } catch (retryError) {
          console.error("Failed to start MCP Inspector Server after auto-auth:", retryError);
          process.exit(1);
        }
      } else if (options.url && isAuthError(error) && hasPresetFlags(oauthFlags)) {
        // OAuth flags were provided but auth still failed — user misconfigured
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `Error: OAuth authentication failed with the provided credentials.\n` +
            `  ${message}\n\n` +
            `Check your --oauth-* flags and try again.`
        );
        process.exit(1);
      } else {
        console.error("Failed to start MCP Inspector Server:", error);
        process.exit(1);
      }
    }
  }
}

/**
 * Launch a visible Chromium browser pointing at the dashboard.
 * Includes session recovery on browser disconnect.
 */
/**
 * Launch an interactive Chromium browser pointing at the dashboard viewer.
 *
 * NOTE: This opens a browser for *viewing* the dashboard UI. The actual
 * WidgetFrameHandles (the sandboxed tool-UI iframes) are created by
 * `renderInDashboard()` via `uiHostManager.setDashboardPage()`, not by
 * this browser launch.
 */
async function launchInteractiveBrowser(port: number): Promise<import("playwright").Page | null> {
  const MAX_RETRIES = 5;

  try {
    const { chromium } = await import("playwright");

    let retryCount = 0;

    async function launch() {
      const browser = await chromium.launch({ headless: false });
      const page = await browser.newPage();
      await page.goto(`http://localhost:${port}/dashboard`);
      console.log(`[interactive] Dashboard opened in Chromium`);

      // Session recovery: relaunch browser if it disconnects (with backoff)
      browser.on("disconnected", () => {
        retryCount++;
        if (retryCount > MAX_RETRIES) {
          console.error(`[interactive] Browser disconnected ${MAX_RETRIES} times, giving up.`);
          process.exit(1);
        }
        const delayMs = Math.min(1000 * Math.pow(2, retryCount - 1), 30_000);
        console.log(
          `[interactive] Browser disconnected, retrying in ${delayMs}ms (attempt ${retryCount}/${MAX_RETRIES})...`
        );
        setTimeout(() => {
          launch().catch((err: unknown) => {
            console.error(`[interactive] Failed to relaunch browser:`, err);
            process.exit(1);
          });
        }, delayMs);
      });

      // Reset retry count on successful reconnect
      retryCount = 0;

      return page;
    }

    return await launch();
  } catch (err) {
    console.error(`[interactive] Failed to launch browser (is playwright installed?):`, err);
    console.log(`[interactive] Continuing in headless mode`);
    return null;
  }
}

main().catch((error: unknown) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
