/**
 * System appearance detection for the `auto` theme.
 *
 * Stacks cheap signals before falling back to OS queries so startup stays
 * fast: env override > COLORFGBG (terminal-provided) > platform probe.
 * Probes are bounded by a short timeout and default to "dark" on failure.
 */

import { spawnSync } from "child_process";

export type Appearance = "light" | "dark";

const LIGHT_THEME = "github-light";
const DARK_THEME = "github-dark";
const PROBE_TIMEOUT_MS = 300;

export function detectSystemAppearance(): Appearance {
  const override = process.env.MDV_APPEARANCE?.toLowerCase();
  if (override === "light" || override === "dark") return override;

  const fromColorfgbg = parseColorfgbg(process.env.COLORFGBG);
  if (fromColorfgbg) return fromColorfgbg;

  if (process.platform === "darwin") {
    // `defaults read -g AppleInterfaceStyle` exits 0 with "Dark" in dark mode;
    // exits non-zero (key absent) in light mode.
    const r = spawnSync("defaults", ["read", "-g", "AppleInterfaceStyle"], {
      timeout: PROBE_TIMEOUT_MS,
      encoding: "utf8",
    });
    if (r.status === 0) return /dark/i.test(r.stdout ?? "") ? "dark" : "light";
    if (r.error === undefined) return "light";
  }

  if (process.platform === "linux") {
    const r = spawnSync("gsettings", ["get", "org.gnome.desktop.interface", "color-scheme"], {
      timeout: PROBE_TIMEOUT_MS,
      encoding: "utf8",
    });
    if (r.status === 0) {
      const out = (r.stdout ?? "").toLowerCase();
      if (out.includes("dark")) return "dark";
      if (out.includes("light") || out.includes("default")) return "light";
    }
  }

  return "dark";
}

/**
 * Parse `COLORFGBG`. Format is `fg;bg` or `fg;extra;bg` with ANSI color
 * indices. rxvt convention: bg 0–6 = dark, 7–15 = light, with 8 (bright
 * black) treated as dark.
 */
function parseColorfgbg(value: string | undefined): Appearance | null {
  if (!value) return null;
  const parts = value.split(";");
  const last = parts[parts.length - 1];
  if (last === undefined) return null;
  const bg = Number.parseInt(last, 10);
  if (!Number.isFinite(bg)) return null;
  return bg >= 7 && bg !== 8 ? "light" : "dark";
}

/**
 * Resolve a CLI `--theme` argument. The literal `"auto"` is mapped to a
 * concrete Shiki theme based on detected system appearance. Any other value
 * passes through unchanged so users can override.
 */
export function resolveTheme(themeArg: string): string {
  if (themeArg !== "auto") return themeArg;
  return detectSystemAppearance() === "light" ? LIGHT_THEME : DARK_THEME;
}

/**
 * Theme spec for contexts that can serve both variants at once (the web UI).
 *
 * `auto` becomes a `dual` spec so the page can swap themes via
 * `prefers-color-scheme` on the client — independent of the host OS the
 * server runs on. Any explicit theme stays single.
 */
export type ThemeSpec =
  | { kind: "single"; name: string }
  | { kind: "dual"; light: string; dark: string };

export function resolveThemeSpec(themeArg: string): ThemeSpec {
  if (themeArg === "auto") return { kind: "dual", light: LIGHT_THEME, dark: DARK_THEME };
  return { kind: "single", name: themeArg };
}
