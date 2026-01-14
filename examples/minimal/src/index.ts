/**
 * Minimal Example App with Versioning Support
 *
 * Demonstrates @mcp-apps-kit/core versioning feature:
 * - v1: Simple greet tool with just name
 * - v2: Enhanced greet tool with name + optional surname
 * - Shared config (CORS, debug) across versions
 * - Each version exposed at /v1/mcp and /v2/mcp
 */

import {
  createApp,
  defineTool,
  tool,
  type ClientToolsFromCore,
  iconFromFile,
} from "@mcp-apps-kit/core";
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { GreetingWidgetV1 } from "./ui/GreetingWidgetV1";
import { GreetingWidgetV2 } from "./ui/GreetingWidgetV2";
import { EchoWidget } from "./ui/EchoWidget";
import { z } from "zod";

// =============================================================================
// V1: Simple greet tool (name only)
// =============================================================================

const greetInputV1 = z.object({
  name: z.string().describe("Name to greet"),
});

const greetOutputV1 = z.object({
  message: z.string(),
  timestamp: z.string(),
});

const greetToolV1 = defineTool({
  title: "Greet",
  description: "Greet someone by name",
  input: greetInputV1,
  output: greetOutputV1,
  visibility: "both",

  ui: defineReactUI({
    component: GreetingWidgetV1,
    name: "Greeting Widget V1",
    description: "Displays greeting messages (v1 - name only)",
    prefersBorder: true,
  }),

  handler: async (input, context) => {
    const userInfo = context.subject ? ` (authenticated as ${context.subject})` : "";
    const message = `Hello, ${input.name}${userInfo}!`;

    return {
      message,
      timestamp: new Date().toISOString(),
      _text: message,
    };
  },
});

// =============================================================================
// V2: Enhanced greet tool (name + optional surname)
// =============================================================================

const greetInputV2 = z.object({
  name: z.string().describe("First name to greet"),
  surname: z.string().optional().describe("Optional surname"),
});

const greetOutputV2 = z.object({
  message: z.string(),
  fullName: z.string(),
  timestamp: z.string(),
});

const greetToolV2 = tool("Greet")
  .describe("Greet someone by name and optional surname")
  .input(greetInputV2)
  .output(greetOutputV2)
  .visibility("both")
  .ui(
    defineReactUI({
      component: GreetingWidgetV2,
      name: "Greeting Widget V2",
      description: "Displays greeting messages (v2 - with surname support)",
      prefersBorder: true,
      // CSP configuration for ChatGPT - allow connections and resources
      csp: {
        // Allow fetch/XHR to your server (use your public URL or ngrok)
        connectDomains: [
          "http://localhost:3000", // Local dev
          "https://*.ngrok-free.app", // ngrok tunnels
          // Add your production domain here
        ],
        // Allow fonts, images, scripts, stylesheets from CDNs
        resourceDomains: [
          "https://fonts.googleapis.com",
          "https://fonts.gstatic.com",
          // Add other CDNs as needed
        ],
      },
    })
  )
  .handle(async (input, context) => {
    const fullName = input.surname ? `${input.name} ${input.surname}` : input.name;
    const userInfo = context.subject ? ` (authenticated as ${context.subject})` : "";
    const message = `Hello, ${fullName}${userInfo}!`;

    return {
      message,
      fullName,
      timestamp: new Date().toISOString(),
      _text: message,
    };
  })
  .build();

// =============================================================================
// V3: Inline schema syntax demo (no separate schema declarations)
// =============================================================================

/**
 * Demonstrates the inline schema syntax (PRD-002).
 * Instead of declaring separate schema variables, you can define schemas inline.
 *
 * Before (explicit):
 *   const inputSchema = z.object({ name: z.string() });
 *   defineTool({ input: inputSchema, ... })
 *
 * After (inline):
 *   defineTool({ input: { name: z.string() }, ... })
 */
