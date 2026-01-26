# Plan: DOM Interaction Sync for External Widget Mirroring

## Summary

Enhance the sync system to capture DOM interactions (clicks, input, scroll, focus, etc.) from the external widget (ChatGPT) and replay them in the Playwright mirror. This achieves true 1:1 state synchronization, allowing agents to observe exactly what users are doing in real-time.

## Problem Statement

Currently, the sync system only handles high-level events:
- `globals` / `host-context-changed`
- `tool-input`, `tool-output`, `tool-result`
- `call-tool`, `call-tool-response`

**Unsynced state:**
- Form input values (text fields, checkboxes, selects)
- Click interactions (button presses, link clicks)
- Scroll position
- Focus state
- Keyboard input

This means the Playwright mirror diverges from the external widget whenever users interact with form elements or UI components that don't immediately trigger tool calls.

## Architecture

```
┌─────────────────────────────────────┐
│     External Widget (ChatGPT)       │
│  ┌───────────────────────────────┐  │
│  │  User Interaction             │  │
│  │  - clicks button              │  │
│  │  - types in input             │  │
│  │  - scrolls page               │  │
│  └──────────────┬────────────────┘  │
│                 │                   │
│  ┌──────────────▼────────────────┐  │
│  │  Enhanced Sync Script         │  │
│  │  - captures events            │  │
│  │  - extracts selector + data   │  │
│  │  - debounces high-freq events │  │
│  └──────────────┬────────────────┘  │
└─────────────────┼───────────────────┘
                  │ HTTP POST
                  ▼
┌─────────────────────────────────────┐
│  /sync-events endpoint              │
│  { type: "dom-click",               │
│    data: { selector, ... },         │
│    sessionId, protocol }            │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  WidgetSessionManager.syncEvent()   │
│  - routes to deliverDomEvent()      │
│  - applies to Playwright frame      │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│     Playwright Mirror               │
│  ┌───────────────────────────────┐  │
│  │  frame.click(selector)        │  │
│  │  frame.fill(selector, value)  │  │
│  │  frame.evaluate(scroll)       │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## New Sync Event Types

Add to `types.ts`:

```typescript
export type SyncEventType =
  // ... existing types ...
  // DOM Interaction Events (external → mirror)
  | "dom-click"
  | "dom-dblclick"
  | "dom-input"
  | "dom-change"
  | "dom-focus"
  | "dom-blur"
  | "dom-scroll"
  | "dom-keydown"
  | "dom-keyup"
  | "dom-select"
  | "dom-hover";
```

## Event Payload Structures

```typescript
// Click events
interface DomClickPayload {
  selector: string;           // CSS selector path to element
  x?: number;                 // Click position relative to element
  y?: number;
  button?: "left" | "right" | "middle";
}

// Input/Change events
interface DomInputPayload {
  selector: string;
  value: string;              // Current input value
  inputType?: string;         // "text", "checkbox", "radio", etc.
  checked?: boolean;          // For checkboxes/radios
}

// Scroll events
interface DomScrollPayload {
  selector?: string;          // Element selector (null = window)
  scrollTop: number;
  scrollLeft: number;
}

// Focus events
interface DomFocusPayload {
  selector: string;
}

// Keyboard events
interface DomKeyPayload {
  selector: string;
  key: string;                // Key value (e.g., "Enter", "a", "Escape")
  code: string;               // Physical key code
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  };
}

// Select (dropdown) events
interface DomSelectPayload {
  selector: string;
  value: string;              // Selected value
  values?: string[];          // For multi-select
}

// Hover events (optional, can be noisy)
interface DomHoverPayload {
  selector: string;
}
```

## Files to Create

### 1. `packages/inspector/src/sync/dom-event-types.ts`

Type definitions for DOM sync events:

```typescript
export interface DomClickPayload { ... }
export interface DomInputPayload { ... }
export interface DomScrollPayload { ... }
// etc.

export type DomEventPayload =
  | DomClickPayload
  | DomInputPayload
  | DomScrollPayload
  | DomFocusPayload
  | DomKeyPayload
  | DomSelectPayload;
