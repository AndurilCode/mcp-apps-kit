# Inspector Package Code Analysis

**Branch:** `inspector`  
**Date:** 2026-01-28  
**Total Lines:** ~29,000 (source) + ~6,000 (tests)

---

## Executive Summary

The inspector package is a substantial codebase (~29k lines) that provides MCP widget inspection, rendering, and testing capabilities. While the code is generally well-documented with clear separation of concerns, the iterative development with coding agents has introduced several areas of concern:

| Dimension | Score | Status |
|-----------|-------|--------|
| **Code Duplication** | 5/10 | ⚠️ Moderate issues |
| **Dead Code** | 7/10 | 🟡 Some identified |
| **Architecture** | 6/10 | ⚠️ Could be simplified |
| **Complexity** | 6/10 | ⚠️ Some files too large |
| **Type Safety** | 8/10 | ✅ Good overall |
| **Documentation** | 9/10 | ✅ Excellent |
| **Test Coverage** | 7/10 | 🟡 Good but gaps exist |

**Overall Score: 6.8/10**

**Top Priority Fix:** Unify the dual session management (`WidgetServer` + `WidgetSessionManager`) into a single `SessionStore` with clear separation of concerns.

---

## 1. Code Duplication

### 1.1 High-Priority Duplications

#### Widget Rendering Logic
The same widget rendering pattern is duplicated across multiple files:

**Files affected:**
- `src/proxy-tools.ts` (lines 100-180, 250-330)
- `src/tools/preview-ui.ts`
- `src/tools/test-widget-interaction.ts`
- `src/tools/call-tool.ts`

**Pattern duplicated:**
```typescript
// This pattern appears 4+ times:
const uiResource = await findUIResourceForTool(rawClient, toolInfo.name);
if (uiResource) {
  const html = await fetchWidgetHTML(rawClient, uiResource.uri);
  if (html) {
    const sharedWidgetServer = await connectionManager.getWidgetServer();
    const uiHostManager = new UIHostManager(client, { sharedWidgetServer });
    const environmentState = connectionManager.getEnvironmentState();
    const viewport = environmentState.viewport;
    const externalHostContext = connectionManager.getExternalMcpHostContext();
    const inspectorUrl = connectionManager.getInspectorUrl();
    
    const renderResult = await uiHostManager.renderInBrowser(
      html, protocol, toolResult, toolName,
      environmentState, viewport, externalHostContext, inspectorUrl, isDualMode
    );
    // ... session creation
  }
}
```

**Suggestion:** Extract to a shared helper:
```typescript
// src/tools/helpers.ts (or new file: src/widget-rendering.ts)
export async function renderWidgetForSession(
  connectionManager: ConnectionManager,
  toolName: string,
  toolResult: unknown,
  protocol: DetectedProtocol,
  options: { isDualMode?: boolean; source?: SessionSource }
): Promise<{ sessionId: string; page: Page } | null>
```

---

#### Tool Call Result Extraction
The same result extraction logic appears in multiple tools:

**Files affected:**
- `src/proxy-tools.ts` (2 occurrences)
- `src/standalone-server.ts`
- `src/tools/call-tool.ts`
- `src/tools/widget-refresh.ts`

**Pattern duplicated:**
```typescript
let toolResult: unknown;
if (result.structuredContent) {
  toolResult = result.structuredContent;
} else if (result.content.length > 0) {
  const textContent = result.content.find(
    (c: { type: string; text?: string }) => c.type === 'text'
  );
  if (textContent?.text) {
    try {
      toolResult = JSON.parse(textContent.text);
    } catch {
      toolResult = textContent.text;
    }
  }
}
```

**Suggestion:** This is already in `helpers.ts` as `extractToolResult` - **but not used consistently!**

**Fix:** Replace all occurrences with:
```typescript
import { extractToolResult } from './helpers';
const toolResult = extractToolResult(result);
```

---

#### Host Page HTML Generation
Large blocks of JavaScript are duplicated in `widget-server.ts`:

**Files affected:**
- `generateMcpHostPage()` - ~400 lines
- `generateOpenAIHostPage()` - ~300 lines
- `injectOpenAIRuntime()` - ~300 lines

**Duplicated sections:**
1. DOM event listeners setup (click, input, change, focus, blur, scroll, keydown) - identical in MCP and OpenAI host pages
2. `getSelector()` helper function - appears 3 times
3. `recordEvent()` helper - nearly identical in both protocols

**Suggestion:** Extract shared JavaScript to a template:
```typescript
// src/widget-server-templates.ts
export const DOM_EVENT_LISTENERS_SCRIPT = `...`; // Shared
export const GET_SELECTOR_HELPER = `...`; // Shared
export const RECORD_EVENT_HELPER = `...`; // Parameterized
```

---

