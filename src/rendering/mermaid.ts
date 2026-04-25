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
import { walkCodeFences } from "../util/markdown.js";

const CONCURRENCY = 4;
const TIMEOUT_MS = 5000;

// Module-level state. Intentionally persistent across renders so that
// directory-mode file switches and watch-mode reloads hit the cache.
let binResolved = false;
let binPath: string | null = null;
let cacheDirResolved: string | null = null;
// null = known failure (don't retry within this process)
const memCache = new Map<string, string | null>();

/**
 * Resolve the disk cache directory. Tests can override via the
 * `MDV_MERMAID_CACHE` env var to avoid polluting `~/.cache/mdv/mermaid`
 * (and to avoid cache collisions between test cases that use different
 * fake binaries on identical source inputs). Resolved lazily and cached
 * for the process lifetime — `_resetMermaidState` clears the cache so
 * tests can switch directories between cases.
 */
function getCacheDir(): string {
  if (cacheDirResolved !== null) return cacheDirResolved;
  const override = process.env.MDV_MERMAID_CACHE;
  cacheDirResolved =
    override && override.length > 0 ? override : join(homedir(), ".cache", "mdv", "mermaid");
  return cacheDirResolved;
}

export interface PrerenderResult {
  /** Map from raw mermaid source text to rendered ASCII output. */
  renders: Map<string, string>;
  /** True if the content contained any mermaid code blocks. */
  hadBlocks: boolean;
  /** True if the content had blocks but the tool is unavailable. */
  toolMissing: boolean;
  /** Number of diagrams that couldn't fit any variant; falling back to raw source. */
  overflowed: number;
}

/**
 * Rendering variants in order of visual fidelity, from most padding to
 * least. `pickBestVariant` walks this list and uses the first one whose
 * widest line fits the caller's width budget — same adaptive pattern as
 * the table renderer's NORMAL → COMPACT fallback.
 */
type Variant = "default" | "compact" | "ultra";

const VARIANT_ARGS: Record<Variant, string[]> = {
  default: [],
  compact: ["-x", "1", "-y", "1"],
  ultra: ["-x", "0", "-y", "0", "-p", "0"],
};

const VARIANT_ORDER: Variant[] = ["default", "compact", "ultra"];

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
    return await Bun.file(join(getCacheDir(), `${key}.txt`)).text();
  } catch {
    return null;
  }
}

async function writeDiskCache(key: string, value: string): Promise<void> {
  try {
    const dir = getCacheDir();
    await mkdir(dir, { recursive: true });
    await Bun.write(join(dir, `${key}.txt`), value);
  } catch {
    // Disk cache is best-effort — memory cache still works.
  }
}

function maxLineWidth(text: string): number {
  let max = 0;
  for (const line of text.split("\n")) {
    if (line.length > max) max = line.length;
  }
  return max;
}

/**
 * Render one mermaid source with a specific variant. Returns the ASCII
 * output on success, or null on any failure. Each variant is cached
 * independently so a terminal resize triggers variant re-selection
 * without re-spawning.
 */
async function renderVariant(
  bin: string,
  source: string,
  variant: Variant,
): Promise<string | null> {
  const processed = preprocessSource(source);
  const key = `${variant}:${hashSource(processed)}`;

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
    const proc = Bun.spawn([bin, ...VARIANT_ARGS[variant], "-f", "-"], {
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
 * Try each variant in order and return the first whose widest line fits
 * `availableWidth`. Returns null if the binary fails outright, or if no
 * variant fits the budget (caller treats both as "no render available").
 *
 * On a budget of Infinity (e.g. tests that don't care about width) the
 * default variant is always selected as soon as it succeeds.
 */
async function pickBestVariant(
  bin: string,
  source: string,
  availableWidth: number,
): Promise<string | null> {
  for (const variant of VARIANT_ORDER) {
    const ascii = await renderVariant(bin, source, variant);
    // A spawn failure at the default variant means we give up on this
    // diagram entirely — retries with different args won't help.
    if (ascii === null) return null;
    if (maxLineWidth(ascii) <= availableWidth) return ascii;
  }
  // All variants ran successfully but none fit the width budget.
  return null;
}

/**
 * Collect every mermaid code block source from a markdown document.
 * Delegates to the shared walker so any future pre-pass (math, plantuml,
 * server-side SVG) gets identical traversal semantics for free.
 */
function collectMermaidSources(content: string): string[] {
  const sources: string[] = [];
  walkCodeFences(content, (block) => {
    if (block.lang === "mermaid") sources.push(block.text);
  });
  return sources;
}

/**
 * Pre-render all mermaid code blocks in the given markdown content.
 * Safe to call repeatedly — the cache makes unchanged content free.
 *
 * `availableWidth` is the target column budget for the widest line of
 * rendered ASCII. Diagrams that don't fit any variant within this budget
 * are omitted from the renders map so the dispatcher falls through to
 * raw-source rendering; `overflowed` reports how many were dropped this way.
 */
export async function prerenderMermaid(
  content: string,
  options: { disabled?: boolean; availableWidth?: number } = {},
): Promise<PrerenderResult> {
  const sources = collectMermaidSources(content);
  const hadBlocks = sources.length > 0;
  const availableWidth = options.availableWidth ?? Infinity;

  if (!hadBlocks || options.disabled) {
    return { renders: new Map(), hadBlocks, toolMissing: false, overflowed: 0 };
  }

  const bin = detectMermaidBin();
  if (!bin) {
    return { renders: new Map(), hadBlocks, toolMissing: true, overflowed: 0 };
  }

  // Dedupe: identical diagrams render once.
  const unique = Array.from(new Set(sources));
  const renders = new Map<string, string>();
  let overflowed = 0;

  // Bounded-parallel: render up to CONCURRENCY diagrams at a time. Each
  // diagram may spawn multiple variants serially, but diagrams themselves
  // are parallel across the batch.
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((src) => pickBestVariant(bin, src, availableWidth)),
    );
    for (let j = 0; j < batch.length; j++) {
      const output = results[j]!;
      if (output !== null) {
        renders.set(batch[j]!, output);
      } else {
        // Either a spawn failure or no variant fit — from the dispatcher's
        // perspective both mean "show raw source instead". Only width
        // overflow is interesting to report, but we can't cheaply tell them
        // apart here without plumbing a richer return type. Count all as
        // overflow — spawn failures are rare and user-visible anyway.
        overflowed++;
      }
    }
  }

  return { renders, hadBlocks, toolMissing: false, overflowed };
}

/**
 * Reset all module-level state. Exported for tests.
 */
export function _resetMermaidState(): void {
  binResolved = false;
  binPath = null;
  cacheDirResolved = null;
  memCache.clear();
}
