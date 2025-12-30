import { describe, it, expect } from "vitest";
import { parseReactUIDefinitions } from "../../src/ast-parser";

describe("AST Parser", () => {
  describe("parseReactUIDefinitions", () => {
    it("should parse named imports and defineReactUI calls", async () => {
      const content = `
import { createApp, defineTool } from "@mcp-apps-kit/core";
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { GreetingWidget } from "./ui/GreetingWidget";

const app = createApp({
  tools: {
    greet: defineTool({
      ui: defineReactUI({
        component: GreetingWidget,
        name: "Greeting Widget",
      }),
    }),
  },
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        componentName: "GreetingWidget",
        importPath: "./ui/GreetingWidget",
        name: "Greeting Widget",
      });
    });

    it("should parse default imports", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import MyWidget from "./widgets/MyWidget";

defineReactUI({
  component: MyWidget,
  name: "My Widget",
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        componentName: "MyWidget",
        importPath: "./widgets/MyWidget",
        name: "My Widget",
      });
    });

    it("should handle aliased imports", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { SomeComponent as AliasedWidget } from "./widgets/SomeComponent";

defineReactUI({
  name: "Aliased Widget",
  component: AliasedWidget,
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        componentName: "AliasedWidget",
        importPath: "./widgets/SomeComponent",
        name: "Aliased Widget",
      });
    });

    it("should handle multiple defineReactUI calls", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { WidgetA } from "./widgets/WidgetA";
import { WidgetB } from "./widgets/WidgetB";

const uiA = defineReactUI({
  component: WidgetA,
  name: "Widget A",
});

const uiB = defineReactUI({
  component: WidgetB,
  name: "Widget B",
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(2);
      expect(results[0].componentName).toBe("WidgetA");
      expect(results[1].componentName).toBe("WidgetB");
    });

    it("should handle multi-line imports", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import {
  WidgetA,
  WidgetB,
  WidgetC,
} from "./widgets";

defineReactUI({ component: WidgetA, name: "Widget A" });
defineReactUI({ component: WidgetB, name: "Widget B" });
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(2);
      expect(results[0].componentName).toBe("WidgetA");
      expect(results[0].importPath).toBe("./widgets");
      expect(results[1].componentName).toBe("WidgetB");
    });

    it("should skip non-relative imports", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { ExternalWidget } from "some-package";
import { LocalWidget } from "./widgets/LocalWidget";

defineReactUI({ component: ExternalWidget, name: "External" });
defineReactUI({ component: LocalWidget, name: "Local" });
`;

      const results = await parseReactUIDefinitions(content);

      // ExternalWidget should be found in the import map but not be a relative import
      expect(results).toHaveLength(2);
      // Both are found by the AST parser - filtering happens in resolveComponentPath
      expect(results.some((r) => r.componentName === "ExternalWidget")).toBe(true);
      expect(results.some((r) => r.componentName === "LocalWidget")).toBe(true);
    });

    it("should return empty array if no defineReactUI calls", async () => {
      const content = `
import { createApp } from "@mcp-apps-kit/core";

const app = createApp({
  name: "test",
  tools: {},
});
`;

      const results = await parseReactUIDefinitions(content);
      expect(results).toHaveLength(0);
    });

    it("should skip defineReactUI with missing component property", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./widgets/Widget";

defineReactUI({
  name: "No Component",
});
`;

      const results = await parseReactUIDefinitions(content);
      expect(results).toHaveLength(0);
    });

    it("should skip defineReactUI with missing name property", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./widgets/Widget";

defineReactUI({
  component: Widget,
});
`;

      const results = await parseReactUIDefinitions(content);
      expect(results).toHaveLength(0);
    });

    it("should skip components without imports", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";

function LocalComponent() {
  return <div>Local</div>;
}

defineReactUI({
  component: LocalComponent,
  name: "Local Component",
});
`;

      const results = await parseReactUIDefinitions(content);
      expect(results).toHaveLength(0);
    });

    it("should handle properties in any order", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

defineReactUI({
  prefersBorder: true,
  name: "My Widget",
  description: "A widget",
  component: Widget,
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        componentName: "Widget",
        importPath: "./Widget",
        name: "My Widget",
      });
    });

    it("should handle nested defineReactUI in defineTool", async () => {
      const content = `
import { createApp, defineTool } from "@mcp-apps-kit/core";
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Dashboard } from "./components/Dashboard";

const app = createApp({
  name: "my-app",
  tools: {
    stats: defineTool({
      description: "Get statistics",
      ui: defineReactUI({
        component: Dashboard,
        name: "Statistics Dashboard",
      }),
      handler: async () => ({ count: 42 }),
    }),
  },
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        componentName: "Dashboard",
        importPath: "./components/Dashboard",
        name: "Statistics Dashboard",
      });
    });

    it("should handle deeply nested structures", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

const config = {
  ui: {
    primary: defineReactUI({
      component: Widget,
      name: "Deep Widget",
    }),
  },
};
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].componentName).toBe("Widget");
      expect(results[0].name).toBe("Deep Widget");
    });

    it("should handle TypeScript type imports (ignoring them)", async () => {
      const content = `
import type { SomeType } from "./types";
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

defineReactUI({
  component: Widget,
  name: "Typed Widget",
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].componentName).toBe("Widget");
    });

    it("should handle mixed type and value imports", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget, type WidgetProps } from "./Widget";

defineReactUI({
  component: Widget,
  name: "Mixed Import Widget",
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].componentName).toBe("Widget");
      expect(results[0].importPath).toBe("./Widget");
    });

    it("should handle namespace imports (not resolving them)", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import * as Widgets from "./widgets";

defineReactUI({
  component: Widgets.MyWidget,
  name: "Namespace Widget",
});
`;

      const results = await parseReactUIDefinitions(content);

      // Namespace member access is not supported - component should not be found
      expect(results).toHaveLength(0);
    });

    it("should handle JSX syntax in component files", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Card } from "./Card";

