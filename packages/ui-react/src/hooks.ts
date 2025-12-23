/**
 * React hooks for @apps-builder/ui-react
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import type { AppsClient, HostContext, ToolDefs, ToolResult, ModalOptions, ModalResult } from "@apps-builder/ui";
import { useAppsContext } from "./context";

// =============================================================================
// CORE HOOKS
// =============================================================================

/**
 * Access the typed client instance
 *
 * @returns Client instance
 * @throws Error if used outside AppsProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const client = useAppsClient<typeof app.tools>();
 *
 *   const handleClick = async () => {
 *     await client.callTool("myTool", { arg: "value" });
 *   };
 *
 *   return <button onClick={handleClick}>Call Tool</button>;
 * }
 * ```
 */
export function useAppsClient<T extends ToolDefs = ToolDefs>(): AppsClient<T> {
  const { client, isConnecting, error } = useAppsContext<T>();

  if (error) {
    throw error;
  }

  if (isConnecting || !client) {
    throw new Error("Client not ready. Make sure AppsProvider has finished connecting.");
  }

  return client;
}

/**
 * Access current tool result with automatic re-renders
 *
 * @returns Current tool result or undefined
 *
 * @example
 * ```tsx
 * function ResultDisplay() {
 *   const result = useToolResult<typeof app.tools>();
 *
 *   if (!result?.myTool) {
 *     return <div>No results yet</div>;
 *   }
 *
 *   return <div>{result.myTool.message}</div>;
 * }
 * ```
 */
export function useToolResult<T extends ToolDefs = ToolDefs>(): ToolResult<T> | undefined {
  const { client } = useAppsContext<T>();
  const [result, setResult] = useState<ToolResult<T> | undefined>(undefined);

  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.onToolResult((newResult) => {
      setResult(newResult as ToolResult<T>);
    });

    return unsubscribe;
  }, [client]);

  return result;
}

/**
 * Access current tool input
 *
 * @returns Current tool input or undefined
 *
 * @example
 * ```tsx
 * function InputDisplay() {
 *   const input = useToolInput();
 *   return <pre>{JSON.stringify(input, null, 2)}</pre>;
 * }
 * ```
 */
export function useToolInput(): Record<string, unknown> | undefined {
  const { client } = useAppsContext();
  const [input, setInput] = useState<Record<string, unknown> | undefined>(client?.toolInput);

  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.onToolInput((newInput) => {
      setInput(newInput);
    });

    return unsubscribe;
  }, [client]);

  return input;
}

/**
 * Access host context with automatic re-renders on changes
 *
 * @returns Current host context
 *
 * @example
 * ```tsx
 * function ThemedComponent() {
 *   const context = useHostContext();
 *
 *   return (
 *     <div className={context.theme}>
 *       Display: {context.displayMode}
 *     </div>
 *   );
 * }
 * ```
 */
export function useHostContext(): HostContext {
  const { client } = useAppsContext();
  const [context, setContext] = useState<HostContext>(
    client?.hostContext ?? {
      theme: "light",
      displayMode: "inline",
      availableDisplayModes: ["inline"],
      viewport: { width: 0, height: 0 },
      locale: "en-US",
      platform: "web",
    }
  );

  useEffect(() => {
    if (!client) return;

    setContext(client.hostContext);

    const unsubscribe = client.onHostContextChange((newContext) => {
      setContext(newContext);
    });

    return unsubscribe;
  }, [client]);

  return context;
}

/**
 * Persisted widget state with automatic sync
 *
 * Works like useState but persists across widget reloads.
 * On ChatGPT: Session-scoped persistence
 * On MCP Apps: Silent no-op (returns default, setState is ignored)
 *
 * @param defaultValue - Initial state value
 * @returns [state, setState] tuple
 *
 * @example
 * ```tsx
 * function Counter() {
 *   const [count, setCount] = useWidgetState(0);
 *
 *   return (
 *     <button onClick={() => setCount(c => c + 1)}>
 *       Count: {count}
 *     </button>
 *   );
 * }
 * ```
 */
export function useWidgetState<S>(defaultValue: S): [S, (newState: S | ((prev: S) => S)) => void] {
  const { client } = useAppsContext();

  const [state, setStateInternal] = useState<S>(() => {
    if (!client) return defaultValue;
    const stored = client.getState<S>();
    return stored ?? defaultValue;
  });

  const setState = useCallback(
    (newState: S | ((prev: S) => S)) => {
      setStateInternal((prev) => {
        const next = typeof newState === "function" ? (newState as (prev: S) => S)(prev) : newState;

        // Persist to client (silent no-op on MCP Apps)
        client?.setState(next);

        return next;
      });
    },
    [client]
  );

  return [state, setState];
}

// =============================================================================
// UTILITY HOOKS
// =============================================================================

