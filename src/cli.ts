/**
 * CLI argument parsing and help text.
 *
 * Single source of truth: the OPTIONS table below. parseArgs config and the
 * help text are both derived from it, so adding a flag is one entry — no
 * second edit somewhere else.
 */

import { parseArgs, type ParseArgsConfig } from "util";

// =============================================================================
// Option metadata (single source of truth)
// =============================================================================

type OptionType = "string" | "boolean";

interface OptionDef {
  /** Long flag name (used as the parseArgs key and the `--name` form). */
  name: string;
  /** Short flag (single character). */
  short?: string;
  /** Type of the option's value. */
  type: OptionType;
  /** Allow multiple occurrences (parseArgs). */
  multiple?: boolean;
  /** Default for string options (parseArgs treats the field as the literal default). */
  default?: string;
  /** Placeholder shown in help (e.g. "<name>"). */
  valueDesc?: string;
  /** One-line description in help. */
  description: string;
  /** Section the option appears under in help output. */
  group: HelpGroup;
}

type HelpGroup = "general" | "serve";

/** Defaults referenced from both the OPTIONS table and the parseCliArgs fallback. */
const DEFAULT_THEME = "auto";
const DEFAULT_PORT = 4280;
const DEFAULT_HOST = "localhost";

const OPTIONS: readonly OptionDef[] = [
  // general
  { name: "theme", short: "t", type: "string", default: DEFAULT_THEME, valueDesc: "<name>", description: "Set syntax highlighting theme (default: auto, follows system light/dark)", group: "general" },
  { name: "list-themes", short: "T", type: "boolean", description: "List available themes", group: "general" },
  { name: "no-mouse", type: "boolean", description: "Disable mouse input (TUI only)", group: "general" },
  { name: "no-mermaid", type: "boolean", description: "Disable mermaid diagram rendering", group: "general" },
  { name: "watch", short: "w", type: "boolean", description: "Live reload on file changes", group: "general" },
  { name: "exclude", short: "e", type: "string", multiple: true, valueDesc: "<dir>", description: "Exclude directory from scan (repeatable)", group: "general" },
  { name: "debug", type: "boolean", description: "Enable debug logging", group: "general" },
  { name: "version", short: "v", type: "boolean", description: "Show version", group: "general" },
  { name: "help", short: "h", type: "boolean", description: "Show this help", group: "general" },

  // serve
  { name: "serve", type: "boolean", description: "Serve over HTTP instead of TUI (or use the `serve` subcommand)", group: "serve" },
  { name: "port", short: "p", type: "string", default: String(DEFAULT_PORT), valueDesc: "<port>", description: "Port to bind", group: "serve" },
  { name: "host", type: "string", default: DEFAULT_HOST, valueDesc: "<host>", description: "Host to bind", group: "serve" },
  { name: "open", short: "o", type: "boolean", description: "Open the URL in the default browser", group: "serve" },
  { name: "quiet", short: "q", type: "boolean", description: "Suppress banner and access log", group: "serve" },
] as const;

const GROUP_TITLES: Record<HelpGroup, string> = {
  general: "Options",
  serve: "Serve options",
};

// =============================================================================
// Public types
// =============================================================================

export interface CliArgs {
  theme: string;
  filePath: string | null;
  showHelp: boolean;
  showVersion: boolean;
  listThemes: boolean;
  debug: boolean;
  noMouse: boolean;
  watch: boolean;
  exclude: string[];
  noMermaid: boolean;
  serve: boolean;
  port: number;
  host: string;
  open: boolean;
  quiet: boolean;
}

// =============================================================================
// Parsing
// =============================================================================

function buildParseArgsOptions(): ParseArgsConfig["options"] {
  const out: ParseArgsConfig["options"] = {};
  for (const o of OPTIONS) {
    out[o.name] = {
      type: o.type,
      ...(o.short ? { short: o.short } : {}),
      ...(o.multiple ? { multiple: o.multiple } : {}),
      ...(o.default !== undefined ? { default: o.default } : {}),
    } as ParseArgsConfig["options"][string];
  }
  return out;
}

const PARSE_OPTIONS = buildParseArgsOptions();

/**
 * Parse CLI arguments.
 *
 * Supports both `mdv serve <path>` (subcommand) and `mdv --serve <path>` (flag).
 * The subcommand form is preferred in user-facing docs.
 */
