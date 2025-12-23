# Feature Specification: Unified MCP Apps Builder SDK

**Feature Branch**: `001-unified-mcp-sdk`
**Created**: 2025-12-21
**Status**: Draft
**Input**: User description: "Implement the solution defined in docs/ - a TypeScript framework for building interactive MCP applications that work seamlessly with both Claude Desktop (MCP Apps) and ChatGPT (OpenAI Apps SDK) from a single codebase"

## Clarifications

### Session 2025-12-21

- Q: What is the persistence scope for `useWidgetState`? → A: Session-scoped on ChatGPT; silent no-op on MCP Apps (graceful degradation, no error thrown)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Define Tools with Type-Safe Schemas (Priority: P1)

As a developer, I want to define MCP tools using Zod schemas so that I get full TypeScript type inference for tool inputs, outputs, and handlers without manual type annotations.

**Why this priority**: This is the core value proposition - developers must be able to define tools with a simple, type-safe API before any other functionality matters.

**Independent Test**: Can be fully tested by creating a minimal app with one tool and verifying TypeScript correctly infers input/output types in the handler function.

**Acceptance Scenarios**:

1. **Given** a developer creates a tool with Zod input/output schemas, **When** they write the handler function, **Then** the `input` parameter is fully typed based on the Zod schema without manual type annotations
2. **Given** a developer defines tool output schema, **When** they return data from the handler, **Then** TypeScript validates the return value matches the output schema
3. **Given** a developer uses `z.object()` with nested structures, **When** they access nested properties in the handler, **Then** all nested types are correctly inferred

---

### User Story 2 - Start Server with Single Entry Point (Priority: P1)

As a developer, I want to call `createApp()` with my configuration and start a server with `app.start()` so that I can run my MCP app with minimal boilerplate.

**Why this priority**: Equal priority with tool definition - developers must be able to run their app immediately after defining it.

**Independent Test**: Can be fully tested by creating an app, calling `app.start({ port: 3000 })`, and verifying the server responds to MCP protocol requests.

**Acceptance Scenarios**:

1. **Given** a developer calls `createApp()` with tools and UI config, **When** they call `app.start()`, **Then** an HTTP server starts on the specified port
2. **Given** a running server, **When** a client sends a valid MCP tool call, **Then** the tool handler executes and returns results
3. **Given** a developer wants stdio transport, **When** they call `app.start({ transport: "stdio" })`, **Then** the server communicates via stdin/stdout

---

### User Story 3 - Platform-Agnostic UI Client (Priority: P2)

As a UI developer, I want to use a unified client SDK that automatically detects the host platform so that my UI code works identically on Claude Desktop and ChatGPT without conditional logic.

**Why this priority**: Essential for the "write once, run anywhere" value proposition, but requires server functionality first.

**Independent Test**: Can be tested by loading the same UI code in both MCP Apps host (simulated) and ChatGPT host (simulated) and verifying identical behavior.

**Acceptance Scenarios**:

1. **Given** UI code calls `createClient()`, **When** running in ChatGPT, **Then** the client automatically uses the OpenAI adapter without explicit configuration
2. **Given** UI code calls `createClient()`, **When** running in Claude Desktop, **Then** the client automatically uses the MCP Apps adapter
3. **Given** UI code calls `client.callTool("name", args)`, **When** executed on either platform, **Then** the tool call succeeds with the same input/output structure

---

### User Story 4 - React Hooks for UI Development (Priority: P2)

As a React developer, I want to use hooks like `useAppsClient()`, `useToolResult()`, and `useHostContext()` so that I can build reactive UIs that respond to tool results and host context changes.

**Why this priority**: React is the primary UI framework target; hooks provide the idiomatic React experience.

**Independent Test**: Can be tested by rendering a React component that uses hooks and verifying it correctly displays tool results and responds to context changes.

**Acceptance Scenarios**:

1. **Given** a React component uses `useToolResult<AppTools>()`, **When** a tool returns results, **Then** the component re-renders with typed access to the result data
2. **Given** a React component uses `useHostContext()`, **When** the host theme changes, **Then** the component receives the updated theme value
3. **Given** a React component uses `useAppsClient()`, **When** the component calls `client.callTool()`, **Then** TypeScript enforces correct tool name and argument types

---

### User Story 5 - Protocol Metadata Abstraction (Priority: P2)

As a developer, I want my tool and UI definitions to automatically generate the correct protocol-specific metadata so that I never manually write `_meta.ui.resourceUri` or `_meta["openai/outputTemplate"]`.

