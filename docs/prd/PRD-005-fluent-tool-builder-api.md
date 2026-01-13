# PRD-005: Unified Tool Builder API with Fluent Chaining

## Document Info

| Field | Value |
|-------|-------|
| **PRD ID** | PRD-005 |
| **Title** | Unified Tool Builder API with Fluent Chaining |
| **Priority** | Low |
| **Usefulness Score** | 6/10 |
| **Complexity** | Medium |
| **Status** | Draft |
| **Author** | MCP AppsKit Team |
| **Created** | 2026-01-13 |
| **Last Updated** | 2026-01-13 |

---

## 1. Problem Statement

### Current Pain Points

Tool definition requires understanding multiple concepts simultaneously and getting them all right in one shot:

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

### Impact of Current State

- **High cognitive load** - Must remember all options upfront
- **No discoverability** - IDE doesn't guide you through options
- **All-or-nothing** - Hard to incrementally build a tool definition
- **AI generation complexity** - Agents must generate complete config correctly
- **Option paralysis** - Many optional fields without clear guidance

---

## 2. Goals & Success Metrics

### Goals

1. **Progressive disclosure** - Build tools step-by-step
2. **IDE discoverability** - Autocomplete shows available options at each step
3. **Type-safe chaining** - Each step validates and constrains the next
4. **AI-friendly** - Clear, linear chain of actions
5. **Coexist with `defineTool`** - Optional alternative, not replacement

### Success Metrics

| Metric | Target |
|--------|--------|
| Discoverability (options found without docs) | +50% |
| Time to configure advanced options | -40% |
| AI generation accuracy | +20% |
| Developer preference (survey) | >50% prefer for complex tools |

---

## 3. Proposed Solution

### 3.1 Fluent Builder API

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
```

### 3.2 Minimal Tool

```typescript
const simpleTool = tool("greet")
  .describe("Greet someone")
  .input({ name: z.string() })
  .handle(async ({ name }) => ({ message: `Hello ${name}!` }))
  .build();
```

### 3.3 Comparison with `defineTool`

| Aspect | `defineTool` | `tool().build()` |
|--------|--------------|------------------|
| Style | Object literal | Fluent chain |
| Discoverability | Docs/types | IDE autocomplete |
| Progressive | No | Yes |
| Best for | Simple tools | Complex tools |
| Verbosity | Lower | Slightly higher |

---

## 4. Technical Design

### 4.1 Builder Interface Chain

```typescript
// core/src/builder/tool-builder.ts

/**
 * Step 1: Initial - requires description
 */
interface ToolBuilderInitial<TName extends string> {
  describe(description: string): ToolBuilderWithDescription<TName>;
}

/**
 * Step 2: Has description - requires input
 */
interface ToolBuilderWithDescription<TName extends string> {
  title(title: string): this;
  input<TInput extends SchemaInput>(schema: TInput): ToolBuilderWithInput<TName, TInput>;
}

/**
 * Step 3: Has input - can add output or handler
 */
interface ToolBuilderWithInput<TName extends string, TInput> {
  output<TOutput extends SchemaInput>(schema: TOutput): ToolBuilderWithOutput<TName, TInput, TOutput>;
  handle<TReturn>(handler: Handler<TInput, TReturn>): ToolBuilderComplete<TName, TInput, TReturn>;
}

/**
 * Step 4: Has output - can configure more or add handler
 */
interface ToolBuilderWithOutput<TName extends string, TInput, TOutput> {
  visibility(v: "mcp" | "chatgpt" | "both"): this;
  readOnly(): this;
  destructive(): this;
  idempotent(): this;
  expensive(): this;
  ui(path: string, options?: UIOptions): this;
  handle(handler: Handler<TInput, TOutput>): ToolBuilderComplete<TName, TInput, TOutput>;
}

/**
 * Final: Ready to build
 */
interface ToolBuilderComplete<TName extends string, TInput, TOutput> {
  build(): ToolDef<TName, TInput, TOutput>;
}
```

### 4.2 Factory Function

```typescript
// core/src/builder/index.ts

