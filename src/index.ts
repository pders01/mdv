#!/usr/bin/env bun
/** Lazy entry dispatcher: help, stdout, TUI, and HTTP server. */
import { parseCliArgs, showHelp, listThemes } from "./cli.js";

async function main(): Promise<void> {
  const args = parseCliArgs(Bun.argv);

  if (args.showHelp) {
    showHelp();
    return;
  }
  if (args.showVersion) {
    const pkg = await import("../package.json");
    console.log(`mdv ${pkg.version}`);
    return;
  }
  if (args.listThemes) {
    await listThemes();
    return;
  }

  if (args.stdout) {
    const { startStdout } = await import("./stdout.js");
    await startStdout(args);
  } else if (args.serve) {
    const { startServer } = await import("./server/index.js");
    await startServer(args);
  } else {
    const { startTui } = await import("./tui.js");
    await startTui(args);
  }
}

try {
  await main();
} catch (error) {
  // A consumer such as `head` closing a pipe early is normal shell behavior.
  if ((error as NodeJS.ErrnoException)?.code === "EPIPE") process.exit(0);
  console.error(`mdv: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