```

### 2. `packages/inspector/src/sync/dom-sync-script.ts`

Script to be injected into external widgets. Generates the JavaScript string:

```typescript
export function generateDomSyncScript(inspectorUrl: string, sessionId?: string): string {
  return `
(function() {
  const INSPECTOR_URL = "${inspectorUrl}";
  const SESSION_ID = ${sessionId ? `"${sessionId}"` : "null"};

  // Debounce helper for high-frequency events
  function debounce(fn, ms) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), ms);
    };
  }

  // Generate unique selector for element
  function getSelector(el) {
    if (el.id) return "#" + el.id;
    if (el === document.body) return "body";

    const path = [];
    while (el && el !== document.body) {
      let selector = el.tagName.toLowerCase();
      if (el.className) {
        selector += "." + [...el.classList].join(".");
      }
      const siblings = el.parentNode?.querySelectorAll(selector) || [];
      if (siblings.length > 1) {
        const index = Array.from(siblings).indexOf(el);
        selector += ":nth-of-type(" + (index + 1) + ")";
      }
      path.unshift(selector);
      el = el.parentNode;
    }
    return "body > " + path.join(" > ");
  }

  // Send event to inspector
  function syncEvent(type, data) {
    fetch(INSPECTOR_URL + "/sync-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: type,
        data: data,
        sessionId: SESSION_ID,
        protocol: window.__WIDGET_PROTOCOL__ || "openai",
        timestamp: new Date().toISOString()
      })
    }).catch(() => {}); // Ignore errors
  }

  // Click handler
  document.addEventListener("click", (e) => {
    syncEvent("dom-click", {
      selector: getSelector(e.target),
      x: e.offsetX,
      y: e.offsetY,
      button: e.button === 0 ? "left" : e.button === 2 ? "right" : "middle"
    });
  }, true);

  // Input handler (debounced)
  document.addEventListener("input", debounce((e) => {
    const el = e.target;
    syncEvent("dom-input", {
      selector: getSelector(el),
      value: el.value || "",
      inputType: el.type || "text",
      checked: el.checked
    });
  }, 100), true);

  // Change handler (for selects, checkboxes on commit)
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.tagName === "SELECT") {
      syncEvent("dom-select", {
        selector: getSelector(el),
        value: el.value,
        values: [...el.selectedOptions].map(o => o.value)
      });
    } else {
      syncEvent("dom-change", {
        selector: getSelector(el),
        value: el.value || "",
        checked: el.checked
      });
    }
  }, true);

  // Scroll handler (debounced)
  const handleScroll = debounce((e) => {
    const el = e.target === document ? null : e.target;
    syncEvent("dom-scroll", {
      selector: el ? getSelector(el) : null,
      scrollTop: el ? el.scrollTop : window.scrollY,
      scrollLeft: el ? el.scrollLeft : window.scrollX
    });
  }, 50);
  document.addEventListener("scroll", handleScroll, true);

  // Focus handler
  document.addEventListener("focus", (e) => {
    syncEvent("dom-focus", { selector: getSelector(e.target) });
  }, true);

  // Blur handler
  document.addEventListener("blur", (e) => {
    syncEvent("dom-blur", { selector: getSelector(e.target) });
  }, true);

  // Keyboard handlers (optional - can be noisy)
  document.addEventListener("keydown", (e) => {
    // Only sync for special keys or when in input fields
    if (e.key.length > 1 || e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      syncEvent("dom-keydown", {
        selector: getSelector(e.target),
        key: e.key,
        code: e.code,
        modifiers: {
          ctrl: e.ctrlKey,
          alt: e.altKey,
          shift: e.shiftKey,
          meta: e.metaKey
        }
      });
    }
  }, true);

  console.log("[DOM Sync] Initialized");
})();
`;
}
```

## Files to Modify

### 3. `packages/inspector/src/types.ts`

Add new DOM event types to `SyncEventType`:

```typescript
export type SyncEventType =
  // ... existing ...
  // DOM Interaction Events
  | "dom-click"
  | "dom-dblclick"
  | "dom-input"
  | "dom-change"
  | "dom-focus"
  | "dom-blur"
  | "dom-scroll"
  | "dom-keydown"
  | "dom-keyup"
  | "dom-select"
  | "dom-hover";
```

### 4. `packages/inspector/src/widget-session-manager.ts`

Add DOM event handling to `syncEvent()` and new `deliverDomEvent()` method:

```typescript
async syncEvent(payload: SyncEventPayload): Promise<void> {
  const { type, data, sessionId, protocol } = payload;

  // Handle DOM events specially - apply to Playwright
  if (type.startsWith("dom-")) {
    await this.applyDomEvent(type, data, sessionId);
    return;
  }

  // ... existing event handling ...
}