export function tool<TName extends string>(name: TName): ToolBuilderInitial<TName> {
  return new ToolBuilderImpl(name);
}
```

### 4.3 Implementation

```typescript
// core/src/builder/tool-builder-impl.ts

class ToolBuilderImpl<TName, TInput, TOutput> {
  private config: Partial<ToolConfig> = {};
  
  constructor(private name: TName) {}
  
  describe(description: string) {
    this.config.description = description;
    return this as any;
  }
  
  title(title: string) {
    this.config.title = title;
    return this;
  }
  
  input<T extends SchemaInput>(schema: T) {
    this.config.input = normalizeSchema(schema);
    return this as any;
  }
  
  output<T extends SchemaInput>(schema: T) {
    this.config.output = normalizeSchema(schema);
    return this as any;
  }
  
  visibility(v: "mcp" | "chatgpt" | "both") {
    this.config.visibility = v;
    return this;
  }
  
  readOnly() {
    this.config.annotations = { ...this.config.annotations, readOnlyHint: true };
    return this;
  }
  
  destructive() {
    this.config.annotations = { ...this.config.annotations, destructiveHint: true };
    return this;
  }
  
  idempotent() {
    this.config.annotations = { ...this.config.annotations, idempotentHint: true };
    return this;
  }
  
  expensive() {
    this.config.annotations = { ...this.config.annotations, openWorldHint: true };
    return this;
  }
  
  ui(path: string, options?: UIOptions) {
    this.config.ui = defineUI({ html: path, ...options });
    return this;
  }
  
  handle(handler: Handler<any, any>) {
    this.config.handler = handler;
    return this as any;
  }
  
  build(): ToolDef<any, any, any> {
    if (!this.config.description) throw new Error("Tool requires description");
    if (!this.config.input) throw new Error("Tool requires input schema");
    if (!this.config.handler) throw new Error("Tool requires handler");
    
    return {
      name: this.name,
      ...this.config,
    } as ToolDef<any, any, any>;
  }
}
```

---

## 5. Usage Examples

### 5.1 Progressive Building

```typescript
// Start with basics
let builder = tool("search")
  .describe("Search the database");

// Add input
builder = builder.input({
  query: z.string().min(1),
  limit: z.number().max(100).optional(),
});

// Add output
builder = builder.output({
  results: z.array(z.object({
    id: z.string(),
    title: z.string(),
    score: z.number(),
  })),
  total: z.number(),
});

// Configure options
builder = builder
  .visibility("both")
  .readOnly()
  .expensive();

// Add UI and handler
const searchTool = builder
  .ui("./search-ui.html")
  .handle(async (input, context) => {
    const results = await db.search(input.query, input.limit);
    return { results, total: results.length };
  })
  .build();
```

### 5.2 Compact Chaining

```typescript
const greetTool = tool("greet")
  .describe("Greet a user")
  .input({ name: z.string(), formal: z.boolean().optional() })
  .output({ message: z.string() })
  .handle(async ({ name, formal }) => ({
    message: formal ? `Good day, ${name}.` : `Hello ${name}!`
  }))
  .build();
```

### 5.3 With All Options

```typescript
const deleteUserTool = tool("deleteUser")
  .describe("Permanently delete a user account")
  .title("Delete User")
  .input({
    userId: z.string().uuid(),
    confirm: z.literal(true),
  })
  .output({
    success: z.boolean(),
    deletedAt: z.string(),
  })
  .visibility("mcp") // Admin-only, no ChatGPT
  .destructive() // Mark as destructive action
  .ui("./confirm-delete.html", { prefersBorder: true })
  .handle(async ({ userId }, context) => {
    await db.users.delete(userId);
    return { success: true, deletedAt: new Date().toISOString() };
  })
  .build();
```

### 5.4 Conditional Configuration

```typescript
const baseTool = tool("feature")
  .describe("Feature tool")
  .input({ id: z.string() });

