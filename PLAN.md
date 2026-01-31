# Implementation Plan: Human Mode for MCP Inspector Dashboard

## Architecture Decisions

### 1. Mode State Location

**Decision:** New React context `InspectorModeContext` wrapping the dashboard, synchronized with a backend endpoint.

**Rationale:** Mode is truly global (affects toolbar, main display, bottom panel, and all tool calls on the backend). A context avoids prop-drilling through every component. The backend must also know the mode (to reject agent tool calls in human mode), so mode is dual-tracked: frontend context + backend endpoint.

**State shape:**

```ts
interface InspectorModeState {
  mode: "human" | "agent";
  setMode: (mode: "human" | "agent") => void;
  takeoverRequest: TakeoverRequest | null; // pending agent takeover
  respondToTakeover: (allow: boolean) => void;
}

interface TakeoverRequest {
  id: string;
  agentId?: string;
  reason?: string;
  timestamp: number;
}
```

### 2. Component Hierarchy Changes

```
InspectorDashboard (existing)
├── InspectorModeProvider (NEW - wraps entire dashboard)
│   ├── header
│   │   ├── ... (existing)
│   │   ├── ModeToggle (NEW - in headerRight, before Toolbar)
│   │   └── Toolbar (modified - receives mode for conditional visibility)
│   ├── TabBar (unchanged)
│   ├── contentWrapper
│   │   ├── McpPrimitivesPanel (existing, agent-mode left panel, read-only)
│   │   ├── centerColumn
│   │   │   ├── main
│   │   │   │   ├── [Agent mode + session] → ScreencastDisplay (existing <img>)
│   │   │   │   ├── [Human mode + session] → WidgetIframe (NEW - live iframe)
│   │   │   │   │   └── ScreencastOverlay (NEW - when switching agent→human, overlay removed)
│   │   │   │   ├── [Human mode + no session] → HumanPanel (NEW)
│   │   │   │   │   ├── ToolExecutor (NEW)
│   │   │   │   │   ├── ResourceBrowser (NEW)
│   │   │   │   │   └── PromptRunner (NEW)
│   │   │   │   └── [Agent mode + no session] → McpPrimitivesPanel (existing, center)
│   │   │   └── BottomPanel (modified - conditional visibility based on mode)
│   │   └── GlobalsPanel (unchanged)
│   └── AgentTakeoverDialog (NEW - modal overlay)
```

### 3. Data Flow for Mode Switches

```
User clicks toggle → setMode("human")
  ├── PUT /dashboard/mode { mode: "human" }  (backend stores mode)
  ├── Context updates → all consumers re-render
  ├── Widget display: screencast SSE stream paused, iframe becomes interactive
  ├── BottomPanel: agent tab hidden
  └── Future agent tool calls → backend checks mode → returns error

User clicks toggle → setMode("agent")
  ├── PUT /dashboard/mode { mode: "agent" }
  ├── Context updates → all consumers re-render
  ├── Widget display: screencast overlay appears on iframe + glow border
  ├── BottomPanel: agent tab shown
  └── Agent tool calls resume normally
```

### 4. Widget Session Continuity

**Critical constraint:** Widget session (Playwright page + iframe) must stay alive across mode switches. No page reload, no session recreation.

**Approach:**

- The Playwright page always exists. In agent mode, CDP screencast captures it. In human mode, the actual iframe URL is embedded directly.
- The `useScreencast` hook is conditionally active (only in agent mode, or when overlay is needed).
- A new `useWidgetIframe` hook fetches the widget's host URL from the session so the iframe can be rendered directly.

### 5. Backend Tool Blocking

**Approach:** In `dashboard-server.ts`, store a `mode` variable. Add middleware in the tool handler pipeline (in `call-tool.ts` and all widget-control tools) that checks mode before executing. This is cleaner than a generic HTTP middleware since only MCP tool calls need blocking.

---

## Implementation Phases

### Phase 1: Foundation — Mode State & Toggle UI

_No dependencies. Must complete before all other phases._

#### Task 1.1: Backend mode state endpoint [P]

**File:** `packages/inspector/src/dashboard/dashboard-server.ts`
**Complexity:** Low
**Changes:**

