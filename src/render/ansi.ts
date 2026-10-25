/** Spec → terminal rows → ANSI. This backend never creates a renderer or changes terminal state. */
import type { TextChunk } from "../types.js";
import type { Spec } from "./spec.js";
import { cellWidth } from "../util/width.js";

interface Style {
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
}
interface Cell extends Style {
  text: string;
  width: number;
}
type Row = Cell[];

export interface AnsiOptions {
  width: number;
  color: boolean;
  foreground?: string;
  codeBackground?: string;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const terminalSequences = new RegExp(
  `${ESC}\\][\\s\\S]*?(?:${BEL}|${ESC}\\\\|$)|${ESC}[P^_][\\s\\S]*?(?:${ESC}\\\\|$)|${ESC}\\[[0-?]*[ -/]*[@-~]|${ESC}[ -/]*[@-~]`,
  "g",
);

/** Remove complete escape sequences as well as stray controls; never execute document content. */
export function terminalText(text: string): string {
  return Array.from(text.replace(terminalSequences, "").replace(/\r\n?/g, "\n"))
    .filter((char) => {
      const code = char.codePointAt(0)!;
      return code === 9 || code === 10 || (code >= 32 && (code < 127 || code > 159));
    })
    .join("");
}

function colorHex(color: TextChunk["fg"]): string | undefined {
  if (!color) return undefined;
  return `#${[color.r, color.g, color.b]
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function chunkLines(chunks: TextChunk[], inherited: Style): Row[] {
  const rows: Row[] = [[]];
  let column = 0;
  // Sanitize each chunk before applying styles so escape sequences cannot become output styling.
  for (const chunk of chunks) {
    const style: Style = {
      ...inherited,
      fg: colorHex(chunk.fg) ?? inherited.fg,
      bold: chunk.bold,
      italic: chunk.italic,
    };
    for (const { segment } of graphemes.segment(terminalText(chunk.text))) {
      if (segment === "\n") {
        rows.push([]);
        column = 0;
      } else if (segment === "\t") {
        const width = 4 - (column % 4);
        rows[rows.length - 1]!.push(
          ...Array.from({ length: width }, () => ({ ...style, text: " ", width: 1 })),
        );
        column += width;
      } else {
        const width = cellWidth(segment);
        rows[rows.length - 1]!.push({ ...style, text: segment, width });
        column += width;
      }
    }
  }
  return rows;
}

function rowWidth(row: Row): number {
  return row.reduce((sum, cell) => sum + cell.width, 0);
}

function spaces(width: number, style: Style): Row {
  return width > 0 ? [{ ...style, text: " ".repeat(width), width }] : [];
}

function wrapLine(input: Row, width: number, mode: "word" | "char" | "none"): Row[] {
  if (input.length === 0) return [[]];
  const rows: Row[] = [];
  let remaining = input;
  while (remaining.length) {
    let used = 0;
    let end = 0;
    let breakAt = -1;
    for (; end < remaining.length; end++) {
      const cell = remaining[end]!;
      if (used + cell.width > width) break;
      used += cell.width;
      if (/^ +$/.test(cell.text)) breakAt = end;
    }
    if (end === remaining.length) {
      rows.push(remaining);
      break;
    }
    if (mode === "none") {
      rows.push(remaining.slice(0, end));
      break;
    }
    if (mode === "word" && end > 0 && /^ +$/.test(remaining[end]!.text)) {
      rows.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
      while (remaining[0] && /^ +$/.test(remaining[0].text)) remaining = remaining.slice(1);
    } else if (mode === "word" && breakAt > 0) {
      rows.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt + 1);
      while (remaining[0] && /^ +$/.test(remaining[0].text)) remaining = remaining.slice(1);
    } else if (end > 0) {
      rows.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    } else {
      // A wide grapheme (or expanded tab) cannot fit even on an empty row.
      const cell = remaining[0]!;
      rows.push([
        {
          ...cell,
          text: /^ +$/.test(cell.text) ? " ".repeat(width) : "�",
          width: /^ +$/.test(cell.text) ? width : 1,
        },
      ]);
      remaining = remaining.slice(1);
    }
  }
  return rows;
}

function padding(spec: Spec, side: "Left" | "Right" | "Top" | "Bottom"): number {
  if (spec.kind === "text") return 0;
  return spec[`padding${side}`] ?? spec.padding ?? 0;
}

function naturalWidth(spec: Spec, inherited: Style): number {
  if (spec.kind === "text") return Math.max(0, ...chunkLines(spec.chunks, inherited).map(rowWidth));
  const widths = spec.children.map((child) => naturalWidth(child, inherited));
  return (
    padding(spec, "Left") +
    padding(spec, "Right") +
    (spec.flexDirection === "row" ? widths.reduce((a, b) => a + b, 0) : Math.max(0, ...widths))
  );
}

function layout(spec: Spec, width: number, inherited: Style, options: AnsiOptions): Row[] {
  if (spec.kind === "text") {
    return chunkLines(spec.chunks, inherited).flatMap((row) =>
      wrapLine(row, width, spec.wrapMode ?? "word"),
    );
  }
  if (!spec.children.length && !spec.padding) return [];
  const style = spec.block === "code" ? { ...inherited, bg: options.codeBackground } : inherited;
  // Shrink decorative padding before sacrificing the last content cell at narrow widths.
  const left = Math.min(padding(spec, "Left"), width - 1);
  const right = Math.min(padding(spec, "Right"), width - left - 1);
  const innerWidth = width - left - right;
  let body: Row[];
  if (spec.flexDirection === "row" && spec.children.length > 1) {
    const widths = spec.children.map((child) => Math.max(1, naturalWidth(child, style)));
    if (widths.length > innerWidth) {
      // No horizontal allocation can fit: stack rather than lose content.
      body = spec.children.flatMap((child) => layout(child, innerWidth, style, options));
    } else {
      // Keep short prefixes (quote bars / list markers) intact, shrink the widest columns first.
      let total = widths.reduce((a, b) => a + b, 0);
      while (total > innerWidth) {
        const widest = widths.indexOf(Math.max(...widths));
        widths[widest] = widths[widest]! - 1;
        total--;
      }
      const columns = spec.children.map((child, i) => layout(child, widths[i]!, style, options));
      const height = Math.max(0, ...columns.map((column) => column.length));
      body = Array.from({ length: height }, (_, y) =>
        columns.flatMap((column, i) => {
          const row = column[y] ?? [];
          return [...row, ...spaces(widths[i]! - rowWidth(row), style)];
        }),
      );
    }
  } else {
    body = spec.children.flatMap((child) => layout(child, innerWidth, style, options));
  }
  const blank = () => spaces(width, style);
  const padded = body.map((row) => [
    ...spaces(left, style),
    ...row,
    ...spaces(style.bg ? width - left - rowWidth(row) : right, style),
  ]);
  return [
    ...Array.from({ length: spec.marginTop ?? 0 }, () => [] as Row),
    ...Array.from({ length: padding(spec, "Top") }, blank),
    ...padded,
    ...Array.from({ length: padding(spec, "Bottom") }, blank),
    ...Array.from({ length: spec.marginBottom ?? 0 }, () => [] as Row),
  ];
}

function sgr(style: Style): string {
  const codes = ["0"];
  if (style.bold) codes.push("1");
  if (style.italic) codes.push("3");
  for (const [key, prefix] of [
    ["fg", "38"],
    ["bg", "48"],
  ] as const) {
    const hex = style[key];
    if (!hex || !/^#[\da-f]{6}$/i.test(hex)) continue;
    codes.push(
      `${prefix};2;${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}`,
    );
  }
  return `\x1b[${codes.join(";")}m`;
}

export function specsToAnsi(specs: Spec[], options: AnsiOptions): string {
  if (!Number.isSafeInteger(options.width) || options.width < 1)
    throw new Error("width must be a positive integer");
  const rows = specs.flatMap((spec) =>
    layout(spec, options.width, { fg: options.foreground }, options),
  );
  const isBlank = (row: Row) => row.every((cell) => !cell.text.trim());
  while (rows.length && isBlank(rows[0]!)) rows.shift();
  while (rows.length && isBlank(rows[rows.length - 1]!)) rows.pop();
  if (!rows.length) return "";
  return (
    rows
      .map((row) => {
        if (!options.color)
          return row
            .map((cell) => cell.text)
            .join("")
            .trimEnd();
        let last = "";
        let output = "";
        for (const cell of row) {
          if (!cell.text) continue;
          const code = sgr(cell);
          if (code !== last) output += code;
          output += cell.text;
          last = code;
        }
        return output + (last ? "\x1b[0m" : "");
      })
      .join("\n") + "\n"
  );
}
