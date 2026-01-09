/**
 * Integration tests for project scaffolding
 *
 * Tests the complete scaffolding workflow from CLI to generated project.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { scaffoldProject } from "../../src/index.js";

describe("Project scaffolding", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-app-test-"));
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("React template", () => {
    it("should create project directory", async () => {
      const projectDir = path.join(tempDir, "my-react-app");

      await scaffoldProject({
        name: "my-react-app",
        template: "react",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      expect(fs.existsSync(projectDir)).toBe(true);
    });

    it("should create package.json with correct name", async () => {
      const projectDir = path.join(tempDir, "my-react-app");

      await scaffoldProject({
        name: "my-react-app",
        template: "react",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      const packageJson = JSON.parse(
        fs.readFileSync(path.join(projectDir, "package.json"), "utf-8")
      );
      expect(packageJson.name).toBe("my-react-app");
    });

    it("should include @mcp-apps-kit dependencies", async () => {
      const projectDir = path.join(tempDir, "my-react-app");

      await scaffoldProject({
        name: "my-react-app",
        template: "react",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      const packageJson = JSON.parse(
        fs.readFileSync(path.join(projectDir, "package.json"), "utf-8")
      );
      expect(packageJson.dependencies).toHaveProperty("@mcp-apps-kit/core");
      expect(packageJson.dependencies).toHaveProperty("@mcp-apps-kit/ui-react");
      expect(packageJson.dependencies).toHaveProperty("zod");
      expect(packageJson.dependencies).toHaveProperty("react");
      expect(packageJson.dependencies).toHaveProperty("react-dom");
    });

    it("should create server directory with index.ts", async () => {
      const projectDir = path.join(tempDir, "my-react-app");

      await scaffoldProject({
        name: "my-react-app",
        template: "react",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      expect(fs.existsSync(path.join(projectDir, "server", "index.ts"))).toBe(true);
    });

    it("should create ui directory with React components", async () => {
      const projectDir = path.join(tempDir, "my-react-app");

      await scaffoldProject({
        name: "my-react-app",
        template: "react",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      expect(fs.existsSync(path.join(projectDir, "ui", "src", "App.tsx"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "ui", "src", "main.tsx"))).toBe(true);
    });

    it("should create tsconfig.json", async () => {
      const projectDir = path.join(tempDir, "my-react-app");

      await scaffoldProject({
        name: "my-react-app",
        template: "react",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      expect(fs.existsSync(path.join(projectDir, "tsconfig.json"))).toBe(true);
    });

    it("should create test setup files", async () => {
      const projectDir = path.join(tempDir, "my-react-app");

      await scaffoldProject({
        name: "my-react-app",
        template: "react",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      expect(fs.existsSync(path.join(projectDir, "vitest.config.ts"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "tests", "setup.ts"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "tests", "integration", "server.test.ts"))).toBe(
        true
      );
    });

    it("should include testing dependencies", async () => {
      const projectDir = path.join(tempDir, "my-react-app");

      await scaffoldProject({
        name: "my-react-app",
        template: "react",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      const packageJson = JSON.parse(
        fs.readFileSync(path.join(projectDir, "package.json"), "utf-8")
      );
      expect(packageJson.devDependencies).toHaveProperty("@mcp-apps-kit/testing");
      expect(packageJson.devDependencies).toHaveProperty("vitest");
      expect(packageJson.scripts).toHaveProperty("test");
      expect(packageJson.scripts).toHaveProperty("test:watch");
    });

    it("should export app from server for testing", async () => {
      const projectDir = path.join(tempDir, "my-react-app");

      await scaffoldProject({
        name: "my-react-app",
        template: "react",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      const serverContent = fs.readFileSync(path.join(projectDir, "server", "index.ts"), "utf-8");
      expect(serverContent).toContain("export { app }");
    });
  });

  describe("Vanilla template", () => {
    it("should create project directory", async () => {
      const projectDir = path.join(tempDir, "my-vanilla-app");

      await scaffoldProject({
        name: "my-vanilla-app",
        template: "vanilla",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      expect(fs.existsSync(projectDir)).toBe(true);
    });

    it("should include @mcp-apps-kit/ui but not ui-react", async () => {
      const projectDir = path.join(tempDir, "my-vanilla-app");

      await scaffoldProject({
        name: "my-vanilla-app",
        template: "vanilla",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      const packageJson = JSON.parse(
        fs.readFileSync(path.join(projectDir, "package.json"), "utf-8")
      );
      expect(packageJson.dependencies).toHaveProperty("@mcp-apps-kit/core");
      expect(packageJson.dependencies).toHaveProperty("@mcp-apps-kit/ui");
      expect(packageJson.dependencies).not.toHaveProperty("@mcp-apps-kit/ui-react");
    });

    it("should create ui directory with vanilla JS files", async () => {
      const projectDir = path.join(tempDir, "my-vanilla-app");

      await scaffoldProject({
        name: "my-vanilla-app",
        template: "vanilla",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      expect(fs.existsSync(path.join(projectDir, "ui", "src", "main.ts"))).toBe(true);
    });

    it("should create test setup files", async () => {
      const projectDir = path.join(tempDir, "my-vanilla-app");

      await scaffoldProject({
        name: "my-vanilla-app",
        template: "vanilla",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      expect(fs.existsSync(path.join(projectDir, "vitest.config.ts"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "tests", "setup.ts"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "tests", "integration", "server.test.ts"))).toBe(
        true
      );
    });

    it("should include testing dependencies", async () => {
      const projectDir = path.join(tempDir, "my-vanilla-app");

      await scaffoldProject({
        name: "my-vanilla-app",
        template: "vanilla",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      const packageJson = JSON.parse(
        fs.readFileSync(path.join(projectDir, "package.json"), "utf-8")
      );
      expect(packageJson.devDependencies).toHaveProperty("@mcp-apps-kit/testing");
      expect(packageJson.devDependencies).toHaveProperty("vitest");
      expect(packageJson.scripts).toHaveProperty("test");
      expect(packageJson.scripts).toHaveProperty("test:watch");
    });
  });

  describe("Error handling", () => {
    it("should throw if directory already exists with files", async () => {
      const projectDir = path.join(tempDir, "existing-project");
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, "file.txt"), "content");

      await expect(
        scaffoldProject({
          name: "existing-project",
          template: "react",
          directory: projectDir,
          skipInstall: true,
          skipGit: true,
        })
      ).rejects.toThrow();
    });

    it("should allow scaffolding in empty existing directory", async () => {
      const projectDir = path.join(tempDir, "empty-project");
      fs.mkdirSync(projectDir);

      await scaffoldProject({
        name: "empty-project",
        template: "react",
        directory: projectDir,
        skipInstall: true,
        skipGit: true,
      });

      expect(fs.existsSync(path.join(projectDir, "package.json"))).toBe(true);
    });
  });
});
