/**
 * HTML parsing and rendering utilities
 */

import { RGBA } from "@opentui/core";
import type { ThemeColors, StyledSegment, RenderBlock, TextChunk } from "../types.js";
import { decodeHtmlEntities } from "./text.js";
import { calculateColumnWidths, padCell, buildSeparatorLine, CELL_PADDING } from "./table-utils.js";
import type { BoxSpec, TextSpec, Spec } from "../render/spec.js";

// =============================================================================
// HTML Parsing
// =============================================================================

/**
 * Parse HTML and extract text content with basic styling
 */
export function parseHtmlContent(html: string): {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  heading?: number;
  link?: string;
} {
  const tagMatch = html.match(/^<(\/?)([\w-]+)([^>]*)>/);
  if (!tagMatch) return { text: html };

  // Regex has 3 capture groups; on match, all three are strings.
  const isClosing = tagMatch[1]!;
  const tag = tagMatch[2]!.toLowerCase();

  // Extract href for links
  const hrefMatch = html.match(/href=["']([^"']+)["']/);
  const href = hrefMatch ? hrefMatch[1] : undefined;

  // Determine styling based on tag
  if (tag === "strong" || tag === "b") return { text: "", bold: !isClosing };
  if (tag === "em" || tag === "i") return { text: "", italic: !isClosing };
  if (tag === "code") return { text: "", code: !isClosing };
  if (tag === "a") return { text: "", link: isClosing ? undefined : href };
  if (tag.match(/^h[1-6]$/)) {
    const level = parseInt(tag[1]!);
    return { text: "", heading: isClosing ? undefined : level };
  }

  return { text: "" };
}

/**
 * Extract text content from HTML block
 */
export function extractHtmlBlockContent(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, "")).trim();
}

// =============================================================================
// HTML Block Segment Extraction (Pure Functions)
// =============================================================================

/**
 * Heading color palette
 */
const HEADING_COLORS = (colors: ThemeColors) => [
  colors.red, // h1
  colors.orange, // h2
  colors.yellow, // h3
  colors.green, // h4
  colors.cyan, // h5
  colors.purple, // h6
];

/**
 * Convert an HTML table to a RenderBlock (pure function)
 */
export function htmlTableToBlock(colors: ThemeColors, html: string): RenderBlock {
  const rows: string[][] = [];
  const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1]!;
    const cells: string[] = [];
    const cellMatches = rowHtml.matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi);
    for (const cellMatch of cellMatches) {
      cells.push(extractHtmlBlockContent(cellMatch[2]!));
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  if (rows.length === 0) {
    return { type: "html", lines: [], indent: 0, marginTop: 1, marginBottom: 1 };
  }

  const colWidths = calculateColumnWidths(rows);
  const paddedWidths = colWidths.map((w) => w + CELL_PADDING);
  const colCount = colWidths.length;

  const lines: StyledSegment[][] = [];

  // Header row
  const headerLine: StyledSegment[] = [
    { text: "\u2502 ", fg: colors.gray, bold: false, italic: false },
  ];
  for (let i = 0; i < colCount; i++) {
    headerLine.push({
      text: padCell(rows[0]![i] || "", paddedWidths[i]!),
      fg: colors.cyan,
      bold: true,
      italic: false,
    });
    if (i < colCount - 1) {
      headerLine.push({ text: "\u2502 ", fg: colors.gray, bold: false, italic: false });
    }
  }
  headerLine.push({ text: " \u2502", fg: colors.gray, bold: false, italic: false });
  lines.push(headerLine);

  // Separator
  lines.push([
    { text: buildSeparatorLine(paddedWidths), fg: colors.gray, bold: false, italic: false },
  ]);

  // Data rows
  for (let r = 1; r < rows.length; r++) {
    const dataLine: StyledSegment[] = [
      { text: "\u2502 ", fg: colors.gray, bold: false, italic: false },
    ];
    for (let i = 0; i < colCount; i++) {
      dataLine.push({
        text: padCell(rows[r]![i] || "", paddedWidths[i]!),
        fg: colors.fg,
        bold: false,
        italic: false,
      });
      if (i < colCount - 1) {
        dataLine.push({ text: "\u2502 ", fg: colors.gray, bold: false, italic: false });
      }
    }
    dataLine.push({ text: " \u2502", fg: colors.gray, bold: false, italic: false });
    lines.push(dataLine);
  }

  return { type: "html", lines, indent: 0, marginTop: 1, marginBottom: 1 };
}

