/**
 * Unit tests for HTML template generation
 */

import { describe, it, expect } from "vitest";
import { generateHTML, generateEntryPoint, extractInlineCSS } from "../../src/html";

describe("generateHTML", () => {
  it("should generate valid HTML5 document", () => {
    const html = generateHTML({
      key: "test-widget",
      name: "Test Widget",
      script: "console.log('hello');",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("</html>");
  });

  it("should include proper meta tags", () => {
    const html = generateHTML({
      key: "test-widget",
      name: "Test Widget",
      script: "",
    });

    expect(html).toContain('<meta charset="UTF-8">');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain('<meta name="mcp-ui-key" content="test-widget">');
  });

  it("should set the title from name", () => {
    const html = generateHTML({
      key: "test-widget",
      name: "My Custom Title",
      script: "",
    });

    expect(html).toContain("<title>My Custom Title</title>");
  });

  it("should include root div for React mounting", () => {
    const html = generateHTML({
      key: "test-widget",
      name: "Test Widget",
      script: "",
    });

    expect(html).toContain('<div id="root"></div>');
  });

  it("should include the script as module", () => {
    const script = 'console.log("hello world");';
    const html = generateHTML({
      key: "test-widget",
      name: "Test Widget",
      script,
    });

    expect(html).toContain('<script type="module">');
    expect(html).toContain(script);
    expect(html).toContain("</script>");
  });

  it("should include base CSS reset", () => {
    const html = generateHTML({
      key: "test-widget",
      name: "Test Widget",
      script: "",
    });

    expect(html).toContain("<style>");
    expect(html).toContain("box-sizing: border-box");
    expect(html).toContain("font-family:");
  });

  it("should include custom CSS when provided", () => {
    const customCss = ".my-class { color: red; }";
    const html = generateHTML({
      key: "test-widget",
      name: "Test Widget",
      script: "",
      css: customCss,
    });

    expect(html).toContain(".my-class { color: red; }");
  });

  it("should escape HTML in key and name", () => {
    const html = generateHTML({
      key: "test<script>alert('xss')</script>",
      name: "Test<script>alert('xss')</script>",
      script: "",
    });

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("should support dark mode styles", () => {
    const html = generateHTML({
      key: "test-widget",
      name: "Test Widget",
      script: "",
    });

    expect(html).toContain("prefers-color-scheme: dark");
  });
});

describe("generateEntryPoint", () => {
  it("should import React and ReactDOM", () => {
    const code = generateEntryPoint("./MyComponent.tsx");

    expect(code).toContain('import React from "react"');
    expect(code).toContain('import { createRoot } from "react-dom/client"');
  });

  it("should import AppsProvider", () => {
    const code = generateEntryPoint("./MyComponent.tsx");

    expect(code).toContain('import { AppsProvider } from "@mcp-apps-kit/ui-react"');
  });

  it("should import the component", () => {
    const code = generateEntryPoint("./path/to/MyComponent.tsx");

    expect(code).toContain('import Component from "./path/to/MyComponent.tsx"');
  });

  it("should wrap component in AppsProvider", () => {
    const code = generateEntryPoint("./MyComponent.tsx");

    expect(code).toContain("<AppsProvider>");
    expect(code).toContain("<Component");
    expect(code).toContain("</AppsProvider>");
  });

  it("should use StrictMode", () => {
    const code = generateEntryPoint("./MyComponent.tsx");

    expect(code).toContain("<React.StrictMode>");
    expect(code).toContain("</React.StrictMode>");
  });

  it("should mount to root element", () => {
    const code = generateEntryPoint("./MyComponent.tsx");

    expect(code).toContain('document.getElementById("root")');
    expect(code).toContain("createRoot(rootElement)");
  });

  it("should pass default props when provided", () => {
    const code = generateEntryPoint("./MyComponent.tsx", {
      theme: "dark",
      count: 5,
    });

    expect(code).toContain('"theme":"dark"');
    expect(code).toContain('"count":5');
  });

  it("should pass empty object when no props", () => {
    const code = generateEntryPoint("./MyComponent.tsx");

    expect(code).toContain("<Component {...{}}");
  });
});

describe("extractInlineCSS", () => {
  it("should extract CSS from textContent assignment", () => {
    const code = `
      var style = document.createElement("style");
      style.textContent = ".test { color: red; }";
      document.head.appendChild(style);
    `;

    const css = extractInlineCSS(code);
    expect(css).toBe(".test { color: red; }");
  });

  it("should handle escaped newlines", () => {
    const code = `style.textContent = ".test {\\n  color: red;\\n}";`;

    const css = extractInlineCSS(code);
    expect(css).toContain("\n");
  });

  it("should return undefined when no CSS found", () => {
    const code = "console.log('no css here');";

    const css = extractInlineCSS(code);
    expect(css).toBeUndefined();
  });
});
