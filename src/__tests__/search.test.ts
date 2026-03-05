import { describe, test, expect } from "bun:test";
import { SearchManager, stripMarkdownInline } from "../input/search.js";

// =============================================================================
// stripMarkdownInline
// =============================================================================

describe("stripMarkdownInline", () => {
  test("plain text unchanged", () => {
    expect(stripMarkdownInline("hello world")).toBe("hello world");
  });

  test("code block lines unchanged", () => {
    expect(stripMarkdownInline("bun run src/index.ts <file.md>")).toBe(
      "bun run src/index.ts <file.md>",
    );
  });

  test("strips heading markers", () => {
    expect(stripMarkdownInline("## Architecture")).toBe("Architecture");
    expect(stripMarkdownInline("# Title")).toBe("Title");
    expect(stripMarkdownInline("### Deep heading")).toBe("Deep heading");
  });

  test("strips inline code backticks", () => {
    expect(stripMarkdownInline("`index.ts`")).toBe("index.ts");
    expect(stripMarkdownInline("- `index.ts` - Main dispatcher")).toBe(
      "- index.ts - Main dispatcher",
    );
  });

  test("strips markdown links", () => {
    expect(stripMarkdownInline("[text](url)")).toBe("text");
    expect(stripMarkdownInline("[index.ts](src/index.ts)")).toBe("index.ts");
    expect(stripMarkdownInline("see [foo](bar) and [baz](qux)")).toBe("see foo and baz");
  });

  test("strips bold markers (*-based)", () => {
    expect(stripMarkdownInline("**bold text**")).toBe("bold text");
  });

  test("strips italic markers (*-based)", () => {
    expect(stripMarkdownInline("*italic text*")).toBe("italic text");
  });

  test("strips bold+italic markers (*-based)", () => {
    expect(stripMarkdownInline("***bold italic***")).toBe("bold italic");
  });

  test("does NOT strip underscore bold/italic (ambiguous with identifiers)", () => {
    // __tests__ and _private_var should not be mangled
    expect(stripMarkdownInline("__tests__")).toBe("__tests__");
    expect(stripMarkdownInline("_foo_bar_")).toBe("_foo_bar_");
    expect(stripMarkdownInline("src/__tests__/code.test.ts")).toBe("src/__tests__/code.test.ts");
  });

  test("strips strikethrough markers", () => {
    expect(stripMarkdownInline("~~deleted~~")).toBe("deleted");
  });

  test("strips image syntax", () => {
    expect(stripMarkdownInline("![alt text](image.png)")).toBe("alt text");
  });

  test("CLAUDE.md list item with backtick code", () => {
    // This is the actual line from CLAUDE.md
    const raw = "- `index.ts` - Main dispatcher that routes tokens to specialized renderers";
    const stripped = stripMarkdownInline(raw);
    expect(stripped).toBe(
      "- index.ts - Main dispatcher that routes tokens to specialized renderers",
    );
    // "index.ts" should start at col 2 in stripped text
    expect(stripped.indexOf("index.ts")).toBe(2);
  });

  test("CLAUDE.md list item with backtick path", () => {
    const raw = "- `src/index.ts` - Main entry, orchestrates all modules and sets up the TUI";
    const stripped = stripMarkdownInline(raw);
    expect(stripped).toBe(
      "- src/index.ts - Main entry, orchestrates all modules and sets up the TUI",
    );
    expect(stripped.indexOf("index.ts")).toBe(6);
  });

  test("list prefix is preserved", () => {
    // The `- ` prefix should be kept (renderer replaces it with `• ` which is same width)
    const raw = "- `code.ts` - Syntax-highlighted code blocks via Shiki";
    const stripped = stripMarkdownInline(raw);
    expect(stripped.startsWith("- ")).toBe(true);
  });
});

// =============================================================================
// SearchManager.findMatches column positions
// =============================================================================