/**
 * Convert an HTML list to RenderBlocks (pure function)
 */
export function htmlListToBlocks(colors: ThemeColors, html: string): RenderBlock[] {
  const blocks: RenderBlock[] = [];
  const isOrdered = /<ol/i.test(html);
  const itemMatches = html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);

  let index = 1;
  for (const match of itemMatches) {
    const itemContent = extractHtmlBlockContent(match[1]!);
    const marker = isOrdered ? `${index}.` : "\u2022";
    blocks.push({
      type: "list",
      lines: [
        [
          { text: marker + " ", fg: colors.cyan, bold: false, italic: false },
          { text: itemContent, fg: colors.fg, bold: false, italic: false },
        ],
      ],
      indent: 0,
      marginTop: index === 1 ? 1 : 0,
      marginBottom: 0,
    });
    index++;
  }

  // Set marginBottom on last block
  if (blocks.length > 0) {
    blocks[blocks.length - 1]!.marginBottom = 1;
  }

  return blocks;
}

/**
 * Convert an HTML heading to a RenderBlock (pure function)
 */
export function htmlHeadingToBlock(
  colors: ThemeColors,
  html: string,
  level: number,
): RenderBlock | null {
  const content = extractHtmlBlockContent(html);
  if (!content) return null;

  const headingColors = HEADING_COLORS(colors);

  return {
    type: "heading",
    lines: [
      [{ text: content, fg: headingColors[level - 1] || colors.blue, bold: true, italic: false }],
    ],
    indent: 0,
    marginTop: level === 1 ? 1 : 0,
    marginBottom: 1,
  };
}

/**
 * Convert an HTML block to RenderBlock(s) (pure function)
 */
export function htmlBlockToBlocks(colors: ThemeColors, html: string): RenderBlock[] {
  if (/<table/i.test(html)) {
    return [htmlTableToBlock(colors, html)];
  }

  if (/<ul|<ol/i.test(html)) {
    return htmlListToBlocks(colors, html);
  }

  const headingMatch = html.match(/<h([1-6])[^>]*>/i);
  if (headingMatch) {
    const block = htmlHeadingToBlock(colors, html, parseInt(headingMatch[1]!));
    return block ? [block] : [];
  }

  const content = extractHtmlBlockContent(html);
  if (content) {
    return [
      {
        type: "html",
        lines: [[{ text: content, fg: colors.fg, bold: false, italic: false }]],
        indent: 0,
        marginTop: 0,
        marginBottom: 1,
      },
    ];
  }

  return [];
}

/**
 * Convert a horizontal rule to a RenderBlock (pure function)
 */
export function hrToBlock(colors: ThemeColors, width: number = 80): RenderBlock {
  const lineWidth = Math.max(width - 4, 20);
  const line = "\u2500".repeat(lineWidth);

  return {
    type: "hr",
    lines: [[{ text: line, fg: colors.gray, bold: false, italic: false }]],
    indent: 0,
    marginTop: 1,
    marginBottom: 1,
  };
}

// =============================================================================
// HTML Block Spec Emission
// =============================================================================

function textSpec(text: string, fg: string, bold = false): TextSpec {
  const chunk: TextChunk = {
    __isChunk: true,
    text,
    fg: RGBA.fromHex(fg),
    ...(bold ? { bold: true } : {}),
  };
  return { kind: "text", chunks: [chunk], source: null };
}