/**
 * Apply host CSS variables to document root
 *
 * Call this once in your root component to apply host theming.
 *
 * @example
 * ```tsx
 * function App() {
 *   useHostStyleVariables();
 *   return <MyWidget />;
 * }
 * ```
 */
export function useHostStyleVariables(): void {
  const context = useHostContext();

  useEffect(() => {
    const variables = context.styles?.variables;
    if (!variables) return;

    const root = document.documentElement;
    for (const [key, value] of Object.entries(variables)) {
      root.style.setProperty(key, value);
    }

    // Cleanup
    return () => {
      for (const key of Object.keys(variables)) {
        root.style.removeProperty(key);
      }
    };
  }, [context.styles?.variables]);
}

/**
 * Apply theme class to document body
 *
 * @param lightClass - Class name for light theme (default: "light")
 * @param darkClass - Class name for dark theme (default: "dark")
 *
 * @example
 * ```tsx
 * function App() {
 *   useDocumentTheme("theme-light", "theme-dark");
 *   return <MyWidget />;
 * }
 * ```
 */
export function useDocumentTheme(lightClass = "light", darkClass = "dark"): void {
  const context = useHostContext();

  useEffect(() => {
    const { theme } = context;
    const body = document.body;

    body.classList.remove(lightClass, darkClass);
    body.classList.add(theme === "dark" ? darkClass : lightClass);

    return () => {
      body.classList.remove(lightClass, darkClass);
    };
  }, [context.theme, lightClass, darkClass]);
}

/**
 * Access and manage display mode
 *
 * @returns Display mode state and controls
 *
 * @example
 * ```tsx
 * function DisplayModeToggle() {
 *   const { mode, availableModes, requestMode } = useDisplayMode();
 *
 *   return (
 *     <select value={mode} onChange={e => requestMode(e.target.value)}>
 *       {availableModes.map(m => (
 *         <option key={m} value={m}>{m}</option>
 *       ))}
 *     </select>
 *   );
 * }
 * ```
 */
export function useDisplayMode(): {
  mode: string;
  availableModes: string[];
  requestMode: (mode: "inline" | "fullscreen" | "pip") => Promise<void>;
} {
  const context = useHostContext();
  const { client } = useAppsContext();

  const requestMode = useCallback(
    async (mode: "inline" | "fullscreen" | "pip") => {
      await client?.requestDisplayMode(mode);
    },
    [client]
  );

  return {
    mode: context.displayMode,
    availableModes: context.availableDisplayModes,
    requestMode,
  };
}

/**
 * Access safe area insets for mobile layouts
 *
 * @returns Safe area insets or default zeros
 *
 * @example
 * ```tsx
 * function SafeContent() {
 *   const insets = useSafeAreaInsets();
 *
 *   return (
 *     <div style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
 *       Content
 *     </div>
 *   );
 * }
 * ```
 */
export function useSafeAreaInsets(): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const context = useHostContext();

  return (
    context.safeAreaInsets ?? {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    }
  );
}

// =============================================================================
// EVENT HOOKS
// =============================================================================

/**
 * Subscribe to tool cancellation
 *
 * @param handler - Callback when tool is cancelled
 *
 * @example
 * ```tsx
 * function CancellableOperation() {
 *   const [cancelled, setCancelled] = useState(false);
 *
 *   useOnToolCancelled((reason) => {
 *     setCancelled(true);
 *     console.log("Cancelled:", reason);
 *   });
 *
 *   return cancelled ? <div>Cancelled</div> : <div>Running...</div>;
 * }
 * ```
 */
export function useOnToolCancelled(handler: (reason?: string) => void): void {
  const { client } = useAppsContext();

  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.onToolCancelled(handler);
    return unsubscribe;
  }, [client, handler]);
}

/**
 * Subscribe to teardown events
 *
 * @param handler - Callback when widget is torn down
 *
 * @example
 * ```tsx
 * function CleanupComponent() {
 *   useOnTeardown((reason) => {
 *     console.log("Tearing down:", reason);
 *     // Cleanup resources
 *   });
 *
 *   return <div>Widget</div>;
 * }
 * ```
 */
export function useOnTeardown(handler: (reason?: string) => void): void {
  const { client } = useAppsContext();

  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.onTeardown(handler);
    return unsubscribe;
  }, [client, handler]);
}

// =============================================================================
// FILE OPERATION HOOKS
// =============================================================================

/**
 * File upload result
 */
export interface FileUploadResult {
  /** Uploaded file ID */
  fileId: string;
}

/**
 * File upload state
 */
export interface UseFileUploadState {
  /** Whether file upload is supported on this platform */
  isSupported: boolean;
  /** Whether upload is in progress */
  isUploading: boolean;
  /** Upload error if any */
  error: Error | null;
  /** Last uploaded file ID */
  fileId: string | null;
}

