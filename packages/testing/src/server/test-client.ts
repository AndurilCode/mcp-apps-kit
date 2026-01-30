/**
 * Test client wrapper around MCP SDK Client
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type {
  TestClient,
  TestClientOptions,
  ToolResult,
  ToolCall,
  ConnectionParams,
} from "../types";
import { ConnectionError, TimeoutError } from "../errors";
import { clientLogger } from "../debug";

/** Human-readable label for connection params (used in logs and errors) */
function connectionLabel(params: ConnectionParams): string {
  return params.transport === "stdio"
    ? `stdio:${params.command}${params.args?.length ? " " + params.args.join(" ") : ""}`
    : params.url;
}

/**
 * Create a test client connected to an MCP server
 */
export async function createTestClient(
  params: ConnectionParams,
  options: TestClientOptions = {}
): Promise<TestClient> {
  const { trackHistory = false, timeout = 30000, retries = 0 } = options;

  const label = connectionLabel(params);
  clientLogger("Creating test client for %s", label);

  const client = new Client({ name: "mcp-testing-client", version: "1.0.0" }, { capabilities: {} });

  let transport: StreamableHTTPClientTransport | StdioClientTransport;
  const callHistory: ToolCall[] = [];

  try {
    if (params.transport === "stdio") {
      // Merge process.env with user-provided env, filtering out undefined values
      const mergedEnv = params.env
        ? Object.fromEntries(
            Object.entries({ ...process.env, ...params.env }).filter(
              (entry): entry is [string, string] => entry[1] !== undefined
            )
          )
        : undefined;
      transport = new StdioClientTransport({
        command: params.command,
        args: params.args,
        env: mergedEnv,
        cwd: params.cwd,
        stderr: "pipe",
      });
    } else {
      transport = new StreamableHTTPClientTransport(new URL(params.url));
    }

    if (options.onTransportClose) {
      transport.onclose = options.onTransportClose;
    }

    await client.connect(transport);
    clientLogger("Connected to server at %s", label);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new ConnectionError(label, `Failed to connect: ${err.message}`, err);
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
      // Preserve all tool metadata for proxy scenarios
      type ExtendedTool = (typeof tools.tools)[number] & {
        title?: string;
        outputSchema?: Record<string, unknown>;
        _meta?: Record<string, unknown>;
        annotations?: Record<string, unknown>;
      };
      return tools.tools.map((tool) => {
        const extended = tool as ExtendedTool;
        return {
          name: extended.name,
          title: extended.title,
          description: extended.description,
          inputSchema: extended.inputSchema as Record<string, unknown> | undefined,
          outputSchema: extended.outputSchema,
          _meta: extended._meta,
          annotations: extended.annotations,
        };
      });
    },

    async listResources() {
      const resources = await client.listResources();
      // Extended resource type to capture all metadata from MCP protocol
      type ExtendedResource = (typeof resources.resources)[number] & {
        mimeType?: string;
        _meta?: Record<string, unknown>;
        annotations?: Record<string, unknown>;
      };
      return resources.resources.map((resource) => {
        const extended = resource as ExtendedResource;
        return {
          uri: extended.uri,
          name: extended.name,
          description: extended.description,
          mimeType: extended.mimeType,
          _meta: extended._meta,
          annotations: extended.annotations,
        };
      });
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
