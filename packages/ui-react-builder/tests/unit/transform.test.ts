/**
 * Unit tests for transform utilities
 */

import { describe, it, expect } from "vitest";
import {
  transformToCoreDefs,
  transformSingleToCoreDef,
  extractReactUIs,
} from "../../src/transform";
import { defineReactUI } from "../../src/define";
import type { BuildResult } from "../../src/types";
import type { UIDef } from "@mcp-apps-kit/core";

// Test component
const TestComponent = () => null;

// Helper to create a mock build result
function createBuildResult(
  outputs: Record<string, string>,
  errors: { key: string; message: string }[] = []
): BuildResult {
  return {
    outputs: new Map(Object.entries(outputs)),
    files: new Map(),
    duration: 100,
    warnings: [],
    errors: errors.map((e) => ({ ...e })),
  };
}

describe("transformToCoreDefs", () => {
  it("should transform ReactUIDef to UIDef with HTML", () => {
    const reactDef = defineReactUI({
      component: TestComponent,
      name: "Test Widget",
      prefersBorder: true,
    });

    const buildResult = createBuildResult({
      "test-widget": "<!DOCTYPE html><html>...</html>",
    });

    const result = transformToCoreDefs({ "test-widget": reactDef }, buildResult);

    expect(result["test-widget"]).toBeDefined();
    expect(result["test-widget"]?.html).toBe("<!DOCTYPE html><html>...</html>");
    expect(result["test-widget"]?.name).toBe("Test Widget");
    expect(result["test-widget"]?.prefersBorder).toBe(true);
  });

  it("should preserve all UIDef properties", () => {
    const reactDef = defineReactUI({
      component: TestComponent,
      name: "Full Widget",
      description: "A test widget",
      widgetDescription: "For AI model",
      prefersBorder: true,
      domain: "widget.example.com",
      csp: {
        connectDomains: ["https://api.example.com"],
      },
    });

    const buildResult = createBuildResult({
      widget: "<html></html>",
    });

    const result = transformToCoreDefs({ widget: reactDef }, buildResult);

    expect(result.widget?.name).toBe("Full Widget");
    expect(result.widget?.description).toBe("A test widget");
    expect(result.widget?.widgetDescription).toBe("For AI model");
    expect(result.widget?.prefersBorder).toBe(true);
    expect(result.widget?.domain).toBe("widget.example.com");
    expect(result.widget?.csp?.connectDomains).toEqual(["https://api.example.com"]);
  });

  it("should pass through standard UIDef unchanged", () => {
    const standardDef: UIDef = {
      html: "./widget.html",
      name: "Standard Widget",
    };

    const buildResult = createBuildResult({});

    const result = transformToCoreDefs({ widget: standardDef }, buildResult);

    expect(result.widget).toBe(standardDef);
    expect(result.widget?.html).toBe("./widget.html");
  });

  it("should handle mixed ReactUIDef and UIDef", () => {
    const reactDef = defineReactUI({
      component: TestComponent,
      name: "React Widget",
    });

    const standardDef: UIDef = {
      html: "./standard.html",
      name: "Standard Widget",
    };

    const buildResult = createBuildResult({
      "react-widget": "<html>React</html>",
    });

    const result = transformToCoreDefs(
      {
        "react-widget": reactDef,
        "standard-widget": standardDef,
      },
      buildResult
    );

    expect(result["react-widget"]?.html).toBe("<html>React</html>");
    expect(result["standard-widget"]?.html).toBe("./standard.html");
  });

  it("should throw when build output is missing for ReactUIDef", () => {
    const reactDef = defineReactUI({
      component: TestComponent,
    });

    const buildResult = createBuildResult({});

    expect(() => {
      transformToCoreDefs({ widget: reactDef }, buildResult);
    }).toThrow("No build output found for React UI");
  });

  it("should include build error message when available", () => {
    const reactDef = defineReactUI({
      component: TestComponent,
    });

    const buildResult = createBuildResult({}, [{ key: "widget", message: "Compilation failed" }]);

    expect(() => {
      transformToCoreDefs({ widget: reactDef }, buildResult);
    }).toThrow("Build failed for React UI");
  });
});

describe("transformSingleToCoreDef", () => {
  it("should transform single ReactUIDef", () => {
    const reactDef = defineReactUI({
      component: TestComponent,
      name: "Single Widget",
      prefersBorder: true,
    });

    const result = transformSingleToCoreDef(reactDef, "<html></html>");

    expect(result.html).toBe("<html></html>");
    expect(result.name).toBe("Single Widget");
    expect(result.prefersBorder).toBe(true);
  });

  it("should not include component or defaultProps in result", () => {
    const reactDef = defineReactUI({
      component: TestComponent,
      defaultProps: { theme: "dark" },
    });

    const result = transformSingleToCoreDef(reactDef, "<html></html>");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).component).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).defaultProps).toBeUndefined();
  });
});

describe("extractReactUIs", () => {
  it("should separate ReactUIDefs from standard UIDefs", () => {
    const reactDef = defineReactUI({
      component: TestComponent,
      name: "React Widget",
    });

    const standardDef: UIDef = {
      html: "./standard.html",
      name: "Standard Widget",
    };

    const { reactUIs, standardUIs } = extractReactUIs({
      react: reactDef,
      standard: standardDef,
    });

    expect(Object.keys(reactUIs)).toEqual(["react"]);
    expect(Object.keys(standardUIs)).toEqual(["standard"]);
    expect(reactUIs.react).toBe(reactDef);
    expect(standardUIs.standard).toBe(standardDef);
  });

  it("should return empty objects when no UIs of that type", () => {
    const reactDef = defineReactUI({
      component: TestComponent,
    });

    const { reactUIs, standardUIs } = extractReactUIs({
      widget: reactDef,
    });

    expect(Object.keys(reactUIs)).toHaveLength(1);
    expect(Object.keys(standardUIs)).toHaveLength(0);
  });

  it("should handle empty input", () => {
    const { reactUIs, standardUIs } = extractReactUIs({});

    expect(Object.keys(reactUIs)).toHaveLength(0);
    expect(Object.keys(standardUIs)).toHaveLength(0);
  });
});
