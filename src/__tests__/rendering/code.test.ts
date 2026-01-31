/**
 * Code block tests
 */

import { describe, test, expect } from "bun:test";
import { lexer } from "marked";
import { resolveLanguage, langAliases } from "../../highlighting/shiki.js";

describe("code block token parsing", () => {
  test("parses fenced code block", () => {
    const markdown = "```javascript\nconst x = 1;\n```";
    const tokens = lexer(markdown);
    const code = tokens.find(t => t.type === "code") as any;

    expect(code).toBeDefined();
    expect(code.lang).toBe("javascript");
    expect(code.text).toBe("const x = 1;");
  });

  test("parses code block without language", () => {
    const markdown = "```\nplain code\n```";
    const tokens = lexer(markdown);
    const code = tokens.find(t => t.type === "code") as any;

    expect(code).toBeDefined();
    expect(code.lang).toBe("");
    expect(code.text).toBe("plain code");
  });

  test("parses multi-line code block", () => {
    const markdown = "```python\ndef hello():\n    print('hello')\n```";
    const tokens = lexer(markdown);
    const code = tokens.find(t => t.type === "code") as any;

    expect(code).toBeDefined();
    expect(code.lang).toBe("python");
    expect(code.text).toContain("def hello():");
    expect(code.text).toContain("print");
  });

  test("parses indented code block", () => {
    const markdown = "    const x = 1;\n    const y = 2;";
    const tokens = lexer(markdown);
    const code = tokens.find(t => t.type === "code") as any;

    expect(code).toBeDefined();
    expect(code.text).toContain("const x = 1");
  });
});

describe("language aliases", () => {
  test("resolves js to javascript", () => {
    expect(resolveLanguage("js")).toBe("javascript");
  });

  test("resolves ts to typescript", () => {
    expect(resolveLanguage("ts")).toBe("typescript");
  });

  test("resolves py to python", () => {
    expect(resolveLanguage("py")).toBe("python");
  });

  test("resolves rb to ruby", () => {
    expect(resolveLanguage("rb")).toBe("ruby");
  });

  test("resolves rs to rust", () => {
    expect(resolveLanguage("rs")).toBe("rust");
  });

  test("resolves sh to bash", () => {
    expect(resolveLanguage("sh")).toBe("bash");
  });

  test("resolves shell to bash", () => {
    expect(resolveLanguage("shell")).toBe("bash");
  });

  test("resolves yml to yaml", () => {
    expect(resolveLanguage("yml")).toBe("yaml");
  });

  test("normalizes to lowercase", () => {
    expect(resolveLanguage("JavaScript")).toBe("javascript");
    expect(resolveLanguage("PYTHON")).toBe("python");
  });

  test("passes through unknown languages", () => {
    expect(resolveLanguage("haskell")).toBe("haskell");
    expect(resolveLanguage("cobol")).toBe("cobol");
  });
});

describe("langAliases constant", () => {
  test("contains expected aliases", () => {
    expect(langAliases.js).toBe("javascript");
    expect(langAliases.ts).toBe("typescript");
    expect(langAliases.py).toBe("python");
    expect(langAliases.rb).toBe("ruby");
    expect(langAliases.rs).toBe("rust");
    expect(langAliases.sh).toBe("bash");
    expect(langAliases.shell).toBe("bash");
    expect(langAliases.yml).toBe("yaml");
  });
});
