/**
 * List rendering tests
 */

import { describe, test, expect } from "bun:test";
import { lexer } from "marked";
import type { ListToken } from "../../types.js";

describe("list token parsing", () => {
  test("parses unordered list", () => {
    const tokens = lexer("* Item 1\n* Item 2\n* Item 3");
    const list = tokens.find(t => t.type === "list") as ListToken;

    expect(list).toBeDefined();
    expect(list.ordered).toBe(false);
    expect(list.items.length).toBe(3);
  });

  test("parses ordered list", () => {
    const tokens = lexer("1. First\n2. Second\n3. Third");
    const list = tokens.find(t => t.type === "list") as ListToken;

    expect(list).toBeDefined();
    expect(list.ordered).toBe(true);
    expect(list.items.length).toBe(3);
  });

  test("parses nested unordered list", () => {
    const markdown = `* Level 1
    * Level 2
        * Level 3`;
    const tokens = lexer(markdown);
    const list = tokens.find(t => t.type === "list") as ListToken;

    expect(list).toBeDefined();
    expect(list.items.length).toBe(1);

    // Check for nested list in first item
    const firstItem = list.items[0];
    const nestedList = firstItem.tokens?.find(t => t.type === "list");
    expect(nestedList).toBeDefined();
  });

  test("parses mixed nested lists", () => {
    const markdown = `1. Ordered parent
    * Unordered child
    * Another child`;
    const tokens = lexer(markdown);
    const list = tokens.find(t => t.type === "list") as ListToken;

    expect(list).toBeDefined();
    expect(list.ordered).toBe(true);
  });

  test("handles list items with inline formatting", () => {
    const markdown = `* Item with **bold**
* Item with *italic*
* Item with \`code\``;
    const tokens = lexer(markdown);
    const list = tokens.find(t => t.type === "list") as ListToken;

    expect(list).toBeDefined();
    expect(list.items.length).toBe(3);

    // Check that items have text content
    expect(list.items[0].text).toContain("bold");
    expect(list.items[1].text).toContain("italic");
    expect(list.items[2].text).toContain("code");
  });

  test("handles list items with links", () => {
    const markdown = `* [Link text](http://example.com)
* Another [link](http://test.com)`;
    const tokens = lexer(markdown);
    const list = tokens.find(t => t.type === "list") as ListToken;

    expect(list).toBeDefined();
    expect(list.items.length).toBe(2);
  });
});

describe("nested list fixture parsing", () => {
  const nestedListFixture = `* Level 1 item A
    * Level 2 item A.1
    * Level 2 item A.2
        * Level 3 item A.2.1
        * Level 3 item A.2.2
    * Level 2 item A.3
* Level 1 item B
    * Level 2 item B.1`;

  test("parses all top-level items", () => {
    const tokens = lexer(nestedListFixture);
    const list = tokens.find(t => t.type === "list") as ListToken;

    expect(list).toBeDefined();
    expect(list.items.length).toBe(2);
  });

  test("first item has nested list", () => {
    const tokens = lexer(nestedListFixture);
    const list = tokens.find(t => t.type === "list") as ListToken;
    const firstItem = list.items[0];

    const nestedList = firstItem.tokens?.find(t => t.type === "list") as ListToken;
    expect(nestedList).toBeDefined();
    expect(nestedList.items.length).toBe(3);
  });
});