const finalTool = (config.enableUI
  ? baseTool.output({ result: z.string() }).ui("./feature.html")
  : baseTool.output({ result: z.string() })
)
  .handle(async (input) => ({ result: "done" }))
  .build();
```

---

## 6. IDE Experience

### 6.1 Autocomplete at Each Step

```typescript
// After tool("name").
// IDE shows: describe()

// After .describe().
// IDE shows: title(), input()

// After .input().
// IDE shows: output(), handle()

// After .output().
// IDE shows: visibility(), readOnly(), destructive(), idempotent(), 
//            expensive(), ui(), handle()

// After .handle().
// IDE shows: build()
```

### 6.2 Type Errors

```typescript
// Missing required step
tool("greet")
  .describe("Greet")
  .build(); // ❌ Error: 'build' does not exist on ToolBuilderWithDescription

// Wrong handler signature
tool("greet")
  .describe("Greet")
  .input({ name: z.string() })
  .output({ message: z.string() })
  .handle(async (input) => input.name) // ❌ Error: string not assignable to { message: string }
  .build();
```

### 6.3 JSDoc for Each Method

```typescript
interface ToolBuilderWithOutput<...> {
  /**
   * Mark this tool as read-only (doesn't modify state).
   * Sets `annotations.readOnlyHint = true`.
   */
  readOnly(): this;
  
  /**
   * Mark this tool as potentially destructive.
   * AI clients may require confirmation before calling.
   * Sets `annotations.destructiveHint = true`.
   */
  destructive(): this;
  
  /**
   * Mark this tool as idempotent (safe to retry).
   * Sets `annotations.idempotentHint = true`.
   */
  idempotent(): this;
}
```

---

## 7. Comparison with Alternatives

### 7.1 Object Literal (`defineTool`)

```typescript
// Current approach
const tool = defineTool({
  description: "Search",
  input: z.object({ query: z.string() }),
  output: z.object({ results: z.array(z.string()) }),
  visibility: "both",
  annotations: { readOnlyHint: true },
  handler: async (input) => ({ results: [] }),
});
```

**Pros**: Compact, familiar, works well for simple tools
**Cons**: No discoverability, must know all options, all-or-nothing

### 7.2 Fluent Builder (`tool().build()`)

```typescript
const tool = tool("search")
  .describe("Search")
  .input({ query: z.string() })
  .output({ results: z.array(z.string()) })
  .visibility("both")
  .readOnly()
  .handle(async (input) => ({ results: [] }))
  .build();
```

**Pros**: Discoverable, progressive, clear shortcuts
**Cons**: Slightly more verbose, another pattern to learn

### 7.3 Recommendation

| Scenario | Recommended API |
|----------|-----------------|
| Simple tools (1-2 options) | `defineTool` |
| Complex tools (many options) | `tool().build()` |
| New developers | `tool().build()` (discoverable) |
| AI generation | Either (both work) |
| Refactoring | `defineTool` (more compact) |

---

## 8. User Stories

### US-1: Discovering Options

> As a new developer, I want IDE autocomplete to show me all tool options, so I don't need to read docs.

**Acceptance Criteria:**
- [ ] Each builder step shows relevant methods
- [ ] JSDoc explains each option
- [ ] Type errors guide correct usage

### US-2: Progressive Configuration

> As a developer, I want to build tools step-by-step, so I can focus on one thing at a time.

**Acceptance Criteria:**
- [ ] Can chain methods in any valid order
- [ ] Required steps enforced at compile-time
- [ ] Optional steps can be skipped

### US-3: Quick Shortcuts

> As a developer, I want shortcuts for common configurations, so I don't repeat verbose patterns.

**Acceptance Criteria:**
- [ ] `.readOnly()` instead of `annotations: { readOnlyHint: true }`
- [ ] `.ui(path)` instead of `ui: defineUI({ html: path })`
- [ ] Shortcuts are well-documented

---

## 9. Testing Strategy

### Unit Tests

```typescript
describe("ToolBuilder", () => {
  it("builds a minimal tool", () => {
    const t = tool("greet")
      .describe("Greet")
      .input({ name: z.string() })
      .handle(async ({ name }) => ({ message: `Hi ${name}` }))
      .build();
    
    expect(t.name).toBe("greet");
    expect(t.description).toBe("Greet");
    expect(t.input).toBeInstanceOf(z.ZodObject);
  });
  
  it("applies annotations via shortcuts", () => {
    const t = tool("read")
      .describe("Read")
      .input({})
      .output({ data: z.string() })
      .readOnly()
      .expensive()
      .handle(async () => ({ data: "test" }))
      .build();
    
    expect(t.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: true,
    });
  });
  
  it("throws if required steps are missing", () => {
    expect(() => {
      (tool("bad") as any).build();
    }).toThrow("Tool requires description");
  });
});
```

### Type Tests

```typescript
import { expectType, expectError } from "tsd";

