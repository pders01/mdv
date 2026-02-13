/**
 * Text utilities tests
 */

import { describe, test, expect } from "bun:test";
import { toSubscript, toSuperscript, decodeHtmlEntities } from "../../rendering/text.js";

describe("toSubscript", () => {
  test("converts digits", () => {
    expect(toSubscript("0123456789")).toBe(
      "\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089",
    );
  });

  test("converts chemical formula H2O", () => {
    expect(toSubscript("2")).toBe("\u2082");
  });

  test("converts supported letters", () => {
    expect(toSubscript("aeo")).toBe("\u2090\u2091\u2092");
  });

  test("preserves unsupported characters", () => {
    expect(toSubscript("abc")).toBe("\u2090bc");
  });

  test("converts math symbols", () => {
    expect(toSubscript("+-=")).toBe("\u208A\u208B\u208C");
  });
});

describe("toSuperscript", () => {
  test("converts digits", () => {
    expect(toSuperscript("0123456789")).toBe(
      "\u2070\u00B9\u00B2\u00B3\u2074\u2075\u2076\u2077\u2078\u2079",
    );
  });

  test("converts E=mc2 exponent", () => {
    expect(toSuperscript("2")).toBe("\u00B2");
  });

  test("converts supported letters", () => {
    expect(toSuperscript("n")).toBe("\u207F");
  });

  test("converts math symbols", () => {
    expect(toSuperscript("+-")).toBe("\u207A\u207B");
  });

  test("handles mixed content", () => {
    const result = toSuperscript("x2");
    expect(result).toBe("\u02E3\u00B2");
  });
});

describe("decodeHtmlEntities", () => {
  test("decodes &lt; to <", () => {
    expect(decodeHtmlEntities("&lt;")).toBe("<");
  });

  test("decodes &gt; to >", () => {
    expect(decodeHtmlEntities("&gt;")).toBe(">");
  });

  test("decodes &amp; to &", () => {
    expect(decodeHtmlEntities("&amp;")).toBe("&");
  });

  test('decodes &quot; to "', () => {
    expect(decodeHtmlEntities("&quot;")).toBe('"');
  });

  test("decodes &#39; to '", () => {
    expect(decodeHtmlEntities("&#39;")).toBe("'");
  });

  test("decodes &nbsp; to space", () => {
    expect(decodeHtmlEntities("&nbsp;")).toBe(" ");
  });

  test("decodes multiple entities in one string", () => {
    expect(decodeHtmlEntities("&lt;div&gt; &amp; &quot;text&quot;")).toBe('<div> & "text"');
  });

  test("preserves normal text", () => {
    expect(decodeHtmlEntities("Hello World")).toBe("Hello World");
  });

  test("handles mixed content", () => {
    expect(decodeHtmlEntities("a &lt; b &amp; c &gt; d")).toBe("a < b & c > d");
  });
});
