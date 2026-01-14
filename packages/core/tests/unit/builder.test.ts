import { describe, it, expect, expectTypeOf } from "vitest";
import { z } from "zod";
import { tool } from "../../src/index";
import type { ToolDef } from "../../src/types/tools";

describe("Tool Builder", () => {
  it("builds a minimal tool", () => {
    const t = tool("greet")
      .describe("Greet")
      .input(z.object({ name: z.string() }))
      .handle(async ({ name }) => ({ message: `Hi ${name}` }))
      .build();

    expect(t.description).toBe("Greet");
    expect(t.input).toBeInstanceOf(z.ZodObject);
    expect(t.handler).toBeDefined();
  });

  it("applies annotations via shortcuts", () => {
    const t = tool("read")
      .describe("Read")
      .input(z.object({}))
      .output(z.object({ data: z.string() }))
      .readOnly()
      .expensive()
      .idempotent()
      .destructive()
      .handle(async () => ({ data: "test" }))
      .build();

    expect(t.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: true,
      idempotentHint: true,
      destructiveHint: true,
    });
  });

  it("applies visibility", () => {
    const t = tool("vis")
      .describe("Visible")
      .input(z.object({}))
      .visibility("model")
      .handle(async () => ({}))
      .build();

    expect(t.visibility).toBe("model");
  });

  it("applies title", () => {
    const t = tool("titled")
      .describe("Described")
      .title("My Title")
      .input(z.object({}))
      .handle(async () => ({}))
      .build();

    expect(t.title).toBe("My Title");
  });

  it("applies UI", () => {
    // String reference (legacy/config key)
    const t1 = tool("ui1")
      .describe("UI 1")
      .input(z.object({}))
      .uiRef("my-ui")
      .handle(async () => ({}))
      .build();
    expect(t1.ui).toBe("my-ui");

    // Path (creates UIDef)
    const t2 = tool("ui2")
      .describe("UI 2")
      .input(z.object({}))
      .ui("widget.html")
      .handle(async () => ({}))
      .build();
    expect(t2.ui).toEqual({ html: "widget.html" });

    // Object definition
    const t3 = tool("ui3")
      .describe("UI 3")
      .input(z.object({}))
      .ui({ html: "<div></div>" })
      .handle(async () => ({}))
      .build();
    expect(t3.ui).toEqual({ html: "<div></div>" });
  });

  it("throws if required steps are missing", () => {
    const builder = tool("bad") as any;
    expect(() => builder.build()).toThrow("Tool requires description");

    builder.describe("desc");
    expect(() => builder.build()).toThrow("Tool requires input schema");

    builder.input(z.object({}));
    expect(() => builder.build()).toThrow("Tool requires handler");
  });

  it("infers types correctly", () => {
    const t = tool("infer")
      .describe("Infer")
      .input(z.object({ val: z.number() }))
      .output(z.object({ str: z.string() }))
      .handle(async ({ val }) => ({ str: String(val) }))
      .build();

    expectTypeOf(t).toMatchTypeOf<ToolDef>();
  });
  it("handles schema normalization", () => {
    // Empty object -> z.object({})
    const t1 = tool("empty")
      .describe("Empty")
      .input({})
      .handle(async () => ({}))
      .build();
    expect(t1.input).toBeInstanceOf(z.ZodObject);
    expect((t1.input as z.ZodObject<any>).shape).toEqual({});

    // Inline shape -> z.object({...})
    const t2 = tool("inline")
      .describe("Inline")
      .input({ name: z.string() })
      .handle(async () => ({}))
      .build();
    expect(t2.input).toBeInstanceOf(z.ZodObject);
    expect((t2.input as z.ZodObject<any>).shape.name).toBeInstanceOf(z.ZodString);
  });

  it("normalizes visibility aliases", () => {
    const t1 = tool("v1")
      .describe("V1")
      .input(z.object({}))
      .visibility("mcp")
      .handle(async () => ({}))
      .build();
    expect(t1.visibility).toBe("app");

    const t2 = tool("v2")
      .describe("V2")
      .input(z.object({}))
      .visibility("chatgpt")
      .handle(async () => ({}))
      .build();
    expect(t2.visibility).toBe("model");
  });

  it("applies optional configuration methods", () => {
    const t = tool("opt")
      .describe("Optional")
      .input(z.object({}))
      .widgetAccessible(true)
      .invokingMessage("invok")
      .invokedMessage("invokD")
      .fileParams(["file1"])
      .handle(async () => ({}))
      .build();

    expect(t.widgetAccessible).toBe(true);
    expect(t.invokingMessage).toBe("invok");
    expect(t.invokedMessage).toBe("invokD");
    expect(t.fileParams).toEqual(["file1"]);
  });

  it("handles UI heuristics and edge cases", () => {
    // "my-layout" -> key (no dot, no slash)
    const t1 = tool("key1")
      .describe("Key 1")
      .input(z.object({}))
      .ui("my-layout")
      .handle(async () => ({}))
      .build();
    expect(t1.ui).toBe("my-layout");

    // "my.ui" -> path because of extension detection
    const t2 = tool("path_ext")
      .describe("Path Ext")
      .input(z.object({}))
      .ui("my.ui")
      .handle(async () => ({}))
      .build();
    expect(t2.ui).toEqual({ html: "my.ui" });

    // "my.ui" enforced as key using uiRef
    const t3 = tool("key_ref")
      .describe("Key Ref")
      .input(z.object({}))
      .uiRef("my.ui")
      .handle(async () => ({}))
      .build();
    expect(t3.ui).toBe("my.ui");

    // "section/widget" -> path because of slash
    const t4 = tool("path_slash")
      .describe("Path Slash")
      .input(z.object({}))
      .ui("section/widget")
      .handle(async () => ({}))
      .build();
    expect(t4.ui).toEqual({ html: "section/widget" });

    // Inline HTML
    const t5 = tool("html")
      .describe("HTML")
      .input(z.object({}))
      .ui("<div></div>")
      .handle(async () => ({}))
      .build();
    expect(t5.ui).toEqual({ html: "<div></div>" });
  });

  it("enforces runtime safety for context", () => {
    const t = tool("safe") as any;

    // Extract method to lose context
    const build = t.build;
    expect(() => build.call({})).toThrow("ToolBuilder method called with invalid context");

    // output
    const output = t.output;
    expect(() => output.call({}, z.object({}))).toThrow(
      "ToolBuilder method called with invalid context"
    );

    // handle
    const handle = t.handle;
    expect(() => handle.call({}, async () => ({}))).toThrow(
      "ToolBuilder method called with invalid context"
    );
  });
});
