/**
 * @mcp-apps-kit/create-app
 *
 * Project scaffolding for MCP applications.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

// =============================================================================
// Types
// =============================================================================

export interface CreateAppOptions {
  name: string;
  template: "react" | "vanilla";
  protocol?: "mcp" | "openai";
  directory?: string;
  vercel?: boolean;
  skipInstall?: boolean;
  skipGit?: boolean;
}

// =============================================================================
// Version Detection
// =============================================================================

interface PackageVersions {
  core: string;
  ui: string;
  uiReact: string;
  testing: string;
}

// Cache for fetched versions
let cachedVersions: PackageVersions | null = null;

/**
 * Fetch the latest version of a package from npm registry
 */
function fetchLatestVersion(packageName: string): string {
  try {
    const result = execSync(`npm view ${packageName} version`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return `^${result}`;
  } catch {
    // Fallback to a reasonable default if we can't fetch
    return "^0.2.0";
  }
}

/**
 * Get the versions of @mcp-apps-kit packages from npm registry
 */
function getPackageVersions(): PackageVersions {
  if (cachedVersions) {
    return cachedVersions;
  }

  cachedVersions = {
    core: fetchLatestVersion("@mcp-apps-kit/core"),
    ui: fetchLatestVersion("@mcp-apps-kit/ui"),
    uiReact: fetchLatestVersion("@mcp-apps-kit/ui-react"),
    testing: fetchLatestVersion("@mcp-apps-kit/testing"),
  };

  return cachedVersions;
}

// =============================================================================
// Template Content
// =============================================================================

function getReactTemplate(
  name: string,
  vercel = false,
  protocol: "mcp" | "openai" = "mcp"
): Record<string, string> {
  const uiOutputDir = vercel ? "public" : "dist";
  const packageManager = "npm"; // Always use npm for standalone projects
  const versions = getPackageVersions();

  const files: Record<string, string> = {
    "package.json": JSON.stringify(
      {
        name,
        version: "0.1.0",
        type: "module",
        scripts: {
          dev: `${packageManager} run build:ui && concurrently "${packageManager} run dev:server" "${packageManager} run dev:ui"`,
          "dev:server": "tsx watch server/index.ts",
          "dev:ui": "vite --config ui/vite.config.ts",
          build: `${packageManager} run build:ui && tsc`,
          "build:ui": "vite build --config ui/vite.config.ts",
          start: "node dist/server/index.js",
          test: "vitest run",
          "test:watch": "vitest",
        },
        dependencies: {
          "@mcp-apps-kit/core": versions.core,
          "@mcp-apps-kit/ui": versions.ui,
          "@mcp-apps-kit/ui-react": versions.uiReact,
          react: "^18.2.0",
          "react-dom": "^18.2.0",
          zod: "^4.0.0",
          ...(vercel ? { express: "^4.21.0" } : {}),
        },
        devDependencies: {
          "@mcp-apps-kit/testing": versions.testing,
          "@types/react": "^18.2.0",
          "@types/react-dom": "^18.2.0",
          "@vitejs/plugin-react": "^4.2.0",
          concurrently: "^8.2.0",
          tsx: "^4.7.0",
          typescript: "^5.3.0",
          vite: "^5.0.0",
          vitest: "^4.0.0",
          "vite-plugin-singlefile": "^2.0.0",
        },
      },
      null,
      2
    ),
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          declaration: true,
          outDir: "dist",
          jsx: "react-jsx",
        },
        include: ["server/**/*", "ui/src/**/*"],
        exclude: ["node_modules", "dist"],
      },
      null,
      2
    ),
    "server/index.ts": vercel
      ? `/**
 * ${name} - MCP Server
 */

// Required for Vercel to detect Express
import "express";

import { createApp, defineTool, defineUI } from "@mcp-apps-kit/core";
import { z } from "zod";

// Define the UI for displaying greetings
const greetingUI = defineUI({
  name: "Greeting Widget",
  description: "Displays greeting messages",
  html: "./${uiOutputDir}/index.html",
  prefersBorder: true,
});

const app = createApp({
  name: "${name}",
  version: "0.1.0",

  config: {
    protocol: "${protocol}",
  },

  tools: {
    hello: defineTool({
      title: "Hello",
      description: "Say hello to someone",
      input: z.object({
        name: z.string().describe("Name to greet"),
      }),
      output: z.object({
        message: z.string(),
        timestamp: z.string(),
      }),
      handler: async ({ name }) => {
        return {
          message: \`Hello, \${name}!\`,
          timestamp: new Date().toISOString(),
        };
      },
      ui: greetingUI,
    }),
  },
});

// Only start locally - Vercel uses the exported Express app
if (!process.env.VERCEL) {
  await app.start({ port: 3000 });
  console.log("MCP server running on http://localhost:3000");
}

// Export app for testing
export { app };

// Export Express app for Vercel
export default app.expressApp;
`
      : `/**
 * ${name} - MCP Server
 */

import { createApp, defineTool, defineUI } from "@mcp-apps-kit/core";
import { z } from "zod";

// Define the UI for displaying greetings
const greetingUI = defineUI({
  name: "Greeting Widget",
  description: "Displays greeting messages",
  html: "./ui/dist/index.html",
  prefersBorder: true,
});

const app = createApp({
  name: "${name}",
  version: "0.1.0",

  config: {
    protocol: "${protocol}",
  },

  tools: {
    hello: defineTool({
      title: "Hello",
      description: "Say hello to someone",
      input: z.object({
        name: z.string().describe("Name to greet"),
      }),
      output: z.object({
        message: z.string(),
        timestamp: z.string(),
      }),
      handler: async ({ name }) => {
        return {
          message: \`Hello, \${name}!\`,
          timestamp: new Date().toISOString(),
        };
      },
      ui: greetingUI,
    }),
  },
});

// Start server (skip in test environment)
if (process.env.NODE_ENV !== "test") {
  await app.start({ port: 3000 });
  console.log("MCP server running on http://localhost:3000");
}

// Export app for testing
export { app };
`,
    "ui/src/App.tsx": `/**
 * ${name} - UI Component
 */

import {
  useAppsClient,
  useToolResult,
  useHostContext,
  useDocumentTheme,
  useHostStyleVariables,
} from "@mcp-apps-kit/ui-react";

// Type for the hello tool output
type HelloOutput = { message: string; timestamp: string };

// Type for all tool outputs (keyed by tool name)
type ToolOutputs = { hello: HelloOutput };

export function App() {
  const client = useAppsClient();
  const result = useToolResult<ToolOutputs>();
  const context = useHostContext();

  // Apply theme and host styles
  useDocumentTheme("light", "dark");
  useHostStyleVariables();

  // Handle both wrapped ({ hello: {...} }) and unwrapped ({...}) result formats
  // Wrapped: when toolResponseMetadata.toolName is available
  // Unwrapped: direct result format
  const rawResult = result?.hello ?? result;
  const output = rawResult && "message" in rawResult
    ? (rawResult as HelloOutput)
    : undefined;

  return (
    <div className="container">
      {output?.message ? (
        <div className="greeting">
          <h1>{output.message}</h1>
          <p className="timestamp">Sent at: {new Date(output.timestamp).toLocaleTimeString()}</p>
        </div>
      ) : (
        <p className="waiting">Waiting for greeting...</p>
      )}

      <button
        className="button"
        onClick={() => client.sendFollowUpMessage("Please greet me again!")}
      >
        Request New Greeting
      </button>

      <footer className="meta">
        Theme: {context.theme} | Locale: {context.locale}
      </footer>
    </div>
  );
}
`,
    "ui/src/main.tsx": `/**
 * ${name} - UI Entry Point
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { AppsProvider } from "@mcp-apps-kit/ui-react";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <React.StrictMode>
    <AppsProvider>
      <App />
    </AppsProvider>
  </React.StrictMode>
);
`,
    "ui/src/styles.css": `/* Base styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 16px;
  background: #fff;
  color: #333;
  transition: background-color 0.2s, color 0.2s;
}

.container {
  max-width: 400px;
  margin: 0 auto;
}

/* Greeting card */
.greeting {
  text-align: center;
  padding: 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.greeting h1 {
  font-size: 1.5rem;
  margin-bottom: 8px;
}

.timestamp {
  font-size: 0.875rem;
  opacity: 0.8;
}

/* Waiting state */
.waiting {
  text-align: center;
  padding: 24px;
  color: #666;
  font-style: italic;
}

/* Button */
.button {
  margin-top: 16px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: opacity 0.2s, transform 0.1s;
}

.button:hover {
  opacity: 0.9;
}

.button:active {
  transform: scale(0.98);
}

/* Footer meta */
.meta {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #eee;
  font-size: 0.75rem;
  color: #999;
  text-align: center;
}

/* Dark mode support */
.dark body,
body.dark {
  background: #1a1a1a;
  color: #fff;
}

.dark .waiting,
body.dark .waiting {
  color: #aaa;
}

.dark .meta,
body.dark .meta {
  border-color: #333;
  color: #666;
}

/* Additional dark mode adjustments */
.dark .greeting,
body.dark .greeting {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
`,
    "ui/index.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    "ui/vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  root: "./ui",
  build: {
    outDir: "${uiOutputDir}",
    emptyOutDir: true,
  },
});
`,
    ".gitignore": `node_modules/