### 1.2 Medium-Priority Duplications

#### Display Mode Sizing Calculations
The same sizing logic and constants are embedded in:
- `src/types/environment-types.ts` (canonical)
- `src/hosts/mcp-host.ts` (inline in Playwright script)
- `src/hosts/openai-host.ts` (inline in Playwright script)
- `src/widget-session-manager.ts`

**Suggestion:** The TypeScript constants are fine, but the stringified copies in Playwright scripts should reference a shared template:
```typescript
const DISPLAY_MODE_SIZES_JSON = JSON.stringify(DISPLAY_MODE_SIZES);
// Use this in all getPlaywrightInitScript() methods
```

---

#### Session State Checking
Multiple tools check session validity with similar code:

**Pattern:**
```typescript
const session = sessionManager.getSession(input.sessionId);
if (!session) {
  return {
    success: false,
    error: `Session not found: ${input.sessionId}`,
    hints: { next: "Create a new session..." }
  };
}
if (session.page.isClosed()) {
  return {
    success: false,
    error: "Page closed",
    hints: { next: "Create a new session..." }
  };
}
const frame = session.page.frame({ url: /\/widget\// });
if (!frame) {
  return { success: false, error: "Widget iframe not found", ... };
}
```

**Files affected:** 15+ tool files in `src/tools/`

**Suggestion:** Extract session validation helper:
```typescript
export function validateSession(sessionManager, sessionId): 
  { success: true, session: ActiveWidgetSession, frame: Frame } | 
  { success: false, error: string, hints: ToolHints }
```

---

## 2. Dead Code

### 2.1 Confirmed Dead Code

#### `generateProxyTools()` Function
**File:** `src/proxy-tools.ts`  
**Status:** ❌ Dead - never called

The function `generateProxyTools()` (lines 30-100) is exported but never used. The codebase uses `registerProxyToolsDirectly()` instead (which registers tools directly on the MCP server).

**Evidence:**
```bash
$ grep -r "generateProxyTools" packages/inspector/src/
# Only found in proxy-tools.ts itself (definition and export)
```

**Recommendation:** Remove `generateProxyTools()` and related helper `jsonSchemaToZod()`.

---

#### Unused Type Aliases in `types.ts`
**File:** `src/types.ts`

This file re-exports everything from `types/index.ts`. The barrel pattern is useful, but some types are exported but never imported:
- `MCPServerLike` type is defined but could be inlined
- Some `*Input` schemas are exported but tools define their own locally

**Recommendation:** Audit and remove unused re-exports.

---

#### Legacy Protocol Detection
**File:** `src/ui-host.ts`

```typescript
detectProtocol(mimeType: string): DetectedProtocol | null {
  if (mimeType === MCP_WIDGET_MIME_TYPE) return "mcp";
  if (mimeType === OPENAI_WIDGET_MIME_TYPE) return "openai";
  return null;
}
```

This is duplicated from `helpers.ts` (`detectProtocolFromMimeType`). The method on `UIHostManager` is likely dead code from before the helper was extracted.

---

### 2.2 Potentially Dead Code

#### `test_widget_interaction` Tool
**File:** `src/tools/test-widget-interaction.ts` (599 lines)

This tool overlaps significantly with the newer `widget_click`, `widget_fill`, `widget_drag` tools. It appears to be an older "batch interaction" approach that's been superseded by individual tools.

**Usage analysis:**
- Only used in one test file (`tests/test-widget-interaction.test.ts`)
- Not mentioned in any documentation
- The individual widget_* tools provide the same functionality with better hints

**Recommendation:** Deprecate or remove. Mark as `@deprecated` if keeping for backward compatibility.

---

#### Headless Rendering Mode
**File:** `src/ui-host.ts`

The `renderHeadless()` method using jsdom is comprehensive but:
1. All current tools use `renderInBrowser()` (Playwright)
2. No tool exposes headless rendering as an option

**Recommendation:** If headless mode is intentional for future use, document it. Otherwise, consider removing ~150 lines.

---

## 3. Architecture Simplification

### 3.1 File Size Concerns

Several files exceed recommended limits:

| File | Lines | Recommendation |
|------|-------|----------------|
| `widget-server.ts` | 1,411 | Split: separate template generation |
| `widget-session-manager.ts` | 1,179 | Split: extract DOM sync to separate class |
| `widget-control.ts` | 1,048 | OK - but consider splitting drag/resize |
| `ui-types.ts` | 935 | Split by domain (preview, snapshot, control) |
| `styles.ts` | 873 | OK for CSS-in-JS |

### 3.2 Class Responsibility Analysis

#### `WidgetSessionManager` - Too Many Responsibilities

