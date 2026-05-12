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

/**
 * Build a pure Spec for a blockquote. Wrapper applies left padding so the
 * bar sits inside the indent; each row is a row-flex box with the colored
 * bar and the body text as siblings. Alert variants prepend a header row
 * with the icon + label; body sits below in the same indent column.
 *
 * Attributes (bold / italic) are carried per-chunk rather than at the
 * TextRenderable level, so the spec stays kind-agnostic and the mounter
 * doesn't need a TextAttributes prop.
 */
export function blockquoteToSpec(colors: ThemeColors, token: ContentToken): BoxSpec {
  const alert = token.alertKind ? ALERT_STYLES[token.alertKind] : null;
  const barColor = alert ? colors[alert.color] : colors.purple;
  const textContent = extractBlockquoteText(token);

  const barTextSpec = (): Spec => ({
    kind: "text",
    chunks: [{ __isChunk: true, text: "│ ", fg: RGBA.fromHex(barColor) }],
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

  const children: Spec[] = [];

  if (alert) {
    children.push(
      rowSpec([
        {
          __isChunk: true,
          text: `${alert.icon} ${alert.label}`,
          fg: RGBA.fromHex(barColor),
          bold: true,
        },
      ]),
    );
  }

  children.push(
    rowSpec([
      {
        __isChunk: true,
        text: textContent,
        fg: RGBA.fromHex(colors.gray),
        italic: true,
      },
    ]),
  );

  return {
    kind: "box",
    marginTop: 1,
    marginBottom: 1,
    paddingLeft: 2,
    source: null,
    children,
  };
}

