/**
 * Greeting Widget Component
 *
 * A React component that displays greeting messages from the greet tool.
 * Uses @mcp-apps-kit/ui-react hooks for receiving tool output and theme changes.
 *
 * Demonstrates the typed tools proxy for calling tools with a more ergonomic API.
 */

import { useEffect, useState } from "react";
import { useToolResult, useHostContext, useAppsClient } from "@mcp-apps-kit/ui-react";
import type { AppClientTools } from "../index";

export function GreetingWidget() {
  const result = useToolResult<AppClientTools>();
  const { theme } = useHostContext();
  const client = useAppsClient<AppClientTools>();

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [greetResult, setGreetResult] = useState<{ message: string; timestamp: string } | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Extract the greet output - prioritize local state from UI-initiated calls,
  // then fall back to host-pushed tool results
  const greetOutput = greetResult ?? result?.greet;

  // Apply theme to document
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.className = theme;
    }
  }, [theme]);

  const handleGreet = async () => {
    if (!name.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);
    try {
      // Using the typed tools proxy - more ergonomic than callTool!
      // Instead of: client.callTool("greet", { name })
      const response = await client.tools.callGreet({ name: name.trim() });
      setGreetResult(response);
      setIsModalOpen(false);
      setName("");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Failed to greet:", msg);
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      {greetOutput?.message ? (
        <div className="greeting">
          <h1>{greetOutput.message}</h1>
          <p className="timestamp">at {new Date(greetOutput.timestamp).toLocaleTimeString()}</p>
          <button className="change-name-btn" onClick={() => setIsModalOpen(true)}>
            Change Name
          </button>
        </div>
      ) : (
        <div className="waiting">
          <p>Waiting for greeting...</p>
          <button className="change-name-btn" onClick={() => setIsModalOpen(true)}>
            Greet Someone
          </button>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Enter a name</h2>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleGreet()}
            />
            {errorMessage && <p className="error-message">{errorMessage}</p>}
            <div className="modal-actions">
              <button onClick={() => setIsModalOpen(false)} disabled={isLoading}>
                Cancel
              </button>
              <button onClick={handleGreet} disabled={isLoading || !name.trim()}>
                {isLoading ? "Greeting..." : "Greet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GreetingWidget;
