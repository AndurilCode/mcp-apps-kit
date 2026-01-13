/**
 * Unit tests for createTypedClient function
 *
 * These tests verify that createTypedClient properly creates
 * typed clients from App instances with clientTypes.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTypedClient } from "../../src/index.js";
import type { ToolDefs } from "../../src/types.js";

describe("createTypedClient", () => {
  beforeEach(() => {
    // Setup mock adapter environment
    (globalThis as any).__mcpAppsKit = { ready: true };
  });

  afterEach(() => {
    delete (globalThis as any).__mcpAppsKit;
  });

  it("should create client from app with clientTypes", async () => {
    type TestTools = {
      greet: { input: { name: string }; output: { message: string } };
    };

    const mockApp = {
      clientTypes: {} as TestTools, // Phantom type
    };

    const client = await createTypedClient(mockApp, { forceAdapter: "mock" });

    expect(client).toBeDefined();
    expect(client.callTool).toBeInstanceOf(Function);
    expect(client.tools).toBeDefined();
  });

  it("should pass options to createClient", async () => {
    const mockApp = { clientTypes: {} as ToolDefs };

    const client = await createTypedClient(mockApp, {
      forceAdapter: "mock",
      autoResize: false,
    });

    expect(client).toBeDefined();
  });

  it("should work with structural typing (any object with clientTypes)", async () => {
    const fakeApp = {
      clientTypes: {} as { test: { input: unknown; output: unknown } },
      someOtherProp: "ignored",
    };

    const client = await createTypedClient(fakeApp, { forceAdapter: "mock" });
    expect(client).toBeDefined();
  });

  it("should work without options", async () => {
    const mockApp = { clientTypes: {} as ToolDefs };
    const client = await createTypedClient(mockApp);
    expect(client).toBeDefined();
  });

  it("should create client with typed tool methods", async () => {
    type TestTools = {
      greet: { input: { name: string }; output: { message: string } };
      farewell: { input: { name: string }; output: { message: string } };
    };

    const mockApp = {
      clientTypes: {} as TestTools,
    };

    const client = await createTypedClient(mockApp, { forceAdapter: "mock" });

    // Verify tools proxy exists
    expect(client.tools).toBeDefined();
    expect(typeof client.tools).toBe("object");
  });
});