**Why this priority**: Core to the abstraction promise; developers should not see protocol details.

**Independent Test**: Can be tested by defining a tool with `ui: "widget"` and verifying the server generates correct metadata for both MCP Apps and ChatGPT protocols.

**Acceptance Scenarios**:

1. **Given** a tool definition with `ui: "main-widget"`, **When** the server registers the tool for MCP Apps, **Then** the metadata includes `_meta.ui.resourceUri` with the correct URI
2. **Given** the same tool definition, **When** the server registers the tool for ChatGPT, **Then** the metadata includes `_meta["openai/outputTemplate"]` with the correct URI
3. **Given** a tool with `visibility: "app"`, **When** registered for ChatGPT, **Then** metadata shows `"openai/visibility": "private"` and `"openai/widgetAccessible": true`

---

### User Story 6 - UI Resource Registration with CSP (Priority: P3)

As a developer, I want to define UI resources with CSP configuration so that my widgets can safely connect to external APIs and load external resources.

**Why this priority**: Important for real-world apps that need external data, but apps can function without external connections initially.

**Independent Test**: Can be tested by defining a UI resource with `csp.connectDomains` and verifying the generated metadata includes correct CSP for both protocols.

**Acceptance Scenarios**:

1. **Given** a UI definition with `csp: { connectDomains: ["https://api.example.com"] }`, **When** registered for MCP Apps, **Then** metadata includes `_meta.ui.csp.connectDomains`
2. **Given** the same UI definition, **When** registered for ChatGPT, **Then** metadata includes `_meta["openai/widgetCSP"].connect_domains`
3. **Given** a UI definition with `prefersBorder: true`, **When** registered for either protocol, **Then** the appropriate border preference metadata is generated

---

### User Story 7 - Flexible Deployment Options (Priority: P3)

As a developer, I want to deploy my app using Express middleware, raw MCP server, or serverless handlers so that I can integrate with my existing infrastructure.

**Why this priority**: Flexibility is important but most developers will use the default `app.start()` initially.

**Independent Test**: Can be tested by using `app.handler()` with a custom Express app and verifying MCP requests are handled correctly.

**Acceptance Scenarios**:

1. **Given** a developer wants custom Express middleware, **When** they use `app.handler()`, **Then** they receive Express-compatible middleware they can mount at any path
2. **Given** a developer wants the raw MCP server, **When** they call `app.getServer()`, **Then** they receive the underlying MCP server instance for custom transport setup
3. **Given** a serverless deployment, **When** requests come through `app.handleRequest()`, **Then** each request is handled correctly without persistent state assumptions

---

### User Story 8 - CLI Project Scaffolding (Priority: P4)

As a developer new to the SDK, I want to run a CLI command to scaffold a new project so that I can start building immediately with the correct structure.

**Why this priority**: Important for adoption but developers can manually create projects initially.

**Independent Test**: Can be tested by running `npx @mcp-apps-kit/create-app my-app` and verifying a working project is generated.

**Acceptance Scenarios**:

1. **Given** a developer runs the CLI with a project name, **When** scaffolding completes, **Then** a project with server, UI, and TypeScript configuration is created
2. **Given** the developer selects React template, **When** scaffolding completes, **Then** the UI includes React bindings and example components
3. **Given** the scaffolded project, **When** the developer runs `npm start`, **Then** the development server starts successfully

---

### Edge Cases

- What happens when a tool handler throws an error? System MUST return properly formatted error responses for both protocols.
- What happens when `createClient()` is called outside any host context? System MUST provide a mock adapter for development/testing.
- How does the system handle unsupported features on a platform? For critical features (e.g., file upload on MCP Apps), system MUST throw descriptive errors. For optional features (e.g., state persistence on MCP Apps), system MUST operate as silent no-op for graceful degradation.
- What happens when Zod validation fails at runtime? System MUST return user-friendly validation error messages, not raw Zod errors.
- What happens when a UI tries to call a tool that doesn't exist? System MUST return a clear error rather than undefined behavior.

## Requirements *(mandatory)*

### Functional Requirements

