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
  /** Compositing base only; never painted as a page-wide background. */
  background?: string;
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
  return `#${[color.r, color.g, color.b, ...(color.a < 1 ? [color.a] : [])]
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
  let start = 0;
  while (start < input.length) {
    let used = 0;
    let end = start;
    let breakAt = -1;
    for (; end < input.length; end++) {
      const cell = input[end]!;
      if (used + cell.width > width) break;
      used += cell.width;
      if (/^ +$/.test(cell.text)) breakAt = end;
    }
    if (end === input.length || mode === "none") {
      rows.push(input.slice(start, end));
      break;
    }
    if (mode === "word" && end > start && /^ +$/.test(input[end]!.text)) {
      rows.push(input.slice(start, end));
      start = end;
      while (input[start]?.text === " ") start++;
    } else if (mode === "word" && breakAt > start) {
      rows.push(input.slice(start, breakAt));
      start = breakAt + 1;
      while (input[start]?.text === " ") start++;
    } else if (end > start) {
      rows.push(input.slice(start, end));
      start = end;
    } else {
      const cell = input[start]!;
      rows.push([{ ...cell, text: "�", width: 1 }]);
      start++;
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
      let low = 1;
      let high = Math.max(...widths);
      while (low < high) {
        const cap = Math.ceil((low + high) / 2);
        const total = widths.reduce((sum, value) => sum + Math.min(value, cap), 0);
        if (total > innerWidth) high = cap - 1;
        else low = cap;
      }
      let spare = innerWidth - widths.reduce((sum, value) => sum + Math.min(value, low), 0);
      for (let i = 0; i < widths.length; i++) {
        const extra = widths[i]! > low && spare > 0 ? 1 : 0;
        widths[i] = Math.min(widths[i]!, low) + extra;
        spare -= extra;
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

type Rgb = [number, number, number];
function opaqueRgb(hex: string | undefined, base: Rgb): Rgb | undefined {
  if (!hex || !/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(hex)) return undefined;
  let value = hex.slice(1);
  if (value.length <= 4) value = Array.from(value, (char) => char + char).join("");
  const alpha = value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1;
  return base.map((channel, i) =>
    Math.round(parseInt(value.slice(i * 2, i * 2 + 2), 16) * alpha + channel * (1 - alpha)),
  ) as Rgb;
}

function sgr(style: Style, pageBackground?: string): string {
  const codes = ["0"];
  if (style.bold) codes.push("1");
  if (style.italic) codes.push("3");
  const base = opaqueRgb(pageBackground, [0, 0, 0]) ?? [0, 0, 0];
  const background = opaqueRgb(style.bg, base);
  const foreground = opaqueRgb(style.fg, background ?? base);
  if (foreground) codes.push(`38;2;${foreground.join(";")}`);
  if (background) codes.push(`48;2;${background.join(";")}`);
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
          const code = sgr(cell, options.background);
          if (code !== last) output += code;
          output += cell.text;
          last = code;
        }
        return output + (last ? "\x1b[0m" : "");
      })
      .join("\n") + "\n"
  );
}
