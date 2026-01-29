/**
 * UI Inspection tools tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import {
  createListUIWidgetsTool,
  createGetUIWidgetTool,
  createInspectToolUITool,
  createGetUIMetadataTool,
} from "../src/tools";

// MCP Apps MIME type
const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
// OpenAI Apps SDK MIME type
const OPENAI_MIME_TYPE = "text/html+skybridge";

// Mock resources
const mockResources = [
  {
    uri: "ui://weather-app/currentWeather?v=a1b2c3d4",
    name: "Current Weather Widget",
    description: "Displays current weather conditions",
    mimeType: MCP_APP_MIME_TYPE,
    _meta: {
      ui: {
        prefersBorder: true,
        csp: {
          connectDomains: ["https://api.weather.com"],
        },
      },
    },
  },
  {
    uri: "ui://weather-app/forecast?v=e5f6g7h8",
    name: "Forecast Widget",
    mimeType: OPENAI_MIME_TYPE,
    _meta: {
      "openai/widgetPrefersBorder": false,
      "openai/widgetCSP": {
        connect_domains: ["https://api.forecast.com"],
      },
    },
  },
  {
    uri: "file:///config.json",
    name: "Config File",
    mimeType: "application/json",
  },
];

// Mock tools
const mockTools = [
  {
    name: "get_current_weather",
    description: "Get current weather",
    _meta: {
      ui: {
        visibility: ["model", "app"],
        resourceUri: "ui://weather-app/currentWeather?v=a1b2c3d4",
      },
      "ui/resourceUri": "ui://weather-app/currentWeather?v=a1b2c3d4",
      "ui/visibility": ["model", "app"],
    },
  },
  {
    name: "calculate_sum",
    description: "Calculate sum of numbers",
  },
  {
    name: "get_forecast",
    description: "Get weather forecast",
    _meta: {
      "openai/visibility": "public",
      "openai/widgetAccessible": true,
      "openai/outputTemplate": "ui://weather-app/forecast?v=e5f6g7h8",
    },
  },
];

// Mock the @mcp-apps-kit/testing module
const mockListTools = vi.fn();
const mockListResources = vi.fn();
const mockListPrompts = vi.fn();
const mockCallTool = vi.fn();
const mockDisconnect = vi.fn();
const mockGetCallHistory = vi.fn();
const mockClearHistory = vi.fn();
const mockReadResource = vi.fn();

vi.mock("@mcp-apps-kit/testing", () => {
  return {
    createTestClient: vi.fn().mockImplementation(() =>
      Promise.resolve({
        listTools: mockListTools,
        listResources: mockListResources,
        listPrompts: mockListPrompts,
        callTool: mockCallTool,
        disconnect: mockDisconnect,
        getCallHistory: mockGetCallHistory,
        clearHistory: mockClearHistory,
        readResource: mockReadResource,
        raw: {
          listResources: vi.fn().mockResolvedValue({ resources: mockResources }),
          listTools: vi.fn().mockResolvedValue({ tools: mockTools }),
          readResource: vi.fn().mockResolvedValue({
            contents: [{ text: "<!DOCTYPE html><html>...</html>" }],
          }),
        },
      })
    ),
  };
});

describe("UI Inspection Tools", () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    // Default mock implementations
    mockListTools.mockResolvedValue([{ name: "greet" }]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);
    mockDisconnect.mockResolvedValue(undefined);
    mockGetCallHistory.mockReturnValue([]);
    mockClearHistory.mockReturnValue(undefined);
  });

  afterEach(async () => {
    await manager.disconnect();
  });

  describe("list_ui_widgets", () => {
    it("should list UI widgets from server", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createListUIWidgetsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.count).toBe(2);
      expect(result.widgets).toHaveLength(2);
      expect(result.widgets[0]).toEqual({
        uri: "ui://weather-app/currentWeather?v=a1b2c3d4",
        name: "Current Weather Widget",
        description: "Displays current weather conditions",
        protocol: "mcp-app",
        mimeType: MCP_APP_MIME_TYPE,
      });
      expect(result.widgets[1]).toEqual({
        uri: "ui://weather-app/forecast?v=e5f6g7h8",
        name: "Forecast Widget",
        description: undefined,
        protocol: "openai",
        mimeType: OPENAI_MIME_TYPE,
      });
    });

    it("should return empty array when no UI widgets", async () => {
      const client = await manager.connect("http://localhost:3000/mcp");
      // Override raw client to return no UI widgets
      (manager.getClient().raw.listResources as ReturnType<typeof vi.fn>).mockResolvedValue({
        resources: [mockResources[2]], // Only the non-UI resource
      });

      const tool = createListUIWidgetsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.widgets).toEqual([]);
      expect(result.count).toBe(0);
    });

    it("should throw error when not connected", async () => {
      const tool = createListUIWidgetsTool(manager);
      await expect(tool.handler({}, {} as never)).rejects.toThrow("No active connection");
    });
  });

  describe("get_ui_widget", () => {
    it("should get UI widget content and metadata", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createGetUIWidgetTool(manager);
      const result = await tool.handler(
        { uri: "ui://weather-app/currentWeather?v=a1b2c3d4" },
        {} as never
      );

      expect(result.uri).toBe("ui://weather-app/currentWeather?v=a1b2c3d4");
      expect(result.name).toBe("Current Weather Widget");
      expect(result.mimeType).toBe(MCP_APP_MIME_TYPE);
      expect(result.html).toBe("<!DOCTYPE html><html>...</html>");
      expect(result.htmlLength).toBe(31);
      expect(result.metadata.prefersBorder).toBe(true);
      expect(result.metadata.csp?.connectDomains).toEqual(["https://api.weather.com"]);
    });

    it("should throw error for non-existent widget", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createGetUIWidgetTool(manager);
      await expect(
        tool.handler({ uri: "ui://weather-app/nonexistent" }, {} as never)
      ).rejects.toThrow("UI widget not found: ui://weather-app/nonexistent");
    });

    it("should throw error for non-UI resource", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createGetUIWidgetTool(manager);
      await expect(tool.handler({ uri: "file:///config.json" }, {} as never)).rejects.toThrow(
        "Resource is not a UI widget: file:///config.json (mimeType: application/json)"
      );
    });

    it("should throw error for invalid URI format", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createGetUIWidgetTool(manager);
      await expect(tool.handler({ uri: "not-a-uri" }, {} as never)).rejects.toThrow(
        "Invalid URI format: 'not-a-uri'"
      );
    });
  });

  describe("inspect_tool_ui", () => {
    it("should inspect tool with MCP UI binding", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createInspectToolUITool(manager);
      const result = await tool.handler({ toolName: "get_current_weather" }, {} as never);

      expect(result.toolName).toBe("get_current_weather");
      expect(result.hasUI).toBe(true);
      expect(result.uiBinding).toEqual({
        resourceUri: "ui://weather-app/currentWeather?v=a1b2c3d4",
        visibility: ["model", "app"],
      });
      expect(result.mcpMeta).not.toBeNull();
    });

    it("should inspect tool with OpenAI UI binding", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createInspectToolUITool(manager);
      const result = await tool.handler({ toolName: "get_forecast" }, {} as never);

      expect(result.toolName).toBe("get_forecast");
      expect(result.hasUI).toBe(true);
      expect(result.uiBinding).toEqual({
        resourceUri: "ui://weather-app/forecast?v=e5f6g7h8",
        visibility: ["model", "app"],
      });
      expect(result.openaiMeta).not.toBeNull();
    });

    it("should return hasUI: false for tool without UI", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createInspectToolUITool(manager);
      const result = await tool.handler({ toolName: "calculate_sum" }, {} as never);

      expect(result.toolName).toBe("calculate_sum");
      expect(result.hasUI).toBe(false);
      expect(result.uiBinding).toBeNull();
      expect(result.mcpMeta).toBeNull();
      expect(result.openaiMeta).toBeNull();
    });

    it("should throw error for non-existent tool", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createInspectToolUITool(manager);
      await expect(tool.handler({ toolName: "unknown_tool" }, {} as never)).rejects.toThrow(
        "Tool not found: unknown_tool"
      );
    });
  });

  describe("get_ui_metadata", () => {
    it("should get metadata for MCP App widget", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createGetUIMetadataTool(manager);
      const result = await tool.handler(
        { uri: "ui://weather-app/currentWeather?v=a1b2c3d4" },
        {} as never
      );

      expect(result.uri).toBe("ui://weather-app/currentWeather?v=a1b2c3d4");
      expect(result.mimeType).toBe(MCP_APP_MIME_TYPE);
      expect(result.detectedProtocol).toBe("mcp-app");
      expect(result.mcpFormat).toEqual({
        ui: {
          prefersBorder: true,
          csp: {
            connectDomains: ["https://api.weather.com"],
          },
        },
      });
      // Should also have openai format converted
      expect(result.openaiFormat["openai/widgetPrefersBorder"]).toBe(true);
      expect(result.openaiFormat["openai/widgetCSP"]).toEqual({
        connect_domains: ["https://api.weather.com"],
      });
    });

    it("should get metadata for OpenAI widget", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createGetUIMetadataTool(manager);
      const result = await tool.handler(
        { uri: "ui://weather-app/forecast?v=e5f6g7h8" },
        {} as never
      );

      expect(result.uri).toBe("ui://weather-app/forecast?v=e5f6g7h8");
      expect(result.mimeType).toBe(OPENAI_MIME_TYPE);
      expect(result.detectedProtocol).toBe("openai");
      expect(result.openaiFormat["openai/widgetPrefersBorder"]).toBe(false);
      expect(result.openaiFormat["openai/widgetCSP"]).toEqual({
        connect_domains: ["https://api.forecast.com"],
      });
      // Should also have mcp format converted
      expect(result.mcpFormat).toEqual({
        ui: {
          prefersBorder: false,
          csp: {
            connectDomains: ["https://api.forecast.com"],
          },
        },
      });
    });

    it("should throw error for non-existent URI", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createGetUIMetadataTool(manager);
      await expect(
        tool.handler({ uri: "ui://weather-app/nonexistent" }, {} as never)
      ).rejects.toThrow("UI widget not found: ui://weather-app/nonexistent");
    });

    it("should throw error for non-UI resource", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createGetUIMetadataTool(manager);
      await expect(tool.handler({ uri: "file:///config.json" }, {} as never)).rejects.toThrow(
        "Resource is not a UI widget: file:///config.json (mimeType: application/json)"
      );
    });
  });
});
