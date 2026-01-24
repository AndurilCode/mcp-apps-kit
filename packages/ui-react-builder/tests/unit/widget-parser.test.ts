/**
 * Unit tests for widget-parser (file-based discovery)
 */

import { describe, it, expect } from "vitest";
import { parseWidgetFile, isValidWidgetFile } from "../../src/widget-parser";

describe("parseWidgetFile", () => {
  it("should detect default export and ui export", () => {
    const content = `
      export default function MyWidget() {
        return <div>Hello</div>;
      }

      export const ui = {
        name: "My Widget",
        description: "A test widget",
        prefersBorder: true,
      };
    `;

    const result = parseWidgetFile(content);

    expect(result.hasDefaultExport).toBe(true);
    expect(result.hasUIExport).toBe(true);
    expect(result.uiMetadata.name).toBe("My Widget");
    expect(result.uiMetadata.description).toBe("A test widget");
    expect(result.uiMetadata.prefersBorder).toBe(true);
  });

  it("should handle arrow function default export", () => {
    const content = `
      const Widget = () => <div>Hello</div>;
      export default Widget;

      export const ui = {
        name: "Arrow Widget",
      };
    `;

    const result = parseWidgetFile(content);

    expect(result.hasDefaultExport).toBe(true);
    expect(result.hasUIExport).toBe(true);
    expect(result.uiMetadata.name).toBe("Arrow Widget");
  });

  it("should extract autoResize from ui metadata", () => {
    const content = `
      export default function Widget() {
        return <div>Hello</div>;
      }

      export const ui = {
        name: "Auto Resize Widget",
        autoResize: false,
      };
    `;

    const result = parseWidgetFile(content);

    expect(result.uiMetadata.autoResize).toBe(false);
  });

  it("should return false for hasUIExport when ui is not exported", () => {
    const content = `
      export default function Widget() {
        return <div>Hello</div>;
      }

      const ui = {
        name: "Private Widget",
      };
    `;

    const result = parseWidgetFile(content);

    expect(result.hasDefaultExport).toBe(true);
    expect(result.hasUIExport).toBe(false);
  });

  it("should return false for hasDefaultExport when no default export exists", () => {
    const content = `
      export function Widget() {
        return <div>Hello</div>;
      }

      export const ui = {
        name: "Named Widget",
      };
    `;

    const result = parseWidgetFile(content);

    expect(result.hasDefaultExport).toBe(false);
    expect(result.hasUIExport).toBe(true);
  });

  it("should handle widget with typed ui export", () => {
    const content = `
      import type { WidgetMetadata } from "@mcp-apps-kit/core";

      export default function TypedWidget() {
        return <div>Hello</div>;
      }

      export const ui: WidgetMetadata = {
        name: "Typed Widget",
        description: "Widget with type annotation",
        prefersBorder: true,
      };
    `;

    const result = parseWidgetFile(content);

    expect(result.hasDefaultExport).toBe(true);
    expect(result.hasUIExport).toBe(true);
    expect(result.uiMetadata.name).toBe("Typed Widget");
    expect(result.uiMetadata.description).toBe("Widget with type annotation");
    expect(result.uiMetadata.prefersBorder).toBe(true);
  });
});

describe("isValidWidgetFile", () => {
  it("should return true for valid widget file", () => {
    const content = `
      export default function Widget() {
        return <div>Hello</div>;
      }

      export const ui = {
        name: "Valid Widget",
      };
    `;

    expect(isValidWidgetFile(content)).toBe(true);
  });

  it("should return false when missing default export", () => {
    const content = `
      export function Widget() {
        return <div>Hello</div>;
      }

      export const ui = {
        name: "Invalid Widget",
      };
    `;

    expect(isValidWidgetFile(content)).toBe(false);
  });

  it("should return false when missing ui export", () => {
    const content = `
      export default function Widget() {
        return <div>Hello</div>;
      }
    `;

    expect(isValidWidgetFile(content)).toBe(false);
  });

  it("should return false for invalid syntax", () => {
    const content = "this is not valid code {{{";

    expect(isValidWidgetFile(content)).toBe(false);
  });
});
