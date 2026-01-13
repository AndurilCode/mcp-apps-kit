# PRD-004: Output Schema Auto-Inference from Handler Return Type

## Document Info

| Field | Value |
|-------|-------|
| **PRD ID** | PRD-004 |
| **Title** | Output Schema Auto-Inference from Handler Return Type |
| **Priority** | Medium |
| **Usefulness Score** | 7/10 |
| **Complexity** | Large |
| **Status** | Draft |
| **Author** | MCP AppsKit Team |
| **Created** | 2026-01-13 |
| **Last Updated** | 2026-01-13 |

---

## 1. Problem Statement

### Current Pain Points

When `output` schema is omitted, TypeScript falls back to `unknown`, losing type safety:

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
result.data; // ❌ Error: unknown has no property 'data'
```

### Impact of Current State

- **Lost type safety** for prototyping phase
- **Duplicate information** - handler return type duplicates output schema
- **Friction** - must define schema even for internal tools
- **Unknown type propagation** - infects downstream code
- **Manual casting** - developers use `as` to work around, losing safety

---

## 2. Goals & Success Metrics

### Goals

1. **Infer output type from handler** when no schema provided
2. **Preserve explicit schema option** for runtime validation needs
3. **Full type propagation** to client-side code
4. **No runtime overhead** for type inference (compile-time only)

### Success Metrics

| Metric | Target |
|--------|--------|
| Type coverage for tools without output schema | 100% (up from 0%) |
| Prototyping speed (time to typed tool) | -30% |
| Type-related bugs in development | -50% |
| Performance impact | Zero (compile-time only) |

---

## 3. Proposed Solution

### 3.1 Behavior Change

When `output` is omitted, infer the output type from handler return type:

```typescript
const myTool = defineTool({
  description: "Do something",
  input: z.object({ id: z.string() }),
  // output INFERRED as { data: string, count: number }
  handler: async (input) => ({
    data: "hello",
    count: 42
  }),
});

// Client-side: result is properly typed!
const result = await client.callTool("myTool", { id: "1" });
result.data; // ✅ string
result.count; // ✅ number
```

### 3.2 How It Works

1. Handler return type is inferred by TypeScript
2. `defineTool` captures this type in the generic signature
3. When no `output` schema provided, use handler return type
4. Type flows through to `ClientToolsFromCore<T>` for client-side

### 3.3 Explicit Schema Still Works

```typescript
// Explicit schema provides:
// - Runtime validation
// - Documentation in OpenAPI/JSON Schema
// - Coercion (e.g., Date strings → Date objects)

const tool = defineTool({
  description: "Get user",
  input: z.object({ id: z.string() }),
  output: z.object({
    name: z.string(),
    createdAt: z.date(), // Will coerce ISO string to Date
  }),
  handler: async (input) => ({
    name: "John",
    createdAt: new Date(),
  }),
});
```

---

## 4. Technical Design

### 4.1 Type System Changes

```typescript
// Current type signature
export function defineTool<
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
>(definition: {
  input: TInput;
  output: TOutput;
  handler: (input: z.infer<TInput>, context: ToolContext) => Promise<z.infer<TOutput>>;
}): ToolDef<TInput, TOutput>;

// New type signature with output inference
export function defineTool<
  TInput extends z.ZodType,
  TOutput extends z.ZodType | undefined = undefined,
  THandlerReturn = TOutput extends z.ZodType ? z.infer<TOutput> : unknown,
>(definition: {
  input: TInput;
  output?: TOutput;
  handler: (input: z.infer<TInput>, context: ToolContext) => Promise<THandlerReturn>;
}): ToolDef<TInput, InferredOutputSchema<TOutput, THandlerReturn>>;
```

### 4.2 Inferred Output Schema Type

```typescript
/**
 * When output is provided, use it.
 * When omitted, create a "phantom" type that carries the handler return type.
 */
type InferredOutputSchema<
  TOutput extends z.ZodType | undefined,
  THandlerReturn
> = TOutput extends z.ZodType
  ? TOutput
  : z.ZodType<THandlerReturn>;
```

### 4.3 Handler Return Type Capture

The key insight is TypeScript's ability to infer the return type of an async function:

```typescript
// TypeScript infers THandlerReturn from the handler parameter
function defineTool<
  TInput extends z.ZodType,
  THandlerReturn,
>(def: {
  input: TInput;
  handler: (input: z.infer<TInput>) => Promise<THandlerReturn>;
}): { outputType: THandlerReturn } {
  // ...
}

// When called:
const tool = defineTool({
  input: z.object({ name: z.string() }),
  handler: async (input) => ({ message: `Hello ${input.name}` }),
  // ^ TypeScript infers THandlerReturn as { message: string }
});
```

### 4.4 Advanced Type Signature

```typescript
// Full implementation with overloads for clarity

