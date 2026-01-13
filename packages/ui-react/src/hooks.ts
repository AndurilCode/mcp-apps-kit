/**
 * React hooks for @mcp-apps-kit/ui-react
 */

import type { RefObject } from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import type {
  AppsClient,
  HostContext,
  ToolDefs,
  ToolResult,
  ClientDebugConfig,
  ModalOptions,
  ModalResult,
  HostCapabilities,
  HostVersion,
  UpdateModelContextParams,
} from "@mcp-apps-kit/ui";
import { clientDebugLogger, type ClientDebugLogger } from "@mcp-apps-kit/ui";
import { useAppsContext } from "./context";

// =============================================================================
// SHARED UTILITIES
// =============================================================================

/** Default host context for initial state */
const DEFAULT_HOST_CONTEXT: HostContext = {
  theme: "light",
  displayMode: "inline",
  availableDisplayModes: ["inline"],
  viewport: { width: 0, height: 0 },
  locale: "en-US",
  platform: "web",
};

/** Default safe area insets */
const DEFAULT_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Helper to create a ResizeObserver that reports size changes
 */
function createSizeObserver(
  element: HTMLElement,
  onResize: (width: number, height: number) => void
): ResizeObserver {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      onResize(Math.round(width), Math.round(height));
    }
  });

  observer.observe(element);

  // Report initial size
  const rect = element.getBoundingClientRect();
  onResize(Math.round(rect.width), Math.round(rect.height));

  return observer;
}

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
    if (!client) {
      return;
    }

    // Get initial tool output if available (wrapped with tool name)
    const initialOutput = client.toolOutput;
    if (initialOutput && Object.keys(initialOutput).length > 0) {
      setResult(initialOutput as ToolResult<T>);
    }

    // Subscribe to future tool result updates
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
  const [context, setContext] = useState<HostContext>(client?.hostContext ?? DEFAULT_HOST_CONTEXT);

  useEffect(() => {
    if (!client) return;

    setContext(client.hostContext);
    return client.onHostContextChange(setContext);
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
// MODEL CONTEXT HOOKS
// =============================================================================

/**
 * Hook to update the host's model context
 *
 * Unlike sendMessage which triggers follow-up actions, context updates
 * inform the model about app state without triggering responses.
 *
 * On MCP Apps: Sends context to host via updateModelContext
 * On ChatGPT: Silent no-op (graceful degradation)
 *
 * @returns Function to update model context
 *
 * @example
 * ```tsx
 * function ShoppingCart({ items }) {
 *   const updateContext = useUpdateModelContext();
 *
 *   // Keep the model informed about cart state
 *   useEffect(() => {
 *     updateContext({
 *       structuredContent: {
 *         itemCount: items.length,
 *         total: calculateTotal(items),
 *         currency: "USD"
 *       }
 *     });
 *   }, [items, updateContext]);
 *
 *   return <CartUI items={items} />;
 * }
 * ```
 */
export function useUpdateModelContext(): (params: UpdateModelContextParams) => Promise<void> {
  const { client } = useAppsContext();

  return useCallback(
    async (params: UpdateModelContextParams) => {
      if (!client) {
        // eslint-disable-next-line no-console
        console.warn("[useUpdateModelContext] Client not available");
        return;
      }
      await client.updateModelContext(params);
    },
    [client]
  );
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
export function useSafeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  const context = useHostContext();
  return context.safeAreaInsets ?? DEFAULT_INSETS;
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
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!client) return;
    return client.onToolCancelled((reason) => handlerRef.current(reason));
  }, [client]);
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
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!client) return;
    return client.onTeardown((reason) => handlerRef.current(reason));
  }, [client]);
}

/**
 * Subscribe to partial/streaming tool input
 *
 * Called when the host sends partial tool arguments during streaming.
 * Useful for showing real-time input as the user types or as the model generates.
 *
 * @param handler - Callback for partial input
 *
 * @example
 * ```tsx
 * function StreamingInput() {
 *   const [partialInput, setPartialInput] = useState<Record<string, unknown>>({});
 *
 *   useOnToolInputPartial((input) => {
 *     setPartialInput(input);
 *   });
 *
 *   return <pre>{JSON.stringify(partialInput, null, 2)}</pre>;
 * }
 * ```
 */
export function useOnToolInputPartial(handler: (input: Record<string, unknown>) => void): void {
  const { client } = useAppsContext();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!client) return;
    return client.onToolInputPartial((input) => handlerRef.current(input));
  }, [client]);
}

// =============================================================================
// HOST INFORMATION HOOKS
// =============================================================================

