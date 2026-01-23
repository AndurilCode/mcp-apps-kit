/**
 * Tests for naming convention utilities
 */

import { describe, it, expect } from "vitest";
import {
  pathToIdentifier,
  segmentToSnakeCase,
  shouldSkipFile,
  hasValidExtension,
  findNameCollisions,
  getRelativeImportPath,
  isValidIdentifier,
  VALID_EXTENSIONS,
} from "../src/naming";

describe("naming", () => {
  describe("segmentToSnakeCase", () => {
    it("should handle simple lowercase names", () => {
      expect(segmentToSnakeCase("greet")).toBe("greet");
      expect(segmentToSnakeCase("hello")).toBe("hello");
    });

    it("should convert kebab-case to snake_case", () => {
      expect(segmentToSnakeCase("search-restaurants")).toBe("search_restaurants");
      expect(segmentToSnakeCase("delete-user")).toBe("delete_user");
      expect(segmentToSnakeCase("get-user-profile")).toBe("get_user_profile");
    });

    it("should convert PascalCase to snake_case", () => {
      expect(segmentToSnakeCase("SearchResults")).toBe("search_results");
      expect(segmentToSnakeCase("DeleteUser")).toBe("delete_user");
      expect(segmentToSnakeCase("GetUserProfile")).toBe("get_user_profile");
    });

    it("should convert camelCase to snake_case", () => {
      expect(segmentToSnakeCase("searchResults")).toBe("search_results");
      expect(segmentToSnakeCase("deleteUser")).toBe("delete_user");
      expect(segmentToSnakeCase("getUserProfile")).toBe("get_user_profile");
    });

    it("should handle file extensions", () => {
      expect(segmentToSnakeCase("greet.ts")).toBe("greet");
      expect(segmentToSnakeCase("SearchResults.tsx")).toBe("search_results");
      expect(segmentToSnakeCase("search-restaurants.js")).toBe("search_restaurants");
    });

    it("should handle consecutive uppercase letters", () => {
      expect(segmentToSnakeCase("XMLParser")).toBe("xml_parser");
      expect(segmentToSnakeCase("HTMLElement")).toBe("html_element");
      expect(segmentToSnakeCase("APIEndpoint")).toBe("api_endpoint");
    });

    it("should handle single letters", () => {
      expect(segmentToSnakeCase("a")).toBe("a");
      expect(segmentToSnakeCase("A")).toBe("a");
    });
  });

  describe("pathToIdentifier", () => {
    it("should handle simple file names", () => {
      expect(pathToIdentifier("greet.ts")).toBe("greet");
      expect(pathToIdentifier("hello.tsx")).toBe("hello");
    });

    it("should handle kebab-case file names", () => {
      expect(pathToIdentifier("search-restaurants.ts")).toBe("search_restaurants");
    });

    it("should handle PascalCase file names", () => {
      expect(pathToIdentifier("SearchResults.tsx")).toBe("search_results");
    });

    it("should join path segments with underscores", () => {
      expect(pathToIdentifier("admin/delete-user.ts")).toBe("admin_delete_user");
      expect(pathToIdentifier("api/v1/GetUsers.ts")).toBe("api_v1_get_users");
      expect(pathToIdentifier("deep/nested/path/tool.ts")).toBe("deep_nested_path_tool");
    });

    it("should handle Windows-style paths", () => {
      expect(pathToIdentifier("admin\\delete-user.ts")).toBe("admin_delete_user");
    });
  });

  describe("shouldSkipFile", () => {
    it("should skip underscore-prefixed files", () => {
      expect(shouldSkipFile("_helpers.ts")).toBe(true);
      expect(shouldSkipFile("_utils.ts")).toBe(true);
      expect(shouldSkipFile("_internal.tsx")).toBe(true);
    });

    it("should skip index files", () => {
      expect(shouldSkipFile("index.ts")).toBe(true);
      expect(shouldSkipFile("index.tsx")).toBe(true);
      expect(shouldSkipFile("index.js")).toBe(true);
    });

    it("should not skip regular files", () => {
      expect(shouldSkipFile("greet.ts")).toBe(false);
      expect(shouldSkipFile("SearchResults.tsx")).toBe(false);
      expect(shouldSkipFile("my-tool.ts")).toBe(false);
    });

    it("should handle full paths", () => {
      expect(shouldSkipFile("/path/to/_helpers.ts")).toBe(true);
      expect(shouldSkipFile("/path/to/index.ts")).toBe(true);
      expect(shouldSkipFile("/path/to/greet.ts")).toBe(false);
    });
  });

  describe("hasValidExtension", () => {
    it("should accept TypeScript files", () => {
      expect(hasValidExtension("greet.ts")).toBe(true);
      expect(hasValidExtension("greet.tsx")).toBe(true);
    });

    it("should accept JavaScript files", () => {
      expect(hasValidExtension("greet.js")).toBe(true);
      expect(hasValidExtension("greet.jsx")).toBe(true);
    });

    it("should reject other file types", () => {
      expect(hasValidExtension("readme.md")).toBe(false);
      expect(hasValidExtension("data.json")).toBe(false);
      expect(hasValidExtension("style.css")).toBe(false);
      expect(hasValidExtension("config.yaml")).toBe(false);
    });

    it("should handle uppercase extensions", () => {
      expect(hasValidExtension("greet.TS")).toBe(true);
      expect(hasValidExtension("greet.TSX")).toBe(true);
    });
  });

  describe("findNameCollisions", () => {
    it("should return empty map when no collisions", () => {
      const files = [
        { identifier: "greet", filePath: "tools/greet.ts" },
        { identifier: "search", filePath: "tools/search.ts" },
      ];
      const collisions = findNameCollisions(files);
      expect(collisions.size).toBe(0);
    });

    it("should detect collisions", () => {
      const files = [
        { identifier: "greet", filePath: "tools/greet.ts" },
        { identifier: "greet", filePath: "tools/admin/greet.ts" },
        { identifier: "search", filePath: "tools/search.ts" },
      ];
      const collisions = findNameCollisions(files);
      expect(collisions.size).toBe(1);
      expect(collisions.get("greet")).toEqual(["tools/greet.ts", "tools/admin/greet.ts"]);
    });

    it("should detect multiple collisions", () => {
      const files = [
        { identifier: "greet", filePath: "tools/greet.ts" },
        { identifier: "greet", filePath: "tools/admin/greet.ts" },
        { identifier: "search", filePath: "tools/search.ts" },
        { identifier: "search", filePath: "tools/api/search.ts" },
      ];
      const collisions = findNameCollisions(files);
      expect(collisions.size).toBe(2);
      expect(collisions.has("greet")).toBe(true);
      expect(collisions.has("search")).toBe(true);
    });
  });

  describe("getRelativeImportPath", () => {
    it("should generate correct relative path with .js extension by default", () => {
      const result = getRelativeImportPath("__generated__", "tools/greet.ts", "/project");
      expect(result).toBe("../tools/greet.js");
    });

    it("should handle nested tool directories", () => {
      const result = getRelativeImportPath(
        "__generated__",
        "tools/admin/delete-user.ts",
        "/project"
      );
      expect(result).toBe("../tools/admin/delete-user.js");
    });

    it("should handle tsx files", () => {
      const result = getRelativeImportPath("__generated__", "ui/SearchResults.tsx", "/project");
      expect(result).toBe("../ui/SearchResults.js");
    });

    it("should omit extension when useJsExtension is false", () => {
      const result = getRelativeImportPath("__generated__", "tools/greet.ts", "/project", false);
      expect(result).toBe("../tools/greet");
    });
  });

  describe("isValidIdentifier", () => {
    it("should accept valid identifiers", () => {
      expect(isValidIdentifier("greet")).toBe(true);
      expect(isValidIdentifier("search_restaurants")).toBe(true);
      expect(isValidIdentifier("admin_delete_user")).toBe(true);
      expect(isValidIdentifier("_private")).toBe(true);
    });

    it("should reject invalid identifiers", () => {
      expect(isValidIdentifier("123abc")).toBe(false);
      expect(isValidIdentifier("search-restaurants")).toBe(false);
      expect(isValidIdentifier("")).toBe(false);
    });
  });

  describe("VALID_EXTENSIONS", () => {
    it("should include TypeScript and JavaScript extensions", () => {
      expect(VALID_EXTENSIONS).toContain(".ts");
      expect(VALID_EXTENSIONS).toContain(".tsx");
      expect(VALID_EXTENSIONS).toContain(".js");
      expect(VALID_EXTENSIONS).toContain(".jsx");
    });
  });
});
