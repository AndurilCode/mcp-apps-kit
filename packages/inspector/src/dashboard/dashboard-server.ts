/**
 * Dashboard Server
 *
 * HTTP route handlers for the real-time browser dashboard.
 * Routes:
 * - GET /dashboard - Serve dashboard HTML
 * - GET /dashboard/stream?sessionId={id} - SSE screencast stream
 * - GET /dashboard/sessions - List active sessions (JSON)
 */

import type { IncomingMessage, ServerResponse } from "http";
import type { ConnectionManager } from "../connection";
import { CDPStreamer } from "./cdp-streamer";

// Singleton CDP streamer (shared across all requests)
let cdpStreamer: CDPStreamer | null = null;

/**
 * Get or create the CDP streamer
 */
function getCDPStreamer(debug: boolean): CDPStreamer {
  cdpStreamer ??= new CDPStreamer({ debug });
  return cdpStreamer;
}

/**
 * Handle dashboard requests
 *
 * @param req - Incoming HTTP request
 * @param res - Server response
 * @param connectionManager - Connection manager for accessing sessions
 * @returns true if the request was handled, false otherwise
 */
export async function handleDashboardRequest(
  req: IncomingMessage,
  res: ServerResponse,
  connectionManager: ConnectionManager
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = url.pathname;

  // GET /dashboard - Serve HTML
  if (pathname === "/dashboard" && req.method === "GET") {
    serveDashboardHtml(res);
    return true;
  }

  // GET /dashboard/sessions - List active sessions
  if (pathname === "/dashboard/sessions" && req.method === "GET") {
    serveSessionList(res, connectionManager);
    return true;
  }

  // GET /dashboard/stream?sessionId={id} - SSE screencast stream
  if (pathname === "/dashboard/stream" && req.method === "GET") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing sessionId parameter" }));
      return true;
    }
    await startScreencastStream(req, res, connectionManager, sessionId);
    return true;
  }

  return false;
}

/**
 * Serve the dashboard HTML page (inlined to avoid bundling issues)
 * Styled in Perplexity-like theme with monospace coding font
 */
function serveDashboardHtml(res: ServerResponse): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Inspector Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
      background-color: #191a1a;
      color: #e8e8e8;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    header {
      background-color: #202222;
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #2d2f2f;
    }

    h1 {
      font-size: 1rem;
      font-weight: 500;
      color: #20b2aa;
      letter-spacing: -0.02em;
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 1.25rem;
    }

    label {
      font-size: 0.8125rem;
      color: #6b7280;
      font-weight: 400;
    }

    select {
      font-family: inherit;
      background-color: #2d2f2f;
      color: #e8e8e8;
      border: 1px solid #3d4040;
      border-radius: 8px;
      padding: 0.5rem 1rem;
      font-size: 0.8125rem;
      cursor: pointer;
      min-width: 220px;
      transition: all 0.15s ease;
    }

    select:hover {
      border-color: #20b2aa;
      background-color: #343636;
    }

    select:focus {
      outline: none;
      border-color: #20b2aa;
      box-shadow: 0 0 0 2px rgba(32, 178, 170, 0.15);
    }

    .status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      color: #6b7280;
      background-color: #2d2f2f;
      padding: 0.375rem 0.75rem;
      border-radius: 6px;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: #6b7280;
    }

    .status-dot.connected {
      background-color: #20b2aa;
    }

    .status-dot.streaming {
      background-color: #20b2aa;
      animation: pulse 1.5s infinite;
      box-shadow: 0 0 8px rgba(32, 178, 170, 0.5);
    }

    .status-dot.disconnected {
      background-color: #ef4444;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    main {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background-color: #191a1a;
    }

    .display-container {
      background-color: #202222;
      border-radius: 12px;
      border: 1px solid #2d2f2f;
      overflow: hidden;
      max-width: 100%;
      max-height: calc(100vh - 140px);
      position: relative;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
    }

    .display-container img {
      display: block;
      max-width: 100%;
      max-height: calc(100vh - 140px);
      object-fit: contain;
    }

    .placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4rem 2rem;
      text-align: center;
      color: #6b7280;
      min-width: 450px;
      min-height: 320px;
    }

    .placeholder svg {
      width: 56px;
      height: 56px;
      margin-bottom: 1.25rem;
      opacity: 0.4;
      color: #20b2aa;
    }

    .placeholder h2 {
      font-size: 0.9375rem;
      font-weight: 500;
      margin-bottom: 0.625rem;
      color: #9ca3af;
      letter-spacing: -0.01em;
    }

    .placeholder p {
      font-size: 0.8125rem;
      max-width: 320px;
      color: #6b7280;
      line-height: 1.6;
    }

    .error-banner {
      background-color: rgba(239, 68, 68, 0.1);
      color: #fca5a5;
      padding: 0.75rem 1.5rem;
      font-size: 0.8125rem;
      display: none;
      border-bottom: 1px solid rgba(239, 68, 68, 0.2);
    }

    .error-banner.visible {
      display: block;
    }

    footer {
      background-color: #202222;
      padding: 0.75rem 1rem;
      font-size: 0.6875rem;
      color: #4b5563;
      text-align: center;
      border-top: 1px solid #2d2f2f;
      letter-spacing: 0.02em;
    }

    .hidden {
      display: none !important;
    }
  </style>
