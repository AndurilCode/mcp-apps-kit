/**
 * UI Host Manager
 *
 * Central orchestrator for UI widget rendering and testing.
 * Supports both MCP Apps and OpenAI Apps protocols via headless (jsdom)
 * and browser (Playwright) rendering modes.
 */

import type { TestClient } from "@mcp-apps-kit/testing";
import { JSDOM } from "jsdom";
import {
  detectProtocolFromMimeType as _detectProtocolFromMimeType,
  findUIResourceForTool as findUIResourceForToolHelper,
  type DetectedProtocol as _DetectedProtocol,
  type UIResourceInfo as _UIResourceInfo,
} from "./tools/helpers";
import {
  MCPHostEmulator,
  type MCPHostEmulatorOptions,
  type MCPEnvironmentSettings,
} from "./hosts/mcp-host";
import {
  OpenAIHostEmulator,
  type OpenAIHostEmulatorOptions,
  type OpenAIEnvironmentSettings,
} from "./hosts/openai-host";
import { WidgetServer } from "./widget-server";
import type { ElementInfo, EnvironmentState } from "./types";

// Playwright types - use dynamic import since it's optional
type Browser = Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>>;
type Page = Awaited<ReturnType<Browser["newPage"]>>;

/**
 * Re-export protocol detection utilities from helpers for backwards compatibility
 */
export type DetectedProtocol = _DetectedProtocol;
export const detectProtocolFromMimeType = _detectProtocolFromMimeType;

/**
 * Options for UI Host Manager
 */
export interface UIHostManagerOptions {
  /** Default timeout for operations (ms) */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Shared widget server (from ConnectionManager) */
  sharedWidgetServer?: WidgetServer;
}

/**
 * Re-export UIResourceInfo from helpers for backwards compatibility
 */
export type UIResourceInfo = _UIResourceInfo;

/**
 * Result from headless rendering
 */
export interface HeadlessRenderResult {
  dom: JSDOM;
  html: string;
  textContent: string;
  elements: ElementInfo[];
  errors: string[];
  mcpEmulator?: MCPHostEmulator;
  openaiEmulator?: OpenAIHostEmulator;
}

/**
 * Result from browser rendering
 */
export interface BrowserRenderResult {
  page: Page;
  errors: string[];
}

/**
 * UI Host Manager
 *
 * Orchestrates UI widget rendering for testing.
 * Handles protocol detection, host emulation, and rendering in both
 * headless (jsdom) and browser (Playwright) modes.
 */
export class UIHostManager {
  private client: TestClient;
  private browserPool: Browser | null = null;
  private widgetServer?: WidgetServer;
  private sharedWidgetServer?: WidgetServer;
  private options: Required<Omit<UIHostManagerOptions, "sharedWidgetServer">>;

  constructor(client: TestClient, options: UIHostManagerOptions = {}) {
    this.client = client;
    this.sharedWidgetServer = options.sharedWidgetServer;
    this.options = {
      timeout: options.timeout ?? 30000,
      debug: options.debug ?? false,
    };
  }

  /**
   * Find UI resource for a tool by name
   *
   * Delegates to the shared helper which supports 4 URI patterns:
   * - `__ui_{toolName}` (internal convention)
   * - `/{toolName}?` (query string)
   * - `/{toolName}` (path segment)
   * - `toolName={toolName}` (query parameter)
   */
  async findUIResourceForTool(toolName: string): Promise<UIResourceInfo | null> {
    return findUIResourceForToolHelper(this.client.raw, toolName);
  }

  /**
   * Fetch widget HTML from server
   */
  async fetchWidgetHTML(uri: string): Promise<string> {
    const rawClient = this.client.raw;
    const result = await rawClient.readResource({ uri });

    let html = "";
    for (const content of result.contents) {
      if ("text" in content && typeof content.text === "string") {
        html += content.text;
      }
    }

    if (!html) {
      throw new Error(`No HTML content in resource: ${uri}`);
    }

    return html;
  }

