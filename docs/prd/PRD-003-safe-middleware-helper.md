# PRD-003: Safe Middleware Helper with Required `next()` Call

## Document Info

| Field | Value |
|-------|-------|
| **PRD ID** | PRD-003 |
| **Title** | Safe Middleware Helper with Required `next()` Call |
| **Priority** | Medium |
| **Usefulness Score** | 7/10 |
| **Complexity** | Small |
| **Status** | Draft |
| **Author** | MCP AppsKit Team |
| **Created** | 2026-01-13 |
| **Last Updated** | 2026-01-13 |

---

## 1. Problem Statement

### Current Pain Points

Forgetting `await next()` silently breaks the middleware chain - a classic Koa-style footgun:

```typescript
// Common mistake - chain breaks silently
app.use(async (context, next) => {
  console.log("Before tool");
  // Forgot await next()! 
  // Downstream middleware and handler NEVER run
  // No error, no warning - just silent failure
});
```

### Impact of Current State

- **Silent failures** - No indication that middleware chain is broken
- **Difficult debugging** - Hours wasted finding missing `next()` call
- **AI agent prone** - Agents frequently omit `next()` in generated code
- **Onboarding trap** - New developers don't understand the pattern
- **Runtime-only detection** - No compile-time safety

---

## 2. Goals & Success Metrics

### Goals

1. **Prevent missing `next()` errors** at compile-time or with clear runtime errors
2. **Provide intuitive API** for common before/after patterns
3. **Maintain full control** option for complex middleware
4. **Backward compatible** - existing middleware still works

### Success Metrics

| Metric | Target |
|--------|--------|
| Middleware-related bugs in production | -80% |
| Time to debug middleware issues | <5 minutes |
| AI agent middleware generation accuracy | +30% |
| Developer preference (survey) | >70% prefer new API |

---

## 3. Proposed Solution

### 3.1 New `defineMiddleware` API

Three patterns for different use cases:

#### Option A: Before/After Hooks (Recommended for Simple Cases)

```typescript
import { defineMiddleware } from "@mcp-apps-kit/core";

const logging = defineMiddleware({
  before: async (context) => {
    console.log("Before tool:", context.toolName);
    // next() called automatically after
  },
  after: async (context, result) => {
    console.log("After tool:", context.toolName, result);
  },
});

app.use(logging);
```

#### Option B: Shorthand Helpers

```typescript
// Only need before logic
const timing = defineMiddleware.before(async (context) => {
  context.state.startTime = Date.now();
});

// Only need after logic  
const metrics = defineMiddleware.after(async (context, result) => {
  const duration = Date.now() - context.state.startTime;
  recordMetric(context.toolName, duration);
});
```

#### Option C: Full Control with Enforcement

```typescript
// For conditional execution, error handling, etc.
const auth = defineMiddleware.wrap(async (context, next) => {
  if (!context.raw?.token) {
    throw new Error("Unauthorized");
  }
  
  // TypeScript enforces returning next()
  return next();
});
```

### 3.2 Comparison with Current API

| Feature | Current `app.use()` | `defineMiddleware` |
|---------|--------------------|--------------------|
| `next()` required | Manual, error-prone | Auto or enforced |
| Before/after logic | Mixed in one function | Separate, clear |
| Error detection | Runtime, silent | Compile-time or loud |
| Learning curve | Must understand Koa | Intuitive patterns |

---

## 4. Technical Design

### 4.1 Type Definitions

```typescript
// core/src/middleware.ts

import { ToolContext, ToolResult } from "./types";

/**
 * Before hook - runs before the tool handler
 */
type BeforeHook = (context: ToolContext) => Promise<void> | void;

/**
 * After hook - runs after the tool handler with result
 */
type AfterHook = (context: ToolContext, result: ToolResult) => Promise<void> | void;

/**
 * Full middleware with enforced next() return
 */
type WrapMiddleware = (
  context: ToolContext, 
  next: () => Promise<ToolResult>
) => Promise<ToolResult>;

/**
 * Middleware definition options
 */
interface MiddlewareDefinition {
  before?: BeforeHook;
  after?: AfterHook;
}

/**
 * The standard middleware function type
 */
type Middleware = (
  context: ToolContext, 
  next: () => Promise<ToolResult>
) => Promise<ToolResult>;
```

### 4.2 Implementation