- Add module-level `let dashboardMode: "human" | "agent" = "agent";` variable
- Add `GET /dashboard/mode` endpoint → returns `{ mode: dashboardMode }`
- Add `PUT /dashboard/mode` endpoint → accepts `{ mode: "human" | "agent" }`, validates, stores, returns `{ mode }`
- Add CORS headers on both endpoints (copy pattern from existing endpoints)

#### Task 1.2: InspectorModeContext & Provider [P]

**File (new):** `packages/inspector/src/dashboard/react/contexts/InspectorModeContext.tsx`
**Complexity:** Medium
**Changes:**

- Create `InspectorModeContext` with `createContext`
- Create `InspectorModeProvider` component:
  - State: `mode`, `takeoverRequest`
  - On mount: `GET /dashboard/mode` to sync initial state
  - `setMode(newMode)` → `PUT /dashboard/mode` then update local state
  - `respondToTakeover(allow)` → if allow, calls `setMode("agent")` + clears request; else just clears request
- Create `useInspectorMode()` convenience hook
- Export from a new `contexts/index.ts`

#### Task 1.3: ModeToggle component [P]

**File (new):** `packages/inspector/src/dashboard/react/components/ModeToggle.tsx`
**Complexity:** Low
**Changes:**

- Pill-shaped toggle with "Human" / "Agent" labels
- Reads from `useInspectorMode()`
- On click: calls `setMode()` to flip the state
- Visual: teal accent for active side, smooth transition animation
- Styles inline (following existing pattern — all components use inline styles or local `localStyles` objects)

#### Task 1.4: Wire ModeToggle into InspectorDashboard

**File:** `packages/inspector/src/dashboard/react/InspectorDashboard.tsx`
**Complexity:** Low
**Changes:**

- Wrap the entire return JSX with `<InspectorModeProvider baseUrl={baseUrl}>`
- Add `<ModeToggle />` in the `headerRight` div, before the `<Toolbar>` component
- No other changes in this task — just wiring

---

### Phase 2: Agent Tool Blocking in Human Mode

_Depends on Phase 1 (Task 1.1 for backend mode state)_

#### Task 2.1: Mode-aware tool call guard

**File:** `packages/inspector/src/dashboard/dashboard-server.ts`
**Complexity:** Low
**Changes:**

- Export a `getDashboardMode()` function that returns the current mode
- This will be imported by tool handlers

#### Task 2.2: Block agent tool calls in human mode

**File:** `packages/inspector/src/tools/call-tool.ts`
**Complexity:** Low
**Changes:**

- Import `getDashboardMode` from dashboard-server
- At the top of the handler (before `client.callTool`), check:
  ```ts
  if (getDashboardMode() === "human") {
    return {
      content: [
        {
          type: "text",
          text: "Inspector is in Human mode. Tool calls are unavailable until the user switches to Agent mode.",
        },
      ],
      isError: true,
      error: { code: "HUMAN_MODE", message: "Inspector is in Human mode..." },
      duration: 0,
    };
  }
  ```

#### Task 2.3: Block widget-control tools in human mode [P]

**Files:** `packages/inspector/src/tools/widget-control.ts`, `widget-snapshot.ts`, `widget-query.ts`, `widget-snapshot-diff.ts`, `screenshot-widget.ts`, `test-widget-interaction.ts`
**Complexity:** Low (repetitive pattern)
**Changes:**

- Add same mode check at the top of each handler
- Consider extracting a shared `assertAgentMode()` helper into `helpers.ts` to avoid duplication:
  ```ts
  export function assertAgentMode(): { blocked: true; result: CallToolOutput } | { blocked: false } {
    if (getDashboardMode() === "human") {
      return { blocked: true, result: { content: [...], isError: true, ... } };
    }
    return { blocked: false };
  }
  ```

---

### Phase 3: Widget Display Modes (Iframe vs Screencast)

_Depends on Phase 1. Most complex phase._

#### Task 3.1: Backend endpoint to get widget iframe URL

**File:** `packages/inspector/src/dashboard/dashboard-server.ts`
**Complexity:** Medium
**Changes:**

