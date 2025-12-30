/**
 * Greeting Widget Component
 *
 * A React component that displays greeting messages from the greet tool.
 * Uses @mcp-apps-kit/ui-react hooks for receiving tool output and theme changes.
 */

import { useEffect } from "react";
import { useToolResult, useHostContext } from "@mcp-apps-kit/ui-react";
import type { AppClientTools } from "../index";

export function GreetingWidget() {
  const result = useToolResult<AppClientTools>();
  const { theme } = useHostContext();

  // Extract the greet output - result contains the tool outputs keyed by tool name
  const greetOutput = result?.greet;

  // Apply theme to document
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.className = theme;
    }
  }, [theme]);

  if (greetOutput?.message) {
    const date = new Date(greetOutput.timestamp);
    const timeStr = date.toLocaleTimeString();

    return (
      <div className="container">
        <div className="greeting">
          <h1>{greetOutput.message}</h1>
          <p className="timestamp">at {timeStr}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <p className="waiting">Waiting for greeting...</p>
    </div>
  );
}

export default GreetingWidget;
