import { describe, it, expect } from "bun:test";
import { countTokenLines } from "../../ui/container.js";

describe("countTokenLines", () => {
  it("returns 1 for a single-line block without trailing newline", () => {
    expect(countTokenLines("# Heading")).toBe(1);
  });

  it("treats a trailing single newline as part of the same line", () => {
    expect(countTokenLines("# Heading\n")).toBe(1);
  });

  it("strips trailing blank-line separator (\\n\\n) so it does not inflate line count", () => {
    expect(countTokenLines("# Heading\n\n")).toBe(1);
  });

  it("counts internal newlines for multi-line blocks", () => {
    expect(countTokenLines("- a\n- b\n- c")).toBe(3);
  });

  it("counts multi-line blocks regardless of trailing blank-line separator", () => {
    expect(countTokenLines("- a\n- b\n- c\n")).toBe(3);
    expect(countTokenLines("- a\n- b\n- c\n\n")).toBe(3);
    expect(countTokenLines("- a\n- b\n- c\n\n\n")).toBe(3);
  });

  it("returns 1 for empty input", () => {
    expect(countTokenLines("")).toBe(1);
    expect(countTokenLines("\n")).toBe(1);
    expect(countTokenLines("\n\n")).toBe(1);
  });

  it("handles CJK content the same as ASCII (count is by source lines, not cells)", () => {
    expect(countTokenLines("- 一\n- 二\n- 三\n\n")).toBe(3);
    expect(countTokenLines("- 中文内容 · 更多文本\n- mixed 中文 · text\n\n")).toBe(2);
  });
});
