/**
 * Test utilities for character-level rendering assertions
 */

import { expect } from "bun:test";
import type { ThemeColors, RenderBlock, StyledSegment } from "../../types.js";
import { renderMarkdownToBlocks } from "../../rendering/segments.js";

/**
 * Deterministic test theme colors (no Shiki dependency)
 */
export const TEST_COLORS: ThemeColors = {
  fg: "#e1e4e8",
  bg: "#24292e",
  link: "#79b8ff",
  red: "#f97583",
  orange: "#ffab70",
  yellow: "#ffea7f",
  green: "#85e89d",
  cyan: "#79dafa",
  blue: "#2188ff",
  purple: "#b392f0",
  gray: "#6a737d",
  codeBg: "#1d1f21",
};

/**
 * Render markdown to RenderBlocks using test colors
 */
export function renderToBlocks(markdown: string, colors: ThemeColors = TEST_COLORS): RenderBlock[] {
  return renderMarkdownToBlocks(markdown, colors);
}

/**
 * Flatten all blocks into a single text string (for content preservation checks)
 */
export function flattenToText(blocks: RenderBlock[]): string {
  return blocks
    .flatMap((block) =>
      block.lines.map((line) => line.map((seg) => seg.text).join("")),
    )
    .join("\n");
}

/**
 * Get all segments with their styles from all blocks
 */
export function flattenToSegments(blocks: RenderBlock[]): StyledSegment[] {
  return blocks.flatMap((block) => block.lines.flatMap((line) => line));
}

/**
 * Assert that a segment with the given text exists and has the expected style properties
 */
export function expectSegment(
  segments: StyledSegment[],
  text: string,
  style?: Partial<{ fg: string; bold: boolean; italic: boolean }>,
): void {
  const found = segments.find((s) => s.text.includes(text));
  expect(found).toBeDefined();

  if (style && found) {
    if (style.fg !== undefined) expect(found.fg).toBe(style.fg);
    if (style.bold !== undefined) expect(found.bold).toBe(style.bold);
    if (style.italic !== undefined) expect(found.italic).toBe(style.italic);
  }
}

/**
 * Assert the flattened text of blocks contains the expected string
 */
export function expectText(blocks: RenderBlock[], expected: string): void {
  const text = flattenToText(blocks);
  expect(text).toContain(expected);
}

/**
 * Pretty-print segments for debugging (shows text + color + style annotations)
 */
export function debugSegments(segments: StyledSegment[]): string {
  return segments
    .map((seg) => {
      const styles: string[] = [];
      if (seg.bold) styles.push("bold");
      if (seg.italic) styles.push("italic");
      const styleStr = styles.length > 0 ? ` ${styles.join(" ")}` : "";
      return `[${seg.fg}${styleStr}]${seg.text}[/]`;
    })
    .join("");
}

/**
 * Serialize blocks to a deterministic, human-readable format for snapshot testing
 */
export function serializeBlocks(blocks: RenderBlock[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    lines.push(`[${block.type}] (indent: ${block.indent}, margin: ${block.marginTop}/${block.marginBottom})`);
    for (const line of block.lines) {
      for (const seg of line) {
        const styles: string[] = [`fg:${seg.fg}`];
        if (seg.bold) styles.push("bold");
        if (seg.italic) styles.push("italic");
        // Escape newlines in text for display
        const displayText = seg.text.replace(/\n/g, "\\n");
        lines.push(`  "${displayText}" {${styles.join(", ")}}`);
      }
    }
  }

  return lines.join("\n");
}
