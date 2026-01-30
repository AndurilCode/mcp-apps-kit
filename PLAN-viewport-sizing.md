# Viewport Sizing — Implementation Plan (v2)

## Summary

Align viewport/sizing behavior with the MCP Apps spec (SEP-1865) and OpenAI Apps SDK.
Two-layer approach: host templates behave like real hosts (spec-aligned iframe sizing),
while Playwright viewport tracks actual visible content for accurate screencast capture.

---

## Architecture: Two-Layer Sizing

### Layer 1: Host Template (Spec-Aligned)

The iframe inside the Playwright host page behaves exactly like a real host:

- **Inline**: iframe width = fixed (800px desktop / 375px mobile), height = content-driven up to maxHeight
- **Fullscreen**: iframe fills the viewport (both dimensions fixed)
- Widget sends `size-changed` / `openai:resize` → host template resizes iframe CSS

### Layer 2: Playwright Viewport (Screencast Capture)

Playwright viewport tracks the actual visible content area:

- When widget resizes → host template calls `/update-environment` with new iframe dimensions
- Inspector resizes Playwright viewport to match → screencast captures exactly what's visible
- No empty space, accurate aspect ratio

### Dashboard Display

- Reads viewport from `/globals` → computes `aspect-ratio` for screencast container
- Inline: aspect ratio changes dynamically (800 × current content height)
- Fullscreen: fixed ratio (1280 × 800)
- Fullscreen screencast: scale-to-fit the central stage
- Drag resize: changes display area, NOT widget viewport

---

## Decisions

1. Host template presets are authoritative (kill conflicting `environment-types.ts` presets)
2. Canonical inline width: 800px desktop, 375px mobile (fixed)
3. Inline height: dynamic, driven by widget content, clamped to maxHeight
4. Fullscreen: both dimensions fixed from presets
5. maxHeight is part of globals, modifiable via `set_globals`
6. `containerDimensions` sent to widget per spec: `{ width: 800, maxHeight: 600 }` for inline
7. Dashboard reads viewport from `/globals` for screencast aspect ratio
8. Drag resize in dashboard changes display area, not viewport

---

## Current vs Desired: Host Template Behavior

### OpenAI Host

| Aspect                         | Current                              | Desired                                                                          |
| ------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------- |
| `openai:resize` handler (L664) | Logs height, stores in `__hostState` | Also resizes iframe CSS + calls `/update-environment` (debounced)                |
| Iframe sizing                  | `width: 100%; height: 100%`          | Inline: `width: 800px; height: auto; max-height: 600px`. Fullscreen: `100%/100%` |
| `requestDisplayMode`           | Changes `DISPLAY_MODE_SIZES` presets | Also updates iframe CSS + viewport via `/update-environment`                     |

### MCP Host

| Aspect                                   | Current                     | Desired                                                                                         |
| ---------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| `sizeChanged` handler                    | Not implemented             | Add handler: resize iframe CSS + call `/update-environment` (debounced)                         |
| `containerDimensions` in `ui/initialize` | Not sent                    | Send `{ width: 800, maxHeight: 600 }` for inline, `{ width: 1280, height: 800 }` for fullscreen |
| Iframe sizing                            | `width: 100%; height: 100%` | Same as OpenAI: inline has fixed width + dynamic height                                         |

### Environment Types

| Aspect                        | Current                             | Desired                                                    |
| ----------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `DISPLAY_MODE_SIZES` (L33-43) | 400×300 inline, 1024×768 fullscreen | 800×600 inline, 1280×800 fullscreen (match host templates) |

### Session Renderer

| Aspect         | Current                                                       | Desired                                                                                                     |
| -------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Viewport logic | Always uses `environmentState.viewport` or fallback to preset | Inline: fixed width from preset, height from env state (clamped to maxHeight). Fullscreen: both from preset |

### Dashboard

| Aspect               | Current               | Desired                                      |
| -------------------- | --------------------- | -------------------------------------------- |
| Screencast container | No aspect ratio logic | Compute `aspect-ratio` from globals viewport |
| Fullscreen           | Same as inline        | Scale-to-fit stage area                      |

---

## File Change Inventory

### Backend

| #   | File                         | Changes                                                                                                                                                                                                                        |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `environment-types.ts`       | Update `DISPLAY_MODE_SIZES` to match host template values                                                                                                                                                                      |
| 2   | `connection.ts`              | Add `maxHeight: 600` to default environment state                                                                                                                                                                              |
| 3   | `widget-server-templates.ts` | (a) OpenAI host: forward `openai:resize` to `/update-environment`, update iframe CSS; (b) MCP host: add `sizeChanged` handler, send `containerDimensions` in init; (c) Both: inline iframe gets fixed width + `max-height` CSS |
| 4   | `session-renderer.ts`        | Inline/fullscreen viewport logic: inline = fixed width + dynamic height; fullscreen = both fixed                                                                                                                               |
| 5   | `widget-session-manager.ts`  | Sync with session-renderer or consolidate duplicate logic                                                                                                                                                                      |
| 6   | `standalone-server.ts`       | Clamp viewport height to maxHeight in `/update-environment`                                                                                                                                                                    |
| 7   | `dual-server.ts`             | Same maxHeight clamping                                                                                                                                                                                                        |

