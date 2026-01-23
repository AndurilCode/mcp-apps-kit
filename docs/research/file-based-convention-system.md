# Research: File-Based Convention System for MCP Apps Kit

> **Status**: Research Complete  
> **Date**: 2026-01-23  
> **Author**: AI Research Assistant

---

## 1. Summary

This research recommends a **hybrid build-time codegen approach** for file-based tool/workflow/UI discovery in `@mcp-apps-kit`. The design draws heavily from Nuxt 3's auto-import patterns and Next.js App Router conventions while preserving full TypeScript type inference through a generated manifest file. The approach introduces a new `createFileBasedApp()` entry point that coexists with the existing `createApp()` API, enabling gradual adoption without breaking changes. A Vite plugin handles build-time discovery, manifest generation, and HMR during development.

**Key findings**:
1. **Build-time codegen** is preferred over runtime glob scanning for type safety, bundle optimization, and cold start performance
2. **Nuxt 3's naming convention** (path-based naming with camelCase normalization) translates well to tool/workflow registration
3. **TypeScript type inference** can be preserved via a generated `app.d.ts` manifest that re-exports tool types
4. **Versioning** maps naturally to `versions/v1/tools/`, `versions/v2/tools/` folder hierarchy
5. **Existing `createApp()` API** remains untouched; file-based discovery is opt-in via the new API

---

## 2. Options Matrix

| Approach | Build Time | Runtime Perf | Type Safety | HMR | Complexity | Bundling |
|----------|------------|--------------|-------------|-----|------------|----------|
| **A: Build-time Codegen (Vite Plugin)** | Moderate | Excellent | Full | Yes | Medium | Optimal |
| **B: Runtime Glob Scanning** | Fast | Poor cold start | None* | Yes | Low | Suboptimal |
| **C: Hybrid (Codegen + Runtime Fallback)** | Moderate | Good | Full in prod | Yes | High | Optimal |
| **D: TypeScript Project References** | Slow | Excellent | Full | Limited | Very High | Optimal |

\* Runtime scanning loses type inference because dynamic imports return `unknown`.

### Option A: Build-time Codegen via Vite Plugin (Recommended)

**How it works**:
1. A Vite plugin scans `tools/`, `workflows/`, `ui/` directories at build time
2. Generates a manifest (`__generated__/app-manifest.ts`) with typed imports
3. `createFileBasedApp()` imports the manifest and registers all definitions
4. HMR watches file additions/removals and regenerates manifest

**Pros**:
- Full TypeScript type inference preserved via generated types
- Optimal bundle size (tree-shaking works on static imports)
- Fast cold starts (no filesystem scanning at runtime)
- Consistent with Vite/Nuxt ecosystem patterns

**Cons**:
- Requires build step even in development (Vite handles this transparently)
- Plugin complexity for edge cases (aliased paths, monorepo setups)

