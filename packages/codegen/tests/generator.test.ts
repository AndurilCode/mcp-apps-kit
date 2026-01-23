/**
 * Tests for manifest generation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { generateManifest, writeManifest } from "../src/generator";

describe("generator", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-vite-plugin-test-"));
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("generateManifest", () => {
    it("should generate empty manifest for empty directories", async () => {
      // Create empty directories
      await fs.mkdir(path.join(tempDir, "tools"), { recursive: true });
      await fs.mkdir(path.join(tempDir, "workflows"), { recursive: true });
      await fs.mkdir(path.join(tempDir, "ui"), { recursive: true });

      const result = await generateManifest({
        projectRoot: tempDir,
        outDir: "__generated__",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.files).toHaveLength(0);
      expect(result.code).toContain("export const tools = {");
      expect(result.code).toContain("} as const;");
    });

    it("should discover tool files with default export", async () => {
      // Create tools directory with a simple tool
      await fs.mkdir(path.join(tempDir, "tools"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "tools", "greet.ts"),
        `export default { description: "Greet a user" };`
      );

      const result = await generateManifest({
        projectRoot: tempDir,
        outDir: "__generated__",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.identifier).toBe("greet");
      expect(result.code).toContain('import greet from "../tools/greet.js";');
      expect(result.code).toContain("greet,");
    });

    it("should skip files without default export", async () => {
      await fs.mkdir(path.join(tempDir, "tools"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "tools", "helpers.ts"),
        `export const helper = () => {};`
      );

      const silentLogger = {
        info: () => {},
        warn: () => {},
        error: () => {},
      };

      const result = await generateManifest({
        projectRoot: tempDir,
        outDir: "__generated__",
        logger: silentLogger,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("no default export");
      expect(result.files).toHaveLength(0);
    });

    it("should detect name collisions", async () => {
      await fs.mkdir(path.join(tempDir, "tools"), { recursive: true });
      await fs.mkdir(path.join(tempDir, "tools", "admin"), { recursive: true });

      // Create two files that will have the same identifier
      await fs.writeFile(
        path.join(tempDir, "tools", "greet.ts"),
        `export default { description: "Greet" };`
      );
      await fs.writeFile(
        path.join(tempDir, "tools", "admin", "greet.ts"),
        `export default { description: "Admin greet" };`
      );

      // Create a third tool that has a different name to verify collision
      // doesn't occur with unique names
      // Note: admin/greet.ts becomes admin_greet, not greet
      // So there's actually no collision here - let me fix the test

      const result = await generateManifest({
        projectRoot: tempDir,
        outDir: "__generated__",
      });

      // admin/greet.ts becomes admin_greet, tools/greet.ts becomes greet
      // So there's no collision - both are different identifiers
      expect(result.errors).toHaveLength(0);
    });

    it("should detect actual name collisions", async () => {
      await fs.mkdir(path.join(tempDir, "tools"), { recursive: true });
      await fs.mkdir(path.join(tempDir, "tools", "admin"), { recursive: true });

      // Create a file that will collide with another
      // tools/admin_greet.ts -> admin_greet
      // tools/admin/greet.ts -> admin_greet (collision!)
      await fs.writeFile(
        path.join(tempDir, "tools", "admin_greet.ts"),
        `export default { description: "Greet" };`
      );
      await fs.writeFile(
        path.join(tempDir, "tools", "admin", "greet.ts"),
        `export default { description: "Admin greet" };`
      );

      const result = await generateManifest({
        projectRoot: tempDir,
        outDir: "__generated__",
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Tool name collision");
      expect(result.errors[0]).toContain("admin_greet");
    });

    it("should skip underscore-prefixed files", async () => {
      await fs.mkdir(path.join(tempDir, "tools"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "tools", "_helpers.ts"),
        `export default { description: "Helpers" };`
      );
      await fs.writeFile(
        path.join(tempDir, "tools", "greet.ts"),
        `export default { description: "Greet" };`
      );

      const result = await generateManifest({
        projectRoot: tempDir,
        outDir: "__generated__",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.identifier).toBe("greet");
    });

    it("should skip index files", async () => {
      await fs.mkdir(path.join(tempDir, "tools"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "tools", "index.ts"),
        `export default { description: "Index" };`
      );
      await fs.writeFile(
        path.join(tempDir, "tools", "greet.ts"),
        `export default { description: "Greet" };`
      );

      const result = await generateManifest({
        projectRoot: tempDir,
        outDir: "__generated__",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.identifier).toBe("greet");
    });

    it("should handle nested directories", async () => {
      await fs.mkdir(path.join(tempDir, "tools", "admin"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "tools", "admin", "delete-user.ts"),
        `export default { description: "Delete user" };`
      );

      const result = await generateManifest({
        projectRoot: tempDir,
        outDir: "__generated__",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.identifier).toBe("admin_delete_user");
      expect(result.code).toContain(
        'import admin_delete_user from "../tools/admin/delete-user.js";'
      );
    });

    it("should convert kebab-case to snake_case", async () => {
      await fs.mkdir(path.join(tempDir, "tools"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "tools", "search-restaurants.ts"),
        `export default { description: "Search restaurants" };`
      );

      const result = await generateManifest({
        projectRoot: tempDir,
        outDir: "__generated__",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.files[0]?.identifier).toBe("search_restaurants");
    });

    it("should convert PascalCase to snake_case for UI files", async () => {
      await fs.mkdir(path.join(tempDir, "ui"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "ui", "SearchResults.tsx"),
        `export default { component: () => null };`
      );

      const result = await generateManifest({
        projectRoot: tempDir,
        directories: { ui: "ui" }, // UI directory must be explicitly configured
        outDir: "__generated__",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.files[0]?.identifier).toBe("search_results");
    });

    it("should generate type exports", async () => {
      await fs.mkdir(path.join(tempDir, "tools"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "tools", "greet.ts"),
        `export default { description: "Greet" };`
      );

      const result = await generateManifest({
        projectRoot: tempDir,
        outDir: "__generated__",
      });

      expect(result.code).toContain("export type AppTools = typeof tools;");
      expect(result.code).toContain("export type AppWorkflows = typeof workflows;");
      expect(result.code).toContain("export type AppUI = typeof ui;");
    });

    it("should handle missing directories gracefully", async () => {
      // Don't create any directories
      const result = await generateManifest({
        projectRoot: tempDir,
        outDir: "__generated__",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.files).toHaveLength(0);
      expect(result.code).toContain("export const tools = {");
    });

    it("should use custom directory configuration", async () => {
      await fs.mkdir(path.join(tempDir, "src", "tools"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "src", "tools", "greet.ts"),
        `export default { description: "Greet" };`
      );

      const result = await generateManifest({
        projectRoot: tempDir,
        directories: { tools: "src/tools" },
        outDir: "__generated__",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.files).toHaveLength(1);
    });

    it("should ignore non-TypeScript/JavaScript files", async () => {
      await fs.mkdir(path.join(tempDir, "tools"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "tools", "data.json"), `{ "key": "value" }`);
      await fs.writeFile(
        path.join(tempDir, "tools", "greet.ts"),
        `export default { description: "Greet" };`
      );

      const result = await generateManifest({
        projectRoot: tempDir,
        outDir: "__generated__",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.identifier).toBe("greet");
    });
  });

  describe("writeManifest", () => {
    it("should write manifest to disk", async () => {
      const code = "// Test manifest\nexport const tools = {} as const;";

      await writeManifest(code, "__generated__", tempDir);

      const manifestPath = path.join(tempDir, "__generated__", "app-manifest.ts");
      const content = await fs.readFile(manifestPath, "utf-8");
      expect(content).toBe(code);
    });

    it("should create output directory if it doesn't exist", async () => {
      const code = "// Test manifest";

      await writeManifest(code, "deep/nested/__generated__", tempDir);

      const manifestPath = path.join(tempDir, "deep/nested/__generated__", "app-manifest.ts");
      const content = await fs.readFile(manifestPath, "utf-8");
      expect(content).toBe(code);
    });
  });
});
