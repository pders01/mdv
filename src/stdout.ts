/** One-shot terminal rendering. No raw input, alternate screen, cursor controls, or UI lifecycle. */
import { stat } from "node:fs/promises";
import type { BundledTheme } from "shiki";
import { readContent, readStdinContent, type CliArgs } from "./cli.js";
import { createHighlighterInstance, loadLangsForContent } from "./highlighting/shiki.js";
import { extractThemeColors } from "./theme/colors.js";
import { resolveTheme } from "./theme/system.js";
import { prerenderMermaid } from "./rendering/mermaid.js";
import { createSpecRenderer } from "./rendering/index.js";
import { documentToSpecs } from "./render/document.js";
import { specsToAnsi } from "./render/ansi.js";

export function stdoutColorEnabled(
  mode: CliArgs["color"],
  isTTY: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (mode !== "auto") return mode === "always";
  if (env.NO_COLOR) return false;
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== "0";
  return isTTY;
}

export async function renderStdout(
  content: string,
  args: CliArgs,
  width: number,
  color: boolean,
): Promise<string> {
  if (!content.trim()) return "";
  const theme = resolveTheme(args.theme);
  const instance = await createHighlighterInstance(theme);
  try {
    const colors = extractThemeColors(instance.highlighter, theme as BundledTheme);
    instance.colors = colors;
    await loadLangsForContent(instance, content);
    const mermaid = await prerenderMermaid(content, {
      disabled: args.noMermaid,
      availableWidth: Math.max(1, width - 2),
    });
    const specs = documentToSpecs(
      content,
      createSpecRenderer(colors, instance, width, mermaid.renders),
    );
    return specsToAnsi(specs, {
      width,
      color,
      foreground: colors.fg,
      background: colors.bg,
      codeBackground: colors.codeBg,
    });
  } finally {
    instance.highlighter.dispose();
  }
}

export async function startStdout(args: CliArgs): Promise<void> {
  if (!args.filePath) throw new Error("--stdout requires a file or '-' for stdin");
  let content: string;
  if (args.filePath === "-") {
    content = await readStdinContent();
  } else {
    const info = await stat(args.filePath);
    if (!info.isFile())
      throw new Error("--stdout requires a regular file; directories are not supported");
    content = await readContent(args.filePath);
  }
  const columns = process.stdout.isTTY ? process.stdout.columns : 80;
  const width = args.width ?? (Number.isSafeInteger(columns) && columns > 0 ? columns : 80);
  const color = stdoutColorEnabled(args.color, Boolean(process.stdout.isTTY));
  const output = await renderStdout(content, args, width, color);
  // Bun's awaited writer handles pipe backpressure without a TUI output buffer.
  if (output) await Bun.write(Bun.stdout, output);
}
