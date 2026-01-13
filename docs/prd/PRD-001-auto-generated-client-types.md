# PRD-001: Auto-Generated Client Type Export

## Document Info

| Field | Value |
|-------|-------|
| **PRD ID** | PRD-001 |
| **Title** | Auto-Generated Client Type Export |
| **Priority** | High |
| **Usefulness Score** | 9/10 |
| **Complexity** | Medium |
| **Status** | Draft |
| **Author** | MCP AppsKit Team |
| **Created** | 2026-01-13 |
| **Last Updated** | 2026-01-13 |

---

## 1. Problem Statement

### Current Pain Points

Developers must manually create and export type aliases for client-side type safety:

```typescript
// Server-side (index.ts) - 8+ lines of boilerplate per version
export type AppToolsV1 = { greet: typeof greetToolV1 };
export type AppClientToolsV1 = ClientToolsFromCore<AppToolsV1>;
export type GreetInputV1 = z.infer<typeof greetInputV1>;
export type GreetOutputV1 = z.infer<typeof greetOutputV1>;

// Client-side - must import and use explicitly
import type { AppClientToolsV1 } from "../server";
const client = await createClient<AppClientToolsV1>();
```

### Impact of Current State

- **~8 lines of boilerplate per version** - grows with each tool version
- **Error-prone** - easy to forget updating type exports when tools change
- **Breaking changes** - types and tools can get out of sync
- **Cognitive overhead** - developers must understand `ClientToolsFromCore<T>` pattern
- **AI agent unfriendly** - complex pattern requires additional context in prompts

---

## 2. Goals & Success Metrics

### Goals

1. **Eliminate manual type exports** - Server app instance should expose client types automatically
2. **Zero-boilerplate client setup** - One-liner to create a typed client
3. **Type-safe by default** - No `unknown` types unless explicitly intended
4. **Backward compatible** - Existing code continues to work

### Success Metrics

| Metric | Target |
|--------|--------|
| Lines of type boilerplate per tool version | 0 (down from ~8) |
| Developer satisfaction (survey) | >80% prefer new API |
| AI agent code generation accuracy | Measurable improvement in test suite |
| Adoption rate (new projects) | >90% within 3 months |

---

## 3. Proposed Solution

### 3.1 Core API Changes

#### Option A: `clientTypes` Property on App Instance

```typescript
// Server exports the app
export { app };

// Client-side - simple and type-safe
import { app } from "../server";
const client = await createClient<typeof app.clientTypes>();
```

#### Option B: Factory Helper Method (Recommended)

```typescript
// Server exports the app
export { app };

// Client-side - even simpler
import { app } from "../server";
const client = app.createTypedClient();
// Returns: AppsClient<ClientToolsFromCore<RegisteredTools>>
```

#### Option C: Separate Type Export (Hybrid)

```typescript
// Server-side - auto-generated type is available
import { createApp, getClientTypes } from "@mcp-apps-kit/core";

const app = createApp();
app.tool("greet", greetTool);

export type AppClient = typeof app.clientTypes;
// or
export type AppClient = ReturnType<typeof getClientTypes<typeof app>>;
```

### 3.2 Implementation Details

#### Internal Type Computation

```typescript
// In @mcp-apps-kit/core

interface App<TTools extends Record<string, ToolDef>> {
  // Existing API
  tool<N extends string, T extends ToolDef>(name: N, tool: T): App<TTools & Record<N, T>>;
  
  // New: Pre-computed client types
  readonly clientTypes: ClientToolsFromCore<TTools>;
  
  // New: Factory for typed client
  createTypedClient(options?: ClientOptions): AppsClient<ClientToolsFromCore<TTools>>;
}
```

#### Build-Time vs Runtime

- `clientTypes` is a **type-only** property (phantom type) - no runtime overhead
- `createTypedClient()` is a **runtime** method that returns a properly typed client
- Both approaches work - developers can choose based on their setup

### 3.3 Usage Examples

#### Before (Current)

```typescript
// server.ts
import { createApp, defineTool, ClientToolsFromCore } from "@mcp-apps-kit/core";

const greetTool = defineTool({ /* ... */ });
const app = createApp();
app.tool("greet", greetTool);

// Manual type exports - error-prone!
export type AppTools = { greet: typeof greetTool };
export type AppClientTools = ClientToolsFromCore<AppTools>;

// ui/main.tsx
import type { AppClientTools } from "../server";
import { createClient } from "@mcp-apps-kit/ui";

const client = await createClient<AppClientTools>();
```

#### After (Proposed)

```typescript
// server.ts
import { createApp, defineTool } from "@mcp-apps-kit/core";

const greetTool = defineTool({ /* ... */ });
const app = createApp();
app.tool("greet", greetTool);

export { app };

// ui/main.tsx
import { app } from "../server";

const client = app.createTypedClient();
// or: const client = await createClient<typeof app.clientTypes>();
```

---

## 4. Technical Design

### 4.1 Type System Changes

```typescript
// core/src/types.ts

/**
 * Extracts client-callable tool types from an App instance
 */
export type ClientTypesOf<TApp extends App<any>> = 
  TApp extends App<infer TTools> 
    ? ClientToolsFromCore<TTools> 
    : never;

/**
 * Enhanced App type with client type exposure
 */
export interface App<TTools extends Record<string, ToolDef> = {}> {
  // ... existing methods ...
  
  /**
   * Phantom type for client-side type inference
   * @example const client = await createClient<typeof app.clientTypes>();
   */
  readonly clientTypes: ClientToolsFromCore<TTools>;
}
```

