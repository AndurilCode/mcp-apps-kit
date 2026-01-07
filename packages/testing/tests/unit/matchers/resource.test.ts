/**
 * Unit tests for resource matchers
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { expectResource } from "../../../src/matchers/resource";
import { AssertionError } from "../../../src/errors";
import type { ResourceResult } from "../../../src/types";

describe("expectResource", () => {
  describe("toHaveContent", () => {
    it("should pass when resource has content", () => {
      const result: ResourceResult = {
        contents: [{ type: "text", text: "Hello, world!" }],
      };

      expect(() => expectResource(result).toHaveContent()).not.toThrow();
    });

    it("should fail when resource has no content", () => {
      const result: ResourceResult = {
        contents: [],
      };

      expect(() => expectResource(result).toHaveContent()).toThrow(AssertionError);
    });
  });

  describe("toContainText", () => {
    it("should pass when text is found", () => {
      const result: ResourceResult = {
        contents: [{ type: "text", text: "Hello, world!" }],
      };

      expect(() => expectResource(result).toContainText("world")).not.toThrow();
    });

    it("should pass when text is found in multiple blocks", () => {
      const result: ResourceResult = {
        contents: [
          { type: "text", text: "First part" },
          { type: "text", text: "Second part with target" },
        ],
      };

      expect(() => expectResource(result).toContainText("target")).not.toThrow();
    });

    it("should fail when text is not found", () => {
      const result: ResourceResult = {
        contents: [{ type: "text", text: "Hello, world!" }],
      };

      expect(() => expectResource(result).toContainText("not found")).toThrow(AssertionError);
    });
  });

  describe("toHaveMimeType", () => {
    it("should pass when MIME type matches", () => {
      const result: ResourceResult = {
        contents: [{ type: "text", text: "{}", mimeType: "application/json" }],
      };

      expect(() => expectResource(result).toHaveMimeType("application/json")).not.toThrow();
    });

    it("should fail when MIME type does not match", () => {
      const result: ResourceResult = {
        contents: [{ type: "text", text: "plain text", mimeType: "text/plain" }],
      };

      expect(() => expectResource(result).toHaveMimeType("application/json")).toThrow(
        AssertionError
      );
    });

    it("should fail when no MIME type is present", () => {
      const result: ResourceResult = {
        contents: [{ type: "text", text: "no mime type" }],
      };

      expect(() => expectResource(result).toHaveMimeType("text/plain")).toThrow(AssertionError);
    });
  });

  describe("toMatchSchema", () => {
    it("should pass when JSON content matches schema", () => {
      const result: ResourceResult = {
        contents: [{ type: "text", text: '{"name": "test", "value": 42}' }],
      };

      const schema = z.object({
        name: z.string(),
        value: z.number(),
      });

      expect(() => expectResource(result).toMatchSchema(schema)).not.toThrow();
    });

    it("should fail when JSON content does not match schema", () => {
      const result: ResourceResult = {
        contents: [{ type: "text", text: '{"name": "test"}' }],
      };

      const schema = z.object({
        name: z.string(),
        value: z.number(),
      });

      expect(() => expectResource(result).toMatchSchema(schema)).toThrow(AssertionError);
    });

    it("should fail for non-JSON content when schema expects object", () => {
      const result: ResourceResult = {
        contents: [{ type: "text", text: "not json" }],
      };

      const schema = z.object({
        name: z.string(),
      });

      expect(() => expectResource(result).toMatchSchema(schema)).toThrow(AssertionError);
    });
  });

  describe("toMatchObject", () => {
    it("should pass for partial object match", () => {
      const result: ResourceResult = {
        contents: [{ type: "text", text: '{"name": "test", "value": 42, "extra": "field"}' }],
      };

      expect(() => expectResource(result).toMatchObject({ name: "test" })).not.toThrow();
    });

    it("should pass for nested object match", () => {
      const result: ResourceResult = {
        contents: [{ type: "text", text: '{"user": {"name": "Alice", "age": 30}}' }],
      };

      expect(() => expectResource(result).toMatchObject({ user: { name: "Alice" } })).not.toThrow();
    });

    it("should fail when object does not match", () => {
      const result: ResourceResult = {
        contents: [{ type: "text", text: '{"name": "test"}' }],
      };

      expect(() => expectResource(result).toMatchObject({ name: "different" })).toThrow(
        AssertionError
      );
    });
  });
});