dist/
public/
*.log
.env
.env.local
`,
    "README.md": `# ${name}

An MCP application built with @mcp-apps-kit.

## Development

\`\`\`bash
${packageManager} install
${packageManager} run dev
\`\`\`

## Build

\`\`\`bash
${packageManager} run build
\`\`\`

## Connecting to an MCP Apps Host

Configure your MCP Apps-compatible host to connect to the server:

**HTTP mode (default):**
- Endpoint: \`http://localhost:3000/mcp\`

**Stdio mode (for hosts that support it):**
\`\`\`bash
npx tsx path/to/${name}/server/index.ts
\`\`\`
${
  vercel
    ? `
## Deploy to Vercel

This project is configured for Vercel deployment:

\`\`\`bash
vercel deploy
\`\`\`

Then use the deployed URL as your MCP server endpoint.
`
    : ""
}
`,
    "vitest.config.ts": `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["./tests/setup.ts"],
  },
});
`,
    "tests/setup.ts": `/**
 * Test setup for ${name}
 */

import { setupVitestMatchers } from "@mcp-apps-kit/testing/vitest";

setupVitestMatchers();
`,
    "tests/integration/server.test.ts": `/**
 * Integration tests for ${name} MCP server
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer, createTestClient, expectToolResult } from "@mcp-apps-kit/testing";
import type { TestEnvironment } from "@mcp-apps-kit/testing";
import { app } from "../../server/index.js";

describe("${name} MCP Server", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    const server = await startTestServer(app, { port: 0 });
    await new Promise((r) => setTimeout(r, 100));

    const client = await createTestClient({ transport: "http", url: server.mcpUrl }, {
      trackHistory: true,
      timeout: 10000,
    });

    env = {
      server,
      client,
      cleanup: async () => {
        await client.disconnect();
        await server.stop();
      },
    };
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("should start server and connect client", () => {
    expect(env.server).toBeDefined();
    expect(env.client).toBeDefined();
    expect(env.server.url).toBeTruthy();
  });

  it("should list available tools", async () => {
    const tools = await env.client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t) => t.name === "hello")).toBe(true);
  });

  it("should call hello tool successfully", async () => {
    const result = await env.client.callTool("hello", { name: "World" });

    expectToolResult(result).toHaveNoError();
    expectToolResult(result).toMatchObject({
      message: "Hello, World!",
    });
  });

  it("should include timestamp in response", async () => {
    const result = await env.client.callTool("hello", { name: "Test" });

    expectToolResult(result).toHaveNoError();
    const content = result.structuredContent as { timestamp?: string };
    expect(content.timestamp).toBeDefined();
    expect(new Date(content.timestamp!).getTime()).not.toBeNaN();
  });
});
`,
  };

  // Add vercel.json if Vercel setup is enabled
  if (vercel) {
    files["vercel.json"] = JSON.stringify(
      {
        installCommand: "npm install",
        buildCommand: "npm run build:ui",
        outputDirectory: ".",
        functions: {
          "server/index.ts": {
            includeFiles: `${uiOutputDir}/**`,
          },
        },
        rewrites: [
          {
            source: "/(.*)",
            destination: "/server/index.ts",
          },
        ],
      },
      null,
      2
    );
  }

  return files;
}

function getVanillaTemplate(
  name: string,
  vercel = false,
  protocol: "mcp" | "openai" = "mcp"
): Record<string, string> {
  const uiOutputDir = vercel ? "public" : "dist";
  const packageManager = "npm"; // Always use npm for standalone projects
  const versions = getPackageVersions();

  const files: Record<string, string> = {
    "package.json": JSON.stringify(
      {
        name,
        version: "0.1.0",
        type: "module",
        scripts: {
          dev: `${packageManager} run build:ui && concurrently "${packageManager} run dev:server" "${packageManager} run dev:ui"`,
          "dev:server": "tsx watch server/index.ts",
          "dev:ui": "vite --config ui/vite.config.ts",
          build: `${packageManager} run build:ui && tsc`,
          "build:ui": "vite build --config ui/vite.config.ts",
          start: "node dist/server/index.js",
          test: "vitest run",
          "test:watch": "vitest",
        },
        dependencies: {
          "@mcp-apps-kit/core": versions.core,
          "@mcp-apps-kit/ui": versions.ui,
          zod: "^4.0.0",
          ...(vercel ? { express: "^4.21.0" } : {}),
        },
        devDependencies: {
          "@mcp-apps-kit/testing": versions.testing,
          concurrently: "^8.2.0",
          tsx: "^4.7.0",
          typescript: "^5.3.0",
          vite: "^5.0.0",
          vitest: "^4.0.0",
          "vite-plugin-singlefile": "^2.0.0",
        },
      },
      null,
      2
    ),
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          declaration: true,
          outDir: "dist",
        },
        include: ["server/**/*", "ui/src/**/*"],
        exclude: ["node_modules", "dist"],
      },
      null,
      2
    ),
    "server/index.ts": vercel
      ? `/**
 * ${name} - MCP Server
 */

// Required for Vercel to detect Express
import "express";

import { createApp, defineTool, defineUI } from "@mcp-apps-kit/core";
import { z } from "zod";

// Define the UI for displaying greetings
const greetingUI = defineUI({
  name: "Greeting Widget",
  description: "Displays greeting messages",
  html: "./${uiOutputDir}/index.html",
  prefersBorder: true,
});

const app = createApp({
  name: "${name}",
  version: "0.1.0",

  config: {
    protocol: "${protocol}",
  },

  tools: {
    hello: defineTool({
      title: "Hello",
      description: "Say hello to someone",
      input: z.object({
        name: z.string().describe("Name to greet"),
      }),
      output: z.object({
        message: z.string(),
        timestamp: z.string(),
      }),
      handler: async ({ name }) => {
        return {
          message: \`Hello, \${name}!\`,
          timestamp: new Date().toISOString(),
        };
      },
      ui: greetingUI,
    }),
  },
});

// Only start locally - Vercel uses the exported Express app
if (!process.env.VERCEL) {
  await app.start({ port: 3000 });
  console.log("MCP server running on http://localhost:3000");
}

// Export app for testing
export { app };

// Export Express app for Vercel
export default app.expressApp;
`
      : `/**
 * ${name} - MCP Server
 */

import { createApp, defineTool, defineUI } from "@mcp-apps-kit/core";
import { z } from "zod";

// Define the UI for displaying greetings
const greetingUI = defineUI({
  name: "Greeting Widget",
  description: "Displays greeting messages",
  html: "./ui/dist/index.html",
  prefersBorder: true,
});

const app = createApp({
  name: "${name}",
  version: "0.1.0",

  config: {
    protocol: "${protocol}",
  },

  tools: {
    hello: defineTool({
      title: "Hello",
      description: "Say hello to someone",
      input: z.object({
        name: z.string().describe("Name to greet"),
      }),
      output: z.object({
        message: z.string(),
        timestamp: z.string(),
      }),
      handler: async ({ name }) => {
        return {
          message: \`Hello, \${name}!\`,
          timestamp: new Date().toISOString(),
        };
      },
      ui: greetingUI,
    }),
  },
});

// Start server (skip in test environment)
if (process.env.NODE_ENV !== "test") {
  await app.start({ port: 3000 });
  console.log("MCP server running on http://localhost:3000");
}

// Export app for testing
export { app };
`,
    "ui/src/main.ts": `/**
 * ${name} - UI Entry Point
 */

import { createClient } from "@mcp-apps-kit/ui";
import "./styles.css";

// Type for the hello tool output
type HelloOutput = { message: string; timestamp: string };

// Type for all tool outputs (keyed by tool name)
type ToolOutputs = { hello: HelloOutput };

// Store latest tool result
let latestToolResult: ToolOutputs | HelloOutput | undefined;

async function main() {
  const client = await createClient<ToolOutputs>();

  // Get container
  const container = document.getElementById("app");
  if (!container) throw new Error("Container not found");

  // Render initial UI
  render(container, client);

  // Subscribe to context changes
  client.onHostContextChange((context) => {
    document.documentElement.className = context.theme;
    render(container, client);
  });

  // Subscribe to tool result changes
  client.onToolResult((result) => {
    latestToolResult = result as ToolOutputs | HelloOutput;
    render(container, client);
  });
}

function render(container: HTMLElement, client: Awaited<ReturnType<typeof createClient>>) {
  const context = client.hostContext;

  // Handle both wrapped ({ hello: {...} }) and unwrapped ({...}) result formats
  const rawResult = (latestToolResult as ToolOutputs)?.hello ?? latestToolResult;
  const output = rawResult && "message" in rawResult
    ? (rawResult as HelloOutput)
    : undefined;

  container.innerHTML = \`
    <div class="container">
      \${output?.message ? \`
        <div class="greeting">
          <h1>\${output.message}</h1>
          <p class="timestamp">Sent at: \${new Date(output.timestamp).toLocaleTimeString()}</p>
        </div>
      \` : \`
        <p class="waiting">Waiting for greeting...</p>
      \`}

      <button class="button" id="request-btn">
        Request New Greeting
      </button>

      <footer class="meta">
        Theme: \${context.theme} | Locale: \${context.locale}
      </footer>
    </div>
  \`;

  // Add event listener
  const btn = document.getElementById("request-btn");
  btn?.addEventListener("click", () => {
    client.sendFollowUpMessage("Please greet me again!");
  });
}

main();
`,
    "ui/src/styles.css": `/* Base styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 16px;
  background: #fff;
  color: #333;
  transition: background-color 0.2s, color 0.2s;
}

.container {
  max-width: 400px;
  margin: 0 auto;
}

/* Greeting card */
.greeting {
  text-align: center;
  padding: 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.greeting h1 {
  font-size: 1.5rem;
  margin-bottom: 8px;
}

.timestamp {
  font-size: 0.875rem;
  opacity: 0.8;
}

/* Waiting state */
.waiting {
  text-align: center;
  padding: 24px;
  color: #666;
  font-style: italic;
}

/* Button */
.button {
  margin-top: 16px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: opacity 0.2s, transform 0.1s;
}

.button:hover {
  opacity: 0.9;
}

.button:active {
  transform: scale(0.98);
}

/* Footer meta */
.meta {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #eee;
  font-size: 0.75rem;
  color: #999;
  text-align: center;
}

/* Dark mode support */
.dark body,
body.dark {
  background: #1a1a1a;
  color: #fff;
}

.dark .waiting,
body.dark .waiting {
  color: #aaa;
}

.dark .meta,
body.dark .meta {
  border-color: #333;
  color: #666;
}

/* Additional dark mode adjustments */
.dark .greeting,
body.dark .greeting {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
`,
    "ui/index.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
    "ui/vite.config.ts": `import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  root: "./ui",
  build: {
    outDir: "${uiOutputDir}",
    emptyOutDir: true,
  },
});
`,
    ".gitignore": `node_modules/
dist/
public/
*.log
.env
.env.local
`,
    "README.md": `# ${name}

An MCP application built with @mcp-apps-kit.

## Development

\`\`\`bash
${packageManager} install
${packageManager} run dev
\`\`\`

## Build

\`\`\`bash
${packageManager} run build
\`\`\`

## Connecting to an MCP Apps Host

Configure your MCP Apps-compatible host to connect to the server:

**HTTP mode (default):**
- Endpoint: \`http://localhost:3000/mcp\`

**Stdio mode (for hosts that support it):**
\`\`\`bash
npx tsx path/to/${name}/server/index.ts
\`\`\`
${
  vercel
    ? `
