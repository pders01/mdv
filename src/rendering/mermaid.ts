/**
 * Mermaid diagram rendering via optional `mermaid-ascii` binary.
 *
 * Discovery order:
 *   1. $MDV_MERMAID_BIN (explicit override)
 *   2. `mermaid-ascii` on $PATH
 *   3. not found → graceful fallback (raw source shown as code block)
 *
 * Rendering is synchronous from the renderer's perspective: a pre-pass walks
 * the markdown tokens, spawns the binary for each unique source in parallel,
 * and produces a Map<source, ascii> that `createRenderNode` reads at dispatch
 * time. Successful renders are cached in memory (keyed by content hash) and
 * mirrored to disk at ~/.cache/mdv/mermaid/<hash>.txt so repeat views and
 * watch-mode reloads of unchanged diagrams are free.
 */

import { createHash } from "crypto";
import { homedir } from "os";
import { join } from "path";
import { mkdir } from "fs/promises";
import { marked, type Token } from "marked";

const CACHE_DIR = join(homedir(), ".cache", "mdv", "mermaid");
const CONCURRENCY = 4;
const TIMEOUT_MS = 5000;

// Module-level state. Intentionally persistent across renders so that
// directory-mode file switches and watch-mode reloads hit the cache.
let binResolved = false;
let binPath: string | null = null;
// null = known failure (don't retry within this process)
const memCache = new Map<string, string | null>();

export interface PrerenderResult {
  /** Map from raw mermaid source text to rendered ASCII output. */
  renders: Map<string, string>;
  /** True if the content contained any mermaid code blocks. */
  hadBlocks: boolean;
  /** True if the content had blocks but the tool is unavailable. */
  toolMissing: boolean;
}

/**
 * Resolve the mermaid-ascii binary path, caching the result.
 * Returns null if neither the env var nor $PATH lookup finds it.
 */
export function detectMermaidBin(): string | null {
  if (binResolved) return binPath;
  binResolved = true;
  const envBin = process.env.MDV_MERMAID_BIN;
  if (envBin && envBin.length > 0) {
    binPath = envBin;
    return binPath;
  }
  binPath = Bun.which("mermaid-ascii");
  return binPath;
}

function hashSource(source: string): string {
  return createHash("sha1").update(source).digest("hex").slice(0, 16);
}

/**
 * Normalize HTML-ish constructs inside mermaid source that mermaid-ascii
 * doesn't understand. Currently:
 *
 * - `<br/>`, `<br>`, `<br />` (any case) → single space. The real mermaid
 *   renderer interprets these as line breaks inside node labels; the Go
 *   tool emits them verbatim, which wrecks layout width.
 *
 * Running this *before* hashing means the cache key changes shape, so any
 * stale entries on disk from earlier (un-preprocessed) runs become
 * orphaned instead of returning pre-broken output.
 */
function preprocessSource(source: string): string {
  return source.replace(/<br\s*\/?>/gi, " ");
}

async function readDiskCache(key: string): Promise<string | null> {
  try {
    return await Bun.file(join(CACHE_DIR, `${key}.txt`)).text();
  } catch {
    return null;
  }
}

async function writeDiskCache(key: string, value: string): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await Bun.write(join(CACHE_DIR, `${key}.txt`), value);
  } catch {
    // Disk cache is best-effort — memory cache still works.
  }
}

/**
 * Render one mermaid source. Returns the ASCII output on success, or null
 * on any failure (timeout, non-zero exit, parse error, spawn failure).
 */
async function renderOne(bin: string, source: string): Promise<string | null> {
  const processed = preprocessSource(source);
  const key = hashSource(processed);

  // In-memory cache hit (including cached failures).
  if (memCache.has(key)) return memCache.get(key) ?? null;

  // Disk cache hit → promote to memory.
  const disk = await readDiskCache(key);
  if (disk !== null) {
    memCache.set(key, disk);
    return disk;
  }

  // Spawn with timeout via AbortController.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const proc = Bun.spawn([bin, "-f", "-"], {
      stdin: new Blob([processed]),
      stdout: "pipe",
      stderr: "pipe",
      signal: controller.signal,
    });

    const exitCode = await proc.exited;
    clearTimeout(timer);

    if (exitCode !== 0) {
      memCache.set(key, null);
      return null;
    }

    const output = await new Response(proc.stdout).text();
    // Trim trailing newlines — mermaid-ascii pads with blank lines that
    // would inflate the code block height.
    const trimmed = output.replace(/\n+$/, "");
    memCache.set(key, trimmed);
    // Fire-and-forget disk write (races are safe: identical content).
    void writeDiskCache(key, trimmed);
    return trimmed;
  } catch {
    clearTimeout(timer);
    memCache.set(key, null);
    return null;
  }
}

/**
 * Walk marked tokens and collect every mermaid code block source.
 * Covers nested cases (list items, blockquotes) since marked exposes
 * children via `.tokens` / `.items`.
 */
function collectMermaidSources(content: string): string[] {
  const tokens = marked.lexer(content);
  const sources: string[] = [];

  const walk = (toks: Token[]): void => {
    for (const t of toks) {
      if (t.type === "code" && (t as Token & { lang?: string }).lang === "mermaid") {
        sources.push((t as Token & { text: string }).text);
      }
      const nested = (t as Token & { tokens?: Token[] }).tokens;
      if (Array.isArray(nested)) walk(nested);
      const items = (t as Token & { items?: Token[] }).items;
      if (Array.isArray(items)) walk(items);
    }
  };

  walk(tokens);
  return sources;
}

/**
 * Pre-render all mermaid code blocks in the given markdown content.
 * Safe to call repeatedly — the cache makes unchanged content free.
 */
export async function prerenderMermaid(
  content: string,
  options: { disabled?: boolean } = {},
): Promise<PrerenderResult> {
  const sources = collectMermaidSources(content);
  const hadBlocks = sources.length > 0;

  if (!hadBlocks || options.disabled) {
    return { renders: new Map(), hadBlocks, toolMissing: false };
  }

  const bin = detectMermaidBin();
  if (!bin) {
    return { renders: new Map(), hadBlocks, toolMissing: true };
  }

  // Dedupe: identical diagrams render once.
  const unique = Array.from(new Set(sources));
  const renders = new Map<string, string>();

  // Bounded-parallel: render up to CONCURRENCY diagrams at a time.
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((src) => renderOne(bin, src)));
    // `results.length === batch.length` by construction — the `!` is safe.
    for (let j = 0; j < batch.length; j++) {
      const output = results[j]!;
      if (output !== null) renders.set(batch[j]!, output);
    }
  }

  return { renders, hadBlocks, toolMissing: false };
}

/**
 * Reset all module-level state. Exported for tests.
 */
export function _resetMermaidState(): void {
  binResolved = false;
  binPath = null;
  memCache.clear();
}
