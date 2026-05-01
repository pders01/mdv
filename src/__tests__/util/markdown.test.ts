/**
 * Shared markdown utility tests.
 *
 * walkCodeFences is the convergence point between TUI mermaid pre-pass
 * and any future server pre-pass. Tests focus on the traversal contract:
 * which blocks are yielded, in what order, and through which container
 * tokens recursion happens.
 */

import { describe, test, expect } from "bun:test";
import { walkCodeFences, type CodeBlock } from "../../util/markdown.js";

function collect(content: string): CodeBlock[] {
  const out: CodeBlock[] = [];
  walkCodeFences(content, (b) => out.push(b));
  return out;
}

describe("walkCodeFences", () => {
  test("yields top-level fenced blocks in source order", () => {
    const md = "```ts\nconst x = 1;\n```\n\n```py\nx = 1\n```\n";
    const blocks = collect(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ lang: "ts", text: "const x = 1;" });
    expect(blocks[1]).toEqual({ lang: "py", text: "x = 1" });
  });

  test("yields blocks with empty lang when fence has no language tag", () => {
    const blocks = collect("```\nplain\n```\n");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ lang: "", text: "plain" });
  });

  test("recurses into list items", () => {
    const md = "- item with code\n\n  ```ts\n  inside list\n  ```\n";
    const blocks = collect(md);
    expect(blocks.map((b) => b.text)).toContain("inside list");
  });

  test("recurses into blockquotes", () => {
    const md = "> quote with code\n>\n> ```sh\n> nested\n> ```\n";
    const blocks = collect(md);
    expect(blocks.map((b) => b.text)).toContain("nested");
  });

  test("yields nothing when there are no fences", () => {
    expect(collect("# heading\n\njust prose\n")).toEqual([]);
  });

  test("does not yield inline code spans", () => {
    expect(collect("paragraph with `inline` code\n")).toEqual([]);
  });

  test("preserves source order across nested and top-level blocks", () => {
    const md = "```a\n1\n```\n\n- item\n\n  ```b\n  2\n  ```\n\n```c\n3\n```\n";
    const blocks = collect(md);
    expect(blocks.map((b) => b.lang)).toEqual(["a", "b", "c"]);
  });
});

