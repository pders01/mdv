/**
 * HTML parsing and rendering utilities
 */

import {
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type CliRenderer,
} from "@opentui/core";
import type { ThemeColors } from "../types.js";
import { decodeHtmlEntities } from "./text.js";
import { calculateColumnWidths, padCell, buildSeparatorLine, CELL_PADDING } from "./table-utils.js";

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

  const [, isClosing, tagName] = tagMatch;
  const tag = tagName.toLowerCase();

  // Extract href for links
  const hrefMatch = html.match(/href=["']([^"']+)["']/);
  const href = hrefMatch ? hrefMatch[1] : undefined;

  // Determine styling based on tag
  if (tag === "strong" || tag === "b") return { text: "", bold: !isClosing };
  if (tag === "em" || tag === "i") return { text: "", italic: !isClosing };
  if (tag === "code") return { text: "", code: !isClosing };
  if (tag === "a") return { text: "", link: isClosing ? undefined : href };
  if (tag.match(/^h[1-6]$/)) {
    const level = parseInt(tag[1]);
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
// HTML Table Rendering
// =============================================================================

/**
 * Parse HTML table and render it
 */
export function renderHtmlTable(
  renderer: CliRenderer,
  colors: ThemeColors,
  html: string
): BoxRenderable {
  const wrapper = new BoxRenderable(renderer, {
    marginTop: 1,
    marginBottom: 1,
    flexDirection: "column",
  });

  // Extract rows
  const rows: string[][] = [];
  const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1];
    const cells: string[] = [];

    // Extract th and td cells
    const cellMatches = rowHtml.matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi);
    for (const cellMatch of cellMatches) {
      cells.push(extractHtmlBlockContent(cellMatch[2]));
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  if (rows.length === 0) {
    return wrapper;
  }

  // Calculate column widths using shared utility
  const colWidths = calculateColumnWidths(rows);
  const paddedWidths = colWidths.map(w => w + CELL_PADDING);
  const colCount = colWidths.length;

  // Render header row (first row)
  const headerRow = new BoxRenderable(renderer, { flexDirection: "row" });
  headerRow.add(new TextRenderable(renderer, { content: "\u2502 ", fg: colors.gray }));

  for (let i = 0; i < colCount; i++) {
    const cellText = padCell(rows[0][i] || "", paddedWidths[i]);
    headerRow.add(new TextRenderable(renderer, {
      content: cellText,
      fg: colors.cyan,
      attributes: TextAttributes.BOLD,
    }));
    if (i < colCount - 1) {
      headerRow.add(new TextRenderable(renderer, { content: "\u2502 ", fg: colors.gray }));
    }
  }
  headerRow.add(new TextRenderable(renderer, { content: " \u2502", fg: colors.gray }));
  wrapper.add(headerRow);

  // Separator using shared utility
  wrapper.add(new TextRenderable(renderer, {
    content: buildSeparatorLine(paddedWidths),
    fg: colors.gray,
  }));

  // Render data rows
  for (let r = 1; r < rows.length; r++) {
    const dataRow = new BoxRenderable(renderer, { flexDirection: "row" });
    dataRow.add(new TextRenderable(renderer, { content: "\u2502 ", fg: colors.gray }));

    for (let i = 0; i < colCount; i++) {
      const cellText = padCell(rows[r][i] || "", paddedWidths[i]);
      dataRow.add(new TextRenderable(renderer, { content: cellText, fg: colors.fg }));
      if (i < colCount - 1) {
        dataRow.add(new TextRenderable(renderer, { content: "\u2502 ", fg: colors.gray }));
      }
    }
    dataRow.add(new TextRenderable(renderer, { content: " \u2502", fg: colors.gray }));
    wrapper.add(dataRow);
  }

  return wrapper;
}

// =============================================================================
// HTML List Rendering
// =============================================================================

/**
 * Parse HTML list (ul/ol) and render it
 */
export function renderHtmlList(
  renderer: CliRenderer,
  colors: ThemeColors,
  html: string
): BoxRenderable {
  const wrapper = new BoxRenderable(renderer, {
    marginTop: 1,
    marginBottom: 1,
    flexDirection: "column",
  });

  const isOrdered = /<ol/i.test(html);
  const itemMatches = html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);

  let index = 1;
  for (const match of itemMatches) {
    const itemContent = extractHtmlBlockContent(match[1]);
    const marker = isOrdered ? `${index}.` : "\u2022";

    const itemRow = new BoxRenderable(renderer, { flexDirection: "row" });
    itemRow.add(new TextRenderable(renderer, {
      content: marker + " ",
      fg: colors.cyan,
    }));
    itemRow.add(new TextRenderable(renderer, {
      content: itemContent,
      fg: colors.fg,
    }));

    wrapper.add(itemRow);
    index++;
  }

  return wrapper;
}

// =============================================================================
// HTML Heading Rendering
// =============================================================================

/**
 * Render HTML heading
 */
export function renderHtmlHeading(
  renderer: CliRenderer,
  colors: ThemeColors,
  html: string,
  level: number
): BoxRenderable | null {
  const content = extractHtmlBlockContent(html);
  if (!content) return null;

  const headingColors = [
    colors.red,    // h1
    colors.orange, // h2
    colors.yellow, // h3
    colors.green,  // h4
    colors.cyan,   // h5
    colors.purple, // h6
  ];

  const wrapper = new BoxRenderable(renderer, {
    marginTop: level === 1 ? 1 : 0,
    marginBottom: 1,
  });

  wrapper.add(new TextRenderable(renderer, {
    content: content,
    fg: headingColors[level - 1] || colors.blue,
    attributes: TextAttributes.BOLD,
  }));

  return wrapper;
}

// =============================================================================
// HTML Block Rendering
// =============================================================================

/**
 * Render HTML block with proper formatting
 */
export function renderHtmlBlock(
  renderer: CliRenderer,
  colors: ThemeColors,
  html: string
): BoxRenderable | null {
  // Check for specific HTML elements
  if (/<table/i.test(html)) {
    return renderHtmlTable(renderer, colors, html);
  }

  if (/<ul|<ol/i.test(html)) {
    return renderHtmlList(renderer, colors, html);
  }

  // Check for headings
  const headingMatch = html.match(/<h([1-6])[^>]*>/i);
  if (headingMatch) {
    return renderHtmlHeading(renderer, colors, html, parseInt(headingMatch[1]));
  }

  // For div/p/details etc., extract and render text content
  const content = extractHtmlBlockContent(html);
  if (content) {
    const wrapper = new BoxRenderable(renderer, { marginBottom: 1 });
    wrapper.add(new TextRenderable(renderer, {
      content: content,
      fg: colors.fg,
    }));
    return wrapper;
  }

  return null;
}

// =============================================================================
// Horizontal Rule
// =============================================================================

/**
 * Render horizontal rule
 */
export function renderHorizontalRule(
  renderer: CliRenderer,
  colors: ThemeColors
): BoxRenderable {
  const width = Math.max(renderer.width - 4, 20);
  const line = "\u2500".repeat(width);

  const wrapper = new BoxRenderable(renderer, {
    marginTop: 1,
    marginBottom: 1,
  });

  wrapper.add(new TextRenderable(renderer, {
    content: line,
    fg: colors.gray,
  }));

  return wrapper;
}