// Valid chain
const valid = tool("test")
  .describe("Test")
  .input({ id: z.string() })
  .handle(async () => ({}))
  .build();

expectType<ToolDef<"test", z.ZodObject<{ id: z.ZodString }>, any>>(valid);

// Invalid: missing input
expectError(
  tool("test")
    .describe("Test")
    .build() // Error: build doesn't exist without input
);

// Invalid: handler doesn't match output
expectError(
  tool("test")
    .describe("Test")
    .input({})
    .output({ result: z.string() })
    .handle(async () => ({ wrong: 123 })) // Error: type mismatch
    .build()
);
```

---

## 10. Migration Guide

### Using Alongside `defineTool`

Both APIs coexist - no migration required:

```typescript
import { defineTool, tool } from "@mcp-apps-kit/core";

// Object style
const toolA = defineTool({
  description: "Simple",
  input: z.object({ id: z.string() }),
  handler: async (input) => ({}),
});

// Builder style
const toolB = tool("complex")
  .describe("Complex")
  .input({ id: z.string() })
  .output({ data: z.string() })
  .readOnly()
  .expensive()
  .handle(async (input) => ({ data: "test" }))
  .build();

// Both work with app.tool()
app.tool("simple", toolA);
app.tool("complex", toolB);
```

### Converting from `defineTool`

```diff
// Before
- const myTool = defineTool({
-   description: "Search",
-   input: z.object({ query: z.string() }),
-   output: z.object({ results: z.array(z.string()) }),
-   visibility: "both",
-   annotations: { readOnlyHint: true },
-   handler: async (input) => ({ results: [] }),
- });

// After
+ const myTool = tool("search")
+   .describe("Search")
+   .input({ query: z.string() })
+   .output({ results: z.array(z.string()) })
+   .visibility("both")
+   .readOnly()
+   .handle(async (input) => ({ results: [] }))
+   .build();
```

---

## 11. Rollout Plan

| Phase | Duration | Activities |
|-------|----------|------------|
| Design | 1 week | API design, type system |
| Implementation | 1 week | Builder, tests |
| Documentation | 1 week | Examples, migration guide |
| Beta | 2 weeks | Community feedback |
| GA | - | Full release |

### Feature Considerations

- **Experimental flag**: Consider marking as experimental initially
- **Documentation prominence**: Start as secondary option, promote based on adoption
- **Example updates**: Add builder examples alongside `defineTool` examples

---

## 12. Open Questions

1. **Naming**: `tool()` vs `createTool()` vs `buildTool()`?
2. **Required `.build()`**: Could we auto-build when handler is added?
3. **Extension points**: How to add custom methods for plugins?
4. **Async steps**: Should any builder step support async (e.g., loading UI)?

---

## 13. References

- [API Ergonomics Analysis](/docs/API_ERGONOMICS_ANALYSIS.md)
- [Builder Pattern in TypeScript](https://refactoring.guru/design-patterns/builder/typescript/example)
- [Fluent Interface Pattern](https://en.wikipedia.org/wiki/Fluent_interface)
- [tRPC Builder API](https://trpc.io/docs/server/procedures) - Similar approach in practice
