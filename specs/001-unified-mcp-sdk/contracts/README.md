# API Contracts

This directory contains the public API contracts for the Unified MCP Apps Builder SDK.

## Overview

| Contract | Package | Description |
|----------|---------|-------------|
| [core-api.ts](./core-api.ts) | `@apps-builder/core` | Server-side API: `createApp()`, tool definitions, app instance |
| [ui-api.ts](./ui-api.ts) | `@apps-builder/ui` | Client-side API: `createClient()`, `AppsClient` interface |
| [ui-react-api.ts](./ui-react-api.ts) | `@apps-builder/ui-react` | React bindings: hooks and providers |

## Contract Rules

1. **All exports are public API**: Every type and function declared in these files MUST be implemented and exported from the corresponding package.

2. **Semver compliance**: Changes to these contracts follow semantic versioning:
   - MAJOR: Removing exports, changing signatures in breaking ways
   - MINOR: Adding new exports, adding optional parameters
   - PATCH: Documentation changes, non-breaking implementation details

3. **Contract tests**: Each contract MUST have corresponding contract tests that verify the public API works as documented.

4. **Documentation**: All exports MUST have JSDoc comments with:
   - Description of purpose
   - Parameter documentation
   - Return value documentation
   - At least one usage example

## Usage

### Developers

Use these contracts as the reference for available APIs:

```typescript
// Server
import { createApp, type ToolDefs } from "@apps-builder/core";

// Client (vanilla)
import { createClient, type AppsClient } from "@apps-builder/ui";

// Client (React)
import { AppsProvider, useAppsClient, useToolResult } from "@apps-builder/ui-react";
```

### Contributors

When implementing features:

1. Update the relevant contract file first
2. Implement the feature to match the contract
3. Write contract tests to verify compliance
4. Update documentation

## Key Types

### ToolDef

Core type for defining MCP tools:

```typescript
interface ToolDef<TInput, TOutput> {
  description: string;
  input: TInput;           // Zod schema
  output?: TOutput;        // Zod schema (optional)
  handler: (input) => Promise<output>;
  ui?: string;             // References ui config key
  visibility?: "model" | "app" | "both";
}
```

### AppsClient

Unified client interface:

```typescript
interface AppsClient<T extends ToolDefs> {
  callTool(name, args): Promise<result>;
  sendMessage(content): Promise<void>;
  openLink(url): Promise<void>;
  getState<S>(): S | null;
  setState<S>(state): void;
  onToolResult(handler): () => void;
  hostContext: HostContext;
}
```

### React Hooks

Primary hooks for React integration:

```typescript
useAppsClient<T>()     // Get typed client
useToolResult<T>()     // Get tool results
useHostContext()       // Get host context
useWidgetState<S>()    // Persisted state
```