```typescript
// core/src/middleware.ts

/**
 * Creates a middleware from before/after hooks or a wrapper function
 */
export function defineMiddleware(definition: MiddlewareDefinition): Middleware;
export function defineMiddleware(wrapper: WrapMiddleware): Middleware;

export function defineMiddleware(
  defOrWrapper: MiddlewareDefinition | WrapMiddleware
): Middleware {
  // Wrapper function pattern
  if (typeof defOrWrapper === "function") {
    return defOrWrapper;
  }
  
  // Before/after hooks pattern
  const { before, after } = defOrWrapper;
  
  return async (context, next) => {
    // Run before hook
    if (before) {
      await before(context);
    }
    
    // Call next (guaranteed!)
    const result = await next();
    
    // Run after hook
    if (after) {
      await after(context, result);
    }
    
    return result;
  };
}

/**
 * Shorthand: before-only middleware
 */
defineMiddleware.before = (hook: BeforeHook): Middleware => {
  return async (context, next) => {
    await hook(context);
    return next();
  };
};

/**
 * Shorthand: after-only middleware  
 */
defineMiddleware.after = (hook: AfterHook): Middleware => {
  return async (context, next) => {
    const result = await next();
    await hook(context, result);
    return result;
  };
};

/**
 * Shorthand: full control with type enforcement
 * The return type MUST be Promise<ToolResult>, enforcing next() call
 */
defineMiddleware.wrap = (wrapper: WrapMiddleware): Middleware => {
  return wrapper;
};
```

### 4.3 Enforcement Strategy

#### Compile-Time (TypeScript)

```typescript
// The wrap pattern requires returning Promise<ToolResult>
// This means you MUST return next() or throw

const bad = defineMiddleware.wrap(async (context, next) => {
  console.log("oops");
  // ❌ TypeScript Error: Function must return Promise<ToolResult>
});

const good = defineMiddleware.wrap(async (context, next) => {
  console.log("before");
  return next(); // ✅ Returns ToolResult
});

const alsoGood = defineMiddleware.wrap(async (context, next) => {
  if (!context.raw?.token) {
    throw new Error("Unauthorized"); // ✅ Throws, also valid
  }
  return next();
});
```

#### Runtime (Optional Enhancement)

```typescript
// For extra safety, detect unreturned next() at runtime
defineMiddleware.wrap = (wrapper: WrapMiddleware): Middleware => {
  return async (context, next) => {
    let nextCalled = false;
    const wrappedNext = async () => {
      nextCalled = true;
      return next();
    };
    
    const result = await wrapper(context, wrappedNext);
    
    if (!nextCalled && result === undefined) {
      console.warn(
        `[mcp-apps-kit] Middleware did not call next() or return a result. ` +
        `This may break the middleware chain.`
      );
    }
    
    return result;
  };
};
```

---

## 5. Usage Examples

### 5.1 Logging Middleware

```typescript
const logging = defineMiddleware({
  before: async (context) => {
    console.log(`[${new Date().toISOString()}] Tool: ${context.toolName}`);
    console.log(`Input:`, context.input);
  },
  after: async (context, result) => {
    console.log(`Result:`, result);
  },
});
```

### 5.2 Timing Middleware

```typescript
const timing = defineMiddleware({
  before: async (context) => {
    context.state.startTime = performance.now();
  },
  after: async (context) => {
    const duration = performance.now() - context.state.startTime;
    console.log(`${context.toolName} took ${duration.toFixed(2)}ms`);
  },
});
```

### 5.3 Authentication Middleware

```typescript
const auth = defineMiddleware.wrap(async (context, next) => {
  const token = context.raw?.headers?.authorization;
  
  if (!token) {
    throw new Error("Missing authorization header");
  }
  
  const user = await validateToken(token);
  context.state.user = user;
  
  return next();
});
```

### 5.4 Caching Middleware

```typescript
const cache = defineMiddleware.wrap(async (context, next) => {
  const cacheKey = `${context.toolName}:${JSON.stringify(context.input)}`;
  
  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached); // Return early, skip handler
  }
  
  // Execute handler
  const result = await next();
  
  // Store in cache
  await redis.set(cacheKey, JSON.stringify(result), "EX", 300);
  
  return result;
});
```

### 5.5 Error Handling Middleware

```typescript
const errorHandler = defineMiddleware.wrap(async (context, next) => {
  try {
    return await next();
  } catch (error) {
    console.error(`Error in ${context.toolName}:`, error);
    
    // Transform to user-friendly error
    throw new ToolError({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    });
  }
});
```

---

## 6. Migration Guide

### Existing Middleware (Still Works)

```typescript
// ✅ This still works - no changes required
app.use(async (context, next) => {
  console.log("before");
  const result = await next();
  console.log("after");
  return result;
});
```

### Recommended Migration

```diff
// Before
- app.use(async (context, next) => {
-   console.log("before");
-   const result = await next();
-   console.log("after");
-   return result;
- });

// After
+ const logging = defineMiddleware({
+   before: async (context) => console.log("before"),
+   after: async (context) => console.log("after"),
+ });
+ app.use(logging);
```

### When to Use Each Pattern

| Pattern | Use When |
|---------|----------|
| `{ before, after }` | Simple logging, metrics, setup/teardown |
| `.before()` | Only need to run code before handler |
| `.after()` | Only need to inspect/modify result |
| `.wrap()` | Conditional execution, caching, auth, error handling |

---

## 7. User Stories

### US-1: Prevent Silent Failures

> As a developer, I want to be warned when I forget `next()`, so I don't waste time debugging.

