#!/usr/bin/env bun
/**
 * mdv entry point. Dispatches to the TUI or HTTP server based on args.
 *
 * Help/version/list-themes are handled here so they print without paying the
 * cost of importing OpenTUI (TUI mode) or Bun.serve setup (server mode).
 */

import { parseCliArgs, showHelp, listThemes } from "./cli.js";

const args = parseCliArgs(Bun.argv);

if (args.showHelp) {
  showHelp();
  process.exit(0);
}

if (args.showVersion) {
  const pkg = await import("../package.json");
  console.log(`mdv ${pkg.version}`);
  process.exit(0);
}

if (args.listThemes) {
  await listThemes();
  process.exit(0);
}

if (args.serve) {
  const { startServer } = await import("./server/index.js");
  await startServer(args);
} else {
  const { startTui } = await import("./tui.js");
  await startTui(args);
}