export function parseCliArgs(argv: string[]): CliArgs {
  const { values, positionals } = parseArgs({
    args: argv.slice(2),
    options: PARSE_OPTIONS,
    allowPositionals: true,
  });

  const isServeSubcommand = positionals[0] === "serve";
  const serve = isServeSubcommand || (values.serve as boolean | undefined) === true;
  const filePath = (isServeSubcommand ? positionals[1] : positionals[0]) ?? null;

  const portNum = Number.parseInt(values.port as string, 10);

  return {
    theme: values.theme as string,
    filePath,
    showHelp: (values.help as boolean | undefined) ?? false,
    showVersion: (values.version as boolean | undefined) ?? false,
    listThemes: (values["list-themes"] as boolean | undefined) ?? false,
    debug: (values.debug as boolean | undefined) ?? false,
    noMouse: (values["no-mouse"] as boolean | undefined) ?? false,
    watch: (values.watch as boolean | undefined) ?? false,
    exclude: (values.exclude as string[] | undefined) ?? [],
    noMermaid: (values["no-mermaid"] as boolean | undefined) ?? false,
    serve,
    port: Number.isFinite(portNum) ? portNum : DEFAULT_PORT,
    host: values.host as string,
    open: (values.open as boolean | undefined) ?? false,
    quiet: (values.quiet as boolean | undefined) ?? false,
  };
}

// =============================================================================
// Help formatting
// =============================================================================

const USAGE = [
  "Usage: mdv [options] <markdown-file|directory>",
  "       mdv serve [options] <directory>",
  "       cat file.md | mdv [options]",
];

/**
 * Keybindings shown at the bottom of `--help`. Like OPTIONS, this is a
 * table — column width is computed at render time so the description column
 * stays aligned regardless of which keys we add or rename.
 */
const TUI_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["Tab, Ctrl-h, Ctrl-l", "Switch panes"],
  ["\\", "Toggle sidebar"],
  ["j/k, Enter", "Navigate and open files"],
  ["Ctrl-d/u, Ctrl-f/b", "Scroll half/full page"],
  ["/, n, N", "Search and cycle matches"],
];

const TAIL_INTRO = [
  "Directory mode (TUI):",
  "  Pass a directory to browse all markdown files with a sidebar.",
  "  Auto-excludes: node_modules, .git, vendor, dist, build, ...",
];

/** Render a single option row. Public for testing. */
export function renderOptionRow(opt: OptionDef, leftWidth: number): string {
  const flag = formatFlag(opt);
  return `  ${flag.padEnd(leftWidth)}  ${opt.description}`;
}

function formatFlag(opt: OptionDef): string {
  const value = opt.valueDesc ? ` ${opt.valueDesc}` : "";
  return opt.short ? `-${opt.short}, --${opt.name}${value}` : `    --${opt.name}${value}`;
}

/** Build the full help text. Public for testing. */
export function buildHelp(): string {
  const groups: HelpGroup[] = ["general", "serve"];
  const sections: string[][] = [];

  // One column width across all option groups AND the keybind table so every
  // description column lines up vertically in the rendered help.
  const allFlags = OPTIONS.map(formatFlag);
  const allKeys = TUI_KEYS.map(([k]) => k);
  const leftWidth = Math.max(...allFlags.map((f) => f.length), ...allKeys.map((k) => k.length));

  for (const group of groups) {
    const opts = OPTIONS.filter((o) => o.group === group);
    if (opts.length === 0) continue;
    const lines = [`${GROUP_TITLES[group]}:`];
    for (const o of opts) lines.push(renderOptionRow(o, leftWidth));
    sections.push(lines);
  }

  const tail = [
    ...TAIL_INTRO,
    "",
    ...TUI_KEYS.map(([k, desc]) => `  ${k.padEnd(leftWidth)}  ${desc}`),
  ];

  return [USAGE.join("\n"), "", sections.map((s) => s.join("\n")).join("\n\n"), "", tail.join("\n")].join("\n");
}

export function showHelp(): void {
  console.log(buildHelp());
}

// =============================================================================
// Misc helpers used by the entry dispatcher and TUI/server modules
// =============================================================================

export async function listThemes(): Promise<void> {
  const { bundledThemes } = await import("shiki");
  console.log("Available themes:");
  console.log("  auto (follows system light/dark; override via MDV_APPEARANCE)");
  Object.keys(bundledThemes)
    .sort()
    .forEach((t) => console.log(`  ${t}`));
}

export function showUsageError(): void {
  console.error(USAGE.join("\n"));
  console.error("\nRun 'mdv --help' for more options");
}

export function hasStdinContent(): boolean {
  return !process.stdin.isTTY;
}

export async function readStdinContent(): Promise<string> {
  return await Bun.stdin.text();
}

export async function readContent(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`File not found: ${filePath}`);
  }
  return await file.text();
}