  /**
   * Create jsdom instance with required polyfills
   */
  private createJSDOMWithPolyfills(html: string): JSDOM {
    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      resources: "usable",
      pretendToBeVisual: true,
      url: "http://localhost/",
    });

    const win = dom.window;

    // Required polyfills for React and modern web apps
    if (!win.requestAnimationFrame) {
      win.requestAnimationFrame = (cb: FrameRequestCallback) => {
        return win.setTimeout(() => {
          cb(Date.now());
        }, 0);
      };
    }

    if (!win.cancelAnimationFrame) {
      win.cancelAnimationFrame = (id: number) => {
        win.clearTimeout(id);
      };
    }

    // ResizeObserver polyfill
    if (!win.ResizeObserver) {
      (win as unknown as Record<string, unknown>).ResizeObserver = class ResizeObserver {
        observe() {
          /* no-op */
        }
        unobserve() {
          /* no-op */
        }
        disconnect() {
          /* no-op */
        }
      };
    }

    // IntersectionObserver polyfill
    if (!win.IntersectionObserver) {
      (win as unknown as Record<string, unknown>).IntersectionObserver =
        class IntersectionObserver {
          observe() {
            /* no-op */
          }
          unobserve() {
            /* no-op */
          }
          disconnect() {
            /* no-op */
          }
        };
    }

    // matchMedia polyfill
    if (!win.matchMedia) {
      (win as unknown as Record<string, unknown>).matchMedia = () =>
        ({
          matches: false,
          addListener: () => {
            /* no-op */
          },
          removeListener: () => {
            /* no-op */
          },
          addEventListener: () => {
            /* no-op */
          },
          removeEventListener: () => {
            /* no-op */
          },
          dispatchEvent: () => true,
        }) as unknown as MediaQueryList;
    }

    return dom;
  }

  /**
   * Extract key elements from DOM
   */
  private extractElements(document: Document, selector?: string): ElementInfo[] {
    const elements: ElementInfo[] = [];
    const root = selector ? document.querySelector(selector) : document.body;

    if (!root) return elements;

    // Get interesting elements (headings, buttons, links, data displays, etc.)
    const interestingSelectors = [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "button",
      "a",
      "[role='button']",
      "[data-testid]",
      "[class*='data']",
      "[class*='result']",
      "[class*='value']",
      "input",
      "select",
      "textarea",
    ];

    for (const sel of interestingSelectors) {
      const found = root.querySelectorAll(sel);
      for (const el of found) {
        const info = this.elementToInfo(el);
        if (info.textContent ?? info.id ?? el.tagName.toLowerCase() === "input") {
          elements.push(info);
        }
      }
    }

    // Limit to prevent huge outputs
    return elements.slice(0, 50);
  }

  /**
   * Convert Element to ElementInfo
   */
  private elementToInfo(element: Element): ElementInfo {
    const attributes: Record<string, string> = {};
    for (const attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || undefined,
      className: element.className || undefined,
      textContent: element.textContent?.trim().slice(0, 200) || undefined,
      attributes,
      children: element.children.length,
    };
  }

  /**
   * Render widget in headless mode (jsdom)
   */
  async renderHeadless(
    html: string,
    protocol: DetectedProtocol,
    toolResult: unknown,
    toolName: string,
    environmentState?: EnvironmentState,
    waitMs = 100
  ): Promise<HeadlessRenderResult> {
    const errors: string[] = [];
    const dom = this.createJSDOMWithPolyfills(html);
    const win = dom.window;

    // Capture console errors - using type-safe interface
    type ConsoleWithError = { console: { error: (...args: unknown[]) => void } };
    const consoleInterface = win as unknown as ConsoleWithError;
    const originalError = consoleInterface.console.error.bind(consoleInterface.console);
    consoleInterface.console.error = (...args: unknown[]) => {
      errors.push(args.map((a) => String(a)).join(" "));
      originalError(...args);
    };

    // Inject appropriate host emulator
    let mcpEmulator: MCPHostEmulator | undefined;
    let openaiEmulator: OpenAIHostEmulator | undefined;

    if (protocol === "mcp") {
      const mcpEnv: MCPEnvironmentSettings | undefined = environmentState
        ? {
            theme: environmentState.theme,
            locale: environmentState.locale,
            timeZone: environmentState.timeZone,
            displayMode: environmentState.displayMode,
            viewport: environmentState.viewport,
            maxHeight: environmentState.maxHeight,
            platform:
              environmentState.userAgent?.device?.type === "mobile"
                ? "mobile"
                : environmentState.userAgent?.device?.type === "tablet"
                  ? "web"
                  : "desktop",
          }
        : undefined;

      const options: MCPHostEmulatorOptions = {
        toolName,
        toolResult,
        environment: mcpEnv,
        debug: this.options.debug,
      };
      mcpEmulator = new MCPHostEmulator(options);
      mcpEmulator.injectIntoJSDOM({ window: win as unknown as Window });
    } else {
      const openaiEnv: OpenAIEnvironmentSettings | undefined = environmentState
        ? {
            theme: environmentState.theme,
            locale: environmentState.locale,
            displayMode: environmentState.displayMode,
            viewport: environmentState.viewport,
            maxHeight: environmentState.maxHeight,
            safeAreaInsets: environmentState.safeAreaInsets,
            userAgent: environmentState.userAgent,
            userLocation: environmentState.userLocation,
          }
        : undefined;

      const options: OpenAIHostEmulatorOptions = {
        toolName,
        toolResult,
        environment: openaiEnv,
        debug: this.options.debug,
      };
      openaiEmulator = new OpenAIHostEmulator(options);
      openaiEmulator.injectIntoJSDOM({ window: win as unknown as Window });
    }

    // Wait for render to settle
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    // Extract DOM info
    const document = win.document;
    const elements = this.extractElements(document);
    const textContent = document.body?.textContent?.trim() ?? "";
    const serializedHtml = document.documentElement.outerHTML;

    return {
      dom,
      html: serializedHtml,
      textContent,
      elements,
      errors,
      mcpEmulator,
      openaiEmulator,
    };
  }

  /**
   * Get or create browser instance (pooled for performance)
   */
  async getBrowser(): Promise<Browser> {
    if (!this.browserPool) {
      const playwright = await import("playwright");
      this.browserPool = await playwright.chromium.launch({ headless: true });
    }
    return this.browserPool;
  }

  /**
   * Get or create widget server (lazy initialization)
   *
   * Uses shared WidgetServer from ConnectionManager if provided,
   * otherwise creates a local one (for backwards compatibility in tests).
   */
  private async getWidgetServer(): Promise<WidgetServer> {
    // Prefer shared widget server if available
    if (this.sharedWidgetServer) {
      return this.sharedWidgetServer;
    }

    // Fallback: create local widget server (for tests/standalone usage)
    if (!this.widgetServer) {
      this.widgetServer = new WidgetServer({ debug: this.options.debug });
      await this.widgetServer.start();
    }
    return this.widgetServer;
  }

  /**
   * Create a touch callback for a session.
   * This callback can be passed to WidgetSessionManager to keep the WidgetServer session alive.
   */
  createSessionTouchCallback(sessionId: string): () => void {
    // Use shared server if available, otherwise local server
    const server = this.sharedWidgetServer ?? this.widgetServer;
    if (!server) {
      return () => {}; // No-op if server not initialized
    }
    return () => {
      server.touchSession(sessionId);
    };
  }

  /**
   * Render widget in browser mode (Playwright)
   *
   * Uses a WidgetServer to serve the widget in a real iframe,
   * enabling proper postMessage communication where event.source === window.parent.
   *
   * @param externalHostContext - Raw MCP hostContext from external widget for 1:1 sync
   * @param inspectorUrl - Inspector server URL for tool call execution (e.g., "http://localhost:6274")
   */
  async renderInBrowser(
    html: string,
    protocol: DetectedProtocol,
    toolResult: unknown,
    toolName: string,
    toolArgs: Record<string, unknown>,
    environmentState?: EnvironmentState,
    viewport?: { width: number; height: number },
    externalHostContext?: Record<string, unknown>,
    inspectorUrl?: string,
    isDualMode?: boolean
  ): Promise<BrowserRenderResult> {
    const errors: string[] = [];
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    // Use viewport from environment state if provided, otherwise use parameter or default
    const effectiveViewport = viewport ?? environmentState?.viewport ?? { width: 800, height: 600 };

    // Set viewport
    await page.setViewportSize(effectiveViewport);

    // Capture console errors
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    // Get the widget server (lazy initialization)
    const server = await this.getWidgetServer();

    // Create a session for this widget, passing environment state, external hostContext, and inspector URL
    const { hostUrl } = server.createSession(
      html,
      toolResult,
      toolName,
      toolArgs,
      protocol,
      environmentState,
      externalHostContext,
      inspectorUrl,
      isDualMode
    );

    // Navigate to the host page (which embeds the widget in an iframe)
    await page.goto(hostUrl, { waitUntil: "networkidle" });

    // Wait for widget to initialize and receive tool result via postMessage
    // The widget needs time to: load iframe -> execute JS -> init client -> send init -> receive response + tool/result -> re-render
    await page.waitForTimeout(500);

    // NOTE: We no longer delete sessions here. Session cleanup is handled by:
    // 1. WidgetServer's TTL-based cleanup (resets on touch)
    // 2. WidgetSessionManager's touchSession calls (from dashboard API, interactions, etc.)
    // 3. Explicit closeSession calls when sessions are no longer needed
    // This allows dashboard iframes to display widgets for as long as the session is active.

    return {
      page,
      errors,
    };
  }

  /**
   * Take screenshot of a page
   */
  async takeScreenshot(
    page: Page,
    options?: {
      format?: "png" | "jpeg";
      fullPage?: boolean;
    }
  ): Promise<{ data: Buffer; format: "png" | "jpeg" }> {
    const format = options?.format ?? "png";
    const data = await page.screenshot({
      type: format,
      fullPage: options?.fullPage ?? false,
    });
    return { data, format };
  }

  /**
   * Get DOM snapshot from page
   */
  async getDOMSnapshot(page: Page): Promise<{
    html: string;
    textContent: string;
    elements: ElementInfo[];
  }> {
    const html = await page.content();
    // Function runs in browser context via Playwright page.evaluate
    const textContent = await page.evaluate(
      () =>
        // eslint-disable-next-line no-undef
        document.body?.textContent?.trim() ?? ""
    );

    // Extract elements using page.evaluate (runs in browser context)
    /* eslint-disable no-undef */
    const elements = (await page.evaluate(() => {
      const results: Array<{
        tagName: string;
        id: string | undefined;
        className: string | undefined;
        textContent: string | undefined;
        attributes: Record<string, string>;
        children: number;
      }> = [];
      const selectors = [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "button",
        "a",
        "[role='button']",
        "[data-testid]",
        "[class*='data']",
        "[class*='result']",
        "[class*='value']",
        "input",
        "select",
        "textarea",
      ];

      for (const sel of selectors) {
        const found = document.querySelectorAll(sel);
        for (const el of found) {
          const attrs: Record<string, string> = {};
          for (const attr of el.attributes) {
            attrs[attr.name] = attr.value;
          }

          results.push({
            tagName: el.tagName.toLowerCase(),
            id: el.id || undefined,
            className: el.className || undefined,
            textContent: el.textContent?.trim().slice(0, 200) || undefined,
            attributes: attrs,
            children: el.children.length,
          });
        }
      }

      return results.slice(0, 50);
    })) as ElementInfo[];
    /* eslint-enable no-undef */

    return { html, textContent, elements };
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    if (this.browserPool) {
      await this.browserPool.close();
      this.browserPool = null;
    }
    if (this.widgetServer) {
      await this.widgetServer.stop();
      this.widgetServer = undefined;
    }
  }
}
