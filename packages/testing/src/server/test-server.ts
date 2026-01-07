/**
 * Test server utilities for starting MCP servers
 */

import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { TestServer, TestServerOptions, ExternalServerOptions } from "../types";
import { ServerStartupError } from "../errors";
import { serverLogger } from "../debug";

// Type for App from @mcp-apps-kit/core (avoiding direct dependency)
interface App {
  start(options?: { port?: number; transport?: string }): Promise<void>;
  stop?(): Promise<void>;
  handler(): (req: unknown, res: unknown, next: () => void) => void;
}

/**
 * Start a test server from an App instance or external command
 */
export function startTestServer(options: ExternalServerOptions): Promise<TestServer>;
// eslint-disable-next-line no-redeclare
export function startTestServer(app: App, options?: TestServerOptions): Promise<TestServer>;
// eslint-disable-next-line no-redeclare
export function startTestServer(
  appOrOptions: App | ExternalServerOptions,
  maybeOptions?: TestServerOptions
): Promise<TestServer> {
  // Check if first argument is an App (has start method) or ExternalServerOptions
  if (typeof (appOrOptions as App).start === "function") {
    return startTestServerFromApp(appOrOptions as App, maybeOptions ?? {});
  } else {
    return startTestServerFromCommand(appOrOptions as ExternalServerOptions);
  }
}

/**
 * Internal: Start server from App instance
 */
async function startTestServerFromApp(app: App, options: TestServerOptions): Promise<TestServer> {
  const { port = 0, timeout = 10000 } = options;
  // Track whether we used app.start() so we can call app.stop() later
  let usedAppStart = false;

  serverLogger("Starting test server from App instance on port %d", port);

  let httpServer: Server | null = null;
  let actualPort = port;

  // When port is 0, create our own HTTP server to detect the bound port
  if (port === 0) {
    // Use the app's handler to create our own HTTP server
    const handler = app.handler();
    httpServer = createServer((req, res) => {
      handler(req, res, () => {
        // No next middleware
        res.statusCode = 404;
        res.end("Not Found");
      });
    });

    const server = httpServer;
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new ServerStartupError(
            undefined,
            timeout,
            undefined,
            `Server did not start within ${timeout}ms`,
            undefined
          )
        );
      }, timeout);

      server.listen(0, () => {
        clearTimeout(timeoutId);
        const addr = server.address();
        if (addr && typeof addr === "object" && "port" in addr) {
          actualPort = addr.port;
          serverLogger("Dynamic port detected: %d", actualPort);
          resolve();
        } else {
          reject(
            new ServerStartupError(
              undefined,
              timeout,
              undefined,
              "Failed to detect bound port from server",
              undefined
            )
          );
        }
      });

      server.on("error", (err) => {
        clearTimeout(timeoutId);
        reject(
          new ServerStartupError(
            undefined,
            timeout,
            undefined,
            `Failed to start server: ${err.message}`,
            err
          )
        );
      });
    });
  } else {
    // Use the app's built-in start method for fixed ports
    try {
      await app.start({ port, transport: "http" });
      usedAppStart = true;
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
      if (httpServer) {
        // Dynamic port case: we created our own HTTP server
        const server = httpServer;
        return new Promise((resolve) => {
          server.close(() => {
            resolve();
          });
        });
      } else if (usedAppStart && app.stop) {
        // Fixed port case: app.start() was used, call app.stop() if available
        await app.stop();
      }
      // Note: if app.stop is not available for fixed-port servers,
      // the server may continue running. Consider using port 0 for tests.
    },
  };
}

/**
 * Internal: Start server from external command
 */
async function startTestServerFromCommand(options: ExternalServerOptions): Promise<TestServer> {
  const { command, args = [], port, readyPattern, timeout = 10000, env = {} } = options;

  serverLogger("Starting external server: %s %s", command, args.join(" "));

  const childProcess = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let serverReady = false;

  childProcess.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    stdout += text;
    serverLogger("Server stdout: %s", text.trim());
    if (readyPattern?.test(text)) {
      serverReady = true;
    }
  });

  childProcess.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    stderr += text;
    serverLogger("Server stderr: %s", text.trim());
  });

  const startTime = Date.now();
  while (!serverReady && Date.now() - startTime < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

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

  if (!serverReady && !readyPattern) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } else if (!serverReady) {
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
        setTimeout(() => {
          if (!childProcess.killed) childProcess.kill("SIGKILL");
          resolve();
        }, 5000);
      });
    },
  };
}
