/**
 * Shared table rendering utilities
 */

/**
 * Minimum column width (enough for truncation ellipsis)
 */
const MIN_COL_WIDTH = 3;

/**
 * Calculate column widths from a 2D array of cell strings.
 * When availableWidth is provided, proportionally shrinks columns to fit.
 */
export function calculateColumnWidths(rows: string[][], availableWidth?: number): number[] {
  if (rows.length === 0) {
    return [];
  }

  const colCount = Math.max(...rows.map((r) => r.length));
  if (colCount <= 0) {
    return [];
  }

  const colWidths: number[] = Array(colCount).fill(0);

  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      colWidths[i] = Math.max(colWidths[i], row[i].length);
    }
  }

  if (availableWidth === undefined) {
    return colWidths;
  }

  // Calculate total table width: "│ " + columns with padding + inner borders + " │"
  // Overhead: 2 (left border) + (colCount - 1) * 2 (inner borders) + 2 (right border)
  const borderOverhead = 2 + (colCount - 1) * 2 + 2;
  const paddingOverhead = colCount * CELL_PADDING;
  const totalNatural = colWidths.reduce((s, w) => s + w, 0) + paddingOverhead + borderOverhead;

  if (totalNatural <= availableWidth) {
    return colWidths;
  }

  // Budget available for content (excluding borders and padding)
  const contentBudget = Math.max(
    colCount * MIN_COL_WIDTH,
    availableWidth - borderOverhead - paddingOverhead,
  );
  const totalContent = colWidths.reduce((s, w) => s + w, 0);

  // Proportionally shrink each column
  for (let i = 0; i < colCount; i++) {
    colWidths[i] = Math.max(
      MIN_COL_WIDTH,
      Math.floor((colWidths[i] / totalContent) * contentBudget),
    );
  }

  return colWidths;
}

/**
 * Pad cell content to specified width with alignment
 */
export function padCell(text: string, width: number, align: string | null = "left"): string {
  const padding = width - text.length;
  if (padding <= 0) return text;

  if (align === "center") {
    const left = Math.floor(padding / 2);
    const right = padding - left;
    return " ".repeat(left) + text + " ".repeat(right);
  } else if (align === "right") {
    return " ".repeat(padding) + text;
  }

  return text + " ".repeat(padding);
}

/**
 * Build separator line for table
 */
export function buildSeparatorLine(paddedWidths: number[]): string {
  const parts: string[] = ["\u251C"];

  for (let i = 0; i < paddedWidths.length; i++) {
    parts.push("\u2500".repeat(paddedWidths[i] + 1));
    if (i < paddedWidths.length - 1) {
      parts.push("\u253C");
    }
  }

  parts.push("\u2500\u2524");
  return parts.join("");
}

/**
 * Default cell padding value
 */
export const CELL_PADDING = 2;

/**
 * Truncate cell text to maxWidth, adding ellipsis if needed
 */
export function truncateCell(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 1) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + "\u2026";
}
