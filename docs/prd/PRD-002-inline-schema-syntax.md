# PRD-002: Inline Schema Syntax for Simple Tools

## Document Info

| Field | Value |
|-------|-------|
| **PRD ID** | PRD-002 |
| **Title** | Inline Schema Syntax for Simple Tools |
| **Priority** | High |
| **Usefulness Score** | 8/10 |
| **Complexity** | Small |
| **Status** | Draft |
| **Author** | MCP AppsKit Team |
| **Created** | 2026-01-13 |
| **Last Updated** | 2026-01-13 |

---

## 1. Problem Statement

### Current Pain Points

Even simple tools require 3 separate declarations with explicit Zod object wrappers:

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
  handler: async (input) => ({ 
    message: `Hello ${input.name}!`, 
    timestamp: new Date().toISOString() 
  }),
});
```

### Impact of Current State

- **Verbose for simple cases** - ~8 lines of schema code for 2 properties
- **Scattered definitions** - Input, output, and handler are separate
- **Repetitive** - `z.object()` wrapper on every schema
- **Context-heavy for AI** - Agents must generate more code, increasing error probability
- **Onboarding friction** - New developers learn more syntax before being productive

---

## 2. Goals & Success Metrics

### Goals

1. **Reduce boilerplate by 40%** for simple tools (1-5 properties)
2. **Collocate schema and handler** - Everything in one place
3. **Auto-wrap plain objects** - Implicit `z.object()` for convenience
4. **Preserve explicit syntax** - Complex schemas (unions, refinements) still work
5. **Full type inference** - No loss of type safety

### Success Metrics

| Metric | Target |
|--------|--------|
| Lines of code for simple tool | 6 (down from 10-12) |
| Learning curve (time to first tool) | <5 minutes |
| AI generation success rate | +15% for simple tools |
| Backward compatibility | 100% - existing code unchanged |

---

## 3. Proposed Solution

### 3.1 Core API Enhancement

Allow passing plain objects to `input` and `output`, auto-wrapped with `z.object()`:

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

### 3.2 Type Signature

```typescript
type SchemaInput<T> = 
  | z.ZodType<T>                           // Explicit Zod schema
  | Record<string, z.ZodType<unknown>>;    // Plain object → auto z.object()

function defineTool<
  TInput extends SchemaInput<any>,
  TOutput extends SchemaInput<any>,
>(definition: {
  description: string;
  input: TInput;
  output?: TOutput;
  handler: (input: InferSchema<TInput>, context: ToolContext) => Promise<InferSchema<TOutput>>;
}): ToolDef;
```

### 3.3 Comparison

| Approach | Lines | Readability | Flexibility |
|----------|-------|-------------|-------------|
| **Explicit (current)** | 10-12 | Good | Full |
| **Inline (proposed)** | 6-8 | Excellent | Moderate |
| **Inline + explicit mix** | 8-10 | Good | Full |

---

## 4. Technical Design

### 4.1 Schema Normalization

```typescript
// core/src/utils/schema.ts

import { z } from "zod";

type PlainSchemaObject = Record<string, z.ZodType<unknown>>;

/**
 * Normalizes input to a ZodObject.
 * If already a ZodType, returns as-is.
 * If plain object with Zod properties, wraps with z.object().
 */
export function normalizeSchema<T extends z.ZodType | PlainSchemaObject>(
  schema: T
): T extends PlainSchemaObject ? z.ZodObject<T> : T {
  if (schema instanceof z.ZodType) {
    return schema as any;
  }
  
  // Plain object with Zod values → wrap
  return z.object(schema as PlainSchemaObject) as any;
}
```

### 4.2 Updated `defineTool` Implementation

```typescript
// core/src/tool.ts

export function defineTool<
  TInputDef extends z.ZodType | PlainSchemaObject,
  TOutputDef extends z.ZodType | PlainSchemaObject | undefined = undefined,