### 4.2 Runtime Implementation

```typescript
// core/src/app.ts

class AppImpl<TTools extends Record<string, ToolDef>> implements App<TTools> {
  // clientTypes is type-only, no runtime value needed
  // TypeScript phantom type pattern
  declare readonly clientTypes: ClientToolsFromCore<TTools>;
  
  createTypedClient(options?: ClientOptions): AppsClient<ClientToolsFromCore<TTools>> {
    // Delegate to existing createClient with proper typing
    return createClient<ClientToolsFromCore<TTools>>(options);
  }
}
```

### 4.3 Package Dependencies

```
@mcp-apps-kit/core
├── Adds: clientTypes type property
├── Adds: createTypedClient() method
└── No new dependencies

@mcp-apps-kit/ui
└── No changes required (works with existing createClient)
```

---

## 5. User Stories

### US-1: New Developer Onboarding

> As a new developer, I want to set up a typed client without learning internal type utilities, so I can be productive immediately.

**Acceptance Criteria:**
- [ ] `app.createTypedClient()` returns fully typed client
- [ ] No import of `ClientToolsFromCore` required
- [ ] IDE autocomplete works for tool names and parameters

### US-2: AI Agent Code Generation

> As an AI agent generating code, I want a simple pattern for typed clients, so I can generate correct code without complex type gymnastics.

**Acceptance Criteria:**
- [ ] Pattern is learnable from 2-3 lines of example
- [ ] No conditional type understanding required
- [ ] Works with standard imports

### US-3: Existing Project Migration

> As a developer with an existing project, I want to adopt the new API incrementally, so I don't have to rewrite everything.

**Acceptance Criteria:**
- [ ] Existing `ClientToolsFromCore` pattern still works
- [ ] Can mix old and new patterns during migration
- [ ] No breaking changes

---

## 6. Edge Cases & Considerations

### 6.1 Versioned Apps

```typescript
// Multiple versions on same server
const app = createApp();
app.tool("greet", greetToolV1);
app.tool("greet_v2", greetToolV2);

// Client gets all tools
const client = app.createTypedClient();
client.callTool("greet", { /* v1 params */ });
client.callTool("greet_v2", { /* v2 params */ });
```

### 6.2 Dynamic Tool Registration

If tools are registered conditionally:

```typescript
const app = createApp();
app.tool("greet", greetTool);

if (config.enableAdvanced) {
  app.tool("search", searchTool);
}

// Type reflects base tools only (greet)
// Dynamic tools need explicit type assertion
```

**Recommendation:** Document that `clientTypes` reflects compile-time tools only.

### 6.3 Monorepo / Package Boundaries

```typescript
// packages/server/index.ts
export { app };

// packages/ui/main.tsx
import { app } from "@myorg/server";
const client = app.createTypedClient(); // Works across packages
```

---

## 7. Migration Guide

### Step 1: Upgrade to New Version

```bash
pnpm update @mcp-apps-kit/core @mcp-apps-kit/ui
```

### Step 2: Replace Type Exports (Optional)

```diff
// server.ts
- export type AppTools = { greet: typeof greetTool };
- export type AppClientTools = ClientToolsFromCore<AppTools>;
+ export { app };
```

### Step 3: Update Client Code

```diff
// ui/main.tsx
- import type { AppClientTools } from "../server";
+ import { app } from "../server";
- const client = await createClient<AppClientTools>();
+ const client = app.createTypedClient();
```

---

## 8. Testing Strategy

### Unit Tests

- [ ] `app.clientTypes` type is correctly inferred from registered tools
- [ ] `createTypedClient()` returns properly typed `AppsClient`
- [ ] Tool name autocomplete works in IDE (type tests)

### Integration Tests

- [ ] Client created with `createTypedClient()` can call all registered tools
- [ ] Type errors are caught at compile time for wrong parameters
- [ ] Works in monorepo setups

### Migration Tests

- [ ] Existing code using `ClientToolsFromCore` still compiles
- [ ] Mixed usage (old + new API) works correctly

---

## 9. Rollout Plan

| Phase | Duration | Activities |
|-------|----------|------------|
| Alpha | 1 week | Internal testing, API refinement |
| Beta | 2 weeks | Community feedback, documentation |
| GA | - | Full release, deprecation notice for old pattern |

### Deprecation Strategy

1. **v1.x**: Both APIs available, new API recommended in docs
2. **v2.x**: Old pattern marked `@deprecated` with migration hint
3. **v3.x**: Consider removing (based on adoption metrics)

---

## 10. Open Questions

1. **Naming**: `clientTypes` vs `types` vs `$types` - what's most intuitive?
2. **Factory location**: Should `createTypedClient()` be on App, or a standalone function?
3. **SSR considerations**: Any special handling needed for server-side rendering?

---

## 11. References

- [API Ergonomics Analysis](/docs/API_ERGONOMICS_ANALYSIS.md)
- [TypeScript Phantom Types](https://dev.to/busypeoples/phantom-types-in-typescript-1mnn)
- [MCP Protocol Specification](https://modelcontextprotocol.io/specification/2025-11-25)
