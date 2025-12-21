# MCP Apps API Quick Reference

Quick reference for common MCP Apps operations. For complete API documentation, see: https://modelcontextprotocol.github.io/ext-apps/api/

## Server Side (TypeScript)

### Register UI Resource

```typescript
server.registerResource({
  uri: "ui://my-server/widget",
  name: "Widget Name",
  description: "Optional description",
  mimeType: "text/html;profile=mcp-app",
  _meta: {
    ui: {
      csp: {
        connectDomains: ["https://api.example.com"],
        resourceDomains: ["https://cdn.jsdelivr.net"]
      },
      prefersBorder: true
    }
  }
});
```

### Handle Resource Reads

```typescript
server.setResourceHandler(async (uri) => {
  if (uri === "ui://my-server/widget") {
    const html = await fs.readFile("dist/widget.html", "utf-8");
    return {
      contents: [{
        uri,
        mimeType: "text/html;profile=mcp-app",
        text: html
      }]
    };
  }
});
```

### Register Tool with UI

```typescript
server.registerTool("tool_name", {
  title: "Tool Title",
  description: "Tool description",
  inputSchema: { /* ... */ },
  _meta: {
    ui: {
      resourceUri: "ui://my-server/widget",
      visibility: ["model", "app"] // Default
    }
  }
}, async (args) => {
  const data = await processData(args);
  return {
    content: [{ type: "text", text: "Text for agent" }],
    structuredContent: data, // For UI
    _meta: { timestamp: new Date().toISOString() }
  };
});
```

### Check Host Capability

```typescript
const hostSupportsUI = client.capabilities?.extensions?.["io.modelcontextprotocol/ui"];
```

## UI Side (Vanilla JS/TypeScript)

### Initialize App

```typescript
import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps";

const app = new App({
  name: "My App",
  version: "1.0.0"
});

// Register handlers BEFORE connecting
app.ontoolresult = (result) => {
  renderData(result.structuredContent);
};

app.onhostcontextchange = (context) => {
  if (context.theme) applyTheme(context.theme);
};

// Connect
await app.connect(new PostMessageTransport(window.parent));
```

### Call Server Tools

```typescript
const result = await app.callServerTool({
  name: "fetch_data",
  arguments: { query: "value" }
});
```

### Send Message to Chat

```typescript
await app.sendMessage({
  role: "user",
  content: {
    type: "text",
    text: "Message text"
  }
});
```

### Send Log Notification

```typescript
await app.sendLog({
  level: "info",
  data: "Log message"
});
```

### Open External Link

```typescript
await app.sendOpenLink({
  url: "https://example.com"
});
```

### Request Display Mode

```typescript
const result = await app.requestDisplayMode("fullscreen");
console.log("New mode:", result.mode);
```

### Read Server Resource

```typescript
const resource = await app.readResource({
  uri: "file:///config.json"
});
const data = JSON.parse(resource.contents[0].text);
```

### Lifecycle Handlers

```typescript
app.oninitialized = (result) => {
  console.log("Host:", result.hostInfo);
  console.log("Context:", result.hostContext);
};

app.ontoolinput = (input) => {
  console.log("Tool called:", input);
};

app.ontoolinputpartial = (partial) => {
  updateProgress(partial);
};

app.ontoolresult = (result) => {
  renderData(result.structuredContent);
};

app.ontoolcancelled = (reason) => {
  console.warn("Cancelled:", reason);
};

app.onhostcontextchange = (context) => {
  updateUI(context);
};

app.onteardown = (reason) => {
  cleanup();
};
```

## UI Side (React)

### Initialize with Hook

```typescript
import { useApp, useToolResult, useHostContext } from "@modelcontextprotocol/ext-apps/react";

function MyApp() {
  const app = useApp({
    name: "My App",
    version: "1.0.0"
  });
  
  const toolResult = useToolResult();
  const hostContext = useHostContext();
  
  // Use app, toolResult, hostContext...
}
```

### Auto-Apply Theming

