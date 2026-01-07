/**
 * Test environment for coordinating server and client
 *
 * Provides a unified interface for setting up test environments
 * with both server and UI testing capabilities.
 */

import type {
  TestEnvironment,
  TestEnvironmentOptions,
  TestClient,
  TestServer,
} from "../types";
import { createTestClient, startTestServer } from "../server";
import { uiLogger } from "../debug";

// Type for App from @mcp-apps-kit/core (avoiding direct dependency)
interface App {
  start(options?: { port?: number; transport?: string }): Promise<void>;
  handler(): (req: unknown, res: unknown, next: () => void) => void;
}

/**
 * Create a test environment with server and client
 *
 * @param options - Environment options
 * @returns Test environment
 *
 * @example
 * ```typescript
 * const env = await createTestEnvironment({
 *   app: myApp,
 * });
 * ```
 */
export async function createTestEnvironment(
  options: TestEnvironmentOptions
): Promise<TestEnvironment> {
  uiLogger("Creating test environment with options: %o", options);

  let server: TestServer;
  let client: TestClient;

  // Start server from App instance
  if (options.app) {
    server = await startTestServer(options.app as App, { port: 0 });
  } else if (options.serverUrl) {
    // Use existing server URL
    server = {
      url: options.serverUrl,
      mcpUrl: `${options.serverUrl}/mcp`,
      port: new URL(options.serverUrl).port ? parseInt(new URL(options.serverUrl).port, 10) : 80,
      async stop() {
        // No-op for external servers
      },
    };
  } else {
    throw new Error("Either app or serverUrl must be provided");
  }

  // Create test client
  client = await createTestClient(server.mcpUrl, options.clientOptions);

  return {
    server,
    client,
    async cleanup(): Promise<void> {
      uiLogger("Cleaning up test environment");
      await client.disconnect();
      await server.stop();
    },
  };
}

/**
 * Fluent builder for test environments
 */
export class TestEnvironmentBuilder {
  private app?: unknown;
  private serverUrl?: string;
  private clientOptions?: Parameters<typeof createTestClient>[1];

  /**
   * Set the App instance
   */
  withApp(app: unknown): this {
    this.app = app;
    return this;
  }

  /**
   * Set the server URL
   */
  withServerUrl(url: string): this {
    this.serverUrl = url;
    return this;
  }

  /**
   * Set client options
   */
  withClientOptions(options: Parameters<typeof createTestClient>[1]): this {
    this.clientOptions = options;
    return this;
  }

  /**
   * Build the test environment
   */
  async build(): Promise<TestEnvironment> {
    return createTestEnvironment({
      app: this.app,
      serverUrl: this.serverUrl,
      clientOptions: this.clientOptions,
    });
  }
}