const echoToolV3 = defineTool({
  title: "Echo",
  description: "Echo back a message with metadata (demonstrates inline schema syntax)",

  // Inline input schema - automatically wrapped with z.object()
  input: {
    message: z.string().describe("Message to echo back"),
    uppercase: z.boolean().optional().describe("Convert to uppercase"),
  },

  // Inline output schema - automatically wrapped with z.object()
  output: {
    echo: z.string(),
    length: z.number(),
    timestamp: z.string(),
  },

  visibility: "both",

  ui: defineReactUI({
    component: EchoWidget,
    name: "Echo Widget V3",
    description: "Echoes messages (v3 - inline schema syntax)",
    prefersBorder: true,
  }),

  handler: async (input) => {
    const echo = input.uppercase ? input.message.toUpperCase() : input.message;

    return {
      echo,
      length: echo.length,
      timestamp: new Date().toISOString(),
      _text: `Echo: ${echo}`,
    };
  },
});

// =============================================================================
// V4: Output Type Inference Demo (PRD-004)
// =============================================================================

/**
 * Demonstrates output type inference (PRD-004).
 * When you omit the output schema, TypeScript infers the type from your handler's return.
 *
 * Benefits:
 * - Faster prototyping (no need to write output schemas)
 * - Still get full type safety on the client side
 * - Compile-time only (no runtime validation overhead)
 *
 * When to use:
 * - Rapid prototyping / internal tools
 * - When handler return type is simple and obvious
 *
 * When NOT to use:
 * - External data sources (DB, APIs) - use explicit output for runtime validation
 * - Need JSON Schema generation for API docs
 */
const inferredToolV4 = defineTool({
  title: "Get Stats",
  description:
    "Get server statistics (demonstrates output type inference - no output schema needed!)",

  input: z.object({
    includeMemory: z.boolean().optional().describe("Include memory usage stats"),
  }),

  // NO output schema! TypeScript will infer from handler return type
  // Output type: { uptime: number; timestamp: string; memory?: { used: number; total: number } }

  visibility: "both",

  handler: async (input) => {
    return {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      // Optional field based on input
      ...(input.includeMemory && {
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
        },
      }),
      _text: `Server uptime: ${process.uptime().toFixed(2)}s`,
    };
  },
});

// Fluent builder with inferred output
const quickMathV4 = tool("QuickMath")
  .describe("Perform quick math operations (fluent builder with inferred output)")
  .input(
    z.object({
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
      operation: z.enum(["add", "subtract", "multiply", "divide"]).describe("Operation to perform"),
    })
  )
  // No .output() call - type inferred from handler!
  .visibility("both")
  .handle(async (input) => {
    let result: number;
    switch (input.operation) {
      case "add":
        result = input.a + input.b;
        break;
      case "subtract":
        result = input.a - input.b;
        break;
      case "multiply":
        result = input.a * input.b;
        break;
      case "divide":
        result = input.b !== 0 ? input.a / input.b : NaN;
        break;
    }

    return {
      result,
      expression: `${input.a} ${input.operation} ${input.b} = ${result}`,
      isValid: !isNaN(result),
      _text: `Result: ${result}`,
    };
  })
  .build();

// =============================================================================
// Create Versioned App
// =============================================================================

