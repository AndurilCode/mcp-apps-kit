/**
 * Kanban Board Example App
 *
 * A simple Kanban board implementation demonstrating @mcp-apps-kit/core features:
 * - Type-safe tool definitions with Zod schemas (using defineTool helper)
 * - UI resource binding for rich visualizations
 * - Protocol-agnostic design (works with MCP and OpenAI)
 * - Plugin system for cross-cutting concerns (logging, analytics)
 * - Middleware for request processing (rate limiting, authentication)
 * - Event system for observability and analytics
 */

import { createApp, defineTool, type ClientToolsFromCore } from "@mcp-apps-kit/core";
import { createPlugin } from "@mcp-apps-kit/core";
import type { Middleware } from "@mcp-apps-kit/core";
import { z } from "zod";

// Required for Vercel to detect Express serverless function
import "express";

// =============================================================================
// DATA TYPES
// =============================================================================

type TaskStatus = "todo" | "in_progress" | "done";

interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  attachmentId?: string; // File attachment reference (for file upload demo)
}

// =============================================================================
// IN-MEMORY STORE
// =============================================================================

const tasks: Map<string, Task> = new Map();

// Seed with some example tasks
function seedTasks() {
  const now = new Date().toISOString();
  const exampleTasks: Task[] = [
    {
      id: "task-1",
      title: "Set up project structure",
      description: "Initialize the monorepo with NX and configure packages",
      status: "done",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "task-2",
      title: "Implement core SDK",
      description: "Build the createApp function and tool registration",
      status: "in_progress",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "task-3",
      title: "Add UI components",
      description: "Create React hooks for widget development",
      status: "todo",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "task-4",
      title: "Write documentation",
      description: "Document API and usage examples",
      status: "todo",
      createdAt: now,
      updatedAt: now,
    },
  ];

  exampleTasks.forEach((task) => tasks.set(task.id, task));
}

seedTasks();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function getTasksByStatus(status: TaskStatus): Task[] {
  return Array.from(tasks.values()).filter((t) => t.status === status);
}

function getAllTasks(): Task[] {
  return Array.from(tasks.values());
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

const TaskStatusSchema = z.enum(["todo", "in_progress", "done"]);

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: TaskStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  attachmentId: z.string().optional(),
});

// Tool input schemas (extracted for type inference)
const ListTasksInput = z.object({
  status: TaskStatusSchema.optional().describe(
    "Filter tasks by status: 'todo', 'in_progress', or 'done'"
  ),
});

const CreateTaskInput = z.object({
  title: z.string().min(1).describe("Task title (required)"),
  description: z.string().optional().describe("Task description"),
  status: TaskStatusSchema.default("todo").describe("Initial status (defaults to 'todo')"),
  attachmentId: z.string().optional().describe("Optional file attachment ID"),
});

const MoveTaskInput = z.object({
  taskId: z.string().describe("ID of the task to move"),
  newStatus: TaskStatusSchema.describe("Target column/status"),
});

const UpdateTaskInput = z.object({
  taskId: z.string().describe("ID of the task to update"),
  title: z.string().optional().describe("New title"),
  description: z.string().optional().describe("New description"),
});

const DeleteTaskInput = z.object({
  taskId: z.string().describe("ID of the task to delete"),
});

const ClearCompletedInput = z.object({
  closeWidget: z
    .boolean()
    .default(false)
    .describe("Whether to close the widget after clearing (ChatGPT only)"),
});

const ExportBoardInput = z.object({
  format: z.enum(["json", "csv"]).default("json").describe("Export format"),
  includeMetadata: z.boolean().default(true).describe("Include task metadata"),
});

const GetBoardSummaryInput = z.object({});

// =============================================================================
// PLUGINS: Cross-cutting concerns like logging and analytics
// =============================================================================

/**
 * Simple logging plugin that logs all tool calls
 * Plugins allow you to add functionality without modifying tool handlers
 */
