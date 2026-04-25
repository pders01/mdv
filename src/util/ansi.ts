/**
 * Minimal ANSI styling helpers — no dependencies.
 *
 * Detects terminal-color support via NO_COLOR / FORCE_COLOR and the TTY-ness
 * of the destination stream. The default styling helpers below check stderr
 * because the server log/banner writes there; if the caller wants stdout
 * colors (e.g. when emitting `--list-themes` to a TTY pipeline), they should
 * use `colorize(stream, ...)` to inspect the right stream.
 *
 * Returns the input unchanged when colors won't render so logs stay clean
 * in CI and when piped to a file.
 */

const CSI = "\x1b[";

export function supportsColor(stream: NodeJS.WriteStream): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(stream.isTTY);
}

const enabled = supportsColor(process.stderr);

function wrap(open: number, close: number) {
  if (!enabled) return (s: string) => s;
  const o = `${CSI}${open}m`;
  const c = `${CSI}${close}m`;
  return (s: string) => `${o}${s}${c}`;
}

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const red = wrap(31, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const cyan = wrap(36, 39);
export const gray = wrap(90, 39);