### Frontend (Dashboard)

| #   | File                     | Changes                                                                  |
| --- | ------------------------ | ------------------------------------------------------------------------ |
| 8   | `InspectorDashboard.tsx` | Compute screencast container `aspect-ratio` from globals viewport        |
| 9   | `styles.ts`              | Remove hardcoded height on streaming container, let aspect-ratio control |
| 10  | `useGlobals.ts`          | Add `maxHeight` to `GlobalsState` defaults                               |

### Cleanup

| #   | File              | Changes                   |
| --- | ----------------- | ------------------------- |
| 11  | `cdp-streamer.ts` | Fix stale preset comments |

---

## Ordered Task List

### Phase 1: Canonical Presets [P — all parallel]

#### Task 1.1: Update `environment-types.ts` presets

**File:** `packages/inspector/src/types/environment-types.ts` L33-43

Update `DISPLAY_MODE_SIZES`:

```typescript
desktop: {
  inline: { width: 800, height: 600, maxHeight: 600 },
  fullscreen: { width: 1280, height: 800, maxHeight: null },
  pip: { width: 320, height: 240, maxHeight: 320 },
},
mobile: {
  inline: { width: 375, height: 400, maxHeight: 400 },
  fullscreen: { width: 375, height: 667, maxHeight: null },
  pip: { width: 280, height: 210, maxHeight: 280 },
},
```

**Acceptance:** Values match host template presets. Existing tests updated.

#### Task 1.2: Add maxHeight to default environment state

**File:** `packages/inspector/src/connection.ts` L141-153

Add `maxHeight: 600` to `getDefaultEnvironmentState()`.

**Acceptance:** `connectionManager.getEnvironmentState().maxHeight` returns 600. `/globals` includes it.

#### Task 1.3: Fix CDP streamer comments

**File:** `packages/inspector/src/dashboard/cdp-streamer.ts` L56-63

Update comments to reference correct preset values.

---

### Phase 2: Host Template Spec Alignment [Depends on Phase 1]

#### Task 2.1: OpenAI host — spec-aligned iframe sizing + resize forwarding

**File:** `packages/inspector/src/widget-server-templates.ts`

Changes to `generateOpenAIHostPage`:

1. **Iframe CSS**: Inline mode gets `width: 800px; max-height: 600px; height: auto;` instead of `100%/100%`. Fullscreen stays `100%/100%`.
2. **`openai:resize` handler** (L664): Add debounced (100ms) fetch to `/update-environment` with new height. Also imperatively set iframe height CSS.
3. **Guard against feedback loop**: Skip `/update-environment` if height unchanged.

**Acceptance:**

- Widget calls `notifyIntrinsicHeight(450)` → iframe height becomes 450px → Playwright viewport becomes 800×450
- Rapid resizes debounced to one call
- Fullscreen mode ignores resize (100%/100%)

#### Task 2.2: MCP host — spec-aligned containerDimensions + sizeChanged handler

**File:** `packages/inspector/src/widget-server-templates.ts`

Changes to `generateMcpHostPage`:

1. **containerDimensions**: Send `{ width: 800, maxHeight: 600 }` for inline, `{ width: 1280, height: 800 }` for fullscreen in `ui/initialize` response hostContext.
2. **Iframe CSS**: Same as OpenAI — inline gets fixed width + max-height.
3. **`ui/notifications/size-changed` handler**: Debounced (100ms) fetch to `/update-environment`. Also set iframe height CSS.

**Acceptance:**

- MCP widget's ResizeObserver fires → iframe resizes → Playwright viewport updates
- `containerDimensions` present in hostContext for both inline and fullscreen
- Debounced, loop-safe

---

### Phase 3: Backend Viewport Logic [Depends on Phase 1]

#### Task 3.1: Clamp viewport height to maxHeight in /update-environment

**Files:** `standalone-server.ts` L629+, `dual-server.ts` L511+

After `updateEnvironmentFromGlobals`, before `updateSessionGlobals`:

- If inline mode and maxHeight set: clamp viewport height
- Fullscreen: no clamping (maxHeight is null)

**Acceptance:**

- Widget sends height 1200, maxHeight 600 → viewport height = 600
- Widget sends height 400, maxHeight 600 → viewport height = 400
- Fullscreen ignores maxHeight