const loggingPlugin = createPlugin({
  name: "kanban-logger",
  version: "1.0.0",

  // Called when app initializes
  onInit: async () => {
    console.log("[Plugin] Kanban board initializing...");
  },

  // Called before every tool execution
  beforeToolCall: async (context) => {
    console.log(`[Plugin] Tool called: ${context.toolName}`);
  },

  // Called after successful tool execution
  afterToolCall: async (context, result) => {
    console.log(`[Plugin] Tool ${context.toolName} completed successfully`);
  },

  // Called when a tool throws an error
  onToolError: async (context, error) => {
    console.error(`[Plugin] Tool ${context.toolName} failed:`, error.message);
  },
});

// =============================================================================
// MIDDLEWARE: Request processing pipeline
// =============================================================================

/**
 * Simple request logging middleware
 * Middleware processes requests in order and can modify context.state
 */
const requestLoggingMiddleware: Middleware = async (context, next) => {
  const startTime = Date.now();

  console.log(`[Middleware] Processing ${context.toolName}...`);

  // Store timestamp in shared state (accessible to other middleware and tool handler)
  context.state.set("requestStartTime", startTime);

  // Call next middleware or tool handler
  await next();

  const duration = Date.now() - startTime;
  console.log(`[Middleware] ${context.toolName} completed in ${duration}ms`);
};

/**
 * Simple rate limiting middleware (demonstration only)
 * In production, you'd use a proper rate limiting strategy
 */
const rateLimitingMiddleware: Middleware = async (context, next) => {
  // Get or initialize request count from state
  const requestCount = (context.state.get("requestCount") as number) || 0;
  context.state.set("requestCount", requestCount + 1);

  // Example: Log every 10th request
  if (requestCount > 0 && requestCount % 10 === 0) {
    console.log(`[Middleware] Processed ${requestCount} requests`);
  }

  await next();
};

// =============================================================================
// APP DEFINITION
// =============================================================================

