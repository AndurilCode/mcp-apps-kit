# Kanban Board Example

A comprehensive Kanban board application demonstrating all features of the `@mcp-apps-kit` SDK.

## SDK Features Demonstrated

### Server-Side Features (`@mcp-apps-kit/core`)

| Feature                            | Description                                 | Example in Code                                                                        |
| ---------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Tool Definitions**               | Type-safe tool definitions with Zod schemas | All tools use `z.object()` for input/output                                            |
| **Tool Annotations**               | Behavioral hints for AI models              | `readOnlyHint`, `destructiveHint`, `openWorldHint`, `idempotentHint`                   |
| **ToolContext**                    | Client-provided metadata in handlers        | `context.locale`, `context.userLocation`, `context.subject`, `context.widgetSessionId` |
| **fileParams**                     | Enable file upload parameters               | `createTask` tool with `fileParams: ["attachmentId"]`                                  |
| **widgetDescription**              | Human-readable summary for AI               | UI resource with `widgetDescription`                                                   |
| **ClientToolsFromCore**            | End-to-end typed UI client                  | UI imports `KanbanClientTools` (from `ClientToolsFromCore<typeof app.tools>`)          |
| **\_text**                         | Human-friendly model-facing output          | Tools that return `message` also set `_text: message`                                  |
| **\_closeWidget**                  | Dismiss widget after action                 | `clearCompleted` tool returns `_closeWidget: true`                                     |
| **visibility**                     | Control who can invoke tools                | `"model"`, `"app"`, `"both"`                                                           |
| **widgetAccessible**               | Allow widget to call tool                   | All widget-only tools                                                                  |
| **invokingMessage/invokedMessage** | Loading state messages                      | `createTask`, `deleteTask`, etc.                                                       |
| **title**                          | Human-readable tool title                   | All tools have `title` property                                                        |

### Client-Side Features (`@mcp-apps-kit/ui-react`)

| Hook                      | Description                        | Usage in App                   |
| ------------------------- | ---------------------------------- | ------------------------------ |
| **useAppsClient**         | Access typed client for tool calls | Main tool call interface       |
| **useToolInput**          | Access initial tool input          | Debug panel display            |
| **useHostContext**        | Access theme, viewport, locale     | Theme and context display      |
| **useWidgetState**        | Persist state across reloads       | Collapsed columns, debug panel |
| **useHostStyleVariables** | Apply host CSS variables           | Applied in App component       |
| **useDocumentTheme**      | Apply theme class to document      | Light/dark mode                |
| **useDisplayMode**        | Access/change display mode         | Debug panel display            |
| **useSafeAreaInsets**     | Mobile safe area padding           | Container padding              |
| **useOnToolCancelled**    | Handle tool cancellation           | Cancellation message           |
| **useOnTeardown**         | Cleanup on widget teardown         | Console logging                |
| **useFileUpload**         | Upload files (ChatGPT)             | Task attachment                |
| **useIntrinsicHeight**    | Report widget height               | Auto-height container          |
| **useView**               | Access view identifier             | Debug panel display            |
| **useModal**              | Host-owned modal dialogs           | Delete confirmation            |

## Quick Start

```bash
# Install dependencies
pnpm install

# Start both server and UI dev mode
pnpm dev

# Or start individually
pnpm dev:server  # Server only
pnpm dev:ui      # UI dev server only

# Build for production
pnpm build
```

The server starts at `http://localhost:3001`.

## Available Tools

| Tool              | Description                      | Features Used                                         |
| ----------------- | -------------------------------- | ----------------------------------------------------- |
| `listTasks`       | List all tasks (optional filter) | `readOnlyHint`, `idempotentHint`, `visibility: "app"` |
| `createTask`      | Create task with attachment      | `fileParams`, `invokingMessage`                       |
| `moveTask`        | Move task between columns        | `idempotentHint`                                      |
| `updateTask`      | Update task details              | Widget-accessible                                     |
| `deleteTask`      | Delete a task                    | `destructiveHint`                                     |
| `clearCompleted`  | Clear done tasks                 | `_closeWidget`                                        |
| `exportBoard`     | Export board data                | `openWorldHint`                                       |
| `getBoardSummary` | Get board overview               | `ui: "kanban-board"`                                  |

## Example Usage

### Create a Task with Attachment

```json
{
  "tool": "createTask",
  "arguments": {
    "title": "Review document",
    "description": "Review the attached document",
    "attachmentId": "file-abc123"
  }
}
```

### Clear Completed Tasks and Close Widget

```json
{
  "tool": "clearCompleted",
  "arguments": {
    "closeWidget": true
  }
}
```

### Export Board as CSV

```json
{
  "tool": "exportBoard",
  "arguments": {
    "format": "csv",
    "includeMetadata": false
  }
}
```

## UI Features

### Debug Panel

Click the 🔧 button to open the SDK Feature Status panel, showing:

- Host context (theme, platform, locale, viewport)
- Display mode and available modes
- Safe area insets
- Platform feature support (file upload, modal, intrinsic height)
- Current view identifier
- Tool input

### Persisted Preferences

The following preferences are persisted using `useWidgetState`:

- Collapsed columns (click column header to toggle)
- Debug panel visibility

### Modal Dialogs

On supported platforms (ChatGPT), delete confirmation uses native host modals via `useModal`. Falls back to `confirm()` on other platforms.

### File Attachments

On supported platforms (ChatGPT), the Add Task modal includes a file upload option using `useFileUpload`.

## Project Structure

```
kanban/
├── src/
│   ├── index.ts           # Server with all SDK features
│   └── ui/
│       ├── App.tsx        # React app with all hooks
│       ├── main.tsx       # Entry point with AppsProvider
│       ├── index.html     # HTML template
│       ├── styles.css     # Comprehensive styling
│       └── dist/          # Built UI output
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Claude Desktop Configuration

```json
{
  "mcpServers": {
    "kanban": {
      "command": "npx",
      "args": ["tsx", "/path/to/examples/kanban/src/index.ts"]
    }
  }
}
```

## Switching Protocols

```typescript
// In src/index.ts
config: {
  protocol: "openai",  // Change from "mcp" to "openai"
}
```

## Development

```bash
# Type checking
pnpm typecheck

# Build UI
pnpm build:ui

# Build server
pnpm build
```