**Sources**: [Vite import.meta.glob](https://vitejs.dev/guide/features.html#glob-import), [vite-plugin-codegen](https://www.npmjs.com/package/vite-plugin-codegen)

---

### Option B: Runtime Glob Scanning

**How it works**:
1. `createFileBasedApp()` uses `fast-glob` to scan directories at startup
2. Dynamically imports discovered files with `import()`
3. Registers tools/workflows based on file exports

**Pros**:
- No build step required
- Simple implementation
- Works with any bundler or no bundler

**Cons**:
- **No TypeScript type inference** (dynamic imports return `unknown`)
- Slow cold starts (filesystem scanning + dynamic imports)
- Cannot tree-shake unused tools
- Breaks `ClientToolsFromCore<T>` type inference pattern

**Why rejected**: Type safety is a core value of this project. Losing `ClientToolsFromCore` inference defeats the purpose.

---

### Option C: Hybrid (Codegen + Runtime Fallback)

**How it works**:
1. Build-time codegen generates manifest for production
2. Runtime fallback scans filesystem when manifest is missing (dev without build)
3. Types are generated at build time; dev mode uses `any` types

**Pros**:
- Works without build step in dev (at cost of types)
- Production benefits from codegen

**Cons**:
- Inconsistent behavior between dev and prod
- "Works in dev, breaks in prod" type errors possible
- Higher maintenance burden

**Why not recommended**: The inconsistency creates footguns. Vite's dev server already runs the plugin, so the "no build step" benefit is illusory.

---

### Option D: TypeScript Project References

**How it works**:
1. Each `tools/`, `workflows/` directory is a separate TypeScript project
2. Main project references them via `tsconfig.json` project references
3. TypeScript infers types across project boundaries

**Pros**:
- Native TypeScript solution
- IDE support is excellent

**Cons**:
- Requires complex `tsconfig.json` setup per project
- Build times scale poorly with many references
- HMR is limited (project references need manual rebuild)
- Overkill for this use case

**Why not recommended**: Too complex for the problem being solved.

---

## 3. Recommended Approach

**Option A: Build-time Codegen via Vite Plugin** is recommended for the following reasons:

1. **Type Safety**: Generated manifest preserves full TypeScript inference, maintaining the `ClientToolsFromCore<T>` pattern
2. **Performance**: Static imports enable tree-shaking and instant cold starts
3. **Ecosystem Alignment**: Matches Vite/Nuxt patterns that users already understand
4. **DX Parity**: Vite's dev server runs the plugin automatically, so HMR works seamlessly
5. **Incremental Adoption**: New `createFileBasedApp()` doesn't affect existing `createApp()` users

---

## 4. Proposed File Structure

### Standard Project Layout

```
my-mcp-app/
├── mcp.config.ts              # App configuration (name, version, protocol, etc.)
├── tools/
│   ├── greet.ts               # → Registers as "greet" tool
│   ├── search.ts              # → Registers as "search" tool
│   └── admin/
│       └── delete-user.ts     # → Registers as "admin_delete_user" (path-based name)
├── workflows/
│   ├── onboard-user.ts        # → Registers as "onboard_user" workflow
│   └── process-order.ts       # → Registers as "process_order" workflow
├── ui/
│   ├── greeting-widget.tsx    # → Registers as "greeting_widget" UI
│   └── search-results.tsx     # → Registers as "search_results" UI
├── __generated__/             # Auto-generated (gitignored)
│   ├── app-manifest.ts        # Typed imports for all tools/workflows/UIs
│   └── app.d.ts               # Type declarations for client inference
├── server/
│   └── index.ts               # Entry point: imports from __generated__
└── package.json
```

### Versioned Project Layout

```
my-mcp-app/
├── mcp.config.ts
├── versions/
│   ├── v1/
│   │   ├── tools/
│   │   │   └── greet.ts       # → v1: "greet" tool
│   │   └── ui/
│   │       └── greeting.tsx
│   └── v2/
│       ├── tools/
│       │   └── greet.ts       # → v2: "greet" tool (enhanced)
│       ├── workflows/
│       │   └── onboard.ts
│       └── ui/
│           └── greeting.tsx
├── shared/
│   └── utils.ts               # Shared code across versions
├── __generated__/
│   ├── v1-manifest.ts
│   ├── v2-manifest.ts
│   └── app.d.ts
└── server/
    └── index.ts
```

### Naming Convention Rules

| File Path | Registered Name | Rationale |
|-----------|-----------------|-----------|
| `tools/greet.ts` | `greet` | Filename becomes tool name |
| `tools/search-restaurants.ts` | `search_restaurants` | Kebab-case → snake_case |
| `tools/admin/delete-user.ts` | `admin_delete_user` | Path segments joined with `_` |
| `tools/v1.greet.ts` | (Invalid) | Use `versions/v1/tools/` instead |
| `workflows/process-order.ts` | `process_order` | Same rules as tools |
| `ui/SearchResults.tsx` | `search_results` | PascalCase → snake_case |

---

## 5. API Design Sketch

### mcp.config.ts (Configuration File)

```typescript
// mcp.config.ts
import { defineConfig } from "@mcp-apps-kit/core";

export default defineConfig({
  name: "my-app",
  version: "1.0.0",
  
  // Optional: override default directories
  directories: {
    tools: "tools",        // default
    workflows: "workflows", // default
    ui: "ui",              // default
  },
  
  // Global config (same as current createApp)
  config: {
    protocol: "mcp",
    cors: { origin: true },
    debug: { logTool: true, level: "debug" },
  },
  
  // Plugins and middleware
  plugins: [loggingPlugin],
  middleware: [authMiddleware],
});
```

### Tool File Convention

```typescript
// tools/greet.ts
import { defineTool } from "@mcp-apps-kit/core";
import { z } from "zod";

// Default export is the tool definition
export default defineTool({
  title: "Greet",
  description: "Greet a user by name",
  input: z.object({
    name: z.string().describe("Name to greet"),
  }),
  output: z.object({
    message: z.string(),
    timestamp: z.string(),
  }),
  handler: async ({ name }) => ({
    message: `Hello, ${name}!`,
    timestamp: new Date().toISOString(),
  }),
});

// Optional: colocate UI with tool
export const ui = defineReactUI({
  component: GreetingWidget,
  name: "Greeting Widget",
});
```

### Workflow File Convention

```typescript
// workflows/onboard-user.ts
import { workflow, toolStep, customStep } from "@mcp-apps-kit/core";
import { z } from "zod";

export default workflow("onboard_user")
  .describe("Onboard a new user end-to-end")
  .input({
    email: z.string().email(),
    name: z.string(),
  })
  .output({
    success: z.boolean(),
    userId: z.string(),
  })
  .step("create_account", toolStep("create_user"))
  .step("send_welcome", toolStep("send_email"))
  .step("log_event", customStep(async (ctx) => {
    console.log("User onboarded:", ctx.outputs.create_account);
    return { success: true, userId: ctx.outputs.create_account.id };
  }))
  .build();
```

### UI File Convention

```typescript
// ui/greeting-widget.tsx
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { GreetingWidget } from "./components/GreetingWidget";

export default defineReactUI({
  component: GreetingWidget,
  name: "Greeting Widget",
  description: "Displays greeting messages",
  prefersBorder: true,
});
```

### Generated Manifest

```typescript
// __generated__/app-manifest.ts (AUTO-GENERATED - DO NOT EDIT)

import greet from "../tools/greet";
import search from "../tools/search";
import admin_delete_user from "../tools/admin/delete-user";
import onboard_user from "../workflows/onboard-user";
import greeting_widget from "../ui/greeting-widget";

export const tools = {
  greet,
  search,
  admin_delete_user,
} as const;

export const workflows = {
  onboard_user,
} as const;

export const ui = {
  greeting_widget,
} as const;

// Type exports for client-side inference
export type AppTools = typeof tools;
export type AppWorkflows = typeof workflows;
```

### Server Entry Point

```typescript
// server/index.ts
import { createFileBasedApp } from "@mcp-apps-kit/core";
import config from "../mcp.config";
import { tools, workflows, ui } from "../__generated__/app-manifest";

const app = createFileBasedApp({
  ...config,
  tools,
  workflows,
  ui,
});

await app.start({ port: 3000 });

// Export for client type inference
export type { AppTools, AppWorkflows } from "../__generated__/app-manifest";
export type AppClientTools = ClientToolsFromCore<AppTools>;
```

### createFileBasedApp Implementation

```typescript
// packages/core/src/createFileBasedApp.ts

import { createApp, type AppConfig, type ToolDefs } from "./createApp";
import type { FileBasedConfig } from "./types/file-based";

/**
 * Create an MCP app from file-based tool/workflow/UI definitions.
 * 
 * This is a convenience wrapper around createApp() that accepts
 * the generated manifest from the Vite plugin.
 * 
 * @example
 * ```typescript
 * import { createFileBasedApp } from "@mcp-apps-kit/core";
 * import config from "../mcp.config";
 * import { tools, workflows, ui } from "../__generated__/app-manifest";
 * 
 * const app = createFileBasedApp({ ...config, tools, workflows, ui });
 * ```
 */
export function createFileBasedApp<T extends ToolDefs>(
  config: FileBasedConfig<T>
): App<T> {
  // Merge workflow tools into tools object
  const allTools: ToolDefs = { ...config.tools };
  
  for (const [name, workflowDef] of Object.entries(config.workflows ?? {})) {
    allTools[name] = workflowDef;
  }
  
  // Build AppConfig
  const appConfig: AppConfig<ToolDefs> = {
    name: config.name,
    version: config.version,
    tools: allTools,
    ui: config.ui,
    config: config.config,
    plugins: config.plugins,
    icon: config.icon,
    icons: config.icons,
  };
  
  return createApp(appConfig) as App<T>;
}
```

---

## 6. Type Safety Strategy

### Challenge

When tools are scattered across files, TypeScript cannot automatically infer the union type needed for `ClientToolsFromCore<T>`. The current pattern requires all tools to be defined inline:

```typescript
// Current: inline definition preserves types
const app = createApp({
  tools: {
    greet: defineTool({ ... }),  // TypeScript sees the full type
    search: defineTool({ ... }), // TypeScript sees the full type
  }
});

export type AppClientTools = ClientToolsFromCore<typeof app.tools>;
```

### Solution: Generated Type Manifest

The Vite plugin generates a manifest that re-exports tools with preserved types:

```typescript
// __generated__/app-manifest.ts

// Static imports preserve full TypeScript inference
import greet from "../tools/greet";
import search from "../tools/search";

// `as const` assertion preserves literal types
export const tools = {
  greet,
  search,
} as const;

// Type alias for client inference
export type AppTools = typeof tools;
```

### Verification

The generated types work with the existing `ClientToolsFromCore` utility:

```typescript
// ui/Widget.tsx
import { useToolResult } from "@mcp-apps-kit/ui-react";
import type { AppTools } from "../__generated__/app-manifest";
import type { ClientToolsFromCore } from "@mcp-apps-kit/core";

type ClientTools = ClientToolsFromCore<AppTools>;

function Widget() {
  const result = useToolResult<ClientTools>();
  
  // ✅ TypeScript knows result?.greet?.message is string | undefined
  // ✅ TypeScript knows result?.search?.results is SearchResult[] | undefined
  if (result?.greet) {
    return <p>{result.greet.message}</p>;
  }
}
```

### Edge Cases

1. **Circular dependencies**: If a tool imports from another tool file, the manifest generator must topologically sort imports
2. **Re-exports**: If `tools/index.ts` re-exports tools, the generator should skip it (only scan `*.ts` files that default-export `defineTool`)
3. **Type-only imports**: The manifest should include `import type` for interfaces to avoid bundling issues

---

## 7. CLI/Scaffolding Changes

### Updated create-app Templates

The `@mcp-apps-kit/create-app` CLI will offer two modes:

```bash
# Explicit mode (current behavior)
npx @mcp-apps-kit/create-app my-app --mode explicit

# File-based mode (new default)
npx @mcp-apps-kit/create-app my-app --mode file-based
npx @mcp-apps-kit/create-app my-app  # defaults to file-based
```

### File-Based Template Structure

```
my-app/
├── mcp.config.ts
├── tools/
│   └── hello.ts               # Default "hello" tool
├── ui/
│   └── greeting-widget.tsx    # Default greeting UI
├── __generated__/             # .gitignored
├── server/
│   └── index.ts
├── tests/
│   └── integration/
│       └── server.test.ts
├── package.json               # Includes vite-plugin-mcp-apps
├── vite.config.ts             # Configures the discovery plugin
└── tsconfig.json
```

### vite.config.ts Template

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mcpAppsPlugin } from "@mcp-apps-kit/codegen";

