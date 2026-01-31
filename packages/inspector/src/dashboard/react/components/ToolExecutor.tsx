/**
 * ToolExecutor Component
 *
 * Interactive tool execution form for human mode.
 * Dynamically generates input fields from the tool's JSON Schema,
 * executes the tool, and displays results.
 */

import React, { useState, useCallback, useEffect } from "react";
import type { McpTool, JsonSchemaProperty } from "../types/mcp-primitives";
import { useToolExecutor } from "../hooks/useToolExecutor";

// =============================================================================
// Types
// =============================================================================

interface ToolExecutorProps {
  tool: McpTool;
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
  toolHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.75rem",
    padding: "0.75rem",
    backgroundColor: "#111111",
    borderRadius: "6px",
    border: "1px solid #2d2f2f",
  },
  toolName: {
    fontSize: "0.9375rem",
    fontWeight: 600,
    color: "#e0e0e0",
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
  },
  toolDescription: {
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
  inputFocus: {
    borderColor: "#20b2aa",
  },
  select: {
    fontFamily: "inherit",
    fontSize: "0.75rem",
    backgroundColor: "#0a0a0a",
    border: "1px solid #2d2f2f",
    borderRadius: "4px",
    padding: "0.5rem 0.625rem",
    color: "#e0e0e0",
    outline: "none",
    cursor: "pointer",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.25rem 0",
  },
  checkbox: {
    width: "16px",
    height: "16px",
    accentColor: "#20b2aa",
    cursor: "pointer",
  },
  textarea: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
    fontSize: "0.6875rem",
    backgroundColor: "#0a0a0a",
    border: "1px solid #2d2f2f",
    borderRadius: "4px",
    padding: "0.5rem 0.625rem",
    color: "#e0e0e0",
    outline: "none",
    resize: "vertical" as const,
    minHeight: "80px",
    lineHeight: 1.5,
  },
  executeBtn: {
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
  executeBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  resultSection: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  resultHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: "0.6875rem",
    fontWeight: 600,
    color: "#9ca3af",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  resultDuration: {
    fontSize: "0.625rem",
    color: "#6b7280",
    fontWeight: 400,
  },
  resultBlock: {
    backgroundColor: "#0a0a0a",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    padding: "0.75rem",
    overflow: "auto",
  },
  resultText: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
    fontSize: "0.6875rem",
    color: "#e0e0e0",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    lineHeight: 1.6,
    margin: 0,
  },
  resultError: {
    borderColor: "#ff6b6b33",
    backgroundColor: "#1a0a0a",
  },
  resultErrorText: {
    color: "#ff6b6b",
  },
  resultImage: {
    maxWidth: "100%",
    borderRadius: "4px",
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
};

// =============================================================================
// Field Renderer
// =============================================================================

