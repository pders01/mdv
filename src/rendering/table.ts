/**
 * Markdown table rendering
 */

import {
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type CliRenderer,
} from "@opentui/core";
import type { ThemeColors, TableToken } from "../types.js";

/**
 * Render table with proper formatting
 */
export function renderTable(
  renderer: CliRenderer,
  colors: ThemeColors,
  token: TableToken
): BoxRenderable {
  const wrapper = new BoxRenderable(renderer, {
    marginTop: 1,
    marginBottom: 1,
    flexDirection: "column",
  });

  // Calculate column widths based on content
  const colCount = token.header.length;
  const colWidths: number[] = [];

  // Initialize with header widths
  for (let i = 0; i < colCount; i++) {
    colWidths[i] = token.header[i].text.length;
  }

  // Update with row widths
  for (const row of token.rows) {
    for (let i = 0; i < row.length && i < colCount; i++) {
      colWidths[i] = Math.max(colWidths[i], row[i].text.length);
    }
  }

  // Add padding
  const cellPadding = 2;
  const paddedWidths = colWidths.map(w => w + cellPadding);

  // Helper to pad cell content
  const padCell = (text: string, width: number, align: string | null = "left"): string => {
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
  };

  // Render header row
  const headerRow = new BoxRenderable(renderer, {
    flexDirection: "row",
  });

  headerRow.add(new TextRenderable(renderer, {
    content: "\u2502 ",
    fg: colors.gray,
  }));

  for (let i = 0; i < colCount; i++) {
    const align = token.align?.[i] || "left";
    const cellText = padCell(token.header[i].text, paddedWidths[i], align);

    headerRow.add(new TextRenderable(renderer, {
      content: cellText,
      fg: colors.cyan,
      attributes: TextAttributes.BOLD,
    }));

    if (i < colCount - 1) {
      headerRow.add(new TextRenderable(renderer, {
        content: "\u2502 ",
        fg: colors.gray,
      }));
    }
  }

  headerRow.add(new TextRenderable(renderer, {
    content: " \u2502",
    fg: colors.gray,
  }));

  wrapper.add(headerRow);

  // Render separator row
  const separatorParts: string[] = [];
  separatorParts.push("\u251C");
  for (let i = 0; i < colCount; i++) {
    separatorParts.push("\u2500".repeat(paddedWidths[i] + 1));
    if (i < colCount - 1) {
      separatorParts.push("\u253C");
    }
  }
  separatorParts.push("\u2500\u2524");

  const separatorRow = new BoxRenderable(renderer, {
    flexDirection: "row",
  });
  separatorRow.add(new TextRenderable(renderer, {
    content: separatorParts.join(""),
    fg: colors.gray,
  }));
  wrapper.add(separatorRow);

  // Render data rows
  for (const row of token.rows) {
    const dataRow = new BoxRenderable(renderer, {
      flexDirection: "row",
    });

    dataRow.add(new TextRenderable(renderer, {
      content: "\u2502 ",
      fg: colors.gray,
    }));

    for (let i = 0; i < colCount; i++) {
      const align = token.align?.[i] || "left";
      const cellContent = i < row.length ? row[i].text : "";
      const cellText = padCell(cellContent, paddedWidths[i], align);

      dataRow.add(new TextRenderable(renderer, {
        content: cellText,
        fg: colors.fg,
      }));

      if (i < colCount - 1) {
        dataRow.add(new TextRenderable(renderer, {
          content: "\u2502 ",
          fg: colors.gray,
        }));
      }
    }

    dataRow.add(new TextRenderable(renderer, {
      content: " \u2502",
      fg: colors.gray,
    }));

    wrapper.add(dataRow);
  }

  return wrapper;
}
