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
  };

  return cachedVersions;
}

// =============================================================================
// Template Content
// =============================================================================

function getReactTemplate(name: string, vercel = false): Record<string, string> {
  const uiOutputDir = vercel ? "public" : "dist";
  const packageManager = vercel ? "npm" : "pnpm";
  const versions = getPackageVersions();

  const files: Record<string, string> = {
    "package.json": JSON.stringify(
      {
        name,
        version: "0.1.0",
        type: "module",
        scripts: {
          dev: `concurrently "${packageManager} run dev:server" "${packageManager} run dev:ui"`,
          "dev:server": "tsx watch server/index.ts",
          "dev:ui": "vite --config ui/vite.config.ts",
          build: `${packageManager} run build:ui && tsc`,
          "build:ui": "vite build --config ui/vite.config.ts",
          start: "node dist/server/index.js",
        },
        dependencies: {
          "@mcp-apps-kit/core": versions.core,
          "@mcp-apps-kit/ui": versions.ui,
          "@mcp-apps-kit/ui-react": versions.uiReact,
          react: "^18.2.0",
          "react-dom": "^18.2.0",
          zod: "^3.22.0",
          ...(vercel ? { express: "^4.21.0" } : {}),
        },
        devDependencies: {
          "@types/react": "^18.2.0",
          "@types/react-dom": "^18.2.0",
          "@vitejs/plugin-react": "^4.2.0",
          concurrently: "^8.2.0",
          tsx: "^4.7.0",
          typescript: "^5.3.0",
          vite: "^5.0.0",
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

import { createApp } from "@mcp-apps-kit/core";
import { z } from "zod";

const app = createApp({
  name: "${name}",
  version: "0.1.0",

  tools: {
    hello: {
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
      ui: "greeting",
    },
  },

  ui: {
    greeting: {
      html: "./${uiOutputDir}/index.html",
      description: "Greeting widget",
      prefersBorder: true,
    },
  },
});

// Only start locally - Vercel uses the exported Express app
if (!process.env.VERCEL) {
  await app.start({ port: 3000 });
  console.log("MCP server running on http://localhost:3000");
}

// Export Express app for Vercel
export default app.expressApp;
`
      : `/**
 * ${name} - MCP Server
 */

import { createApp } from "@mcp-apps-kit/core";
import { z } from "zod";

const app = createApp({
  name: "${name}",
  version: "0.1.0",

  tools: {
    hello: {
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
      ui: "greeting",
    },
  },

  ui: {
    greeting: {
      html: "./ui/dist/index.html",
      description: "Greeting widget",
      prefersBorder: true,
    },
  },
});

// Start server
await app.start({ port: 3000 });
console.log("MCP server running on http://localhost:3000");
`,
    "ui/src/App.tsx": `/**
 * ${name} - UI Component
 */

import {
  useAppsClient,
  useHostContext,
  useDocumentTheme,
  useHostStyleVariables,
} from "@mcp-apps-kit/ui-react";

export function App() {
  const client = useAppsClient();
  const context = useHostContext();

  // Apply theme and host styles
  useDocumentTheme("light", "dark");
  useHostStyleVariables();

  // Get tool output from client
  const output = client.toolOutput as { message?: string; timestamp?: string } | undefined;

  return (
    <div className="container">
      {output?.message ? (
        <div className="greeting">
          <h1>{output.message}</h1>
          <p className="timestamp">Sent at: {output.timestamp}</p>
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
    "ui/src/styles.css": `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 16px;
}

.container {
  max-width: 400px;
  margin: 0 auto;
}

.greeting h1 {
  font-size: 1.5rem;
  margin-bottom: 8px;
}

.timestamp {
  color: #666;
  font-size: 0.875rem;
}

.waiting {
  color: #999;
  font-style: italic;
}

.button {
  margin-top: 16px;
  padding: 8px 16px;
  background: #0066cc;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.button:hover {
  background: #0052a3;
}

.meta {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #eee;
  font-size: 0.75rem;
  color: #999;
}

/* Dark mode support */
.dark body {
  background: #1a1a1a;
  color: #fff;
}

.dark .timestamp {
  color: #aaa;
}

.dark .meta {
  border-color: #333;
  color: #666;
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

## Connecting to Claude Desktop

Add to your Claude Desktop config:

\`\`\`json
{
  "mcpServers": {
    "${name}": {
      "command": "npx",
      "args": ["tsx", "path/to/${name}/server/index.ts"]
    }
  }
}
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

function getVanillaTemplate(name: string, vercel = false): Record<string, string> {
  const uiOutputDir = vercel ? "public" : "dist";
  const packageManager = vercel ? "npm" : "pnpm";
  const versions = getPackageVersions();

  const files: Record<string, string> = {
    "package.json": JSON.stringify(
      {
        name,
        version: "0.1.0",
        type: "module",
        scripts: {
          dev: `concurrently "${packageManager} run dev:server" "${packageManager} run dev:ui"`,
          "dev:server": "tsx watch server/index.ts",
          "dev:ui": "vite --config ui/vite.config.ts",
          build: `${packageManager} run build:ui && tsc`,
          "build:ui": "vite build --config ui/vite.config.ts",
          start: "node dist/server/index.js",
        },
        dependencies: {
          "@mcp-apps-kit/core": versions.core,
          "@mcp-apps-kit/ui": versions.ui,
          zod: "^3.22.0",
          ...(vercel ? { express: "^4.21.0" } : {}),
        },
        devDependencies: {
          concurrently: "^8.2.0",
          tsx: "^4.7.0",
          typescript: "^5.3.0",
          vite: "^5.0.0",
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

import { createApp } from "@mcp-apps-kit/core";
import { z } from "zod";

const app = createApp({
  name: "${name}",
  version: "0.1.0",

  tools: {
    hello: {
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
      ui: "greeting",
    },
  },

  ui: {
    greeting: {
      html: "./${uiOutputDir}/index.html",
      description: "Greeting widget",
      prefersBorder: true,
    },
  },
});

// Only start locally - Vercel uses the exported Express app
if (!process.env.VERCEL) {
  await app.start({ port: 3000 });
  console.log("MCP server running on http://localhost:3000");
}

// Export Express app for Vercel
export default app.expressApp;
`
      : `/**
 * ${name} - MCP Server
 */

import { createApp } from "@mcp-apps-kit/core";
import { z } from "zod";

const app = createApp({
  name: "${name}",
  version: "0.1.0",

  tools: {
    hello: {
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
      ui: "greeting",
    },
  },

  ui: {
    greeting: {
      html: "./ui/dist/index.html",
      description: "Greeting widget",
      prefersBorder: true,
    },
  },
});

// Start server
await app.start({ port: 3000 });
console.log("MCP server running on http://localhost:3000");
`,
    "ui/src/main.ts": `/**
 * ${name} - UI Entry Point
 */

import { createClient } from "@mcp-apps-kit/ui";
import "./styles.css";

async function main() {
  const client = await createClient();

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
}

function render(container: HTMLElement, client: ReturnType<typeof createClient> extends Promise<infer T> ? T : never) {
  const output = client.toolOutput as { message?: string; timestamp?: string } | undefined;
  const context = client.hostContext;

  container.innerHTML = \`
    <div class="container">
      \${output?.message ? \`
        <div class="greeting">
          <h1>\${output.message}</h1>
          <p class="timestamp">Sent at: \${output.timestamp}</p>
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
    "ui/src/styles.css": `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 16px;
}

.container {
  max-width: 400px;
  margin: 0 auto;
}

.greeting h1 {
  font-size: 1.5rem;
  margin-bottom: 8px;
}

.timestamp {
  color: #666;
  font-size: 0.875rem;
}

.waiting {
  color: #999;
  font-style: italic;
}

.button {
  margin-top: 16px;
  padding: 8px 16px;
  background: #0066cc;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.button:hover {
  background: #0052a3;
}

.meta {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #eee;
  font-size: 0.75rem;
  color: #999;
}

/* Dark mode support */
.dark body {
  background: #1a1a1a;
  color: #fff;
}

.dark .timestamp {
  color: #aaa;
}

.dark .meta {
  border-color: #333;
  color: #666;
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

## Connecting to Claude Desktop

Add to your Claude Desktop config:

\`\`\`json
{
  "mcpServers": {
    "${name}": {
      "command": "npx",
      "args": ["tsx", "path/to/${name}/server/index.ts"]
    }
  }
}
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
    template === "react" ? getReactTemplate(name, vercel) : getVanillaTemplate(name, vercel);

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
      if (vercel) {
        // Use npm for Vercel projects (better compatibility)
        execSync("npm install", { cwd: projectDir, stdio: "inherit" });
      } else {
        // Try pnpm first, fall back to npm
        try {
          execSync("pnpm install", { cwd: projectDir, stdio: "inherit" });
        } catch {
          execSync("npm install", { cwd: projectDir, stdio: "inherit" });
        }
      }
    } catch {
      // eslint-disable-next-line no-console
      console.warn("Warning: Could not install dependencies automatically.");
    }
  }
}