>(definition: {
  description: string;
  input: TInputDef;
  output?: TOutputDef;
  handler: (
    input: InferFromDef<TInputDef>, 
    context: ToolContext
  ) => Promise<InferFromDef<TOutputDef>>;
}): ToolDef<NormalizeSchema<TInputDef>, NormalizeSchema<TOutputDef>> {
  
  const normalizedInput = normalizeSchema(definition.input);
  const normalizedOutput = definition.output 
    ? normalizeSchema(definition.output) 
    : undefined;
  
  return {
    description: definition.description,
    input: normalizedInput,
    output: normalizedOutput,
    handler: definition.handler,
  };
}
```

### 4.3 Type Inference Helpers

```typescript
// core/src/types.ts

type PlainSchemaObject = Record<string, z.ZodType<unknown>>;

/**
 * Infer the TypeScript type from a schema definition
 */
type InferFromDef<T> = 
  T extends z.ZodType<infer U> ? U :
  T extends PlainSchemaObject ? { [K in keyof T]: z.infer<T[K]> } :
  never;

/**
 * Normalize to ZodType
 */
type NormalizeSchema<T> =
  T extends z.ZodType ? T :
  T extends PlainSchemaObject ? z.ZodObject<{ [K in keyof T]: T[K] }> :
  never;
```

---

## 5. Usage Examples

### 5.1 Simple Tool (Recommended for 1-5 properties)

```typescript
const greetTool = defineTool({
  description: "Greet a user by name",
  input: { 
    name: z.string().describe("Name to greet"),
    formal: z.boolean().optional().describe("Use formal greeting")
  },
  output: { 
    message: z.string(),
    timestamp: z.string()
  },
  handler: async ({ name, formal }) => ({
    message: formal ? `Good day, ${name}.` : `Hello ${name}!`,
    timestamp: new Date().toISOString()
  }),
});
```

### 5.2 Complex Tool (Explicit schemas still work)

```typescript
// For unions, discriminated unions, refinements - use explicit
const searchInput = z.object({
  query: z.string().min(1).max(100),
  filters: z.discriminatedUnion("type", [
    z.object({ type: z.literal("date"), after: z.date() }),
    z.object({ type: z.literal("category"), category: z.enum(["A", "B", "C"]) }),
  ]).optional(),
});

const searchTool = defineTool({
  description: "Search with complex filters",
  input: searchInput, // Explicit ZodObject
  output: { results: z.array(z.string()) }, // Inline still works for output
  handler: async (input) => ({ results: ["result1", "result2"] }),
});
```

### 5.3 Mixed Approach

```typescript
// Reusable schemas + inline
const paginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

const listTool = defineTool({
  description: "List items with pagination",
  input: paginationSchema.extend({
    filter: z.string().optional(), // Extend reusable schema
  }),
  output: { 
    items: z.array(z.string()),
    total: z.number()
  },
  handler: async (input) => ({ items: [], total: 0 }),
});
```

---

## 6. Edge Cases & Validation

### 6.1 Detection Logic

How to distinguish `z.ZodType` from plain object:

```typescript
function isZodType(value: unknown): value is z.ZodType {
  return value instanceof z.ZodType;
}

// This catches:
// - z.object({ ... })
// - z.string()
// - z.array(...)
// - Any Zod schema

