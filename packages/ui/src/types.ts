/**
 * Type definitions for @mcp-apps-kit/ui
 */

// =============================================================================
// HOST CAPABILITIES
// =============================================================================

/**
 * Host capabilities advertised during handshake.
 * Protocol-agnostic interface covering features from both MCP Apps and ChatGPT.
 */
export interface HostCapabilities {
  // ===========================================================================
  // Common capabilities (supported by both platforms)
  // ===========================================================================

  /** Host accepts log messages via sendLog() */
  logging?: Record<string, never>;

  /** Host supports opening external URLs via openLink() */
  openLinks?: Record<string, never>;

  /** Host supports theme switching (light/dark/os) */
  theming?: {
    /** Supported themes */
    themes?: ("light" | "dark" | "os")[];
  };

  /** Host supports display mode changes */
  displayModes?: {
    /** Available display modes */
    modes?: ("inline" | "fullscreen" | "pip" | "panel")[];
  };

  /** Host supports state persistence */
  statePersistence?: {
    /** State is persisted across sessions */
    persistent?: boolean;
    /** Maximum state size in bytes */
    maxSize?: number;
  };

  // ===========================================================================
  // MCP Apps specific capabilities (Claude Desktop)
  // ===========================================================================

  /** Host can proxy resource reads to MCP server (MCP Apps only) */
  serverResources?: {
    /** Host supports resources/list_changed notifications */
    listChanged?: boolean;
  };

  /** Host can proxy tool calls to MCP server (MCP Apps only) */
  serverTools?: {
    /** Host supports tools/list_changed notifications */
    listChanged?: boolean;
  };

  /** Host supports size change notifications (MCP Apps only) */
  sizeNotifications?: Record<string, never>;

  /** Host supports partial/streaming tool input (MCP Apps only) */
  partialToolInput?: Record<string, never>;

  /** Host supports bidirectional tools - app can expose tools to host (MCP Apps only) */
  appTools?: {
    /** Host supports tools/list_changed notifications from app */
    listChanged?: boolean;
  };

  // ===========================================================================
  // ChatGPT/OpenAI specific capabilities
  // ===========================================================================

  /** Host supports file uploads (ChatGPT only) */
  fileUpload?: {
    /** Maximum file size in bytes */
    maxSize?: number;
    /** Allowed MIME types */
    allowedTypes?: string[];
  };

  /** Host provides safe area insets (ChatGPT mobile) */
  safeAreaInsets?: Record<string, never>;

  /** Host supports view identification (ChatGPT only) */
  views?: {
    /** Supported view types */
    types?: string[];
  };

  // ===========================================================================
  // Experimental/extension capabilities
  // ===========================================================================

  /** Experimental features (structure TBD) */
  experimental?: Record<string, unknown>;
}

/**
 * Host version information returned after connection.
 */
export interface HostVersion {
  /** Host application name (e.g., "Claude Desktop") */
  name: string;
  /** Host application version */
  version: string;
}

/**
 * App capabilities declared during initialization.
 * Tells the host what this app supports.
 */
export interface AppCapabilities {
  /** Experimental features (structure TBD) */
  experimental?: Record<string, unknown>;

  /** App exposes MCP-style tools that the host can call */
  tools?: {
    /** App supports tools/list_changed notifications */
    listChanged?: boolean;
  };
}

// =============================================================================
// SIZE CHANGED PARAMS
// =============================================================================

/**
 * Parameters for size changed notifications.
 */
export interface SizeChangedParams {
  /** Widget width in pixels */
  width: number;
  /** Widget height in pixels */
  height: number;
}

// =============================================================================
// TOOL HANDLER TYPES (Bidirectional)
// =============================================================================

/**
 * Tool definition for app-exposed tools (bidirectional support).
 * Used when the app exposes tools that the host can call.
 */
export interface AppToolDefinition {
  /** Tool name */
  name: string;
  /** Tool description */
  description?: string;
  /** JSON Schema for input parameters */
  inputSchema?: Record<string, unknown>;
}

