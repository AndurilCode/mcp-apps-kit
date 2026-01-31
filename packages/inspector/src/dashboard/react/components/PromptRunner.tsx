/**
 * PromptRunner Component
 *
 * Interactive prompt execution for human mode.
 * Renders argument inputs from the prompt definition,
 * executes the prompt, and displays returned messages in a chat-like format.
 */

import React, { useState, useCallback, useEffect } from "react";
import type { McpPrompt } from "../types/mcp-primitives";
import { usePromptRunner, type PromptMessage } from "../hooks/usePromptRunner";

// =============================================================================
// Types
// =============================================================================

interface PromptRunnerProps {
  prompt: McpPrompt;
  baseUrl: string;
  connectionId: string | null;
}

// =============================================================================
// Local Styles
// =============================================================================

const localStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    height: "100%",
    overflow: "auto",
  },
  promptHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.75rem",
    padding: "0.75rem",
    backgroundColor: "#111111",
    borderRadius: "6px",
    border: "1px solid #2d2f2f",
  },
  promptName: {
    fontSize: "0.9375rem",
    fontWeight: 600,
    color: "#e0e0e0",
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
  },
  promptDescription: {
    fontSize: "0.75rem",
    color: "#9ca3af",
    marginTop: "0.25rem",
    lineHeight: 1.5,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  label: {
    fontSize: "0.6875rem",
    fontWeight: 500,
    color: "#e0e0e0",
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
  },
  requiredStar: {
    color: "#ff6b6b",
    fontSize: "0.75rem",
  },
  hint: {
    fontSize: "0.625rem",
    color: "#6b7280",
    lineHeight: 1.4,
  },
  input: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
    fontSize: "0.75rem",
    backgroundColor: "#0a0a0a",
    border: "1px solid #2d2f2f",
    borderRadius: "4px",
    padding: "0.5rem 0.625rem",
    color: "#e0e0e0",
    outline: "none",
    transition: "border-color 0.15s ease",
  },
  runBtn: {
    fontFamily: "inherit",
    fontSize: "0.75rem",
    fontWeight: 600,
    backgroundColor: "#20b2aa",
    color: "#0a0a0a",
    border: "none",
    borderRadius: "6px",
    padding: "0.625rem 1.25rem",
    cursor: "pointer",
    transition: "all 0.15s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
  },
  runBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  messagesSection: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  messagesHeader: {
    fontSize: "0.6875rem",
    fontWeight: 600,
    color: "#9ca3af",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  messageBubble: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    padding: "0.75rem",
    borderRadius: "6px",
    border: "1px solid #2d2f2f",
  },
  messageBubbleUser: {
    backgroundColor: "rgba(32, 178, 170, 0.08)",
    borderColor: "rgba(32, 178, 170, 0.2)",
  },
  messageBubbleAssistant: {
    backgroundColor: "#111111",
  },
  roleBadge: {
    fontSize: "0.5625rem",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    padding: "0.125rem 0.375rem",
    borderRadius: "3px",
    alignSelf: "flex-start",
  },
  roleBadgeUser: {
    color: "#20b2aa",
    backgroundColor: "rgba(32, 178, 170, 0.15)",
  },
  roleBadgeAssistant: {
    color: "#b39ddb",
    backgroundColor: "rgba(179, 157, 219, 0.15)",
  },
  messageContent: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
    fontSize: "0.6875rem",
    color: "#e0e0e0",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    lineHeight: 1.6,
    margin: 0,
  },
  errorBanner: {
    fontSize: "0.75rem",
    color: "#ff6b6b",
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    border: "1px solid rgba(255, 107, 107, 0.2)",
    borderRadius: "4px",
    padding: "0.5rem 0.75rem",
  },
  spinner: {
    width: "14px",
    height: "14px",
    border: "2px solid rgba(10, 10, 10, 0.3)",
    borderTopColor: "#0a0a0a",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    display: "inline-block",
  },
  noArgs: {
    fontSize: "0.6875rem",
    color: "#6b7280",
    fontStyle: "italic" as const,
  },
};

// =============================================================================
// Message Bubble
// =============================================================================

function MessageBubble({ message }: { message: PromptMessage }): React.ReactElement {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        ...localStyles.messageBubble,
        ...(isUser ? localStyles.messageBubbleUser : localStyles.messageBubbleAssistant),
      }}
    >
      <span
        style={{
          ...localStyles.roleBadge,
          ...(isUser ? localStyles.roleBadgeUser : localStyles.roleBadgeAssistant),
        }}
      >
        {message.role}
      </span>
      <pre style={localStyles.messageContent}>
        {message.content.text ?? JSON.stringify(message.content, null, 2)}
      </pre>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function PromptRunner({
  prompt,
  baseUrl,
  connectionId,
}: PromptRunnerProps): React.ReactElement {
  const { run, isRunning, lastResult, error } = usePromptRunner(baseUrl, connectionId);
  const [argValues, setArgValues] = useState<Record<string, string>>({});

  // Reset form when prompt changes
  useEffect(() => {
    setArgValues({});
  }, [prompt.name]);

  const handleArgChange = useCallback((name: string, value: string) => {
    setArgValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleRun = useCallback(async () => {
    // Filter out empty optional args
    const args: Record<string, string> = {};
    for (const [k, v] of Object.entries(argValues)) {
      if (v !== "") {
        args[k] = v;
      }
    }
    await run(prompt.name, args);
  }, [prompt.name, argValues, run]);

  const promptArgs = prompt.arguments ?? [];

  return (
    <div style={localStyles.container}>
      {/* Prompt Header */}
      <div style={localStyles.promptHeader}>
        <div>
          <div style={localStyles.promptName}>{prompt.name}</div>
          {prompt.description && (
            <div style={localStyles.promptDescription}>{prompt.description}</div>
          )}
        </div>
      </div>

      {/* Argument Form */}
      {promptArgs.length > 0 ? (
        <div style={localStyles.form}>
          {promptArgs.map((arg) => (
            <div key={arg.name} style={localStyles.fieldGroup}>
              <label style={localStyles.label}>
                {arg.name}
                {arg.required && <span style={localStyles.requiredStar}>*</span>}
              </label>
              {arg.description && <span style={localStyles.hint}>{arg.description}</span>}
              <input
                type="text"
                style={localStyles.input}
                value={argValues[arg.name] ?? ""}
                placeholder={arg.description ?? undefined}
                onChange={(e) => handleArgChange(arg.name, e.target.value)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div style={localStyles.noArgs}>No arguments required</div>
      )}

      {/* Run Button */}
      <button
        style={{
          ...localStyles.runBtn,
          ...(isRunning ? localStyles.runBtnDisabled : {}),
        }}
        onClick={() => void handleRun()}
        disabled={isRunning}
      >
        {isRunning && <span style={localStyles.spinner} />}
        {isRunning ? "Running…" : "Run Prompt"}
      </button>

      {/* Error */}
      {error && <div style={localStyles.errorBanner}>{error}</div>}

      {/* Messages Display */}
      {lastResult && lastResult.messages.length > 0 && (
        <div style={localStyles.messagesSection}>
          <div style={localStyles.messagesHeader}>Messages ({lastResult.messages.length})</div>
          {lastResult.messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
        </div>
      )}
    </div>
  );
}

export default PromptRunner;
