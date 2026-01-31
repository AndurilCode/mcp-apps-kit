/**
 * Human Mode behavioral tests
 *
 * Tests the dashboard mode API endpoints, tool gating, and takeover flow.
 * Uses the same mock patterns as dashboard-connections.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "http";
import { ConnectionManager } from "../src/connection";
import { handleDashboardRequest, getDashboardMode } from "../src/dashboard/dashboard-server";
import { assertAgentMode } from "../src/tools/helpers";

// =============================================================================
// Mock response / request helpers (same pattern as dashboard-connections.test.ts)
// =============================================================================

class MockResponse {
  statusCode: number | undefined;
  headers: Record<string, string> = {};
  body = "";
  writableEnded = false;
  chunks: string[] = [];

  setHeader(name: string, value: number | string): void {
    this.headers[name.toLowerCase()] = String(value);
  }

  writeHead(code: number, headers?: Record<string, string>): void {
    this.statusCode = code;
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        this.headers[key.toLowerCase()] = String(value);
      }
    }
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  end(chunk?: string | Buffer): void {
    if (chunk) {
      this.body += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    }
    this.writableEnded = true;
  }
}

function createRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>
): IncomingMessage {
  const req = new Readable({
    read() {},
  }) as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost" };
  if (body) {
    req.push(JSON.stringify(body));
  }
  req.push(null);
  return req;
}

/** Helper to issue a request and return parsed JSON body + status code */
async function callEndpoint(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; json: Record<string, unknown> }> {
  const req = createRequest(method, path, body);
  const res = new MockResponse();
  await handleDashboardRequest(
    req,
    res as unknown as ServerResponse,
    null // no connectionManager needed for mode/takeover tests
  );
  let json: Record<string, unknown> = {};
  if (res.body) {
    try {
      json = JSON.parse(res.body) as Record<string, unknown>;
    } catch {
      // not JSON
    }
  }
  return { status: res.statusCode ?? 0, json };
}

/** Reset mode back to agent before each test */
async function resetToAgentMode(): Promise<void> {
  await callEndpoint("PUT", "/dashboard/mode", { mode: "agent" });
}

// =============================================================================
// Tests
// =============================================================================