#### Task 3.2: Inline vs fullscreen viewport logic in session-renderer

**File:** `packages/inspector/src/session/session-renderer.ts` L77-97

```typescript
if (displayMode === "fullscreen") {
  viewport = { width: modeSizing.width, height: modeSizing.height };
} else {
  // Inline/PiP: fixed width, dynamic height
  const envHeight = environmentState.viewport?.height ?? modeSizing.height;
  const maxH = environmentState.maxHeight ?? modeSizing.maxHeight;
  const clampedHeight = maxH != null ? Math.min(envHeight, maxH) : envHeight;
  viewport = { width: modeSizing.width, height: clampedHeight };
}
```

**Acceptance:**

- Inline: width always 800 (desktop), height from env state clamped to maxHeight
- Fullscreen: 1280×800 regardless of env state

#### Task 3.3: Sync widget-session-manager with session-renderer

**File:** `packages/inspector/src/widget-session-manager.ts` L332-374

Consolidate duplicate `updateSessionGlobals` logic, or apply same changes as 3.2.

---

### Phase 4: Dashboard Aspect Ratio [P — parallel with Phase 2/3]

#### Task 4.1: Screencast container aspect ratio from globals

**File:** `packages/inspector/src/dashboard/react/InspectorDashboard.tsx`

Compute dynamic `aspect-ratio` style from `globals.viewport`:

- Inline: `aspectRatio = viewport.width / viewport.height`, updates as content resizes
- Fullscreen: scale-to-fit stage area maintaining aspect ratio

**Acceptance:**

- 800×600 → 4:3 container
- 800×400 (after resize) → 2:1 container
- Fullscreen 1280×800 → 8:5, scales to fit stage

#### Task 4.2: Update styles for viewport-aware display

**File:** `packages/inspector/src/dashboard/react/styles.ts`

Remove hardcoded `height: "100%"` from `displayContainerStreaming`. Let `aspect-ratio` CSS property control dimensions.

#### Task 4.3: Add maxHeight to globals hook

**File:** `packages/inspector/src/dashboard/react/hooks/useGlobals.ts`

Add `maxHeight: 600` to `defaultGlobals`. No type change needed (already optional in interface).

---

## Dependency Graph

```
Phase 1 (Presets) ──────┬──→ Phase 2 (Host Templates)
   [P: 1.1, 1.2, 1.3]  │      [2.1, 2.2]
                         │
                         ├──→ Phase 3 (Backend Logic)
                         │      [3.1, 3.2, 3.3]
                         │
Phase 4 (Dashboard) ─────── (parallel, needs Phase 1 defaults only)
   [P: 4.1, 4.2, 4.3]
```

---

## Risk Areas

### 1. Resize Feedback Loop (HIGH)

Widget resizes → iframe CSS changes → ResizeObserver fires → widget sends size-changed → loop.
**Mitigation:** Debounce 100ms + guard: skip if height unchanged from last sent value.

### 2. First-Frame Timing (MEDIUM)

CDP screencast starts before widget sends first resize. Initial viewport may not match content.
**Mitigation:** Acceptable. Widget sends resize shortly after load. Dashboard updates within 2s (globals poll).

### 3. MCP containerDimensions Inline Width (LOW)

Spec says `{ width: N }` = fixed. Widget may ignore this and try to resize width.
**Mitigation:** We enforce fixed width in Playwright viewport regardless of widget request. Log warning if width differs.

### 4. PiP Mode (LOW)

Under-specified. Treat same as inline (fixed width, dynamic height from preset).

### 5. Globals Polling Lag (LOW)

Dashboard polls globals every 2s. Slight stale aspect ratio after resize.
**Mitigation:** Acceptable for v1. Screencast image itself already has correct aspect ratio.

---

## Test Strategy

### Unit Tests

- `environment-types.test.ts`: Assert new preset values
- `session-renderer.test.ts`: Inline uses fixed width + dynamic height; fullscreen uses both fixed

### Integration Tests

- **OpenAI resize flow**: Widget calls `notifyIntrinsicHeight(450)` → viewport = 800×450
- **MCP resize flow**: Widget sends `sizeChanged({width: 800, height: 350})` → viewport = 800×350
- **maxHeight clamping**: Set maxHeight 300, widget sends height 500 → viewport height = 300
- **Fullscreen fixed**: Switch to fullscreen → widget resize ignored → viewport stays 1280×800
- **containerDimensions**: MCP widget receives `{ width: 800, maxHeight: 600 }` in hostContext

### Manual Tests

- Dashboard screencast proportions match widget content
- Resize widget content → screencast container adapts
- Inline → fullscreen → screencast ratio changes
- `set_globals` changes maxHeight → widget height constrained