Current responsibilities:
1. Session lifecycle (create, get, close, cleanup)
2. Console log collection
3. Event recording and emission
4. DOM event synchronization (`syncEvent`, `applyDomEvent`)
5. Globals updates to widget pages
6. Tool call recording
7. Snapshot caching

**Suggestion:** Extract DOM synchronization:
```typescript
// New file: src/dom-sync-manager.ts
export class DomSyncManager {
  async syncEvent(payload: SyncEventPayload): Promise<void>
  async applyDomEvent(type, data, sessionId?): Promise<void>
  private async deliverMcpEvent(...): Promise<void>
  private async deliverOpenAIEvent(...): Promise<void>
}
```

#### `WidgetServer` - Template Logic Mixing

The class mixes HTTP server logic with HTML template generation (1400+ lines).

**Suggestion:**
```typescript
// src/widget-server-templates.ts
export function generateMcpHostPage(session: WidgetSession): string
export function generateOpenAIHostPage(session: WidgetSession): string
export function injectOpenAIRuntime(html: string, session: WidgetSession): string

// src/widget-server.ts (simplified)
import { generateMcpHostPage, ... } from './widget-server-templates';
// Now ~400 lines
```

---

### 3.3 Tool Organization

The `src/tools/` directory has 30+ files. Some could be grouped:

**Suggested structure:**
```
src/tools/
├── index.ts (exports all)
├── connection/
│   ├── connect.ts
│   ├── disconnect.ts
│   └── status.ts
├── inspection/
│   ├── list-tools.ts
│   ├── list-resources.ts
│   ├── list-prompts.ts
│   └── get-ui-metadata.ts
├── session/
│   ├── session-management.ts
│   └── get-console-logs.ts
├── widget/
│   ├── widget-control.ts
│   ├── widget-snapshot.ts
│   ├── widget-query.ts
│   └── widget-snapshot-diff.ts
└── helpers.ts
```

---

### 3.4 Dual Server vs Standalone Server Overlap

`standalone-server.ts` and `dual-server.ts` share significant HTTP handling code:
- Health check endpoint
- Execute tool endpoint (standalone only)
- Record event endpoint
- MCP request routing

**Suggestion:** Extract shared HTTP handling to a base class or utility:
```typescript
// src/http-handler.ts
export function createBaseHttpHandler(connectionManager: ConnectionManager) {
  return {
    handleHealth,
    handleMcpRequest,
    handleRecordEvent,
  };
}
```

---

## 4. Complexity Issues

### 4.1 Long Functions

| Function | File | Lines | Issue |
|----------|------|-------|-------|
| `generateMcpHostPage` | widget-server.ts | ~400 | Inline JS template |
| `generateOpenAIHostPage` | widget-server.ts | ~300 | Inline JS template |
| `injectOpenAIRuntime` | widget-server.ts | ~300 | Inline JS template |
| `syncEvent` | widget-session-manager.ts | ~80 | Multiple protocol branches |
| `applyDomEventToFrame` | widget-session-manager.ts | ~100 | Large switch statement |

### 4.2 Deep Nesting

**File:** `src/tools/widget-control.ts`

The `createWidgetClickTool` handler has nested try-catch with error type detection:
```typescript
try {
  // ... click logic
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  let hints: ToolHints;
  if (message.includes("intercepts pointer events")) {
    // ... nested logic
  } else if (message.includes("not found") || message.includes("timeout")) {
    // ... nested logic
  }
  // ...
}
```

**Suggestion:** Extract error handling to helper:
```typescript
function buildErrorHints(error: Error, context: 'click' | 'fill' | 'drag'): ToolHints
```

---

## 5. Specific Recommendations

### 5.1 Immediate Actions (High Impact, Low Effort)

1. **Use `extractToolResult()` consistently**
   - Find/replace all 5 occurrences of the inline extraction pattern
   - Estimated impact: -50 lines

2. **Remove `generateProxyTools()` dead code**
   - Delete unused function and `jsonSchemaToZod` helper
   - Estimated impact: -70 lines

3. **Extract session validation helper**
   - Create `validateSession()` helper in helpers.ts
   - Use in all 15+ widget tools
   - Estimated impact: -200 lines, improved consistency

### 5.2 Medium-Term Refactoring

4. **Split `widget-server.ts` templates**
   - Extract HTML generation to `widget-server-templates.ts`
   - Estimated impact: Better maintainability, ~1400 → ~400 + 1000 lines

