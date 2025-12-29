/**
 * Unit tests for defineReactUI and isReactUIDef helpers
 */

import { describe, it, expect } from "vitest";
import { defineReactUI, isReactUIDef } from "../../src/define";
import type { ReactUIDef } from "../../src/types";

// Simple test component
const TestComponent = () => null;

describe("defineReactUI", () => {
  it("should return the definition with __reactUI marker and html path", () => {
    const def = defineReactUI({
      component: TestComponent,
      name: "Test Widget",
    });

    expect(def.__reactUI).toBe(true);
    expect(def.__component).toBe(TestComponent);
    expect(def.name).toBe("Test Widget");
    // Should generate html path from component name
    expect(def.html).toBe("./src/ui/dist/test-component.html");
  });

  it("should preserve all optional properties", () => {
    const def = defineReactUI({
      component: TestComponent,
      name: "Full Widget",
      description: "A test widget",
      widgetDescription: "For AI model",
      prefersBorder: true,
      domain: "widget.example.com",
      csp: {
        connectDomains: ["https://api.example.com"],
        resourceDomains: ["https://cdn.example.com"],
      },
      defaultProps: {
        theme: "dark",
      },
    });

    expect(def.name).toBe("Full Widget");
    expect(def.description).toBe("A test widget");
    expect(def.widgetDescription).toBe("For AI model");
    expect(def.prefersBorder).toBe(true);
    expect(def.domain).toBe("widget.example.com");
    expect(def.csp?.connectDomains).toEqual(["https://api.example.com"]);
    expect(def.__defaultProps).toEqual({ theme: "dark" });
    // html path should be generated
    expect(def.html).toBe("./src/ui/dist/test-component.html");
  });

  it("should work with minimal definition", () => {
    const def = defineReactUI({
      component: TestComponent,
    });

    expect(def.__component).toBe(TestComponent);
    expect(def.__reactUI).toBe(true);
    expect(def.name).toBeUndefined();
    expect(def.html).toBe("./src/ui/dist/test-component.html");
  });

  it("should not modify the component reference", () => {
    const MyComponent = () => null;
    const def = defineReactUI({
      component: MyComponent,
    });

    expect(def.__component).toBe(MyComponent);
    expect(def.html).toBe("./src/ui/dist/my-component.html");
  });

  it("should use custom outDir when specified", () => {
    const def = defineReactUI({
      component: TestComponent,
      outDir: "./dist/widgets",
    });

    expect(def.html).toBe("./dist/widgets/test-component.html");
  });
});

describe("isReactUIDef", () => {
  it("should return true for ReactUIDef objects", () => {
    const def = defineReactUI({
      component: TestComponent,
      name: "Test Widget",
    });

    expect(isReactUIDef(def)).toBe(true);
  });

  it("should return true for manual ReactUIDef objects", () => {
    // ReactUIDef now requires __reactUI: true marker
    const def: ReactUIDef = {
      html: "./src/ui/dist/test.html",
      __reactUI: true,
      __component: TestComponent,
      name: "Manual Widget",
    };

    expect(isReactUIDef(def)).toBe(true);
  });

  it("should return false for standard UIDef objects", () => {
    const def = {
      html: "<div>Hello</div>",
      name: "Standard Widget",
    };

    expect(isReactUIDef(def)).toBe(false);
  });

  it("should return false for null", () => {
    expect(isReactUIDef(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isReactUIDef(undefined)).toBe(false);
  });

  it("should return false for strings", () => {
    expect(isReactUIDef("test")).toBe(false);
  });

  it("should return false for numbers", () => {
    expect(isReactUIDef(123)).toBe(false);
  });

  it("should return false for arrays", () => {
    expect(isReactUIDef([])).toBe(false);
  });

  it("should return false for objects without component", () => {
    const def = {
      name: "Widget",
      description: "No component",
    };

    expect(isReactUIDef(def)).toBe(false);
  });

  it("should return false for objects with non-function component", () => {
    const def = {
      component: "NotAFunction",
      name: "Widget",
    };

    expect(isReactUIDef(def)).toBe(false);
  });
});