**Core Server Package (`@mcp-apps-kit/core`)**
- **FR-001**: System MUST provide a `createApp()` function that accepts tool definitions, UI resources, and configuration
- **FR-002**: System MUST validate tool input/output schemas using Zod at runtime
- **FR-003**: System MUST convert Zod schemas to JSON Schema for MCP protocol registration
- **FR-004**: System MUST generate protocol-specific metadata for both MCP Apps and ChatGPT Apps
- **FR-005**: System MUST support tool visibility options: "model", "app", and "both"
- **FR-006**: System MUST provide `app.start()` for built-in Express server with HTTP and stdio transports
- **FR-007**: System MUST provide `app.getServer()` to access the underlying MCP server instance
- **FR-008**: System MUST provide `app.handler()` for Express middleware integration
- **FR-009**: System MUST provide `app.handleRequest()` for serverless deployment
- **FR-010**: System MUST read UI HTML from file paths or accept inline HTML strings

**UI Client Package (`@mcp-apps-kit/ui`)**
- **FR-011**: System MUST provide a `createClient()` function that auto-detects the host platform
- **FR-012**: System MUST implement MCP Apps adapter wrapping `@modelcontextprotocol/ext-apps`
- **FR-013**: System MUST implement ChatGPT Apps adapter wrapping `window.openai`
- **FR-014**: System MUST provide unified `callTool()` method with type-safe generics
- **FR-015**: System MUST provide unified `sendMessage()` and `sendFollowUpMessage()` methods
- **FR-016**: System MUST provide unified `openLink()` and `requestDisplayMode()` methods
- **FR-017**: System MUST provide `getState()`/`setState()` that persists state within session on ChatGPT and operates as silent no-op on MCP Apps (graceful degradation)
- **FR-018**: System MUST provide event subscription methods: `onToolResult`, `onHostContextChange`, `onToolCancelled`, `onTeardown`
- **FR-019**: System MUST expose `hostContext` property with theme, displayMode, viewport, locale

**React Bindings Package (`@mcp-apps-kit/ui-react`)**
- **FR-020**: System MUST provide `AppsProvider` context provider component
- **FR-021**: System MUST provide `useAppsClient<T>()` hook for accessing the typed client
- **FR-022**: System MUST provide `useToolResult<T>()` hook for accessing typed tool results
- **FR-023**: System MUST provide `useToolInput()` hook for accessing current tool input
- **FR-024**: System MUST provide `useHostContext()` hook for accessing host context
- **FR-025**: System MUST provide `useWidgetState<S>()` hook for session-scoped state on ChatGPT (silent no-op on MCP Apps)
- **FR-026**: System MUST provide `useHostStyleVariables()` hook for applying CSS variables
- **FR-027**: System MUST provide `useDocumentTheme()` hook for applying theme classes

**CLI Package (`@mcp-apps-kit/create-app`)**
- **FR-028**: System MUST provide interactive project scaffolding with template selection
- **FR-029**: System MUST generate working TypeScript configuration
- **FR-030**: System MUST support React template with example components

**Type System**
- **FR-031**: System MUST provide `InferToolInputs<T>` and `InferToolOutputs<T>` type utilities
- **FR-032**: System MUST enable full TypeScript inference without explicit type annotations
- **FR-033**: System MUST allow additive properties in tool responses without breaking types

### Key Entities

- **App**: The main application instance created by `createApp()`, responsible for server lifecycle and protocol adaptation
- **Tool**: A server-side function with typed input/output schemas, description, visibility, and optional UI binding
- **UIResource**: An HTML-based UI component with CSP configuration and display preferences
- **AppsClient**: The client-side interface for UI code to interact with the host and server
- **HostContext**: Runtime context provided by the host including theme, locale, viewport, and platform info
- **ProtocolAdapter**: Internal abstraction that maps unified API to protocol-specific implementations

## Assumptions

- Developers are familiar with TypeScript and Zod for schema definition
- Target environments support Node.js 18+ for server-side code
- UI code runs in modern browsers with ES2020+ support
- MCP Apps uses `@modelcontextprotocol/ext-apps` SDK as the client library
- ChatGPT Apps injects `window.openai` global automatically
- CSP policies are enforced by the host platforms, not the SDK

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can create a working MCP app with typed tools in under 5 minutes using the CLI
- **SC-002**: Zero manual type annotations required for tool input/output typing
- **SC-003**: UI code works identically on both Claude Desktop and ChatGPT without platform-specific conditionals
- **SC-004**: SDK adds less than 50KB gzipped to the client bundle
- **SC-005**: All public APIs have 100% TypeScript coverage with strict mode enabled
- **SC-006**: Tool handler execution time overhead is less than 5ms compared to direct MCP SDK usage
- **SC-007**: Developers report 80%+ satisfaction rating in usability surveys
- **SC-008**: Documentation covers 100% of public API with working code examples
