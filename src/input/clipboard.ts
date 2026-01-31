/**
 * Clipboard operations
 */

/**
 * Copy text to clipboard using pbcopy (macOS)
 */
export async function copyToClipboard(text: string): Promise<void> {
  const proc = Bun.spawn(["pbcopy"], {
    stdin: new Blob([text]),
  });
  await proc.exited;
}