/**
 * Hook for uploading files (ChatGPT only)
 *
 * Provides a function to upload files and tracks upload state.
 * On unsupported platforms, isSupported will be false.
 *
 * Supported file types: PNG, JPEG, WebP images
 *
 * @returns Upload function and state
 *
 * @example
 * ```tsx
 * function ImageUploader() {
 *   const { upload, isSupported, isUploading, error, fileId } = useFileUpload();
 *
 *   if (!isSupported) {
 *     return <div>File upload not supported on this platform</div>;
 *   }
 *
 *   const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const file = e.target.files?.[0];
 *     if (file) {
 *       const result = await upload(file);
 *       console.log("Uploaded:", result?.fileId);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <input type="file" accept="image/*" onChange={handleFileChange} />
 *       {isUploading && <span>Uploading...</span>}
 *       {error && <span>Error: {error.message}</span>}
 *       {fileId && <span>Uploaded: {fileId}</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useFileUpload(): UseFileUploadState & {
  upload: (file: File) => Promise<FileUploadResult | null>;
} {
  const { client } = useAppsContext();
  const [state, setState] = useState<UseFileUploadState>({
    isSupported: false,
    isUploading: false,
    error: null,
    fileId: null,
  });

  // Check if upload is supported
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      isSupported: !!client?.uploadFile,
    }));
  }, [client]);

  const upload = useCallback(
    async (file: File): Promise<FileUploadResult | null> => {
      if (!client?.uploadFile) {
        setState((prev) => ({
          ...prev,
          error: new Error("File upload not supported on this platform"),
        }));
        return null;
      }

      setState((prev) => ({ ...prev, isUploading: true, error: null }));

      try {
        const result = await client.uploadFile(file);
        setState((prev) => ({
          ...prev,
          isUploading: false,
          fileId: result.fileId,
        }));
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({
          ...prev,
          isUploading: false,
          error,
        }));
        return null;
      }
    },
    [client]
  );

  return { ...state, upload };
}

/**
 * Hook for getting file download URLs (ChatGPT only)
 *
 * Provides a function to get temporary download URLs for uploaded files.
 * On unsupported platforms, isSupported will be false.
 *
 * @returns Download URL function and state
 *
 * @example
 * ```tsx
 * function FileDownloader({ fileId }: { fileId: string }) {
 *   const { getDownloadUrl, isSupported, isLoading, error, downloadUrl } = useFileDownload();
 *
 *   useEffect(() => {
 *     if (fileId && isSupported) {
 *       getDownloadUrl(fileId);
 *     }
 *   }, [fileId, isSupported, getDownloadUrl]);
 *
 *   if (!isSupported) return <div>Not supported</div>;
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (downloadUrl) return <img src={downloadUrl} alt="Uploaded file" />;
 *
 *   return null;
 * }
 * ```
 */
export function useFileDownload(): {
  isSupported: boolean;
  isLoading: boolean;
  error: Error | null;
  downloadUrl: string | null;
  getDownloadUrl: (fileId: string) => Promise<string | null>;
} {
  const { client } = useAppsContext();
  const [state, setState] = useState<{
    isSupported: boolean;
    isLoading: boolean;
    error: Error | null;
    downloadUrl: string | null;
  }>({
    isSupported: false,
    isLoading: false,
    error: null,
    downloadUrl: null,
  });

  // Check if download URL is supported
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      isSupported: !!client?.getFileDownloadUrl,
    }));
  }, [client]);

  const getDownloadUrl = useCallback(
    async (fileId: string): Promise<string | null> => {
      if (!client?.getFileDownloadUrl) {
        setState((prev) => ({
          ...prev,
          error: new Error("File download not supported on this platform"),
        }));
        return null;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await client.getFileDownloadUrl(fileId);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          downloadUrl: result.downloadUrl,
        }));
        return result.downloadUrl;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error,
        }));
        return null;
      }
    },
    [client]
  );

  return { ...state, getDownloadUrl };
}

// =============================================================================
// LAYOUT HOOKS
// =============================================================================

/**
 * Hook to notify host of widget's intrinsic height (ChatGPT only)
 *
 * Automatically reports height changes to prevent scroll clipping.
 * Returns a ref to attach to your root element for automatic height tracking,
 * or a manual notify function for custom height reporting.
 *
 * @returns Ref for auto-tracking and manual notify function
 *
 * @example
 * ```tsx
 * // Automatic height tracking
 * function AutoHeightWidget() {
 *   const { containerRef, isSupported } = useIntrinsicHeight();
 *
 *   return (
 *     <div ref={containerRef}>
 *       <p>Content that may change height...</p>
 *     </div>
 *   );
 * }
 *
 * // Manual height notification
 * function ManualHeightWidget() {
 *   const { notify, isSupported } = useIntrinsicHeight();
 *
 *   useEffect(() => {
 *     // Notify after content loads
 *     notify(500);
 *   }, [notify]);
 *
 *   return <div style={{ height: 500 }}>Fixed height content</div>;
 * }
 * ```
 */
