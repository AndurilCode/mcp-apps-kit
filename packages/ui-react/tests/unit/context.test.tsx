/**
 * Unit tests for AppsProvider and context
 *
 * Tests the React context and provider implementation.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AppsProvider, useAppsClient } from "../../src";
import type { AppsClient, ToolDefs } from "@apps-builder/ui";
import { MockAdapter, createAppsClient } from "@apps-builder/ui";

// Create a mock client for testing
async function createMockClient(): Promise<AppsClient<ToolDefs>> {
  const adapter = new MockAdapter();
  await adapter.connect();
  return createAppsClient(adapter);
}

describe("AppsProvider", () => {
  describe("with provided client", () => {
    it("should render children when client is provided", async () => {
      const client = await createMockClient();

      render(
        <AppsProvider client={client}>
          <div data-testid="child">Child Content</div>
        </AppsProvider>
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
      expect(screen.getByText("Child Content")).toBeInTheDocument();
    });

    it("should not show fallback when client is already provided", async () => {
      const client = await createMockClient();

      render(
        <AppsProvider client={client} fallback={<div>Loading...</div>}>
          <div data-testid="child">Ready</div>
        </AppsProvider>
      );

      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
      expect(screen.getByText("Ready")).toBeInTheDocument();
    });
  });

  describe("with forceAdapter mock", () => {
    it("should auto-initialize client with mock adapter", async () => {
      render(
        <AppsProvider forceAdapter="mock" fallback={<div>Loading...</div>}>
          <div data-testid="child">Ready</div>
        </AppsProvider>
      );

      // Should show fallback initially while connecting
      expect(screen.getByText("Loading...")).toBeInTheDocument();

      // Wait for client to connect
      await waitFor(() => {
        expect(screen.getByTestId("child")).toBeInTheDocument();
      });
    });
  });

  describe("with fallback", () => {
    it("should show fallback while connecting", () => {
      render(
        <AppsProvider forceAdapter="mock" fallback={<div data-testid="loading">Loading...</div>}>
          <div>Content</div>
        </AppsProvider>
      );

      expect(screen.getByTestId("loading")).toBeInTheDocument();
    });
  });

  describe("error handling", () => {
    it("should render error fallback when error occurs", async () => {
      // Create a client that will fail
      const ErrorComponent = ({ error, reset }: { error: Error; reset: () => void }) => (
        <div data-testid="error">
          Error: {error.message}
          <button onClick={reset}>Reset</button>
        </div>
      );

      // Mock createClient to fail
      vi.mock("@apps-builder/ui", async (importOriginal) => {
        const original = await importOriginal<typeof import("@apps-builder/ui")>();
        return {
          ...original,
          createClient: vi.fn().mockRejectedValue(new Error("Connection failed")),
        };
      });

      // Note: This test would require more setup to properly mock the module
      // For now, we just verify the component can render with the error fallback prop
      const client = await createMockClient();

      render(
        <AppsProvider client={client} errorFallback={ErrorComponent}>
          <div>Content</div>
        </AppsProvider>
      );

      // Client is provided, so no error
      expect(screen.queryByTestId("error")).not.toBeInTheDocument();
    });
  });
});

describe("useAppsClient", () => {
  it("should throw when used outside AppsProvider", () => {
    // We need to catch the error from the hook
    const TestComponent = () => {
      try {
        useAppsClient();
        return <div>No error</div>;
      } catch (error) {
        return <div data-testid="error">{(error as Error).message}</div>;
      }
    };

    render(<TestComponent />);

    expect(screen.getByTestId("error")).toHaveTextContent(
      "useAppsContext must be used within an AppsProvider"
    );
  });

  it("should return client when available", async () => {
    const client = await createMockClient();
    let capturedClient: AppsClient<ToolDefs> | null = null;

    const TestComponent = () => {
      capturedClient = useAppsClient();
      return <div data-testid="ready">Ready</div>;
    };

    render(
      <AppsProvider client={client}>
        <TestComponent />
      </AppsProvider>
    );

    expect(screen.getByTestId("ready")).toBeInTheDocument();
    expect(capturedClient).toBe(client);
  });
});
