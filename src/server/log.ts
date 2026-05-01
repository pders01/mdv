/**
 * Server-side console output: startup banner + per-request access log.
 *
 * Styled with the small ANSI helpers in src/util/ansi.ts so the binary stays
 * dependency-free. Honors NO_COLOR (and FORCE_COLOR) automatically via that
 * module's TTY detection.
 *
 * Quiet mode (--quiet) skips both banner and access log; debug mode (--debug)
 * adds a timing breakdown. Default is the access log without timing.
 */

import { bold, cyan, dim, gray, green, red, yellow } from "../util/ansi.js";

interface BannerOptions {
  url: string;
  rootDir: string;
  rootIsDirectory: boolean;
  fileCount: number;
  theme: string;
  mermaid: boolean;
}

const PIPE = gray("│");

export function printBanner(opts: BannerOptions): void {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  ${bold("mdv")} ${dim("·")} ${cyan(opts.url)}`);
  lines.push("");
  lines.push(field("path", opts.rootDir));
  lines.push(
    field("mode", opts.rootIsDirectory ? `directory · ${opts.fileCount} files` : "single file"),
  );
  lines.push(field("theme", opts.theme));
  lines.push(field("mermaid", opts.mermaid ? "on" : "off"));
  lines.push("");
  lines.push(`  ${dim("Press Ctrl-C to stop.")}`);
  lines.push("");
  process.stderr.write(lines.join("\n") + "\n");
}

function field(label: string, value: string): string {
  const padded = label.padStart(8);
  return `  ${gray(padded)} ${PIPE} ${value}`;
}

interface AccessLogEntry {
  method: string;
  path: string;
  status: number;
  bytes: number;
  durationMs: number;
}

export function logAccess(entry: AccessLogEntry): void {
  const method = entry.method.padEnd(4);
  const status = formatStatus(entry.status);
  const path = truncate(entry.path, 48).padEnd(48);
  const bytes = formatBytes(entry.bytes).padStart(8);
  const ms = formatMs(entry.durationMs).padStart(6);
  process.stderr.write(`  ${dim(method)} ${status} ${path} ${dim(bytes)} ${gray(ms)}\n`);
}

function formatStatus(status: number): string {
  const text = String(status).padEnd(3);
  if (status >= 500) return red(text);
  if (status >= 400) return yellow(text);
  if (status >= 300) return cyan(text);
  return green(text);
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatMs(n: number): string {
  if (n < 1) return `<1ms`;
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return "…" + s.slice(s.length - max + 1);
}