- Add `GET /dashboard/widget-url?sessionId={id}&connectionId={id}` endpoint
- Looks up the session via `sessionManager.getSession(sessionId)`
- Returns `{ url: session.page.url() }` — this is the Playwright page URL that hosts the widget
- The frontend will use this URL to render the iframe directly

**Why needed:** The frontend currently only gets screencast frames (images). To render the live iframe, it needs the actual widget URL served by the WidgetServer.

#### Task 3.2: useWidgetUrl hook

**File (new):** `packages/inspector/src/dashboard/react/hooks/useWidgetUrl.ts`
**Complexity:** Low
**Changes:**

- `useWidgetUrl(baseUrl, sessionId, connectionId)` → fetches `GET /dashboard/widget-url`
- Returns `{ url: string | null, isLoading: boolean, error: string | null }`
- Refreshes when sessionId changes
- Export from `hooks/index.ts`

#### Task 3.3: WidgetDisplay component (replaces inline screencast `<img>`)

**File (new):** `packages/inspector/src/dashboard/react/components/WidgetDisplay.tsx`
**Complexity:** High
**Changes:**

- This is the central display component that switches between modes:
  - **Agent mode:** Renders `<img>` with screencast data (existing behavior) + animated glow border
  - **Human mode:** Renders `<iframe>` pointing to widget URL (interactive)
- **Structure:**

  ```tsx
  function WidgetDisplay({ sessionId, connectionId, baseUrl, screencastAspectStyle }) {
    const { mode } = useInspectorMode();
    const { imageData, status } = useScreencast(baseUrl, sessionId, connectionId);
    const { url: widgetUrl } = useWidgetUrl(baseUrl, sessionId, connectionId);

    return (
      <div className="widget-display-container" style={containerStyle}>
        {/* Always render iframe (keeps session alive) */}
        {widgetUrl && (
          <iframe
            src={widgetUrl}
            style={{
              ...iframeStyle,
              pointerEvents: mode === "human" ? "auto" : "none",
              // In agent mode, iframe is behind the overlay
            }}
          />
        )}

        {/* Screencast overlay (agent mode only) */}
        {mode === "agent" && (
          <div style={overlayContainerStyle}>
            <img src={imageData} style={screencastImgStyle} />
            <div style={glowBorderStyle} /> {/* animated glow */}
          </div>
        )}
      </div>
    );
  }
  ```

- **Glow border:** CSS animation using `box-shadow` or `outline` with pulsing keyframes. Define in `keyframes.css` (already exists) or inject via `<style>`.
- **Critical:** The iframe must NOT unmount when switching modes (would kill session). Use CSS `pointerEvents: "none"` + overlay to "disable" it visually in agent mode.

#### Task 3.4: Glow border animation

**File:** `packages/inspector/src/dashboard/react/keyframes.css`
**Complexity:** Low
**Changes:**

- Add `@keyframes glowPulse` animation:
  ```css
  @keyframes glowPulse {
    0%,
    100% {
      box-shadow: 0 0 8px 2px rgba(32, 178, 170, 0.4);
    }
    50% {
      box-shadow: 0 0 16px 4px rgba(32, 178, 170, 0.7);
    }
  }
  ```
- The `WidgetDisplay` component applies this via inline style `animation: "glowPulse 2s ease-in-out infinite"`

#### Task 3.5: Wire WidgetDisplay into InspectorDashboard

**File:** `packages/inspector/src/dashboard/react/InspectorDashboard.tsx`
**Complexity:** Medium
**Changes:**

- Replace the inline `<div style={displayContainer}><img ...></div>` block in the `main` area with `<WidgetDisplay>`
- Pass through `sessionId`, `connectionId`, `baseUrl`, `screencastAspectStyle`
- Remove the direct `useScreencast` call from `InspectorDashboard` (it moves into `WidgetDisplay`)
- Update the `hasActiveSession` computation — now derives from sessionId existence (not imageData, since in human mode there may be no screencast)
- Keep connection caching logic intact — cache the widget URL alongside screencast data

---

### Phase 4: Human Execution Panel

_Depends on Phase 1. Can be parallelized with Phase 3._

#### Task 4.1: Backend tool execution endpoint for human mode

