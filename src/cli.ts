/**
 * CLI argument parsing and help
 */

import { parseArgs } from "util";

/**
 * Parsed CLI arguments
 */
export interface CliArgs {
  theme: string;
  filePath: string | null;
  showHelp: boolean;
  showVersion: boolean;
  listThemes: boolean;
  debug: boolean;
  noMouse: boolean;
}

/**
 * Parse CLI arguments
 */
export function parseCliArgs(argv: string[]): CliArgs {
  const { values, positionals } = parseArgs({
    args: argv.slice(2),
    options: {
      theme: { type: "string", short: "t", default: "github-dark" },
      "list-themes": { type: "boolean", short: "T" },
      "no-mouse": { type: "boolean" },
      debug: { type: "boolean" },
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  return {
    theme: values.theme as string,
    filePath: positionals[0] || null,
    showHelp: values.help ?? false,
    showVersion: values.version ?? false,
    listThemes: values["list-themes"] ?? false,
    debug: values.debug ?? false,
    noMouse: values["no-mouse"] ?? false,
  };
}

/**
 * Show help text
 */
export function showHelp(): void {
  console.log("Usage: mdv [options] <markdown-file>");
  console.log("       cat file.md | mdv [options]");
  console.log("\nOptions:");
  console.log("  -t, --theme <name>   Set syntax highlighting theme (default: github-dark)");
  console.log("  -T, --list-themes    List available themes");
  console.log("      --no-mouse       Disable mouse input");
  console.log("      --debug          Enable debug logging");
  console.log("  -v, --version        Show version");
  console.log("  -h, --help           Show this help");
}

/**
 * List available themes
 */
export async function listThemes(): Promise<void> {
  const { bundledThemes } = await import("shiki");
  console.log("Available themes:");
  Object.keys(bundledThemes)
    .sort()
    .forEach((t) => console.log(`  ${t}`));
}

/**
 * Show usage error
 */
export function showUsageError(): void {
  console.error("Usage: mdv [options] <markdown-file>");
  console.error("       cat file.md | mdv [options]");
  console.error("\nRun 'mdv --help' for more options");
}

/**
 * Check if stdin has piped content
 */
export function hasStdinContent(): boolean {
  return !process.stdin.isTTY;
}

/**
 * Read content from stdin (must be called BEFORE renderer creation)
 */
export async function readStdinContent(): Promise<string> {
  return await Bun.stdin.text();
}

/**
 * Read file content from path
 */
export async function readContent(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`File not found: ${filePath}`);
  }
  return await file.text();
}
