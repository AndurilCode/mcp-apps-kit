# API Ergonomics Analysis

## Overview

This document analyzes the developer-facing API of MCP AppsKit and proposes 5 improvements to enhance ergonomics for both human developers and AI agents.

**Scoring Criteria:**
- **Usefulness**: 1-10 (10 = extremely valuable for daily use)
- **Complexity**: S/M/L/XL (effort to implement)

---

## 1. Auto-Generated Client Type Export

### Current Problem

Developers must manually create and export type aliases for client-side type safety:

```typescript
// Server-side (index.ts) - Lines 196-206 in minimal example
export type AppToolsV1 = { greet: typeof greetToolV1 };
export type AppClientToolsV1 = ClientToolsFromCore<AppToolsV1>;
export type GreetInputV1 = z.infer<typeof greetInputV1>;
export type GreetOutputV1 = z.infer<typeof greetOutputV1>;

// Client-side - must import and use explicitly
import type { AppClientToolsV1 } from "../server";
const client = await createClient<AppClientToolsV1>();
```

This is ~8 lines of boilerplate per version, error-prone, and breaks when tools change.

### Proposed Solution

Add a `clientTypes` property to the `App` instance that exposes pre-computed client types:

```typescript
// Server exports the app
export { app };

// Client-side - simple and type-safe
import { app } from "../server";
const client = await createClient<typeof app.clientTypes>();

// Or add a factory helper
const client = app.createTypedClient(); // Returns AppsClient<ClientToolsFromCore<T>>
```

### Impact

| Metric | Score |
|--------|-------|
| **Usefulness** | 9/10 |
| **Complexity** | M |

**Rationale**: Every project needs this. Eliminates ~50% of type-related boilerplate. AI agents especially benefit since they don't need to understand the `ClientToolsFromCore` pattern.

---

## 2. Inline Schema Syntax for Simple Tools

### Current Problem

Even simple tools require 3 separate declarations:

```typescript
// 8 lines just to define schemas for a simple tool
const greetInput = z.object({
  name: z.string().describe("Name to greet"),
});

const greetOutput = z.object({
  message: z.string(),
  timestamp: z.string(),
});

const greetTool = defineTool({
  description: "Greet someone",
  input: greetInput,
  output: greetOutput,
  handler: async (input) => ({ message: `Hello ${input.name}!`, timestamp: new Date().toISOString() }),
});
```

### Proposed Solution

Support inline schemas with type inference:

```typescript
// Compact form - 6 lines, all in one place
const greetTool = defineTool({
  description: "Greet someone",
  input: { name: z.string().describe("Name to greet") },
  output: { message: z.string(), timestamp: z.string() },
  handler: async (input) => ({
    message: `Hello ${input.name}!`,
    timestamp: new Date().toISOString()
  }),
});
```

The `defineTool` helper would auto-wrap plain objects with `z.object()` when not already a ZodType.

### Impact

| Metric | Score |
|--------|-------|
| **Usefulness** | 8/10 |
| **Complexity** | S |

**Rationale**: Reduces cognitive load and line count by ~40% for simple tools. The explicit form remains available for complex schemas (unions, refinements, etc.). AI agents can generate more concise tool definitions.

---

## 3. Safe Middleware Helper with Required `next()` Call

### Current Problem

Forgetting `await next()` silently breaks the middleware chain:

```typescript
// Common mistake - chain breaks silently
app.use(async (context, next) => {
  console.log("Before tool");
  // Forgot await next()! Downstream middleware and handler never run
});
```

This is the classic Koa footgun and difficult to debug.

### Proposed Solution

Add a `defineMiddleware` helper that enforces `next()` at compile-time:

```typescript
import { defineMiddleware } from "@mcp-apps-kit/core";

// Option A: Wrapper pattern (enforces next at runtime)
const logging = defineMiddleware({
  before: async (context) => {
    console.log("Before tool");
  },
  after: async (context, result) => {
    console.log("After tool", result);
  },
});

// Option B: Auto-next for simple cases
const logging = defineMiddleware.before(async (context) => {
  console.log("Before tool");
  // next() called automatically after
});

// Option C: Full control with explicit marker
const auth = defineMiddleware(async (context, next) => {
  if (!context.raw?.token) throw new Error("Unauthorized");
  return next(); // Must return next() - TypeScript enforces this
});
```

### Impact

| Metric | Score |
|--------|-------|
| **Usefulness** | 7/10 |
| **Complexity** | S |

**Rationale**: Eliminates a common footgun that wastes debugging time. The `before`/`after` pattern is more intuitive for simple cases. AI agents are especially prone to this mistake.

---

## 4. Output Schema Auto-Inference from Handler Return Type

### Current Problem

When `output` schema is omitted, TypeScript falls back to `unknown`:

```typescript
const myTool = defineTool({
  description: "Do something",
  input: z.object({ id: z.string() }),
  // No output schema - result type is unknown
  handler: async (input) => ({
    data: "hello",
    count: 42
  }),
});

// Client-side: result is unknown
const result = await client.callTool("myTool", { id: "1" });
result.data; // Error: unknown has no property 'data'
```