**File:** `packages/inspector/src/dashboard/dashboard-server.ts`
**Complexity:** Medium
**Changes:**

- Add `POST /dashboard/execute-tool` endpoint:
  - Body: `{ connectionId, toolName, arguments }`
  - Uses `connectionManager.getClient().callTool(toolName, arguments)`
  - Returns `{ content, isError, duration }`
  - Only works when mode is "human" (return 403 otherwise — prevents agents from bypassing MCP tool block via HTTP)
- Add `POST /dashboard/read-resource` endpoint:
  - Body: `{ connectionId, uri }`
  - Uses `connectionManager.readTargetResource(uri)`
  - Returns `{ content }`
- Add `POST /dashboard/get-prompt` endpoint:
  - Body: `{ connectionId, promptName, arguments }`
  - Uses `connectionManager.getClient().getPrompt(promptName, arguments)`
  - Returns `{ messages }`

#### Task 4.2: useToolExecutor hook [P]

**File (new):** `packages/inspector/src/dashboard/react/hooks/useToolExecutor.ts`
**Complexity:** Low
**Changes:**

- `useToolExecutor(baseUrl, connectionId)` hook
- Returns `{ execute(toolName, args): Promise<ToolResult>, isExecuting, lastResult, error }`
- Calls `POST /dashboard/execute-tool`

#### Task 4.3: useResourceReader hook [P]

**File (new):** `packages/inspector/src/dashboard/react/hooks/useResourceReader.ts`
**Complexity:** Low
**Changes:**

- `useResourceReader(baseUrl, connectionId)` hook
- Returns `{ read(uri): Promise<ResourceContent>, isReading, lastContent, error }`
- Calls `POST /dashboard/read-resource`

#### Task 4.4: usePromptRunner hook [P]

**File (new):** `packages/inspector/src/dashboard/react/hooks/usePromptRunner.ts`
**Complexity:** Low
**Changes:**

- `usePromptRunner(baseUrl, connectionId)` hook
- Returns `{ run(name, args): Promise<PromptResult>, isRunning, lastResult, error }`
- Calls `POST /dashboard/get-prompt`

#### Task 4.5: ToolExecutor component

**File (new):** `packages/inspector/src/dashboard/react/components/ToolExecutor.tsx`
**Complexity:** High
**Changes:**

- Receives `tool: McpTool` as prop (the selected tool to execute)
- Dynamically generates input form from `tool.inputSchema`:
  - `string` → `<input type="text">`
  - `number` → `<input type="number">`
  - `boolean` → `<input type="checkbox">`
  - `enum` → `<select>`
  - `object` → JSON textarea (fallback for complex nested types)
  - `array` → JSON textarea (fallback)
- "Execute" button → calls `useToolExecutor.execute(tool.name, formValues)`
- Result display area: renders content blocks (text, images, errors)
- Loading spinner during execution
- Error display with error code badge
- Uses `localStyles` pattern (same as `McpPrimitivesPanel`)

#### Task 4.6: ResourceBrowser component

**File (new):** `packages/inspector/src/dashboard/react/components/ResourceBrowser.tsx`
**Complexity:** Medium
**Changes:**

- Receives `resources: McpResource[]` list
- Renders resource cards (similar to existing `ResourceCard` but with a "Read" button)
- On click "Read" → calls `useResourceReader.read(resource.uri)`
- Displays content in a formatted viewer (text/JSON/code block depending on mimeType)

#### Task 4.7: PromptRunner component

**File (new):** `packages/inspector/src/dashboard/react/components/PromptRunner.tsx`
**Complexity:** Medium
**Changes:**

- Receives `prompt: McpPrompt` (selected prompt)
- Generates input fields from `prompt.arguments`
- "Run" button → calls `usePromptRunner.run(prompt.name, argValues)`
- Renders result messages in a chat-like format (role + content)

#### Task 4.8: HumanPanel component (orchestrator)

**File (new):** `packages/inspector/src/dashboard/react/components/HumanPanel.tsx`
**Complexity:** Medium
**Changes:**