function htmlTableToSpec(colors: ThemeColors, html: string): BoxSpec {
  const rows: string[][] = [];
  const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const rowMatch of rowMatches) {
    const cells: string[] = [];
    const cellMatches = rowMatch[1]!.matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi);
    for (const cellMatch of cellMatches) {
      cells.push(extractHtmlBlockContent(cellMatch[2]!));
    }
    if (cells.length > 0) rows.push(cells);
  }

  const wrapper: BoxSpec = {
    kind: "box",
    block: "html",
    flexDirection: "column",
    marginTop: 1,
    marginBottom: 1,
    source: null,
    children: [],
  };
  if (rows.length === 0) return wrapper;

  const paddedWidths = calculateColumnWidths(rows).map((w) => w + CELL_PADDING);
  const colCount = paddedWidths.length;

  const rowSpec = (cells: string[], fg: string, bold: boolean): BoxSpec => {
    const children: Spec[] = [textSpec("│ ", colors.gray)];
    for (let i = 0; i < colCount; i++) {
      children.push(textSpec(padCell(cells[i] || "", paddedWidths[i]!), fg, bold));
      if (i < colCount - 1) children.push(textSpec("│ ", colors.gray));
    }
    children.push(textSpec(" │", colors.gray));
    return { kind: "box", flexDirection: "row", source: null, children };
  };

  wrapper.children.push(rowSpec(rows[0]!, colors.cyan, true));
  wrapper.children.push(textSpec(buildSeparatorLine(paddedWidths), colors.gray));
  for (let r = 1; r < rows.length; r++) {
    wrapper.children.push(rowSpec(rows[r]!, colors.fg, false));
  }
  return wrapper;
}

function htmlListToSpec(colors: ThemeColors, html: string): BoxSpec {
  const isOrdered = /<ol/i.test(html);
  const wrapper: BoxSpec = {
    kind: "box",
    block: "html",
    flexDirection: "column",
    marginTop: 1,
    marginBottom: 1,
    source: null,
    children: [],
  };
  let index = 1;
  for (const match of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const itemContent = extractHtmlBlockContent(match[1]!);
    const marker = isOrdered ? `${index}.` : "•";
    wrapper.children.push({
      kind: "box",
      flexDirection: "row",
      source: null,
      children: [textSpec(marker + " ", colors.cyan), textSpec(itemContent, colors.fg)],
    });
    index++;
  }
  return wrapper;
}

function htmlHeadingToSpec(colors: ThemeColors, html: string, level: number): BoxSpec | null {
  const content = extractHtmlBlockContent(html);
  if (!content) return null;
  const palette = [
    colors.red,
    colors.orange,
    colors.yellow,
    colors.green,
    colors.cyan,
    colors.purple,
  ];
  const fg = palette[level - 1] || colors.blue;
  return {
    kind: "box",
    block: "html",
    marginTop: level === 1 ? 1 : 0,
    marginBottom: 1,
    source: null,
    children: [textSpec(content, fg, true)],
  };
}

/**
 * Build a Spec for an HTML block. Dispatches by tag — table/list/heading
 * paths build structured trees, fallthrough extracts text and wraps it
 * in a margin-bottom box.
 */
export function htmlBlockToSpec(colors: ThemeColors, html: string): BoxSpec | null {
  if (/<table/i.test(html)) return htmlTableToSpec(colors, html);
  if (/<ul|<ol/i.test(html)) return htmlListToSpec(colors, html);
  const headingMatch = html.match(/<h([1-6])[^>]*>/i);
  if (headingMatch) return htmlHeadingToSpec(colors, html, parseInt(headingMatch[1]!));
  const content = extractHtmlBlockContent(html);
  if (!content) return null;
  return {
    kind: "box",
    block: "html",
    marginBottom: 1,
    source: null,
    children: [textSpec(content, colors.fg)],
  };
}

// =============================================================================
// Horizontal Rule
// =============================================================================

/**
 * Build a pure Spec for a horizontal rule.
 *
 * Width comes from the caller's content area, not `renderer.width` — in
 * sidebar mode the content pane is renderer.width minus the sidebar, and
 * a renderer-width rule overflows under the sidebar.
 */
export function hrToSpec(colors: ThemeColors, contentWidth: number): BoxSpec {
  const width = Math.max(contentWidth - 2, 20);
  return {
    kind: "box",
    block: "hr",
    marginTop: 1,
    marginBottom: 1,
    source: null,
    children: [
      {
        kind: "text",
        chunks: [{ __isChunk: true, text: "\u2500".repeat(width), fg: RGBA.fromHex(colors.gray) }],
        source: null,
      },
    ],
  };
}
