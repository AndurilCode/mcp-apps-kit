/**
 * Type definitions for @apps-builder/ui
 */

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
  callTool<K extends keyof T>(name: K, args: InferToolInputs<T>[K]): Promise<InferToolOutputs<T>[K]>;

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
