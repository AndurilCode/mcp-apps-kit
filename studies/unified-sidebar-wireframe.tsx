import { useState, useEffect } from "react";

/*
  WIREFRAME — zero visual design.
  Only structural layout: borders, spacing, text hierarchy.
  Purpose: validate information architecture before skinning.
  
  Reference for TASK-026: Unified Sidebar — Servers, Primitives & Connection Form
*/

const B = "1px solid #ccc";
const BL = "1px solid #ddd";

const MOCK_TOOL_RESULT = {
  content: [
    {
      type: "text",
      text: "# Weekly Sync Notes\n\nAttendees: @alice, @bob\n\n## Updates\n- Project Alpha: on track\n- Project Beta: blocked on API review",
    },
  ],
  structuredContent: {
    page: {
      id: "a1b2c3d4",
      title: "Weekly Sync Notes",
      type: "page",
      properties: { Status: "Active", Tags: ["meetings", "weekly"] },
    },
  },
  _meta: { requestId: "req_8f3a2b1c", serverName: "notion-mcp", duration_ms: 243, cached: false },
};

const MOCK_RESOURCE_RESULT = {
  contents: [
    {
      uri: "notion://docs/enhanced-markdown-spec",
      mimeType: "text/markdown",
      text: "# Enhanced Markdown Spec v2.1\n\n## Callouts\nUse > [!type] syntax\n\n## Toggle Blocks\nWrapped in <details> tags\n\n## Synced Blocks\nReferenced via {{sync:block_id}}",
    },
  ],
  _meta: { requestId: "req_4d7e9f2a", serverName: "notion-mcp", duration_ms: 87, cached: true },
};

const MOCK_PROMPT_RESULT = {
  messages: [
    {
      role: "user",
      content:
        "Please summarize the following Notion page.\n\nPage URL: https://notion.so/workspace/Page-a1b2c3d4\nStyle: brief",
    },
  ],
  _meta: { requestId: "req_1c5b8e3d", serverName: "notion-mcp", promptName: "summarize-page" },
};

