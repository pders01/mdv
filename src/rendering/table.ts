/**
 * Markdown table rendering
 */

import { BoxRenderable, TextRenderable, TextAttributes, type CliRenderer } from "@opentui/core";
import type { ThemeColors, TableToken } from "../types.js";
import { calculateColumnWidths, padCell, buildSeparatorLine, CELL_PADDING } from "./table-utils.js";

/**
 * Render table with proper formatting
 */
export function renderTable(
  renderer: CliRenderer,
  colors: ThemeColors,
  token: TableToken,
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

  // Calculate column widths and add padding
  const colWidths = calculateColumnWidths(allRows);
  const paddedWidths = colWidths.map((w) => w + CELL_PADDING);
  const colCount = colWidths.length;

  // Render header row
  const headerRowBox = new BoxRenderable(renderer, {
    flexDirection: "row",
  });

  headerRowBox.add(
    new TextRenderable(renderer, {
      content: "\u2502 ",
      fg: colors.gray,
    }),
  );

  for (let i = 0; i < colCount; i++) {
    const align = token.align?.[i] || "left";
    const cellText = padCell(token.header[i].text, paddedWidths[i], align);

    headerRowBox.add(
      new TextRenderable(renderer, {
        content: cellText,
        fg: colors.cyan,
        attributes: TextAttributes.BOLD,
      }),
    );

    if (i < colCount - 1) {
      headerRowBox.add(
        new TextRenderable(renderer, {
          content: "\u2502 ",
          fg: colors.gray,
        }),
      );
    }
  }

  headerRowBox.add(
    new TextRenderable(renderer, {
      content: " \u2502",
      fg: colors.gray,
    }),
  );

  wrapper.add(headerRowBox);

  // Render separator row
  wrapper.add(
    new TextRenderable(renderer, {
      content: buildSeparatorLine(paddedWidths),
      fg: colors.gray,
    }),
  );

  // Render data rows
  for (const row of token.rows) {
    const dataRow = new BoxRenderable(renderer, {
      flexDirection: "row",
    });

    dataRow.add(
      new TextRenderable(renderer, {
        content: "\u2502 ",
        fg: colors.gray,
      }),
    );

    for (let i = 0; i < colCount; i++) {
      const align = token.align?.[i] || "left";
      const cellContent = i < row.length ? row[i].text : "";
      const cellText = padCell(cellContent, paddedWidths[i], align);

      dataRow.add(
        new TextRenderable(renderer, {
          content: cellText,
          fg: colors.fg,
        }),
      );

      if (i < colCount - 1) {
        dataRow.add(
          new TextRenderable(renderer, {
            content: "\u2502 ",
            fg: colors.gray,
          }),
        );
      }
    }

    dataRow.add(
      new TextRenderable(renderer, {
        content: " \u2502",
        fg: colors.gray,
      }),
    );

    wrapper.add(dataRow);
  }

  return wrapper;
}