// This file might also contain JSX
const Preview = () => <div><Card /></div>;

defineReactUI({
  component: Card,
  name: "Card Component",
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].componentName).toBe("Card");
    });

    it("should handle comments around defineReactUI", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

// This is the main widget
/* It displays important data */
const ui = defineReactUI({
  component: Widget, // The main component
  name: "Commented Widget", /* The display name */
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Commented Widget");
    });

    it("should handle template literals in name (not supported)", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

const prefix = "My";
defineReactUI({
  component: Widget,
  name: \`\${prefix} Widget\`,
});
`;

      const results = await parseReactUIDefinitions(content);

      // Template literals are not supported for name extraction
      expect(results).toHaveLength(0);
    });

    it("should handle variable reference for name (not supported)", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

const widgetName = "My Widget";
defineReactUI({
  component: Widget,
  name: widgetName,
});
`;

      const results = await parseReactUIDefinitions(content);

      // Variable references for name are not supported
      expect(results).toHaveLength(0);
    });

    it("should handle spread properties (ignoring them)", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

const baseConfig = { prefersBorder: true };
defineReactUI({
  ...baseConfig,
  component: Widget,
  name: "Spread Widget",
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Spread Widget");
    });

    it("should handle shorthand property syntax (not supported for local variables)", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

const component = Widget;
defineReactUI({
  component,
  name: "Shorthand Widget",
});
`;

      const results = await parseReactUIDefinitions(content);

      // Shorthand with a local variable doesn't work because "component" is not in the import map
      // The AST parser only tracks imports, not local variable assignments
      expect(results).toHaveLength(0);
    });

    it("should handle shorthand property syntax with imported component", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { component } from "./Widget";

defineReactUI({
  component,
  name: "Shorthand Widget",
});
`;

      const results = await parseReactUIDefinitions(content);

      // When the imported name matches the property name, shorthand works
      expect(results).toHaveLength(1);
      expect(results[0].componentName).toBe("component");
      expect(results[0].importPath).toBe("./Widget");
    });

    it("should handle re-exported components", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { ReExportedWidget } from "./index";

defineReactUI({
  component: ReExportedWidget,
  name: "Re-exported Widget",
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].componentName).toBe("ReExportedWidget");
      expect(results[0].importPath).toBe("./index");
    });

    it("should handle async/await context", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { AsyncWidget } from "./AsyncWidget";

async function setup() {
  const ui = defineReactUI({
    component: AsyncWidget,
    name: "Async Context Widget",
  });
  return ui;
}
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].componentName).toBe("AsyncWidget");
    });

    it("should handle arrow function context", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

const getUI = () => defineReactUI({
  component: Widget,
  name: "Arrow Function Widget",
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Arrow Function Widget");
    });

    it("should handle IIFE context", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

const ui = (() => {
  return defineReactUI({
    component: Widget,
    name: "IIFE Widget",
  });
})();
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("IIFE Widget");
    });

    it("should handle conditional defineReactUI calls", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { WidgetA } from "./WidgetA";
import { WidgetB } from "./WidgetB";

const ui = process.env.USE_A
  ? defineReactUI({ component: WidgetA, name: "Widget A" })
  : defineReactUI({ component: WidgetB, name: "Widget B" });
`;

      const results = await parseReactUIDefinitions(content);

      // Both branches should be found
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.componentName).sort()).toEqual(["WidgetA", "WidgetB"]);
    });

    it("should handle array of defineReactUI calls", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget1 } from "./Widget1";