const SERVERS = [
  {
    name: "Notion",
    tools: [
      {
        kind: "tool",
        name: "notion-fetch",
        summary: "Retrieves details about a Notion entity by URL or ID.",
        description:
          "Provide URL or ID in `id` parameter. Make multiple calls to fetch multiple entities.",
        examples: [
          { label: "By URL", value: '{"id": "https://notion.so/workspace/Page-a1b2c3d4"}' },
          { label: "By ID", value: '{"id": "12345678-90ab-cdef-1234-567890abcdef"}' },
        ],
        parameters: [
          {
            name: "id",
            type: "string",
            required: true,
            description: "The ID or URL of the Notion page to fetch",
          },
          { name: "include_transcript", type: "boolean", required: false, description: null },
        ],
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        kind: "tool",
        name: "notion-update",
        summary: "Update properties or content of a Notion page.",
        description: "Modifies page properties or appends content blocks.",
        examples: [],
        parameters: [
          { name: "page_id", type: "string", required: true, description: "The page ID to update" },
          {
            name: "properties",
            type: "object",
            required: true,
            description: "Properties to update (JSON)",
          },
        ],
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
    ],
    resources: [
      {
        kind: "resource",
        name: "enhanced-markdown-spec",
        uri: "notion://docs/enhanced-markdown-spec",
        summary: "Complete spec for Notion's enhanced Markdown format.",
        description: "Describes all custom Markdown extensions.",
        mimeType: "text/markdown",
      },
      {
        kind: "resource",
        name: "workspace-members",
        uri: "notion://workspace/members",
        summary: "List of all workspace members and roles.",
        description: "Returns JSON array of members.",
        mimeType: "application/json",
      },
    ],
    prompts: [
      {
        kind: "prompt",
        name: "summarize-page",
        summary: "Generate a concise summary of a Notion page.",
        description: "Creates a structured summary with key points and action items.",
        arguments: [
          { name: "page_url", required: true, description: "URL of the Notion page to summarize" },
          { name: "style", required: false, description: "'brief', 'detailed', or 'bullets'" },
        ],
      },
    ],
  },
  {
    name: "Slack",
    tools: [
      {
        kind: "tool",
        name: "slack-post",
        summary: "Post a message to a Slack channel.",
        description: "Sends a message using the bot token.",
        examples: [],
        parameters: [
          { name: "channel", type: "string", required: true, description: "Channel name or ID" },
          { name: "text", type: "string", required: true, description: "Message content" },
        ],
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
    ],
    resources: [
      {
        kind: "resource",
        name: "channel-list",
        uri: "slack://channels",
        summary: "List of all accessible Slack channels.",
        description: "Returns channel names, IDs, topics.",
        mimeType: "application/json",
      },
    ],
    prompts: [
      {
        kind: "prompt",
        name: "draft-announcement",
        summary: "Draft a team announcement message.",
        description: "Creates a formatted announcement.",
        arguments: [
          { name: "topic", required: true, description: "What the announcement is about" },
          { name: "tone", required: false, description: "'formal', 'casual', or 'celebratory'" },
        ],
      },
    ],
  },
];

/* ═══════════════════════════════════════════
   Primitives
   ═══════════════════════════════════════════ */

function WireCollapsible({ label, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div
        onClick={() => setOpen(!open)}
        style={{ cursor: "pointer", padding: "4px 0", fontSize: 13, userSelect: "none" }}
      >
        {open ? "▾" : "▸"} {label}
      </div>
      {open && <div style={{ paddingLeft: 16, paddingTop: 4 }}>{children}</div>}
    </div>
  );
}

function WireTag({ children }) {
  return (
    <span
      style={{
        border: B,
        borderRadius: 3,
        padding: "1px 6px",
        fontSize: 11,
        marginLeft: 4,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/* ═══════════════════════════════════════════
   Sidebar
   ═══════════════════════════════════════════ */

function Sidebar({ servers, active, onSelect, collapsed, onToggle, search, onSearch }) {
  return (
    <div
      style={{
        width: collapsed ? 40 : 220,
        minWidth: collapsed ? 40 : 220,
        borderRight: B,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        fontSize: 13,
        transition: "width 0.2s, min-width 0.2s",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 8, borderBottom: B, display: "flex", alignItems: "center", gap: 8 }}>
        <span onClick={onToggle} style={{ cursor: "pointer" }}>
          {collapsed ? "☰" : "✕"}
        </span>
        {!collapsed && <strong>MCP Explorer</strong>}
      </div>

      {!collapsed && (
        <>
          <div style={{ padding: 8, display: "flex", gap: 6 }}>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              style={{
                flex: 1,
                padding: "4px 6px",
                fontSize: 12,
                border: B,
                boxSizing: "border-box",
              }}
            />
            <button
              style={{
                padding: "4px 10px",
                fontSize: 14,
                border: B,
                cursor: "pointer",
                background: "transparent",
                flexShrink: 0,
              }}
            >
              +
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {servers.map((server) => {
              const all = [...server.tools, ...server.resources, ...server.prompts];
              const q = search.toLowerCase();
              const filtered = q ? all.filter((i) => i.name.toLowerCase().includes(q)) : all;
              if (q && filtered.length === 0) return null;

              const groups = {};
              filtered.forEach((i) => {
                if (!groups[i.kind]) groups[i.kind] = [];
                groups[i.kind].push(i);
              });

              return (
                <ServerBlock
                  key={server.name}
                  server={server}
                  groups={groups}
                  active={active}
                  onSelect={onSelect}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Server Block (sidebar)
   ═══════════════════════════════════════════ */

function ServerBlock({ server, groups, active, onSelect }) {
  const [running, setRunning] = useState(true);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div style={{ marginBottom: 8, borderBottom: BL, paddingBottom: 4 }}>
      {/* Server header with start/stop */}
      <div style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontWeight: "bold",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: "#666",
            flex: 1,
          }}
        >
          {server.name}
        </span>
        <button
          onClick={() => setRunning(!running)}
          style={{
            padding: "1px 8px",
            fontSize: 10,
            border: B,
            cursor: "pointer",
            background: running ? "transparent" : "transparent",
            color: running ? "#333" : "#999",
          }}
        >
          {running ? "Stop" : "Start"}
        </button>
      </div>

      {/* Server info */}
      <div style={{ paddingLeft: 8 }}>
        <div
          onClick={() => setShowInfo(!showInfo)}
          style={{ cursor: "pointer", fontSize: 10, color: "#999", padding: "2px 0" }}
        >
          {showInfo ? "▾" : "▸"} server info
        </div>
        {showInfo && (
          <div style={{ fontSize: 10, color: "#888", padding: "4px 0 4px 12px", lineHeight: 1.6 }}>
            <div>Status: {running ? "running" : "stopped"}</div>
            <div>Transport: stdio</div>
            <div>Version: 1.2.0</div>
            <div>Capabilities: tools, resources, prompts</div>
          </div>
        )}
      </div>

      {/* Items grouped by kind */}
      {running &&
        ["tool", "resource", "prompt"].map((kind) => {
          const items = groups[kind];
          if (!items) return null;
          return (
            <div key={kind}>
              <div
                style={{
                  padding: "3px 8px 1px",
                  fontSize: 10,
                  textTransform: "uppercase",
                  color: "#999",
                  letterSpacing: 0.5,
                }}
              >
                {kind}s
              </div>
              {items.map((item) => {
                const isActive = active?.name === item.name && active?.kind === item.kind;
                return (
                  <div
                    key={`${item.kind}-${item.name}`}
                    onClick={() => onSelect(item)}
                    style={{
                      padding: "4px 8px 4px 12px",
                      cursor: "pointer",
                      fontSize: 12,
                      background: isActive ? "#eee" : "transparent",
                      borderLeft: isActive ? "2px solid #333" : "2px solid transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {item.name}
                  </div>
                );
              })}
            </div>
          );
        })}

      {!running && (
        <div style={{ padding: "6px 12px", fontSize: 11, color: "#bbb", fontStyle: "italic" }}>
          Server stopped
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Response Panel
   ═══════════════════════════════════════════ */

function ResponsePanel({ result }) {
  if (!result) return null;
  const hasContent = result.content || result.contents || result.messages;
  const hasStructured = result.structuredContent;
  const hasMeta = result._meta;

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 6,
          fontWeight: "bold",
        }}
      >
        Response
      </div>
      <div style={{ border: B }}>
        {/* Status */}
        <div
          style={{
            padding: "6px 10px",
            borderBottom: BL,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              border: "1px solid #999",
              background: result.ok ? "transparent" : "#333",
            }}
          />
          {result.ok ? "Success" : "Error"}
          {result._meta?.duration_ms && (
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#999" }}>
              {result._meta.duration_ms}ms
            </span>
          )}
        </div>

        {/* content */}
        {hasContent && (
          <WireResponseSection label="content" defaultOpen={true}>
            {result.content?.map((block, i) => (
              <div key={i} style={{ marginTop: i > 0 ? 8 : 0 }}>
                <WireTag>{block.type}</WireTag>
                <pre
                  style={{
                    margin: "4px 0 0",
                    fontSize: 11,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                  }}
                >
                  {block.text}
                </pre>
              </div>
            ))}
            {result.contents?.map((item, i) => (
              <div key={i} style={{ marginTop: i > 0 ? 8 : 0 }}>
                <WireTag>{item.mimeType}</WireTag>
                <div style={{ fontSize: 10, color: "#999", margin: "2px 0" }}>{item.uri}</div>
                <pre
                  style={{
                    margin: "4px 0 0",
                    fontSize: 11,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                  }}
                >
                  {item.text}
                </pre>
              </div>
            ))}
            {result.messages?.map((msg, i) => (
              <div key={i} style={{ marginTop: i > 0 ? 8 : 0 }}>
                <WireTag>{msg.role}</WireTag>
                <pre
                  style={{
                    margin: "4px 0 0",
                    fontSize: 11,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                  }}
                >
                  {typeof msg.content === "string"
                    ? msg.content
                    : JSON.stringify(msg.content, null, 2)}
                </pre>
              </div>
            ))}
          </WireResponseSection>
        )}

        {/* structuredContent */}
        {hasStructured && (
          <WireResponseSection label="structuredContent" defaultOpen={false}>
            <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {JSON.stringify(result.structuredContent, null, 2)}
            </pre>
          </WireResponseSection>
        )}

        {/* _meta */}
        {hasMeta && (
          <WireResponseSection label="_meta" defaultOpen={false}>
            {Object.entries(result._meta).map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 12, fontSize: 11, padding: "1px 0" }}>
                <span style={{ minWidth: 100, color: "#666" }}>{k}</span>
                <span>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </WireResponseSection>
        )}
      </div>
    </div>
  );
}

function WireResponseSection({ label, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: BL }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: "6px 10px",
          cursor: "pointer",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 10 }}>{open ? "▾" : "▸"}</span>
        <strong>{label}</strong>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#999" }}>
          {open ? "collapse" : "expand"}
        </span>
      </div>
      {open && <div style={{ padding: "0 10px 10px" }}>{children}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Action Forms
   ═══════════════════════════════════════════ */

function ToolRunForm({ item, onClose }) {
  const [values, setValues] = useState(() => {
    const o = {};
    item.parameters.forEach((p) => {
      o[p.name] = p.type === "boolean" ? false : "";
    });
    return o;
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const set = (n, v) => setValues((p) => ({ ...p, [n]: v }));
  const ready = item.parameters
    .filter((p) => p.required)
    .every((p) => values[p.name] !== "" && values[p.name] !== undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {item.parameters.map((p) => (
        <div key={p.name}>
          <div
            style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 13 }}
          >
            <strong>{p.name}</strong>
            <WireTag>{p.type}</WireTag>
            <WireTag>{p.required ? "required" : "optional"}</WireTag>
          </div>
          {p.description && (
            <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{p.description}</div>
          )}
          {p.type === "boolean" ? (
            <button
              onClick={() => set(p.name, !values[p.name])}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                border: B,
                cursor: "pointer",
                background: "transparent",
              }}
            >
              {String(values[p.name])}
            </button>
          ) : p.type === "object" ? (
            <textarea
              value={values[p.name]}
              onChange={(e) => set(p.name, e.target.value)}
              placeholder="{}"
              rows={3}
              style={{
                width: "100%",
                padding: "4px 6px",
                fontSize: 12,
                border: B,
                boxSizing: "border-box",
                resize: "vertical",
              }}
            />
          ) : (
            <input
              type={p.type === "number" ? "number" : "text"}
              value={values[p.name]}
              onChange={(e) => set(p.name, e.target.value)}
              placeholder={`Enter ${p.name}…`}
              style={{
                width: "100%",
                padding: "4px 6px",
                fontSize: 12,
                border: B,
                boxSizing: "border-box",
              }}
            />
          )}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          disabled={!ready || running}
          onClick={() => {
            setRunning(true);
            setResult(null);
            setTimeout(() => {
              setRunning(false);
              setResult({ ok: true, ...MOCK_TOOL_RESULT });
            }, 600);
          }}
          style={{
            padding: "6px 16px",
            fontSize: 12,
            border: B,
            cursor: ready ? "pointer" : "not-allowed",
            background: ready ? "#000" : "transparent",
            color: ready ? "#fff" : "#999",
          }}
        >
          {running ? "Running…" : "▶ Run"}
        </button>
        <button
          onClick={onClose}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            border: B,
            cursor: "pointer",
            background: "transparent",
          }}
        >
          Back
        </button>
      </div>
      <ResponsePanel result={result} />
    </div>
  );
}

function ResourceReadForm({ item, onClose }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ border: B, padding: "6px 10px", fontSize: 12 }}>
        <span style={{ color: "#999", fontSize: 10 }}>URI </span>
        {item.uri}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setResult(null);
            setTimeout(() => {
              setLoading(false);
              setResult({ ok: true, ...MOCK_RESOURCE_RESULT });
            }, 400);
          }}
          style={{
            padding: "6px 16px",
            fontSize: 12,
            border: B,
            cursor: "pointer",
            background: "#000",
            color: "#fff",
          }}
        >
          {loading ? "Reading…" : "↓ Read"}
        </button>
        <button
          onClick={onClose}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            border: B,
            cursor: "pointer",
            background: "transparent",
          }}
        >
          Back
        </button>
      </div>
      <ResponsePanel result={result} />
    </div>
  );
}

function PromptUseForm({ item, onClose }) {
  const [values, setValues] = useState(() => {
    const o = {};
    item.arguments.forEach((a) => {
      o[a.name] = "";
    });
    return o;
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const set = (n, v) => setValues((p) => ({ ...p, [n]: v }));
  const ready = item.arguments.filter((a) => a.required).every((a) => values[a.name] !== "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {item.arguments.map((a) => (
        <div key={a.name}>
          <div
            style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 13 }}
          >
            <strong>{a.name}</strong>
            <WireTag>{a.required ? "required" : "optional"}</WireTag>
          </div>
          {a.description && (
            <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{a.description}</div>
          )}
          <input
            type="text"
            value={values[a.name]}
            onChange={(e) => set(a.name, e.target.value)}
            placeholder={`Enter ${a.name}…`}
            style={{
              width: "100%",
              padding: "4px 6px",
              fontSize: 12,
              border: B,
              boxSizing: "border-box",
            }}
          />
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          disabled={!ready || loading}
          onClick={() => {
            setLoading(true);
            setResult(null);
            setTimeout(() => {
              setLoading(false);
              setResult({ ok: true, ...MOCK_PROMPT_RESULT });
            }, 300);
          }}
          style={{
            padding: "6px 16px",
            fontSize: 12,
            border: B,
            cursor: ready ? "pointer" : "not-allowed",
            background: ready ? "#000" : "transparent",
            color: ready ? "#fff" : "#999",
          }}
        >
          {loading ? "Loading…" : "→ Use"}
        </button>
        <button
          onClick={onClose}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            border: B,
            cursor: "pointer",
            background: "transparent",
          }}
        >
          Back
        </button>
      </div>
      <ResponsePanel result={result} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   Main Content
   ═══════════════════════════════════════════ */

function ItemView({ item }) {
  const [mode, setMode] = useState("browse");
  useEffect(() => setMode("browse"), [item.name, item.kind]);
  const actionLabel = { tool: "Run", resource: "Read", prompt: "Use" }[item.kind];
  const actionIcon = { tool: "▶", resource: "↓", prompt: "→" }[item.kind];

  return (
    <div style={{ border: B }}>
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: B,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontSize: 15 }}>{item.name}</strong>
        <WireTag>{item.kind}</WireTag>
        {item.mimeType && <WireTag>{item.mimeType}</WireTag>}
        {mode === "action" && <WireTag>{actionLabel.toLowerCase()} mode</WireTag>}
        {mode === "browse" && item.annotations && (
          <div style={{ display: "flex", gap: 4, marginLeft: "auto", flexWrap: "wrap" }}>
            {item.annotations.readOnlyHint && <WireTag>read-only</WireTag>}
            {item.annotations.idempotentHint && <WireTag>idempotent</WireTag>}
            {!item.annotations.destructiveHint && <WireTag>non-destructive</WireTag>}
            {item.annotations.destructiveHint && <WireTag>⚠ destructive</WireTag>}
          </div>
        )}
      </div>

      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "browse" && (
          <>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{item.summary}</p>

            {item.description && (
              <WireCollapsible label="Description">
                <div style={{ fontSize: 12, lineHeight: 1.6, color: "#444" }}>
                  {item.description.split("\n\n").map((p, i) => (
                    <p key={i} style={{ margin: i === 0 ? 0 : "6px 0 0" }}>
                      {p}
                    </p>
                  ))}
                </div>
                {item.examples && item.examples.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {item.examples.map((ex, i) => (
                      <div key={i} style={{ marginTop: i > 0 ? 6 : 0 }}>
                        <div style={{ fontSize: 10, color: "#999" }}>// {ex.label}</div>
                        <pre
                          style={{
                            margin: "2px 0 0",
                            fontSize: 11,
                            border: BL,
                            padding: "4px 8px",
                            lineHeight: 1.4,
                          }}
                        >
                          {ex.value}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </WireCollapsible>
            )}

            {item.uri && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    fontWeight: "bold",
                    marginBottom: 4,
                  }}
                >
                  URI
                </div>
                <div style={{ border: BL, padding: "4px 8px", fontSize: 12 }}>{item.uri}</div>
              </div>
            )}

            {item.parameters && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    fontWeight: "bold",
                    marginBottom: 6,
                  }}
                >
                  Parameters
                </div>
                {item.parameters.map((p) => (
                  <div key={p.name} style={{ padding: "2px 0 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      <strong>{p.name}</strong>
                      <WireTag>{p.type}</WireTag>
                      <WireTag>{p.required ? "required" : "optional"}</WireTag>
                    </div>
                    {p.description && (
                      <div style={{ fontSize: 11, color: "#666", paddingTop: 2 }}>
                        {p.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {item.arguments && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    fontWeight: "bold",
                    marginBottom: 6,
                  }}
                >
                  Arguments
                </div>
                {item.arguments.map((a) => (
                  <div key={a.name} style={{ padding: "2px 0 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      <strong>{a.name}</strong>
                      <WireTag>{a.required ? "required" : "optional"}</WireTag>
                    </div>
                    {a.description && (
                      <div style={{ fontSize: 11, color: "#666", paddingTop: 2 }}>
                        {a.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {item.annotations && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    fontWeight: "bold",
                    marginBottom: 6,
                  }}
                >
                  Annotations
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {item.annotations.readOnlyHint && <WireTag>read-only</WireTag>}
                  {item.annotations.idempotentHint && <WireTag>idempotent</WireTag>}
                  {!item.annotations.destructiveHint && <WireTag>non-destructive</WireTag>}
                  {item.annotations.destructiveHint && <WireTag>⚠ destructive</WireTag>}
                  {!item.annotations.openWorldHint && <WireTag>closed-world</WireTag>}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
              <button
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  border: B,
                  cursor: "pointer",
                  background: "transparent",
                }}
              >
                Copy JSON
              </button>
              <button
                onClick={() => setMode("action")}
                style={{
                  padding: "6px 16px",
                  fontSize: 12,
                  border: B,
                  cursor: "pointer",
                  background: "#000",
                  color: "#fff",
                }}
              >
                {actionIcon} {actionLabel}
              </button>
            </div>
          </>
        )}

        {mode === "action" && item.kind === "tool" && (
          <ToolRunForm item={item} onClose={() => setMode("browse")} />
        )}
        {mode === "action" && item.kind === "resource" && (
          <ResourceReadForm item={item} onClose={() => setMode("browse")} />
        )}
        {mode === "action" && item.kind === "prompt" && (
          <PromptUseForm item={item} onClose={() => setMode("browse")} />
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   App
   ═══════════════════════════════════════════ */

export default function McpExplorerWireframe() {
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState(SERVERS[0].tools[0]);
  const [search, setSearch] = useState("");

  return (
    <>
      <style>{`* { box-sizing: border-box; } body { margin: 0; font-family: sans-serif; }`}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar
          servers={SERVERS}
          active={active}
          onSelect={setActive}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          search={search}
          onSearch={setSearch}
        />
        <div style={{ flex: 1, padding: "24px 32px", maxWidth: 640 }}>
          <ItemView item={active} />
        </div>
      </div>
    </>
  );
}
