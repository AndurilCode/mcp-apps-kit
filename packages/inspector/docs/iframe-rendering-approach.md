# Iframe-Based Widget Rendering Architecture

## Problem Statement

The current Playwright-based UI rendering has a fundamental limitation: widgets remain in a "loading" state because the ext-apps SDK validates that incoming messages originate from `window.parent`. When we use `page.setContent()` to load widget HTML directly, there's no real iframe/parent relationship, causing message validation to fail.

### Root Cause

1. **`addInitScript` doesn't work with `setContent`** - Playwright's `addInitScript` only executes for real URL navigations, not `setContent`
2. **MessageEvent.source validation** - The ext-apps SDK checks `event.source === window.parent` before accepting messages
3. **Mock window.parent limitations** - When we override `window.parent` with a mock object, we can't use it as `MessageEvent.source` because browsers require `source` to be a real `Window` or `MessagePort`

## Proposed Solution: HTTP Server + Iframe Approach

Instead of loading widget HTML directly via `setContent`, we:

1. Start an internal HTTP server that serves widget HTML
2. Create a host page that embeds the widget in an iframe
3. Use real `postMessage` communication between host page and widget iframe

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Inspector Server                      │
│                     (port 6274)                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │          Internal Widget Server (ephemeral port)     │    │
│  │                                                      │    │
│  │  GET /widget/:id  → serves widget HTML               │    │
│  │  GET /host/:id    → serves host page with iframe     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 Playwright Browser                   │    │
│  │                                                      │    │
│  │  ┌───────────────────────────────────────────────┐  │    │
│  │  │              Host Page (navigated)             │  │    │
│  │  │                                                │  │    │
│  │  │  - Listens for postMessage from iframe        │  │    │
│  │  │  - Responds with init + tool/result           │  │    │
│  │  │                                                │  │    │
│  │  │  ┌─────────────────────────────────────────┐  │  │    │
│  │  │  │      Widget Iframe (real navigation)    │  │  │    │
│  │  │  │                                         │  │  │    │
│  │  │  │  - window.parent === host page         │  │  │    │
│  │  │  │  - Real postMessage works              │  │  │    │
│  │  │  │  - ext-apps SDK validates correctly    │  │  │    │
│  │  │  └─────────────────────────────────────────┘  │  │    │
│  │  └───────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Internal Widget Server

Create a lightweight HTTP server within the inspector that serves widget content.

```typescript
// src/widget-server.ts

import { createServer, Server, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

interface WidgetSession {
  id: string;
  html: string;
  toolResult: unknown;
  toolName: string;
  protocol: "mcp" | "openai";
  createdAt: number;
}

export class WidgetServer {
  private server: Server;
  private sessions: Map<string, WidgetSession> = new Map();
  private port: number = 0;
  
  constructor() {
    this.server = createServer(this.handleRequest.bind(this));
  }
  
  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server.address();
        this.port = typeof addr === "object" ? addr?.port ?? 0 : 0;
        resolve(this.port);
      });
    });
  }
  
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
  
  /**
   * Create a widget session and return URLs for rendering
   */
  createSession(
    html: string,
    toolResult: unknown,
    toolName: string,
    protocol: "mcp" | "openai"
  ): { hostUrl: string; widgetUrl: string; sessionId: string } {
    const id = randomUUID();
    this.sessions.set(id, {
      id,
      html,
      toolResult,
      toolName,
      protocol,
      createdAt: Date.now(),
    });
    
    // Clean up old sessions (older than 5 minutes)
    this.cleanupSessions();
    
    return {
      sessionId: id,
      hostUrl: `http://127.0.0.1:${this.port}/host/${id}`,
      widgetUrl: `http://127.0.0.1:${this.port}/widget/${id}`,
    };
  }
  
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
    const parts = url.pathname.split("/").filter(Boolean);
    
    if (parts[0] === "widget" && parts[1]) {
      this.serveWidget(parts[1], res);
    } else if (parts[0] === "host" && parts[1]) {
      this.serveHost(parts[1], res);
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  }
  
  private serveWidget(sessionId: string, res: ServerResponse): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      res.writeHead(404);
      res.end("Session not found");
      return;
    }
    
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(session.html);
  }
  
  private serveHost(sessionId: string, res: ServerResponse): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      res.writeHead(404);
      res.end("Session not found");
      return;
    }
    
    const hostHtml = this.generateHostPage(session);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(hostHtml);
  }
  
  private generateHostPage(session: WidgetSession): string {
    const { toolResult, toolName, protocol } = session;
    
    if (protocol === "mcp") {
      return this.generateMcpHostPage(session);
    } else {
      return this.generateOpenAIHostPage(session);
    }
  }
  
  private generateMcpHostPage(session: WidgetSession): string {
    const toolResultJson = JSON.stringify(session.toolResult);
    const toolNameJson = JSON.stringify(session.toolName);
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MCP Widget Host</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; }
    iframe { width: 100vw; height: 100vh; border: none; }
  </style>
