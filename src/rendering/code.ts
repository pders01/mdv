/**
 * Code block rendering with Shiki syntax highlighting
 *
 * Note: Code block backgrounds are drawn at the container level (container.ts)
 * using _blockStates for accurate scroll-aware positioning.
 */

import { RGBA } from "@opentui/core";
import type { ThemeColors, TextChunk, StyledSegment, RenderBlock } from "../types.js";
import { shikiToChunks, resolveLanguage, type HighlighterInstance } from "../highlighting/shiki.js";
import type { BoxSpec, TextLine } from "../render/spec.js";
import { cellWidth } from "../util/width.js";

/**
 * Code token shape (structural — marked's Token is a union and can't be
 * used as an interface base). Callers assert onto this after checking
 * `token.type === "code"` so narrowing is handled at the call site.
 */
interface CodeToken {
  text: string;
  lang?: string;
}

/**
 * Convert a code token to a RenderBlock (pure function, no OpenTUI dependency)
 * When highlighterInstance is provided, uses Shiki for syntax highlighting.
 * Otherwise, produces plain text segments.
 */
export function codeToBlock(
  colors: ThemeColors,
  token: CodeToken,
  highlighterInstance?: HighlighterInstance,
): RenderBlock {
  const lang = token.lang ? resolveLanguage(token.lang) : "";

  let segments: StyledSegment[];

  if (lang && highlighterInstance) {
    const chunks = shikiToChunks(highlighterInstance, token.text, lang);
    segments = chunks.map((chunk) => ({
      text: chunk.text,
      fg: chunk.fg
        ? `#${Math.round(chunk.fg.r * 255)
            .toString(16)
            .padStart(2, "0")}${Math.round(chunk.fg.g * 255)
            .toString(16)
            .padStart(2, "0")}${Math.round(chunk.fg.b * 255)
            .toString(16)
            .padStart(2, "0")}`
        : colors.fg,
      bold: chunk.bold || false,
      italic: chunk.italic || false,
    }));
  } else {
    segments = [{ text: token.text, fg: colors.fg, bold: false, italic: false }];
  }

  // Split segments into lines at \n boundaries.
  // `lines` is seeded with [[]] and we only ever push, so lines[last] is
  // always defined — the `!` is safe by construction.
  const lines: StyledSegment[][] = [[]];
  for (const seg of segments) {
    if (seg.text === "\n") {
      lines.push([]);
    } else {
      lines[lines.length - 1]!.push(seg);
    }
  }

  return {
    type: "code",
    lines,
    indent: 0,
    marginTop: 1,
    marginBottom: 1,
  };
}

/**
 * Build a pure Spec for a code block. Stage 4 of the pipeline; no
 * Renderables are created here. `renderCodeBlock` below is the legacy
 * adapter that funnels callers through `codeBlockToSpec` + `mountSpec`,
 * so existing call sites keep working while we port further.
 *
 * `sourceLineStart` is the index of the opening fence line in the source
 * content. Used by stage 4 to populate `lines[i].sourceLine` so per-row
 * cursor / selection / search highlights map back to source positions
 * without the reverse-engineered string indexOf we use today.
 */
export function codeBlockToSpec(
  colors: ThemeColors,
  highlighterInstance: HighlighterInstance | undefined,
  token: CodeToken,
  sourceLineStart: number,
  wrapMode?: "none" | "char" | "word",
): BoxSpec {
  const lang = token.lang ? resolveLanguage(token.lang) : "";

  const chunks: TextChunk[] = lang && highlighterInstance
    ? shikiToChunks(highlighterInstance, token.text, lang)
    : [{ __isChunk: true, text: token.text, fg: RGBA.fromHex(colors.fg) }];

  // Build per-source-line breakdown so stage 4 can compute wrap height per
  // line without re-parsing chunks. Source lines are the content lines
  // between the fences — the fences themselves are decorative (the wrapper
  // box contributes padding that visually stands in for them) and don't
  // get their own TextLine entry; their source rows are still in the
  // wrapper's SourceSpan so the cursor can land on them.
  const contentLines = token.text.split("\n");
  const lines: TextLine[] = contentLines.map((text, i) => ({
    sourceLine: sourceLineStart + 1 + i, // +1 skips the opening fence row
    displayWidth: cellWidth(text),
    displayText: text,
  }));

  const sourceEnd = sourceLineStart + 1 + contentLines.length; // closing fence

  return {
    kind: "box",
    padding: 1,
    marginTop: 1,
    marginBottom: 1,
    source: { start: sourceLineStart, end: sourceEnd },
    children: [
      {
        kind: "text",
        chunks,
        ...(wrapMode ? { wrapMode } : {}),
        lines,
        source: { start: lines[0]?.sourceLine ?? sourceLineStart, end: sourceEnd - 1 },
      },
    ],
  };
}

