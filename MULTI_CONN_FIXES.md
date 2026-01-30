# Multi-Connection State Isolation Fixes

## Acceptance Criteria

### 1. True State Separation

- [ ] Each connection tab has its own sessions list, events, logs, and globals
- [ ] Data fetched for connection A is never shown in connection B's tab
- [ ] All dashboard API calls pass `connectionId` parameter
- [ ] All frontend hooks accept and use `connectionId`

### 2. State Persistence Across Tab Switches

- [ ] Switching from tab A to tab B and back to tab A does NOT refetch data — cached state is shown
- [ ] Cached state includes: sessions, events, primitives, globals, screencast frame
- [ ] Only stale data (or first load) triggers a fetch
- [ ] Closing a tab clears its cached state

### 3. Logs/Events/Agent Properly Isolated

- [ ] SSE event stream (`/dashboard/events`) is scoped to `connectionId`
- [ ] SSE log stream (`/dashboard/logs`) is scoped to `connectionId`
- [ ] Agent event stream (`/dashboard/agent-events`) is scoped to `connectionId` ✅ (fixed by Gabe)
- [ ] Switching tabs disconnects old SSE and connects new one for that connection
- [ ] Events from connection A never appear in connection B's event panel

### 4. Screencast Per-Tab Session

- [ ] CDP screencast stream is tied to a specific connection's UI session
- [ ] Each tab's screencast shows that connection's widget render, not a shared one
- [ ] Switching tabs switches the screencast to the active connection's session
- [ ] No screencast shown when connection has no active UI session

## What's Already Fixed (Gabe's commit 1bb2d52)

- `connectionId` param on `/mcp/primitives`, `/dashboard/globals`, `/dashboard/agent-events`
- `resolveConnectionManager()` helper in dashboard-server
- Frontend hooks: `useMcpPrimitives`, `useGlobals`, `useAgentEventStream` accept `connectionId`
- TabBar renders with 0 connections (+ button always visible)
- Globals deep-merge with defaults
- Dashboard HTML path resolution
- Graceful shutdown double-SIGINT handling

## What Still Needs Work

- `/dashboard/events` and `/dashboard/logs` not yet connection-scoped
- `/dashboard/sessions` not yet connection-scoped
- No client-side state caching (every tab switch refetches)
- Screencast (`/dashboard/stream`) not connection-scoped
- No per-connection session tracking in frontend
