/**
 * Test client wrapper around MCP SDK Client
 *
 * Provides a simplified interface for testing MCP servers with
 * optional call history tracking and timeout/retry support.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type {
  TestClient,
  TestClientOptions,
  ToolResult,
  ToolCall,
  ContentBlock,
} from "../types";
import { ConnectionError, TimeoutError } from "../errors";
import { clientLogger } from "../debug";

/**
 * Create a test client connected to an MCP server
 *
 * @param url - MCP server endpoint URL (e.g., 'http://localhost:3000/mcp')
 * @param options - Client options
 * @returns Connected test client
 *
 * @example
 * ```typescript
 * const client = await createTestClient('http://localhost:3000/mcp', {
 *   trackHistory: true,
 *   timeout: 5000,
 * });
 * ```
 */
export async function createTestClient(
  url: string,
  options: TestClientOptions = {}
): Promise<TestClient> {
  const {
    trackHistory = false,
    timeout = 30000,
    retries = 0,
  } = options;

  clientLogger("Creating test client for %s", url);

  const client = new Client(
    {
      name: "mcp-testing-client",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  let transport: StreamableHTTPClientTransport | undefined;
  const callHistory: ToolCall[] = [];

  try {
    transport = new StreamableHTTPClientTransport(new URL(url));
    await client.connect(transport);
    clientLogger("Connected to server at %s", url);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new ConnectionError(url, `Failed to connect: ${err.message}`, err);
  }

  /**
   * Call a tool with timeout and retry support
   */
  async function callToolWithRetry(
    name: string,
    args: unknown,
    attempt = 0
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const timestamp = new Date();

    try {
      clientLogger("Calling tool %s with args %o", name, args);

      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new TimeoutError(timeout, `Tool call timed out after ${timeout}ms`));
        }, timeout);
      });

      // Call the tool with timeout
      // Use client.request to get structuredContent (the actual structured data)
      const result = await Promise.race([
        client.request(
          {
            method: "tools/call",
            params: {
              name,
              arguments: args as Record<string, unknown>,
            },
          },
          CallToolResultSchema
        ) as { content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; structuredContent?: unknown; isError?: boolean },
        timeoutPromise,
      ]);

      const duration = Date.now() - startTime;

      // Convert MCP result to ToolResult
      // The MCP SDK's request with CallToolResultSchema returns:
      // - content: array of content blocks (text, image, resource)
      // - structuredContent: the actual structured data from the tool handler (when available)
      // - isError: boolean indicating if the call failed
      // When _text is provided, content[0].text = _text, and structuredContent = the full object
      // When _text is not provided, content[0].text = JSON.stringify(structured), and structuredContent = the object
      
      const contentBlocks = (result.content ?? []).map((block) => {
        if (block.type === "text") {
          return {
            type: "text" as const,
            text: block.text,
          };
        }
        if (block.type === "image") {
          return {
            type: "image" as const,
            data: block.data,
            mimeType: block.mimeType,
          };
        }
        if (block.type === "resource") {
          return {
            type: "resource" as const,
            data: block.data,
            mimeType: block.mimeType,
          };
        }
        return {
          type: "text" as const,
          text: String(block),
        };
      });

      // Access structuredContent from the result
      // The CallToolResultSchema result should have structuredContent property
      // TypeScript types might not include it, but it's there at runtime
      const resultAny = result as unknown as Record<string, unknown>;
      const structuredContent = resultAny.structuredContent;

      // Prefer structuredContent if available (the actual structured data)
      // This is the structured output from the tool handler
      if (structuredContent !== undefined && structuredContent !== null) {
        // Use structuredContent as the primary data source
        // Replace or add it as JSON in the first text block for easier testing
        if (contentBlocks.length > 0 && contentBlocks[0]?.type === "text") {
          contentBlocks[0].text = JSON.stringify(structuredContent);
        } else {
          contentBlocks.unshift({
            type: "text",
            text: JSON.stringify(structuredContent),
          });
        }
      }

      const toolResult: ToolResult = {
        content: contentBlocks,
        isError: result.isError,
      };

      const toolCall: ToolCall = {
        name,
        args,
        result: toolResult,
        duration,
        timestamp,
      };

      if (trackHistory) {
        callHistory.push(toolCall);
      }

      clientLogger("Tool %s completed in %dms", name, duration);
      return toolResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      // Retry logic
      if (attempt < retries && err instanceof TimeoutError) {
        clientLogger("Tool call failed, retrying (%d/%d)", attempt + 1, retries);
        return callToolWithRetry(name, args, attempt + 1);
      }

      const toolCall: ToolCall = {
        name,
        args,
        error: err,
        duration,
        timestamp,
      };

      if (trackHistory) {
        callHistory.push(toolCall);
      }

      throw err;
    }
  }

  return {
    raw: client,

    async callTool(name: string, args: unknown): Promise<ToolResult> {
      return callToolWithRetry(name, args);
    },

    async listTools() {
      const tools = await client.listTools();
      return tools.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      }));
    },

    async listResources() {
      const resources = await client.listResources();
      return resources.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
      }));
    },

    async readResource(uri: string) {
      const result = await client.readResource({ uri });
      return {
        contents: result.contents.map((content) => {
          if (content.type === "text") {
            return {
              type: "text" as const,
              text: content.text,
            };
          }
          if (content.type === "image") {
            return {
              type: "image" as const,
              data: content.data,
              mimeType: content.mimeType,
            };
          }
          return {
            type: "text" as const,
            text: String(content),
          };
        }),
      };
    },

    getCallHistory(): ToolCall[] {
      return [...callHistory];
    },

    clearHistory(): void {
      callHistory.length = 0;
    },

    async disconnect(): Promise<void> {
      clientLogger("Disconnecting client");
      if (transport) {
        await transport.close();
      }
    },
  };
}