## Deploy to Vercel

This project is configured for Vercel deployment:

\`\`\`bash
vercel deploy
\`\`\`

Then use the deployed URL as your MCP server endpoint.
`
    : ""
}
`,
    "vitest.config.ts": `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["./tests/setup.ts"],
  },
});
`,
    "tests/setup.ts": `/**
 * Test setup for ${name}
 */

import { setupVitestMatchers } from "@mcp-apps-kit/testing/vitest";

setupVitestMatchers();
`,
    "tests/integration/server.test.ts": `/**
 * Integration tests for ${name} MCP server
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer, createTestClient, expectToolResult } from "@mcp-apps-kit/testing";
import type { TestEnvironment } from "@mcp-apps-kit/testing";
import { app } from "../../server/index.js";

describe("${name} MCP Server", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    const server = await startTestServer(app, { port: 0 });
    await new Promise((r) => setTimeout(r, 100));

    const client = await createTestClient({ transport: "http", url: server.mcpUrl }, {
      trackHistory: true,
      timeout: 10000,
    });

    env = {
      server,
      client,
      cleanup: async () => {
        await client.disconnect();
        await server.stop();
      },
    };
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("should start server and connect client", () => {
    expect(env.server).toBeDefined();
    expect(env.client).toBeDefined();
    expect(env.server.url).toBeTruthy();
  });

  it("should list available tools", async () => {
    const tools = await env.client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t) => t.name === "hello")).toBe(true);
  });

  it("should call hello tool successfully", async () => {
    const result = await env.client.callTool("hello", { name: "World" });

    expectToolResult(result).toHaveNoError();
    expectToolResult(result).toMatchObject({
      message: "Hello, World!",
    });
  });

  it("should include timestamp in response", async () => {
    const result = await env.client.callTool("hello", { name: "Test" });

    expectToolResult(result).toHaveNoError();
    const content = result.structuredContent as { timestamp?: string };
    expect(content.timestamp).toBeDefined();
    expect(new Date(content.timestamp!).getTime()).not.toBeNaN();
  });
});
`,
  };

  // Add vercel.json if Vercel setup is enabled
  if (vercel) {
    files["vercel.json"] = JSON.stringify(
      {
        installCommand: "npm install",
        buildCommand: "npm run build:ui",
        outputDirectory: ".",
        functions: {
          "server/index.ts": {
            includeFiles: `${uiOutputDir}/**`,
          },
        },
        rewrites: [
          {
            source: "/(.*)",
            destination: "/server/index.ts",
          },
        ],
      },
      null,
      2
    );
  }

  return files;
}

// =============================================================================
// Scaffolding Logic
// =============================================================================

/**
 * Scaffold a new MCP application project
 */