/**
 * Handler for tool calls from the host.
 * @param toolName - Name of the tool being called
 * @param args - Tool arguments
 * @returns Tool result
 */
export type CallToolHandler = (toolName: string, args: Record<string, unknown>) => Promise<unknown>;

/**
 * Handler that returns the list of tools exposed by the app.
 * @returns Array of tool definitions
 */
export type ListToolsHandler = () => Promise<AppToolDefinition[]>;

// =============================================================================
// HOST CONTEXT
// =============================================================================

/**
 * Viewport dimensions
 */
export interface Viewport {
  width: number;
  height: number;
  maxWidth?: number;
  maxHeight?: number;
}

/**
 * Safe area insets (mobile devices)
 */
export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Device capabilities
 */
export interface DeviceCapabilities {
  touch?: boolean;
  hover?: boolean;
}

/**
 * Host-provided styling
 */
export interface HostStyles {
  variables?: Record<string, string>;
  css?: {
    fonts?: string;
  };
}

/**
 * Runtime context from the host platform
 */
export interface HostContext {
  /** Current theme */
  theme: "light" | "dark";

  /** Current display mode */
  displayMode: "inline" | "fullscreen" | "pip";

  /** Available display modes */
  availableDisplayModes: string[];

  /** Viewport dimensions */
  viewport: Viewport;

  /** BCP 47 locale code */
  locale: string;

  /** IANA timezone */
  timeZone?: string;

  /** Platform type */
  platform: "web" | "desktop" | "mobile";

  /** User agent string */
  userAgent?: string;

  /** Device capabilities */
  deviceCapabilities?: DeviceCapabilities;

  /** Safe area insets (mobile) */
  safeAreaInsets?: SafeAreaInsets;

  /** Host-provided styling */
  styles?: HostStyles;

  /**
   * View identifier for multi-view widgets (ChatGPT only).
   * Allows widgets to have different views/screens.
   */
  view?: string;
}

// =============================================================================
// TOOL RESULT
// =============================================================================

/**
 * Resource content from readResource
 */
export interface ResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: Uint8Array;
}

/**
 * Generic tool definitions type (for type inference)
 */
export type ToolDefs = Record<string, { input: unknown; output?: unknown }>;

/**
 * Extract output types from tool definitions
 */
export type InferToolOutputs<T extends ToolDefs> = {
  [K in keyof T]: T[K]["output"] extends unknown ? T[K]["output"] : unknown;
};

/**
 * Extract input types from tool definitions
 */
export type InferToolInputs<T extends ToolDefs> = {
  [K in keyof T]: T[K]["input"];
};

/**
 * Tool result with optional metadata
 */
export type ToolResult<T extends ToolDefs> = {
  [K in keyof T]?: InferToolOutputs<T>[K] & {
    _meta?: Record<string, unknown>;
  };
};

// =============================================================================
// APPS CLIENT INTERFACE
// =============================================================================

/**
 * Unified client interface for UI code
 */
export interface AppsClient<T extends ToolDefs = ToolDefs> {
  // === Tool Operations ===

  /**
   * Call a server tool with typed arguments
   *
   * @param name - Tool name (must be a key in T)
   * @param args - Tool arguments (typed from input schema)
   * @returns Tool result (typed from output schema)
   */
  callTool<K extends keyof T>(
    name: K,
    args: InferToolInputs<T>[K]
  ): Promise<InferToolOutputs<T>[K]>;

  // === Messaging ===

  /**
   * Send a message to the conversation
   *
   * @param content - Message content
   */
  sendMessage(content: { type: "text"; text: string }): Promise<void>;

  /**
   * Send a follow-up message (convenience alias)
   *
   * @param prompt - Message text
   */
  sendFollowUpMessage(prompt: string): Promise<void>;

  // === Navigation ===

