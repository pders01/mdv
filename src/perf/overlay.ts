/**
 * Live FPS overlay backed by OpenTUI's built-in renderer stats.
 *
 * Toggled via Ctrl-G in the TUI. When on, calls renderer.setGatherStats(true)
 * and polls getStats() on a 200 ms cadence — short enough that scroll-storm
 * regressions show up in real time, long enough that the overlay's own
 * re-render doesn't dominate the measurement.
 */

import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core";
import type { ThemeColors } from "../types.js";

const POLL_INTERVAL_MS = 200;

export interface PerfOverlay {
  /** Show the overlay and start gathering stats. Idempotent. */
  enable(): void;
  /** Hide the overlay and stop gathering stats. Idempotent. */
  disable(): void;
  /** Flip enabled state; returns the new state. */
  toggle(): boolean;
  isEnabled(): boolean;
}

export function createPerfOverlay(renderer: CliRenderer, colors: ThemeColors): PerfOverlay {
  const box = new BoxRenderable(renderer, {
    id: "perf-overlay",
    position: "absolute",
    top: 0,
    right: 0,
    paddingLeft: 1,
    paddingRight: 1,
    backgroundColor: colors.codeBg,
    zIndex: 100,
  });
  const text = new TextRenderable(renderer, {
    id: "perf-overlay-text",
    content: "fps —",
    fg: colors.green,
  });
  box.add(text);

  let enabled = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const refresh = () => {
    const s = renderer.getStats();
    // averageFrameTime / minFrameTime are in milliseconds.
    const fps = s.fps.toFixed(0);
    const avg = s.averageFrameTime.toFixed(1);
    const max = s.maxFrameTime.toFixed(1);
    text.content = `fps ${fps}  avg ${avg}ms  max ${max}ms`;
  };

  const enable = () => {
    if (enabled) return;
    enabled = true;
    renderer.setGatherStats(true);
    renderer.resetStats();
    renderer.root.add(box);
    refresh();
    pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
  };

  const disable = () => {
    if (!enabled) return;
    enabled = false;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    renderer.root.remove("perf-overlay");
    renderer.setGatherStats(false);
  };

  return {
    enable,
    disable,
    toggle: () => {
      if (enabled) disable();
      else enable();
      return enabled;
    },
    isEnabled: () => enabled,
  };
}
