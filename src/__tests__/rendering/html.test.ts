/**
 * HTML rendering tests
 */

import { describe, test, expect } from "bun:test";
import { lexer } from "marked";
import { parseHtmlContent, extractHtmlBlockContent } from "../../rendering/html.js";

describe("parseHtmlContent", () => {
  test("parses strong tag", () => {
    const result = parseHtmlContent("<strong>");
    expect(result.bold).toBe(true);
  });

  test("parses closing strong tag", () => {
    const result = parseHtmlContent("</strong>");
    expect(result.bold).toBe(false);
  });

  test("parses em tag", () => {
    const result = parseHtmlContent("<em>");
    expect(result.italic).toBe(true);
  });

  test("parses code tag", () => {
    const result = parseHtmlContent("<code>");
    expect(result.code).toBe(true);
  });

  test("parses link with href", () => {
    const result = parseHtmlContent('<a href="http://example.com">');
    expect(result.link).toBe("http://example.com");
  });

  test("parses h1 tag", () => {
    const result = parseHtmlContent("<h1>");
    expect(result.heading).toBe(1);
  });

  test("parses h6 tag", () => {
    const result = parseHtmlContent("<h6>");
    expect(result.heading).toBe(6);
  });

  test("returns text for non-tag content", () => {
    const result = parseHtmlContent("just text");
    expect(result.text).toBe("just text");
  });
});

describe("extractHtmlBlockContent", () => {
  test("extracts text from simple tag", () => {
    const result = extractHtmlBlockContent("<p>Hello</p>");
    expect(result).toBe("Hello");
  });

  test("strips multiple tags", () => {
    const result = extractHtmlBlockContent("<div><p>Hello</p></div>");
    expect(result).toBe("Hello");
  });

  test("handles nested tags with content", () => {
    const result = extractHtmlBlockContent("<p><strong>Bold</strong> text</p>");
    expect(result).toBe("Bold text");
  });

  test("decodes HTML entities", () => {
    const result = extractHtmlBlockContent("<p>&lt;tag&gt;</p>");
    expect(result).toBe("<tag>");
  });

  test("handles empty content", () => {
    const result = extractHtmlBlockContent("<div></div>");
    expect(result).toBe("");
  });
});

describe("HTML block token parsing", () => {
  test("parses HTML table as block", () => {
    const html = `<table>
    <tr>
        <th>Name</th>
        <th>Value</th>
    </tr>
    <tr>
        <td>Foo</td>
        <td>100</td>
    </tr>
</table>`;
    const tokens = lexer(html);
    const htmlBlock = tokens.find((t) => t.type === "html");
    expect(htmlBlock).toBeDefined();
  });

  test("parses HTML list as block", () => {
    const html = `<ul>
    <li>Item 1</li>
    <li>Item 2</li>
</ul>`;
    const tokens = lexer(html);
    const htmlBlock = tokens.find((t) => t.type === "html");
    expect(htmlBlock).toBeDefined();
  });

  test("parses HTML heading as block", () => {
    const html = `<h1 id="title">Main Title</h1>`;
    const tokens = lexer(html);
    const htmlBlock = tokens.find((t) => t.type === "html");
    expect(htmlBlock).toBeDefined();
  });
});

describe("inline HTML in paragraphs", () => {
  test("parses paragraph with inline strong", () => {
    const markdown = "This has <strong>strong</strong> text inline.";
    const tokens = lexer(markdown);
    const paragraph = tokens.find((t) => t.type === "paragraph") as any;

    expect(paragraph).toBeDefined();
    expect(paragraph.tokens).toBeDefined();

    const hasHtml = paragraph.tokens.some((t: any) => t.type === "html");
    expect(hasHtml).toBe(true);
  });

  test("parses paragraph with inline link", () => {
    const markdown = 'Click <a href="http://example.com">this link</a> to visit.';
    const tokens = lexer(markdown);
    const paragraph = tokens.find((t) => t.type === "paragraph") as any;

    expect(paragraph).toBeDefined();
    const hasHtml = paragraph.tokens.some((t: any) => t.type === "html");
    expect(hasHtml).toBe(true);
  });

  test("parses paragraph with subscript", () => {
    const markdown = "Water is H<sub>2</sub>O.";
    const tokens = lexer(markdown);
    const paragraph = tokens.find((t) => t.type === "paragraph") as any;

    expect(paragraph).toBeDefined();
    const hasHtml = paragraph.tokens.some((t: any) => t.type === "html");
    expect(hasHtml).toBe(true);
  });

  test("parses paragraph with superscript", () => {
    const markdown = "E = mc<sup>2</sup>.";
    const tokens = lexer(markdown);
    const paragraph = tokens.find((t) => t.type === "paragraph") as any;

    expect(paragraph).toBeDefined();
    const hasHtml = paragraph.tokens.some((t: any) => t.type === "html");
    expect(hasHtml).toBe(true);
  });
});
