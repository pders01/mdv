/**
 * Shared table rendering utilities
 */

/**
 * Minimum column width (enough for truncation ellipsis)
 */
const MIN_COL_WIDTH = 3;

/**
 * Threshold below which a column is considered "small" and locked at natural width
 * during responsive shrinking. This prevents short headers like "Status" or "Zip"
 * from being truncated when a neighbouring column dominates the table.
 */
const SMALL_COL_THRESHOLD = 10;

/**
 * Calculate column widths from a 2D array of cell strings.
 * When availableWidth is provided, shrinks columns to fit using a multi-pass
 * algorithm that protects small columns from unnecessary truncation.
 * Uses the provided layout's padding for overhead calculations.
 */
export function calculateColumnWidths(
  rows: string[][],
  availableWidth?: number,
  layout?: TableLayout,
): number[] {
  if (rows.length === 0) {
    return [];
  }

  const colCount = Math.max(...rows.map((r) => r.length));
  if (colCount <= 0) {
    return [];
  }

  const natural: number[] = Array(colCount).fill(0);

  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      natural[i] = Math.max(natural[i]!, row[i]!.length);
    }
  }

  if (availableWidth === undefined) {
    return natural;
  }

  const effectiveLayout = layout ?? NORMAL_LAYOUT;
  const overhead = layoutOverhead(colCount, effectiveLayout);
  const naturalContentWidth = natural.reduce((s, w) => s + w, 0);
  const totalNatural = naturalContentWidth + overhead;

  if (totalNatural <= availableWidth) {
    return natural.slice();
  }

  const contentBudget = Math.max(colCount * MIN_COL_WIDTH, availableWidth - overhead);

  // Multi-pass: lock small columns at natural width, then distribute remainder
  const result: number[] = Array(colCount).fill(0);
  const locked: boolean[] = Array(colCount).fill(false);
  let lockedBudget = 0;
  let shrinkableTotal = 0;

  // Pass 1: lock columns that are already small (≤ threshold) — guarantee at least MIN_COL_WIDTH.
  // natural, result, locked are all sized at colCount, so i < colCount guarantees defined access.
  for (let i = 0; i < colCount; i++) {
    if (natural[i]! <= SMALL_COL_THRESHOLD) {
      result[i] = Math.max(MIN_COL_WIDTH, natural[i]!);
      locked[i] = true;
      lockedBudget += result[i]!;
    } else {
      shrinkableTotal += natural[i]!;
    }
  }

  // Pass 2: proportionally shrink the remaining large columns
  let remainingBudget = contentBudget - lockedBudget;

  // If locking small columns consumed too much, fall back to MIN_COL_WIDTH for everything
  if (remainingBudget < 0) {
    for (let i = 0; i < colCount; i++) {
      result[i] = MIN_COL_WIDTH;
    }
    return result;
  }

  for (let i = 0; i < colCount; i++) {
    if (locked[i]) continue;

    if (shrinkableTotal > 0) {
      result[i] = Math.max(
        MIN_COL_WIDTH,
        Math.floor((natural[i]! / shrinkableTotal) * remainingBudget),
      );
    } else {
      result[i] = MIN_COL_WIDTH;
    }
  }

  // Pass 3: correct for floor-rounding overshoot — trim largest columns first,
  // but never below MIN_COL_WIDTH
  let total = result.reduce((s, w) => s + w, 0);
  while (total > contentBudget) {
    let maxIdx = -1;
    let maxW = MIN_COL_WIDTH;
    for (let i = 0; i < colCount; i++) {
      if (result[i]! > maxW) {
        maxW = result[i]!;
        maxIdx = i;
      }
    }
    if (maxIdx === -1) break; // all at minimum, can't shrink further
    result[maxIdx]!--;
    total--;
  }

  return result;
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
 * Build separator line for table. In compact mode, uses tighter spacing.
 */
export function buildSeparatorLine(
  paddedWidths: number[],
  layout: TableLayout = NORMAL_LAYOUT,
): string {
  const parts: string[] = [layout.sepLeft];
  // In normal mode, each separator segment needs 1 extra char to match the trailing
  // space in "│ " separators. In compact mode, no extra needed.
  const extraPerCol = layout.innerSep.length > 1 ? 1 : 0;

  for (let i = 0; i < paddedWidths.length; i++) {
    parts.push(layout.sepHorizontal.repeat(paddedWidths[i]! + extraPerCol));
    if (i < paddedWidths.length - 1) {
      parts.push(layout.sepCross);
    }
  }

  parts.push(extraPerCol ? layout.sepHorizontal + layout.sepRight : layout.sepRight);
  return parts.join("");
}

/**
 * Default cell padding value (used when there's enough room)
 */
export const CELL_PADDING = 2;

/**
 * Table layout parameters that adapt to available width.
 * Compact mode kicks in when normal padding would cause overflow.
 */
export interface TableLayout {
  cellPadding: number;
  /** Characters for inner column separator (e.g. "│ " normal, "│" compact) */
  innerSep: string;
  /** Characters for left border */
  leftBorder: string;
  /** Characters for right border */
  rightBorder: string;
  /** Separator line characters */
  sepLeft: string;
  sepRight: string;
  sepCross: string;
  sepHorizontal: string;
}

const NORMAL_LAYOUT: TableLayout = {
  cellPadding: 2,
  innerSep: "| ",
  leftBorder: "| ",
  rightBorder: " |",
  sepLeft: "|",
  sepRight: "|",
  sepCross: "|",
  sepHorizontal: "-",
};

const COMPACT_LAYOUT: TableLayout = {
  cellPadding: 1,
  innerSep: "|",
  leftBorder: "|",
  rightBorder: "|",
  sepLeft: "|",
  sepRight: "|",
  sepCross: "+",
  sepHorizontal: "-",
};

/**
 * Compute the fixed overhead in characters (borders + separators + padding).
 */
export function layoutOverhead(colCount: number, layout: TableLayout): number {
  return (
    layout.leftBorder.length +
    layout.rightBorder.length +
    (colCount - 1) * layout.innerSep.length +
    colCount * layout.cellPadding
  );
}

/**
 * Choose the best layout for the given column count and available width.
 * Tries normal layout with column shrinking first; only falls back to compact
 * if the shrunk normal layout still overflows.
 */
export function chooseLayout(rows: string[][], availableWidth?: number): TableLayout {
  if (availableWidth === undefined) return NORMAL_LAYOUT;

  const colCount = Math.max(...rows.map((r) => r.length));
  if (colCount <= 0) return NORMAL_LAYOUT;

  // Try normal layout: compute shrunk widths and check if they fit
  const normalWidths = calculateColumnWidths(rows, availableWidth, NORMAL_LAYOUT);
  const normalTotal =
    normalWidths.reduce((s, w) => s + w, 0) + layoutOverhead(colCount, NORMAL_LAYOUT);

  if (normalTotal <= availableWidth) return NORMAL_LAYOUT;

  return COMPACT_LAYOUT;
}

/**
 * Truncate cell text to maxWidth, adding ellipsis if needed
 */
export function truncateCell(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 1) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + "\u2026";
}
