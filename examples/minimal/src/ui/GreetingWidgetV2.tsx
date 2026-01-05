/**
 * Greeting Widget V2 Component
 *
 * A React component for the v2 API - displays greeting messages with name + optional surname.
 * Uses @mcp-apps-kit/ui-react hooks for receiving tool output and theme changes.
 */

import { useEffect, useState } from "react";
import { useToolResult, useHostContext, useAppsClient } from "@mcp-apps-kit/ui-react";
import type { AppClientToolsV2 } from "../index";

export function GreetingWidgetV2() {
  const result = useToolResult<AppClientToolsV2>();
  const { theme } = useHostContext();
  const client = useAppsClient<AppClientToolsV2>();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [greetResult, setGreetResult] = useState<{
    message: string;
    fullName: string;
    timestamp: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const greetOutput = greetResult ?? result?.greet;

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
      const response = await client.tools.callGreet({
        name: name.trim(),
        surname: surname.trim() || undefined,
      });
      setGreetResult(response);
      setIsModalOpen(false);
      setName("");
      setSurname("");
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
      <div className="version-badge v2">API v2</div>

      {greetOutput?.message ? (
        <div className="greeting">
          <h1>{greetOutput.message}</h1>
          <p className="full-name">Full name: {greetOutput.fullName}</p>
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
            <h2>Enter your name</h2>
            <div className="input-group">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="First name *"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && surname && handleGreet()}
              />
              <input
                type="text"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                placeholder="Surname (optional)"
                onKeyDown={(e) => e.key === "Enter" && handleGreet()}
              />
            </div>
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

export default GreetingWidgetV2;
