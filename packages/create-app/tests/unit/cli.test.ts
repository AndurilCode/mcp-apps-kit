/**
 * Unit tests for CLI argument parsing
 *
 * Tests the CLI command parsing and option handling.
 */

import { describe, it, expect } from "vitest";
import { parseArgs, validateProjectName } from "../../src/cli.js";

describe("CLI argument parsing", () => {
  describe("parseArgs", () => {
    it("should parse project name from positional argument", () => {
      const result = parseArgs(["my-app"]);
      expect(result.name).toBe("my-app");
    });

    it("should default template to 'react' when not specified", () => {
      const result = parseArgs(["my-app"]);
      expect(result.template).toBe("react");
    });

    it("should parse --template option", () => {
      const result = parseArgs(["my-app", "--template", "vanilla"]);
      expect(result.template).toBe("vanilla");
    });

    it("should parse -t short option for template", () => {
      const result = parseArgs(["my-app", "-t", "vanilla"]);
      expect(result.template).toBe("vanilla");
    });

    it("should parse --directory option", () => {
      const result = parseArgs(["my-app", "--directory", "/custom/path"]);
      expect(result.directory).toBe("/custom/path");
    });

    it("should parse -d short option for directory", () => {
      const result = parseArgs(["my-app", "-d", "/custom/path"]);
      expect(result.directory).toBe("/custom/path");
    });

    it("should use project name as directory when not specified", () => {
      const result = parseArgs(["my-app"]);
      expect(result.directory).toBeUndefined();
    });

    it("should parse --skip-install flag", () => {
      const result = parseArgs(["my-app", "--skip-install"]);
      expect(result.skipInstall).toBe(true);
    });

    it("should default skipInstall to false", () => {
      const result = parseArgs(["my-app"]);
      expect(result.skipInstall).toBe(false);
    });

    it("should parse --skip-git flag", () => {
      const result = parseArgs(["my-app", "--skip-git"]);
      expect(result.skipGit).toBe(true);
    });

    it("should throw for invalid template", () => {
      expect(() => parseArgs(["my-app", "-t", "invalid"])).toThrow();
    });

    it("should return interactive mode when no name provided", () => {
      const result = parseArgs([]);
      expect(result.interactive).toBe(true);
    });
  });

  describe("validateProjectName", () => {
    it("should accept valid npm package names", () => {
      expect(validateProjectName("my-app")).toBe(true);
      expect(validateProjectName("my_app")).toBe(true);
      expect(validateProjectName("myapp123")).toBe(true);
    });

    it("should reject names starting with a dot", () => {
      expect(validateProjectName(".hidden-app")).toBe(false);
    });

    it("should reject names with spaces", () => {
      expect(validateProjectName("my app")).toBe(false);
    });

    it("should reject names starting with uppercase", () => {
      expect(validateProjectName("MyApp")).toBe(false);
    });

    it("should reject empty names", () => {
      expect(validateProjectName("")).toBe(false);
    });

    it("should reject names with special characters", () => {
      expect(validateProjectName("my@app")).toBe(false);
      expect(validateProjectName("my#app")).toBe(false);
    });

    it("should accept scoped package names", () => {
      expect(validateProjectName("@myorg/my-app")).toBe(true);
    });
  });
});