### Proposed Solution

Infer output type from handler return type when `output` is omitted:

```typescript
const myTool = defineTool({
  description: "Do something",
  input: z.object({ id: z.string() }),
  // output inferred as { data: string, count: number }
  handler: async (input) => ({
    data: "hello",
    count: 42
  }),
});

// Client-side: result is properly typed
const result = await client.callTool("myTool", { id: "1" });
result.data; // string - works!
```

This requires advanced TypeScript inference in `defineTool`:

```typescript
export function defineTool<
  TInput extends z.ZodType,
  TOutput extends z.ZodType | undefined = undefined,
  THandlerReturn = TOutput extends z.ZodType ? z.infer<TOutput> : unknown,
>(
  definition: {
    input: TInput;
    output?: TOutput;
    handler: (input: z.infer<TInput>, context: ToolContext) => Promise<THandlerReturn>;
  }
): ToolDef<TInput, TOutput extends z.ZodType ? TOutput : z.ZodType<THandlerReturn>>
```

### Impact

| Metric | Score |
|--------|-------|
| **Usefulness** | 7/10 |
| **Complexity** | L |

**Rationale**: Reduces boilerplate for prototyping while maintaining type safety. The explicit schema is still recommended for production (runtime validation). Complex TypeScript inference may have edge cases.

---

## 5. Unified Tool Builder API with Fluent Chaining

### Current Problem

Tool definition requires understanding multiple concepts simultaneously:
- Zod schemas
- Handler signatures
- UI definitions
- Annotations
- Visibility

AI agents must generate all of this correctly in one shot:

```typescript
const tool = defineTool({
  title: "Search",
  description: "Search for items",
  input: z.object({ query: z.string() }),
  output: z.object({ results: z.array(z.string()) }),
  visibility: "both",
  annotations: { readOnlyHint: true },
  ui: defineUI({ html: "./search.html", prefersBorder: true }),
  handler: async (input) => ({ results: ["item1", "item2"] }),
});
```

### Proposed Solution

Add a fluent builder API for progressive construction:

```typescript
import { tool } from "@mcp-apps-kit/core";

const searchTool = tool("search")
  .describe("Search for items")
  .input({ query: z.string() })
  .output({ results: z.array(z.string()) })
  .visibility("both")
  .readOnly()  // Shorthand for annotations
  .ui("./search.html", { prefersBorder: true })
  .handle(async (input) => ({ results: ["item1", "item2"] }))
  .build();

// Or minimal version:
const simpleTool = tool("greet")
  .describe("Greet someone")
  .input({ name: z.string() })
  .handle(async ({ name }) => ({ message: `Hello ${name}!` }))
  .build();
```

Benefits:
- **Discoverable**: IDE autocomplete shows all available options
- **Progressive**: Build tools step-by-step
- **Type-safe**: Each step validates and constrains the next
- **AI-friendly**: Clear chain of actions to follow

### Impact

| Metric | Score |
|--------|-------|
| **Usefulness** | 6/10 |
| **Complexity** | M |

**Rationale**: More discoverable than object literals. Good for onboarding. However, adds another API surface to maintain alongside `defineTool`. Best as an optional alternative rather than replacement.

---

## Summary Table

| # | Improvement | Usefulness | Complexity | Priority |
|---|-------------|------------|------------|----------|
| 1 | Auto-Generated Client Type Export | 9/10 | M | High |
| 2 | Inline Schema Syntax | 8/10 | S | High |
| 3 | Safe Middleware Helper | 7/10 | S | Medium |
| 4 | Output Schema Auto-Inference | 7/10 | L | Medium |
| 5 | Fluent Tool Builder API | 6/10 | M | Low |

---

## Recommended Implementation Order

1. **#2 Inline Schema Syntax** (S complexity, 8/10 usefulness) - Quick win
2. **#3 Safe Middleware Helper** (S complexity, 7/10 usefulness) - Quick win
3. **#1 Auto-Generated Client Types** (M complexity, 9/10 usefulness) - High impact
4. **#4 Output Schema Auto-Inference** (L complexity, 7/10 usefulness) - Nice to have
5. **#5 Fluent Builder** (M complexity, 6/10 usefulness) - Optional enhancement

---

## Additional Notes

### For AI Agent Developers

The improvements above particularly benefit AI agents because:

1. **Reduced context**: Fewer lines = smaller prompts = more accurate generation
2. **Discoverable APIs**: Fluent builders and autocomplete reduce errors
3. **Type safety**: Auto-inference catches mistakes at compile time
4. **Fewer footguns**: Safe middleware prevents silent failures

### Backward Compatibility

All proposed changes are **additive** - existing code continues to work:
- Inline schemas are optional (explicit Zod objects still supported)
- `defineMiddleware` is optional (raw middleware function still works)
- Fluent builder coexists with `defineTool`
- Client type utilities are opt-in
