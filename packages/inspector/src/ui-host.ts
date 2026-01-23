/**
 * UI Host Manager
 *
 * Central orchestrator for UI widget rendering and testing.
 * Supports both MCP Apps and OpenAI Apps protocols via headless (jsdom)
 * and browser (Playwright) rendering modes.
 */

import type { TestClient } from "@mcp-apps-kit/testing";
import { JSDOM } from "jsdom";
import { MCP_WIDGET_MIME_TYPE, OPENAI_WIDGET_MIME_TYPE } from "@mcp-apps-kit/core";
import { MCPHostEmulator, type MCPHostEmulatorOptions } from "./hosts/mcp-host";
import { OpenAIHostEmulator, type OpenAIHostEmulatorOptions } from "./hosts/openai-host";
import type { ElementInfo } from "./types";

// Playwright types - use dynamic import since it's optional
type Browser = Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>>;
type Page = Awaited<ReturnType<Browser["newPage"]>>;

/**
 * Detected protocol for a UI widget
 */
export type DetectedProtocol = "mcp" | "openai";

/**
 * Detect protocol from MIME type (standalone function for use without UIHostManager instance)
 */
export function detectProtocolFromMimeType(mimeType: string | undefined): DetectedProtocol | null {
  if (!mimeType) return null;
  if (mimeType === MCP_WIDGET_MIME_TYPE) return "mcp";
  if (mimeType === OPENAI_WIDGET_MIME_TYPE) return "openai";
  return null;
}

/**
 * Options for UI Host Manager
 */
export interface UIHostManagerOptions {
  /** Default timeout for operations (ms) */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Information about a UI resource
 */
export interface UIResourceInfo {
  uri: string;
  mimeType: string;
  protocol: DetectedProtocol;
}

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
  mcpEmulator?: MCPHostEmulator;
  openaiEmulator?: OpenAIHostEmulator;
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
  private options: Required<UIHostManagerOptions>;

  constructor(client: TestClient, options: UIHostManagerOptions = {}) {
    this.client = client;
    this.options = {
      timeout: options.timeout ?? 30000,
      debug: options.debug ?? false,
    };
  }

  /**
   * Detect protocol from MIME type
   */
  detectProtocol(mimeType: string): DetectedProtocol | null {
    if (mimeType === MCP_WIDGET_MIME_TYPE) return "mcp";
    if (mimeType === OPENAI_WIDGET_MIME_TYPE) return "openai";
    return null;
  }

  /**
   * Find UI resource for a tool by name
   */
  async findUIResourceForTool(toolName: string): Promise<UIResourceInfo | null> {
    const rawClient = this.client.raw;
    const resourcesResult = await rawClient.listResources();

    // Look for resources that match the tool name
    // Convention: ui://{app-name}/{tool-name} or similar patterns
    for (const resource of resourcesResult.resources) {
      const uri = resource.uri;
      const mimeType = resource.mimeType;

      if (!mimeType) continue;

      const protocol = this.detectProtocol(mimeType);
      if (!protocol) continue;

      // Check if URI matches tool name (various patterns)
      if (
        uri.includes(`/${toolName}`) ||
        uri.endsWith(toolName) ||
        uri.includes(`toolName=${toolName}`)
      ) {
        return { uri, mimeType, protocol };
      }
    }

    return null;
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
      const options: MCPHostEmulatorOptions = {
        toolName,
        toolResult,
        debug: this.options.debug,
      };
      mcpEmulator = new MCPHostEmulator(options);
      mcpEmulator.injectIntoJSDOM({ window: win as unknown as Window });
    } else {
      const options: OpenAIHostEmulatorOptions = {
        toolName,
        toolResult,
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
   * Render widget in browser mode (Playwright)
   */
  async renderInBrowser(
    html: string,
    protocol: DetectedProtocol,
    toolResult: unknown,
    toolName: string,
    viewport?: { width: number; height: number }
  ): Promise<BrowserRenderResult> {
    const errors: string[] = [];
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    // Set viewport
    await page.setViewportSize(viewport ?? { width: 800, height: 600 });

    // Capture console errors
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    // Create appropriate emulator
    let mcpEmulator: MCPHostEmulator | undefined;
    let openaiEmulator: OpenAIHostEmulator | undefined;
    let initScript: string;

    if (protocol === "mcp") {
      const options: MCPHostEmulatorOptions = {
        toolName,
        toolResult,
        debug: this.options.debug,
      };
      mcpEmulator = new MCPHostEmulator(options);
      initScript = mcpEmulator.getPlaywrightInitScript();
    } else {
      const options: OpenAIHostEmulatorOptions = {
        toolName,
        toolResult,
        debug: this.options.debug,
      };
      openaiEmulator = new OpenAIHostEmulator(options);
      initScript = openaiEmulator.getPlaywrightInitScript();
    }

    // Inject init script directly into HTML (addInitScript doesn't work with setContent)
    // Insert at the very beginning of <head> so it runs before any other scripts
    const scriptTag = `<script>${initScript}</script>`;
    let modifiedHtml = html;
    if (html.includes("<head>")) {
      modifiedHtml = html.replace("<head>", `<head>${scriptTag}`);
    } else if (html.includes("<html>")) {
      modifiedHtml = html.replace("<html>", `<html><head>${scriptTag}</head>`);
    } else {
      // Prepend script if no head/html tags
      modifiedHtml = scriptTag + html;
    }

    // Load the HTML content with injected init script
    await page.setContent(modifiedHtml, { waitUntil: "networkidle" });

    // Wait for widget to initialize and receive tool result via postMessage
    // The widget needs time to: execute JS -> init MCP client -> send ui/initialize -> receive response + tool/result -> re-render
    await page.waitForTimeout(500);

    return {
      page,
      errors,
      mcpEmulator,
      openaiEmulator,
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
  }
}