- Container with tabbed interface: Tools | Resources | Prompts (similar to McpPrimitivesPanel tabs)
- **Tools tab:** Left: tool list (clickable cards). Right: `ToolExecutor` for selected tool.
- **Resources tab:** `ResourceBrowser` with list + read view
- **Prompts tab:** Left: prompt list. Right: `PromptRunner` for selected prompt.
- Uses `useMcpPrimitives` data (already fetched by parent)
- Distinct from `McpPrimitivesPanel` — this is interactive/executable, not just display

#### Task 4.9: Wire HumanPanel into InspectorDashboard

**File:** `packages/inspector/src/dashboard/react/InspectorDashboard.tsx`
**Complexity:** Low
**Changes:**

- In the `main` area where `McpPrimitivesPanel` renders for "no session" case:
  - If `mode === "human"` → render `<HumanPanel>`
  - If `mode === "agent"` → render `<McpPrimitivesPanel>` (existing)
- When there IS an active session in human mode: HumanPanel shows in the left panel position (replacing McpPrimitivesPanel)

---

### Phase 5: Conditional Panel Visibility

_Depends on Phase 1. Can be partially parallelized with Phases 3-4._

#### Task 5.1: Hide "Agent" tab in BottomPanel during human mode

**File:** `packages/inspector/src/dashboard/react/components/BottomPanel.tsx`
**Complexity:** Low
**Changes:**

- Import `useInspectorMode`
- When `mode === "human"`:
  - Don't render the "Agent" toggle button
  - Don't render the AgentPanel
  - Force `panelVisibility.agent = false` in rendered output
- When switching back to agent, visibility restores from persisted state

#### Task 5.2: Logs panel conditional visibility (widget test active)

**File:** `packages/inspector/src/dashboard/react/components/BottomPanel.tsx`  
**File:** `packages/inspector/src/dashboard/react/InspectorDashboard.tsx`
**Complexity:** Low
**Changes:**

- The spec says "Logs panel only visible when there is an active UI widget test (both modes)"
- `InspectorDashboard` already computes `hasActiveSession`
- Pass `hasActiveSession` to `BottomPanel`
- In `BottomPanel`: when `!hasActiveSession`, hide the "Logs" toggle button and force `panelVisibility.logs = false`
- Note: "Agent Logs" (agent panel) hidden only in human mode (Task 5.1). Regular "Logs" hidden when no widget.

---

### Phase 6: Agent Takeover System

_Depends on Phase 1 & 2._

#### Task 6.1: Backend takeover request endpoint & SSE channel

**File:** `packages/inspector/src/dashboard/dashboard-server.ts`
**Complexity:** Medium
**Changes:**

- Add `POST /dashboard/takeover-request` endpoint:
  - Body: `{ agentId?: string, reason?: string }`
  - Only valid when mode is "human"
  - Generates a request ID, stores it as pending
  - Returns `{ requestId, status: "pending" }`
- Add `PUT /dashboard/takeover-response` endpoint:
  - Body: `{ requestId, allow: boolean }`
  - If `allow`: set mode to "agent", clear pending request
  - If deny: clear pending request, no mode change
  - Returns `{ mode, requestId }`
- Add SSE channel `GET /dashboard/takeover-stream`:
  - Emits `takeover-request` events when a new request arrives
  - Emits `takeover-response` events when resolved
  - Used by the frontend to show the dialog in real-time

#### Task 6.2: MCP tool for agent takeover request

**File (new):** `packages/inspector/src/tools/request-takeover.ts`
**Complexity:** Low  
**Changes:**

- New `request_takeover` tool:
  - Input: `{ reason?: string }`
  - Calls `POST /dashboard/takeover-request` internally (or directly accesses the mode store)
  - Returns `{ requestId, status: "pending" | "approved" | "denied" }`
  - Optionally waits with a timeout for the user response (polling the backend)
- Register in `tools/index.ts`

#### Task 6.3: useTakeoverStream hook

**File (new):** `packages/inspector/src/dashboard/react/hooks/useTakeoverStream.ts`
**Complexity:** Low
**Changes:**

- Connects to `GET /dashboard/takeover-stream` SSE endpoint
- Returns `{ pendingRequest: TakeoverRequest | null }`
- Used by `InspectorModeProvider` to surface requests to the dialog

#### Task 6.4: AgentTakeoverDialog component

