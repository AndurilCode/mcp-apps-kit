# Research: Unified MCP Apps Builder SDK

**Feature Branch**: `001-unified-mcp-sdk`
**Date**: 2025-12-21

## Overview

This document captures research findings and technical decisions for implementing the Unified MCP Apps Builder SDK.

---

## 1. Zod to JSON Schema Conversion

### Decision
Use `zod-to-json-schema` library for converting Zod schemas to JSON Schema format.

### Rationale
- Mature, well-maintained library with 1M+ weekly downloads
- Handles all Zod types including optional, default, describe, and nested objects
- Compatible with JSON Schema draft-07 which MCP SDK expects
- Alternative `zod-to-ts` only generates TypeScript types, not JSON Schema

### Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| `zod-to-json-schema` | Full compatibility, maintained | External dependency |
| Custom implementation | No dependency | High effort, edge cases |
| Zod's built-in `.safeParse()` only | Zero dependency | No JSON Schema output |

### Implementation Notes
```typescript
import { zodToJsonSchema } from "zod-to-json-schema";

const jsonSchema = zodToJsonSchema(zodSchema, {
  $refStrategy: "none", // Inline all references
  name: undefined,      // Don't wrap in definitions
});
```

---

## 2. Protocol Detection Strategy

### Decision
Detect protocol at runtime using environment checks in this order:
1. `window.openai` exists → ChatGPT Apps
2. `window.parent !== window` (iframe) → MCP Apps
3. Neither → Development/Mock mode

### Rationale
- ChatGPT injects `window.openai` global before any user code runs
- MCP Apps always runs in an iframe context
- This ordering prevents false positives (iframes could exist in ChatGPT)

### Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| Runtime detection | Works automatically | Slight startup overhead |
| Build-time flag | Zero runtime cost | Requires separate builds |
| URL parameter | Explicit control | Developer burden |

### Implementation Notes
```typescript
function detectProtocol(): ProtocolAdapter {
  if (typeof window !== "undefined" && window.openai) {
    return new ChatGptAppsAdapter();
  }
  if (typeof window !== "undefined" && window.parent !== window) {
    return new McpAppsAdapter();
  }
  return new MockAdapter();
}
```

---

## 3. Type Inference for Tool Definitions

### Decision
Use TypeScript's `satisfies` operator combined with mapped types to achieve full type inference without explicit annotations.

### Rationale
- `satisfies ToolDefs` validates structure while preserving literal types
- Mapped types (`ToolInputs<T>`, `ToolOutputs<T>`) extract Zod inferred types
- Handler functions receive correctly typed `input` parameter automatically

### Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| `satisfies` + mapped types | Full inference, type-safe | TypeScript 4.9+ required |
| Generic factory function | Works with older TS | More boilerplate |
| Manual type annotations | Explicit | Defeats DX goal |

### Implementation Notes
```typescript
// In user code
const tools = {
  my_tool: {
    input: z.object({ name: z.string() }),
    output: z.object({ result: z.boolean() }),
    handler: async (input) => {
      // `input` is typed as { name: string }
      return { result: true };
    },
  },
} satisfies ToolDefs;

// Type utilities
type ToolInputs<T extends ToolDefs> = {
  [K in keyof T]: z.infer<T[K]["input"]>;
};
```

---

## 4. State Persistence Polyfill for MCP Apps

### Decision
Implement a localStorage-based polyfill for MCP Apps since it lacks native `widgetState`.

### Rationale
- ChatGPT Apps has `window.openai.widgetState` and `setWidgetState()`
- MCP Apps has no equivalent; state must be managed by the framework
- localStorage provides persistence across page reloads

### Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| localStorage polyfill | Simple, persistent | 5MB limit, sync API |
| Tool-based state | Uses MCP tools | Requires server round-trip |
| SessionStorage | Simple | Lost on tab close |
| No polyfill | Minimal code | Feature gap |

### Implementation Notes
```typescript
class McpAppsAdapter {
  private readonly stateKey = `@mcp-apps-kit:state:${appId}`;

  getState<S>(): S | null {
    const stored = localStorage.getItem(this.stateKey);
    return stored ? JSON.parse(stored) : null;
  }

  setState<S>(state: S): void {
    localStorage.setItem(this.stateKey, JSON.stringify(state));
  }
}
```

---

## 5. Visibility Mapping

### Decision
Use a unified `"model" | "app" | "both"` visibility enum that maps to protocol-specific formats.

### Rationale
- MCP Apps uses array format: `["model"]`, `["app"]`, `["model", "app"]`
- ChatGPT uses `visibility: "public" | "private"` + `widgetAccessible: boolean`
- Unified enum is simpler for developers

### Mapping Table
| Unified | MCP Apps | ChatGPT Apps |
|---------|----------|--------------|
| `"model"` | `["model"]` | `visibility: "public", widgetAccessible: false` |
| `"app"` | `["app"]` | `visibility: "private", widgetAccessible: true` |
| `"both"` | `["model", "app"]` | `visibility: "public", widgetAccessible: true` |