describe("SearchManager match columns", () => {
  test("plain text match col", () => {
    const search = new SearchManager();
    search.startInput();
    search.appendChar("t");
    search.appendChar("e");
    search.appendChar("s");
    search.appendChar("t");
    search.confirm(["bun test"]);

    expect(search.matchCount).toBe(1);
    expect(search.matches[0]!.col).toBe(4);
    expect(search.matches[0]!.length).toBe(4);
  });

  test("code block line match col", () => {
    const search = new SearchManager();
    search.startInput();
    "index.ts".split("").forEach((c) => search.appendChar(c));
    search.confirm(["bun run src/index.ts <file.md>"]);

    expect(search.matchCount).toBe(1);
    expect(search.matches[0]!.col).toBe(12);
    expect(search.matches[0]!.length).toBe(8);
  });

  test("backtick-wrapped code match col", () => {
    // Raw markdown: - `index.ts` - description
    // Stripped:     - index.ts - description
    // "index.ts" should be at col 2
    const search = new SearchManager();
    search.startInput();
    "index.ts".split("").forEach((c) => search.appendChar(c));
    search.confirm(["- `index.ts` - Main dispatcher"]);

    expect(search.matchCount).toBe(1);
    expect(search.matches[0]!.col).toBe(2);
  });

  test("link text match col", () => {
    // Raw: - [index.ts](src/rendering/index.ts) - description
    // Stripped: - index.ts - description
    // "index.ts" at col 2
    const search = new SearchManager();
    search.startInput();
    "index.ts".split("").forEach((c) => search.appendChar(c));
    search.confirm(["- [index.ts](src/rendering/index.ts) - description"]);

    expect(search.matchCount).toBe(1);
    expect(search.matches[0]!.col).toBe(2);
  });

  test("heading match col", () => {
    // Raw: ## Architecture
    // Stripped: Architecture
    // "Architecture" at col 0
    const search = new SearchManager();
    search.startInput();
    "Arch".split("").forEach((c) => search.appendChar(c));
    search.confirm(["## Architecture"]);

    expect(search.matchCount).toBe(1);
    expect(search.matches[0]!.col).toBe(0);
  });

  test("multiple matches on same line", () => {
    const search = new SearchManager();
    search.startInput();
    "test".split("").forEach((c) => search.appendChar(c));
    search.confirm(["bun test src/__tests__/rendering/code.test.ts"]);

    // Stripped text is same (no markdown to strip)
    // Matches: "test" at col 4, "test" at col 18, "test" at col 37
    expect(search.matchCount).toBe(3);
    expect(search.matches[0]!.col).toBe(4);
    // Verify all matches are at valid positions
    const line = "bun test src/__tests__/rendering/code.test.ts";
    for (const m of search.matches) {
      expect(line.substring(m.col, m.col + m.length).toLowerCase()).toBe("test");
    }
  });

  test("case insensitive search", () => {
    const search = new SearchManager();
    search.startInput();
    "claude".split("").forEach((c) => search.appendChar(c));
    search.confirm(["CLAUDE.md"]);

    expect(search.matchCount).toBe(1);
    expect(search.matches[0]!.col).toBe(0);
    expect(search.matches[0]!.length).toBe(6);
  });
});

// =============================================================================
// SearchManager navigation
// =============================================================================

describe("SearchManager navigation", () => {
  test("nextMatch wraps around", () => {
    const search = new SearchManager();
    search.startInput();
    "foo".split("").forEach((c) => search.appendChar(c));
    search.confirm(["foo", "bar", "foo"]);

    expect(search.matchCount).toBe(2);

    // From line 0, next should be line 2
    expect(search.nextMatch(0)).toBe(2);
    // From line 2, next should wrap to line 0
    expect(search.nextMatch(2)).toBe(0);
  });

  test("prevMatch wraps around", () => {
    const search = new SearchManager();
    search.startInput();
    "foo".split("").forEach((c) => search.appendChar(c));
    search.confirm(["foo", "bar", "foo"]);

    // From line 2, prev should be line 0
    expect(search.prevMatch(2)).toBe(0);
    // From line 0, prev should wrap to line 2
    expect(search.prevMatch(0)).toBe(2);
  });

  test("firstMatchFrom finds match at current line", () => {
    const search = new SearchManager();
    search.startInput();
    "foo".split("").forEach((c) => search.appendChar(c));
    search.confirm(["bar", "foo", "baz"]);

    expect(search.firstMatchFrom(1)).toBe(1);
    expect(search.firstMatchFrom(0)).toBe(1);
    expect(search.firstMatchFrom(2)).toBe(1); // wraps
  });

  test("clear resets all state", () => {
    const search = new SearchManager();
    search.startInput();
    "foo".split("").forEach((c) => search.appendChar(c));
    search.confirm(["foo bar foo"]);

    expect(search.matchCount).toBe(2);
    search.clear();
    expect(search.matchCount).toBe(0);
    expect(search.pattern).toBe("");
    expect(search.isInputActive).toBe(false);
  });
});
