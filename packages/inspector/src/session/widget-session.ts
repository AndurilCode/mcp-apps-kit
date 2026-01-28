import type { Page, Frame } from "playwright";

export type WidgetProtocol = "mcp" | "openai";

export interface WidgetSessionEvent {
  type: string;
  timestamp: number;
  data?: unknown;
}

export interface WidgetSession {
  sessionId: string;
  toolName: string;
  protocol: WidgetProtocol;
  page: Page;
  frame: Frame | null;
  createdAt: number;
  lastAccessedAt: number;
  globals?: Record<string, unknown>;
  events?: WidgetSessionEvent[];
}
