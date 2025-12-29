/**
 * UI resource type definitions for @mcp-apps-kit/core
 */

// =============================================================================
// CSP CONFIGURATION
// =============================================================================

/**
 * Content Security Policy configuration
 *
 * Unified CSP interface that maps to protocol-specific formats:
 * - MCP Apps: `_meta.ui.csp.{connectDomains, resourceDomains}`
 * - ChatGPT: `_meta["openai/widgetCSP"].{connect_domains, resource_domains, ...}`
 */
export interface CSPConfig {
  /**
   * Domains allowed for fetch/XHR/WebSocket connections.
   * Maps to connect-src directive.
   *
   * @example ["https://api.example.com", "wss://realtime.example.com"]
   */
  connectDomains?: string[];

  /**
   * Domains allowed for images, scripts, stylesheets, fonts.
   * Maps to img-src, script-src, style-src, font-src directives.
   *
   * @example ["https://cdn.example.com", "https://fonts.googleapis.com"]
   */
  resourceDomains?: string[];

  /**
   * Domains for openExternal without confirmation modal.
   * ChatGPT only - ignored on MCP Apps.
   *
   * @example ["https://docs.example.com"]
   */
  redirectDomains?: string[];

  /**
   * Allowed iframe origins.
   * ChatGPT only - discouraged for security reasons.
   *
   * @example ["https://embed.example.com"]
   */
  frameDomains?: string[];
}

// =============================================================================
// UI RESOURCE DEFINITION
// =============================================================================

/**
 * Single UI resource definition
 *
 * Defines an HTML-based UI component that can be bound to tools.
 *
 * @example
 * ```typescript
 * const ui = {
 *   "restaurant-list": {
 *     html: "./ui/dist/list.html",
 *     csp: {
 *       connectDomains: ["https://api.yelp.com"],
 *       resourceDomains: ["https://s3-media0.fl.yelpcdn.com"],
 *     },
 *     prefersBorder: true,
 *   },
 * };
 * ```
 */
export interface UIDef {
  /**
   * HTML content - path to file or inline HTML string.
   *
   * If the value starts with "<", it's treated as inline HTML.
   * Otherwise, it's treated as a file path relative to the project root.
   *
   * @example "./ui/dist/widget.html"
   * @example "<div>Hello World</div>"
   */
  html: string;

  /**
   * Optional display name for the UI resource.
   * Used in protocol metadata.
   */
  name?: string;

  /**
   * Optional description of the UI resource.
   * Used in protocol metadata.
   */
  description?: string;

  /**
   * Human-readable summary for the AI model (ChatGPT only).
   *
   * This description helps the model understand what the widget does
   * and when to display it. Keep it concise and informative.
   *
   * @example "Interactive task board for managing project workflows"
   */
  widgetDescription?: string;

  /**
   * Content Security Policy configuration.
   * Controls what external resources the UI can access.
   */
  csp?: CSPConfig;

  /**
   * Request a visible border around the widget.
   * Hint to the host platform - may not be honored.
   */
  prefersBorder?: boolean;

  /**
   * Dedicated domain for widget isolation.
   * Advanced feature for security-sensitive applications.
   *
   * ChatGPT only - ignored on MCP Apps.
   */
  domain?: string;
}

/**
 * Collection of UI resource definitions
 *
 * Keys are used to reference UI resources from tool definitions.
 *
 * @example
 * ```typescript
 * const ui: UIDefs = {
 *   "main-widget": { html: "./widget.html" },
 *   "detail-view": { html: "./detail.html", prefersBorder: true },
 * };
 * ```
 */
export type UIDefs = Record<string, UIDef>;

// =============================================================================
// UI DEFINITION HELPER
// =============================================================================

/**
 * Helper function to define a UI resource with proper type inference.
 *
 * Use this helper to define UI resources that can be:
 * - Colocated inline within a tool definition
 * - Extracted and shared across multiple tools
 *
 * @example Inline with tool (simple case)
 * ```typescript
 * const myTool = defineTool({
 *   description: "My tool",
 *   input: z.object({ name: z.string() }),
 *   output: z.object({ result: z.string() }),
 *   ui: defineUI({
 *     html: "./widget.html",
 *     prefersBorder: true,
 *   }),
 *   handler: async (input) => ({ result: `Hello ${input.name}` }),
 * });
 * ```
 *
 * @example Extracted for reuse (shared UI)
 * ```typescript
 * // Shared UI definition
 * const listUI = defineUI({
 *   html: "./list-widget.html",
 *   name: "List Widget",
 *   csp: { connectDomains: ["https://api.example.com"] },
 * });
 *
 * // Multiple tools using the same UI
 * const searchTool = defineTool({
 *   description: "Search items",
 *   ui: listUI,
 *   // ...
 * });
 *
 * const filterTool = defineTool({
 *   description: "Filter items",
 *   ui: listUI,
 *   // ...
 * });
 * ```
 */
export function defineUI(definition: UIDef): UIDef {
  return definition;
}
