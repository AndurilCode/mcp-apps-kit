/**
 * Unit tests for tool response shaping
 *
 * Verifies that:
 * - `_text` is used as the model-facing narration when provided
 * - tool outputs are validated against the declared output schema
 */

import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { z } from "zod";

import { createApp } from "../../src/index";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
let transport: StreamableHTTPClientTransport | undefined;

afterEach(async () => {
  if (transport) {
    await transport.close();
    transport = undefined;
  }
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

describe("Tool responses", () => {
  it("uses `_text` for content.text and preserves structuredContent", async () => {
    const app = createApp({
      name: "tool-response-test",
      version: "1.0.0",
      tools: {
        narrate: {
          description: "Return structured data plus narration",
          input: z.object({}),
          output: z.object({ value: z.number() }),
          handler: async () => ({ value: 1, _text: "Hello from _text" }),
        },
      },
    });

    const host = express();
    host.use(app.handler());
    server = host.listen(0);

    const port = (server.address() as AddressInfo).port;

    const client = new Client({ name: "test-client", version: "1.0.0" });
    transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`));
    await client.connect(transport);

    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "narrate",
          arguments: {},
        },
      },
      CallToolResultSchema
    );

    const first = result.content?.[0];
    expect(first?.type).toBe("text");
    if (!first || first.type !== "text") {
      throw new Error("Expected first content item to be text");
    }
    expect(first.text).toBe("Hello from _text");
    expect(result.structuredContent).toEqual({ value: 1 });
  });

  it("rejects handler output that fails the declared output schema", async () => {
    const app = createApp({
      name: "tool-output-validate-test",
      version: "1.0.0",
      tools: {
        bad_output: {
          description: "Return invalid output",
          input: z.object({}),
          output: z.object({ ok: z.boolean() }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          handler: async () => ({ ok: "nope" as any }),
        },
      },
    });

    const host = express();
    host.use(app.handler());
    server = host.listen(0);

    const port = (server.address() as AddressInfo).port;

    const client = new Client({ name: "test-client", version: "1.0.0" });
    transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`));
    await client.connect(transport);

    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "bad_output",
          arguments: {},
        },
      },
      CallToolResultSchema
    );

    expect(result.isError).toBe(true);
    const first = result.content?.[0];
    expect(first?.type).toBe("text");
    if (!first || first.type !== "text") {
      throw new Error("Expected first content item to be text");
    }
    expect(first.text).toMatch(/Validation error|Tool execution failed/i);
  });
});
