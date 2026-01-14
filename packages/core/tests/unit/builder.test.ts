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
});
