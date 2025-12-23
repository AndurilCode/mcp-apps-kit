# Implementation Roadmap

This document outlines the implementation phases and priorities for the Unified MCP Apps Builder Framework.

## Phase 1: Core Foundation

### 1.1 Project Setup
- [ ] Initialize monorepo structure (pnpm workspaces or turborepo)
- [ ] Configure TypeScript with strict settings
- [ ] Set up build tooling (tsup or vite library mode)
- [ ] Configure linting (ESLint) and formatting (Prettier)
- [ ] Set up testing framework (Vitest)

### 1.2 Type System (`@mcp-apps-kit/core`)
- [ ] Define `ToolDef` interface with Zod integration
- [ ] Implement `InferToolInputs<T>` and `InferToolOutputs<T>` utilities
- [ ] Define `UIDef` and `CSPConfig` interfaces
- [ ] Define `AppConfig` interface
- [ ] Create `defineTool()` helper for type inference
- [ ] Create `defineUI()` helper for type inference

### 1.3 Schema Utilities
- [ ] Implement `zodToJsonSchema()` converter
- [ ] Handle Zod descriptions in JSON Schema output
- [ ] Support optional/default values
- [ ] Handle nested objects and arrays
- [ ] Add validation for unsupported Zod types

### 1.4 Core `createApp()` Function
- [ ] Implement basic `createApp()` signature
- [ ] Tool registration with schema validation
- [ ] UI resource registration
- [ ] Configuration handling
- [ ] Return `App` instance

## Phase 2: Protocol Adapters (Server)

### 2.1 MCP Apps Adapter
- [ ] Implement tool metadata mapping (`_meta.ui.resourceUri`, etc.)
- [ ] Implement resource metadata mapping (CSP, border, domain)
- [ ] Handle visibility mapping (`["model", "app"]`, etc.)
- [ ] Implement resource handler for UI HTML
- [ ] Support single-file HTML bundling

### 2.2 ChatGPT Apps Adapter
- [ ] Implement tool metadata mapping (`_meta["openai/..."]`)
- [ ] Implement resource metadata mapping (widgetCSP, etc.)
- [ ] Handle visibility mapping (`public`/`private`, `widgetAccessible`)
- [ ] Support invokingMessage/invokedMessage
- [ ] Support fileParams

### 2.3 Server Instance (`App`)
- [ ] Implement `app.start()` with Express
- [ ] Implement `app.getServer()` for raw MCP server
- [ ] Implement `app.handler()` Express middleware
- [ ] Implement `app.handleRequest()` for serverless
- [ ] Add protocol auto-detection from client capabilities
- [ ] Add CORS configuration

## Phase 3: UI Client SDK

### 3.1 Protocol Detection
- [ ] Detect `window.openai` for ChatGPT
- [ ] Detect iframe context for MCP Apps
- [ ] Provide mock adapter for development
- [ ] Allow forced protocol override

### 3.2 MCP Apps Client Adapter
- [ ] Wrap `@modelcontextprotocol/ext-apps` SDK
- [ ] Map `App` instance to unified interface
- [ ] Implement tool calling
- [ ] Implement messaging
- [ ] Implement host context access
- [ ] Implement event subscriptions
- [ ] Polyfill state persistence

### 3.3 ChatGPT Apps Client Adapter
- [ ] Wrap `window.openai` API
- [ ] Map to unified interface
- [ ] Implement tool calling
- [ ] Implement messaging
- [ ] Implement host context access
- [ ] Implement event subscriptions (via `openai:set_globals`)
- [ ] Implement state management

### 3.4 Unified Client Interface
- [ ] Implement `createClient<T>()` factory
- [ ] Export `AppsClient<T>` interface
- [ ] Implement all action methods
- [ ] Implement all event subscriptions
- [ ] Implement property accessors
- [ ] Add TypeScript generics for type safety

## Phase 4: React Bindings

### 4.1 Context and Provider
- [ ] Create `AppsContext` React context
- [ ] Implement `AppsProvider` component
- [ ] Handle client initialization
- [ ] Handle error boundaries

### 4.2 Core Hooks
- [ ] `useAppsClient<T>()` - access client
- [ ] `useToolResult<T>()` - access tool results
- [ ] `useToolInput()` - access tool inputs
- [ ] `useHostContext()` - access host context
- [ ] `useWidgetState<S>()` - persisted state

### 4.3 Utility Hooks
- [ ] `useHostStyleVariables()` - apply CSS variables
- [ ] `useDocumentTheme()` - apply theme class
- [ ] `useDisplayMode()` - display mode management
- [ ] `useSafeAreaInsets()` - mobile safe areas

### 4.4 Suspense and Streaming
- [ ] Support React Suspense for async loading
- [ ] Handle streaming tool results
- [ ] Provide loading states

## Phase 5: Developer Experience

### 5.1 CLI Tool (`@mcp-apps-kit/create-app`)
- [ ] Project scaffolding
- [ ] Template selection (React, Vue, vanilla)
- [ ] Interactive prompts
- [ ] Package manager detection

### 5.2 Development Server
- [ ] Hot reload for UI changes
- [ ] Auto-rebuild on server changes
- [ ] Development proxy setup
- [ ] Mock host for local testing

### 5.3 Vite Plugin
- [ ] Auto-bundle UI to single HTML
- [ ] Development mode with HMR
- [ ] Production build optimization
- [ ] Source map generation

