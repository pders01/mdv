/**
 * File-system watching for `mdv serve --watch`.
 *
 * Mirrors the TUI's watch behavior in src/tui.ts so the user gets identical
 * semantics in both modes: recursive watch on directory mode, single-path
 * watch on file mode, 150ms debounce to coalesce rapid editor events,
 * reconnect-on-close to survive macOS's rename-based atomic saves.
 *
 * Each fs event triggers `onChange()` once (after debounce). The caller
 * broadcasts a reload message to every connected WebSocket client and the
 * browser handles the rest with `location.reload()`.
 */

import { watch, type FSWatcher } from "fs";

const DEBOUNCE_MS = 150;

export interface FileWatcher {
  close(): void;
}

interface WatchOptions {
  /** When true, watch recursively and only fire on .md files. */
  recursive: boolean;
  /**
   * Predicate to filter event paths in directory mode. Receives the
   * relative path emitted by `fs.watch`. Returning true skips the event.
   *
   * We deliberately use a stateless predicate (rather than a snapshot of
   * known paths) so newly created files trigger reloads — anything not
   * filtered out by the same exclude rules the sidebar scan uses is in
   * scope for live reload.
   */
  shouldIgnore?: (relativePath: string) => boolean;
}

/**
 * Start watching `target`. Calls `onChange()` once per logical change after
 * debouncing. Returns a handle that can be used to stop watching.
 *
 * For directory mode: watches recursively, only fires on .md files that
 * pass `shouldIgnore`. For single-file mode: watches the path directly
 * and re-establishes the watcher on close (macOS atomic-save workaround).
 */
export function startWatching(
  target: string,
  opts: WatchOptions,
  onChange: () => void,
): FileWatcher {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let watcher: FSWatcher | null = null;
  let closed = false;

  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!closed) onChange();
    }, DEBOUNCE_MS);
  };

  const start = (): void => {
    if (closed) return;

    if (opts.recursive) {
      watcher = watch(target, { recursive: true }, (_eventType, filename) => {
        if (!filename || !filename.endsWith(".md")) return;
        if (opts.shouldIgnore?.(filename)) return;
        fire();
      });
    } else {
      watcher = watch(target, () => fire());
      // Some editors (notably macOS Finder/TextEdit) save by writing to a
      // temp file and renaming over the target, which closes the watcher.
      // Re-establish it so the next save still fires.
      watcher.on("close", () => {
        if (!closed) setTimeout(start, 100);
      });
    }
  };

  start();

  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      watcher?.close();
    },
  };
}
