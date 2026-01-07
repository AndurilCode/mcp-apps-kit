/**
 * Unit tests for test environment
 */

import { describe, it, expect } from "vitest";
import { createTestEnvironment, TestEnvironmentBuilder } from "../../../src/ui";

describe("createTestEnvironment", () => {
  it("should throw if neither app nor serverUrl is provided", async () => {
    await expect(createTestEnvironment({})).rejects.toThrow(
      "Either app or serverUrl must be provided"
    );
  });
});

describe("TestEnvironmentBuilder", () => {
  it("should create a builder", () => {
    const builder = new TestEnvironmentBuilder();
    expect(builder).toBeDefined();
  });

  it("should support fluent API", () => {
    const builder = new TestEnvironmentBuilder()
      .withServerUrl("http://localhost:3000")
      .withClientOptions({ timeout: 5000 });

    expect(builder).toBeDefined();
  });
});
