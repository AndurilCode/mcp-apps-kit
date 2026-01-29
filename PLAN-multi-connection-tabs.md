# Plan: Multi-Connection + Multi-Tab

## Summary

Refactor the inspector to support multiple simultaneous MCP server connections, each displayed as a browser-like tab in the dashboard.

## Branch

`feat/multi-connection-tabs` (from `main`)

## Design Decisions (agreed with Gabe)

### Connections

- Auto-generated connection ID, returned on `connect()`
- Connections persist until explicitly closed (agent tool or dashboard tab close)
- Max 20 connections (configurable via CLI `--maxConnections`)
- All MCP methods (`call_tool`, `list_tools`, `list_resources`, `call_tool`, `get_prompt`, `read_resource`) take optional `connectionId` — defaults to last used/connected
- New `list_connections` tool to list all active connections
- Full isolation between connections (widget sessions, events, history, state)

### Dashboard

- Tab bar below header (Chrome-like)
- `+` button opens connection form (URL + transport)
- Closing tab = closing connection
- Connection URLs remembered between sessions (localStorage)
- Each tab = full current dashboard (screencast, logs, events, primitives panel) for that connection
- User can switch tabs freely

---

## Phase 1: ConnectionRegistry (backend)

### New file: `src/connection-registry.ts`

```typescript
class ConnectionRegistry {
  private connections: Map<string, ConnectionManager>;
  private activeConnectionId: string | null;
  private maxConnections: number;

  // Create new connection → returns auto-generated ID
  createConnection(url: string, options?: ConnectOptions): Promise<string>;

  // Get connection by ID (throws if not found)
  getConnection(id: string): ConnectionManager;

  // Get active connection (last used/connected)
  getActiveConnection(): ConnectionManager;

  // Resolve: explicit ID > active > throw
  resolveConnection(connectionId?: string): ConnectionManager;

  // Close + remove a connection
  closeConnection(id: string): Promise<void>;

  // List all connections with status
  listConnections(): ConnectionInfo[];

  // Track which was last used
  setActive(id: string): void;

  // Close all
  closeAll(): Promise<void>;
}
```

### Changes to `ConnectionManager`

- Minimal changes — stays as single-connection manager
- Add `id` field set on construction
- Remove "force reconnect" logic (registry handles multiple)

### Changes to `standalone-server.ts` / `dual-server.ts`

- Replace `connectionManager: ConnectionManager` with `registry: ConnectionRegistry`
- Pass registry to tool factories instead of single connection

---

## Phase 2: Tool Updates (backend)

### All existing MCP tools

Add optional `connectionId` to input schema:

```typescript
connectionId: z.string().optional().describe("Connection ID. Defaults to the active connection.");
```

**Affected tools (connection-scoped):**

- `connect_to_server` → creates new connection, returns `{ connectionId, ... }`
- `disconnect` → takes optional `connectionId`, defaults to active
- `call_tool` → add `connectionId`
- `list_tools` → add `connectionId`
- `list_resources` → add `connectionId`
- `read_resource` → add `connectionId`
- `list_prompts` → add `connectionId`
- `get_prompt` → add `connectionId`
- `history` / `clear_history` → add `connectionId`
- `status` → add `connectionId` (or show all if omitted)

**New tool:**

- `list_connections` → returns all connections with ID, URL, server info, status

**Widget/UI tools (need both connectionId + sessionId):**

- `call_tool` (when `renderWidget: true`)
- `screenshot_widget`, `widget_control`, `widget_query`, `widget_snapshot`, etc.
- `session_management` (list/close sessions for a connection)
- These already take `sessionId`; the session is scoped to a connection

### Tool factory pattern change

```typescript
// Before:
createCallToolTool(connectionManager: ConnectionManager)

// After:
createCallToolTool(registry: ConnectionRegistry)
```

Each tool handler resolves connection via `registry.resolveConnection(input.connectionId)`.

---

## Phase 3: Dashboard Tabs (frontend React)

### Tab bar component

- Sits below the connection bar / header
- Each tab shows: connection name/URL + close (×) button
- `+` button at the end
- Active tab highlighted
- Clicking tab switches view

### Per-tab state

Each tab maintains its own:

- SSE streams (screencast, logs, events)
- Session list
- Selected session
- MCP primitives panel state

### Connection memory

- Store recent connection URLs in localStorage
- Show as suggestions when creating new tab

### Dashboard server changes (`dashboard-server.ts`)

- SSE endpoints already take `sessionId` — need to also support `connectionId` for connection-scoped streams
- Add endpoint: `GET /dashboard/connections` — list all connections
- Add endpoint: `POST /dashboard/connections` — create connection from dashboard
- Add endpoint: `DELETE /dashboard/connections/:id` — close connection from dashboard
- Existing session endpoints scope to connection

---

## Implementation Order

1. `ConnectionRegistry` class + tests
2. Wire registry into `standalone-server.ts` / `dual-server.ts`
3. Update all tool factories to use registry
4. Add `connectionId` to tool schemas + resolve logic
5. New `list_connections` tool
6. Dashboard REST endpoints for connections
7. Dashboard React: tab bar component
8. Dashboard React: per-tab isolation (state management)
9. Dashboard React: connection memory (localStorage)
10. CLI flag `--maxConnections`
11. Integration tests

---

## Files to Change

**New files:**

- `src/connection-registry.ts`
- `src/tools/list-connections.ts`
- `tests/connection-registry.test.ts`
- `tests/multi-connection.test.ts`

**Major changes:**

- `src/connection.ts` — add `id` field
- `src/standalone-server.ts` — use registry
- `src/dual-server.ts` — use registry
- `src/dashboard/dashboard-server.ts` — connection endpoints + scoped SSE
- `src/dashboard/react/InspectorDashboard.tsx` — tab bar + multi-tab state
- `src/dashboard/react/components/ConnectionBar.tsx` — tab integration
- `src/tools/index.ts` — pass registry to all tool factories
- `src/tools/connect.ts` — create new connection (not replace)
- `src/tools/disconnect.ts` — close specific connection
- `src/bin/mcp-inspector.ts` — `--maxConnections` CLI flag
- `src/index.ts` — export registry

**Minor changes (add connectionId param):**

- All files in `src/tools/*.ts`
