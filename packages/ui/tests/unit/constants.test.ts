/**
 * Unit tests for constants
 *
 * Tests the protocol constants exported by the package.
 */

import { describe, it, expect } from "vitest";
import {
  LATEST_PROTOCOL_VERSION,
  RESOURCE_MIME_TYPE,
  RESOURCE_URI_META_KEY,
} from "../../src/constants";

describe("constants", () => {
  describe("LATEST_PROTOCOL_VERSION", () => {
    it("should be a string", () => {
      expect(typeof LATEST_PROTOCOL_VERSION).toBe("string");
    });

    it("should be in date format (YYYY-MM-DD)", () => {
      expect(LATEST_PROTOCOL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should have the expected value", () => {
      expect(LATEST_PROTOCOL_VERSION).toBe("2025-11-05");
    });
  });

  describe("RESOURCE_MIME_TYPE", () => {
    it("should be a string", () => {
      expect(typeof RESOURCE_MIME_TYPE).toBe("string");
    });

    it("should be a valid MIME type with profile", () => {
      expect(RESOURCE_MIME_TYPE).toMatch(/^text\/html;profile=/);
    });

    it("should have the expected value", () => {
      expect(RESOURCE_MIME_TYPE).toBe("text/html;profile=mcp-app");
    });
  });

  describe("RESOURCE_URI_META_KEY", () => {
    it("should be a string", () => {
      expect(typeof RESOURCE_URI_META_KEY).toBe("string");
    });

    it("should have the expected value", () => {
      expect(RESOURCE_URI_META_KEY).toBe("ui/resourceUri");
    });
  });
});