</head>
<body>
  <iframe id="widget" src="/widget/${session.id}"></iframe>
  <script>
    const toolResult = ${toolResultJson};
    const toolName = ${toolNameJson};
    
    window.addEventListener('message', function(event) {
      // Only accept messages from our iframe
      const iframe = document.getElementById('widget');
      if (event.source !== iframe.contentWindow) return;
      
      const message = event.data;
      if (!message || typeof message !== 'object') return;
      
      // Handle ui/initialize
      if (message.jsonrpc === '2.0' && message.method === 'ui/initialize') {
        const response = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            hostCapabilities: {
              logging: {},
              serverTools: {},
            },
            hostVersion: {
              name: 'MCP Inspector Emulator',
              version: '1.0.0',
            },
            hostContext: {
              theme: 'light',
              displayMode: 'inline',
              availableDisplayModes: ['inline', 'fullscreen'],
              viewport: { width: window.innerWidth, height: window.innerHeight },
              locale: navigator.language,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              toolInfo: {
                tool: { name: toolName },
              },
            },
          },
        };
        
        event.source.postMessage(response, '*');
        
        // Send tool result after a short delay
        setTimeout(function() {
          const toolResultMsg = {
            jsonrpc: '2.0',
            method: 'tool/result',
            params: {
              result: {
                structuredContent: toolResult,
                content: [{ type: 'text', text: JSON.stringify(toolResult) }],
              },
            },
          };
          event.source.postMessage(toolResultMsg, '*');
        }, 50);
      }
      
      // Handle tools/call (bidirectional)
      if (message.jsonrpc === '2.0' && message.method === 'tools/call') {
        // For now, return a mock response
        const response = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [{ type: 'text', text: '{"mock": true}' }],
          },
        };
        event.source.postMessage(response, '*');
      }
      
      // Handle logging/message
      if (message.jsonrpc === '2.0' && message.method === 'logging/message') {
        console.log('[Widget Log]', message.params);
      }
    });
  </script>
</body>
</html>`;
  }
  
  private generateOpenAIHostPage(session: WidgetSession): string {
    const toolResultJson = JSON.stringify(session.toolResult);
    const toolNameJson = JSON.stringify(session.toolName);
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OpenAI Widget Host</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; }
    iframe { width: 100vw; height: 100vh; border: none; }
  </style>
</head>
<body>
  <iframe id="widget" src="/widget/${session.id}"></iframe>
  <script>
    const toolResult = ${toolResultJson};
    const toolName = ${toolNameJson};
    
    // OpenAI uses a different protocol - postMessage with specific event types
    window.addEventListener('message', function(event) {
      const iframe = document.getElementById('widget');
      if (event.source !== iframe.contentWindow) return;
      
      const message = event.data;
      if (!message || typeof message !== 'object') return;
      
      // Handle OpenAI-style initialization
      if (message.type === 'ready') {
        // Send initial context
        event.source.postMessage({
          type: 'context',
          context: {
            theme: 'light',
            toolName: toolName,
          }
        }, '*');
        
        // Send tool output
        setTimeout(function() {
          event.source.postMessage({
            type: 'output',
            output: toolResult
          }, '*');
        }, 50);
      }
    });
  </script>
</body>
</html>`;
  }
  
  private cleanupSessions(): void {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [id, session] of this.sessions) {
      if (session.createdAt < fiveMinutesAgo) {
        this.sessions.delete(id);
      }
    }
  }
}
```

### Phase 2: Update UIHostManager

Modify `UIHostManager.renderInBrowser()` to use the widget server.

```typescript
// Changes to src/ui-host.ts

