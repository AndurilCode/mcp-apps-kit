/**
 * Kanban Board Example App
 *
 * A simple Kanban board implementation demonstrating @apps-builder/core features:
 * - Type-safe tool definitions with Zod schemas
 * - UI resource binding for rich visualizations
 * - Protocol-agnostic design (works with MCP and OpenAI)
 */

import { createApp } from "@apps-builder/core";
import { z } from "zod";

// =============================================================================
// DATA TYPES
// =============================================================================

type TaskStatus = "todo" | "in_progress" |
 "done";

interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
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
});

// =============================================================================
// APP DEFINITION
// =============================================================================

const app = createApp({
  name: "kanban-board",
  version: "1.0.0",

  tools: {
    // =========================================================================
    // LIST TASKS
    // =========================================================================
    listTasks: {
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
      ui: "kanban-board",
      handler: async ({ status }) => {
        const filteredTasks = status ? getTasksByStatus(status) : getAllTasks();

        return {
          tasks: filteredTasks,
          counts: {
            todo: getTasksByStatus("todo").length,
            in_progress: getTasksByStatus("in_progress").length,
            done: getTasksByStatus("done").length,
            total: tasks.size,
          },
        };
      },
    },

    // =========================================================================
    // CREATE TASK
    // =========================================================================
    createTask: {
      description: "Create a new task on the Kanban board",
      input: z.object({
        title: z.string().min(1).describe("Task title (required)"),
        description: z.string().optional().describe("Task description"),
        status: TaskStatusSchema.default("todo").describe(
          "Initial status (defaults to 'todo')"
        ),
      }),
      output: z.object({
        task: TaskSchema,
        message: z.string(),
      }),
      ui: "kanban-board",
      invokingMessage: "Creating task...",
      invokedMessage: "Task created!",
      handler: async ({ title, description, status }) => {
        const now = new Date().toISOString();
        const task: Task = {
          id: generateId(),
          title,
          description,
          status: status ?? "todo",
          createdAt: now,
          updatedAt: now,
        };

        tasks.set(task.id, task);

        return {
          task,
          message: `Created task "${title}" in ${status ?? "todo"} column`,
        };
      },
    },

    // =========================================================================
    // MOVE TASK
    // =========================================================================
    moveTask: {
      description: "Move a task to a different column on the Kanban board",
      input: z.object({
        taskId: z.string().describe("ID of the task to move"),
        newStatus: TaskStatusSchema.describe("Target column/status"),
      }),
      output: z.object({
        task: TaskSchema,
        message: z.string(),
      }),
      ui: "kanban-board",
      invokingMessage: "Moving task...",
      invokedMessage: "Task moved!",
      handler: async ({ taskId, newStatus }) => {
        const task = tasks.get(taskId);
        if (!task) {
          throw new Error(`Task with ID "${taskId}" not found`);
        }

        const oldStatus = task.status;
        task.status = newStatus;
        task.updatedAt = new Date().toISOString();

        return {
          task,
          message: `Moved "${task.title}" from ${oldStatus} to ${newStatus}`,
        };
      },
    },

    // =========================================================================
    // UPDATE TASK
    // =========================================================================
    updateTask: {
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
      ui: "kanban-board",
      handler: async ({ taskId, title, description }) => {
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

        return {
          task,
          message: `Updated task "${task.title}"`,
        };
      },
    },

    // =========================================================================
    // DELETE TASK
    // =========================================================================
    deleteTask: {
      description: "Delete a task from the Kanban board",
      input: z.object({
        taskId: z.string().describe("ID of the task to delete"),
      }),
      output: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
      ui: "kanban-board",
      invokingMessage: "Deleting task...",
      invokedMessage: "Task deleted!",
      handler: async ({ taskId }) => {
        const task = tasks.get(taskId);
        if (!task) {
          throw new Error(`Task with ID "${taskId}" not found`);
        }

        tasks.delete(taskId);

        return {
          success: true,
          message: `Deleted task "${task.title}"`,
        };
      },
    },

    // =========================================================================
    // GET BOARD SUMMARY
    // =========================================================================
    getBoardSummary: {
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
      handler: async () => {
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

        return {
          columns,
          totalTasks: tasks.size,
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
      description: "Interactive Kanban board visualization",
      html: "./src/ui/board.html",
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
    // Use OpenAI protocol for ChatGPT compatibility
    protocol: "openai",
  },
});

// =============================================================================
// START SERVER
// =============================================================================

const port = parseInt(process.env.PORT || "3001");

app.start({ port }).then(() => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                     KANBAN BOARD SERVER                       ║
╠═══════════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${port}                      ║
║  MCP endpoint: http://localhost:${port}/mcp                      ║
║  Health check: http://localhost:${port}/health                   ║
╠═══════════════════════════════════════════════════════════════╣
║  Available Tools:                                             ║
║  • listTasks     - List all tasks (optional status filter)    ║
║  • createTask    - Create a new task                          ║
║  • moveTask      - Move task to different column              ║
║  • updateTask    - Update task title/description              ║
║  • deleteTask    - Delete a task                              ║
║  • getBoardSummary - Get board overview                       ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