export function useIntrinsicHeight(): {
  /** Whether intrinsic height notification is supported */
  isSupported: boolean;
  /** Ref to attach to container for automatic height tracking */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Manually notify host of height */
  notify: (height: number) => void;
} {
  const { client } = useAppsContext();
  const containerRef = useRef<HTMLElement | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  // Check if supported
  useEffect(() => {
    setIsSupported(!!client?.notifyIntrinsicHeight);
  }, [client]);

  // Manual notify function
  const notify = useCallback(
    (height: number) => {
      client?.notifyIntrinsicHeight?.(height);
    },
    [client]
  );

  // Auto-track height with ResizeObserver
  useEffect(() => {
    if (!client?.notifyIntrinsicHeight || !containerRef.current) return;

    const element = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        client.notifyIntrinsicHeight?.(height);
      }
    });

    observer.observe(element);

    // Report initial height
    client.notifyIntrinsicHeight(element.offsetHeight);

    return () => observer.disconnect();
  }, [client]);

  return { isSupported, containerRef, notify };
}

/**
 * Hook to access the current view identifier (ChatGPT only)
 *
 * Useful for multi-view widgets that need to know which view is active.
 *
 * @returns Current view identifier or undefined
 *
 * @example
 * ```tsx
 * function MultiViewWidget() {
 *   const view = useView();
 *
 *   switch (view) {
 *     case "settings":
 *       return <SettingsView />;
 *     case "details":
 *       return <DetailsView />;
 *     default:
 *       return <MainView />;
 *   }
 * }
 * ```
 */
export function useView(): string | undefined {
  const context = useHostContext();
  return context.view;
}

// =============================================================================
// MODAL HOOKS
// =============================================================================

/**
 * Hook for showing host-owned modal dialogs (ChatGPT only)
 *
 * Spawns native ChatGPT modals for confirmations, inputs, etc.
 * On unsupported platforms, isSupported will be false.
 *
 * @returns Modal function and state
 *
 * @example
 * ```tsx
 * function DeleteButton() {
 *   const { showModal, isSupported, isOpen } = useModal();
 *
 *   const handleDelete = async () => {
 *     const result = await showModal({
 *       title: "Confirm Delete",
 *       body: "Are you sure you want to delete this item?",
 *       buttons: [
 *         { label: "Cancel", variant: "secondary", value: "cancel" },
 *         { label: "Delete", variant: "destructive", value: "delete" },
 *       ],
 *     });
 *
 *     if (result?.action === "delete") {
 *       // Perform delete
 *     }
 *   };
 *
 *   if (!isSupported) {
 *     return <button onClick={() => window.confirm("Delete?")}>Delete</button>;
 *   }
 *
 *   return (
 *     <button onClick={handleDelete} disabled={isOpen}>
 *       Delete
 *     </button>
 *   );
 * }
 *
 * // Input modal example
 * function RenameButton() {
 *   const { showModal } = useModal();
 *
 *   const handleRename = async () => {
 *     const result = await showModal({
 *       title: "Rename Item",
 *       input: {
 *         type: "text",
 *         placeholder: "Enter new name",
 *         defaultValue: "Current Name",
 *       },
 *       buttons: [
 *         { label: "Cancel", variant: "secondary", value: "cancel" },
 *         { label: "Rename", variant: "primary", value: "rename" },
 *       ],
 *     });
 *
 *     if (result?.action === "rename" && result.inputValue) {
 *       console.log("New name:", result.inputValue);
 *     }
 *   };
 *
 *   return <button onClick={handleRename}>Rename</button>;
 * }
 * ```
 */
export function useModal(): {
  /** Whether modal API is supported */
  isSupported: boolean;
  /** Whether a modal is currently open */
  isOpen: boolean;
  /** Show a modal dialog */
  showModal: (options: ModalOptions) => Promise<ModalResult | null>;
} {
  const { client } = useAppsContext();
  const [isSupported, setIsSupported] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Check if supported
  useEffect(() => {
    setIsSupported(!!client?.requestModal);
  }, [client]);

  const showModal = useCallback(
    async (options: ModalOptions): Promise<ModalResult | null> => {
      if (!client?.requestModal) {
        return null;
      }

      setIsOpen(true);
      try {
        const result = await client.requestModal(options);
        return result;
      } finally {
        setIsOpen(false);
      }
    },
    [client]
  );

  return { isSupported, isOpen, showModal };
}