**File (new):** `packages/inspector/src/dashboard/react/components/AgentTakeoverDialog.tsx`
**Complexity:** Medium
**Changes:**

- Modal overlay (full-screen dimmed backdrop)
- Content: "Agent wants to take control" + reason (if provided)
- Two buttons: "Allow" (calls `respondToTakeover(true)`) and "Deny" (calls `respondToTakeover(false)`)
- Auto-dismiss after response
- Styled consistently with dashboard dark theme
- Rendered in `InspectorDashboard` at root level (above all other content)

#### Task 6.5: Wire takeover into InspectorModeProvider

**File:** `packages/inspector/src/dashboard/react/contexts/InspectorModeContext.tsx`
**Complexity:** Low
**Changes:**

- Integrate `useTakeoverStream` into the provider
- Expose `takeoverRequest` and `respondToTakeover` on the context
- `respondToTakeover(allow)` → `PUT /dashboard/takeover-response` + clear local state + optionally `setMode("agent")`

---

### Phase 7: Integration & Polish

_Depends on all prior phases._

#### Task 7.1: Widget session rendering in human mode (create session from HumanPanel)

**File:** `packages/inspector/src/dashboard/dashboard-server.ts`, `HumanPanel.tsx`
**Complexity:** Medium
**Changes:**

- When a user executes a tool with a UI widget in human mode via `POST /dashboard/execute-tool`:
  - Detect that the tool has UI metadata (same logic as `call-tool.ts`)
  - Create the widget session (page + iframe) using `UIHostManager.renderInBrowser()`
  - Register with `WidgetSessionManager`
  - Return `sessionId` in the response
- `HumanPanel` / `ToolExecutor`: when a sessionId is returned, the parent `InspectorDashboard` automatically picks it up (session appears in `useSessions` poll)

#### Task 7.2: Seamless mode transition (no resize/quality change)

**File:** `packages/inspector/src/dashboard/react/components/WidgetDisplay.tsx`
**Complexity:** Medium  
**Changes:**

- Ensure iframe and screencast overlay have identical dimensions
- The iframe renders at the same viewport size as the CDP screencast captures
- On transition: no CSS transitions on size, only on overlay opacity
- Screencast overlay fades in (opacity 0→1, ~200ms) when switching to agent mode
- Glow border animates in after overlay is visible

#### Task 7.3: Preserve session state across switches (verification)

**Complexity:** Low
**Changes:**

- Verify that switching modes does not:
  - Clear `logs`, `events`, `agentEvents`, `globals` state
  - Unmount/remount the widget iframe
  - Restart SSE streams (they should only disconnect/reconnect for screencast)
- Add specific handling in `InspectorDashboard` if any data is being lost on re-render

#### Task 7.4: Update hooks/index.ts exports [P]

**File:** `packages/inspector/src/dashboard/react/hooks/index.ts`
**Complexity:** Trivial
**Changes:**

- Export `useWidgetUrl`, `useToolExecutor`, `useResourceReader`, `usePromptRunner`, `useTakeoverStream`

#### Task 7.5: Update tools/index.ts exports [P]

**File:** `packages/inspector/src/tools/index.ts`  
**Complexity:** Trivial
**Changes:**

- Export `createRequestTakeoverTool`

---

## File Summary

### New Files

| File                                 | Phase | Description                                 |
| ------------------------------------ | ----- | ------------------------------------------- |
| `contexts/InspectorModeContext.tsx`  | 1     | Mode state context + provider               |
| `contexts/index.ts`                  | 1     | Context exports                             |
| `components/ModeToggle.tsx`          | 1     | Human/Agent toggle button                   |
| `components/WidgetDisplay.tsx`       | 3     | Iframe + screencast overlay display         |
| `components/HumanPanel.tsx`          | 4     | Tool/resource/prompt execution orchestrator |
| `components/ToolExecutor.tsx`        | 4     | JSON schema form → execute → result display |
| `components/ResourceBrowser.tsx`     | 4     | Resource list + read viewer                 |
| `components/PromptRunner.tsx`        | 4     | Prompt argument form + message display      |
| `components/AgentTakeoverDialog.tsx` | 6     | Approval modal for agent takeover           |
| `hooks/useWidgetUrl.ts`              | 3     | Fetch widget iframe URL                     |
| `hooks/useToolExecutor.ts`           | 4     | Execute tool via HTTP                       |
| `hooks/useResourceReader.ts`         | 4     | Read resource via HTTP                      |
| `hooks/usePromptRunner.ts`           | 4     | Run prompt via HTTP                         |
| `hooks/useTakeoverStream.ts`         | 6     | SSE stream for takeover requests            |
| `tools/request-takeover.ts`          | 6     | MCP tool for agent takeover                 |

