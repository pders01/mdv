/**
 * Clipboard operations with cross-platform support
 */

/**
 * Get the clipboard command for the current platform
 */
function getClipboardCommand(): string[] {
  const platform = process.platform;

  if (platform === "darwin") {
    return ["pbcopy"];
  } else if (platform === "linux") {
    // Try xclip first, fall back to xsel
    return ["xclip", "-selection", "clipboard"];
  } else if (platform === "win32") {
    return ["clip"];
  }

  throw new Error(`Clipboard not supported on platform: ${platform}`);
}

/**
 * Copy text to system clipboard
 * Supports macOS (pbcopy), Linux (xclip), and Windows (clip)
 */
export async function copyToClipboard(text: string): Promise<void> {
  const command = getClipboardCommand();

  const proc = Bun.spawn(command, {
    stdin: new Blob([text]),
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Clipboard command failed: ${stderr || `exit code ${exitCode}`}`);
  }
}