export default defineConfig({
  plugins: [
    react(),
    mcpAppsPlugin({
      configPath: "./mcp.config.ts",
      watch: true,  // Enable HMR in dev
    }),
  ],
});
```

### New Package: @mcp-apps-kit/codegen

A new package in `packages/vite-plugin/` will contain the discovery and codegen logic:

```typescript
// packages/vite-plugin/src/index.ts

import { Plugin } from "vite";
import { generateManifest } from "./generator";
import { watchDirectories } from "./watcher";

export interface McpAppsPluginOptions {
  configPath?: string;
  outDir?: string;
  watch?: boolean;
}

export function mcpAppsPlugin(options: McpAppsPluginOptions = {}): Plugin {
  const {
    configPath = "./mcp.config.ts",
    outDir = "__generated__",
    watch = true,
  } = options;

  return {
    name: "mcp-apps-kit",
    
    async buildStart() {
      await generateManifest({ configPath, outDir });
    },
    
    configureServer(server) {
      if (watch) {
        watchDirectories({
          directories: ["tools", "workflows", "ui"],
          onFileChange: async () => {
            await generateManifest({ configPath, outDir });
            // Trigger Vite HMR
            server.ws.send({ type: "full-reload" });
          },
        });
      }
    },
  };
}
```

---

## 8. Risks & Open Questions

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Circular dependencies** in tool files | Medium | Manifest generator detects cycles and errors early |
| **Large projects** slow manifest generation | Low | Incremental generation; cache unchanged files |
| **Monorepo path aliasing** breaks imports | Medium | Support `tsconfig.json` path aliases in generator |
| **Users forget to run build** | Low | Dev server runs plugin automatically; CLI validates |
| **Type drift** between manifest and files | Medium | Manifest regenerates on every file change |

### Open Questions

1. **Should workflows auto-register internal tools?**
   - Current design: Workflows call `toolStep("tool_name")` expecting the tool to exist
   - Question: Should `workflows/onboard.ts` auto-import `tools/create-user.ts` if it uses `toolStep("create_user")`?
   - Recommendation: No auto-import; explicit dependency management is clearer

2. **How to handle tool name collisions across versions?**
   - Current design: `versions/v1/tools/greet.ts` and `versions/v2/tools/greet.ts` both register as "greet"
   - This is correct (each version has its own tool namespace)
   - Collision only matters within a version; generator should error on `tools/greet.ts` + `tools/admin/greet.ts`

3. **Should UI files support JSX without explicit `.tsx` extension?**
   - Recommendation: Require `.tsx` for React UIs, `.ts` for vanilla
   - Matches standard TypeScript conventions

4. **Where should shared utilities live?**
   - Recommendation: `shared/` directory is not auto-scanned
   - Only `tools/`, `workflows/`, `ui/` trigger registration

5. **Should the plugin support non-Vite bundlers (esbuild, Rollup)?**
   - Initial scope: Vite only (covers dev server + production builds)
   - Future: Consider esbuild plugin for serverless environments

---

## 9. Next Steps

### Phase 1: Foundation (Week 1-2)

- [ ] Create `packages/vite-plugin/` package skeleton
- [ ] Implement manifest generator for `tools/` directory
- [ ] Add file watcher with debounced regeneration
- [ ] Write unit tests for naming convention normalization

### Phase 2: Core Integration (Week 2-3)

- [ ] Add `createFileBasedApp()` to `@mcp-apps-kit/core`
- [ ] Extend generator to support `workflows/` and `ui/` directories
- [ ] Generate `app.d.ts` type declarations
- [ ] Validate type inference with `ClientToolsFromCore`

### Phase 3: Versioning (Week 3-4)

- [ ] Support `versions/v1/`, `versions/v2/` directory structure
- [ ] Generate per-version manifests
- [ ] Update `createFileBasedApp()` to accept version config

### Phase 4: CLI & Templates (Week 4-5)

- [ ] Update `@mcp-apps-kit/create-app` with `--mode file-based`
- [ ] Create new file-based templates (React + Vanilla)
- [ ] Add `vite.config.ts` with plugin pre-configured
- [ ] Write integration tests for scaffolded projects

### Phase 5: Documentation & Polish (Week 5-6)

- [ ] Update `docs/quickstart.md` with file-based patterns
- [ ] Add migration guide for existing projects
- [ ] Error messages with actionable suggestions
- [ ] Performance benchmarks (manifest generation time)

---

## 10. References

### Internal Sources
- `packages/core/src/createApp.ts` — Current app creation and tool registration
- `packages/core/src/index.ts` — Public API exports including `ClientToolsFromCore`
- `packages/core/src/workflow/` — Workflow builder implementation
- `packages/create-app/src/` — CLI scaffolding templates
- `packages/ui-react-builder/src/` — UI bundling with Vite plugin patterns
- `examples/minimal/src/index.ts` — Current explicit wiring pattern

### External Sources
- [Next.js 14 App Router File Conventions](https://nextjs.org/docs/14/app/building-your-application/routing/defining-routes)
- [SvelteKit Routing Conventions](https://kit.svelte.dev/docs/routing)
- [Nuxt 3 Auto-imports](https://nuxt.com/docs/3.x/guide/concepts/auto-imports)
- [Vite Glob Import](https://vitejs.dev/guide/features.html#glob-import)
- [vite-plugin-codegen](https://www.npmjs.com/package/vite-plugin-codegen)
