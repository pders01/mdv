/**
 * Lightweight startup phase profiler.
 *
 * Wraps boot-time hotspots (parse, highlight, mermaid, render setup) in a
 * `phase("label", fn)` call that records elapsed milliseconds. `dumpPhases`
 * prints an aggregated table — one line per label, summed across calls
 * with the same label, plus a total. Disabled by default so production
 * runs pay no cost beyond a single boolean check.
 *
 * Used by `--debug` startup logging in tui.ts and the bench harness.
 */

let active = false;
const samples: Array<{ label: string; ms: number }> = [];

export function setPhaseEnabled(enabled: boolean): void {
  active = enabled;
}

export function isPhaseEnabled(): boolean {
  return active;
}

export async function phase<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
  if (!active) return await fn();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    samples.push({ label, ms: performance.now() - t0 });
  }
}

export function phaseSync<T>(label: string, fn: () => T): T {
  if (!active) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    samples.push({ label, ms: performance.now() - t0 });
  }
}

export function dumpPhases(prefix: string = "[perf]"): void {
  if (!active || samples.length === 0) return;

  // Aggregate by label so repeated phases (e.g. one renderNode call per
  // markdown block) collapse into a sum + count line.
  const groups = new Map<string, { ms: number; count: number }>();
  const order: string[] = [];
  for (const s of samples) {
    let g = groups.get(s.label);
    if (!g) {
      g = { ms: 0, count: 0 };
      groups.set(s.label, g);
      order.push(s.label);
    }
    g.ms += s.ms;
    g.count += 1;
  }

  const labelWidth = Math.max(...order.map((l) => l.length));
  let total = 0;
  for (const label of order) {
    const g = groups.get(label)!;
    total += g.ms;
    const cnt = g.count > 1 ? `  (${g.count}x)` : "";
    console.error(
      `${prefix} ${label.padEnd(labelWidth)}  ${g.ms.toFixed(2).padStart(8)} ms${cnt}`,
    );
  }
  console.error(
    `${prefix} ${"total".padEnd(labelWidth)}  ${total.toFixed(2).padStart(8)} ms`,
  );

  samples.length = 0;
}
