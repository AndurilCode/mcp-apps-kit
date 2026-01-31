# Dashboard Layout V2 — Spec

## Current Layout

```
┌─────────────────────────────────────────────────────┐
│ Header (logo, status, toolbar buttons)              │
├─────────────────────────────────────────────────────┤
│ TabBar (connection tabs)                            │
├──────────┬──────────────────────┬───────────────────┤
│ Left:    │ Center:              │ Right:            │
│ MCP      │ Screencast / MCP     │ Globals Panel     │
│ Prims    │ (when no session)    │                   │
│          ├──────────────────────┤                   │
│          │ Bottom Panel:        │                   │
│          │ Logs|Events|Agent    │                   │
│          │ (side by side)       │                   │
└──────────┴──────────────────────┴───────────────────┘
```

## Target Layout

```
┌─────────────────────────────────────────────────────┐
│ Header (logo, status, toolbar buttons)              │
├─────────────────────────────────────────────────────┤
│ TabBar (connection tabs)                            │
├──────────┬──────────────────────┬───────────────────┤
│ Left:    │ Center:              │ Right:            │
│ MCP      │ Screencast           │ [Agent|Events|    │
│ Prims    │ — OR —               │  Logs] tabs       │
│ (no      │ Tamagotchi           │ (one at a time)   │
│  title)  │ placeholder          │ Default: Agent    │
│          ├──────────────────────┤                   │
│          │ Globals bar           │                   │
│          │ (only if UI visible, │                   │
│          │  collapsible)        │                   │
└──────────┴──────────────────────┴───────────────────┘
```

## Changes Required

### 1. Right Panel — Tabbed Events/Logs/Agent

**Move** the current BottomPanel content (Logs, Events, Agent) into a **right sidebar panel**.

- Tabs at top: `Agent` | `Events` | `Logs` — only **one visible at a time** (radio-style tabs, not toggles)
- Default active tab: **Agent**
- The entire right panel is **collapsible** (like the current left panel)
- Persist active tab to localStorage
- Tab style: match existing tab styling pattern (teal active, muted inactive)
- Show counts in tabs: `Agent (5)`, `Events (12)`, `Logs (3)`
- Include a "Clear" button in the panel header
- The panel should be resizable (like left panel uses `useResizablePanelWidth`)

### 2. Left Panel — MCP Primitives (Always Left, No Title)

- **Remove** the "MCP Primitives" title/header row from McpPrimitivesPanel when `position="left"`
- Keep the collapse button — move it somewhere sensible (e.g., top of tabs row)
- **Always render on the left**, whether or not there's an active session
  - Currently: when no session, MCP Primitives renders in the center. Remove that center variant.
  - The left panel should always be there (collapsed or not)
- Keep existing resizable behavior

### 3. Globals/Environment Bar — Below Center Stage

- **Move** GlobalsPanel from right sidebar to a **horizontal bar below the screencast area**
- Only visible when a **UI widget is active** (screencast is streaming)
- **Collapsible** — toggle from within the center stage frame (small toggle button at bottom edge of screencast)
- When collapsed: just a thin bar or button to re-expand
- Horizontal layout: key-value pairs flowing left-to-right
- Persist collapsed state to localStorage

### 4. No-UI Placeholder — Animated Tamagotchi Star

When no active widget/screencast, show a placeholder in the center area instead of the screencast:

- **Animated star character** (Sirius ⭐) with eyes and mouth — tamagotchi style
- CSS animation: gentle floating/bobbing, blinking eyes
- Below the star: message text **"No active widget yet — ask your agent to test"**
- Muted colors, subtle animation (not distracting)
- The star should be an SVG with simple face features (two dot eyes, small smile)

### 5. Toolbar Button Updates

- Remove the current bottom-panel toggle button (LogsIcon) from Toolbar — bottom panel no longer exists
- Remove the globals toggle button (GlobalsIcon) from Toolbar — globals is now part of center stage
- Keep the primitives toggle (PrimitivesIcon) for the left panel
- Add a **right panel toggle** (new icon — could reuse GlobalsIcon rotated, or a new sidebar-right icon)
- Update Toolbar props accordingly

### 6. Remove Bottom Panel

- The BottomPanel component itself can be kept but is no longer used as a bottom panel
- Its content (LogsPanel, EventsPanel, AgentPanel) moves into the new RightPanel component
- Remove the resize handle between center and bottom
- Remove `useResizablePanel` usage for bottom panel height

## File Impact

- `InspectorDashboard.tsx` — Major restructure of layout
- `components/Toolbar.tsx` — Update button set
- `components/McpPrimitivesPanel.tsx` — Remove header when position="left"
- `components/GlobalsPanel.tsx` — Rework to horizontal bar layout
- `components/BottomPanel.tsx` — Refactor into RightPanel or deprecate
- **NEW** `components/RightPanel.tsx` — Tabbed sidebar (Agent/Events/Logs)
- **NEW** `components/NoWidgetPlaceholder.tsx` — Tamagotchi star animation
- `styles.ts` — New/updated styles

## Style Notes

- All existing color scheme stays (#0d0e0e backgrounds, #2d2f2f borders, #20b2aa teal accents)
- Tab styling matches existing pattern in McpPrimitivesPanel
- Smooth transitions on collapse/expand (existing 0.25s ease pattern)
- Star SVG should use teal (#20b2aa) as accent color