### Implementation Notes
```typescript
function toMcpVisibility(v: Visibility): string[] {
  return v === "both" ? ["model", "app"] : [v];
}

function toOpenAIVisibility(v: Visibility): { visibility: string; widgetAccessible: boolean } {
  return {
    visibility: v === "app" ? "private" : "public",
    widgetAccessible: v !== "model",
  };
}
```

---

## 6. CSP Configuration Strategy

### Decision
Use a unified CSP interface with common fields, and allow ChatGPT-specific fields as optional.

### Rationale
- Both protocols share `connectDomains` and `resourceDomains`
- ChatGPT adds `redirectDomains` and `frameDomains`
- MCP Apps ignores unsupported fields gracefully

### Implementation Notes
```typescript
interface UnifiedCSP {
  connectDomains?: string[];    // Both protocols
  resourceDomains?: string[];   // Both protocols
  redirectDomains?: string[];   // ChatGPT only
  frameDomains?: string[];      // ChatGPT only
}
```

---

## 7. Build System: NX vs Turborepo

### Decision
Use NX as specified in the Constitution.

### Rationale
- Constitution explicitly mandates NX
- NX provides integrated task caching, dependency graph, and package publishing
- First-party TypeScript support with `@nx/js` plugin

### Configuration Notes
```json
// nx.json
{
  "targetDefaults": {
    "build": { "cache": true, "dependsOn": ["^build"] },
    "test": { "cache": true },
    "lint": { "cache": true }
  }
}
```

---

## 8. Express vs Fastify for HTTP Server

### Decision
Use Express as the default HTTP server.

### Rationale
- Express is the most widely adopted Node.js framework
- Lower barrier to entry for developers integrating with existing apps
- `app.handler()` returns standard Express middleware
- Fastify could be supported via custom `app.getServer()` usage

### Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| Express | Universal, familiar | Slightly slower |
| Fastify | Faster, modern | Less familiar |
| No bundled server | Minimal | Poor DX |

---

## 9. React Bindings Architecture

### Decision
Implement React bindings as a separate package with React as a peer dependency.

### Rationale
- Follows Constitution's package independence principle
- Allows non-React users to use `@mcp-apps-kit/ui` without React overhead
- React 18+ Suspense support for async operations

### Hook Design
| Hook | Purpose |
|------|---------|
| `useAppsClient<T>()` | Access typed client instance |
| `useToolResult<T>()` | Subscribe to tool results |
| `useToolInput()` | Access current tool input |
| `useHostContext()` | Subscribe to host context |
| `useWidgetState<S>()` | Persisted state with sync |
| `useHostStyleVariables()` | Apply CSS variables |
| `useDocumentTheme()` | Apply theme class |

---

## 10. Error Handling Strategy

### Decision
Wrap errors in a custom `AppError` class that generates protocol-appropriate responses.

### Rationale
- Both protocols expect specific error formats
- User-friendly messages prevent exposing internals
- Zod validation errors are reformatted for clarity

### Implementation Notes
```typescript
class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
  }

  toMcpResponse() {
    return { content: [{ type: "text", text: this.message }], isError: true };
  }

  toOpenAIResponse() {
    return { content: [{ type: "text", text: this.message }], isError: true };
  }
}
```

---

## 11. Bundle Size Optimization

### Decision
Use tsup for library bundling with tree-shaking enabled.

### Rationale
- tsup wraps esbuild for fast builds
- Tree-shaking eliminates unused code
- Separate ESM and CJS outputs for maximum compatibility
- Target: < 50KB gzipped for `@mcp-apps-kit/ui`

### Configuration Notes
```typescript
// tsup.config.ts
export default {
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  treeshake: true,
  minify: true,
};
```

---

## 12. Testing Strategy

### Decision
Use Vitest with the following test categories:
1. **Unit tests**: Per-module, mocked dependencies
2. **Contract tests**: Public API surface verification
3. **Integration tests**: Cross-platform behavior simulation

### Rationale
- Constitution requires 80% coverage and TDD
- Vitest is faster than Jest, ESM-native
- Integration tests simulate both protocol environments

### Test Structure
```
packages/*/tests/
├── unit/           # Per-module tests
├── contract/       # Public API tests
└── integration/    # Cross-platform tests
```

---

## Summary of Key Technical Decisions

| Topic | Decision |
|-------|----------|
| Schema conversion | `zod-to-json-schema` library |
| Protocol detection | Runtime check: `window.openai` → ChatGPT, iframe → MCP |
| Type inference | `satisfies` + mapped types |
| State polyfill | localStorage for MCP Apps |
| Visibility | Unified enum → protocol-specific mapping |
| CSP | Unified interface, ChatGPT extras optional |
| Build system | NX (per Constitution) |
| HTTP server | Express (default) |
| React bindings | Separate package, peer dependency |
| Error handling | Custom `AppError` class |
| Bundling | tsup with tree-shaking |
| Testing | Vitest, 80% coverage |