export async function scaffoldProject(options: CreateAppOptions): Promise<void> {
  const {
    name,
    template,
    protocol = "mcp",
    directory,
    vercel = false,
    skipInstall = false,
    skipGit = false,
  } = options;

  // Determine project directory
  const projectDir = directory ?? path.resolve(process.cwd(), name);

  // Check if directory exists and is not empty
  if (fs.existsSync(projectDir)) {
    const files = fs.readdirSync(projectDir);
    if (files.length > 0) {
      throw new Error(`Directory ${projectDir} is not empty. Please use an empty directory.`);
    }
  } else {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  // Get template files
  const templateFiles =
    template === "react"
      ? getReactTemplate(name, vercel, protocol)
      : getVanillaTemplate(name, vercel, protocol);

  // Write all files
  for (const [filePath, content] of Object.entries(templateFiles)) {
    const fullPath = path.join(projectDir, filePath);
    const dir = path.dirname(fullPath);

    // Create directory if needed
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(fullPath, content, "utf-8");
  }

  // Initialize git repository
  if (!skipGit) {
    try {
      execSync("git init", { cwd: projectDir, stdio: "ignore" });
    } catch {
      // Ignore git init errors (git may not be installed)
    }
  }

  // Install dependencies
  if (!skipInstall) {
    try {
      // Always use npm for standalone projects (avoids workspace conflicts)
      execSync("npm install", { cwd: projectDir, stdio: "inherit" });
    } catch {
      console.warn("Warning: Could not install dependencies automatically.");
    }
  }
}
