# MCP Apps API Gap Analysis & Implementation Plan

## Overview

This document compares the official **MCP Apps API** (from `@modelcontextprotocol/ext-apps` specification) with the current **mcp-apps-kit** implementation to identify missing features and plan their implementation.

## API Reference Sources

- Official MCP Apps Spec: [SEP-1865](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1865)
- SDK Repository: [modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps)
- Extension Identifier: `io.modelcontextprotocol/ui`

---

## Summary of Findings

| Category | Status | Notes |
|----------|--------|-------|
| Core Client API | Mostly Implemented | Minor gaps in event handling |
| Host Context | Mostly Implemented | `toolInfo` extracted but not in HostContext type |
| Message Types | Partially Implemented | Missing streaming input, size notifications |
| CSS Variables | Not Documented | Host provides variables, docs needed |
| Protocol Compliance | **Compliant** | Correct MIME type and URI scheme |
| Host Capabilities | Not Implemented | No capability negotiation |

---

## Detailed Gap Analysis

### 1. Host Context Missing Fields

**Current Implementation** (`packages/ui/src/types.ts`):
```typescript
interface HostContext {
  theme, displayMode, availableDisplayModes, viewport, locale, timeZone,
  platform, userAgent, deviceCapabilities, safeAreaInsets, styles, view
}
```

**Official Spec Missing**:
- [ ] `toolInfo` - Metadata about the instantiating tool call (tool name, arguments preview)

**Priority**: Medium

---

### 2. JSON-RPC Message Types

#### 2.1 Host → UI Notifications (Missing/Incomplete)

| Message | Current Status | Notes |
|---------|---------------|-------|
| `ui/notifications/tool-input` | Implemented | Via `ontoolinput` |
| `ui/notifications/tool-result` | Implemented | Via `ontoolresult` |
| `ui/notifications/tool-input-partial` | Partially Implemented | Comment says "ignored" in `mcp.ts:116` |
| `ui/notifications/tool-cancelled` | Implemented | Via `ontoolcancelled` |
| `ui/notifications/size-changed` | **NOT IMPLEMENTED** | Host notifying UI of container resize |
| `ui/notifications/host-context-changed` | Implemented | Via `onhostcontextchanged` |

**Missing Implementation**:
- [ ] Handle `ui/notifications/size-changed` from host
- [ ] Implement `ui/notifications/tool-input-partial` streaming

**Priority**: Low (size-changed), Medium (input streaming)

---

#### 2.2 UI → Host Requests (Missing/Incomplete)

| Message | Current Status | Notes |
|---------|---------------|-------|
| `ui/initialize` | Implemented | Via `app.connect()` |
| `ui/open-link` | Implemented | Via `openLink()` |
| `ui/message` | Implemented | Via `sendMessage()` |
| `ui/request-display-mode` | Implemented | Via `requestDisplayMode()` |
| `ui/resource-teardown` | Implemented | Via `onteardown` |
| `tools/call` | Implemented | Via `callTool()` |
| `resources/read` | Implemented | Via `readResource()` |
| `notifications/message` (logging) | Implemented | Via `log()` |
| `ui/notifications/size-changed` (outgoing) | **PARTIALLY** | Have `notifyIntrinsicHeight` but not full spec |

**Missing Implementation**:
- [ ] Full `ui/notifications/size-changed` request format (width + height)
- [ ] `ui/notifications/context` for state updates without inference

**Priority**: Low

---

### 3. CSS Variables Specification

The official spec defines a comprehensive set of standardized CSS variables that hosts provide for consistent theming. These are **NOT implemented** in the current codebase documentation/examples.

**Missing CSS Variable Categories**:

#### Colors
- [ ] Background: `--color-background-{primary|secondary|tertiary|info|danger|success|warning|disabled|ghost}`
- [ ] Text: `--color-text-{primary|secondary|tertiary|info|danger|success|warning|disabled|ghost}`
- [ ] Border: `--color-border-{primary|secondary|tertiary|info|danger|success|warning|disabled|ghost}`
- [ ] Ring: `--color-ring-{primary|secondary|tertiary|info|danger|success|warning|disabled|ghost}`

#### Typography
- [ ] Font families: `--font-sans`, `--font-mono`
- [ ] Font weights: `--font-weight-{normal|medium|semibold|bold}`
- [ ] Text sizes: `--font-text-{xs|sm|md|lg}-{size|line-height}`
- [ ] Heading sizes: `--font-heading-{xs|sm|md|lg|xl|2xl|3xl}-{size|line-height}`

#### Layout & Effects
- [ ] Border radius: `--border-radius-{xs|sm|md|lg|xl|full}`
- [ ] Border width: `--border-width-regular`
- [ ] Shadows: `--shadow-{hairline|sm|md|lg}`

**Priority**: Medium - Important for visual consistency

---

### 4. Protocol Compliance

#### 4.1 MIME Type
- **Official Spec**: `text/html;profile=mcp-app`
- **Current**: **Correctly implemented** in `packages/core/src/adapters/mcp.ts:109`

**Status**: COMPLIANT

---

#### 4.2 URI Scheme
- **Official Spec**: `ui://` URI scheme for resources
- **Current**: **Correctly implemented** in `packages/core/src/server/index.ts:878`

**Status**: COMPLIANT

---

### 5. Host Capabilities Negotiation

The official spec defines a capabilities exchange during initialization:

```json
{
  "extensions": {
    "io.modelcontextprotocol/ui": {
      "mimeTypes": ["text/html;profile=mcp-app"]
    }
  }
}
```

**Current Status**: Not implemented - no capability negotiation on client side.

**Missing Features**:
- [ ] Check host capabilities during connection
- [ ] Expose `hostCapabilities` in client API
- [ ] Graceful degradation when host lacks capabilities

