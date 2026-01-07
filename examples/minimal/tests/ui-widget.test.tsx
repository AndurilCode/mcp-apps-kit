/**
 * UI Widget Tests
 *
 * Tests the actual React UI components (GreetingWidgetV1, GreetingWidgetV2)
 * in a DOM environment using @testing-library/react.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// Mock the @mcp-apps-kit/ui-react hooks
const mockToolResult = vi.fn();
const mockHostContext = vi.fn();
const mockAppsClient = vi.fn();

vi.mock("@mcp-apps-kit/ui-react", () => ({
  useToolResult: () => mockToolResult(),
  useHostContext: () => mockHostContext(),
  useAppsClient: () => mockAppsClient(),
}));

// Mock the @mcp-apps-kit/ui exports
vi.mock("@mcp-apps-kit/ui", () => ({
  clientDebugLogger: {
    configure: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
  getMcpServerBaseUrl: () => "http://localhost:3000",
  getMcpServerConfig: () => ({ baseUrl: "http://localhost:3000" }),
}));

// Import components after mocks are set up
import { GreetingWidgetV1 } from "../src/ui/GreetingWidgetV1";
import { GreetingWidgetV2 } from "../src/ui/GreetingWidgetV2";

describe("GreetingWidgetV1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHostContext.mockReturnValue({ theme: "light" });
    mockAppsClient.mockReturnValue({
      tools: {
        callGreet: vi.fn(),
      },
    });
  });

  it("should render waiting state when no result", () => {
    mockToolResult.mockReturnValue(undefined);

    render(<GreetingWidgetV1 />);

    expect(screen.getByText("Waiting for greeting...")).toBeInTheDocument();
    expect(screen.getByText("Greet Someone")).toBeInTheDocument();
  });

  it("should render greeting when result is provided", () => {
    mockToolResult.mockReturnValue({
      greet: {
        message: "Hello, Alice!",
        timestamp: new Date().toISOString(),
      },
    });

    render(<GreetingWidgetV1 />);

    expect(screen.getByText("Hello, Alice!")).toBeInTheDocument();
    expect(screen.getByText("Change Name")).toBeInTheDocument();
  });

  it("should render greeting with unwrapped result format", () => {
    // Some environments (like MCP Inspector) return unwrapped results
    mockToolResult.mockReturnValue({
      message: "Hello, Bob!",
      timestamp: new Date().toISOString(),
    });

    render(<GreetingWidgetV1 />);

    expect(screen.getByText("Hello, Bob!")).toBeInTheDocument();
  });

  it("should open modal when clicking Greet Someone", async () => {
    mockToolResult.mockReturnValue(undefined);

    render(<GreetingWidgetV1 />);

    await userEvent.click(screen.getByText("Greet Someone"));

    expect(screen.getByText("Enter a name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Your name")).toBeInTheDocument();
  });

  it("should call greet tool when submitting name", async () => {
    mockToolResult.mockReturnValue(undefined);
    const mockCallGreet = vi.fn().mockResolvedValue({
      message: "Hello, TestUser!",
      timestamp: new Date().toISOString(),
    });
    mockAppsClient.mockReturnValue({
      tools: { callGreet: mockCallGreet },
    });

    render(<GreetingWidgetV1 />);

    // Open modal
    await userEvent.click(screen.getByText("Greet Someone"));

    // Type name
    await userEvent.type(screen.getByPlaceholderText("Your name"), "TestUser");

    // Submit
    await userEvent.click(screen.getByText("Greet"));

    await waitFor(() => {
      expect(mockCallGreet).toHaveBeenCalledWith({ name: "TestUser" });
    });
  });

  it("should close modal when clicking Cancel", async () => {
    mockToolResult.mockReturnValue(undefined);

    render(<GreetingWidgetV1 />);

    await userEvent.click(screen.getByText("Greet Someone"));
    expect(screen.getByText("Enter a name")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(screen.queryByText("Enter a name")).not.toBeInTheDocument();
    });
  });

  it("should display error message on greet failure", async () => {
    mockToolResult.mockReturnValue(undefined);
    const mockCallGreet = vi.fn().mockRejectedValue(new Error("Network error"));
    mockAppsClient.mockReturnValue({
      tools: { callGreet: mockCallGreet },
    });

    render(<GreetingWidgetV1 />);

    await userEvent.click(screen.getByText("Greet Someone"));
    await userEvent.type(screen.getByPlaceholderText("Your name"), "Test");
    await userEvent.click(screen.getByText("Greet"));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("should show version badge", () => {
    mockToolResult.mockReturnValue(undefined);

    render(<GreetingWidgetV1 />);

    expect(screen.getByText("API v1")).toBeInTheDocument();
  });

  it("should apply theme class to document", () => {
    mockHostContext.mockReturnValue({ theme: "dark" });
    mockToolResult.mockReturnValue(undefined);

    render(<GreetingWidgetV1 />);

    expect(document.documentElement.className).toBe("dark");
  });
});

describe("GreetingWidgetV2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHostContext.mockReturnValue({ theme: "light" });
    mockAppsClient.mockReturnValue({
      tools: {
        callGreet: vi.fn(),
      },
    });
  });

  it("should render waiting state when no result", () => {
    mockToolResult.mockReturnValue(undefined);

    render(<GreetingWidgetV2 />);

    expect(screen.getByText("Waiting for greeting...")).toBeInTheDocument();
  });

  it("should render greeting with full name", () => {
    mockToolResult.mockReturnValue({
      greet: {
        message: "Hello, John Smith!",
        fullName: "John Smith",
        timestamp: new Date().toISOString(),
      },
    });

    render(<GreetingWidgetV2 />);

    expect(screen.getByText("Hello, John Smith!")).toBeInTheDocument();
  });

  it("should show version badge for v2", () => {
    mockToolResult.mockReturnValue(undefined);

    render(<GreetingWidgetV2 />);

    expect(screen.getByText("API v2")).toBeInTheDocument();
  });

  it("should have surname input field in modal", async () => {
    mockToolResult.mockReturnValue(undefined);

    render(<GreetingWidgetV2 />);

    await userEvent.click(screen.getByText("Greet Someone"));

    // Note: Actual placeholders are "First name *" and "Surname (optional)"
    expect(screen.getByPlaceholderText("First name *")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Surname (optional)")).toBeInTheDocument();
  });

  it("should call greet tool with name and surname", async () => {
    mockToolResult.mockReturnValue(undefined);
    const mockCallGreet = vi.fn().mockResolvedValue({
      message: "Hello, Jane Doe!",
      fullName: "Jane Doe",
      timestamp: new Date().toISOString(),
    });
    mockAppsClient.mockReturnValue({
      tools: { callGreet: mockCallGreet },
    });

    render(<GreetingWidgetV2 />);

    await userEvent.click(screen.getByText("Greet Someone"));
    await userEvent.type(screen.getByPlaceholderText("First name *"), "Jane");
    await userEvent.type(screen.getByPlaceholderText("Surname (optional)"), "Doe");
    await userEvent.click(screen.getByText("Greet"));

    await waitFor(() => {
      expect(mockCallGreet).toHaveBeenCalledWith({ name: "Jane", surname: "Doe" });
    });
  });
});