  /**
   * Open an external link
   *
   * @param url - URL to open
   */
  openLink(url: string): Promise<void>;

  /**
   * Request a different display mode
   *
   * @param mode - Target display mode
   * @returns Actual mode applied
   */
  requestDisplayMode(mode: "inline" | "fullscreen" | "pip"): Promise<{ mode: string }>;

  /**
   * Request widget close (ChatGPT only, no-op on MCP Apps)
   */
  requestClose(): void;

  // === State ===

  /**
   * Get persisted widget state
   * On ChatGPT: Returns session-scoped state
   * On MCP Apps: Returns null (silent no-op)
   *
   * @returns State or null if not set
   */
  getState<S>(): S | null;

  /**
   * Set persisted widget state
   * On ChatGPT: Persists session-scoped state
   * On MCP Apps: Silent no-op (graceful degradation)
   *
   * @param state - State to persist
   */
  setState<S>(state: S): void;

  // === Files (Platform-Dependent) ===

  /**
   * Upload a file (ChatGPT only)
   *
   * @param file - File to upload
   * @returns File ID for later retrieval
   * @throws Error on unsupported platforms
   */
  uploadFile?(file: File): Promise<{ fileId: string }>;

  /**
   * Get file download URL (ChatGPT only)
   *
   * @param fileId - File ID from uploadFile
   * @returns Download URL
   * @throws Error on unsupported platforms
   */
  getFileDownloadUrl?(fileId: string): Promise<{ downloadUrl: string }>;

  // === Layout (Platform-Dependent) ===

  /**
   * Notify host of widget's intrinsic height (ChatGPT only)
   *
   * Call this when your widget's content height changes to prevent
   * scroll clipping. The host will adjust the container accordingly.
   *
   * @param height - Widget height in pixels
   */
  notifyIntrinsicHeight?(height: number): void;

  /**
   * Request a host-owned modal dialog (ChatGPT only)
   *
   * Spawns a native ChatGPT modal for confirmations, inputs, etc.
   * Returns the user's response when the modal is dismissed.
   *
   * @param options - Modal configuration
   * @returns User's modal response
   * @throws Error on unsupported platforms
   */
  requestModal?(options: ModalOptions): Promise<ModalResult>;

  // === Resources ===

  /**
   * Read an MCP resource
   *
   * @param uri - Resource URI
   * @returns Resource contents
   */
  readResource(uri: string): Promise<{ contents: ResourceContent[] }>;

  // === Logging ===

  /**
   * Log to host console
   *
   * @param level - Log level
   * @param data - Data to log
   */
  log(level: "debug" | "info" | "warning" | "error", data: unknown): void;

  // === Events ===

  /**
   * Subscribe to tool results
   *
   * @param handler - Callback for tool results
   * @returns Unsubscribe function
   */
  onToolResult(handler: (result: ToolResult<T>) => void): () => void;

  /**
   * Subscribe to tool input changes
   *
   * @param handler - Callback for tool input
   * @returns Unsubscribe function
   */
  onToolInput(handler: (input: Record<string, unknown>) => void): () => void;

  /**
   * Subscribe to tool cancellation
   *
   * @param handler - Callback for cancellation
   * @returns Unsubscribe function
   */
  onToolCancelled(handler: (reason?: string) => void): () => void;

  /**
   * Subscribe to host context changes
   *
   * @param handler - Callback for context changes
   * @returns Unsubscribe function
   */
  onHostContextChange(handler: (context: HostContext) => void): () => void;

  /**
   * Subscribe to teardown events
   *
   * @param handler - Callback for teardown
   * @returns Unsubscribe function
   */
  onTeardown(handler: (reason?: string) => void): () => void;

  /**
   * Subscribe to partial/streaming tool input
   *
   * Called when the host sends partial tool arguments during streaming.
   * Useful for showing real-time input as the user types or as the model generates.
   *
   * @param handler - Callback for partial input
   * @returns Unsubscribe function
   */
  onToolInputPartial(handler: (input: Record<string, unknown>) => void): () => void;