/**
 * Access host capabilities
 *
 * Returns the capabilities advertised by the host during handshake.
 * Use this to check if features like logging or server tools are supported.
 *
 * @returns Host capabilities or undefined if not yet connected
 *
 * @example
 * ```tsx
 * function CapabilitiesDisplay() {
 *   const capabilities = useHostCapabilities();
 *
 *   return (
 *     <div>
 *       <p>Logging: {capabilities?.logging ? "Supported" : "Not supported"}</p>
 *       <p>Open Links: {capabilities?.openLinks ? "Supported" : "Not supported"}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useHostCapabilities(): HostCapabilities | undefined {
  const { client } = useAppsContext();
  const [capabilities, setCapabilities] = useState<HostCapabilities | undefined>(
    client?.getHostCapabilities()
  );

  useEffect(() => {
    if (!client) {
      setCapabilities(undefined);
      return;
    }

    setCapabilities(client.getHostCapabilities());
    return client.onHostContextChange(() => setCapabilities(client.getHostCapabilities()));
  }, [client]);

  return capabilities;
}

/**
 * Access host version information
 *
 * Returns the name and version of the host application.
 *
 * @returns Host version info or undefined if not yet connected
 *
 * @example
 * ```tsx
 * function HostInfo() {
 *   const hostVersion = useHostVersion();
 *
 *   if (!hostVersion) return <div>Loading...</div>;
 *
 *   return (
 *     <div>
 *       Running on {hostVersion.name} v{hostVersion.version}
 *     </div>
 *   );
 * }
 * ```
 */
export function useHostVersion(): HostVersion | undefined {
  const { client } = useAppsContext();
  const [version, setVersion] = useState<HostVersion | undefined>(() => client?.getHostVersion());

  useEffect(() => {
    if (!client) {
      setVersion(undefined);
      return;
    }

    // Update version when client changes
    setVersion(client.getHostVersion());
  }, [client]);

  return version;
}

// =============================================================================
// SIZE NOTIFICATION HOOKS
// =============================================================================

/**
 * Hook to set up automatic size change notifications
 *
 * Creates a ResizeObserver that automatically sends size changed
 * notifications to the host when the observed element resizes.
 *
 * @returns Ref to attach to the element to observe
 *
 * @example
 * ```tsx
 * function AutoSizeWidget() {
 *   const containerRef = useSizeChangedNotifications();
 *
 *   return (
 *     <div ref={containerRef}>
 *       <p>Content that may change size...</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useSizeChangedNotifications(): RefObject<HTMLElement | null> {
  const { client } = useAppsContext();
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!client || !element || typeof ResizeObserver === "undefined") return;

    const observer = createSizeObserver(element, (width, height) => {
      void client.sendSizeChanged({ width, height });
    });

    return () => observer.disconnect();
  }, [client]);

  return containerRef;
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
  const isSupported = !!client?.uploadFile;
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<FileUploadResult | null> => {
      if (!client?.uploadFile) {
        setError(new Error("File upload not supported on this platform"));
        return null;
      }

      setIsUploading(true);
      setError(null);

      try {
        const result = await client.uploadFile(file);
        setFileId(result.fileId);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [client]
  );

  return { isSupported, isUploading, error, fileId, upload };
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
  const isSupported = !!client?.getFileDownloadUrl;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const getDownloadUrl = useCallback(
    async (fileId: string): Promise<string | null> => {
      if (!client?.getFileDownloadUrl) {
        setError(new Error("File download not supported on this platform"));
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await client.getFileDownloadUrl(fileId);
        setDownloadUrl(result.downloadUrl);
        return result.downloadUrl;
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [client]
  );

  return { isSupported, isLoading, error, downloadUrl, getDownloadUrl };
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
  containerRef: RefObject<HTMLElement | null>;
  /** Manually notify host of height */
  notify: (height: number) => void;
} {
  const { client } = useAppsContext();
  const containerRef = useRef<HTMLElement | null>(null);
  const isSupported = !!client?.notifyIntrinsicHeight;

  const notify = useCallback(
    (height: number) => {
      client?.notifyIntrinsicHeight?.(height);
    },
    [client]
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!client?.notifyIntrinsicHeight || !element || typeof ResizeObserver === "undefined") return;

    const observer = createSizeObserver(element, (_width, height) => {
      client.notifyIntrinsicHeight?.(height);
    });

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
  const isSupported = !!client?.requestModal;
  const [isOpen, setIsOpen] = useState(false);

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

// =============================================================================
// DEBUG LOGGING HOOKS
// =============================================================================

/**
 * Access the debug logger with automatic adapter injection
 *
 * The adapter is automatically configured when AppsProvider connects.
 * Use this hook to access the logger and optionally configure it.
 *
 * @param config - Optional configuration to apply
 * @returns The configured client debug logger
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const logger = useDebugLogger({ enabled: true, level: "debug" });
 *
 *   const handleClick = () => {
 *     logger.info("Button clicked", { timestamp: Date.now() });
 *   };
 *
 *   return <button onClick={handleClick}>Click me</button>;
 * }
 * ```
 */
export function useDebugLogger(config?: Partial<ClientDebugConfig>): ClientDebugLogger {
  // Verify we're inside AppsProvider (adapter is set by createClient)
  useAppsContext();

  // Apply configuration when it changes
  useEffect(() => {
    if (config) {
      clientDebugLogger.configure(config);
    }
  }, [config]);

  return clientDebugLogger;
}