// This allows:
// - { name: z.string() } → plain object, auto-wrap
```

### 6.2 Nested Objects

```typescript
// Inline supports nested objects via z.object()
const tool = defineTool({
  input: {
    user: z.object({
      name: z.string(),
      age: z.number(),
    }),
    preferences: z.object({
      theme: z.enum(["light", "dark"]),
    }),
  },
  // ...
});
```

### 6.3 Empty Input

```typescript
// No input required
const pingTool = defineTool({
  description: "Health check",
  input: {}, // Empty object → z.object({})
  output: { status: z.literal("ok") },
  handler: async () => ({ status: "ok" as const }),
});
```

### 6.4 Invalid Plain Objects (Type Error)

```typescript
// ❌ Type error: values must be Zod types
const badTool = defineTool({
  input: {
    name: "string", // Error: string is not z.ZodType
  },
  // ...
});
```

---

## 7. User Stories

### US-1: Quick Prototyping

> As a developer prototyping a tool, I want to define input/output inline, so I can iterate faster.

**Acceptance Criteria:**
- [ ] Inline syntax works with type inference
- [ ] Can start inline and extract to explicit later
- [ ] IDE shows correct types for handler input

### US-2: AI Code Generation

> As an AI agent, I want a compact syntax for simple tools, so I generate correct code in fewer tokens.

**Acceptance Criteria:**
- [ ] Simple tools expressible in ≤10 lines
- [ ] Pattern is consistent and predictable
- [ ] No disambiguation needed for simple cases

### US-3: Team Consistency

> As a tech lead, I want both syntaxes to be valid, so teams can choose based on complexity.

**Acceptance Criteria:**
- [ ] Linter/formatter works with both styles
- [ ] Documentation shows when to use each
- [ ] No runtime difference between approaches

---

## 8. Testing Strategy

### Unit Tests

```typescript
describe("normalizeSchema", () => {
  it("passes through ZodType unchanged", () => {
    const schema = z.object({ name: z.string() });
    expect(normalizeSchema(schema)).toBe(schema);
  });
  
  it("wraps plain object with z.object()", () => {
    const plain = { name: z.string(), age: z.number() };
    const normalized = normalizeSchema(plain);
    expect(normalized).toBeInstanceOf(z.ZodObject);
  });
  
  it("preserves descriptions on wrapped schemas", () => {
    const plain = { name: z.string().describe("User name") };
    const normalized = normalizeSchema(plain);
    expect(normalized.shape.name.description).toBe("User name");
  });
});
```

### Type Tests

```typescript
// Type inference tests (compile-time)
const tool = defineTool({
  description: "test",
  input: { name: z.string() },
  output: { result: z.number() },
  handler: async (input) => {
    // input.name should be string
    const name: string = input.name;
    return { result: 42 };
  },
});

// Verify tool.input is ZodObject
type InputType = z.infer<typeof tool.input>;
expectType<{ name: string }>(null as unknown as InputType);
```

### Integration Tests

- [ ] Tools defined with inline syntax work end-to-end
- [ ] Client receives correct types from server
- [ ] JSON Schema generation works for both syntaxes

---

## 9. Migration Guide

### No Migration Required

This is a **purely additive** feature. Existing code continues to work:

```typescript
// ✅ Still works (explicit)
const input = z.object({ name: z.string() });
const tool = defineTool({ input, ... });

// ✅ New option (inline)
const tool = defineTool({ 
  input: { name: z.string() }, 
  ... 
});
```

### Recommended Usage

| Schema Complexity | Recommendation |
|-------------------|----------------|
| 1-3 simple fields | Inline |
| 4-7 fields | Inline or explicit (team preference) |
| Complex validation (unions, refinements) | Explicit |
| Reused across tools | Explicit + share |

---

## 10. Documentation Updates

### Quick Start Update

```diff
// Before
+ const inputSchema = z.object({
+   name: z.string().describe("Name to greet"),
+ });
+ 
+ const outputSchema = z.object({
+   message: z.string(),
+ });

const greetTool = defineTool({
  description: "Greet someone",
-   input: inputSchema,
-   output: outputSchema,
+   input: { name: z.string().describe("Name to greet") },
+   output: { message: z.string() },
  handler: async ({ name }) => ({ message: `Hello ${name}!` }),
});
```

### API Reference Addition

> **Input/Output Schemas**
> 
> Both `input` and `output` accept either:
> - A `z.ZodType` (explicit schema)
> - A plain object with Zod values (auto-wrapped with `z.object()`)
> 
> Use inline syntax for simple tools, explicit for complex validation.

---

## 11. Rollout Plan

| Phase | Duration | Activities |
|-------|----------|------------|
| Implementation | 3 days | Core changes, tests |
| Documentation | 2 days | Update docs, examples |
| Release | 1 day | Changelog, npm publish |

### Feature Flag (Optional)

Not needed - feature is backward compatible and low risk.

---

## 12. Open Questions

1. **Naming convention**: Should we recommend inline for quick tools in style guide?
2. **Linting**: Add ESLint rule to suggest inline for simple schemas?
3. **Code actions**: IDE refactoring from explicit → inline and vice versa?

---

## 13. References

- [API Ergonomics Analysis](/docs/API_ERGONOMICS_ANALYSIS.md)
- [Zod Documentation](https://zod.dev/)
- [TypeScript Conditional Types](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html)