private async applyDomEvent(
  type: SyncEventType,
  data: unknown,
  sessionId?: string
): Promise<void> {
  const sessions = sessionId
    ? [this.sessions.get(sessionId)].filter(Boolean)
    : Array.from(this.sessions.values());

  for (const session of sessions) {
    if (!session || session.page.isClosed()) continue;

    const frame = session.page.frame({ url: /\/widget\// });
    if (!frame) continue;

    try {
      switch (type) {
        case "dom-click": {
          const { selector, x, y } = data as DomClickPayload;
          await frame.click(selector, { position: x && y ? { x, y } : undefined });
          break;
        }

        case "dom-input": {
          const { selector, value } = data as DomInputPayload;
          // Use fill for text inputs, which clears and types
          await frame.fill(selector, value);
          break;
        }

        case "dom-change": {
          const { selector, value, checked } = data as DomInputPayload;
          if (checked !== undefined) {
            await frame.setChecked(selector, checked);
          } else {
            await frame.fill(selector, value);
          }
          break;
        }

        case "dom-select": {
          const { selector, value, values } = data as DomSelectPayload;
          await frame.selectOption(selector, values || value);
          break;
        }

        case "dom-scroll": {
          const { selector, scrollTop, scrollLeft } = data as DomScrollPayload;
          await frame.evaluate(({ sel, top, left }) => {
            const el = sel ? document.querySelector(sel) : window;
            if (el === window) {
              window.scrollTo(left, top);
            } else if (el) {
              (el as Element).scrollTop = top;
              (el as Element).scrollLeft = left;
            }
          }, { sel: selector, top: scrollTop, left: scrollLeft });
          break;
        }

        case "dom-focus": {
          const { selector } = data as DomFocusPayload;
          await frame.focus(selector);
          break;
        }

        case "dom-blur": {
          // Blur by focusing body
          await frame.evaluate(() => {
            (document.activeElement as HTMLElement)?.blur();
          });
          break;
        }

        case "dom-keydown": {
          const { selector, key, modifiers } = data as DomKeyPayload;
          const mods = [];
          if (modifiers?.ctrl) mods.push("Control");
          if (modifiers?.alt) mods.push("Alt");
          if (modifiers?.shift) mods.push("Shift");
          if (modifiers?.meta) mods.push("Meta");
          const keyCombo = [...mods, key].join("+");
          await frame.press(selector, keyCombo);
          break;
        }
      }

      if (this.debug) {
        console.log(`[WidgetSessionManager] Applied ${type} to session ${session.id}`);
      }
    } catch (error) {
      if (this.debug) {
        console.warn(`[WidgetSessionManager] Failed to apply ${type}:`, error);
      }
    }
  }
}
```

### 5. `packages/inspector/src/widget-server.ts`

Inject the DOM sync script into served widget HTML:

```typescript
// In the HTML injection logic, add after existing sync script:
import { generateDomSyncScript } from "./sync/dom-sync-script";

// When serving widget HTML:
const domSyncScript = generateDomSyncScript(inspectorUrl, sessionId);
html = html.replace("</body>", `<script>${domSyncScript}</script></body>`);
```

### 6. `packages/inspector/src/ui-host.ts`

For widgets rendered via UIHostManager, inject the sync script into the host page so it can forward events from the iframe.

## Configuration Options

Add options to control sync behavior:

```typescript
interface DomSyncOptions {
  /** Enable DOM interaction sync (default: true in dual mode) */
  enabled?: boolean;

  /** Events to sync (default: all) */
  events?: Array<"click" | "input" | "scroll" | "focus" | "keyboard">;

  /** Debounce interval for high-frequency events in ms (default: 50) */
  debounceMs?: number;

  /** Sync hover events - can be very noisy (default: false) */
  syncHover?: boolean;

  /** Sync keyboard events (default: true for special keys only) */
  syncKeyboard?: "all" | "special" | "none";
}
```

## Performance Considerations

1. **Debouncing**: High-frequency events (scroll, input, mousemove) must be debounced
2. **Batching**: Consider batching multiple events into single HTTP requests
3. **Selective sync**: Allow disabling sync for specific event types
4. **Error resilience**: Sync failures should not affect widget functionality

## Verification

1. **Build**: `pnpm build`
2. **Tests**: Add tests for DOM sync in `packages/inspector/tests/dom-sync.test.ts`
3. **Lint/Type**: `pnpm lint && pnpm typecheck`
4. **Manual test**:
   - Start dual server: `pnpm -C packages/inspector dev`
   - Connect agent to `/agent/mcp`, ChatGPT to `/apps/mcp`
   - Call a tool with form inputs via ChatGPT
   - Type in form fields in ChatGPT widget
   - Use `get_widget_state` with `includeDOM: true` from agent
   - Verify form values match between external and mirror
   - Take screenshot to visually confirm sync

## Future Enhancements

1. **Bidirectional sync**: Apply agent interactions back to external widget
2. **Mutation observer**: Sync DOM structure changes (element added/removed)
3. **CSS state sync**: Sync class changes, style mutations
4. **Canvas sync**: For widgets with canvas elements
5. **WebSocket transport**: Replace HTTP polling with WebSocket for lower latency

## Security Considerations

1. **Selector sanitization**: Validate selectors before applying to prevent injection
2. **Value limits**: Cap input value lengths to prevent memory issues
3. **Rate limiting**: Limit events per second to prevent DoS
4. **Origin validation**: Verify events come from expected widget origins