5. **Unify Session Management (HIGH PRIORITY)**
   
   Currently two classes manage different "sessions":
   - `WidgetServer.sessions` → HTTP content storage (HTML, tool results)
   - `WidgetSessionManager.sessions` → Playwright pages + logs + events
   
   **Refactor to unified model:**
   
   ```
   src/session/
   ├── widget-session.ts      # Unified WidgetSession interface
   ├── session-store.ts       # Single source of truth for all session data
   ├── session-renderer.ts    # Playwright page management (lazy rendering)
   └── session-http-server.ts # HTTP serving (reads from store)
   ```
   
   **Unified Session Model:**
   ```typescript
   interface WidgetSession {
     id: string;
     toolName: string;
     toolArgs: Record<string, unknown>;
     toolResult: unknown;
     protocol: 'mcp' | 'openai';
     
     // Content (previously in WidgetServer)
     html: string;
     hostUrl: string;
     widgetUrl: string;
     
     // Runtime (previously in WidgetSessionManager)
     page: Page | null;  // null until rendered
     consoleLogs: ConsoleLogEntry[];
     events: InspectorEvent[];
     toolCalls: WidgetToolCall[];
     
     // Lifecycle
     createdAt: number;
     lastAccessedAt: number;
     source: 'apps' | 'agent';
   }
   ```
   
   **Benefits:**
   - Single source of truth - one session object, one ID
   - Clear ownership - SessionStore owns data, others just access it
   - Lazy rendering - Page only created when needed
   - Unified TTL - one `lastAccessedAt`, one cleanup loop
   - Testable - each class has single responsibility
   
   **Estimated effort:** 1 day
   **Impact:** Eliminates major source of confusion, simplifies debugging

6. **Deprecate `test_widget_interaction`**
   - Add `@deprecated` JSDoc
   - Document migration to individual widget_* tools

### 5.3 Long-Term Improvements

7. **Reorganize tools directory**
   - Group by domain (connection, inspection, session, widget)
   - Estimated impact: Better discoverability

8. **Consolidate server code**
   - Extract shared HTTP handling from standalone/dual servers
   - Estimated impact: -200 lines, reduced bug surface

9. **Review headless rendering**
   - Decide if jsdom support is needed
   - If not, remove ~150 lines from `ui-host.ts`

---

## 6. Type System Review

### 6.1 Strengths

- Comprehensive type definitions in `src/types/`
- Good use of discriminated unions (e.g., `SyncEventType`)
- Proper re-exports for API surface

### 6.2 Issues

1. **Loose `unknown` usage in event payloads**
   ```typescript
   payload: unknown // Could be typed per event type
   ```
   
2. **JSON Schema → Zod conversion is lossy**
   ```typescript
   function jsonSchemaToZodShape(jsonSchema) {
     // Only handles basic types, nested objects lose structure
   }
   ```

3. **Some interfaces could use `Readonly<>`**
   ```typescript
   // Current:
   interface SessionInfo { id: string; ... }
   // Better:
   interface SessionInfo extends Readonly<{ id: string; ... }> {}
   ```

---

## 7. Test Coverage Gaps

### 7.1 Missing Tests

| Component | Coverage | Gap |
|-----------|----------|-----|
| `DomSyncManager` (proposed) | N/A | Would need tests |
| `widget-server-templates` | Indirect | No unit tests for template output |
| Error hint generation | Low | Only happy paths tested |
| `proxy-resources.ts` sync script | Low | Script injection not tested |

### 7.2 Test Quality

- Good integration tests for happy paths
- Missing edge cases (network failures, malformed responses)
- Some tests are very long (800+ lines) - could be split

---

## Appendix: File-by-File Summary

| File | Lines | Duplication | Dead Code | Complexity | Score |
|------|-------|-------------|-----------|------------|-------|
| widget-server.ts | 1411 | High | Low | High | 5/10 |
| widget-session-manager.ts | 1179 | Medium | Low | High | 6/10 |
| widget-control.ts | 1048 | Low | Low | Medium | 7/10 |
| connection.ts | 783 | Low | Low | Medium | 8/10 |
| ui-host.ts | 611 | Medium | Medium | Medium | 6/10 |
| proxy-tools.ts | 465 | High | High | Low | 5/10 |
| standalone-server.ts | 581 | Medium | Low | Medium | 7/10 |
| dual-server.ts | 464 | Medium | Low | Medium | 7/10 |
| helpers.ts | 409 | Low | Low | Low | 9/10 |
| test-widget-interaction.ts | 599 | Medium | High | High | 5/10 |

---

## Conclusion

The inspector package is functional and well-documented but shows signs of iterative development without regular refactoring passes. The main issues are:

1. **Duplication** - Widget rendering and result extraction patterns repeated 4-5x
2. **Dead code** - ~200 lines that can be safely removed
3. **Large files** - 3 files over 1000 lines that should be split
4. **Overlapping tools** - `test_widget_interaction` vs individual widget_* tools

Estimated cleanup effort: **2-3 days** for high-impact items, **1 week** for comprehensive refactoring.

Recommended priority:
1. Extract shared helpers (immediate)
2. Remove dead code (immediate)
3. Split large files (medium-term)
4. Reorganize directory structure (when convenient)
