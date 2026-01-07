/**
 * Test client wrapper around MCP SDK Client
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { TestClient, TestClientOptions, ToolResult, ToolCall } from "../types";
import { ConnectionError, TimeoutError } from "../errors";
import { clientLogger } from "../debug";

/**
 * Create a test client connected to an MCP server
 */
export async function createTestClient(
  url: string,
  options: TestClientOptions = {}
): Promise<TestClient> {
  const { trackHistory = false, timeout = 30000, retries = 0 } = options;

  clientLogger("Creating test client for %s", url);

  const client = new Client({ name: "mcp-testing-client", version: "1.0.0" }, { capabilities: {} });

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

  async function callToolWithRetry(name: string, args: unknown, attempt = 0): Promise<ToolResult> {
    const startTime = Date.now();
    const timestamp = new Date();

    // Track timeout timer so we can clear it on success
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      clientLogger("Calling tool %s with args %o", name, args);

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new TimeoutError(timeout, `Tool call timed out after ${timeout}ms`));
        }, timeout);
      });

      // Use client.request with CallToolResultSchema
      const result = await Promise.race([
        client.request(
          {
            method: "tools/call",
            params: { name, arguments: args as Record<string, unknown> },
          },
          CallToolResultSchema
        ),
        timeoutPromise,
      ]);

      // Clear timeout on success to prevent timer leak
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }

      const duration = Date.now() - startTime;

      // Build content blocks from the result
      type ContentBlock = { type: string; text?: string; data?: string; mimeType?: string };
      const contentBlocks = (result.content ?? []).map((block: ContentBlock) => {
        if (block.type === "text") {
          return { type: "text" as const, text: block.text };
        }
        if (block.type === "image") {
          return { type: "image" as const, data: block.data, mimeType: block.mimeType };
        }
        return { type: "text" as const, text: JSON.stringify(block) };
      });

      // Access structuredContent from the raw result and store separately
      // This preserves original display text while providing typed data for assertions
      const structuredContent = (result as { structuredContent?: unknown }).structuredContent;

      const toolResult: ToolResult = {
        content: contentBlocks,
        isError: result.isError,
        // Store structuredContent separately - matchers can use this for data assertions
        // while toContainText() tests actual display text
        structuredContent: structuredContent ?? undefined,
      };

      if (trackHistory) {
        callHistory.push({ name, args, result: toolResult, duration, timestamp });
      }

      clientLogger("Tool %s completed in %dms", name, duration);
      return toolResult;
    } catch (error) {
      // Clear timeout on error to prevent timer leak
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }

      const duration = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries && err instanceof TimeoutError) {
        clientLogger("Tool call failed, retrying (%d/%d)", attempt + 1, retries);
        return callToolWithRetry(name, args, attempt + 1);
      }

      if (trackHistory) {
        callHistory.push({ name, args, error: err, duration, timestamp });
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
      type ResourceContent = { text?: string; blob?: string; mimeType?: string };
      return {
        contents: result.contents.map((content: ResourceContent) => {
          if (content.text !== undefined) {
            return { type: "text" as const, text: content.text };
          }
          if (content.blob !== undefined) {
            return { type: "image" as const, data: content.blob, mimeType: content.mimeType };
          }
          return { type: "text" as const, text: JSON.stringify(content) };
        }),
      };
    },

    async listPrompts() {
      const prompts = await client.listPrompts();
      return prompts.prompts.map((prompt) => ({
        name: prompt.name,
        description: prompt.description,
      }));
    },

    async getPrompt(name: string, args?: Record<string, string>) {
      const result = await client.getPrompt({ name, arguments: args });
      type PromptContent = { type: string; text?: string; data?: string; mimeType?: string };
      return {
        description: result.description,
        messages: result.messages.map((message) => {
          const content = message.content as PromptContent;
          return {
            role: message.role,
            content: {
              type: content.type as "text" | "image" | "resource",
              text: content.text,
              data: content.data,
              mimeType: content.mimeType,
            },
          };
        }),
      };
    },

    getCallHistory: () => [...callHistory],
    clearHistory: () => {
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