describe("Human Mode — Mode Toggle API", () => {
  beforeEach(async () => {
    await resetToAgentMode();
  });

  it("GET /dashboard/mode returns agent by default", async () => {
    const { status, json } = await callEndpoint("GET", "/dashboard/mode");
    expect(status).toBe(200);
    expect(json).toEqual({ mode: "agent" });
  });

  it("PUT /dashboard/mode switches to human", async () => {
    const { status, json } = await callEndpoint("PUT", "/dashboard/mode", {
      mode: "human",
    });
    expect(status).toBe(200);
    expect(json).toEqual({ mode: "human" });
  });

  it("PUT /dashboard/mode with invalid value returns 400", async () => {
    const { status, json } = await callEndpoint("PUT", "/dashboard/mode", {
      mode: "invalid",
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("GET /dashboard/mode after switch reflects new mode", async () => {
    await callEndpoint("PUT", "/dashboard/mode", { mode: "human" });
    const { status, json } = await callEndpoint("GET", "/dashboard/mode");
    expect(status).toBe(200);
    expect(json).toEqual({ mode: "human" });
  });

  it("PUT /dashboard/mode switches back from human to agent", async () => {
    await callEndpoint("PUT", "/dashboard/mode", { mode: "human" });
    const { status, json } = await callEndpoint("PUT", "/dashboard/mode", {
      mode: "agent",
    });
    expect(status).toBe(200);
    expect(json).toEqual({ mode: "agent" });
  });
});

describe("Human Mode — Tool Blocking (assertAgentMode)", () => {
  beforeEach(async () => {
    await resetToAgentMode();
  });

  it("assertAgentMode returns blocked: false in agent mode", () => {
    const check = assertAgentMode();
    expect(check.blocked).toBe(false);
  });

  it("assertAgentMode returns blocked: true in human mode", async () => {
    await callEndpoint("PUT", "/dashboard/mode", { mode: "human" });
    const check = assertAgentMode();
    expect(check.blocked).toBe(true);
    if (check.blocked) {
      expect(check.result.isError).toBe(true);
      expect(check.result.error.code).toBe("HUMAN_MODE");
      expect(check.result.content[0].text).toContain("Human mode");
    }
  });

  it("assertAgentMode unblocks after switching back to agent", async () => {
    await callEndpoint("PUT", "/dashboard/mode", { mode: "human" });
    expect(assertAgentMode().blocked).toBe(true);

    await callEndpoint("PUT", "/dashboard/mode", { mode: "agent" });
    expect(assertAgentMode().blocked).toBe(false);
  });
});

describe("Human Mode — Execute-tool endpoint gating", () => {
  beforeEach(async () => {
    await resetToAgentMode();
  });

  it("POST /dashboard/execute-tool returns 403 in agent mode", async () => {
    const { status, json } = await callEndpoint("POST", "/dashboard/execute-tool", {
      toolName: "test-tool",
      arguments: {},
    });
    expect(status).toBe(403);
    expect(json.error).toContain("human mode");
  });

  it("POST /dashboard/execute-tool does not 403 in human mode", async () => {
    await callEndpoint("PUT", "/dashboard/mode", { mode: "human" });
    const { status } = await callEndpoint("POST", "/dashboard/execute-tool", {
      toolName: "test-tool",
      arguments: {},
    });
    // Without a real connection it should fail with 404 (no connection), not 403 (mode block)
    expect(status).not.toBe(403);
  });
});

describe("Human Mode — Read-resource and Get-prompt gating", () => {
  beforeEach(async () => {
    await resetToAgentMode();
  });

  it("POST /dashboard/read-resource returns 403 in agent mode", async () => {
    const { status, json } = await callEndpoint("POST", "/dashboard/read-resource", {
      uri: "test://resource",
    });
    expect(status).toBe(403);
    expect(json.error).toContain("human mode");
  });

  it("POST /dashboard/read-resource does not 403 in human mode", async () => {
    await callEndpoint("PUT", "/dashboard/mode", { mode: "human" });
    const { status } = await callEndpoint("POST", "/dashboard/read-resource", {
      uri: "test://resource",
    });
    // 404 (no connection) is acceptable, but NOT 403
    expect(status).not.toBe(403);
  });

  it("POST /dashboard/get-prompt returns 403 in agent mode", async () => {
    const { status, json } = await callEndpoint("POST", "/dashboard/get-prompt", {
      promptName: "test-prompt",
    });
    expect(status).toBe(403);
    expect(json.error).toContain("human mode");
  });

  it("POST /dashboard/get-prompt does not 403 in human mode", async () => {
    await callEndpoint("PUT", "/dashboard/mode", { mode: "human" });
    const { status } = await callEndpoint("POST", "/dashboard/get-prompt", {
      promptName: "test-prompt",
    });
    // 404 (no connection) is acceptable, but NOT 403
    expect(status).not.toBe(403);
  });
});

describe("Human Mode — Takeover Request Flow", () => {
  beforeEach(async () => {
    await resetToAgentMode();
  });

  it("POST /dashboard/takeover-request returns 403 in agent mode", async () => {
    const { status, json } = await callEndpoint("POST", "/dashboard/takeover-request", {
      reason: "need control",
    });
    expect(status).toBe(403);
    expect(json.error).toContain("human mode");
  });

  it("Full takeover-approve flow switches mode to agent", async () => {
    // Switch to human mode
    await callEndpoint("PUT", "/dashboard/mode", { mode: "human" });

    // Request takeover
    const { status: reqStatus, json: reqJson } = await callEndpoint(
      "POST",
      "/dashboard/takeover-request",
      { reason: "I need to run tools" }
    );
    expect(reqStatus).toBe(200);
    expect(reqJson.status).toBe("pending");
    expect(reqJson.requestId).toBeDefined();
    const requestId = reqJson.requestId as string;

    // Approve takeover
    const { status: respStatus, json: respJson } = await callEndpoint(
      "PUT",
      "/dashboard/takeover-response",
      { requestId, allow: true }
    );
    expect(respStatus).toBe(200);
    expect(respJson.allowed).toBe(true);
    expect(respJson.mode).toBe("agent");

    // Verify mode has switched to agent
    const { json: modeJson } = await callEndpoint("GET", "/dashboard/mode");
    expect(modeJson.mode).toBe("agent");
  });

  it("Full takeover-deny flow keeps mode at human", async () => {
    // Switch to human mode
    await callEndpoint("PUT", "/dashboard/mode", { mode: "human" });

    // Request takeover
    const { json: reqJson } = await callEndpoint("POST", "/dashboard/takeover-request", {
      reason: "I need control",
    });
    const requestId = reqJson.requestId as string;

    // Deny takeover
    const { status: respStatus, json: respJson } = await callEndpoint(
      "PUT",
      "/dashboard/takeover-response",
      { requestId, allow: false }
    );
    expect(respStatus).toBe(200);
    expect(respJson.allowed).toBe(false);
    expect(respJson.mode).toBe("human");

    // Verify mode stays at human
    const { json: modeJson } = await callEndpoint("GET", "/dashboard/mode");
    expect(modeJson.mode).toBe("human");
  });

  it("Duplicate takeover request returns 409", async () => {
    await callEndpoint("PUT", "/dashboard/mode", { mode: "human" });

    // First request
    const { status: s1 } = await callEndpoint("POST", "/dashboard/takeover-request", {
      reason: "first",
    });
    expect(s1).toBe(200);

    // Second request while first is still pending
    const { status: s2, json: j2 } = await callEndpoint("POST", "/dashboard/takeover-request", {
      reason: "second",
    });
    expect(s2).toBe(409);
    expect(j2.error).toContain("already pending");
  });

  it("Takeover response with mismatched requestId returns 404", async () => {
    await callEndpoint("PUT", "/dashboard/mode", { mode: "human" });
    await callEndpoint("POST", "/dashboard/takeover-request", {});

    const { status, json } = await callEndpoint("PUT", "/dashboard/takeover-response", {
      requestId: "00000000-0000-0000-0000-000000000000",
      allow: true,
    });
    expect(status).toBe(404);
    expect(json.error).toContain("No matching");
  });

  it("Takeover response without required fields returns 400", async () => {
    const { status, json } = await callEndpoint("PUT", "/dashboard/takeover-response", {
      allow: true,
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });
});

describe("Human Mode — getDashboardMode export", () => {
  beforeEach(async () => {
    await resetToAgentMode();
  });

  it("getDashboardMode reflects the current backend state", async () => {
    expect(getDashboardMode()).toBe("agent");

    await callEndpoint("PUT", "/dashboard/mode", { mode: "human" });
    expect(getDashboardMode()).toBe("human");

    await callEndpoint("PUT", "/dashboard/mode", { mode: "agent" });
    expect(getDashboardMode()).toBe("agent");
  });
});
