/**
 * Dashboard Server
 *
 * HTTP route handlers for the real-time browser dashboard.
 * Routes:
 * - GET /dashboard - Serve dashboard HTML
 * - GET /dashboard/stream?sessionId={id} - SSE screencast stream
 * - GET /dashboard/logs?sessionId={id} - SSE log stream
 * - GET /dashboard/sessions - List active sessions (JSON)
 * - GET /dashboard/globals - Get current environment state (JSON)
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

  // GET /dashboard/logs?sessionId={id} - SSE log stream
  if (pathname === "/dashboard/logs" && req.method === "GET") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing sessionId parameter" }));
      return true;
    }
    await startLogStream(req, res, connectionManager, sessionId);
    return true;
  }

  // GET /dashboard/globals - Get current environment state
  if (pathname === "/dashboard/globals" && req.method === "GET") {
    serveGlobals(res, connectionManager);
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

    html, body {
      height: 100%;
      overflow: hidden;
    }

    body {
      font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
      background-color: #191a1a;
      color: #e8e8e8;
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
      flex-shrink: 0;
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
      padding: 1rem;
      background-color: #191a1a;
      min-height: 0;
      overflow: hidden;
    }

    .display-container {
      background-color: #202222;
      border-radius: 12px;
      border: 1px solid #2d2f2f;
      overflow: hidden;
      max-width: 100%;
      max-height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
    }

    .display-container.streaming {
      height: 100%;
    }

    .display-container img {
      display: block;
      width: auto;
      height: 100%;
      max-width: 100%;
      object-fit: contain;
    }

    .placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      text-align: center;
      color: #6b7280;
      min-width: 300px;
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
      flex-shrink: 0;
    }

    .error-banner.visible {
      display: block;
    }

    .hidden {
      display: none !important;
    }

    /* Content wrapper for main + logs panel */
    .content-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    /* Resize handle between main and logs panel */
    .resize-handle {
      height: 6px;
      background-color: #2d2f2f;
      cursor: ns-resize;
      flex-shrink: 0;
      transition: background-color 0.15s ease;
    }

    .resize-handle:hover,
    .resize-handle.active {
      background-color: #20b2aa;
    }

    /* Logs panel */
    .logs-panel {
      background-color: #000000;
      border-top: 1px solid #2d2f2f;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      overflow: hidden;
    }

    .logs-panel.collapsed {
      height: 36px !important;
    }

    .logs-panel.collapsed .logs-container {
      display: none;
    }

    .logs-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 1rem;
      background-color: #0a0a0a;
      border-bottom: 1px solid #1a1a1a;
      flex-shrink: 0;
    }

    .logs-title {
      font-size: 0.75rem;
      font-weight: 500;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .logs-controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .log-count {
      font-size: 0.6875rem;
      color: #6b7280;
    }

    .clear-logs-btn,
    .toggle-logs-btn {
      font-family: inherit;
      background-color: transparent;
      border: 1px solid #3d4040;
      color: #9ca3af;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.6875rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .clear-logs-btn:hover,
    .toggle-logs-btn:hover {
      border-color: #20b2aa;
      color: #e8e8e8;
    }

    .toggle-logs-btn {
      padding: 0.25rem 0.375rem;
      font-size: 0.625rem;
    }

    .logs-panel.collapsed .toggle-logs-btn {
      transform: rotate(180deg);
    }

    .logs-container {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem;
      font-size: 0.75rem;
      min-height: 0;
    }

    /* Scrollbar styling for logs */
    .logs-container::-webkit-scrollbar {
      width: 8px;
    }

    .logs-container::-webkit-scrollbar-track {
      background: #0a0a0a;
    }

    .logs-container::-webkit-scrollbar-thumb {
      background: #3d4040;
      border-radius: 4px;
    }

    .logs-container::-webkit-scrollbar-thumb:hover {
      background: #4d5050;
    }

    /* Log entries */
    .log-entry {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.25rem 0.5rem;
      border-radius: 3px;
      line-height: 1.4;
    }

    .log-entry:hover {
      background-color: rgba(255, 255, 255, 0.03);
    }

    .log-time {
      color: #4b5563;
      font-size: 0.6875rem;
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
    }

    .log-badge {
      font-size: 0.5625rem;
      padding: 0.125rem 0.375rem;
      border-radius: 3px;
      text-transform: uppercase;
      font-weight: 500;
      flex-shrink: 0;
    }

    .log-badge-host {
      background-color: rgba(0, 212, 255, 0.15);
      color: #00d4ff;
    }

    .log-badge-widget {
      background-color: rgba(179, 157, 219, 0.15);
      color: #b39ddb;
    }

    .log-badge-unknown {
      background-color: rgba(107, 114, 128, 0.15);
      color: #6b7280;
    }

    .log-level {
      font-size: 0.6875rem;
      flex-shrink: 0;
      min-width: 40px;
    }

    .log-text {
      flex: 1;
      word-break: break-word;
      white-space: pre-wrap;
    }

    /* Log level colors */
    .log-entry.log-error .log-level,
    .log-entry.log-error .log-text {
      color: #ff6b6b;
    }

    .log-entry.log-warn .log-level,
    .log-entry.log-warn .log-text {
      color: #ffc107;
    }

    .log-entry.log-info .log-level,
    .log-entry.log-info .log-text {
      color: #64b5f6;
    }

    .log-entry.log-debug .log-level,
    .log-entry.log-debug .log-text {
      color: #9e9e9e;
    }

    .log-entry.log-log .log-level,
    .log-entry.log-log .log-text {
      color: #e8e8e8;
    }

    /* No logs placeholder */
    .logs-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #4b5563;
      font-size: 0.75rem;
    }

    /* Header layout */
    .header-left {
      display: flex;
      align-items: center;
      gap: 1.25rem;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    /* Toolbar */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-left: 0.5rem;
    }

    .toolbar-btn {
      background: transparent;
      border: none;
      border-radius: 4px;
      padding: 0.375rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #6b7280;
      transition: all 0.15s ease;
    }

    .toolbar-btn:hover {
      color: #9ca3af;
      background-color: rgba(255, 255, 255, 0.05);
    }

    .toolbar-btn.active {
      color: #20b2aa;
      background-color: rgba(32, 178, 170, 0.1);
    }

    /* Content row for main + globals panel */
    .content-row {
      flex: 1;
      display: flex;
      flex-direction: row;
      min-height: 0;
      overflow: hidden;
    }

    /* Globals Panel */
    .globals-panel {
      background-color: #0d0e0e;
      border-left: 1px solid #2d2f2f;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      overflow: hidden;
      transition: width 0.25s ease, opacity 0.2s ease;
      width: 280px;
    }

    .globals-panel.collapsed {
      width: 0;
      border-left: none;
      opacity: 0;
    }

    .globals-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background-color: #0a0a0a;
      border-bottom: 1px solid #1a1a1a;
      flex-shrink: 0;
    }

    .globals-panel-title {
      font-size: 0.75rem;
      font-weight: 500;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .globals-panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 0.75rem;
      font-size: 0.75rem;
      min-height: 0;
    }

    .globals-panel-content::-webkit-scrollbar {
      width: 8px;
    }

    .globals-panel-content::-webkit-scrollbar-track {
      background: #0a0a0a;
    }

    .globals-panel-content::-webkit-scrollbar-thumb {
      background: #3d4040;
      border-radius: 4px;
    }

    .globals-section {
      margin-bottom: 1rem;
    }

    .globals-section-title {
      font-size: 0.6875rem;
      font-weight: 600;
      color: #20b2aa;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
      padding-bottom: 0.25rem;
      border-bottom: 1px solid #2d2f2f;
    }

    .globals-item {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 0.25rem 0;
      gap: 0.5rem;
    }

    .globals-item-label {
      color: #6b7280;
      font-size: 0.6875rem;
      flex-shrink: 0;
    }

    .globals-item-value {
      color: #e8e8e8;
      font-size: 0.6875rem;
      text-align: right;
      word-break: break-word;
    }

    .globals-loading {
      color: #6b7280;
      text-align: center;
      padding: 1rem;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-left">
      <h1>MCP Inspector Dashboard</h1>
    </div>
    <div class="header-right">
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
      <div class="toolbar">
        <button class="toolbar-btn active" id="toggle-logs-panel-btn" title="Toggle Logs Panel">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <line x1="2" y1="4" x2="14" y2="4" />
            <line x1="2" y1="8" x2="14" y2="8" />
            <line x1="2" y1="12" x2="10" y2="12" />
          </svg>
        </button>
        <button class="toolbar-btn active" id="toggle-globals-panel-btn" title="Toggle Globals Panel">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="12" height="12" rx="2" />
            <line x1="10" y1="2" x2="10" y2="14" />
          </svg>
        </button>
      </div>
    </div>
  </header>

  <div class="error-banner" id="error-banner"></div>

  <div class="content-wrapper">
    <div class="content-row">
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

      <div class="globals-panel" id="globals-panel">
        <div class="globals-panel-header">
          <span class="globals-panel-title">Environment</span>
        </div>
        <div class="globals-panel-content" id="globals-panel-content">
          <div class="globals-loading">Loading...</div>
        </div>
      </div>
    </div>

    <div class="resize-handle" id="resize-handle"></div>

    <div class="logs-panel" id="logs-panel">
      <div class="logs-header">
        <span class="logs-title">Session Logs</span>
        <div class="logs-controls">
          <span class="log-count" id="log-count">0 logs</span>
          <button class="clear-logs-btn" id="clear-logs-btn">Clear</button>
          <button class="toggle-logs-btn" id="toggle-logs-btn">\u25BC</button>
        </div>
      </div>
      <div class="logs-container" id="logs-container">
        <div class="logs-empty" id="logs-empty">No logs yet</div>
      </div>
    </div>
  </div>

  <script>
    // DOM elements
    const sessionSelect = document.getElementById('session-select');
    const displayContainer = document.querySelector('.display-container');
    const streamImage = document.getElementById('stream-image');
    const placeholder = document.getElementById('placeholder');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const errorBanner = document.getElementById('error-banner');

    // Logs panel DOM elements
    const logsPanel = document.getElementById('logs-panel');
    const logsContainer = document.getElementById('logs-container');
    const logsEmpty = document.getElementById('logs-empty');
    const logCount = document.getElementById('log-count');
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    const toggleLogsBtn = document.getElementById('toggle-logs-btn');
    const resizeHandle = document.getElementById('resize-handle');

    // Globals panel DOM elements
    const globalsPanel = document.getElementById('globals-panel');
    const globalsPanelContent = document.getElementById('globals-panel-content');
    const toggleLogsPanelBtn = document.getElementById('toggle-logs-panel-btn');
    const toggleGlobalsPanelBtn = document.getElementById('toggle-globals-panel-btn');

    // State
    let eventSource = null;
    let logEventSource = null;
    let currentSessionId = null;
    let sessionPollInterval = null;
    let reconnectTimeout = null;
    let displayedLogCount = 0;
    let globalsPollInterval = null;

    // Logs panel state (persisted in localStorage)
    const STORAGE_KEY_PANEL_HEIGHT = 'mcp-dashboard-logs-panel-height';
    const STORAGE_KEY_PANEL_COLLAPSED = 'mcp-dashboard-logs-panel-collapsed';
    const STORAGE_KEY_LOGS_VISIBLE = 'mcp-dashboard-logs-panel-visible';
    const STORAGE_KEY_GLOBALS_VISIBLE = 'mcp-dashboard-globals-panel-visible';
    const DEFAULT_PANEL_HEIGHT = 200;
    const MIN_PANEL_HEIGHT = 100;

    let isPanelCollapsed = localStorage.getItem(STORAGE_KEY_PANEL_COLLAPSED) === 'true';
    let panelHeight = parseInt(localStorage.getItem(STORAGE_KEY_PANEL_HEIGHT) || DEFAULT_PANEL_HEIGHT, 10);
    let isLogsPanelVisible = localStorage.getItem(STORAGE_KEY_LOGS_VISIBLE) !== 'false';
    let isGlobalsPanelVisible = localStorage.getItem(STORAGE_KEY_GLOBALS_VISIBLE) !== 'false';

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

    // ============================================
    // LOGS PANEL FUNCTIONS
    // ============================================

    // Initialize logs panel state
    function initLogsPanel() {
      // Ensure saved height is within valid bounds for current viewport
      const reservedHeight = 250;
      const maxHeight = window.innerHeight - reservedHeight;
      panelHeight = Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, panelHeight));

      // Apply saved height
      logsPanel.style.height = panelHeight + 'px';

      // Apply collapsed state
      if (isPanelCollapsed) {
        logsPanel.classList.add('collapsed');
      }
    }

    // Toggle panel collapsed state
    function toggleLogsPanel() {
      isPanelCollapsed = !isPanelCollapsed;
      logsPanel.classList.toggle('collapsed', isPanelCollapsed);
      localStorage.setItem(STORAGE_KEY_PANEL_COLLAPSED, isPanelCollapsed);
    }

    // Clear all logs from display
    function clearLogs() {
      logsContainer.innerHTML = '<div class="logs-empty" id="logs-empty">No logs yet</div>';
      displayedLogCount = 0;
      updateLogCount();
    }

    // Update log count display
    function updateLogCount() {
      logCount.textContent = displayedLogCount + ' log' + (displayedLogCount !== 1 ? 's' : '');
    }

    // Format timestamp for display
    function formatLogTime(timestamp) {
      const date = new Date(timestamp);
      const h = date.getHours().toString().padStart(2, '0');
      const m = date.getMinutes().toString().padStart(2, '0');
      const s = date.getSeconds().toString().padStart(2, '0');
      const ms = date.getMilliseconds().toString().padStart(3, '0');
      return h + ':' + m + ':' + s + '.' + ms;
    }

    // Create a log entry element
    function createLogEntry(log) {
      const entry = document.createElement('div');
      entry.className = 'log-entry log-' + log.level + ' log-source-' + log.source;

      const time = document.createElement('span');
      time.className = 'log-time';
      time.textContent = formatLogTime(log.timestamp);

      const badge = document.createElement('span');
      badge.className = 'log-badge log-badge-' + log.source;
      badge.textContent = log.source;

      const level = document.createElement('span');
      level.className = 'log-level';
      level.textContent = '[' + log.level + ']';

      const text = document.createElement('span');
      text.className = 'log-text';
      text.textContent = log.text;

      entry.appendChild(time);
      entry.appendChild(badge);
      entry.appendChild(level);
      entry.appendChild(text);

      return entry;
    }

    // Add a log entry to the display
    function addLogEntry(log) {
      // Remove empty placeholder if present
      const empty = logsContainer.querySelector('.logs-empty');
      if (empty) {
        empty.remove();
      }

      const entry = createLogEntry(log);
      logsContainer.appendChild(entry);
      displayedLogCount++;
      updateLogCount();

      // Auto-scroll to bottom
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    // Add multiple log entries (for initial batch)
    function addLogEntries(logs) {
      if (logs.length === 0) return;

      // Remove empty placeholder if present
      const empty = logsContainer.querySelector('.logs-empty');
      if (empty) {
        empty.remove();
      }

      const fragment = document.createDocumentFragment();
      logs.forEach(log => {
        fragment.appendChild(createLogEntry(log));
      });

      logsContainer.appendChild(fragment);
      displayedLogCount += logs.length;
      updateLogCount();

      // Auto-scroll to bottom
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    // Start log stream for a session
    function startLogStream(sessionId) {
      if (!sessionId) return;

      // Stop existing log stream
      stopLogStream();

      // Create EventSource for log SSE
      logEventSource = new EventSource('/dashboard/logs?sessionId=' + encodeURIComponent(sessionId));

      logEventSource.addEventListener('logs', (event) => {
        const data = JSON.parse(event.data);
        if (data.logs && data.logs.length > 0) {
          addLogEntries(data.logs);
        }
      });

      logEventSource.addEventListener('log', (event) => {
        const log = JSON.parse(event.data);
        addLogEntry(log);
      });

      logEventSource.addEventListener('disconnected', (event) => {
        // Session ended, stop stream
        stopLogStream();
      });

      logEventSource.addEventListener('noSession', (event) => {
        // Session not found, stop stream
        stopLogStream();
      });

      logEventSource.onerror = () => {
        // Connection lost, will be restarted when main stream reconnects
      };
    }

    // Stop log stream
    function stopLogStream() {
      if (logEventSource) {
        logEventSource.close();
        logEventSource = null;
      }
    }

    // ============================================
    // RESIZE HANDLER
    // ============================================

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    function onResizeStart(e) {
      if (isPanelCollapsed) return;

      isResizing = true;
      startY = e.clientY;
      startHeight = logsPanel.offsetHeight;
      resizeHandle.classList.add('active');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';

      document.addEventListener('mousemove', onResizeMove);
      document.addEventListener('mouseup', onResizeEnd);
    }

    function onResizeMove(e) {
      if (!isResizing) return;

      const deltaY = startY - e.clientY;
      // Calculate max height: leave at least 150px for the UI area
      // Account for header (~56px), footer (~36px), resize handle (6px), and min UI area (150px)
      const reservedHeight = 250;
      const maxHeight = window.innerHeight - reservedHeight;
      const newHeight = Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, startHeight + deltaY));

      logsPanel.style.height = newHeight + 'px';
      panelHeight = newHeight;
    }

    function onResizeEnd() {
      if (!isResizing) return;

      isResizing = false;
      resizeHandle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      document.removeEventListener('mousemove', onResizeMove);
      document.removeEventListener('mouseup', onResizeEnd);

      // Save to localStorage
      localStorage.setItem(STORAGE_KEY_PANEL_HEIGHT, panelHeight);
    }

    // Event listeners for logs panel
    toggleLogsBtn.addEventListener('click', toggleLogsPanel);
    clearLogsBtn.addEventListener('click', clearLogs);
    resizeHandle.addEventListener('mousedown', onResizeStart);

    // Adjust panel height on window resize
    window.addEventListener('resize', () => {
      if (isPanelCollapsed) return;
      const reservedHeight = 250;
      const maxHeight = window.innerHeight - reservedHeight;
      if (panelHeight > maxHeight) {
        panelHeight = Math.max(MIN_PANEL_HEIGHT, maxHeight);
        logsPanel.style.height = panelHeight + 'px';
        localStorage.setItem(STORAGE_KEY_PANEL_HEIGHT, panelHeight);
      }
    });

    // ============================================
    // GLOBALS PANEL FUNCTIONS
    // ============================================

    // Fetch globals from server
    async function fetchGlobals() {
      try {
        const res = await fetch('/dashboard/globals');
        const data = await res.json();
        return data.globals || null;
      } catch (e) {
        console.error('Failed to fetch globals:', e);
        return null;
      }
    }

    // Render globals panel content
    function renderGlobals(globals) {
      if (!globals) {
        globalsPanelContent.innerHTML = '<div class="globals-loading">Loading...</div>';
        return;
      }

      const { theme, displayMode, locale, timeZone, viewport, maxHeight, safeAreaInsets, userAgent, userLocation } = globals;

      let html = '';

      // Display section
      html += '<div class="globals-section">';
      html += '<div class="globals-section-title">Display</div>';
      html += '<div class="globals-item"><span class="globals-item-label">Theme</span><span class="globals-item-value">' + theme + '</span></div>';
      html += '<div class="globals-item"><span class="globals-item-label">Display Mode</span><span class="globals-item-value">' + displayMode + '</span></div>';
      html += '</div>';

      // Locale section
      html += '<div class="globals-section">';
      html += '<div class="globals-section-title">Locale</div>';
      html += '<div class="globals-item"><span class="globals-item-label">Locale</span><span class="globals-item-value">' + locale + '</span></div>';
      html += '<div class="globals-item"><span class="globals-item-label">Timezone</span><span class="globals-item-value">' + timeZone + '</span></div>';
      html += '</div>';

      // Viewport section
      html += '<div class="globals-section">';
      html += '<div class="globals-section-title">Viewport</div>';
      html += '<div class="globals-item"><span class="globals-item-label">Dimensions</span><span class="globals-item-value">' + viewport.width + ' \\u00D7 ' + viewport.height + '</span></div>';
      if (maxHeight !== undefined) {
        html += '<div class="globals-item"><span class="globals-item-label">Max Height</span><span class="globals-item-value">' + maxHeight + 'px</span></div>';
      }
      html += '</div>';

      // Safe Area section
      html += '<div class="globals-section">';
      html += '<div class="globals-section-title">Safe Area</div>';
      html += '<div class="globals-item"><span class="globals-item-label">Insets</span><span class="globals-item-value">T:' + safeAreaInsets.top + ' R:' + safeAreaInsets.right + ' B:' + safeAreaInsets.bottom + ' L:' + safeAreaInsets.left + '</span></div>';
      html += '</div>';

      // Device section
      html += '<div class="globals-section">';
      html += '<div class="globals-section-title">Device</div>';
      const deviceType = userAgent && userAgent.device ? userAgent.device.type || 'unknown' : 'unknown';
      const hasHover = userAgent && userAgent.capabilities ? (userAgent.capabilities.hover ? 'Yes' : 'No') : 'Yes';
      const hasTouch = userAgent && userAgent.capabilities ? (userAgent.capabilities.touch ? 'Yes' : 'No') : 'No';
      html += '<div class="globals-item"><span class="globals-item-label">Type</span><span class="globals-item-value">' + deviceType + '</span></div>';
      html += '<div class="globals-item"><span class="globals-item-label">Hover</span><span class="globals-item-value">' + hasHover + '</span></div>';
      html += '<div class="globals-item"><span class="globals-item-label">Touch</span><span class="globals-item-value">' + hasTouch + '</span></div>';
      html += '</div>';

      // Location section (if present)
      if (userLocation) {
        html += '<div class="globals-section">';
        html += '<div class="globals-section-title">Location</div>';
        if (userLocation.city) html += '<div class="globals-item"><span class="globals-item-label">City</span><span class="globals-item-value">' + userLocation.city + '</span></div>';
        if (userLocation.region) html += '<div class="globals-item"><span class="globals-item-label">Region</span><span class="globals-item-value">' + userLocation.region + '</span></div>';
        if (userLocation.country) html += '<div class="globals-item"><span class="globals-item-label">Country</span><span class="globals-item-value">' + userLocation.country + '</span></div>';
        if (userLocation.timezone) html += '<div class="globals-item"><span class="globals-item-label">Timezone</span><span class="globals-item-value">' + userLocation.timezone + '</span></div>';
        html += '</div>';
      }

      globalsPanelContent.innerHTML = html;
    }

    // Update globals panel
    async function updateGlobals() {
      const globals = await fetchGlobals();
      renderGlobals(globals);
    }

    // Start globals polling
    function startGlobalsPolling() {
      if (globalsPollInterval) clearInterval(globalsPollInterval);
      updateGlobals();
      globalsPollInterval = setInterval(updateGlobals, 2000);
    }

    // Stop globals polling
    function stopGlobalsPolling() {
      if (globalsPollInterval) {
        clearInterval(globalsPollInterval);
        globalsPollInterval = null;
      }
    }

    // Initialize globals panel
    function initGlobalsPanel() {
      // Apply visibility state
      if (!isGlobalsPanelVisible) {
        globalsPanel.classList.add('collapsed');
        toggleGlobalsPanelBtn.classList.remove('active');
      }
      startGlobalsPolling();
    }

    // Toggle globals panel visibility
    function toggleGlobalsPanelVisibility() {
      isGlobalsPanelVisible = !isGlobalsPanelVisible;
      globalsPanel.classList.toggle('collapsed', !isGlobalsPanelVisible);
      toggleGlobalsPanelBtn.classList.toggle('active', isGlobalsPanelVisible);
      localStorage.setItem(STORAGE_KEY_GLOBALS_VISIBLE, isGlobalsPanelVisible);
    }

    // Toggle logs panel visibility (from toolbar)
    function toggleLogsPanelVisibility() {
      isLogsPanelVisible = !isLogsPanelVisible;
      logsPanel.style.display = isLogsPanelVisible ? 'flex' : 'none';
      resizeHandle.style.display = isLogsPanelVisible ? 'block' : 'none';
      toggleLogsPanelBtn.classList.toggle('active', isLogsPanelVisible);
      localStorage.setItem(STORAGE_KEY_LOGS_VISIBLE, isLogsPanelVisible);
    }

    // Initialize logs panel visibility
    function initLogsPanelVisibility() {
      if (!isLogsPanelVisible) {
        logsPanel.style.display = 'none';
        resizeHandle.style.display = 'none';
        toggleLogsPanelBtn.classList.remove('active');
      }
    }

    // Event listeners for toolbar buttons
    toggleGlobalsPanelBtn.addEventListener('click', toggleGlobalsPanelVisibility);
    toggleLogsPanelBtn.addEventListener('click', toggleLogsPanelVisibility);

    // ============================================
    // MAIN STREAM FUNCTIONS
    // ============================================

    // Start streaming for a session
    function startStream(sessionId) {
      if (!sessionId) return;

      // Stop existing stream
      stopStream();

      currentSessionId = sessionId;
      setStatus('connected', 'Connecting...');

      // Start log stream alongside video stream
      startLogStream(sessionId);

      // Create EventSource for SSE
      eventSource = new EventSource(\`/dashboard/stream?sessionId=\${encodeURIComponent(sessionId)}\`);

      eventSource.addEventListener('frame', (event) => {
        hideError();
        setStatus('streaming', 'Streaming');
        const data = JSON.parse(event.data);
        streamImage.src = data.image;
        streamImage.classList.remove('hidden');
        placeholder.classList.add('hidden');
        displayContainer.classList.add('streaming');
      });

      eventSource.addEventListener('noSession', (event) => {
        const data = JSON.parse(event.data);
        setStatus('disconnected', 'Session not found');
        streamImage.classList.add('hidden');
        placeholder.classList.remove('hidden');
        displayContainer.classList.remove('streaming');
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

      // Stop log stream and clear logs when session changes
      stopLogStream();
      clearLogs();

      setStatus('', 'Disconnected');
      streamImage.classList.add('hidden');
      placeholder.classList.remove('hidden');
      displayContainer.classList.remove('streaming');
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
      initLogsPanel();
      initLogsPanelVisibility();
      initGlobalsPanel();
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
 * Serve the current environment/globals state
 */
function serveGlobals(res: ServerResponse, connectionManager: ConnectionManager): void {
  const environmentState = connectionManager.getEnvironmentState();

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify({ globals: environmentState }));
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

/**
 * Start SSE log stream for a session
 */
async function startLogStream(
  req: IncomingMessage,
  res: ServerResponse,
  connectionManager: ConnectionManager,
  sessionId: string
): Promise<void> {
  const sessionManager = connectionManager.getWidgetSessionManager();
  const session = sessionManager.getSession(sessionId);

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // If no session, send noSession event
  if (!session) {
    res.write(
      `event: noSession\ndata: ${JSON.stringify({ message: "Session not found or closed" })}\n\n`
    );
    return;
  }

  // Send initial batch of existing logs
  const existingLogs = session.consoleLogs;
  if (existingLogs.length > 0) {
    res.write(`event: logs\ndata: ${JSON.stringify({ logs: existingLogs })}\n\n`);
  }

  // Track how many logs we've sent
  let sentLogCount = existingLogs.length;

  // Set up polling for new logs
  const pollInterval = setInterval(() => {
    const currentSession = sessionManager.getSession(sessionId);

    // If session no longer exists, send disconnect and clean up
    if (!currentSession) {
      res.write(`event: disconnected\ndata: ${JSON.stringify({ message: "Session ended" })}\n\n`);
      clearInterval(pollInterval);
      if (!res.writableEnded) {
        res.end();
      }
      return;
    }

    // Check for new logs
    const currentLogs = currentSession.consoleLogs;
    if (currentLogs.length > sentLogCount) {
      // Send only the new logs
      const newLogs = currentLogs.slice(sentLogCount);
      for (const log of newLogs) {
        if (!res.writableEnded) {
          res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
        }
      }
      sentLogCount = currentLogs.length;
    }
  }, 100); // Poll every 100ms

  // Clean up on connection close
  const cleanup = (): void => {
    clearInterval(pollInterval);
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
}
