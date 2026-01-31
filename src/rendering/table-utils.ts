/**
 * Shared table rendering utilities
 */

/**
 * Calculate column widths from a 2D array of cell strings
 */
export function calculateColumnWidths(rows: string[][]): number[] {
  const colCount = Math.max(...rows.map(r => r.length));
  const colWidths: number[] = Array(colCount).fill(0);

  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      colWidths[i] = Math.max(colWidths[i], row[i].length);
    }
  }

  return colWidths;
}

/**
 * Pad cell content to specified width with alignment
 */
export function padCell(
  text: string,
  width: number,
  align: string | null = "left"
): string {
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