  // === Host Information ===

  /**
   * Get host capabilities
   *
   * Returns the capabilities advertised by the host during handshake.
   * Use this to check if features like logging or server tools are supported.
   *
   * @returns Host capabilities or undefined if not yet connected
   */
  getHostCapabilities(): HostCapabilities | undefined;

  /**
   * Get host version information
   *
   * Returns the name and version of the host application.
   *
   * @returns Host version info or undefined if not yet connected
   */
  getHostVersion(): HostVersion | undefined;

  // === Protocol-Level Logging ===

  /**
   * Send a log message to the host
   *
   * Unlike the `log()` method which logs to the local console,
   * this sends logs through the MCP protocol to the host for
   * debugging and telemetry purposes.
   *
   * @param level - Log level
   * @param data - Data to log
   */
  sendLog(
    level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency",
    data: unknown
  ): Promise<void>;

  // === Size Notifications ===

  /**
   * Send size changed notification to host
   *
   * Notifies the host when the widget's size changes.
   * Use this for manual size reporting.
   *
   * @param params - Size parameters
   */
  sendSizeChanged(params: SizeChangedParams): Promise<void>;

  /**
   * Set up automatic size change notifications
   *
   * Creates a ResizeObserver that automatically sends size changed
   * notifications to the host when the document body resizes.
   *
   * @returns Cleanup function to stop observing
   */
  setupSizeChangedNotifications(): () => void;

  // === Bidirectional Tool Support ===

  /**
   * Set handler for tool calls from the host
   *
   * When the host calls a tool exposed by this app, this handler
   * will be invoked with the tool name and arguments.
   *
   * @param handler - Handler function for tool calls
   */
  setCallToolHandler(handler: CallToolHandler): void;

  /**
   * Set handler for listing app-exposed tools
   *
   * When the host requests the list of tools this app exposes,
   * this handler will be invoked.
   *
   * @param handler - Handler function that returns tool definitions
   */
  setListToolsHandler(handler: ListToolsHandler): void;

  // === Current State (Read-Only) ===

  /** Current host context */
  readonly hostContext: HostContext;

  /** Current tool input (if any) */
  readonly toolInput?: Record<string, unknown>;

  /** Current tool output (if any) */
  readonly toolOutput?: Record<string, unknown>;

  /** Current tool metadata (if any) */
  readonly toolMeta?: Record<string, unknown>;
}

// =============================================================================
// MODAL TYPES
// =============================================================================

/**
 * Modal button configuration
 */
export interface ModalButton {
  /** Button label text */
  label: string;
  /** Button style variant */
  variant?: "primary" | "secondary" | "destructive";
  /** Value returned when this button is clicked */
  value?: string;
}

/**
 * Modal input field configuration
 */
export interface ModalInput {
  /** Input field type */
  type: "text" | "textarea";
  /** Placeholder text */
  placeholder?: string;
  /** Default value */
  defaultValue?: string;
  /** Maximum length */
  maxLength?: number;
}

/**
 * Options for requestModal
 */
export interface ModalOptions {
  /** Modal title */
  title: string;
  /** Modal body text or description */
  body?: string;
  /** Input field configuration (for input modals) */
  input?: ModalInput;
  /** Button configurations */
  buttons?: ModalButton[];
}

/**
 * Result from modal interaction
 */
export interface ModalResult {
  /** Which button was clicked (by value or index) */
  action: string;
  /** Input value if modal had an input field */
  inputValue?: string;
}

// =============================================================================
// CLIENT OPTIONS
// =============================================================================

/**
 * Options for createClient
 */
export interface CreateClientOptions {
  /**
   * Force a specific protocol adapter
   * Useful for testing or development
   */
  forceAdapter?: "mcp" | "openai" | "mock";
}

/**
 * Detected protocol type
 */
export type DetectedProtocol = "mcp" | "openai" | "mock";