_All paths relative to `packages/inspector/src/dashboard/react/` unless noted._

### Modified Files

| File                               | Phases     | Changes                                                         |
| ---------------------------------- | ---------- | --------------------------------------------------------------- |
| `dashboard-server.ts`              | 1, 3, 4, 6 | Mode endpoints, widget-url, execute-tool, takeover              |
| `InspectorDashboard.tsx`           | 1, 3, 4, 5 | Provider wrapper, WidgetDisplay, HumanPanel, conditional panels |
| `BottomPanel.tsx`                  | 5          | Mode-aware panel visibility                                     |
| `Toolbar.tsx`                      | 1          | Accommodates ModeToggle (minor spacing)                         |
| `keyframes.css`                    | 3          | Glow pulse animation                                            |
| `hooks/index.ts`                   | 7          | New exports                                                     |
| `tools/index.ts`                   | 7          | New export                                                      |
| `tools/call-tool.ts`               | 2          | Mode guard                                                      |
| `tools/helpers.ts`                 | 2          | Shared `assertAgentMode()` helper                               |
| `tools/widget-control.ts`          | 2          | Mode guard                                                      |
| `tools/widget-snapshot.ts`         | 2          | Mode guard                                                      |
| `tools/widget-query.ts`            | 2          | Mode guard                                                      |
| `tools/widget-snapshot-diff.ts`    | 2          | Mode guard                                                      |
| `tools/screenshot-widget.ts`       | 2          | Mode guard                                                      |
| `tools/test-widget-interaction.ts` | 2          | Mode guard                                                      |

---

## Risk Areas & Edge Cases

### High Risk

1. **Widget iframe URL exposure:** The WidgetServer runs on a dynamic port. The iframe URL (`http://localhost:{port}/host/{sessionId}`) must be accessible from the browser. This should work since the dashboard and widget server are on the same host, but **verify CORS headers** on the WidgetServer allow embedding.

2. **Screencast ↔ iframe size mismatch:** The CDP screencast captures at the Playwright viewport dimensions. The iframe must render at the same size. If the dashboard resizes, the iframe resizes naturally but the screencast stream continues at the old dimensions until the next frame. **Mitigation:** On mode switch to agent, briefly pause to wait for a fresh screencast frame before showing the overlay.

3. **Session state during rapid mode switches:** If user toggles rapidly (human→agent→human in <1s), SSE streams may not settle. **Mitigation:** Debounce mode switches (300ms minimum between transitions).

### Medium Risk

4. **Agent takeover race condition:** An agent could send a tool call right as the user switches to agent mode. The backend mode check and the mode switch are not atomic. **Mitigation:** Use a simple lock or version counter. Accept that edge-case timing may result in a single stale error (agent can retry).

5. **HumanPanel form generation from arbitrary JSON schemas:** Real-world tool schemas can be deeply nested with `$ref`, `oneOf`, `allOf`, `anyOf` etc. **Mitigation:** For Phase 4, support flat schemas (string, number, boolean, enum, simple arrays). Complex schemas fall back to a raw JSON textarea. Document this limitation.

6. **Multiple concurrent sessions:** The widget display currently shows one session (selected via dropdown). In human mode, a tool execution creates a new session. Ensure the session selector correctly reflects the new session and the iframe switches to it.

### Low Risk

7. **localStorage conflicts:** Mode state is NOT persisted to localStorage (it resets to "agent" on page load, per the spec "Default: Agent mode"). The toggle state is ephemeral. But `panelVisibility` IS persisted, so hiding the agent panel in human mode must not persist that hidden state as the user's preference.