function SchemaField({
  name,
  property,
  required,
  value,
  onChange,
}: {
  name: string;
  property: JsonSchemaProperty;
  required: boolean;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
}): React.ReactElement {
  // Enum → select
  if (property.enum && property.enum.length > 0) {
    return (
      <div style={localStyles.fieldGroup}>
        <label style={localStyles.label}>
          {name}
          {required && <span style={localStyles.requiredStar}>*</span>}
        </label>
        {property.description && <span style={localStyles.hint}>{property.description}</span>}
        <select
          style={localStyles.select}
          value={String(value ?? "")}
          onChange={(e) => onChange(name, e.target.value)}
        >
          <option value="">— select —</option>
          {property.enum.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Boolean → checkbox
  if (property.type === "boolean") {
    return (
      <div style={localStyles.fieldGroup}>
        <div style={localStyles.checkboxRow}>
          <input
            type="checkbox"
            style={localStyles.checkbox}
            checked={!!value}
            onChange={(e) => onChange(name, e.target.checked)}
          />
          <label style={localStyles.label}>
            {name}
            {required && <span style={localStyles.requiredStar}>*</span>}
          </label>
        </div>
        {property.description && <span style={localStyles.hint}>{property.description}</span>}
      </div>
    );
  }

  // Number → number input
  if (property.type === "number" || property.type === "integer") {
    return (
      <div style={localStyles.fieldGroup}>
        <label style={localStyles.label}>
          {name}
          {required && <span style={localStyles.requiredStar}>*</span>}
        </label>
        {property.description && <span style={localStyles.hint}>{property.description}</span>}
        <input
          type="number"
          style={localStyles.input}
          value={value !== undefined && value !== null ? String(value) : ""}
          placeholder={property.default !== undefined ? `Default: ${property.default}` : undefined}
          onChange={(e) => {
            const v = e.target.value;
            onChange(name, v === "" ? undefined : Number(v));
          }}
        />
      </div>
    );
  }

  // Object / Array / complex → JSON textarea
  if (
    property.type === "object" ||
    property.type === "array" ||
    (property.properties && Object.keys(property.properties).length > 0)
  ) {
    return (
      <div style={localStyles.fieldGroup}>
        <label style={localStyles.label}>
          {name}
          {required && <span style={localStyles.requiredStar}>*</span>}
          <span style={{ ...localStyles.hint, marginLeft: "0.5rem" }}>
            ({property.type} — JSON)
          </span>
        </label>
        {property.description && <span style={localStyles.hint}>{property.description}</span>}
        <textarea
          style={localStyles.textarea}
          value={
            typeof value === "string"
              ? value
              : value !== undefined
                ? JSON.stringify(value, null, 2)
                : ""
          }
          placeholder={`Enter ${property.type} as JSON...`}
          onChange={(e) => onChange(name, e.target.value)}
        />
      </div>
    );
  }

  // Default: string → text input
  return (
    <div style={localStyles.fieldGroup}>
      <label style={localStyles.label}>
        {name}
        {required && <span style={localStyles.requiredStar}>*</span>}
      </label>
      {property.description && <span style={localStyles.hint}>{property.description}</span>}
      <input
        type="text"
        style={localStyles.input}
        value={value !== undefined && value !== null ? String(value) : ""}
        placeholder={
          property.default !== undefined
            ? `Default: ${String(property.default)}`
            : (property.description ?? undefined)
        }
        onChange={(e) => onChange(name, e.target.value)}
      />
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ToolExecutor({
  tool,
  baseUrl,
  connectionId,
}: ToolExecutorProps): React.ReactElement {
  const { execute, isExecuting, lastResult, error } = useToolExecutor(baseUrl, connectionId);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

  // Reset form when tool changes
  useEffect(() => {
    const defaults: Record<string, unknown> = {};
    const properties = tool.inputSchema?.properties ?? {};
    for (const [name, prop] of Object.entries(properties)) {
      if (prop.default !== undefined) {
        defaults[name] = prop.default;
      }
    }
    setFormValues(defaults);
  }, [tool.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFieldChange = useCallback((name: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleExecute = useCallback(async () => {
    // Build clean arguments: parse JSON textareas, strip undefined
    const args: Record<string, unknown> = {};
    const properties = tool.inputSchema?.properties ?? {};

    for (const [name, prop] of Object.entries(properties)) {
      const raw = formValues[name];
      if (raw === undefined || raw === "") continue;

      if ((prop.type === "object" || prop.type === "array") && typeof raw === "string") {
        try {
          args[name] = JSON.parse(raw);
        } catch {
          args[name] = raw;
        }
      } else {
        args[name] = raw;
      }
    }

    await execute(tool.name, args);
  }, [tool, formValues, execute]);

  const properties = tool.inputSchema?.properties ?? {};
  const requiredFields = tool.inputSchema?.required ?? [];
  const propertyEntries = Object.entries(properties);

  return (
    <div style={localStyles.container}>
      {/* Tool Header */}
      <div style={localStyles.toolHeader}>
        <div>
          <div style={localStyles.toolName}>{tool.name}</div>
          {tool.description && <div style={localStyles.toolDescription}>{tool.description}</div>}
        </div>
      </div>

      {/* Input Form */}
      {propertyEntries.length > 0 && (
        <div style={localStyles.form}>
          {propertyEntries.map(([name, prop]) => (
            <SchemaField
              key={name}
              name={name}
              property={prop}
              required={requiredFields.includes(name)}
              value={formValues[name]}
              onChange={handleFieldChange}
            />
          ))}
        </div>
      )}

      {/* Execute Button */}
      <button
        style={{
          ...localStyles.executeBtn,
          ...(isExecuting ? localStyles.executeBtnDisabled : {}),
        }}
        onClick={() => void handleExecute()}
        disabled={isExecuting}
      >
        {isExecuting && <span style={localStyles.spinner} />}
        {isExecuting ? "Executing…" : "Execute Tool"}
      </button>

      {/* Error */}
      {error && <div style={localStyles.errorBanner}>{error}</div>}

      {/* Result Display */}
      {lastResult && (
        <div style={localStyles.resultSection}>
          <div style={localStyles.resultHeader}>
            <span>Result</span>
            <span style={localStyles.resultDuration}>{lastResult.duration}ms</span>
          </div>
          {lastResult.content.map((block, i) => {
            if (block.type === "image" && block.data) {
              return (
                <div
                  key={i}
                  style={{
                    ...localStyles.resultBlock,
                    ...(lastResult.isError ? localStyles.resultError : {}),
                  }}
                >
                  <img
                    src={`data:${block.mimeType ?? "image/png"};base64,${block.data}`}
                    alt="Tool result"
                    style={localStyles.resultImage}
                  />
                </div>
              );
            }
            return (
              <div
                key={i}
                style={{
                  ...localStyles.resultBlock,
                  ...(lastResult.isError ? localStyles.resultError : {}),
                }}
              >
                <pre
                  style={{
                    ...localStyles.resultText,
                    ...(lastResult.isError ? localStyles.resultErrorText : {}),
                  }}
                >
                  {block.text ?? JSON.stringify(block, null, 2)}
                </pre>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ToolExecutor;
