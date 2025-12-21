# window.openai API Reference

Complete reference for the ChatGPT widget runtime API available to widgets rendered inside ChatGPT's iframe sandbox.

## Overview

The `window.openai` global object is injected by ChatGPT into widget iframes with MIME type `text/html+skybridge`. It provides the bridge between your widget UI and both the MCP server and ChatGPT host.

## Data Properties

### toolInput

**Type:** `Record<string, any>`

The arguments that were passed when the tool was invoked by ChatGPT.

```typescript
// Example: Tool called with { location: "Paris", cuisine: "Italian" }
const location = window.openai.toolInput?.location; // "Paris"
const cuisine = window.openai.toolInput?.cuisine;   // "Italian"
```

### toolOutput

**Type:** `Record<string, any>`

The `structuredContent` returned by your MCP server's tool handler. This is the primary data source for rendering widget content.

**Important:** The model also reads this data, so keep it concise (< 4k tokens).

```typescript
// Example: Server returns { structuredContent: { restaurants: [...] } }
const restaurants = window.openai.toolOutput?.restaurants ?? [];
```

### toolResponseMetadata

**Type:** `Record<string, any>`

The `_meta` payload from your MCP server's tool response. This data is **exclusively** for the widget - the model never sees it.

Use this for large datasets, sensitive information, or implementation details.

```typescript
// Example: Server returns { _meta: { fullDetails: {...}, timestamp: "..." } }
const details = window.openai.toolResponseMetadata?.fullDetails;
const timestamp = window.openai.toolResponseMetadata?.timestamp;
```

### widgetState

**Type:** `Record<string, any> | null`

The persisted UI state snapshot for this specific widget instance. State is scoped to the `message_id/widgetId` pair.

**Lifetime:**
- Persists across page reloads
- Survives follow-up turns initiated through widget controls
- Reset when user types in main chat composer (new widget instance)

**Size limit:** Keep under 4k tokens for performance

```typescript
// Example: Previously saved state
const selectedTab = window.openai.widgetState?.selectedTab ?? "overview";
```

## State Management

### setWidgetState(state)

**Parameters:**
- `state: Record<string, any>` - The complete state object to persist

**Returns:** `void`

Synchronously stores a new UI state snapshot. ChatGPT persists this and rehydrates it on subsequent renders of the same widget instance.

**Important:** The model sees widget state, so avoid secrets or large data structures.

```typescript
// Store state
window.openai.setWidgetState({
  selectedTab: "menu",
  favorites: ["restaurant-123", "restaurant-456"],
  lastUpdated: Date.now()
});

// React hook pattern
function useWidgetState<T>(defaultValue: T) {
  const savedState = window.openai.widgetState as T;
  const [state, setState] = useState<T>(savedState ?? defaultValue);
  
  const updateState = (newState: T | ((prev: T) => T)) => {
    setState((prev) => {
      const updated = typeof newState === "function" 
        ? (newState as (prev: T) => T)(prev)
        : newState;
      window.openai.setWidgetState(updated);
      return updated;
    });
  };
  
  return [state, updateState] as const;
}
```

## Tool & Messaging APIs

### callTool(name, args)

**Parameters:**
- `name: string` - Tool name as registered on MCP server
- `args: Record<string, any>` - Tool arguments matching `inputSchema`

**Returns:** `Promise<ToolResult>`

Invokes an MCP tool from the widget. The tool must have `_meta["openai/widgetAccessible"]: true` or the call will fail.

**Flow:**
1. Widget calls `callTool`
2. ChatGPT routes request to MCP server
3. Server executes tool handler
4. Response updates `toolOutput` and `toolResponseMetadata`
5. Widget automatically re-renders with new data

```typescript
// Refresh data
async function handleRefresh() {
  try {
    await window.openai.callTool("search_restaurants", {
      location: "Paris",
      cuisine: "French"
    });
    // Widget re-renders with new toolOutput
  } catch (error) {
    console.error("Tool call failed:", error);
  }
}
```

**Use cases:**
- Refresh/reload actions
- Pagination
- Filtering/sorting server-side
- State transitions requiring server logic

### sendFollowUpMessage(options)

**Parameters:**
- `options.prompt: string` - The message text to send

**Returns:** `Promise<void>`

Inserts a message into the conversation as if the user typed it. ChatGPT processes this like any user message, potentially triggering tools or generating responses.

```typescript
// Ask follow-up question
async function learnMore(restaurantName: string) {
  await window.openai.sendFollowUpMessage({
    prompt: `Tell me more about the menu at ${restaurantName}`
  });
}

// Multi-step workflow
async function bookRestaurant(restaurantId: string) {
  await window.openai.sendFollowUpMessage({
    prompt: `Book a table at restaurant ${restaurantId} for 2 people tonight at 7pm`
  });
}
```

