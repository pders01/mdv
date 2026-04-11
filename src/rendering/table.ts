/**
 * Markdown table rendering
 */

import { BoxRenderable, TextRenderable, StyledText, RGBA, type CliRenderer } from "@opentui/core";
import type { ThemeColors, TableToken, StyledSegment, RenderBlock, TextChunk } from "../types.js";
import {
  calculateColumnWidths,
  padCell,
  buildSeparatorLine,
  truncateCell,
  chooseLayout,
} from "./table-utils.js";

/**
 * Convert a table token to a RenderBlock (pure function, no OpenTUI dependency)
 */
export function tableToBlock(
  colors: ThemeColors,
  token: TableToken,
  availableWidth?: number,
): RenderBlock {
  const headerCells = token.header.map((h) => h.text);
  const dataCells = token.rows.map((row) => row.map((cell) => cell.text));
  const allRows = [headerCells, ...dataCells];
  const colCount = token.header.length;

  const layout = chooseLayout(allRows, availableWidth);
  const colWidths = calculateColumnWidths(allRows, availableWidth, layout);
  const paddedWidths = colWidths.map((w) => w + layout.cellPadding);

  const lines: StyledSegment[][] = [];

  // Header row. i < colCount === token.header.length === colWidths.length,
  // so indexed access is always defined.
  const headerLine: StyledSegment[] = [
    { text: layout.leftBorder, fg: colors.gray, bold: false, italic: false },
  ];
  for (let i = 0; i < colCount; i++) {
    const align = token.align?.[i] || "left";
    const cellText = padCell(
      truncateCell(token.header[i]!.text, colWidths[i]!),
      paddedWidths[i]!,
      align,
    );
    headerLine.push({ text: cellText, fg: colors.cyan, bold: true, italic: false });
    if (i < colCount - 1) {
      headerLine.push({ text: layout.innerSep, fg: colors.gray, bold: false, italic: false });
    }
  }
  headerLine.push({ text: layout.rightBorder, fg: colors.gray, bold: false, italic: false });
  lines.push(headerLine);

  // Separator row
  lines.push([
    { text: buildSeparatorLine(paddedWidths, layout), fg: colors.gray, bold: false, italic: false },
  ]);

  // Data rows
  for (const row of token.rows) {
    const dataLine: StyledSegment[] = [
      { text: layout.leftBorder, fg: colors.gray, bold: false, italic: false },
    ];
    for (let i = 0; i < colCount; i++) {
      const align = token.align?.[i] || "left";
      const cellContent = i < row.length ? row[i]!.text : "";
      const cellText = padCell(truncateCell(cellContent, colWidths[i]!), paddedWidths[i]!, align);
      dataLine.push({ text: cellText, fg: colors.fg, bold: false, italic: false });
      if (i < colCount - 1) {
        dataLine.push({ text: layout.innerSep, fg: colors.gray, bold: false, italic: false });
      }
    }
    dataLine.push({ text: layout.rightBorder, fg: colors.gray, bold: false, italic: false });
    lines.push(dataLine);
  }

  return {
    type: "table",
    lines,
    indent: 0,
    marginTop: 1,
    marginBottom: 1,
  };
}

/**
 * Build a StyledText row from segments — renders as a single TextRenderable
 * to avoid Yoga flex layout adding extra space between cells.
 */
function segmentsToStyledText(segments: StyledSegment[]): StyledText {
  const chunks: TextChunk[] = segments.map((seg) => ({
    __isChunk: true,
    text: seg.text,
    fg: seg.fg ? RGBA.fromHex(seg.fg) : undefined,
    bold: seg.bold || undefined,
    italic: seg.italic || undefined,
  }));
  return new StyledText(chunks as any);
}

/**
 * Render table with proper formatting.
 * Each row is a single StyledText TextRenderable to ensure exact character-width
 * alignment (Yoga flex rows can add spacing between children).
 */
export function renderTable(
  renderer: CliRenderer,
  colors: ThemeColors,
  token: TableToken,
  contentWidth?: number,
): BoxRenderable {
  const wrapper = new BoxRenderable(renderer, {
    marginTop: 1,
    marginBottom: 1,
    flexDirection: "column",
  });

  // Convert token data to string arrays for shared utility
  const headerCells = token.header.map((h) => h.text);
  const dataCells = token.rows.map((row) => row.map((cell) => cell.text));
  const allRows = [headerCells, ...dataCells];
  const colCount = token.header.length;

  // Calculate column widths, constrained to available content width
  const availableWidth = Math.max(20, contentWidth ?? renderer.width - 2);
  const layout = chooseLayout(allRows, availableWidth);
  const colWidths = calculateColumnWidths(allRows, availableWidth, layout);
  const paddedWidths = colWidths.map((w) => w + layout.cellPadding);

  // Render header row as single StyledText. Same bounds guarantees as above.
  const headerSegs: StyledSegment[] = [
    { text: layout.leftBorder, fg: colors.gray, bold: false, italic: false },
  ];
  for (let i = 0; i < colCount; i++) {
    const align = token.align?.[i] || "left";
    const cellText = padCell(
      truncateCell(token.header[i]!.text, colWidths[i]!),
      paddedWidths[i]!,
      align,
    );
    headerSegs.push({ text: cellText, fg: colors.cyan, bold: true, italic: false });
    if (i < colCount - 1) {
      headerSegs.push({ text: layout.innerSep, fg: colors.gray, bold: false, italic: false });
    }
  }
  headerSegs.push({ text: layout.rightBorder, fg: colors.gray, bold: false, italic: false });

  wrapper.add(
    new TextRenderable(renderer, { content: segmentsToStyledText(headerSegs) }),
  );

  // Render separator row
  wrapper.add(
    new TextRenderable(renderer, {
      content: buildSeparatorLine(paddedWidths, layout),
      fg: colors.gray,
    }),
  );

  // Render data rows as single StyledText each
  for (const row of token.rows) {
    const dataSegs: StyledSegment[] = [
      { text: layout.leftBorder, fg: colors.gray, bold: false, italic: false },
    ];
    for (let i = 0; i < colCount; i++) {
      const align = token.align?.[i] || "left";
      const cellContent = i < row.length ? row[i]!.text : "";
      const cellText = padCell(truncateCell(cellContent, colWidths[i]!), paddedWidths[i]!, align);
      dataSegs.push({ text: cellText, fg: colors.fg, bold: false, italic: false });
      if (i < colCount - 1) {
        dataSegs.push({ text: layout.innerSep, fg: colors.gray, bold: false, italic: false });
      }
    }
    dataSegs.push({ text: layout.rightBorder, fg: colors.gray, bold: false, italic: false });

    wrapper.add(
      new TextRenderable(renderer, { content: segmentsToStyledText(dataSegs) }),
    );
  }

  return wrapper;
}
