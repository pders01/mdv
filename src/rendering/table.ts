/**
 * Markdown table rendering
 */

import { RGBA } from "@opentui/core";
import type { ThemeColors, TableToken, StyledSegment, RenderBlock, TextChunk } from "../types.js";
import {
  calculateColumnWidths,
  padCell,
  buildSeparatorLine,
  truncateCell,
  chooseLayout,
} from "./table-utils.js";
import type { BoxSpec, Spec } from "../render/spec.js";

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
 * Convert styled segments to TextChunks — kept pure so tableToSpec can
 * build TextSpec children without touching OpenTUI.
 */
function segmentsToChunks(segments: StyledSegment[]): TextChunk[] {
  return segments.map((seg) => ({
    __isChunk: true,
    text: seg.text,
    fg: seg.fg ? RGBA.fromHex(seg.fg) : undefined,
    bold: seg.bold || undefined,
    italic: seg.italic || undefined,
  }));
}

/**
 * Build a pure Spec for a table. One column-flex BoxSpec wrapping:
 *   - header TextSpec
 *   - separator TextSpec
 *   - one TextSpec per data row
 * Each row is a single TextSpec so cell alignment is owned by string
 * padding (cellWidth-aware), not by Yoga flex which can add inter-cell
 * gaps. `contentWidth` constrains column-width math; supply
 * `renderer.width - 2` when calling from the dispatcher.
 */
export function tableToSpec(
  colors: ThemeColors,
  token: TableToken,
  contentWidth: number,
): BoxSpec {
  const headerCells = token.header.map((h) => h.text);
  const dataCells = token.rows.map((row) => row.map((cell) => cell.text));
  const allRows = [headerCells, ...dataCells];
  const colCount = token.header.length;

  const availableWidth = Math.max(20, contentWidth);
  const layout = chooseLayout(allRows, availableWidth);
  const colWidths = calculateColumnWidths(allRows, availableWidth, layout);
  const paddedWidths = colWidths.map((w) => w + layout.cellPadding);

  const rowToSegments = (cells: string[], headerRow: boolean): StyledSegment[] => {
    const segs: StyledSegment[] = [
      { text: layout.leftBorder, fg: colors.gray, bold: false, italic: false },
    ];
    for (let i = 0; i < colCount; i++) {
      const align = token.align?.[i] || "left";
      const cell = i < cells.length ? cells[i]! : "";
      const text = padCell(truncateCell(cell, colWidths[i]!), paddedWidths[i]!, align);
      segs.push({
        text,
        fg: headerRow ? colors.cyan : colors.fg,
        bold: headerRow,
        italic: false,
      });
      if (i < colCount - 1) {
        segs.push({ text: layout.innerSep, fg: colors.gray, bold: false, italic: false });
      }
    }
    segs.push({ text: layout.rightBorder, fg: colors.gray, bold: false, italic: false });
    return segs;
  };

  const children: Spec[] = [
    { kind: "text", chunks: segmentsToChunks(rowToSegments(headerCells, true)), source: null },
    {
      kind: "text",
      chunks: [
        {
          __isChunk: true,
          text: buildSeparatorLine(paddedWidths, layout),
          fg: RGBA.fromHex(colors.gray),
        },
      ],
      source: null,
    },
  ];

  for (const row of token.rows) {
    const segs = rowToSegments(row.map((c) => c.text), false);
    children.push({ kind: "text", chunks: segmentsToChunks(segs), source: null });
  }

  return {
    kind: "box",
    block: "table",
    flexDirection: "column",
    marginTop: 1,
    marginBottom: 1,
    source: null,
    children,
  };
}

