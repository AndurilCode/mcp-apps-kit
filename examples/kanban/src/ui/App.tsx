/**
 * Kanban Board App - Comprehensive SDK Feature Demonstration
 *
 * This component demonstrates all available hooks from @mcp-apps-kit/ui-react:
 *
 * Core Hooks:
 * - useAppsClient: Access the typed client instance for tool calls
 * - useToolResult: Subscribe to tool results
 * - useToolInput: Access initial tool input
 * - useHostContext: Access host context (theme, viewport, etc.)
 * - useWidgetState: Persist state across widget reloads
 *
 * Utility Hooks:
 * - useHostStyleVariables: Apply host CSS variables
 * - useDocumentTheme: Apply theme class to document
 * - useDisplayMode: Access and request display mode changes
 * - useSafeAreaInsets: Get safe area padding for mobile
 *
 * Event Hooks:
 * - useOnToolCancelled: Handle tool cancellation
 * - useOnTeardown: Cleanup on widget teardown
 *
 * File Hooks (ChatGPT only):
 * - useFileUpload: Upload files
 * - useFileDownload: Get file download URLs
 *
 * Layout Hooks (ChatGPT only):
 * - useIntrinsicHeight: Report widget height to host
 * - useView: Access current view identifier
 *
 * Modal Hooks (ChatGPT only):
 * - useModal: Show host-owned modal dialogs
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  useAppsClient,
  useHostContext,
  useDocumentTheme,
  useWidgetState,
  useHostStyleVariables,
  useDisplayMode,
  useSafeAreaInsets,
  useOnToolCancelled,
  useOnTeardown,
  useFileUpload,
  useIntrinsicHeight,
  useView,
  useModal,
  useToolInput,
  type ModalOptions,
} from "@mcp-apps-kit/ui-react";
import { clientDebugLogger } from "@mcp-apps-kit/ui";
import type { KanbanClientTools } from "../index";

// Configure the debug logger to enable MCP transport
clientDebugLogger.configure({
  enabled: true,
  level: "debug",
  source: "kanban-ui",
});

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
  attachmentId?: string;
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

// Persisted preferences using useWidgetState
interface WidgetPreferences {
  collapsedColumns: string[];
  showDebugPanel: boolean;
}

// =============================================================================
// Debug Panel Component
// =============================================================================

function DebugPanel({
  context,
  displayMode,
  safeAreaInsets,
  view,
  toolInput,
  isFileUploadSupported,
  isModalSupported,
  isHeightSupported,
  onClose,
}: {
  context: ReturnType<typeof useHostContext>;
  displayMode: ReturnType<typeof useDisplayMode>;
  safeAreaInsets: ReturnType<typeof useSafeAreaInsets>;
  view: string | undefined;
  toolInput: Record<string, unknown> | undefined;
  isFileUploadSupported: boolean;
  isModalSupported: boolean;
  isHeightSupported: boolean;
  onClose: () => void;
}) {
  return (
    <div className="debug-panel">
      <div className="debug-header">
        <h3>SDK Feature Status</h3>
        <button className="debug-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="debug-content">
        <div className="debug-section">
          <h4>Host Context</h4>
          <ul>
            <li>
              Theme: <code>{context.theme}</code>
            </li>
            <li>
              Platform: <code>{context.platform}</code>
            </li>
            <li>
              Locale: <code>{context.locale}</code>
            </li>
            <li>
              Viewport:{" "}
              <code>
                {context.viewport.width}x{context.viewport.height}
              </code>
            </li>
          </ul>
        </div>
        <div className="debug-section">
          <h4>Display Mode</h4>
          <ul>
            <li>
              Current: <code>{displayMode.mode}</code>
            </li>
            <li>
              Available: <code>{displayMode.availableModes.join(", ")}</code>
            </li>
          </ul>
        </div>
        <div className="debug-section">
          <h4>Safe Area Insets</h4>
          <ul>
            <li>
              Top: <code>{safeAreaInsets.top}px</code>
            </li>
            <li>
              Right: <code>{safeAreaInsets.right}px</code>
            </li>
            <li>
              Bottom: <code>{safeAreaInsets.bottom}px</code>
            </li>
            <li>
              Left: <code>{safeAreaInsets.left}px</code>
            </li>
          </ul>
        </div>
        <div className="debug-section">
          <h4>Platform Features</h4>
          <ul>
            <li>
              File Upload:{" "}
              <span className={isFileUploadSupported ? "supported" : "unsupported"}>
                {isFileUploadSupported ? "✓ Supported" : "✗ Not available"}
              </span>
            </li>
            <li>
              Modal:{" "}
              <span className={isModalSupported ? "supported" : "unsupported"}>
                {isModalSupported ? "✓ Supported" : "✗ Not available"}
              </span>
            </li>
            <li>
              Intrinsic Height:{" "}
              <span className={isHeightSupported ? "supported" : "unsupported"}>
                {isHeightSupported ? "✓ Supported" : "✗ Not available"}
              </span>
            </li>
            <li>
              View: <code>{view ?? "undefined"}</code>
            </li>
          </ul>
        </div>
        {toolInput && (
          <div className="debug-section">
            <h4>Tool Input</h4>
            <pre>{JSON.stringify(toolInput, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Message Component
// =============================================================================

function Message({
  text,
  isError,
  isWarning,
  onDismiss,
}: {
  text: string;
  isError?: boolean;
  isWarning?: boolean;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const className = isError ? "message error" : isWarning ? "message warning" : "message";

  return (
    <div className={className}>
      <div className="message-text">{text}</div>
    </div>
  );
}

// =============================================================================
// Task Card Component
// =============================================================================

function TaskCard({
  task,
  onDelete,
  onDragStart,
}: {
  task: Task;
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
      {task.description && <div className="task-description">{task.description}</div>}
      {task.attachmentId && (
        <div className="task-attachment">
          <span className="attachment-icon">📎</span>
          <span className="attachment-label">Attachment</span>
        </div>
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

// =============================================================================
// Column Component
// =============================================================================

function ColumnComponent({
  column,
  isCollapsed,
  onToggleCollapse,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
}: {
  column: Column;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: Task["status"]) => void;
  isDragOver: boolean;
}) {
  return (
    <div
      className={`column column--${column.status} ${isDragOver ? "drag-over" : ""} ${isCollapsed ? "collapsed" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, column.status)}
    >
      <div className="column-header" onClick={onToggleCollapse}>
        <div className="column-title">
          <div className="column-indicator" />
          {column.name}
          <span className="collapse-icon">{isCollapsed ? "▶" : "▼"}</span>
        </div>
        <div className="column-count">{column.count}</div>
      </div>
      {!isCollapsed && (
        <div className="task-list">
          {column.tasks.length === 0 ? (
            <div className="empty-column">No tasks</div>
          ) : (
            column.tasks.map((task) => (
              <TaskCard key={task.id} task={task} onDelete={onDelete} onDragStart={onDragStart} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Add Task Modal Component
// =============================================================================

function AddTaskModal({
  isOpen,
  onClose,
  onSubmit,
  isFileUploadSupported,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, description?: string, attachmentId?: string) => void;
  isFileUploadSupported: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const { upload, isUploading, fileId, error: uploadError } = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit(title.trim(), description.trim() || undefined, fileId || undefined);
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await upload(file);
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
        {isFileUploadSupported && (
          <div className="form-group">
            <label className="form-label" htmlFor="taskAttachment">
              Attachment (optional)
            </label>
            <input
              type="file"
              id="taskAttachment"
              className="form-input file-input"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleFileChange}
              disabled={isUploading}
            />
            {isUploading && <span className="upload-status">Uploading...</span>}
            {fileId && <span className="upload-status success">✓ File attached</span>}
            {uploadError && (
              <span className="upload-status error">Error: {uploadError.message}</span>
            )}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={isUploading}>
            Add Task
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main App Component
// =============================================================================

export function App() {
  const client = useAppsClient<KanbanClientTools>();
  const context = useHostContext();
  const toolInput = useToolInput();
  const view = useView();

  // Apply theme and host styles
  useDocumentTheme("light", "dark");
  useHostStyleVariables();

  // Get display mode controls
  const displayMode = useDisplayMode();

  // Get safe area insets for mobile
  const safeAreaInsets = useSafeAreaInsets();

  // Get intrinsic height controls
  const {
    containerRef,
    isSupported: isHeightSupported,
    notify: notifyHeight,
  } = useIntrinsicHeight();

  // Notify host of preferred height when in inline mode (dynamic based on content)
  useEffect(() => {
    if (!isHeightSupported || displayMode.mode !== "inline") {
      return;
    }

    // Small delay to ensure DOM is rendered
    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (container) {
        const contentHeight = container.scrollHeight;
        const preferredHeight = Math.min(Math.max(contentHeight, 300), 600);
        notifyHeight(preferredHeight);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isHeightSupported, displayMode.mode, notifyHeight, containerRef]);

  // Get modal controls
  const { showModal, isSupported: isModalSupported } = useModal();

  // Get file upload state
  const { isSupported: isFileUploadSupported } = useFileUpload();

  // Persisted preferences using useWidgetState
  const [preferences, setPreferences] = useWidgetState<WidgetPreferences>({
    collapsedColumns: [],
    showDebugPanel: false,
  });

  // Local state
  const [boardData, setBoardData] = useState<BoardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    isError?: boolean;
    isWarning?: boolean;
  } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);

  // Recalculate height when board data changes
  useEffect(() => {
    if (!isHeightSupported || displayMode.mode !== "inline" || !boardData) {
      return;
    }

    // Small delay to ensure DOM has updated
    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (container) {
        const contentHeight = container.scrollHeight;
        const preferredHeight = Math.min(Math.max(contentHeight, 300), 600);
        notifyHeight(preferredHeight);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isHeightSupported, displayMode.mode, notifyHeight, containerRef, boardData]);

  // Subscribe to tool cancellation
  useOnToolCancelled((reason) => {
    setIsCancelled(true);
    setMessage({ text: `Operation cancelled: ${reason ?? "User requested"}`, isWarning: true });
  });

  // Subscribe to teardown events
  useOnTeardown((reason) => {
    clientDebugLogger.info("Teardown event received", { reason });
    // Cleanup resources if needed
  });

  // Show message helper
  const showMessage = useCallback((text: string, isError = false, isWarning = false) => {
    setMessage({ text, isError, isWarning });
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
    if (isCancelled) return;
    clientDebugLogger.debug("Refreshing board...");
    setIsLoading(true);
    try {
      const result = (await client.callTool("listTasks", {})) as Record<string, unknown>;
      clientDebugLogger.debug("Refresh board result received", {
        taskCount: (result as { tasks?: Task[] }).tasks?.length,
      });

      let data: Record<string, unknown> | null = null;

      if (result && typeof result === "object") {
        if ("tasks" in result) {
          data = result;
        } else if ("structuredContent" in result && typeof result.structuredContent === "object") {
          data = result.structuredContent as Record<string, unknown>;
        } else if ("result" in result && typeof result.result === "string") {
          try {
            data = JSON.parse(result.result) as Record<string, unknown>;
          } catch {
            clientDebugLogger.error("Failed to parse result string", { result: result.result });
          }
        }
      }

      if (data && "tasks" in data) {
        const newBoardData = tasksToBoard(data.tasks as Task[]);
        clientDebugLogger.info("Board data updated", { totalTasks: newBoardData.totalTasks });
        setBoardData(newBoardData);
      }
    } catch (err) {
      clientDebugLogger.error("Failed to refresh board", { error: (err as Error).message });
      showMessage(`Failed to refresh: ${(err as Error).message}`, true);
    } finally {
      setIsLoading(false);
    }
  }, [client, tasksToBoard, showMessage, isCancelled]);

  // Load initial data
  useEffect(() => {
    const output = client.toolOutput as Record<string, unknown> | undefined;
    clientDebugLogger.debug("Initial tool output", { hasOutput: !!output });

    if (output) {
      if ("columns" in output && Array.isArray(output.columns)) {
        setBoardData(output as unknown as BoardData);
      } else if ("tasks" in output && Array.isArray(output.tasks)) {
        setBoardData(tasksToBoard(output.tasks as Task[]));
      } else {
        void refreshBoard();
      }
    } else {
      void refreshBoard();
    }
  }, [client.toolOutput, tasksToBoard, refreshBoard]);

  // Create task
  const handleCreateTask = useCallback(
    async (title: string, description?: string, attachmentId?: string) => {
      clientDebugLogger.info("Creating task", {
        title,
        hasDescription: !!description,
        hasAttachment: !!attachmentId,
      });
      setIsLoading(true);
      try {
        const result = (await client.callTool("createTask", {
          title,
          description,
          attachmentId,
        })) as Record<string, unknown>;
        if (result && typeof result === "object" && "message" in result) {
          showMessage(result.message as string);
        }
        clientDebugLogger.debug("Task created successfully");
        await refreshBoard();
      } catch (err) {
        clientDebugLogger.error("Failed to create task", { error: (err as Error).message });
        showMessage(`Failed to create task: ${(err as Error).message}`, true);
      } finally {
        setIsLoading(false);
      }
    },
    [client, refreshBoard, showMessage]
  );

  // Delete task with modal confirmation (uses useModal)
  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      // Try to use native modal if supported, fall back to confirm()
      if (isModalSupported) {
        const modalOptions: ModalOptions = {
          title: "Delete Task",
          body: "Are you sure you want to delete this task? This action cannot be undone.",
          buttons: [
            { label: "Cancel", variant: "secondary", value: "cancel" },
            { label: "Delete", variant: "destructive", value: "delete" },
          ],
        };

        const result = await showModal(modalOptions);
        if (result?.action !== "delete") return;
      } else {
        if (!confirm("Delete this task?")) return;
      }

      clientDebugLogger.info("Deleting task", { taskId });
      setIsLoading(true);
      try {
        const result = (await client.callTool("deleteTask", { taskId })) as Record<string, unknown>;
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
    [client, refreshBoard, showMessage, isModalSupported, showModal]
  );

  // Move task
  const handleMoveTask = useCallback(
    async (taskId: string, newStatus: Task["status"]) => {
      clientDebugLogger.info("Moving task", { taskId, newStatus });
      setIsLoading(true);
      try {
        const result = (await client.callTool("moveTask", { taskId, newStatus })) as Record<
          string,
          unknown
        >;
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

  // Clear completed tasks
  const handleClearCompleted = useCallback(async () => {
    if (isModalSupported) {
      const result = await showModal({
        title: "Clear Completed Tasks",
        body: "Remove all tasks from the Done column?",
        buttons: [
          { label: "Cancel", variant: "secondary", value: "cancel" },
          { label: "Clear", variant: "primary", value: "clear" },
        ],
      });
      if (result?.action !== "clear") return;
    } else {
      if (!confirm("Clear all completed tasks?")) return;
    }

    setIsLoading(true);
    try {
      const result = (await client.callTool("clearCompleted", { closeWidget: false })) as Record<
        string,
        unknown
      >;
      if (result && typeof result === "object" && "message" in result) {
        showMessage(result.message as string);
      }
      await refreshBoard();
    } catch (err) {
      showMessage(`Failed to clear: ${(err as Error).message}`, true);
    } finally {
      setIsLoading(false);
    }
  }, [client, refreshBoard, showMessage, isModalSupported, showModal]);

  // Export board
  const handleExport = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = (await client.callTool("exportBoard", {
        format: "json",
        includeMetadata: true,
      })) as Record<string, unknown>;
      if (result && typeof result === "object" && "data" in result) {
        // Create download
        const blob = new Blob([result.data as string], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "kanban-export.json";
        a.click();
        URL.revokeObjectURL(url);
        showMessage("Board exported successfully!");
      }
    } catch (err) {
      showMessage(`Failed to export: ${(err as Error).message}`, true);
    } finally {
      setIsLoading(false);
    }
  }, [client, showMessage]);

  // Toggle column collapse (persisted with useWidgetState)
  const toggleColumnCollapse = useCallback(
    (status: string) => {
      setPreferences((prev) => {
        const isCollapsed = prev.collapsedColumns.includes(status);
        return {
          ...prev,
          collapsedColumns: isCollapsed
            ? prev.collapsedColumns.filter((s) => s !== status)
            : [...prev.collapsedColumns, status],
        };
      });
    },
    [setPreferences]
  );

  // Toggle debug panel (persisted with useWidgetState)
  const toggleDebugPanel = useCallback(() => {
    setPreferences((prev) => ({
      ...prev,
      showDebugPanel: !prev.showDebugPanel,
    }));
  }, [setPreferences]);

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
    async (e: React.DragEvent, newStatus: Task["status"]) => {
      e.preventDefault();
      setDragOverColumn(null);

      if (draggedTask && draggedTask.status !== newStatus) {
        await handleMoveTask(draggedTask.id, newStatus);
      }
      setDraggedTask(null);
    },
    [draggedTask, handleMoveTask]
  );

  // Apply safe area insets to container
  const containerStyle: React.CSSProperties = {
    paddingTop: safeAreaInsets.top,
    paddingRight: safeAreaInsets.right,
    paddingBottom: safeAreaInsets.bottom,
    paddingLeft: safeAreaInsets.left,
  };

  // Loading state
  if (!boardData) {
    return (
      <div className="board-container" style={containerStyle}>
        <div className="loading">
          <div className="spinner" />
          <span>Loading board...</span>
        </div>
      </div>
    );
  }

  const doneColumn = boardData.columns.find((c) => c.status === "done");
  const hasDoneTasks = doneColumn && doneColumn.count > 0;

  return (
    <div
      className="board-container"
      style={containerStyle}
      ref={containerRef as React.RefObject<HTMLDivElement>}
    >
      {message && (
        <Message
          text={message.text}
          isError={message.isError}
          isWarning={message.isWarning}
          onDismiss={() => setMessage(null)}
        />
      )}

      {preferences.showDebugPanel && (
        <DebugPanel
          context={context}
          displayMode={displayMode}
          safeAreaInsets={safeAreaInsets}
          view={view}
          toolInput={toolInput}
          isFileUploadSupported={isFileUploadSupported}
          isModalSupported={isModalSupported}
          isHeightSupported={isHeightSupported}
          onClose={() => toggleDebugPanel()}
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
          <div className="header-buttons">
            {displayMode.mode === "inline" && displayMode.availableModes.includes("fullscreen") && (
              <button
                className="btn btn-icon"
                onClick={() => displayMode.requestMode("fullscreen")}
                title="Fullscreen"
              >
                ⛶
              </button>
            )}
            {displayMode.mode === "fullscreen" && (
              <button
                className="btn btn-icon"
                onClick={() => displayMode.requestMode("inline")}
                title="Exit Fullscreen"
              >
                ⛶
              </button>
            )}
            <button className="btn btn-icon" onClick={toggleDebugPanel} title="Toggle Debug Panel">
              🔧
            </button>
            <button
              className="btn btn-icon"
              onClick={handleExport}
              disabled={isLoading}
              title="Export Board"
            >
              📥
            </button>
            {hasDoneTasks && (
              <button
                className="btn btn-secondary"
                onClick={handleClearCompleted}
                disabled={isLoading}
              >
                Clear Done
              </button>
            )}
            <button
              className="add-btn"
              onClick={async () => {
                // Use native modal if supported, otherwise custom modal
                if (isModalSupported) {
                  const result = await showModal({
                    title: "Add New Task",
                    body: "Enter a title for your new task",
                    input: {
                      type: "text",
                      placeholder: "Task title",
                    },
                    buttons: [
                      { label: "Cancel", variant: "secondary", value: "cancel" },
                      { label: "Add", variant: "primary", value: "add" },
                    ],
                  });
                  if (result?.action === "add" && result.inputValue?.trim()) {
                    await handleCreateTask(result.inputValue.trim());
                  }
                } else {
                  setIsModalOpen(true);
                }
              }}
              disabled={isLoading}
            >
              <span>+</span> Add Task
            </button>
          </div>
        </div>
      </div>

      <div className="board">
        {boardData.columns.map((column) => (
          <ColumnComponent
            key={column.status}
            column={column}
            isCollapsed={preferences.collapsedColumns.includes(column.status)}
            onToggleCollapse={() => toggleColumnCollapse(column.status)}
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
        isFileUploadSupported={isFileUploadSupported}
      />
    </div>
  );
}