const app = createApp({
  name: "kanban-board",
  version: "1.0.0",

  // Register plugins for cross-cutting concerns
  plugins: [loggingPlugin],

  tools: {
    // =========================================================================
    // LIST TASKS (Widget-only tool)
    // =========================================================================
    listTasks: defineTool({
      title: "List Tasks",
      description: "List all tasks on the Kanban board, optionally filtered by status",
      input: ListTasksInput,
      output: z.object({
        tasks: z.array(TaskSchema),
        counts: z.object({
          todo: z.number(),
          in_progress: z.number(),
          done: z.number(),
          total: z.number(),
        }),
      }),
      visibility: "app",
      widgetAccessible: true,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      handler: async (input, context) => {
        const filteredTasks = input.status ? getTasksByStatus(input.status) : getAllTasks();

        // Use context.locale for potential localization (example)
        const locale = context.locale ?? "en-US";

        return {
          tasks: filteredTasks,
          counts: {
            todo: getTasksByStatus("todo").length,
            in_progress: getTasksByStatus("in_progress").length,
            done: getTasksByStatus("done").length,
            total: tasks.size,
          },
          _meta: { locale },
        };
      },
    }),

    // =========================================================================
    // CREATE TASK (Widget-only tool with file attachment support)
    // =========================================================================
    createTask: defineTool({
      title: "Create Task",
      description: "Create a new task on the Kanban board with optional file attachment",
      input: CreateTaskInput,
      output: z.object({
        task: TaskSchema,
        message: z.string(),
      }),
      visibility: "app",
      widgetAccessible: true,
      invokingMessage: "Creating task...",
      invokedMessage: "Task created!",
      // Enable file upload for the attachmentId parameter (ChatGPT only)
      fileParams: ["attachmentId"],
      annotations: {
        readOnlyHint: false,
      },
      handler: async (input, context) => {
        // Format timestamp using user's timezone if available
        const timezone = context.userLocation?.timezone ?? "UTC";
        const now = new Date().toISOString();
        const task: Task = {
          id: generateId(),
          title: input.title,
          description: input.description,
          status: input.status,
          createdAt: now,
          updatedAt: now,
          attachmentId: input.attachmentId,
        };

        tasks.set(task.id, task);

        const message = `Created task "${input.title}" in ${input.status} column${input.attachmentId ? " with attachment" : ""}`;
        return {
          task,
          message,
          _text: message,
          _meta: { timezone },
        };
      },
    }),

    // =========================================================================
    // MOVE TASK (Widget-only tool)
    // =========================================================================
    moveTask: defineTool({
      title: "Move Task",
      description: "Move a task to a different column on the Kanban board",
      input: MoveTaskInput,
      output: z.object({
        task: TaskSchema,
        message: z.string(),
      }),
      visibility: "app",
      widgetAccessible: true,
      invokingMessage: "Moving task...",
      invokedMessage: "Task moved!",
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
      },
      handler: async (input, context) => {
        const task = tasks.get(input.taskId);
        if (!task) {
          throw new Error(`Task with ID "${input.taskId}" not found`);
        }

        const oldStatus = task.status;
        task.status = input.newStatus;
        task.updatedAt = new Date().toISOString();

        // Track who performed the action (anonymized)
        const performer = context.subject ?? "anonymous";

        const message = `Moved "${task.title}" from ${oldStatus} to ${input.newStatus}`;
        return {
          task,
          message,
          _text: message,
          _meta: { performer },
        };
      },
    }),

    // =========================================================================
    // UPDATE TASK (Widget-only tool)
    // =========================================================================
    updateTask: defineTool({
      title: "Update Task",
      description: "Update a task's title or description",
      input: UpdateTaskInput,
      output: z.object({
        task: TaskSchema,
        message: z.string(),
      }),
      visibility: "app",
      widgetAccessible: true,
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
      },
      handler: async (input, _context) => {
        const task = tasks.get(input.taskId);
        if (!task) {
          throw new Error(`Task with ID "${input.taskId}" not found`);
        }

        if (input.title !== undefined) {
          task.title = input.title;
        }
        if (input.description !== undefined) {
          task.description = input.description;
        }
        task.updatedAt = new Date().toISOString();

        const message = `Updated task "${task.title}"`;
        return {
          task,
          message,
          _text: message,
        };
      },
    }),

    // =========================================================================
    // DELETE TASK (Widget-only tool)
    // =========================================================================
    deleteTask: defineTool({
      title: "Delete Task",
      description: "Delete a task from the Kanban board",
      input: DeleteTaskInput,
      output: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
      visibility: "app",
      widgetAccessible: true,
      invokingMessage: "Deleting task...",
      invokedMessage: "Task deleted!",
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
      },
      handler: async (input, _context) => {
        const task = tasks.get(input.taskId);
        if (!task) {
          throw new Error(`Task with ID "${input.taskId}" not found`);
        }

        tasks.delete(input.taskId);

        const message = `Deleted task "${task.title}"`;
        return {
          success: true,
          message,
          _text: message,
        };
      },
    }),

    // =========================================================================
    // CLEAR COMPLETED (Demonstrates _closeWidget for widget dismissal)
    // =========================================================================
    clearCompleted: defineTool({
      title: "Clear Completed Tasks",
      description: "Remove all completed tasks from the board and close the widget",
      input: ClearCompletedInput,
      output: z.object({
        success: z.boolean(),
        message: z.string(),
        deletedCount: z.number(),
      }),
      visibility: "both",
      widgetAccessible: true,
      invokingMessage: "Clearing completed tasks...",
      invokedMessage: "Completed tasks cleared!",
      annotations: {
        destructiveHint: true,
      },
      handler: async (input, _context) => {
        const completedTasks = getTasksByStatus("done");
        const deletedCount = completedTasks.length;

        completedTasks.forEach((task) => tasks.delete(task.id));

        const message =
          deletedCount > 0
            ? `Cleared ${deletedCount} completed task${deletedCount > 1 ? "s" : ""}`
            : "No completed tasks to clear";

        return {
          success: true,
          message,
          deletedCount,
          _text: message,
          // Signal to close the widget after this action (ChatGPT only)
          _closeWidget: input.closeWidget,
        };
      },
    }),

    // =========================================================================
    // EXPORT BOARD (Demonstrates openWorldHint for external operations)
    // =========================================================================
    exportBoard: defineTool({
      title: "Export Board",
      description: "Export the Kanban board data as JSON (simulates external API call)",
      input: ExportBoardInput,
      output: z.object({
        success: z.boolean(),
        message: z.string(),
        data: z.string(),
        taskCount: z.number(),
      }),
      visibility: "both",
      annotations: {
        readOnlyHint: true,
        // This tool would interact with external systems in a real app
        openWorldHint: true,
      },
      handler: async (input, context) => {
        const allTasks = getAllTasks();

        let data: string;
        if (input.format === "csv") {
          const header = "id,title,description,status,createdAt,updatedAt";
          const rows = allTasks.map(
            (t) =>
              `${t.id},"${t.title}","${t.description ?? ""}",${t.status},${t.createdAt},${t.updatedAt}`
          );
          data = [header, ...rows].join("\n");
        } else {
          data = JSON.stringify(
            input.includeMetadata
              ? allTasks
              : allTasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
            null,
            2
          );
        }

        // Log export action with user info if available
        const userInfo = context.userAgent ?? "Unknown client";

        const message = `Exported ${allTasks.length} tasks as ${String(input.format).toUpperCase()}`;
        return {
          success: true,
          message,
          data,
          taskCount: allTasks.length,
          _text: message,
          _meta: { exportedBy: userInfo },
        };
      },
    }),

    // =========================================================================
    // GET BOARD SUMMARY
    // =========================================================================
    getBoardSummary: defineTool({
      title: "Get Board Summary",
      description: "Get a summary of the Kanban board with task counts per column",
      input: GetBoardSummaryInput,
      output: z.object({
        columns: z.array(
          z.object({
            name: z.string(),
            status: TaskStatusSchema,
            count: z.number(),
            tasks: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
              })
            ),
          })
        ),
        totalTasks: z.number(),
      }),
      ui: "kanban-board",
      visibility: "both",
      widgetAccessible: true,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      handler: async (_input, context) => {
        const columns = [
          { name: "To Do", status: "todo" as TaskStatus },
          { name: "In Progress", status: "in_progress" as TaskStatus },
          { name: "Done", status: "done" as TaskStatus },
        ].map((col) => {
          const columnTasks = getTasksByStatus(col.status);
          return {
            name: col.name,
            status: col.status,
            count: columnTasks.length,
            tasks: columnTasks.map((t) => ({ id: t.id, title: t.title })),
          };
        });

        // Include widget session for state correlation
        const widgetSession = context.widgetSessionId;

        return {
          columns,
          totalTasks: tasks.size,
          _meta: widgetSession ? { widgetSession } : undefined,
        };
      },
    }),
  },

  // ===========================================================================
  // UI RESOURCES
  // ===========================================================================
  ui: {
    "kanban-board": {
      name: "Kanban Board Widget",
      description: "Interactive Kanban board React app",
      // Widget description helps the model understand what the widget does
      widgetDescription:
        "A drag-and-drop Kanban board for task management. Users can create, move, update, and delete tasks across three columns: To Do, In Progress, and Done. Supports file attachments on tasks and provides real-time updates. The board displays task counts per column and allows exporting data.",
      html: "./public/index.html",
      prefersBorder: true,
      csp: {
        connectDomains: [],
      },
    },
  },

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================
  config: {
    cors: {
      origin: true,
      credentials: true,
    },
    // Use MCP protocol for Claude Desktop / MCP Apps
    protocol: "mcp",
    // Enable debug logging and log_debug tool for client-to-server log transport
    debug: {
      logTool: true, // Register log_debug tool for client UIs to send logs
      level: "debug", // Show all logs including debug level
    },
  },
});