// Overload 1: With explicit output schema
export function defineTool<
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
>(definition: {
  description: string;
  input: TInput;
  output: TOutput;
  handler: (input: z.infer<TInput>, context: ToolContext) => Promise<z.infer<TOutput>>;
}): ToolDef<TInput, TOutput>;

// Overload 2: Without output schema (inferred)
export function defineTool<
  TInput extends z.ZodType,
  THandlerReturn extends Record<string, unknown>,
>(definition: {
  description: string;
  input: TInput;
  output?: undefined;
  handler: (input: z.infer<TInput>, context: ToolContext) => Promise<THandlerReturn>;
}): ToolDef<TInput, z.ZodType<THandlerReturn>>;

// Implementation
export function defineTool(definition: unknown): ToolDef<any, any> {
  // Runtime implementation unchanged
  return definition as ToolDef<any, any>;
}
```

---

## 5. Edge Cases & Considerations

### 5.1 Runtime Validation

**Important**: Inferred types provide **compile-time safety only**.

```typescript
// With inferred output - NO runtime validation
const tool = defineTool({
  input: z.object({ id: z.string() }),
  handler: async () => ({ data: fetchFromDb() }), // Could return anything at runtime
});

// With explicit output - runtime validation
const tool = defineTool({
  input: z.object({ id: z.string() }),
  output: z.object({ data: z.string() }),
  handler: async () => ({ data: fetchFromDb() }), // Validated against schema
});
```

**Recommendation**: Document that explicit schemas are needed for:
- External data sources (DB, APIs)
- User-facing error messages
- OpenAPI/JSON Schema generation

### 5.2 Complex Return Types

```typescript
// Works with complex types
const tool = defineTool({
  input: z.object({}),
  handler: async () => ({
    users: [{ id: 1, name: "John" }],
    pagination: { page: 1, total: 10 },
    metadata: { generated: new Date() },
  }),
});

// Inferred as:
// {
//   users: { id: number; name: string }[];
//   pagination: { page: number; total: number };
//   metadata: { generated: Date };
// }
```

### 5.3 Union Return Types

```typescript
// Conditional returns work
const tool = defineTool({
  input: z.object({ type: z.enum(["a", "b"]) }),
  handler: async (input) => {
    if (input.type === "a") {
      return { variant: "a" as const, data: 123 };
    }
    return { variant: "b" as const, data: "hello" };
  },
});

// Inferred as:
// { variant: "a"; data: number } | { variant: "b"; data: string }
```

### 5.4 `as const` for Literal Types

```typescript
// Use `as const` for literal inference
const tool = defineTool({
  input: z.object({}),
  handler: async () => ({
    status: "ok" as const, // Literal "ok", not string
    codes: [1, 2, 3] as const, // readonly [1, 2, 3], not number[]
  }),
});
```

### 5.5 Explicit Return Type Annotation

Developers can still annotate the handler for explicit control:

```typescript
interface MyOutput {
  message: string;
  timestamp: string;
}

const tool = defineTool({
  input: z.object({ name: z.string() }),
  handler: async (input): Promise<MyOutput> => ({
    message: `Hello ${input.name}`,
    timestamp: new Date().toISOString(),
  }),
});
```

---

## 6. Client-Side Type Flow

### 6.1 How Types Reach the Client

```typescript
// Server: tool definition
const greetTool = defineTool({
  input: z.object({ name: z.string() }),
  handler: async ({ name }) => ({
    message: `Hello ${name}!`,
    timestamp: new Date().toISOString(),
  }),
});

// Server: app registration
const app = createApp();
app.tool("greet", greetTool);

// Type chain:
// 1. greetTool has inferred output type { message: string; timestamp: string }
// 2. app.tool() captures this in App<{ greet: typeof greetTool }>
// 3. app.clientTypes exposes ClientToolsFromCore<{ greet: typeof greetTool }>
// 4. Client receives typed callTool("greet", ...) => Promise<{ message: string; timestamp: string }>
```

### 6.2 ClientToolsFromCore Update

```typescript
// Existing type needs to handle inferred output

type ClientToolsFromCore<TTools extends Record<string, ToolDef>> = {
  [K in keyof TTools]: {
    input: z.infer<TTools[K]["input"]>;
    output: TTools[K]["output"] extends z.ZodType
      ? z.infer<TTools[K]["output"]>
      : TTools[K]["_inferredOutput"]; // New: phantom type for inferred output
  };
};
```

---

## 7. User Stories

### US-1: Rapid Prototyping

> As a developer prototyping, I want output types without writing schemas, so I can iterate faster.

**Acceptance Criteria:**
- [ ] Tools without `output` have typed results on client
- [ ] No `unknown` types in prototype code
- [ ] Can add explicit schema later without breaking

### US-2: Type Safety Throughout

> As a developer, I want types to flow from server to client, so I catch errors at compile time.

**Acceptance Criteria:**
- [ ] Handler return type = client result type
- [ ] IDE autocomplete works for results
- [ ] Refactoring handler updates client types

### US-3: Gradual Strictness

> As a tech lead, I want teams to add runtime validation when ready, so we balance speed and safety.

**Acceptance Criteria:**
- [ ] Inferred types for development
- [ ] Explicit schemas for production
- [ ] Clear docs on when to use each

---

## 8. Testing Strategy

### Type Tests

```typescript
// Use tsd or similar for type testing

