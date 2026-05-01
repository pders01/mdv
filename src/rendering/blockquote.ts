/**
 * Blockquote rendering — including GitHub-flavored alerts.
 *
 * Plain blockquotes render with a purple `│` bar and italic gray text. When
 * the source matched the GFM alert syntax (`> [!NOTE]`, etc.), the mdast →
 * marked converter sets `alertKind` on the token; we surface that here as a
 * coloured bar plus a labelled header so the alert reads at a glance.
 */

import { BoxRenderable, TextRenderable, TextAttributes, type CliRenderer } from "@opentui/core";
import type { ThemeColors, RenderBlock } from "../types.js";

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
 * Render blockquote with proper styling
 */
export function renderBlockquote(
  renderer: CliRenderer,
  colors: ThemeColors,
  token: ContentToken,
): BoxRenderable {
  const wrapper = new BoxRenderable(renderer, {
    marginTop: 1,
    marginBottom: 1,
    paddingLeft: 2,
  });

  const alert = token.alertKind ? ALERT_STYLES[token.alertKind] : null;
  const barColor = alert ? colors[alert.color] : colors.purple;

  // Alert header (label + icon) on its own row, before the body.
  if (alert) {
    const headerBox = new BoxRenderable(renderer, { flexDirection: "row" });
    headerBox.add(
      new TextRenderable(renderer, {
        content: "│ ",
        fg: barColor,
      }),
    );
    headerBox.add(
      new TextRenderable(renderer, {
        content: `${alert.icon} ${alert.label}`,
        fg: barColor,
        attributes: TextAttributes.BOLD,
      }),
    );
    wrapper.add(headerBox);
  }

  const contentBox = new BoxRenderable(renderer, { flexDirection: "row" });

  // Extract text from blockquote tokens
  const textContent = extractBlockquoteText(token);

  const quoteBar = new TextRenderable(renderer, {
    content: "│ ",
    fg: barColor,
  });

  const quoteText = new TextRenderable(renderer, {
    content: textContent,
    fg: colors.gray,
    attributes: TextAttributes.ITALIC,
  });

  contentBox.add(quoteBar);
  contentBox.add(quoteText);
  wrapper.add(contentBox);

  return wrapper;
}
