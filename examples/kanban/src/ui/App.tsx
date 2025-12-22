import React, { useState, useCallback, useEffect } from "react";
import {
  useAppsClient,
  useHostContext,
  useDocumentTheme,
} from "@apps-builder/ui-react";

// =============================================================================
// Types
// =============================================================================

interface Task {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  createdAt?: string;
  updatedAt?: string;
}

interface Column {
  name: string;
  status: "todo" | "in_progress" | "done";
  count: number;
  tasks: Task[];
}

interface BoardData {
  columns: Column[];
  totalTasks: number;
}

// =============================================================================
// Components
// =============================================================================

function Message({ text, isError, onDismiss }: { text: string; isError?: boolean; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`message ${isError ? "error" : ""}`}>
      <div className="message-text">{text}</div>
    </div>
  );
}

function TaskCard({
  task,
  status,
  onDelete,
  onDragStart,
}: {
  task: Task;
  status: string;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, task: Task) => void;
}) {
  return (
    <div
      className="task-card"
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      data-task-id={task.id}
    >
      <div className="task-title">{task.title}</div>
      {task.description && (
        <div className="task-description">{task.description}</div>
      )}
      <div className="task-meta">
        <span className="task-id">{task.id}</span>
        <div className="task-actions">
          <button
            className="task-action-btn delete"
            onClick={() => onDelete(task.id)}
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function Column({
  column,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
}: {
  column: Column;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: string) => void;
  isDragOver: boolean;
}) {
  return (
    <div
      className={`column column--${column.status} ${isDragOver ? "drag-over" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, column.status)}
    >
      <div className="column-header">
        <div className="column-title">
          <div className="column-indicator" />
          {column.name}
        </div>
        <div className="column-count">{column.count}</div>
      </div>
      <div className="task-list">
        {column.tasks.length === 0 ? (
          <div className="empty-column">No tasks</div>
        ) : (
          column.tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              status={column.status}
              onDelete={onDelete}
              onDragStart={onDragStart}
            />
          ))
        )}
      </div>
    </div>
  );
}

function AddTaskModal({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, description?: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit(title.trim(), description.trim() || undefined);
    setTitle("");
    setDescription("");
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <h2 className="modal-title">Add New Task</h2>
        <div className="form-group">
          <label className="form-label" htmlFor="taskTitle">
            Title
          </label>
          <input
            type="text"
            id="taskTitle"
            className="form-input"
            placeholder="Enter task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="taskDescription">
            Description (optional)
          </label>
          <input
            type="text"
            id="taskDescription"
            className="form-input"
            placeholder="Enter description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            Add Task
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main App
// =============================================================================

export function App() {
  const client = useAppsClient();
  const context = useHostContext();

  // Apply theme to document
  useDocumentTheme("light", "dark");

  // State
  const [boardData, setBoardData] = useState<BoardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  // Show message helper
  const showMessage = useCallback((text: string, isError = false) => {
    setMessage({ text, isError });
  }, []);

  // Convert tasks array to board data
  const tasksToBoard = useCallback((tasks: Task[]): BoardData => {
    const columns: Column[] = [
      { name: "To Do", status: "todo", count: 0, tasks: [] },
      { name: "In Progress", status: "in_progress", count: 0, tasks: [] },
      { name: "Done", status: "done", count: 0, tasks: [] },
    ];

    tasks.forEach((task) => {
      const col = columns.find((c) => c.status === task.status);
      if (col) {
        col.tasks.push(task);
        col.count++;
      }
    });

    return { columns, totalTasks: tasks.length };
  }, []);

  // Refresh board by calling listTasks
  const refreshBoard = useCallback(async () => {
    console.log("[Kanban App] refreshBoard called");
    setIsLoading(true);
    try {
      const result = await client.callTool("listTasks", {}) as Record<string, unknown>;
      console.log("[Kanban App] refreshBoard result:", result);

      // Handle different response formats:
      // 1. Direct: { tasks: [...] }
      // 2. SDK wrapped: { structuredContent: { tasks: [...] } }
      // 3. String result: { result: '{"tasks":[...]}' }
      let data: Record<string, unknown> | null = null;

      if (result && typeof result === "object") {
        if ("tasks" in result) {
          // Direct format
          data = result;
        } else if ("structuredContent" in result && typeof result.structuredContent === "object") {
          // SDK wrapped format
          data = result.structuredContent as Record<string, unknown>;
        } else if ("result" in result && typeof result.result === "string") {
          // String result format - parse it
          try {
            data = JSON.parse(result.result) as Record<string, unknown>;
          } catch {
            console.error("[Kanban App] Failed to parse result string");
          }
        }
      }

      if (data && "tasks" in data) {
        const newBoardData = tasksToBoard(data.tasks as Task[]);
        console.log("[Kanban App] Setting board data:", newBoardData);
        setBoardData(newBoardData);
      } else {
        console.log("[Kanban App] Could not extract tasks from result");
      }
    } catch (err) {
      console.error("[Kanban App] refreshBoard error:", err);
      showMessage(`Failed to refresh: ${(err as Error).message}`, true);
    } finally {
      setIsLoading(false);
    }
  }, [client, tasksToBoard, showMessage]);

  // Load initial data from tool output or fetch it
  useEffect(() => {
    const output = client.toolOutput as Record<string, unknown> | undefined;
    console.log("[Kanban App] Tool output:", output);

    if (output) {
      if ("columns" in output && Array.isArray(output.columns)) {
        console.log("[Kanban App] Using columns from tool output");
        setBoardData(output as unknown as BoardData);
      } else if ("tasks" in output && Array.isArray(output.tasks)) {
        console.log("[Kanban App] Using tasks from tool output");
        setBoardData(tasksToBoard(output.tasks as Task[]));
      } else {
        console.log("[Kanban App] Tool output has unknown format, fetching data");
        void refreshBoard();
      }
    } else {
      console.log("[Kanban App] No tool output, fetching data");
      void refreshBoard();
    }
  }, [client.toolOutput, tasksToBoard, refreshBoard]);

  // Create task
  const handleCreateTask = useCallback(
    async (title: string, description?: string) => {
      setIsLoading(true);
      try {
        const args: Record<string, string> = { title };
        if (description) args.description = description;

        const result = await client.callTool("createTask", args) as Record<string, unknown>;
        if (result && typeof result === "object" && "message" in result) {
          showMessage(result.message as string);
        }
        await refreshBoard();
      } catch (err) {
        showMessage(`Failed to create task: ${(err as Error).message}`, true);
      } finally {
        setIsLoading(false);
      }
    },
    [client, refreshBoard, showMessage]
  );

  // Delete task
  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      if (!confirm("Delete this task?")) return;

      setIsLoading(true);
      try {
        const result = await client.callTool("deleteTask", { taskId }) as Record<string, unknown>;
        if (result && typeof result === "object" && "message" in result) {
          showMessage(result.message as string);
        }
        await refreshBoard();
      } catch (err) {
        showMessage(`Failed to delete: ${(err as Error).message}`, true);
      } finally {
        setIsLoading(false);
      }
    },
    [client, refreshBoard, showMessage]
  );

  // Move task
  const handleMoveTask = useCallback(
    async (taskId: string, newStatus: string) => {
      setIsLoading(true);
      try {
        const result = await client.callTool("moveTask", { taskId, newStatus }) as Record<string, unknown>;
        if (result && typeof result === "object" && "message" in result) {
          showMessage(result.message as string);
        }
        await refreshBoard();
      } catch (err) {
        showMessage(`Failed to move: ${(err as Error).message}`, true);
        await refreshBoard();
      } finally {
        setIsLoading(false);
      }
    },
    [client, refreshBoard, showMessage]
  );

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    (e.target as HTMLElement).classList.add("dragging");
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const column = (e.target as HTMLElement).closest(".column");
    if (column) {
      const status = column.classList.contains("column--todo")
        ? "todo"
        : column.classList.contains("column--in_progress")
          ? "in_progress"
          : "done";
      setDragOverColumn(status);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const column = (e.target as HTMLElement).closest(".column");
    if (column && !column.contains(e.relatedTarget as Node)) {
      setDragOverColumn(null);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, newStatus: string) => {
      e.preventDefault();
      setDragOverColumn(null);

      if (draggedTask && draggedTask.status !== newStatus) {
        await handleMoveTask(draggedTask.id, newStatus);
      }
      setDraggedTask(null);
    },
    [draggedTask, handleMoveTask]
  );

  // Loading state
  if (!boardData) {
    return (
      <div className="board-container">
        <div className="loading">
          <div className="spinner" />
          <span>Loading board...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="board-container">
      {message && (
        <Message
          text={message.text}
          isError={message.isError}
          onDismiss={() => setMessage(null)}
        />
      )}

      <div className="board-header">
        <h1 className="board-title">Kanban Board</h1>
        <div className="header-actions">
          <div className="board-stats">
            <div className="stat">
              <span className="stat-count">{boardData.totalTasks}</span>
              <span>total tasks</span>
            </div>
          </div>
          <button
            className="add-btn"
            onClick={() => setIsModalOpen(true)}
            disabled={isLoading}
          >
            <span>+</span> Add Task
          </button>
        </div>
      </div>

      <div className="board">
        {boardData.columns.map((column) => (
          <Column
            key={column.status}
            column={column}
            onDelete={handleDeleteTask}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            isDragOver={dragOverColumn === column.status}
          />
        ))}
      </div>

      <AddTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateTask}
      />
    </div>
  );
}