**Acceptance Criteria:**
- [ ] `defineMiddleware({ before, after })` auto-calls `next()`
- [ ] `.wrap()` requires returning `Promise<ToolResult>`
- [ ] Runtime warning for suspicious patterns

### US-2: Intuitive API for Common Cases

> As a new developer, I want to add logging without understanding Koa patterns, so I can be productive immediately.

**Acceptance Criteria:**
- [ ] Before/after hooks are intuitive
- [ ] No need to manually call `next()` for simple cases
- [ ] Clear documentation with examples

### US-3: AI Agent Safety

> As an AI agent generating middleware, I want a pattern that prevents common mistakes, so generated code works correctly.

**Acceptance Criteria:**
- [ ] Before/after pattern has no footguns
- [ ] Wrap pattern forces correct return type
- [ ] Patterns are learnable from examples

---

## 8. Testing Strategy

### Unit Tests

```typescript
describe("defineMiddleware", () => {
  describe("before/after hooks", () => {
    it("calls before hook, then next, then after hook", async () => {
      const order: string[] = [];
      
      const middleware = defineMiddleware({
        before: async () => { order.push("before"); },
        after: async () => { order.push("after"); },
      });
      
      await middleware(mockContext, async () => {
        order.push("next");
        return mockResult;
      });
      
      expect(order).toEqual(["before", "next", "after"]);
    });
    
    it("passes result to after hook", async () => {
      let capturedResult: unknown;
      
      const middleware = defineMiddleware({
        after: async (_, result) => { capturedResult = result; },
      });
      
      await middleware(mockContext, async () => ({ data: "test" }));
      
      expect(capturedResult).toEqual({ data: "test" });
    });
  });
  
  describe(".before()", () => {
    it("calls next() automatically", async () => {
      let nextCalled = false;
      
      const middleware = defineMiddleware.before(async () => {});
      
      await middleware(mockContext, async () => {
        nextCalled = true;
        return mockResult;
      });
      
      expect(nextCalled).toBe(true);
    });
  });
  
  describe(".wrap()", () => {
    it("allows conditional next() call", async () => {
      const middleware = defineMiddleware.wrap(async (context, next) => {
        if (context.toolName === "skip") {
          return { skipped: true };
        }
        return next();
      });
      
      // Should skip
      const skipResult = await middleware(
        { ...mockContext, toolName: "skip" }, 
        async () => mockResult
      );
      expect(skipResult).toEqual({ skipped: true });
      
      // Should call next
      const normalResult = await middleware(
        { ...mockContext, toolName: "normal" }, 
        async () => mockResult
      );
      expect(normalResult).toBe(mockResult);
    });
  });
});
```

### Type Tests

```typescript
// These should type-check correctly
const validMiddleware = defineMiddleware.wrap(async (context, next) => {
  return next(); // ✅ Returns Promise<ToolResult>
});

const validThrow = defineMiddleware.wrap(async (context, next) => {
  throw new Error("test"); // ✅ Never returns, valid
});

// This should fail type-checking (in theory - TSC doesn't catch void return)
// const invalid = defineMiddleware.wrap(async (context, next) => {
//   console.log("oops"); // No return
// });
```

---

## 9. Rollout Plan

| Phase | Duration | Activities |
|-------|----------|------------|
| Implementation | 2 days | Core API, tests |
| Documentation | 1 day | Examples, migration guide |
| Release | 1 day | Changelog, npm publish |

### Deprecation Strategy

1. **v1.x**: Both APIs available, `defineMiddleware` recommended
2. **v2.x**: Consider deprecating raw `app.use()` with custom function (optional)

---

## 10. Documentation Updates

### New Section: Middleware Best Practices

```markdown
## Middleware

### Recommended: defineMiddleware

Use `defineMiddleware` for safer, more readable middleware:

\`\`\`typescript
import { defineMiddleware } from "@mcp-apps-kit/core";

// Simple before/after
const logging = defineMiddleware({
  before: async (context) => console.log("Tool:", context.toolName),
  after: async (context, result) => console.log("Result:", result),
});

// Full control
const auth = defineMiddleware.wrap(async (context, next) => {
  if (!context.state.user) throw new Error("Unauthorized");
  return next();
});
\`\`\`

### Why Not Raw Middleware?

Raw middleware (`app.use(async (ctx, next) => ...)`) is error-prone:

- Forgetting `await next()` silently breaks the chain
- Must manually ensure `next()` is always called
- Easy to forget `return` before `next()`

Use `defineMiddleware` to avoid these pitfalls.
```

---

## 11. Open Questions

1. **Runtime detection**: Should we add runtime warnings for missing `next()`?
2. **Naming**: `defineMiddleware` vs `createMiddleware` vs `middleware`?
3. **Compose helper**: Add `composeMiddleware()` to combine multiple middlewares?

---

## 12. References

- [API Ergonomics Analysis](/docs/API_ERGONOMICS_ANALYSIS.md)
- [Koa Middleware Guide](https://koajs.com/#middleware)
- [Express vs Koa Middleware Comparison](https://medium.com/@l1905/express-vs-koa-middleware-comparison)
