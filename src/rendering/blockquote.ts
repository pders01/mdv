/**
 * Blockquote rendering — including GitHub-flavored alerts.
 *
 * Plain blockquotes render with a purple `│` bar and italic gray text. When
 * the source matched the GFM alert syntax (`> [!NOTE]`, etc.), the mdast →
 * marked converter sets `alertKind` on the token; we surface that here as a
 * coloured bar plus a labelled header so the alert reads at a glance.
 */

import { RGBA } from "@opentui/core";
import type { ThemeColors, RenderBlock, TextChunk } from "../types.js";
import type { BoxSpec, Spec } from "../render/spec.js";

/**
 * Token with optional text content (for recursive extraction).
 * Structural shape — deliberately not extending marked's Token union.
 */
interface ContentToken {
  type?: string;
  tokens?: ContentToken[];
  text?: string;
  raw?: string;
  /** GitHub alert kind set by `mdast-to-marked` when the blockquote begins with `[!KIND]`. */
  alertKind?: "note" | "tip" | "important" | "warning" | "caution";
  /**
   * Per-child source line ranges set by `mdast-to-marked` for blockquote
   * tokens. Used to pad blank `>` rows between consecutive children so
   * the rendered row count matches the source-line span (cursor row math
   * depends on the 1:1 mapping; missing rows fall back to fractional
   * uniform-divide which paints the highlight on the wrong row).
   */
  tokenLines?: Array<{ start: number; end: number }>;
  blockStartLine?: number;
  blockEndLine?: number;
}

interface AlertStyle {
  label: string;
  icon: string;
  color: keyof ThemeColors;
}

/** Visual treatment per alert kind — labels match the GitHub web UI casing. */
const ALERT_STYLES: Record<NonNullable<ContentToken["alertKind"]>, AlertStyle> = {
  note: { label: "Note", icon: "ⓘ", color: "blue" }, // ⓘ
  tip: { label: "Tip", icon: "☀", color: "green" }, // ☀
  important: { label: "Important", icon: "❖", color: "purple" }, // ❖
  warning: { label: "Warning", icon: "⚠", color: "yellow" }, // ⚠
  caution: { label: "Caution", icon: "✖", color: "red" }, // ✖
};

/**
 * Extract text from blockquote tokens recursively
 */
export function extractBlockquoteText(token: ContentToken): string {
  if (token.text) return token.text;
  if (!token.tokens) return token.raw || "";

  return token.tokens
    .map((t) => {
      if (t.type === "paragraph" || t.type === "text") {
        return t.text || t.raw || "";
      }
      if (t.type === "blockquote") {
        return "> " + extractBlockquoteText(t);
      }
      return extractBlockquoteText(t);
    })
    .join("\n")
    .trim();
}

/**
 * Convert a blockquote token to a RenderBlock (pure function, no OpenTUI dependency)
 */
export function blockquoteToBlock(colors: ThemeColors, token: ContentToken): RenderBlock {
  const textContent = extractBlockquoteText(token);
  const alert = token.alertKind ? ALERT_STYLES[token.alertKind] : null;
  const barColor = alert ? colors[alert.color] : colors.purple;

  if (alert) {
    return {
      type: "blockquote",
      lines: [
        [
          { text: "│ ", fg: barColor, bold: false, italic: false },
          { text: `${alert.icon} ${alert.label}`, fg: barColor, bold: true, italic: false },
        ],
        [
          { text: "│ ", fg: barColor, bold: false, italic: false },
          { text: textContent, fg: colors.gray, bold: false, italic: true },
        ],
      ],
      indent: 0,
      marginTop: 1,
      marginBottom: 1,
    };
  }

  return {
    type: "blockquote",
    lines: [
      [
        { text: "│ ", fg: barColor, bold: false, italic: false },
        { text: textContent, fg: colors.gray, bold: false, italic: true },
      ],
    ],
    indent: 0,
    marginTop: 1,
    marginBottom: 1,
  };
}

