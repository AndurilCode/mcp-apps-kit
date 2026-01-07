/**
 * Greeting Widget V2 Component
 *
 * A React component for the v2 API - displays greeting messages with name + optional surname.
 * Uses @mcp-apps-kit/ui-react hooks for receiving tool output and theme changes.
 *
 * This version demonstrates the debug logging API transport feature:
 * - Logs are sent via HTTP to /api/logs endpoint
 * - Useful for OpenAI/ChatGPT environments where MCP tool logging isn't available
 */

import { useEffect, useState } from "react";
import { useToolResult, useHostContext, useAppsClient } from "@mcp-apps-kit/ui-react";
import { clientDebugLogger, getMcpServerBaseUrl } from "@mcp-apps-kit/ui";
import type { AppClientToolsV2 } from "../index";

// Configure the debug logger to use API transport
// getMcpServerBaseUrl() reads the base URL injected at build time via vite.config.ts
clientDebugLogger.configure({
  enabled: true,
  level: "debug",
  transport: "api",
  apiEndpoint: `${getMcpServerBaseUrl()}/api/logs`,
  source: "greeting-widget-v2",
});

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
    // Log theme changes via API transport
    clientDebugLogger.debug("Theme changed", { theme });
  }, [theme]);

  const handleGreet = async () => {
    if (!name.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    // Log the greet attempt via API transport
    clientDebugLogger.info("Greet initiated", {
      name: name.trim(),
      surname: surname.trim() || undefined,
    });

    try {
      const response = await client.tools.callGreet({
        name: name.trim(),
        surname: surname.trim() || undefined,
      });

      // Log success via API transport
      clientDebugLogger.info("Greet successful", response);

      // Extract from structuredContent if present (handles different response formats)
      const result =
        (response as { structuredContent?: typeof response }).structuredContent ?? response;
      setGreetResult(result);
      setIsModalOpen(false);
      setName("");
      setSurname("");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      // Log error via API transport
      clientDebugLogger.error("Greet failed", { error: msg });

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
                onKeyDown={(e) => e.key === "Enter" && handleGreet()}
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
