/**
 * Kanban Board Example App
 *
 * A simple Kanban board implementation demonstrating @mcp-apps-kit/core features:
 * - Type-safe tool definitions with Zod schemas
 * - UI resource binding for rich visualizations
 * - Protocol-agnostic design (works with MCP and OpenAI)
 */

import { createApp, type ClientToolsFromCore } from "@mcp-apps-kit/core";
import { z } from "zod";

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

// =============================================================================
// APP DEFINITION
// =============================================================================

const app = createApp({
  name: "kanban-board",
  version: "1.0.0",

  tools: {
    // =========================================================================
    // LIST TASKS (Widget-only tool)
    // =========================================================================
    listTasks: {
      title: "List Tasks",
      description:
        "List all tasks on the Kanban board, optionally filtered by status",
      input: z.object({
        status: TaskStatusSchema.optional().describe(
          "Filter tasks by status: 'todo', 'in_progress', or 'done'"
        ),
      }),
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
      handler: async ({ status }, context) => {
        const filteredTasks = status ? getTasksByStatus(status) : getAllTasks();

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
    },

    // =========================================================================
    // CREATE TASK (Widget-only tool with file attachment support)
    // =========================================================================
    createTask: {
      title: "Create Task",
      description: "Create a new task on the Kanban board with optional file attachment",
      input: z.object({
        title: z.string().min(1).describe("Task title (required)"),
        description: z.string().optional().describe("Task description"),
        status: TaskStatusSchema.default("todo").describe(
          "Initial status (defaults to 'todo')"
        ),
        attachmentId: z.string().optional().describe("Optional file attachment ID"),
      }),
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
      handler: async ({ title, description, status, attachmentId }, context) => {
        // Format timestamp using user's timezone if available
        const timezone = context.userLocation?.timezone ?? "UTC";
        const now = new Date().toISOString();
        const task: Task = {
          id: generateId(),
          title,
          description,
          status,
          createdAt: now,
          updatedAt: now,
          attachmentId,
        };

        tasks.set(task.id, task);

        const message = `Created task "${title}" in ${status} column${attachmentId ? " with attachment" : ""}`;
        return {
          task,
          message,
          _text: message,
          _meta: { timezone },
        };
      },
    },

    // =========================================================================
    // MOVE TASK (Widget-only tool)
    // =========================================================================
    moveTask: {
      title: "Move Task",
      description: "Move a task to a different column on the Kanban board",
      input: z.object({
        taskId: z.string().describe("ID of the task to move"),
        newStatus: TaskStatusSchema.describe("Target column/status"),
      }),
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
      handler: async ({ taskId, newStatus }, context) => {
        const task = tasks.get(taskId);
        if (!task) {
          throw new Error(`Task with ID "${taskId}" not found`);
        }

        const oldStatus = task.status;
        task.status = newStatus;
        task.updatedAt = new Date().toISOString();

        // Track who performed the action (anonymized)
        const performer = context.subject ?? "anonymous";

        const message = `Moved "${task.title}" from ${oldStatus} to ${newStatus}`;
        return {
          task,
          message,
          _text: message,
          _meta: { performer },
        };
      },
    },

    // =========================================================================
    // UPDATE TASK (Widget-only tool)
    // =========================================================================
    updateTask: {
      title: "Update Task",
      description: "Update a task's title or description",
      input: z.object({
        taskId: z.string().describe("ID of the task to update"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
      }),
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
      handler: async ({ taskId, title, description }, _context) => {
        const task = tasks.get(taskId);
        if (!task) {
          throw new Error(`Task with ID "${taskId}" not found`);
        }

        if (title !== undefined) {
          task.title = title;
        }
        if (description !== undefined) {
          task.description = description;
        }
        task.updatedAt = new Date().toISOString();

        const message = `Updated task "${task.title}"`;
        return {
          task,
          message,
          _text: message,
        };
      },
    },

    // =========================================================================
    // DELETE TASK (Widget-only tool)
    // =========================================================================
    deleteTask: {
      title: "Delete Task",
      description: "Delete a task from the Kanban board",
      input: z.object({
        taskId: z.string().describe("ID of the task to delete"),
      }),
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
      handler: async ({ taskId }, _context) => {
        const task = tasks.get(taskId);
        if (!task) {
          throw new Error(`Task with ID "${taskId}" not found`);
        }

        tasks.delete(taskId);

        const message = `Deleted task "${task.title}"`;
        return {
          success: true,
          message,
          _text: message,
        };
      },
    },

    // =========================================================================
    // CLEAR COMPLETED (Demonstrates _closeWidget for widget dismissal)
    // =========================================================================
    clearCompleted: {
      title: "Clear Completed Tasks",
      description: "Remove all completed tasks from the board and close the widget",
      input: z.object({
        closeWidget: z.boolean().default(false).describe(
          "Whether to close the widget after clearing (ChatGPT only)"
        ),
      }),
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
      handler: async ({ closeWidget }, _context) => {
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
          _closeWidget: closeWidget,
        };
      },
    },

    // =========================================================================
    // EXPORT BOARD (Demonstrates openWorldHint for external operations)
    // =========================================================================
    exportBoard: {
      title: "Export Board",
      description: "Export the Kanban board data as JSON (simulates external API call)",
      input: z.object({
        format: z.enum(["json", "csv"]).default("json").describe("Export format"),
        includeMetadata: z.boolean().default(true).describe("Include task metadata"),
      }),
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
      handler: async ({ format, includeMetadata }, context) => {
        const allTasks = getAllTasks();

        let data: string;
        if (format === "csv") {
          const header = "id,title,description,status,createdAt,updatedAt";
          const rows = allTasks.map((t) =>
            `${t.id},"${t.title}","${t.description ?? ""}",${t.status},${t.createdAt},${t.updatedAt}`
          );
          data = [header, ...rows].join("\n");
        } else {
          data = JSON.stringify(
            includeMetadata
              ? allTasks
              : allTasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
            null,
            2
          );
        }

        // Log export action with user info if available
        const userInfo = context.userAgent ?? "Unknown client";

        const message = `Exported ${allTasks.length} tasks as ${format.toUpperCase()}`;
        return {
          success: true,
          message,
          data,
          taskCount: allTasks.length,
          _text: message,
          _meta: { exportedBy: userInfo },
        };
      },
    },

    // =========================================================================
    // GET BOARD SUMMARY
    // =========================================================================
    getBoardSummary: {
      title: "Get Board Summary",
      description:
        "Get a summary of the Kanban board with task counts per column",
      input: z.object({}),
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
    },
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
      html: "./src/ui/dist/index.html",
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
    protocol: "openai",
  },
});

export type KanbanClientTools = ClientToolsFromCore<typeof app.tools>;

// =============================================================================
// START SERVER
// =============================================================================

const port = parseInt(process.env.PORT || "3001");

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
╚═══════════════════════════════════════════════════════════════════════╝
  `);
});