</head>
<body>
  <header>
    <h1>MCP Inspector Dashboard</h1>
    <div class="controls">
      <label for="session-select">Session</label>
      <select id="session-select">
        <option value="">Select a session...</option>
      </select>
      <div class="status">
        <span class="status-dot" id="status-dot"></span>
        <span id="status-text">Disconnected</span>
      </div>
    </div>
  </header>

  <div class="error-banner" id="error-banner"></div>

  <main>
    <div class="display-container">
      <img id="stream-image" class="hidden" alt="Live browser view">
      <div class="placeholder" id="placeholder">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <h2>No Active Widget Session</h2>
        <p>Connect to an MCP server and call a tool that creates a UI session to see live browser content.</p>
      </div>
    </div>
  </main>

  <footer>
    MCP Inspector // Real-time browser dashboard
  </footer>

  <script>
    // DOM elements
    const sessionSelect = document.getElementById('session-select');
    const streamImage = document.getElementById('stream-image');
    const placeholder = document.getElementById('placeholder');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const errorBanner = document.getElementById('error-banner');

    // State
    let eventSource = null;
    let currentSessionId = null;
    let sessionPollInterval = null;
    let reconnectTimeout = null;

    // Fetch sessions from server
    async function fetchSessions() {
      try {
        const res = await fetch('/dashboard/sessions');
        const data = await res.json();
        return data.sessions || [];
      } catch (e) {
        console.error('Failed to fetch sessions:', e);
        return [];
      }
    }

    // Update session dropdown
    async function updateSessionDropdown() {
      const sessions = await fetchSessions();
      const currentValue = sessionSelect.value;

      // Clear options except the first
      while (sessionSelect.options.length > 1) {
        sessionSelect.remove(1);
      }

      // Add session options
      sessions.forEach(session => {
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = \`\${session.toolName} (\${session.id.slice(0, 8)}...)\`;
        sessionSelect.appendChild(option);
      });

      // Restore selection if still valid
      if (currentValue && sessions.some(s => s.id === currentValue)) {
        sessionSelect.value = currentValue;
      } else if (sessions.length > 0 && !currentSessionId) {
        // Auto-select first session if none selected
        sessionSelect.value = sessions[0].id;
        startStream(sessions[0].id);
      } else if (sessions.length === 0 && currentSessionId) {
        // Session no longer exists
        stopStream();
        sessionSelect.value = '';
      }
    }

    // Start session polling
    function startSessionPolling() {
      if (sessionPollInterval) clearInterval(sessionPollInterval);
      sessionPollInterval = setInterval(updateSessionDropdown, 2000);
    }

    // Stop session polling
    function stopSessionPolling() {
      if (sessionPollInterval) {
        clearInterval(sessionPollInterval);
        sessionPollInterval = null;
      }
    }

    // Update status display
    function setStatus(state, text) {
      statusDot.className = 'status-dot ' + state;
      statusText.textContent = text;
    }

    // Show error
    function showError(message) {
      errorBanner.textContent = message;
      errorBanner.classList.add('visible');
      setTimeout(() => {
        errorBanner.classList.remove('visible');
      }, 5000);
    }

    // Hide error
    function hideError() {
      errorBanner.classList.remove('visible');
    }

    // Start streaming for a session
    function startStream(sessionId) {
      if (!sessionId) return;

      // Stop existing stream
      stopStream();

      currentSessionId = sessionId;
      setStatus('connected', 'Connecting...');

      // Create EventSource for SSE
      eventSource = new EventSource(\`/dashboard/stream?sessionId=\${encodeURIComponent(sessionId)}\`);

      eventSource.addEventListener('frame', (event) => {
        hideError();
        setStatus('streaming', 'Streaming');
        const data = JSON.parse(event.data);
        streamImage.src = data.image;
        streamImage.classList.remove('hidden');
        placeholder.classList.add('hidden');
      });

      eventSource.addEventListener('noSession', (event) => {
        const data = JSON.parse(event.data);
        setStatus('disconnected', 'Session not found');
        streamImage.classList.add('hidden');
        placeholder.classList.remove('hidden');
        // Schedule reconnect attempt
        scheduleReconnect();
      });

      eventSource.addEventListener('error', (event) => {
        if (event.data) {
          const data = JSON.parse(event.data);
          showError(data.message);
        }
        setStatus('disconnected', 'Error');
        scheduleReconnect();
      });

      eventSource.onerror = () => {
        setStatus('disconnected', 'Connection lost');
        scheduleReconnect();
      };
    }

    // Stop streaming
    function stopStream() {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      currentSessionId = null;

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      setStatus('', 'Disconnected');
      streamImage.classList.add('hidden');
      placeholder.classList.remove('hidden');
    }

    // Schedule reconnect attempt
    function scheduleReconnect() {
      if (reconnectTimeout) return;
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        if (currentSessionId) {
          startStream(currentSessionId);
        }
      }, 2000);
    }

    // Event handlers
    sessionSelect.addEventListener('change', (e) => {
      const sessionId = e.target.value;
      if (sessionId) {
        startStream(sessionId);
      } else {
        stopStream();
      }
    });

    // Initialize
    (async function init() {
      await updateSessionDropdown();
      startSessionPolling();
    })();
  </script>
</body>
</html>`;

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(html);
}

/**
 * Serve the list of active sessions
 */
function serveSessionList(res: ServerResponse, connectionManager: ConnectionManager): void {
  const sessionManager = connectionManager.getWidgetSessionManager();
  const sessions = sessionManager.listSessions();

  // Return session info relevant to dashboard
  const sessionList = sessions.map((s) => ({
    id: s.id,
    toolName: s.toolName,
    protocol: s.protocol,
    createdAt: s.createdAt,
    lastAccessedAt: s.lastAccessedAt,
    source: s.source,
  }));

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify({ sessions: sessionList }));
}

/**
 * Start SSE screencast stream for a session
 */
async function startScreencastStream(
  req: IncomingMessage,
  res: ServerResponse,
  connectionManager: ConnectionManager,
  sessionId: string
): Promise<void> {
  const sessionManager = connectionManager.getWidgetSessionManager();
  const page = sessionManager.getPageForStreaming(sessionId);

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // If no session or page, send noSession event and keep connection open
  if (!page) {
    res.write(
      `event: noSession\ndata: ${JSON.stringify({ message: "Session not found or closed" })}\n\n`
    );
    // Don't close - let client reconnect or wait for session
    return;
  }

  // Get the CDP streamer
  const streamer = getCDPStreamer(false);

  // Create a unique stream ID for this connection (session + timestamp)
  const streamId = `${sessionId}-${Date.now()}`;

  // Set up cleanup handler
  const cleanup = (): void => {
    void streamer.stopScreencast(streamId);
  };

  req.on("close", cleanup);
  req.on("error", cleanup);

  try {
    // Start screencast
    await streamer.startScreencast(
      streamId,
      page,
      // On frame
      (frame) => {
        if (!res.writableEnded) {
          const data = JSON.stringify({
            timestamp: frame.timestamp,
            image: `data:image/jpeg;base64,${frame.data}`,
          });
          res.write(`event: frame\ndata: ${data}\n\n`);
        }
      },
      // On error
      (error) => {
        if (!res.writableEnded) {
          res.write(
            `event: error\ndata: ${JSON.stringify({ message: `Screencast error: ${error.message}` })}\n\n`
          );
        }
        cleanup();
      },
      // On touch (keep session alive)
      () => {
        sessionManager.touchSession(sessionId);
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.write(
      `event: error\ndata: ${JSON.stringify({ message: `Failed to start screencast: ${message}` })}\n\n`
    );
  }
}