export type KanbanClientTools = ClientToolsFromCore<typeof app.tools>;

// =============================================================================
// EXPORT FOR VERCEL
// =============================================================================

// Default export for Vercel serverless deployment
// Vercel detects this and runs the Express app as a serverless function
export default app.expressApp;

// =============================================================================
// REGISTER MIDDLEWARE: Applied in order to all tool calls
// =============================================================================

// Request logging middleware (executes first)
app.use(requestLoggingMiddleware);

// Rate limiting middleware (executes second)
app.use(rateLimitingMiddleware);

// =============================================================================
// EVENT LISTENERS: React to application events for analytics and monitoring
// =============================================================================

/**
 * Events provide observability into the application lifecycle
 * Use them for analytics, monitoring, debugging, and audit logs
 */

// Track application lifecycle
app.on("app:init", ({ config }) => {
  console.log(`[Event] App initialized: ${config.name} v${config.version}`);
});

app.on("app:start", ({ transport }) => {
  console.log(`[Event] App started with transport: ${transport}`);
});

// Track tool execution for analytics
let toolCallCount = 0;
app.on("tool:called", ({ toolName }) => {
  toolCallCount++;
  console.log(`[Event] Tool call #${toolCallCount}: ${toolName}`);
});

app.on("tool:success", ({ toolName, duration }) => {
  console.log(`[Event] Tool ${toolName} succeeded in ${duration}ms`);
});