8. **Backend mode state is global, not per-connection:** The spec says "global, not per-connection." This means one mode for all connection tabs. This is intentional but could confuse users with multiple connections. Accept as-designed.

---

## Parallelization Map

```
Phase 1: [1.1] [1.2] [1.3]  (all parallel)
          └── [1.4]  (depends on 1.1-1.3)

Phase 2: [2.1] (depends on 1.1)
          └── [2.2] [2.3]  (parallel, depend on 2.1)

Phase 3: [3.1] [3.4]  (parallel, depend on P1)
          └── [3.2]  (depends on 3.1)
          └── [3.3]  (depends on 3.2, 3.4)
          └── [3.5]  (depends on 3.3)

Phase 4: [4.1]  (depends on P1)
          └── [4.2] [4.3] [4.4]  (parallel, depend on 4.1)
          └── [4.5] [4.6] [4.7]  (parallel, depend on 4.2/4.3/4.4 respectively)
          └── [4.8]  (depends on 4.5-4.7)
          └── [4.9]  (depends on 4.8)

Phase 5: [5.1] [5.2]  (parallel, depend on P1)

Phase 6: [6.1]  (depends on P1, P2)
          └── [6.2] [6.3]  (parallel, depend on 6.1)
          └── [6.4]  (depends on 6.3)
          └── [6.5]  (depends on 6.3, 6.4)

Phase 7: [7.1] [7.4] [7.5]  (parallel)
          └── [7.2] [7.3]  (parallel, integration testing)
```

**Maximum parallelism:** After Phase 1 completes, Phases 2, 3, 4, and 5 can all proceed in parallel. Phase 6 can start once Phases 1 and 2 are done. Phase 7 is final integration.

---

## Complexity Estimates

| Task | Complexity | Lines (est.) | Notes                               |
| ---- | ---------- | ------------ | ----------------------------------- |
| 1.1  | Low        | ~40          | Two simple endpoints                |
| 1.2  | Medium     | ~80          | Context + provider + sync logic     |
| 1.3  | Low        | ~60          | Styled toggle button                |
| 1.4  | Low        | ~10          | Import + wrap + place               |
| 2.1  | Low        | ~5           | Export function                     |
| 2.2  | Low        | ~15          | Early return guard                  |
| 2.3  | Low        | ~50          | Helper + 6 files updated            |
| 3.1  | Medium     | ~30          | New endpoint + session lookup       |
| 3.2  | Low        | ~40          | Fetch hook                          |
| 3.3  | High       | ~150         | Dual-mode display, overlay, glow    |
| 3.4  | Low        | ~10          | CSS keyframes                       |
| 3.5  | Medium     | ~50          | Refactor main area rendering        |
| 4.1  | Medium     | ~100         | Three new endpoints + validation    |
| 4.2  | Low        | ~40          | Fetch hook                          |
| 4.3  | Low        | ~40          | Fetch hook                          |
| 4.4  | Low        | ~40          | Fetch hook                          |
| 4.5  | High       | ~250         | Dynamic form generation from schema |
| 4.6  | Medium     | ~120         | List + read viewer                  |
| 4.7  | Medium     | ~100         | Form + message display              |
| 4.8  | Medium     | ~100         | Tab orchestrator                    |
| 4.9  | Low        | ~20          | Conditional rendering               |
| 5.1  | Low        | ~20          | Mode-aware visibility               |
| 5.2  | Low        | ~15          | Session-aware visibility            |
| 6.1  | Medium     | ~80          | Three endpoints + SSE               |
| 6.2  | Low        | ~60          | MCP tool definition                 |
| 6.3  | Low        | ~50          | SSE hook                            |
| 6.4  | Medium     | ~80          | Modal UI                            |
| 6.5  | Low        | ~15          | Wire into provider                  |
| 7.1  | Medium     | ~60          | Widget creation in human mode       |
| 7.2  | Medium     | ~30          | Sizing/transition polish            |
| 7.3  | Low        | ~10          | Verification, minor fixes           |
| 7.4  | Trivial    | ~10          | Exports                             |
| 7.5  | Trivial    | ~5           | Exports                             |

**Total estimated new/changed lines:** ~1,850
