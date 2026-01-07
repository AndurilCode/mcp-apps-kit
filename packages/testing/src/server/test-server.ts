/**
 * Test server utilities for starting MCP servers
 *
 * Supports starting servers from mcp-apps-kit App instances
 * or external server processes.
 */

import { spawn } from "node:child_process";
import type { TestServer, TestServerOptions, ExternalServerOptions } from "../types";
import { ServerStartupError } from "../errors";
import { serverLogger } from "../debug";

// Type for App from @mcp-apps-kit/core (avoiding direct dependency)
interface App {
  start(options?: { port?: number; transport?: string }): Promise<void>;
  handler(): (req: unknown, res: unknown, next: () => void) => void;
}


/**
 * Start a test server from an external command
 *
 * @param options - External server options
 * @returns Running test server
 *
 * @example
 * ```typescript
 * const server = await startTestServer({
 *   command: 'node',
 *   args: ['./server.js'],
 *   port: 3000,
 *   readyPattern: /listening on/i,
 * });
 * ```
 */
export async function startTestServer(
  options: ExternalServerOptions
): Promise<TestServer>;
export async function startTestServer(
  appOrOptions: App | ExternalServerOptions,
  options?: TestServerOptions
): Promise<TestServer> {
  // Check if first argument is an App (has start method) or ExternalServerOptions
  if (typeof (appOrOptions as App).start === "function") {
    return startTestServerFromApp(appOrOptions as App, options ?? {});
  } else {
    return startTestServerFromCommand(appOrOptions as ExternalServerOptions);
  }
}

/**
 * Internal: Start server from App instance
 */
async function startTestServerFromApp(
  app: App,
  options: TestServerOptions
): Promise<TestServer> {
  const { port = 0, timeout = 10000 } = options;

  serverLogger("Starting test server from App instance on port %d", port);

  // Start the app server
  try {
    await app.start({ port, transport: "http" });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new ServerStartupError(
      undefined,
      timeout,
      undefined,
      `Failed to start app server: ${err.message}`,
      err
    );
  }

  // For dynamic port (0), we need to get the actual assigned port
  // Since App doesn't expose the HTTP server directly, we'll use a workaround
  // In practice, when port=0, the OS assigns a port, but we can't easily retrieve it
  // For now, we'll use a default port or require the user to specify
  let actualPort = port;

  // If port is 0, we need to find the actual port
  // This is a limitation - we'd need access to the HTTP server instance
  // For now, we'll use a default port detection mechanism
  if (port === 0) {
    // Try to extract port from Express app if possible
    // This is a workaround - ideally App would expose getServer() or similar
    actualPort = 3000; // Default fallback
    serverLogger("Dynamic port requested, using fallback port %d", actualPort);
  }

  const baseUrl = `http://localhost:${actualPort}`;
  const mcpUrl = `${baseUrl}/mcp`;

  serverLogger("Test server started at %s", mcpUrl);

  return {
    url: baseUrl,
    mcpUrl,
    port: actualPort,
    async stop(): Promise<void> {
      serverLogger("Stopping test server");
      // The App interface doesn't expose a stop method
      // In a real implementation, we'd need to track the server instance
      // For now, this is a placeholder
      // Users should call app.stop() if available or handle cleanup themselves
    },
  };
}

/**
 * Internal: Start server from external command
 */
async function startTestServerFromCommand(
  options: ExternalServerOptions
): Promise<TestServer> {
  const {
    command,
    args = [],
    port,
    readyPattern,
    timeout = 10000,
    env = {},
  } = options;

  serverLogger("Starting external server: %s %s", command, args.join(" "));

  const childProcess = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let serverReady = false;

  // Collect stdout
  childProcess.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    stdout += text;
    serverLogger("Server stdout: %s", text.trim());

    // Check for ready pattern
    if (readyPattern && readyPattern.test(text)) {
      serverReady = true;
    }
  });

  // Collect stderr
  childProcess.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    stderr += text;
    serverLogger("Server stderr: %s", text.trim());
  });

  // Wait for server to be ready or timeout
  const startTime = Date.now();
  while (!serverReady && Date.now() - startTime < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Check if process exited early
  if (childProcess.killed || childProcess.exitCode !== null) {
    const exitCode = childProcess.exitCode ?? -1;
    throw new ServerStartupError(
      command,
      timeout,
      stderr || stdout,
      `Server process exited with code ${exitCode}`,
      undefined
    );
  }

  // Check if timeout was reached
  if (!serverReady && !readyPattern) {
    // If no ready pattern, assume server is ready after a short delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } else if (!serverReady) {
    // Timeout waiting for ready pattern
    childProcess.kill();
    throw new ServerStartupError(
      command,
      timeout,
      stderr || stdout,
      `Server did not become ready within ${timeout}ms. Pattern: ${readyPattern}`,
      undefined
    );
  }

  const baseUrl = `http://localhost:${port}`;
  const mcpUrl = `${baseUrl}/mcp`;

  serverLogger("External server started at %s", mcpUrl);

  return {
    url: baseUrl,
    mcpUrl,
    port,
    async stop(): Promise<void> {
      serverLogger("Stopping external server");
      return new Promise((resolve) => {
        if (childProcess.killed) {
          resolve();
          return;
        }

        childProcess.once("exit", () => {
          resolve();
        });

        childProcess.kill("SIGTERM");

        // Force kill after 5 seconds
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill("SIGKILL");
          }
          resolve();
        }, 5000);
      });
    },
  };
}
