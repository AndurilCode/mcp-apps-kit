/**
 * Advanced Workflow Widget Component
 *
 * A React component for displaying advanced workflow results with parallel
 * execution and conditional branching.
 */

import { useEffect, useState } from "react";
import { useToolResult, useHostContext, useAppsClient } from "@mcp-apps-kit/ui-react";
import type { AppClientToolsV4 } from "../index";

export function AdvancedWorkflowWidget() {
  const result = useToolResult<AppClientToolsV4>();
  const { theme } = useHostContext();
  const client = useAppsClient<AppClientToolsV4>();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [workflowInput, setWorkflowInput] = useState({
    names: ["Alice", "Bob"],
    format: "casual" as "formal" | "casual",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [workflowResult, setWorkflowResult] = useState<{
    summary?: string;
    greetings?: string[];
    format?: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle both wrapped and unwrapped result formats
  const rawResult = result?.process_greeting ?? result;
  const output =
    workflowResult ??
    (rawResult &&
    typeof rawResult === "object" &&
    "summary" in rawResult &&
    "greetings" in rawResult &&
    "format" in rawResult
      ? (rawResult as {
          summary: string;
          greetings: string[];
          format: string;
        })
      : undefined);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.className = theme;
    }
  }, [theme]);

  const handleRunWorkflow = async () => {
    if (workflowInput.names.length === 0) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await client.tools.callProcess_greeting({
        names: workflowInput.names,
        format: workflowInput.format,
      });

      // Extract from structuredContent if present
      const result =
        (response as { structuredContent?: typeof response }).structuredContent ?? response;

      setWorkflowResult(result);
      setIsModalOpen(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Workflow failed:", msg);
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddName = () => {
    setWorkflowInput({
      ...workflowInput,
      names: [...workflowInput.names, ""],
    });
  };

  const handleRemoveName = (index: number) => {
    setWorkflowInput({
      ...workflowInput,
      names: workflowInput.names.filter((_, i) => i !== index),
    });
  };

  const handleUpdateName = (index: number, value: string) => {
    const newNames = [...workflowInput.names];
    newNames[index] = value;
    setWorkflowInput({ ...workflowInput, names: newNames });
  };

  return (
    <div className="container">
      <div className="version-badge">Advanced Workflow (v4)</div>

      {output && output.summary ? (
        <div className="greeting workflow-result">
          <h1>🚀 Advanced Workflow Complete!</h1>

          <div className="workflow-steps">
            <div className="step-result">
              <h3>Summary</h3>
              <p>{output.summary}</p>
            </div>

            {output.greetings && output.greetings.length > 0 && (
              <div className="step-result">
                <h3>Greetings ({output.format})</h3>
                <ul className="greetings-list">
                  {output.greetings.map((greeting, idx) => (
                    <li key={idx}>{greeting}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="step-result">
              <h3>Features Demonstrated</h3>
              <ul className="features-list">
                <li>✅ Parallel Execution</li>
                <li>✅ Conditional Branching</li>
                <li>✅ Custom Step Logic</li>
              </ul>
            </div>
          </div>

          <button className="change-name-btn" onClick={() => setIsModalOpen(true)}>
            Run Again
          </button>
        </div>
      ) : (
        <div className="waiting">
          <h2>🎯 Advanced Workflow Engine</h2>
          <p>This workflow demonstrates advanced features:</p>
          <ul className="workflow-description">
            <li>
              <strong>Parallel execution:</strong> Process multiple names simultaneously
            </li>
            <li>
              <strong>Conditional branching:</strong> Formal vs casual greeting format
            </li>
            <li>
              <strong>Custom logic:</strong> Transform and combine results
            </li>
          </ul>
          <button className="change-name-btn" onClick={() => setIsModalOpen(true)}>
            Run Workflow
          </button>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <h2>Configure Advanced Workflow</h2>

            <div className="form-group">
              <label>Names to Greet</label>
              {workflowInput.names.map((name, index) => (
                <div key={index} className="name-input-group">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => handleUpdateName(index, e.target.value)}
                    placeholder={`Name ${index + 1}`}
                  />
                  {workflowInput.names.length > 1 && (
                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => handleRemoveName(index)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="add-btn" onClick={handleAddName}>
                + Add Name
              </button>
            </div>

            <div className="form-group">
              <label>Greeting Format</label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    value="casual"
                    checked={workflowInput.format === "casual"}
                    onChange={(e) =>
                      setWorkflowInput({
                        ...workflowInput,
                        format: e.target.value as "casual",
                      })
                    }
                  />
                  <span>Casual</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    value="formal"
                    checked={workflowInput.format === "formal"}
                    onChange={(e) =>
                      setWorkflowInput({
                        ...workflowInput,
                        format: e.target.value as "formal",
                      })
                    }
                  />
                  <span>Formal</span>
                </label>
              </div>
            </div>

            {errorMessage && <p className="error-message">{errorMessage}</p>}

            <div className="modal-actions">
              <button onClick={() => setIsModalOpen(false)} disabled={isLoading}>
                Cancel
              </button>
              <button
                onClick={handleRunWorkflow}
                disabled={
                  isLoading ||
                  workflowInput.names.length === 0 ||
                  workflowInput.names.some((n) => !n.trim())
                }
              >
                {isLoading ? "Running..." : "Run Workflow"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdvancedWorkflowWidget;