**Use cases:**
- Conversational flows ("Tell me more...")
- Multi-step wizards
- Natural language commands
- User-initiated actions that benefit from model reasoning

## File Handling

### uploadFile(file)

**Parameters:**
- `file: File` - The file object from `<input type="file">`

**Returns:** `Promise<{ fileId: string }>`

Uploads a user-selected file to ChatGPT's file storage and returns a `fileId` for later reference.

**Supported MIME types:**
- `image/png`
- `image/jpeg`
- `image/webp`

```typescript
async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];
  if (!file) return;
  
  if (!window.openai?.uploadFile) {
    console.error("File upload not available");
    return;
  }
  
  try {
    const { fileId } = await window.openai.uploadFile(file);
    console.log("Uploaded file:", fileId);
    
    // Use fileId in tool call
    await window.openai.callTool("process_image", {
      image: { file_id: fileId }
    });
  } catch (error) {
    console.error("Upload failed:", error);
  }
}
```

### getFileDownloadUrl(options)

**Parameters:**
- `options.fileId: string` - File ID from `uploadFile` or tool file param

**Returns:** `Promise<{ downloadUrl: string }>`

Retrieves a temporary download URL for a previously uploaded file or a file provided via tool file parameters.

**URL lifetime:** Temporary (typically 1 hour)

```typescript
async function displayImage(fileId: string) {
  const { downloadUrl } = await window.openai.getFileDownloadUrl({ fileId });
  
  const img = document.createElement("img");
  img.src = downloadUrl;
  img.alt = "Restaurant photo";
  document.body.appendChild(img);
}
```

## Layout & Display

### requestDisplayMode(options)

**Parameters:**
- `options.mode: "inline" | "pip" | "fullscreen"` - Target display mode

**Returns:** `Promise<void>`

Requests a change to the widget's display mode. ChatGPT may adjust based on platform constraints (e.g., PiP → fullscreen on mobile).

**Display modes:**
- **inline**: Default, renders in conversation flow
- **pip**: Picture-in-picture, floating over conversation
- **fullscreen**: Takes over entire viewport

```typescript
// Expand map to fullscreen
async function expandMap() {
  await window.openai.requestDisplayMode({ mode: "fullscreen" });
}

// Return to inline view
async function collapseView() {
  await window.openai.requestDisplayMode({ mode: "inline" });
}
```

**Use cases:**
- Maps, charts, media viewers (fullscreen)
- Always-visible controls (PiP)
- Minimizing widget (inline)

### requestModal(options)

**Parameters:**
- `options.title?: string` - Modal title
- `options.component?: string` - Component identifier

**Returns:** `Promise<void>`

Spawns a host-controlled modal overlay for temporary content like forms, confirmations, or detail views.

```typescript
// Show checkout modal
async function openCheckout(cartId: string) {
  await window.openai.requestModal({
    title: "Complete Purchase",
    component: "checkout-modal"
  });
}
```

**Use cases:**
- Checkout flows
- Detail views
- Confirmations
- Multi-step forms

### notifyIntrinsicHeight(height)

**Parameters:**
- `height: number` - Widget height in pixels

**Returns:** `void`

Reports the widget's natural content height to prevent scroll clipping. Call this when content height changes dynamically.

```typescript
// After content loads
useEffect(() => {
  const height = contentRef.current?.scrollHeight;
  if (height) {
    window.openai.notifyIntrinsicHeight(height);
  }
}, [contentRef.current?.scrollHeight]);
```

### requestClose()

**Returns:** `void`

Closes/hides the widget. Alternative: server can set `_meta["openai/closeWidget"]: true` in tool response.

```typescript
// User clicks "Done" button
function handleDone() {
  window.openai.requestClose();
}
```

### openExternal(options)

**Parameters:**
- `options.href: string` - External URL to open

**Returns:** `Promise<void>`

Opens a vetted external link in the user's browser. ChatGPT may show safe-link modal unless URL is in `redirect_domains` of widget CSP.

**Return links:** If URL in `redirect_domains`, ChatGPT appends `redirectUrl` query param for returning to conversation.

```typescript
// Open restaurant booking page
async function bookExternal(restaurantUrl: string) {
  await window.openai.openExternal({
    href: restaurantUrl
  });
}
```

## Context Properties

### theme

**Type:** `"light" | "dark"`

Current theme preference. Subscribe to changes with `useOpenAiGlobal("theme")`.

```typescript
const theme = window.openai.theme;
document.body.className = theme; // Apply theme class
```

### displayMode

**Type:** `"inline" | "pip" | "fullscreen"`

Current display mode of the widget.

```typescript
const mode = window.openai.displayMode;
const showMinimizeButton = mode === "fullscreen";
```

