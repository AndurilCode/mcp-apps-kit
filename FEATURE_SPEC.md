# Feature Spec: Human Mode for MCP Inspector Dashboard

## Overview

Add a Human/Agent mode toggle to the Inspector dashboard. Currently the dashboard is agent-only (MCP tools drive everything, UI is screencast). Human mode lets users directly execute tools, resources, and prompts through the dashboard UI, interact with widget iframes live, and seamlessly hand off to agent mode.

## Requirements

### Mode Toggle

- Global toggle button in the dashboard header (top-right area)
- Two states: "Human" and "Agent"
- Default: Agent mode (backward compatible)
- Toggle is live — can switch at any time without losing session state
- State persists across connection tabs (global, not per-connection)

### Agent Mode (existing behavior, unchanged)

- MCP tools control everything
- Widget renders as screencast (CDP screenshot stream)
- Agent logs visible
- All panels work as-is

### Human Mode

#### Tool/Resource/Prompt Execution

- New dedicated panel layout (not added to existing McpPrimitivesPanel — separate component)
- User browses tools, resources, prompts from the connected MCP server
- For tools: input form generated from JSON schema → Execute button → result display
- For resources: browse/list → read → display content
- For prompts: fill arguments → render → display messages
- Logs panel only visible when a UI widget test is active (tool has widget)
- Agent logs panel hidden in human mode

#### Widget Interaction

- When a tool has a UI widget, the widget renders as a **real interactive iframe** (not screencast)
- User can click, type, interact directly with the widget
- All DOM events, logs, and session data are still captured (same as agent mode)
- When switching to Agent mode:
  - The iframe gets overlaid with a screencast layer (no resize, no quality change)
  - A **glowing animated border** appears around the screencast to indicate "view-only"
  - The overlay must be seamless — no visible size/quality transition

#### Mode Switch Behavior

- **Human → Agent**: Widget iframe overlaid with screencast + glow border. MCP tools start working.
- **Agent → Human**: Screencast overlay removed, iframe becomes interactive again. MCP tool calls start failing.
- When in Human mode and an agent calls an MCP tool, the call returns an error:
  `"Inspector is in Human mode. Tool calls are unavailable until the user switches to Agent mode."`
- The agent can request a force-switch via a special MCP mechanism, but this must show an **approval dialog** in the dashboard UI ("Agent X wants to take control — Allow / Deny")
- Session state (logs, events, globals, call history) is fully preserved across switches

### Conditional Panel Visibility

- "Logs" panel: only visible when there is an active UI widget test (both modes)
- "Agent Logs" panel: only visible in Agent mode
- When no widget, logs panel should not occupy space

## Architecture Notes

### Key Files (current state)

- `InspectorDashboard.tsx` (610 lines) — main layout, connection state caching, tab management
- `AgentPanel.tsx` (96 lines) — agent event stream display
- `McpPrimitivesPanel.tsx` (859 lines) — tools/resources/prompts list (agent-facing)
- `Toolbar.tsx` (135 lines) — top toolbar
- `dashboard-server.ts` (832 lines) — backend HTTP API
- `useScreencast.ts` (129 lines) — CDP screenshot streaming hook

### New Components Needed

- `ModeToggle.tsx` — Human/Agent toggle button in header
- `HumanPanel.tsx` — tool/resource/prompt execution UI for human mode
- `ToolExecutor.tsx` — form from JSON schema, execute, display result
- `ResourceBrowser.tsx` — list + read resources
- `PromptRunner.tsx` — fill args, render prompt
- `WidgetOverlay.tsx` — screencast overlay with glowing border for agent mode
- `AgentTakeoverDialog.tsx` — approval modal for agent force-switch

### State Management

- New global `inspectorMode: "human" | "agent"` state
- Mode state should live in InspectorDashboard.tsx (or a context provider)
- Widget session must stay alive across mode switches
- Backend needs to check mode and reject tool calls in human mode

### Backend Changes

- `dashboard-server.ts`: Add mode state endpoint (GET/PUT /dashboard/mode)
- Tool execution endpoints: check mode, return error in human mode
- New endpoint or MCP tool for agent takeover request
- Widget session management: keep iframe session alive, toggle screencast overlay

## Acceptance Criteria

- [ ] Toggle button visible in header, defaults to Agent
- [ ] Switching modes preserves all session state (logs, events, globals)
- [ ] In Human mode: user can list tools, fill inputs, execute, see results
- [ ] In Human mode: user can list/read resources
- [ ] In Human mode: user can fill/render prompts
- [ ] In Human mode: widget renders as interactive iframe (not screencast)
- [ ] In Human mode: MCP tool calls from agents fail with clear error message
- [ ] In Human mode: agent can request takeover → approval dialog shown
- [ ] Switching to Agent mode: iframe overlaid with screencast + glowing border
- [ ] Switching back to Human: overlay removed, iframe interactive again
- [ ] Logs panel hidden when no widget test active
- [ ] Agent logs hidden in Human mode
- [ ] No visible resize/quality change on mode switch
