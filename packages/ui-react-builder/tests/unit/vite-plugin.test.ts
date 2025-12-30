import { describe, it, expect } from "vitest";
import { toEsbuildImportSpecifier, isPathWithinRoot } from "../../src/vite-plugin";

describe("toEsbuildImportSpecifier", () => {
  it("should normalize Windows backslashes to forward slashes", () => {
    expect(toEsbuildImportSpecifier("C:\\foo\\bar\\Widget.tsx")).toBe("C:/foo/bar/Widget.tsx");
  });

  it("should not prefix POSIX absolute paths", () => {
    expect(toEsbuildImportSpecifier("/Users/alice/project/Widget.tsx")).toBe(
      "/Users/alice/project/Widget.tsx"
    );
  });

  it("should not prefix Windows drive absolute paths", () => {
    expect(toEsbuildImportSpecifier("C:/foo/bar/Widget.tsx")).toBe("C:/foo/bar/Widget.tsx");
  });

  it("should not prefix UNC absolute paths", () => {
    expect(toEsbuildImportSpecifier("\\\\server\\share\\Widget.tsx")).toBe(
      "//server/share/Widget.tsx"
    );
  });

  it("should prefix non-relative, non-absolute specifiers with ./", () => {
    expect(toEsbuildImportSpecifier("src/ui/Widget.tsx")).toBe("./src/ui/Widget.tsx");
  });

  it("should not double-prefix already-relative specifiers", () => {
    expect(toEsbuildImportSpecifier("./src/ui/Widget.tsx")).toBe("./src/ui/Widget.tsx");
    expect(toEsbuildImportSpecifier("../src/ui/Widget.tsx")).toBe("../src/ui/Widget.tsx");
  });
});

describe("isPathWithinRoot", () => {
  it("should treat direct children as within root", () => {
    expect(isPathWithinRoot("/repo", "/repo/src/ui/Widget.tsx")).toBe(true);
  });

  it("should reject paths outside root", () => {
    expect(isPathWithinRoot("/repo", "/etc/passwd")).toBe(false);
    expect(isPathWithinRoot("/repo", "/repo/../etc/passwd")).toBe(false);
  });
});
