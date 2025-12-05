import clipboard from "clipboardy";

/**
 * Copy text to clipboard (cross-platform)
 * @param text - Text to copy to clipboard
 * @returns Promise that resolves when text is copied
 * @throws Error if clipboard operation fails
 */
export async function copyToClipboard(text: string): Promise<void> {
  await clipboard.write(text);
}

/**
 * Check if clipboard is available on this platform
 * @returns true if clipboard command is available, false otherwise
 */
export async function isClipboardAvailable(): Promise<boolean> {
  try {
    // Try to read from clipboard to check availability
    await clipboard.read();
    return true;
  } catch {
    return false;
  }
}
