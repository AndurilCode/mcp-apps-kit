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
  workflow,
  toolStep,
  customStep,
  type ClientToolsFromCore,
  iconFromFile,
} from "@mcp-apps-kit/core";
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { GreetingWidgetV1 } from "./ui/GreetingWidgetV1";
import { GreetingWidgetV2 } from "./ui/GreetingWidgetV2";
import { EchoWidget } from "./ui/EchoWidget";
import { WorkflowWidget } from "./ui/WorkflowWidget";
import { AdvancedWorkflowWidget } from "./ui/AdvancedWorkflowWidget";
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
// V4: Workflow Engine Demo - Multi-Step Tool Composition
// =============================================================================

/**
 * Demonstrates the workflow engine feature.
 * Workflows allow you to compose multi-step tools from existing tools and custom logic.
 *
 * This example creates a "greet_and_echo" workflow that:
 * 1. Greets a person using the greet tool
 * 2. Transforms the greeting message
 * 3. Echoes the transformed message using the echo tool
 * 4. Combines both results with a timestamp
 */

// First, define the individual tools that the workflow will use
const greetForWorkflowTool = defineTool({
  title: "Greet For Workflow",
  description: "Greet someone (internal tool for workflow)",
  input: {
    name: z.string().describe("Name to greet"),
  },
  output: {
    message: z.string(),
  },
  visibility: "model", // Only visible to AI model, not in app UI
  handler: async (input) => {
    return {
      message: `Hello, ${input.name}!`,
    };
  },
});

const echoForWorkflowTool = defineTool({
  title: "Echo For Workflow",
  description: "Echo a message (internal tool for workflow)",
  input: {
    message: z.string().describe("Message to echo"),
    uppercase: z.boolean().optional().describe("Convert to uppercase"),
  },
  output: {
    echo: z.string(),
  },
  visibility: "model", // Only visible to AI model, not in app UI
  handler: async (input) => {
    const echo = input.uppercase ? input.message.toUpperCase() : input.message;
    return { echo };
  },
});

// Now create a workflow that composes these tools
const greetAndEchoWorkflow = workflow("greet_and_echo")
  .describe("Greet someone and echo their greeting with a fun twist")
  .input({
    name: z.string().describe("Person's name to greet"),
    excitement: z.number().min(1).max(10).default(5).describe("Excitement level (1-10)"),
  })
  .output({
    greet_and_echo: z.object({
      greeting: z.string(),
      echo: z.string(),
      excitementLevel: z.number(),
      timestamp: z.string(),
    }),
  })
  // Step 1: Greet the person
  .step("greet", toolStep("greet_for_workflow"), {
    mapInput: (ctx) => ({
      name: (ctx.input as { name: string }).name,
    }),
  })
  // Step 2: Add custom excitement transformation
  .step(
    "add_excitement",
    customStep(async (ctx) => {
      const greetingMsg = (ctx.outputs.greet as { message: string }).message;
      const excitement = (ctx.input as { excitement: number }).excitement;
      const exclamations = "!".repeat(excitement);
      return {
        enhancedMessage: `${greetingMsg}${exclamations}`,
      };
    })
  )
  // Step 3: Echo the enhanced message in uppercase
  .step("echo", toolStep("echo_for_workflow"), {
    mapInput: (ctx) => ({
      message: (ctx.outputs.add_excitement as { enhancedMessage: string }).enhancedMessage,
      uppercase: true,
    }),
  })
  // Step 4: Combine results
  .step(
    "combine",
    customStep(async (ctx) => {
      const greeting = (ctx.outputs.greet as { message: string }).message;
      const echo = (ctx.outputs.echo as { echo: string }).echo;
      const excitement = (ctx.input as { excitement: number }).excitement;

      return {
        greet_and_echo: {
          greeting,
          echo,
          excitementLevel: excitement,
          timestamp: new Date().toISOString(),
        },
      };
    })
  )
  // Add interactive UI for the workflow
  .ui(
    defineReactUI({
      component: WorkflowWidget,
      name: "Workflow Engine Widget",
      description: "Interactive UI demonstrating multi-step workflow execution",
      prefersBorder: true,
    })
  )
  .build();

// Example of a workflow with parallel execution and branching
const advancedWorkflow = workflow("process_greeting")
  .describe("Advanced workflow with parallel steps and conditional logic")
  .input({
    names: z.array(z.string()).describe("List of names to greet"),
    format: z.enum(["formal", "casual"]).default("casual").describe("Greeting format"),
  })
  .output({
    summary: z.string(),
    greetings: z.array(z.string()),
    format: z.string(),
  })
  // Parallel step: Greet all names simultaneously
  .parallel("greet_all", [
    customStep(async (ctx) => {
      const names = (ctx.input as { names: string[] }).names;
      return { count: names.length };
    }),
    customStep(async (ctx) => {
      const names = (ctx.input as { names: string[] }).names;
      return { longestName: names.reduce((a, b) => (a.length > b.length ? a : b), "") };
    }),
  ])
  // Conditional branching based on format
  .branch("format_greeting", {
    when: (ctx) => (ctx.input as { format: string }).format === "formal",
    then: [
      customStep(async (ctx) => ({
        prefix: "Dear",
        suffix: "Sincerely yours",
      })),
    ],
    else: [
      customStep(async (ctx) => ({
        prefix: "Hey",
        suffix: "Cheers",
      })),
    ],
  })
  // Final step: combine everything
  .step(
    "finalize",
    customStep(async (ctx) => {
      const names = (ctx.input as { names: string[] }).names;
      const format = (ctx.input as { format: string }).format;
      const parallelResults = ctx.outputs.greet_all as [{ count: number }, { longestName: string }];
      const branchResults = ctx.outputs.format_greeting as [{ prefix: string; suffix: string }];

      const formatData = branchResults[0];
      const greetings = names.map((name) => `${formatData?.prefix} ${name}`);
      const summary = `Processed ${parallelResults[0].count} greetings in ${format} format`;

      return {
        summary,
        greetings,
        format,
      };
    })
  )
  // Add interactive UI for the advanced workflow
  .ui(
    defineReactUI({
      component: AdvancedWorkflowWidget,
      name: "Advanced Workflow Widget",
      description: "Interactive UI demonstrating parallel execution and conditional branching",
      prefersBorder: true,
    })
  )
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
        // Internal tools used by workflows (visibility: "model")
        greet_for_workflow: greetForWorkflowTool,
        echo_for_workflow: echoForWorkflowTool,

        // Workflows exposed as tools
        greet_and_echo: greetAndEchoWorkflow,
        process_greeting: advancedWorkflow,
      },
      // v4 demonstrates the workflow engine
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
  - v4 MCP:     http://localhost:${port}/v4/mcp (workflow engine demo)
  - Health:     http://localhost:${port}/health

Debug logging:
  - v1: Uses log_debug MCP tool (default for MCP adapter)
  - v2: Uses HTTP API transport at /api/logs (ideal for OpenAI/ChatGPT)
  - v3: Default MCP logging (demonstrates inline schema syntax)
  - v4: Default MCP logging (demonstrates workflow engine)

Try the workflow tools:
  - greet_and_echo: Compose greet + custom logic + echo
  - process_greeting: Parallel execution + conditional branching
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

// V4 types (workflow engine)
export type AppToolsV4 = {
  greet_for_workflow: typeof greetForWorkflowTool;
  echo_for_workflow: typeof echoForWorkflowTool;
  greet_and_echo: typeof greetAndEchoWorkflow;
  process_greeting: typeof advancedWorkflow;
};
export type AppClientToolsV4 = ClientToolsFromCore<AppToolsV4>;
