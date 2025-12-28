/**
 * Minimal UI Widget
 *
 * Demonstrates basic @mcp-apps-kit/ui client usage:
 * - Receiving tool output
 * - Responding to theme changes
 * - Type-safe client with inferred tool types
 */

import { createClient } from "@mcp-apps-kit/ui";
import type { AppClientTools, GreetOutput } from "../index";

// Type derived from server-side Zod schemas via ClientToolsFromCore
type GreetingOutput = GreetOutput;

async function main() {
  const client = await createClient<AppClientTools>();
  const container = document.getElementById("app");
  if (!container) return;

  // Initial render
  render(container, client.toolOutput as GreetingOutput | undefined, client.hostContext.theme);

  // Re-render when tool output changes
  client.onToolResult((result) => {
    render(container, result.greet as GreetingOutput | undefined, client.hostContext.theme);
  });

  // Re-render when context changes (theme, etc.)
  client.onHostContextChange((context) => {
    document.documentElement.className = context.theme;
    render(container, client.toolOutput as GreetingOutput | undefined, context.theme);
  });
}

function render(container: HTMLElement, output: GreetingOutput | undefined, theme: string) {
  document.documentElement.className = theme;

  if (output?.message) {
    const date = new Date(output.timestamp);
    const timeStr = date.toLocaleTimeString();

    container.innerHTML = `
      <div class="greeting">
        <h1>${escapeHtml(output.message)}</h1>
        <p class="timestamp">at ${timeStr}</p>
      </div>
    `;
  } else {
    container.innerHTML = `
      <p class="waiting">Waiting for greeting...</p>
    `;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

main();
