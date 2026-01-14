/**
 * Echo Widget Component
 *
 * A React component for the v3 API - displays echo results with message metadata.
 * Demonstrates the inline schema syntax feature (PRD-002).
 */

import { useEffect, useState } from "react";
import { useToolResult, useHostContext, useAppsClient } from "@mcp-apps-kit/ui-react";
import type { AppClientToolsV3 } from "../index";

export function EchoWidget() {
  const result = useToolResult<AppClientToolsV3>();
  const { theme } = useHostContext();
  const client = useAppsClient<AppClientToolsV3>();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [uppercase, setUppercase] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [echoResult, setEchoResult] = useState<{
    echo: string;
    length: number;
    timestamp: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle both wrapped ({ echo: {...} }) and unwrapped ({...}) result formats
  const rawResult = result?.echo ?? result;
  const echoOutput =
    echoResult ??
    (rawResult && "echo" in rawResult
      ? (rawResult as { echo: string; length: number; timestamp: string })
      : undefined);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.className = theme;
    }
  }, [theme]);

  const handleEcho = async () => {
    if (!message.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await client.tools.callEcho({
        message: message.trim(),
        uppercase,
      });

      // Extract from structuredContent if present (handles different response formats)
      const result =
        (response as { structuredContent?: typeof response }).structuredContent ?? response;
      setEchoResult(result as { echo: string; length: number; timestamp: string });
      setIsModalOpen(false);
      setMessage("");
      setUppercase(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Failed to echo:", msg);
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="version-badge v3">API v3</div>

      {echoOutput?.echo ? (
        <div className="greeting">
          <h1>{echoOutput.echo}</h1>
          <p className="full-name">Length: {echoOutput.length} characters</p>
          <p className="timestamp">at {new Date(echoOutput.timestamp).toLocaleTimeString()}</p>
          <button className="change-name-btn" onClick={() => setIsModalOpen(true)}>
            Echo Again
          </button>
        </div>
      ) : (
        <div className="waiting">
          <p>Waiting for message to echo...</p>
          <button className="change-name-btn" onClick={() => setIsModalOpen(true)}>
            Send Message
          </button>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Enter a message</h2>
            <div className="input-group">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Message to echo *"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleEcho()}
              />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={uppercase}
                  onChange={(e) => setUppercase(e.target.checked)}
                />
                Convert to uppercase
              </label>
            </div>
            {errorMessage && <p className="error-message">{errorMessage}</p>}
            <div className="modal-actions">
              <button onClick={() => setIsModalOpen(false)} disabled={isLoading}>
                Cancel
              </button>
              <button onClick={handleEcho} disabled={isLoading || !message.trim()}>
                {isLoading ? "Echoing..." : "Echo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EchoWidget;