import { expectType, expectError } from "tsd";

// Test: Inferred output type
const toolWithoutOutput = defineTool({
  description: "test",
  input: z.object({ id: z.string() }),
  handler: async () => ({ data: "hello", count: 42 }),
});

type InferredOutput = z.infer<typeof toolWithoutOutput.output>;
expectType<{ data: string; count: number }>({} as InferredOutput);

// Test: Explicit output overrides inference
const toolWithOutput = defineTool({
  description: "test",
  input: z.object({ id: z.string() }),
  output: z.object({ result: z.string() }),
  handler: async () => ({ result: "test" }),
});

type ExplicitOutput = z.infer<typeof toolWithOutput.output>;
expectType<{ result: string }>({} as ExplicitOutput);

// Test: Handler must match explicit output
expectError(
  defineTool({
    description: "test",
    input: z.object({}),
    output: z.object({ name: z.string() }),
    handler: async () => ({ wrong: 123 }), // Error: doesn't match output
  })
);
```

### Runtime Tests

```typescript
describe("defineTool output inference", () => {
  it("works without output schema at runtime", async () => {
    const tool = defineTool({
      description: "test",
      input: z.object({ name: z.string() }),
      handler: async ({ name }) => ({ greeting: `Hello ${name}` }),
    });
    
    const result = await tool.handler({ name: "World" }, mockContext);
    expect(result).toEqual({ greeting: "Hello World" });
  });
  
  it("validates output when schema provided", async () => {
    const tool = defineTool({
      description: "test",
      input: z.object({}),
      output: z.object({ value: z.number() }),
      handler: async () => ({ value: 42 }),
    });
    
    // This would be validated at runtime
    expect(tool.output.parse({ value: 42 })).toEqual({ value: 42 });
    expect(() => tool.output.parse({ value: "wrong" })).toThrow();
  });
});
```

---

## 9. Migration Guide

### No Breaking Changes

This is purely additive. Existing code works unchanged:

```typescript
// ✅ Still works - explicit output
const tool = defineTool({
  input: z.object({}),
  output: z.object({ result: z.string() }),
  handler: async () => ({ result: "test" }),
});

// ✅ New - inferred output
const tool = defineTool({
  input: z.object({}),
  handler: async () => ({ result: "test" }),
  // output type is { result: string }
});
```

### When to Add Explicit Schema

| Scenario | Recommendation |
|----------|----------------|
| Prototyping | Inferred (no schema) |
| Internal tools | Inferred OK |
| External data (DB, APIs) | Explicit (runtime validation) |
| Public API | Explicit (documentation) |
| Complex validation | Explicit (refinements, transforms) |

---

## 10. Implementation Risks

### Risk 1: TypeScript Complexity

**Risk**: Advanced generics may hit TypeScript inference limits.

**Mitigation**:
- Extensive type testing
- Fallback to `unknown` gracefully
- Document limitations

### Risk 2: Confusing Behavior

**Risk**: Developers may not understand the runtime validation difference.

**Mitigation**:
- Clear documentation
- Lint rule to warn about external data without schema
- IDE hints

### Risk 3: Breaking Client Types

**Risk**: Changes to `ClientToolsFromCore` may break existing code.

**Mitigation**:
- Careful type design
- Test against existing examples
- Semantic versioning

---

## 11. Rollout Plan

| Phase | Duration | Activities |
|-------|----------|------------|
| Design | 1 week | Type system design, edge case analysis |
| Implementation | 2 weeks | Core types, tests, type tests |
| Documentation | 1 week | Migration guide, examples |
| Beta | 2 weeks | Community testing, feedback |
| GA | - | Full release |

---

## 12. Open Questions

1. **Default behavior**: Should inferred output generate a runtime schema for JSON Schema?
2. **IDE support**: How to show "inferred" vs "explicit" in hover information?
3. **Lint rules**: Should we lint for missing output on tools with external data?
4. **Performance**: Any compile-time perf impact from complex generics?

---

## 13. References

- [API Ergonomics Analysis](/docs/API_ERGONOMICS_ANALYSIS.md)
- [TypeScript Return Type Inference](https://www.typescriptlang.org/docs/handbook/2/functions.html#return-type-inference)
- [Zod Type Inference](https://zod.dev/?id=type-inference)
