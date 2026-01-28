# MCP Primitives Panel - Progress Tracker

**Feature:** Tools/Resources/Prompts inspection panel
**Branch:** `feat/mcp-primitives-panel`
**Started:** 2026-01-28 15:37 CET

---

## Status: 🟡 In Progress

| Task                                       | Status | Agent               |
| ------------------------------------------ | ------ | ------------------- |
| 1. Create branch + worktree                | ✅     | -                   |
| 2. Backend: Add `/mcp/primitives` endpoint | ✅     | mcp-endpoint        |
| 3. Types: MCP primitives TypeScript types  | ✅     | mcp-types           |
| 4. Hook: `useMcpPrimitives`                | ✅     | mcp-hook            |
| 5. Component: `McpPrimitivesPanel.tsx`     | ✅     | mcp-panel-component |
| 6. Layout: Update `InspectorDashboard.tsx` | 🟡     | mcp-layout          |
| 7. Tests                                   | ⏳     | -                   |
| 8. Review                                  | ⏳     | -                   |
| 9. Merge                                   | ⏳     | -                   |

---

## Spec

### Behavior

- **No UI session:** Panel in center stage
- **UI session active:** Panel moves to left sidebar (collapsible)

### Data Source

- MCP Client methods: `list_tools()`, `list_resources()`, `list_prompts()`

### UI Requirements

- Tabs: Tools | Resources | Prompts
- Each primitive shows:
  - Name, description
  - Input schema (rendered, not raw JSON)
  - Output info where applicable
  - Metadata fields
- JSON copy button for full schema
- View-only (no invocation)

---

## Files to Create/Modify

**New:**

- `src/dashboard/react/components/McpPrimitivesPanel.tsx`
- `src/dashboard/react/components/PrimitiveCard.tsx`
- `src/dashboard/react/hooks/useMcpPrimitives.ts`
- `src/dashboard/react/types/mcp-primitives.ts`

**Modify:**

- `src/dashboard/dashboard-server.ts` (add endpoint)
- `src/dashboard/react/InspectorDashboard.tsx` (layout)
- `src/dashboard/react/styles.ts` (new panel styles)