import { Widget2 } from "./Widget2";
import { Widget3 } from "./Widget3";

const uis = [
  defineReactUI({ component: Widget1, name: "First" }),
  defineReactUI({ component: Widget2, name: "Second" }),
  defineReactUI({ component: Widget3, name: "Third" }),
];
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.name)).toEqual(["First", "Second", "Third"]);
    });

    it("should handle object with multiple defineReactUI values", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { Sidebar } from "./Sidebar";

const layouts = {
  header: defineReactUI({ component: Header, name: "Header Layout" }),
  footer: defineReactUI({ component: Footer, name: "Footer Layout" }),
  sidebar: defineReactUI({ component: Sidebar, name: "Sidebar Layout" }),
};
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.componentName).sort()).toEqual(["Footer", "Header", "Sidebar"]);
    });

    it("should handle empty object argument", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";

defineReactUI({});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(0);
    });

    it("should handle non-object argument", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

defineReactUI(Widget);
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(0);
    });

    it("should handle no arguments", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";

defineReactUI();
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(0);
    });

    it("should handle computed property names (not supported)", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

const componentKey = "component";
defineReactUI({
  [componentKey]: Widget,
  name: "Computed Key Widget",
});
`;

      const results = await parseReactUIDefinitions(content);

      // Computed property names are not supported
      expect(results).toHaveLength(0);
    });

    it("should handle TypeScript generics in imports", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { GenericWidget } from "./GenericWidget";

const ui = defineReactUI({
  component: GenericWidget,
  name: "Generic Widget",
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].componentName).toBe("GenericWidget");
    });

    it("should handle export statements with defineReactUI", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

export const myUI = defineReactUI({
  component: Widget,
  name: "Exported Widget",
});

export default defineReactUI({
  component: Widget,
  name: "Default Exported Widget",
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.name).sort()).toEqual([
        "Default Exported Widget",
        "Exported Widget",
      ]);
    });

    it("should handle class component imports", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { ClassWidget } from "./ClassWidget";

defineReactUI({
  component: ClassWidget,
  name: "Class Component Widget",
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].componentName).toBe("ClassWidget");
    });

    it("should handle path with special characters", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./widgets/@special/my-widget.component";

defineReactUI({
  component: Widget,
  name: "Special Path Widget",
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].importPath).toBe("./widgets/@special/my-widget.component");
    });

    it("should handle absolute imports (node_modules)", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Button } from "@chakra-ui/react";

defineReactUI({
  component: Button,
  name: "Chakra Button",
});
`;

      const results = await parseReactUIDefinitions(content);

      // Absolute imports should be found (filtering happens in resolveComponentPath)
      expect(results).toHaveLength(1);
      expect(results[0].importPath).toBe("@chakra-ui/react");
    });

    it("should handle unicode in name", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

defineReactUI({
  component: Widget,
  name: "ウィジェット 🎉",
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("ウィジェット 🎉");
    });

    it("should handle escaped strings in name", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from "./Widget";

defineReactUI({
  component: Widget,
  name: "Widget with \\"quotes\\" and \\n newline",
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Widget with "quotes" and \n newline');
    });

    it("should handle single-quoted strings", async () => {
      const content = `
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { Widget } from './Widget';

defineReactUI({
  component: Widget,
  name: 'Single Quoted Widget',
});
`;

      const results = await parseReactUIDefinitions(content);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Single Quoted Widget");
    });

    it("should handle malformed TypeScript gracefully", async () => {
      const content = `
import { defineReactUI from "@mcp-apps-kit/ui-react-builder";  // Missing closing brace
import { Widget } from "./Widget";

defineReactUI({
  component: Widget,
  name: "Malformed Widget",
});
`;

      await expect(parseReactUIDefinitions(content)).rejects.toThrow();
    });
  });
});
