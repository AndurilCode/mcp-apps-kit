/**
 * Workflow Widget Component
 *
 * A React component for displaying workflow execution results.
 * Demonstrates UI integration with the workflow engine.
 */

import { useEffect, useState } from "react";
import { useToolResult, useHostContext, useAppsClient } from "@mcp-apps-kit/ui-react";
import type { AppClientToolsV4 } from "../index";

export function WorkflowWidget() {
  const result = useToolResult<AppClientToolsV4>();
  const { theme } = useHostContext();
  const client = useAppsClient<AppClientToolsV4>();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [workflowInput, setWorkflowInput] = useState({
    name: "",
    excitement: 5,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [workflowResult, setWorkflowResult] = useState<{
    greeting: string;
    echo: string;
    excitementLevel: number;
    timestamp: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle both wrapped and unwrapped result formats
  // The result structure is: { greet_and_echo: { greeting, echo, excitementLevel, timestamp } }
  const rawResult = result?.greet_and_echo ?? result;
  const extractedData =
    rawResult && typeof rawResult === "object" && "greet_and_echo" in rawResult
      ? (rawResult.greet_and_echo as {
          greeting: string;
          echo: string;
          excitementLevel: number;
          timestamp: string;
        })
      : rawResult && typeof rawResult === "object" && "greeting" in rawResult
        ? (rawResult as {
            greeting: string;
            echo: string;
            excitementLevel: number;
            timestamp: string;
          })
        : undefined;

  const output = workflowResult ?? extractedData;

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.className = theme;
    }
  }, [theme]);

  const handleRunWorkflow = async () => {
    if (!workflowInput.name.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await client.tools.callGreet_and_echo({
        name: workflowInput.name.trim(),
        excitement: workflowInput.excitement,
      });

      // Extract from structuredContent if present
      const result =
        (response as { structuredContent?: typeof response }).structuredContent ?? response;

      // Handle nested greet_and_echo structure
      // The workflow returns: { greet_and_echo: { greeting, echo, excitementLevel, timestamp } }
      const finalResult =
        result && typeof result === "object" && "greet_and_echo" in result
          ? result.greet_and_echo
          : result;

      setWorkflowResult(finalResult as typeof workflowResult);
      setIsModalOpen(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Workflow failed:", msg);
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="version-badge">Workflow Engine (v4)</div>

      {output ? (
        <div className="greeting workflow-result">
          <h1>🎉 Workflow Complete!</h1>

          <div className="workflow-steps">
            <div className="step-result">
              <h3>Step 1: Greeting</h3>
              <p>{output.greeting}</p>
            </div>

            <div className="step-result">
              <h3>Step 2: Echo Transform</h3>
              <p className="echo-text">{output.echo}</p>
            </div>

            <div className="step-result">
              <h3>Excitement Level</h3>
              <div className="excitement-meter">
                <div
                  className="excitement-fill"
                  style={{ width: `${output.excitementLevel * 10}%` }}
                />
                <span className="excitement-label">{output.excitementLevel}/10</span>
              </div>
            </div>
          </div>

          <p className="timestamp">
            Completed at {new Date(output.timestamp).toLocaleTimeString()}
          </p>

          <button className="change-name-btn" onClick={() => setIsModalOpen(true)}>
            Run Again
          </button>
        </div>
      ) : (
        <div className="waiting">
          <h2>🔄 Workflow Engine Ready</h2>
          <p>This workflow demonstrates multi-step tool composition:</p>
          <ol className="workflow-description">
            <li>Greet a person</li>
            <li>Add excitement level</li>
            <li>Echo with uppercase transform</li>
            <li>Combine all results</li>
          </ol>
          <button className="change-name-btn" onClick={() => setIsModalOpen(true)}>
            Run Workflow
          </button>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Configure Workflow</h2>

            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                value={workflowInput.name}
                onChange={(e) => setWorkflowInput({ ...workflowInput, name: e.target.value })}
                placeholder="Enter a name"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleRunWorkflow()}
              />
            </div>

            <div className="form-group">
              <label htmlFor="excitement">Excitement Level: {workflowInput.excitement}</label>
              <input
                id="excitement"
                type="range"
                min="1"
                max="10"
                value={workflowInput.excitement}
                onChange={(e) =>
                  setWorkflowInput({
                    ...workflowInput,
                    excitement: parseInt(e.target.value),
                  })
                }
              />
              <div className="range-labels">
                <span>Calm (1)</span>
                <span>Excited (10)</span>
              </div>
            </div>

            {errorMessage && <p className="error-message">{errorMessage}</p>}

            <div className="modal-actions">
              <button onClick={() => setIsModalOpen(false)} disabled={isLoading}>
                Cancel
              </button>
              <button
                onClick={handleRunWorkflow}
                disabled={isLoading || !workflowInput.name.trim()}
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

export default WorkflowWidget;
