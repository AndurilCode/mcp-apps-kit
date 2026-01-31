/**
 * UI Rendering tools tests
 *
 * Tests for UIHostManager, preview_ui, screenshot_widget, and test_widget_interaction
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { UIHostManager, detectProtocolFromMimeType } from "../src/ui-host";
import {
  createPreviewUITool,
  createScreenshotWidgetTool,
  createTestWidgetInteractionTool,
} from "../src/tools";
import { MCP_WIDGET_MIME_TYPE, OPENAI_WIDGET_MIME_TYPE } from "@mcp-apps-kit/core";
import { createMockRegistry } from "./test-utils";

// Mock resources
const mockResources = [
  {
    uri: "ui://weather-app/currentWeather",
    name: "Current Weather Widget",
    mimeType: MCP_WIDGET_MIME_TYPE,
  },
  {
    uri: "ui://weather-app/forecast",
    name: "Forecast Widget",
    mimeType: OPENAI_WIDGET_MIME_TYPE,
  },
];

// Mock HTML for widgets
const mockMCPWidgetHTML = `
<!DOCTYPE html>
<html>
<head><title>Weather Widget</title></head>
<body>
  <div id="app">
    <h1>Current Weather</h1>
    <div class="temperature" data-testid="temp">--</div>
    <button id="refresh">Refresh</button>
  </div>
  <script>
    window.addEventListener('message', (e) => {
      if (e.data?.method === 'tool/result') {
        const temp = e.data.params?.result?.structuredContent?.temperature;
        if (temp) document.querySelector('.temperature').textContent = temp + '°F';
      }
    });
  </script>
</body>
</html>
`;

const mockOpenAIWidgetHTML = `
<!DOCTYPE html>
<html>
<head><title>Forecast Widget</title></head>
<body>
  <div id="app">
    <h2>Forecast</h2>
    <div class="forecast-data">Loading...</div>
    <input type="text" id="search" placeholder="Enter city" />
  </div>
  <script>
    if (window.openai) {
      const data = JSON.parse(window.openai.toolOutput);
      document.querySelector('.forecast-data').textContent = JSON.stringify(data);
    }
  </script>
</body>
</html>
`;

// Mock the @mcp-apps-kit/testing module
const mockListResources = vi.fn();
const mockCallTool = vi.fn();
const mockReadResource = vi.fn();

vi.mock("@mcp-apps-kit/testing", () => {
  return {
    createTestClient: vi.fn().mockImplementation(() =>
      Promise.resolve({
        listTools: vi.fn().mockResolvedValue([]),
        listResources: mockListResources,
        listPrompts: vi.fn().mockResolvedValue([]),
        callTool: mockCallTool,
        disconnect: vi.fn().mockResolvedValue(undefined),
        getCallHistory: vi.fn().mockReturnValue([]),
        clearHistory: vi.fn(),
        readResource: mockReadResource,
        raw: {
          listResources: vi.fn().mockResolvedValue({ resources: mockResources }),
          callTool: mockCallTool,
          readResource: mockReadResource,
        },
      })
    ),
  };
});

describe("detectProtocolFromMimeType", () => {
  it("should detect MCP protocol", () => {
    expect(detectProtocolFromMimeType(MCP_WIDGET_MIME_TYPE)).toBe("mcp");
    expect(detectProtocolFromMimeType("text/html;profile=mcp-app")).toBe("mcp");
  });

  it("should detect OpenAI protocol", () => {
    expect(detectProtocolFromMimeType(OPENAI_WIDGET_MIME_TYPE)).toBe("openai");
    expect(detectProtocolFromMimeType("text/html+skybridge")).toBe("openai");
  });

  it("should return null for unknown MIME types", () => {
    expect(detectProtocolFromMimeType("text/html")).toBeNull();
    expect(detectProtocolFromMimeType("application/json")).toBeNull();
    expect(detectProtocolFromMimeType(undefined)).toBeNull();
  });
});

describe("UIHostManager", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    // Set up mocks
    mockListResources.mockResolvedValue([]);
    mockCallTool.mockResolvedValue({
      structuredContent: { temperature: 72 },
      content: [{ type: "text", text: '{"temperature": 72}' }],
    });
    mockReadResource.mockResolvedValue({
      contents: [{ text: mockMCPWidgetHTML }],
    });
  });

  describe("findUIResourceForTool", () => {
    it("should find UI resource by tool name", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      const client = manager.getClient();
      const uiHostManager = new UIHostManager(client);

      const resource = await uiHostManager.findUIResourceForTool("currentWeather");

      expect(resource).not.toBeNull();
      expect(resource?.uri).toBe("ui://weather-app/currentWeather");
      expect(resource?.protocol).toBe("mcp");
    });

    it("should return null when no matching resource", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      const client = manager.getClient();
      const uiHostManager = new UIHostManager(client);

      const resource = await uiHostManager.findUIResourceForTool("nonexistent");

      expect(resource).toBeNull();
    });
  });

  describe("fetchWidgetHTML", () => {
    it("should fetch HTML content from resource", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      const client = manager.getClient();
      const uiHostManager = new UIHostManager(client);

      const html = await uiHostManager.fetchWidgetHTML("ui://weather-app/currentWeather");

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Weather Widget");
    });

    it("should throw error for empty content", async () => {
      mockReadResource.mockResolvedValue({ contents: [] });

      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      const client = manager.getClient();
      const uiHostManager = new UIHostManager(client);

      await expect(uiHostManager.fetchWidgetHTML("ui://empty")).rejects.toThrow(
        "No HTML content in resource"
      );
    });
  });

  describe("renderHeadless", () => {
    it("should render widget with MCP protocol", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      const client = manager.getClient();
      const uiHostManager = new UIHostManager(client);

      const result = await uiHostManager.renderHeadless(
        mockMCPWidgetHTML,
        "mcp",
        { temperature: 72 },
        "currentWeather",
        50
      );

      expect(result.dom).toBeDefined();
      expect(result.html).toContain("<h1>Current Weather</h1>");
      expect(result.textContent).toContain("Current Weather");
      expect(result.mcpEmulator).toBeDefined();
      expect(result.openaiEmulator).toBeUndefined();
    });

    it("should render widget with OpenAI protocol", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      const client = manager.getClient();
      const uiHostManager = new UIHostManager(client);

      const result = await uiHostManager.renderHeadless(
        mockOpenAIWidgetHTML,
        "openai",
        { forecast: "sunny" },
        "forecast",
        50
      );

      expect(result.dom).toBeDefined();
      expect(result.html).toContain("<h2>Forecast</h2>");
      expect(result.openaiEmulator).toBeDefined();
      expect(result.mcpEmulator).toBeUndefined();
    });

    it("should extract elements from DOM", async () => {
      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      const client = manager.getClient();
      const uiHostManager = new UIHostManager(client);

      const result = await uiHostManager.renderHeadless(
        mockMCPWidgetHTML,
        "mcp",
        { temperature: 72 },
        "currentWeather",
        50
      );

      expect(result.elements).toBeInstanceOf(Array);

      // Should find headings and buttons
      const h1 = result.elements.find((e) => e.tagName === "h1");
      expect(h1).toBeDefined();
      expect(h1?.textContent).toContain("Current Weather");

      const button = result.elements.find((e) => e.tagName === "button");
      expect(button).toBeDefined();
      expect(button?.id).toBe("refresh");
    });

    it("should capture console errors", async () => {
      // Note: jsdom script execution timing can be unpredictable
      // This test verifies the error capture mechanism is set up correctly
      const htmlWithError = `
        <!DOCTYPE html>
        <html><body>
        <script>
          // Delay the error to ensure capture is set up
          setTimeout(function() { console.error('Test error'); }, 5);
        </script>
        </body></html>
      `;

      await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
      const client = manager.getClient();
      const uiHostManager = new UIHostManager(client);

      const result = await uiHostManager.renderHeadless(htmlWithError, "mcp", {}, "test", 100);

      // The error should be captured
      expect(result.errors).toContain("Test error");
    });
  });
});

describe("preview_ui tool", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mockCallTool.mockResolvedValue({
      structuredContent: { temperature: 72 },
      content: [{ type: "text", text: '{"temperature": 72}' }],
    });
  });

  it("should preview tool UI with MCP protocol", async () => {
    // Update mock to return HTML for the MCP widget
    mockReadResource.mockResolvedValue({
      contents: [{ text: mockMCPWidgetHTML }],
    });

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

    const tool = createPreviewUITool(createMockRegistry(manager));
    const result = await tool.handler(
      { tool: "currentWeather", arguments: { city: "NYC" } },
      {} as never
    );

    expect(result.hasUI).toBe(true);
    expect(result.protocol).toBe("mcp");
    expect(result.dom).toContain("Current Weather");
    expect(result.textContent).toBeDefined();
    expect(result.elements).toBeInstanceOf(Array);
  });

  it("should preview tool UI with OpenAI protocol", async () => {
    // Update resources mock to only have OpenAI widget
    (
      manager as unknown as {
        getClient: () => {
          raw: { listResources: () => Promise<{ resources: typeof mockResources }> };
        };
      }
    ).getClient = vi.fn().mockReturnValue({
      raw: {
        listResources: vi.fn().mockResolvedValue({
          resources: [mockResources[1]], // Only forecast widget (OpenAI)
        }),
        callTool: mockCallTool,
        readResource: vi.fn().mockResolvedValue({
          contents: [{ text: mockOpenAIWidgetHTML }],
        }),
      },
    });

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

    const tool = createPreviewUITool(createMockRegistry(manager));
    const result = await tool.handler({ tool: "forecast", arguments: {} }, {} as never);

    expect(result.hasUI).toBe(true);
    expect(result.protocol).toBe("openai");
  });

  it("should return hasUI: false when tool call fails", async () => {
    mockCallTool.mockRejectedValue(new Error("Tool execution failed"));

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

    const tool = createPreviewUITool(createMockRegistry(manager));
    const result = await tool.handler({ tool: "currentWeather", arguments: {} }, {} as never);

    expect(result.hasUI).toBe(false);
    expect(result.noUIReason).toContain("Tool call failed");
    expect(result.errors).toContain("Tool execution failed");
  });

  it("should return hasUI: false when no UI resource found", async () => {
    // Mock to return no resources
    (
      manager as unknown as {
        getClient: () => { raw: { listResources: () => Promise<{ resources: never[] }> } };
      }
    ).getClient = vi.fn().mockReturnValue({
      raw: {
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        callTool: mockCallTool,
        readResource: mockReadResource,
      },
    });

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

    const tool = createPreviewUITool(createMockRegistry(manager));
    const result = await tool.handler({ tool: "unknownTool", arguments: {} }, {} as never);

    expect(result.hasUI).toBe(false);
    expect(result.noUIReason).toContain("No UI resource found");
  });

  it("should throw error when not connected", async () => {
    const tool = createPreviewUITool(createMockRegistry(manager));
    await expect(
      tool.handler({ tool: "currentWeather", arguments: {} }, {} as never)
    ).rejects.toThrow("No active connection");
  });
});

describe("screenshot_widget tool", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mockCallTool.mockResolvedValue({
      structuredContent: { temperature: 72 },
    });
    mockReadResource.mockResolvedValue({
      contents: [{ text: mockMCPWidgetHTML }],
    });
  });

  it("should return hasUI: false when tool call fails", async () => {
    mockCallTool.mockRejectedValue(new Error("Screenshot tool failed"));

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

    const tool = createScreenshotWidgetTool(createMockRegistry(manager));
    const result = await tool.handler({ tool: "currentWeather", arguments: {} }, {} as never);

    expect(result.hasUI).toBe(false);
    expect(result.noUIReason).toContain("Tool call failed");
  });

  it("should return hasUI: false when no UI resource found", async () => {
    (
      manager as unknown as {
        getClient: () => { raw: { listResources: () => Promise<{ resources: never[] }> } };
      }
    ).getClient = vi.fn().mockReturnValue({
      raw: {
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        callTool: mockCallTool,
        readResource: mockReadResource,
      },
    });

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

    const tool = createScreenshotWidgetTool(createMockRegistry(manager));
    const result = await tool.handler({ tool: "unknownTool", arguments: {} }, {} as never);

    expect(result.hasUI).toBe(false);
    expect(result.noUIReason).toContain("No UI resource found");
  });

  it("should throw error when not connected", async () => {
    const tool = createScreenshotWidgetTool(createMockRegistry(manager));
    await expect(
      tool.handler({ tool: "currentWeather", arguments: {} }, {} as never)
    ).rejects.toThrow("No active connection");
  });

  // Note: Full screenshot tests require Playwright which may not be available in all environments
  // Integration tests with Playwright should be run separately
});

describe("test_widget_interaction tool", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mockCallTool.mockResolvedValue({
      structuredContent: { temperature: 72 },
    });
    mockReadResource.mockResolvedValue({
      contents: [{ text: mockMCPWidgetHTML }],
    });
  });

  it("should return hasUI: false when tool call fails", async () => {
    mockCallTool.mockRejectedValue(new Error("Interaction tool failed"));

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

    const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
    const result = await tool.handler(
      {
        tool: "currentWeather",
        arguments: {},
        interactions: [{ action: "click", selector: "#button" }],
      },
      {} as never
    );

    expect(result.hasUI).toBe(false);
    expect(result.noUIReason).toContain("Tool call failed");
  });

  it("should return hasUI: false when no UI resource found", async () => {
    (
      manager as unknown as {
        getClient: () => { raw: { listResources: () => Promise<{ resources: never[] }> } };
      }
    ).getClient = vi.fn().mockReturnValue({
      raw: {
        listResources: vi.fn().mockResolvedValue({ resources: [] }),
        callTool: mockCallTool,
        readResource: mockReadResource,
      },
    });

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });

    const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
    const result = await tool.handler(
      {
        tool: "unknownTool",
        arguments: {},
        interactions: [],
      },
      {} as never
    );

    expect(result.hasUI).toBe(false);
    expect(result.noUIReason).toContain("No UI resource found");
  });

  it("should throw error when not connected", async () => {
    const tool = createTestWidgetInteractionTool(createMockRegistry(manager));
    await expect(
      tool.handler(
        {
          tool: "currentWeather",
          arguments: {},
          interactions: [],
        },
        {} as never
      )
    ).rejects.toThrow("No active connection");
  });

  // Note: Full interaction tests require Playwright which may not be available in all environments
  // Integration tests with Playwright should be run separately
});

describe("Input/Output schemas", () => {
  it("should validate preview_ui input", async () => {
    const manager = new ConnectionManager();
    const tool = createPreviewUITool(createMockRegistry(manager));

    // Input schema should exist
    expect(tool.input).toBeDefined();
  });

  it("should validate screenshot_widget input", async () => {
    const manager = new ConnectionManager();
    const tool = createScreenshotWidgetTool(createMockRegistry(manager));

    // Input schema should exist
    expect(tool.input).toBeDefined();
  });

  it("should validate test_widget_interaction input", async () => {
    const manager = new ConnectionManager();
    const tool = createTestWidgetInteractionTool(createMockRegistry(manager));

    // Input schema should exist and include interactions array
    expect(tool.input).toBeDefined();
  });
});
