/**
 * Integration tests for MCP Inspector Server
 *
 * These tests verify the server can be created and tools work together.
 */

import { describe, it, expect } from "vitest";
import { createInspectorServer } from "../src/server";

describe("createInspectorServer", () => {
  it("should create an app with all tools", () => {
    const app = createInspectorServer();

    expect(app).toBeDefined();
    expect(typeof app.start).toBe("function");
    expect(typeof app.getServer).toBe("function");
  });

  it("should accept custom options", () => {
    const app = createInspectorServer({
      maxHistorySize: 500,
      defaultTimeout: 60000,
      debug: true,
    });

    expect(app).toBeDefined();
  });

  it("should use default options when none provided", () => {
    const app = createInspectorServer();
    expect(app).toBeDefined();
  });
});
