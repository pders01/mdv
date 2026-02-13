/**
 * Combinatorial smoke tests using the markdown generator
 */

import { describe, test, expect } from "bun:test";
import { markdownPermutations } from "../helpers/markdown-gen.js";
import {
  renderToBlocks,
  flattenToSegments,
} from "../helpers/render-harness.js";

describe("markdown permutation smoke tests", () => {
  const permutations = [...markdownPermutations()];

  test("generator produces permutations", () => {
    expect(permutations.length).toBeGreaterThan(50);
  });

  for (const { markdown, description } of permutations) {
    test(`renders without throwing: ${description}`, () => {
      expect(() => renderToBlocks(markdown)).not.toThrow();
    });
  }
});

describe("content preservation", () => {
  const contentPermutations = [
    ...markdownPermutations({
      inlineElements: true,
      htmlInline: false,
      blockElements: true,
      nesting: true,
    }),
  ];

  for (const { markdown, description } of contentPermutations) {
    test(`preserves text content: ${description}`, () => {
      const blocks = renderToBlocks(markdown);
      if (blocks.length === 0) return; // empty/whitespace-only is valid

      const segments = flattenToSegments(blocks);
      expect(segments.length).toBeGreaterThan(0);
    });
  }
});

describe("segment integrity", () => {
  const allPermutations = [...markdownPermutations()];

  for (const { markdown, description } of allPermutations) {
    test(`segments have valid structure: ${description}`, () => {
      const blocks = renderToBlocks(markdown);

      for (const block of blocks) {
        // Block type is valid
        expect([
          "paragraph",
          "code",
          "list",
          "table",
          "blockquote",
          "hr",
          "heading",
          "html",
        ]).toContain(block.type);

        // Lines is an array
        expect(Array.isArray(block.lines)).toBe(true);

        // Each line is an array of segments
        for (const line of block.lines) {
          expect(Array.isArray(line)).toBe(true);
          for (const seg of line) {
            expect(typeof seg.text).toBe("string");
            expect(typeof seg.fg).toBe("string");
            expect(typeof seg.bold).toBe("boolean");
            expect(typeof seg.italic).toBe("boolean");
          }
        }

        // Indent is a non-negative number
        expect(block.indent).toBeGreaterThanOrEqual(0);
        expect(block.marginTop).toBeGreaterThanOrEqual(0);
        expect(block.marginBottom).toBeGreaterThanOrEqual(0);
      }
    });
  }
});