```typescript
import { useHostStyleVariables, useDocumentTheme } from "@modelcontextprotocol/ext-apps/react";

function MyApp() {
  useHostStyleVariables(); // Applies CSS variables
  useDocumentTheme();      // Applies theme class
  
  return <div>Themed content</div>;
}
```

### Call Tools

```typescript
const app = useApp(/* ... */);

const handleClick = async () => {
  const result = await app.callServerTool({
    name: "refresh_data",
    arguments: {}
  });
};
```

## Theming

### Apply Host Styles (Vanilla)

```typescript
import { 
  applyHostStyleVariables,
  applyDocumentTheme,
  applyHostFonts 
} from "@modelcontextprotocol/ext-apps";

app.onhostcontextchange = (context) => {
  if (context.styles?.variables) {
    applyHostStyleVariables(context.styles.variables);
  }
  
  if (context.theme) {
    applyDocumentTheme(context.theme);
  }
  
  if (context.styles?.css?.fonts) {
    applyHostFonts(context.styles.css.fonts);
  }
};
```

### CSS Variables

```css
:root {
  /* Define fallbacks */
  --color-background-primary: light-dark(#ffffff, #171717);
  --color-text-primary: light-dark(#171717, #fafafa);
  --font-sans: system-ui, sans-serif;
}

.container {
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}
```

## Error Handling

### UI Side

```typescript
try {
  const result = await app.callServerTool({
    name: "risky_operation",
    arguments: {}
  });
} catch (error) {
  if (error.code === -32000) {
    showError(error.message); // Tool-specific error
  } else {
    showCriticalError(error); // Transport/protocol error
  }
}
```

### Server Side

```typescript
server.registerTool("risky_operation", {}, async () => {
  try {
    const data = await riskyOperation();
    return { content: [{ type: "text", text: "Success" }] };
  } catch (error) {
    throw new Error("Operation failed: " + error.message);
  }
});
```

## Build Configuration

### Vite Config

```typescript
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: process.env.INPUT || "app.html"
    }
  }
});
```

### Package Scripts

```json
{
  "scripts": {
    "build": "INPUT=app.html vite build",
    "serve": "node server.js"
  }
}
```

## Testing

### Test Host Setup

```bash
git clone https://github.com/modelcontextprotocol/ext-apps.git
cd ext-apps/examples/basic-host
npm install
npm run start
# Open http://localhost:8080
```

### Claude Desktop Config

```json
{
  "mcpServers": {
    "my-app": {
      "command": "node",
      "args": ["/path/to/server.js"]
    }
  }
}
```

## Common Patterns

### Data Passing

```typescript
// Server: Return structured data
return {
  content: [{ type: "text", text: "Text for agent" }],
  structuredContent: { key: "value" }, // For UI
  _meta: { timestamp: new Date().toISOString() }
};

// UI: Access structured data
app.ontoolresult = (result) => {
  const data = result.structuredContent;
  renderData(data);
};
```

### App-Only Tools

```typescript
// Hidden from agent, only callable by UI
server.registerTool("ui_refresh", {
  description: "Refresh UI (internal)",
  inputSchema: { type: "object" },
  _meta: {
    ui: { visibility: ["app"] }
  }
}, async () => {
  return {
    content: [{ type: "text", text: "Refreshed" }],
    structuredContent: await fetchLatestData()
  };
});
```

### Multi-Page Apps

```typescript
// Register multiple UI resources
server.registerResource({
  uri: "ui://app/dashboard",
  name: "Dashboard",
  mimeType: "text/html;profile=mcp-app"
});

server.registerResource({
  uri: "ui://app/details",
  name: "Details",
  mimeType: "text/html;profile=mcp-app"
});

// Tools reference different views
server.registerTool("show_dashboard", {
  _meta: { ui: { resourceUri: "ui://app/dashboard" } }
});

server.registerTool("show_details", {
  _meta: { ui: { resourceUri: "ui://app/details" } }
});
```
