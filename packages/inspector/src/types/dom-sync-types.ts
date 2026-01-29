/**
 * DOM Sync Types
 *
 * Types for DOM interaction synchronization between external widgets and Playwright mirrors.
 * These enable 1:1 state sync by capturing and replaying user interactions.
 */

// =============================================================================
// DOM EVENT PAYLOAD TYPES
// =============================================================================

/**
 * Payload for click/dblclick events
 */
export interface DomClickPayload {
  /** CSS selector path to the clicked element */
  selector: string;
  /** X position relative to element (optional) */
  x?: number;
  /** Y position relative to element (optional) */
  y?: number;
  /** Mouse button used */
  button?: "left" | "right" | "middle";
}

/**
 * Payload for input/change events
 */
export interface DomInputPayload {
  /** CSS selector path to the input element */
  selector: string;
  /** Current input value */
  value: string;
  /** Input type (text, checkbox, radio, etc.) */
  inputType?: string;
  /** Checked state for checkboxes/radios */
  checked?: boolean;
}

/**
 * Payload for scroll events
 */
export interface DomScrollPayload {
  /** CSS selector for scrolled element (null = window) */
  selector?: string | null;
  /** Vertical scroll position */
  scrollTop: number;
  /** Horizontal scroll position */
  scrollLeft: number;
}

/**
 * Payload for focus/blur events
 */
export interface DomFocusPayload {
  /** CSS selector path to the focused element */
  selector: string;
}

/**
 * Keyboard modifier keys state
 */
export interface DomKeyModifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

/**
 * Payload for keyboard events
 */
export interface DomKeyPayload {
  /** CSS selector path to the focused element */
  selector: string;
  /** Key value (e.g., "Enter", "a", "Escape") */
  key: string;
  /** Physical key code */
  code: string;
  /** Modifier keys state */
  modifiers?: DomKeyModifiers;
}

/**
 * Payload for select (dropdown) events
 */
export interface DomSelectPayload {
  /** CSS selector path to the select element */
  selector: string;
  /** Selected value */
  value: string;
  /** All selected values (for multi-select) */
  values?: string[];
}

/**
 * Payload for drag events
 */
export interface DomDragPayload {
  /** CSS selector path to the source element being dragged */
  sourceSelector: string;
  /** CSS selector path to the target element to drop on */
  targetSelector: string;
  /** Source position (optional, for precise positioning) */
  sourcePosition?: { x: number; y: number };
  /** Target position (optional, for precise positioning) */
  targetPosition?: { x: number; y: number };
}

/**
 * Payload for hover events
 */
export interface DomHoverPayload {
  /** CSS selector path to the hovered element */
  selector: string;
  /** X position relative to element (optional) */
  x?: number;
  /** Y position relative to element (optional) */
  y?: number;
  /** Modifier keys state (optional) */
  modifiers?: DomKeyModifiers;
}

// =============================================================================
// DOM SYNC EVENT TYPE
// =============================================================================

/**
 * All DOM interaction event types
 */
export type DomSyncEventType =
  | "dom-click"
  | "dom-dblclick"
  | "dom-input"
  | "dom-change"
  | "dom-focus"
  | "dom-blur"
  | "dom-scroll"
  | "dom-keydown"
  | "dom-keyup"
  | "dom-select"
  | "dom-hover"
  | "dom-drag";

/**
 * Set of valid DOM sync event type literals
 */
const DOM_SYNC_EVENT_TYPES: ReadonlySet<string> = new Set<DomSyncEventType>([
  "dom-click",
  "dom-dblclick",
  "dom-input",
  "dom-change",
  "dom-focus",
  "dom-blur",
  "dom-scroll",
  "dom-keydown",
  "dom-keyup",
  "dom-select",
  "dom-hover",
  "dom-drag",
]);

/**
 * Type guard to check if an event type is a DOM sync event
 * Only accepts the exact DomSyncEventType literals
 */
export function isDomSyncEventType(type: string): type is DomSyncEventType {
  return DOM_SYNC_EVENT_TYPES.has(type);
}

/**
 * Union of all DOM event payloads
 */
export type DomEventPayload =
  | DomClickPayload
  | DomInputPayload
  | DomScrollPayload
  | DomFocusPayload
  | DomKeyPayload
  | DomSelectPayload
  | DomDragPayload
  | DomHoverPayload;