const app = createApp({
  name: "minimal-app",

  // Server icon - displayed in MCP client UIs
  // Can be a URL or base64 data URI
  icon: iconFromFile("./src/logo.png").src,

  // Shared config across all versions
  config: {
    cors: {
      origin: true,
    },
    protocol: "mcp",
    debug: {
      logTool: true,
      level: "debug",
    },
    // Server config injected into all UIs at runtime
    // UIs can access via getMcpServerConfig() / getMcpServerBaseUrl() from @mcp-apps-kit/ui
    serverConfig: {
      baseUrl: process.env.SERVER_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`,
    },
  },

  // Version definitions
  versions: {
    v1: {
      version: "1.0.0",
      tools: {
        greet: greetToolV1,
      },
      // v1 uses the log_debug MCP tool (default behavior)
    },
    v2: {
      version: "2.0.0",
      tools: {
        greet: greetToolV2,
      },
      config: {
        protocol: "openai",
        // v2 uses the API transport for debug logging (ideal for OpenAI/ChatGPT)
        debug: {
          transport: "api",
          apiEndpoint: "/api/logs",
          level: "debug",
        },
      },
    },
    v3: {
      version: "3.0.0",
      tools: {
        echo: echoToolV3,
      },
      // v3 demonstrates inline schema syntax
    },
    v4: {
      version: "4.0.0",
      tools: {
        getStats: inferredToolV4,
        quickMath: quickMathV4,
      },
      // v4 demonstrates output type inference (PRD-004)
      // No output schemas needed - types inferred from handler returns!
    },
  },
});

// Export app before starting (for testing)
export { app };

// Only start server if not in test environment
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  const port = parseInt(process.env.PORT || "3000");

  app.start({ port }).then(() => {
    const versions = app.getVersions();
    console.log(`
Minimal Example Server with Versioning running on http://localhost:${port}

Available API versions: ${versions.join(", ")}

Endpoints:
  - v1 MCP:     http://localhost:${port}/v1/mcp (uses log_debug MCP tool)
  - v2 MCP:     http://localhost:${port}/v2/mcp (uses API transport for logging)
  - v2 Logs:    http://localhost:${port}/api/logs (debug log API endpoint)
  - v3 MCP:     http://localhost:${port}/v3/mcp (inline schema syntax demo)
  - v4 MCP:     http://localhost:${port}/v4/mcp (output type inference demo)
  - Health:     http://localhost:${port}/health

Debug logging:
  - v1: Uses log_debug MCP tool (default for MCP adapter)
  - v2: Uses HTTP API transport at /api/logs (ideal for OpenAI/ChatGPT)
  - v3: Default MCP logging (demonstrates inline schema syntax)
  - v4: Default MCP logging (demonstrates output type inference)
  `);
  });
}

// =============================================================================
// Export types for UI
// =============================================================================

// Note: For multi-version apps, TypeScript has limitations with per-version type extraction.
// Manual type exports are still recommended for this use case.
// For single-version apps, you can export the app and use typeof app.clientTypes() in your UI code.

// V1 types (manual exports - required for multi-version apps)
export type AppToolsV1 = { greet: typeof greetToolV1 };
export type AppClientToolsV1 = ClientToolsFromCore<AppToolsV1>;
export type GreetInputV1 = z.infer<typeof greetInputV1>;
export type GreetOutputV1 = z.infer<typeof greetOutputV1>;

// V2 types (manual exports - required for multi-version apps)
export type AppToolsV2 = { greet: typeof greetToolV2 };
export type AppClientToolsV2 = ClientToolsFromCore<AppToolsV2>;
export type GreetInputV2 = z.infer<typeof greetInputV2>;
export type GreetOutputV2 = z.infer<typeof greetOutputV2>;

// V3 types (inline schema syntax - types inferred directly from tool definition)
export type AppToolsV3 = { echo: typeof echoToolV3 };
export type AppClientToolsV3 = ClientToolsFromCore<AppToolsV3>;

// V4 types (output inference - no output schemas needed!)
// ClientToolsFromCore will automatically infer output types from handler returns
export type AppToolsV4 = { getStats: typeof inferredToolV4; quickMath: typeof quickMathV4 };
export type AppClientToolsV4 = ClientToolsFromCore<AppToolsV4>;

// Type examples showing what gets inferred:
// AppClientToolsV4["getStats"]["output"] is:
//   { uptime: number; timestamp: string; memory?: { used: number; total: number } }
// AppClientToolsV4["quickMath"]["output"] is:
//   { result: number; expression: string; isValid: boolean }
// Note: _text and other meta keys are automatically excluded from client types!