### locale

**Type:** `string` (RFC 4647 language tag)

Requested locale for localization. Use for formatting dates, numbers, and loading translations.

**Examples:** `"en-US"`, `"es-ES"`, `"fr-FR"`

```typescript
const locale = window.openai.locale ?? "en-US";
const dateFormatter = new Intl.DateTimeFormat(locale);
const priceFormatter = new Intl.NumberFormat(locale, {
  style: "currency",
  currency: "USD"
});
```

### userAgent

**Type:** `string`

Client user agent string. Useful for analytics or tailoring experience.

**Security note:** Never rely on this for authorization.

```typescript
const ua = window.openai.userAgent;
const isMobile = /Mobile|Android|iOS/i.test(ua);
```

### maxHeight

**Type:** `number`

Maximum height constraint for the widget container in pixels.

```typescript
const maxHeight = window.openai.maxHeight;
const containerStyle = { maxHeight: `${maxHeight}px` };
```

### safeArea

**Type:** `{ top: number, right: number, bottom: number, left: number }`

Safe area insets for mobile devices (notches, rounded corners).

```typescript
const { top, bottom } = window.openai.safeArea;
const style = {
  paddingTop: `${top}px`,
  paddingBottom: `${bottom}px`
};
```

### view

**Type:** `Record<string, any>`

Additional view context information from the host.

```typescript
const viewInfo = window.openai.view;
```

## Event Handling

### "openai:set_globals" Event

Fired when any `window.openai` property changes. Use this for reactive updates.

```typescript
// React hook for subscribing to changes
function useOpenAiGlobal<K extends keyof typeof window.openai>(
  key: K
): typeof window.openai[K] {
  return useSyncExternalStore(
    (onChange) => {
      const handler = () => onChange();
      window.addEventListener("openai:set_globals", handler, { passive: true });
      return () => window.removeEventListener("openai:set_globals", handler);
    },
    () => window.openai[key]
  );
}

// Usage
const theme = useOpenAiGlobal("theme");
const toolOutput = useOpenAiGlobal("toolOutput");
```

## TypeScript Definitions

```typescript
interface WindowOpenAI {
  // Data
  toolInput?: Record<string, any>;
  toolOutput?: Record<string, any>;
  toolResponseMetadata?: Record<string, any>;
  widgetState?: Record<string, any> | null;
  
  // State management
  setWidgetState(state: Record<string, any>): void;
  
  // Tools & messaging
  callTool(name: string, args: Record<string, any>): Promise<ToolResult>;
  sendFollowUpMessage(options: { prompt: string }): Promise<void>;
  
  // Files
  uploadFile(file: File): Promise<{ fileId: string }>;
  getFileDownloadUrl(options: { fileId: string }): Promise<{ downloadUrl: string }>;
  
  // Layout
  requestDisplayMode(options: { mode: "inline" | "pip" | "fullscreen" }): Promise<void>;
  requestModal(options: { title?: string; component?: string }): Promise<void>;
  notifyIntrinsicHeight(height: number): void;
  requestClose(): void;
  openExternal(options: { href: string }): Promise<void>;
  
  // Context
  theme: "light" | "dark";
  displayMode: "inline" | "pip" | "fullscreen";
  locale: string;
  userAgent: string;
  maxHeight: number;
  safeArea: { top: number; right: number; bottom: number; left: number };
  view: Record<string, any>;
}

interface Window {
  openai: WindowOpenAI;
}
```

## Best Practices

1. **Check availability:** Always check if API exists before calling (may not be available in non-skybridge contexts)

```typescript
if (window.openai?.callTool) {
  await window.openai.callTool("tool_name", {});
}
```

2. **Subscribe reactively:** Use hooks or event listeners for live updates

```typescript
useEffect(() => {
  const handler = () => {
    // React to changes
  };
  window.addEventListener("openai:set_globals", handler);
  return () => window.removeEventListener("openai:set_globals", handler);
}, []);
```

3. **Handle errors:** Tool calls and file operations can fail

```typescript
try {
  await window.openai.uploadFile(file);
} catch (error) {
  console.error("Operation failed:", error);
  showErrorMessage("Upload failed, please try again");
}
```

4. **Validate state:** Handle corrupted or missing state gracefully

```typescript
const state = window.openai.widgetState;
const validated = validateState(state) ? state : getDefaultState();
```

5. **Optimize size:** Keep `widgetState` under 4k tokens, use `toolResponseMetadata` for large data

```typescript
// Good: Small state
setWidgetState({ selectedId: "123", page: 2 });

// Bad: Large state
setWidgetState({ 
  selectedId: "123", 
  allRestaurants: [...] // Move to toolResponseMetadata
});
```