### 5.4 Error Messages
- [ ] Clear error messages for type mismatches
- [ ] Helpful hints for common mistakes
- [ ] Protocol-specific error handling
- [ ] Debug mode with verbose logging

## Phase 6: Testing and Documentation

### 6.1 Unit Tests
- [ ] Type system tests
- [ ] Schema conversion tests
- [ ] Protocol adapter tests
- [ ] Client adapter tests
- [ ] Hook tests

### 6.2 Integration Tests
- [ ] End-to-end with MCP Apps host
- [ ] End-to-end with ChatGPT host
- [ ] Cross-platform consistency tests

### 6.3 Example Applications
- [ ] Restaurant finder (full example)
- [ ] Data dashboard
- [ ] File upload (ChatGPT-specific)
- [ ] Multi-page app

### 6.4 Documentation
- [ ] Getting started guide
- [ ] API reference
- [ ] Migration guides (from raw SDK)
- [ ] Best practices
- [ ] Troubleshooting guide

## Phase 7: Advanced Features

### 7.1 Authentication
- [ ] OAuth 2.1 configuration
- [ ] Protected resource metadata generation
- [ ] Token verification middleware
- [ ] Scope-based tool protection

### 7.2 State Persistence
- [ ] Cross-session state API
- [ ] Encryption for sensitive state
- [ ] State migration utilities

### 7.3 Performance
- [ ] Response caching
- [ ] Lazy tool registration
- [ ] Bundle size optimization
- [ ] Tree-shaking support

### 7.4 Monitoring
- [ ] Request logging
- [ ] Error tracking integration
- [ ] Performance metrics
- [ ] Usage analytics

## Open Questions

### Type Safety
1. How to handle runtime schema validation vs compile-time types?
2. Should we validate output against schema or trust handler?
3. How to handle `_meta` in type system (always `unknown`)?

### State Management
1. Should we provide state migration utilities?
2. How to handle state size limits (ChatGPT: 4k tokens)?
3. Should state be encrypted by default?

### Authentication
1. Abstract OAuth or let users configure per-platform?
2. How to handle token refresh in long-running sessions?
3. Should we provide auth middleware?

### CSP
1. How to handle ChatGPT-specific CSP fields (`redirect_domains`, `frame_domains`)?
2. Should we validate CSP at build time?
3. How to handle CSP violations gracefully?

### Deployment
1. Should we provide deployment recipes for common platforms?
2. How to handle secrets in serverless environments?
3. Should we provide a hosted option?

## Implementation Order

**Recommended order for MVP:**

1. **Week 1-2**: Phase 1 (Core Foundation)
   - Project setup, type system, `createApp()` shell

2. **Week 3-4**: Phase 2 (Server Adapters)
   - MCP Apps adapter, ChatGPT adapter, basic server

3. **Week 5-6**: Phase 3 (UI Client SDK)
   - Protocol detection, both adapters, unified interface

4. **Week 7**: Phase 4.1-4.2 (React Core)
   - Provider, core hooks

5. **Week 8**: Phase 6.3-6.4 (Examples & Docs)
   - Restaurant finder example, basic docs

**Post-MVP:**
- CLI tool
- Dev server improvements
- Advanced features
- Additional framework bindings (Vue, Svelte)

## Dependencies

### Runtime
- `zod` - Schema definition and validation
- `@modelcontextprotocol/sdk` - MCP server implementation
- `express` - HTTP server (optional)

### UI Runtime
- `@modelcontextprotocol/ext-apps` - MCP Apps client (bundled)
- `react` - React bindings (peer dependency)

### Build
- `tsup` or `vite` - Library bundling
- `vite-plugin-singlefile` - Single HTML bundling
- `typescript` - Type checking

### Development
- `vitest` - Testing
- `eslint` - Linting
- `prettier` - Formatting
- `changesets` - Versioning

## File Structure

```
mcp-apps-kit/
├── packages/
│   ├── core/                    # @mcp-apps-kit/core
│   │   ├── src/
│   │   │   ├── index.ts         # Public exports
│   │   │   ├── createApp.ts     # Main entry point
│   │   │   ├── types/
│   │   │   │   ├── tools.ts
│   │   │   │   ├── ui.ts
│   │   │   │   └── config.ts
│   │   │   ├── adapters/
│   │   │   │   ├── mcp.ts
│   │   │   │   └── openai.ts
│   │   │   ├── server/
│   │   │   │   ├── express.ts
│   │   │   │   └── serverless.ts
│   │   │   └── utils/
│   │   │       ├── schema.ts
│   │   │       └── metadata.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ui/                      # @mcp-apps-kit/ui
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts
│   │   │   ├── adapters/
│   │   │   │   ├── mcp.ts
│   │   │   │   └── openai.ts
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── ui-react/                # @mcp-apps-kit/ui-react
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── context.tsx
│   │   │   ├── hooks.ts
│   │   │   └── components.tsx
│   │   └── package.json
│   │
│   └── create-app/              # @mcp-apps-kit/create-app
│       ├── src/
│       │   ├── cli.ts
│       │   └── templates/
│       └── package.json
│
├── examples/
│   ├── restaurant-finder/
│   ├── data-dashboard/
│   └── file-upload/
│
├── docs/
│   ├── DESIGN.md
│   ├── PROTOCOL-COMPARISON.md
│   ├── API-REFERENCE.md
│   └── TODO.md
│
├── package.json                 # Workspace root
├── pnpm-workspace.yaml
├── tsconfig.json               # Base TypeScript config
└── README.md
```