app.on("tool:error", ({ toolName, error, duration }) => {
  console.error(`[Event] Tool ${toolName} failed after ${duration}ms:`, error.message);
});

// =============================================================================
// START SERVER (skip on Vercel - they handle this via the default export)
// =============================================================================

const port = parseInt(process.env.PORT || "3001");

// Only start the server when not running on Vercel
// Vercel uses the default export (app.expressApp) instead
if (!process.env.VERCEL) {
  app.start({ port }).then(() => {
    console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                         KANBAN BOARD SERVER                           ║
║            Comprehensive SDK Feature Demonstration                    ║
╠═══════════════════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${port}                              ║
║  MCP endpoint: http://localhost:${port}/mcp                              ║
║  Health check: http://localhost:${port}/health                           ║
╠═══════════════════════════════════════════════════════════════════════╣
║  Available Tools:                                                     ║
║  • listTasks       - List all tasks (optional status filter)          ║
║  • createTask      - Create a new task (supports fileParams)          ║
║  • moveTask        - Move task to different column                    ║
║  • updateTask      - Update task title/description                    ║
║  • deleteTask      - Delete a task (destructiveHint)                  ║
║  • clearCompleted  - Clear done tasks (_closeWidget demo)             ║
║  • exportBoard     - Export board data (openWorldHint demo)           ║
║  • getBoardSummary - Get board overview (launches widget)             ║
╠═══════════════════════════════════════════════════════════════════════╣
║  SDK Features Demonstrated:                                           ║
║  • Tool annotations: readOnlyHint, destructiveHint, openWorldHint     ║
║  • ToolContext: locale, timezone, subject, widgetSessionId            ║
║  • fileParams: File upload support (ChatGPT only)                     ║
║  • _closeWidget: Widget dismissal after action                        ║
║  • widgetDescription: Model-readable widget summary                   ║
║  • Plugins: Logging plugin for cross-cutting concerns                 ║
║  • Middleware: Request logging and rate limiting                      ║
║  • Events: Lifecycle and tool execution monitoring                    ║
╚═══════════════════════════════════════════════════════════════════════╝
    `);
  });
}