**Priority**: Medium - Important for interoperability

---

### 6. McpUiToolMeta Structure

**Official Spec**:
```typescript
interface McpUiToolMeta {
  resourceUri?: string;     // URI of associated UI resource
  visibility?: string[];    // ["model"] | ["app"] | ["model", "app"]
}
```

**Current Implementation**:
- Using `ui` as string reference to UI definition key
- Using `visibility` as union type `"model" | "app" | "both"`

**Gap**: Visibility is a string union, not array format. The adapter converts this, but the core types don't match the spec exactly.

**Priority**: Low - Working but non-idiomatic

---

### 7. Sandbox Proxy Messages (Web Hosts)

For web-based hosts, the spec defines sandbox isolation messages:

- [ ] `ui/notifications/sandbox-proxy-ready` (Sandbox → Host)
- [ ] `ui/notifications/sandbox-resource-ready` (Host → Sandbox)

**Current Status**: Not implemented (likely host-side concern, not SDK)

**Priority**: Low - Host implementation detail

---

### 8. Resource Content Response Format

**Official Spec**:
```json
{
  "contents": [{
    "uri": "ui://...",
    "mimeType": "text/html;profile=mcp-app",
    "text": "<!DOCTYPE html>...",
    "_meta": { "ui": { /* CSP and theming */ } }
  }]
}
```

**Current Implementation**: Correctly structured, but verify `_meta.ui` format.

**Priority**: Medium

---

## Implementation Plan

### Phase 1: Type System Updates (High Priority)

1. **Expose `toolInfo` in HostContext Type**
   - Files: `packages/ui/src/types.ts`
   - The data is already extracted in `mcp.ts:216-218` but stored in `toolMeta`
   - Add `toolInfo?: { name: string; arguments?: Record<string, unknown> }` to `HostContext`
   - Map from existing `toolMeta` or directly from host context
   - Estimated effort: Small

2. **Add Host Capabilities Type**
   - Files: `packages/ui/src/types.ts`, adapters
   - Add `HostCapabilities` interface matching spec
   - Expose via client API
   - Estimated effort: Medium

### Phase 2: Enhanced Features (Medium Priority)

3. **Implement Streaming Tool Input**
   - File: `packages/ui/src/adapters/mcp.ts`
   - Add handler for `ui/notifications/tool-input-partial`
   - Add `onToolInputPartial` event to client interface
   - Add `useToolInputPartial` hook to React bindings
   - Estimated effort: Medium

4. **Document CSS Variables**
   - Create: `docs/css-variables.md` or update READMEs
   - List all standardized CSS variables from spec
   - Provide usage examples for theme integration
   - Estimated effort: Small

5. **Improve Size Notification**
   - Current: `notifyIntrinsicHeight(height: number)`
   - Spec: `ui/notifications/size-changed { width, height }`
   - Add: `notifySizeChanged(width: number, height: number)`
   - Keep `notifyIntrinsicHeight` for backwards compatibility
   - Estimated effort: Small

### Phase 3: Advanced Features (Low Priority)

6. **Context Update Without Inference**
   - Add `ui/notifications/context` message type
   - Use for state updates that shouldn't trigger model inference
   - Estimated effort: Medium

7. **Handle Incoming Size Changed**
   - Add `onSizeChanged` event for host-initiated resize notifications
   - Estimated effort: Small

8. **Visibility Array Format**
   - Consider supporting both string union and array format
   - Or document the adapter translation
   - Estimated effort: Small

---

## Files to Modify

| File | Changes |
|------|---------|
| `packages/ui/src/types.ts` | Add `toolInfo` to HostContext, add `HostCapabilities` |
| `packages/ui/src/adapters/mcp.ts` | Streaming input handler, expose toolInfo |
| `packages/ui/src/adapters/types.ts` | Protocol adapter interface updates |
| `packages/ui-react/src/hooks.ts` | New hooks: `useToolInputPartial`, `useHostCapabilities` |
| `packages/core/README.md` | CSS variables documentation |
| `packages/ui-react/README.md` | New hooks documentation |
| `docs/css-variables.md` (new) | Comprehensive CSS variables reference |

---

## Testing Requirements

1. **Unit Tests**
   - Test toolInfo extraction and exposure in HostContext
   - Test streaming input partial event handling
   - Test host capabilities parsing

2. **Integration Tests**
   - Test streaming input handling end-to-end
   - Test size change notifications (bidirectional)
   - Test capability negotiation mock

3. **Contract Tests**
   - Verify JSON-RPC message formats match spec
   - Verify metadata structure matches spec

---

## Questions to Resolve

1. Should we maintain backwards compatibility for visibility string format? (Current: yes, via adapter)
2. Should CSS variables be auto-applied by hooks or documented for manual use?
3. What's the timeline for MCP Apps spec finalization? (Currently draft as of Dec 2025)
4. Should `toolInfo` be in `HostContext` or remain separate in `toolMeta`?

---

## Conclusion

The mcp-apps-kit implementation is **largely compliant** with the MCP Apps specification:

**Already Compliant:**
- MIME type: `text/html;profile=mcp-app`
- URI scheme: `ui://`
- Core message types (tool-input, tool-result, tool-cancelled, teardown)
- Host context structure
- Display mode control
- Resource reading

**Gaps to Address (Priority Order):**
1. **Type System**: Expose `toolInfo` in HostContext type (data is extracted but not typed)
2. **Streaming**: Implement `tool-input-partial` streaming support
3. **Documentation**: CSS variables reference
4. **Advanced**: Host capabilities negotiation, context updates without inference

The framework architecture is sound and all gaps are enhancements rather than fundamental issues. The core protocol communication is already working correctly.