export class UIHostManager {
  private widgetServer?: WidgetServer;
  
  private async getWidgetServer(): Promise<WidgetServer> {
    if (!this.widgetServer) {
      this.widgetServer = new WidgetServer();
      await this.widgetServer.start();
    }
    return this.widgetServer;
  }
  
  async renderInBrowser(
    html: string,
    protocol: DetectedProtocol,
    toolResult: unknown,
    toolName: string,
    viewport?: { width: number; height: number }
  ): Promise<BrowserRenderResult> {
    const errors: string[] = [];
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    
    await page.setViewportSize(viewport ?? { width: 800, height: 600 });
    
    // Capture console errors
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });
    
    // Use widget server for real iframe-based rendering
    const server = await this.getWidgetServer();
    const { hostUrl } = server.createSession(html, toolResult, toolName, protocol);
    
    // Navigate to host page (which contains iframe with widget)
    await page.goto(hostUrl, { waitUntil: "networkidle" });
    
    // Wait for widget to initialize and receive tool result
    await page.waitForTimeout(500);
    
    return {
      page,
      errors,
    };
  }
  
  async dispose(): Promise<void> {
    // ... existing browser cleanup ...
    
    if (this.widgetServer) {
      await this.widgetServer.stop();
      this.widgetServer = undefined;
    }
  }
}
```

### Phase 3: Update Screenshot Tool

Modify `screenshot_widget` to capture the iframe content, not the host page.

```typescript
// Changes to screenshot-widget handler

// After rendering, get the iframe frame and screenshot it
const frame = page.frame({ url: /\/widget\// });
if (frame) {
  const screenshotResult = await frame.locator("body").screenshot({
    type: format,
  });
  // ... rest of screenshot handling
} else {
  // Fallback to full page screenshot
  const screenshotResult = await page.screenshot({ type: format });
}
```

## Benefits

1. **Real postMessage communication** - No need for mocks; ext-apps SDK validates correctly
2. **Accurate rendering** - Widgets render exactly as they would in a real MCP Apps host
3. **Protocol correctness** - Both MCP and OpenAI protocols work with proper message flow
4. **Bidirectional support** - Can handle tool calls from widgets back to the server

## Considerations

### Port Management
- Use ephemeral ports (port 0) to avoid conflicts
- Server binds to 127.0.0.1 only for security
- Clean up server on inspector shutdown

### Session Lifecycle
- Sessions are short-lived (5 minute TTL)
- Automatic cleanup prevents memory leaks
- Each screenshot/preview creates a new session

### Security
- Server only accessible from localhost
- Session IDs are random UUIDs
- No sensitive data persisted

### Performance
- Minimal overhead from local HTTP requests
- Browser can cache static assets
- Sessions cleaned up promptly

## Testing

Add integration tests that verify the full rendering flow:

```typescript
describe("Iframe-based rendering", () => {
  it("should render MCP widget with tool data", async () => {
    const manager = new UIHostManager();
    const widgetHtml = `<html>...ext-apps widget...</html>`;
    
    const result = await manager.renderInBrowser(
      widgetHtml,
      "mcp",
      { temperature: 22 },
      "get_weather"
    );
    
    const frame = result.page.frame({ url: /\/widget\// });
    const bodyText = await frame?.evaluate(() => document.body.innerText);
    
    expect(bodyText).toContain("22"); // Temperature should be rendered
    expect(result.errors).toHaveLength(0);
    
    await result.page.close();
    await manager.dispose();
  });
});
```

## Migration Path

1. Implement `WidgetServer` class
2. Add it to `UIHostManager` 
3. Update `renderInBrowser` to use iframe approach
4. Update screenshot tools to capture iframe content
5. Add/update tests
6. Remove old `addInitScript` code path