/** One-row rendering of a single non-blockquote child token. */
function childTextChunks(colors: ThemeColors, child: ContentToken): TextChunk[] {
  let text: string;
  if (child.type === "paragraph" || child.type === "text") {
    text = child.text || child.raw || "";
  } else {
    text = extractBlockquoteText(child);
  }
  return [
    {
      __isChunk: true,
      text,
      fg: RGBA.fromHex(colors.gray),
      italic: true,
    },
  ];
}

/**
 * Build a pure Spec for a blockquote. Wrapper applies left padding so the
 * bar sits inside the indent. Each child token (paragraph / nested
 * blockquote / etc.) renders as one row; consecutive children separated
 * by blank `>` lines in source pick up bar-only rows in between so the
 * rendered child count matches the source-line span. Alert variants
 * replace the `[!KIND]` source line with an icon + label header.
 *
 * The 1:1 source-line ↔ child mapping lets `getRowLayout` in
 * `container.ts` find the right rendered row by index instead of falling
 * through to fractional uniform-divide — fixes cursor row drift on
 * multi-paragraph blockquotes.
 *
 * Attributes (bold / italic) are carried per-chunk rather than at the
 * TextRenderable level, so the spec stays kind-agnostic and the mounter
 * doesn't need a TextAttributes prop.
 */
export function blockquoteToSpec(colors: ThemeColors, token: ContentToken): BoxSpec {
  const alert = token.alertKind ? ALERT_STYLES[token.alertKind] : null;
  const barColor = alert ? colors[alert.color] : colors.purple;
  const barRGBA = RGBA.fromHex(barColor);

  const barTextSpec = (): Spec => ({
    kind: "text",
    chunks: [{ __isChunk: true, text: "│ ", fg: barRGBA }],
    source: null,
  });

  // Two TextSpec siblings inside a row-flex box so the body wraps within
  // its own flex item (continuation indents past the bar). Merging bar
  // and body into a single TextSpec would wrap continuation lines back
  // to the bar's column, losing the visual hang.
  const rowSpec = (bodyChunks: TextChunk[]): BoxSpec => ({
    kind: "box",
    flexDirection: "row",
    source: null,
    children: [barTextSpec(), { kind: "text", chunks: bodyChunks, source: null }],
  });

  const blankBarRow = (): BoxSpec => ({
    kind: "box",
    flexDirection: "row",
    source: null,
    children: [barTextSpec()],
  });

  const children: Spec[] = [];
  const tokens = token.tokens ?? [];
  const lineRanges = token.tokenLines ?? [];
  const blockStart = token.blockStartLine ?? 0;
  const blockEnd = token.blockEndLine ?? blockStart;

  // Cursor walks source lines as we emit rows; gaps fill with blank-bar.
  let cursor = blockStart;

  if (alert) {
    children.push(
      rowSpec([
        {
          __isChunk: true,
          text: `${alert.icon} ${alert.label}`,
          fg: barRGBA,
          bold: true,
        },
      ]),
    );
    cursor = blockStart + 1;
  }

  // Fallback when position metadata is unavailable: one body row joining
  // all child text (preserves original behavior for callers that bypass
  // the mdast→marked converter, e.g. legacy tests).
  if (lineRanges.length === 0 || tokens.length === 0) {
    children.push(
      rowSpec([
        {
          __isChunk: true,
          text: extractBlockquoteText(token),
          fg: RGBA.fromHex(colors.gray),
          italic: true,
        },
      ]),
    );
  } else {
    for (let i = 0; i < tokens.length; i++) {
      const child = tokens[i]! as ContentToken;
      const range = lineRanges[i]!;
      const effectiveStart = Math.max(range.start, cursor);
      for (let j = cursor; j < effectiveStart; j++) {
        children.push(blankBarRow());
      }
      if (child.type === "blockquote") {
        // Nested blockquote — recurse. Its own rows account for its source
        // span; we treat it as one outer child occupying lines from
        // effectiveStart through range.end.
        children.push(blockquoteToSpec(colors, child));
      } else {
        children.push(rowSpec(childTextChunks(colors, child)));
      }
      cursor = range.end + 1;
    }
    for (let j = cursor; j <= blockEnd; j++) {
      children.push(blankBarRow());
    }
  }

  return {
    kind: "box",
    marginTop: 1,
    marginBottom: 1,
    paddingLeft: 2,
    source: null,
    children,
  };
}

