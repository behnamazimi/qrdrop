import QRCode from "qrcode";
import { copyToClipboard, isClipboardAvailable } from "./clipboard";

/**
 * Generate QR code as string for terminal display
 * Optimized for dark terminals (most common)
 * @param url - The URL to encode in the QR code
 * @returns QR code as a string with ANSI color codes for terminal display
 * @throws Error if QR code generation fails
 */
async function generateQRCode(url: string): Promise<string> {
  try {
    // Generate QR code with colors optimized for dark terminals
    const qrString = await QRCode.toString(url, {
      type: "utf8",
      errorCorrectionLevel: "M",
      color: {
        dark: "#FFFFFF", // White modules for dark terminals
        light: "#000000", // Black background
      },
    });

    // Add ANSI color codes to make QR code blocks appear white on dark terminals
    // The qrcode library uses block characters (█, ▓, etc.) for dark modules
    // We color all non-space characters white to ensure visibility
    const WHITE_FG = "\x1b[97m"; // Bright white foreground
    const RESET = "\x1b[0m";

    return qrString.replace(/([^\s\n])/g, `${WHITE_FG}$1${RESET}`);
  } catch (error) {
    throw new Error(
      `Failed to generate QR code: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Display QR code in terminal with URL below it and copy option
 * @param url - The URL to display as QR code and text
 * @param autoCopy - Whether to automatically copy URL to clipboard
 * @returns Promise that resolves when QR code is displayed
 * @note Falls back to displaying URL as text if QR code generation fails
 */
export async function displayQRCode(url: string, autoCopy: boolean = false): Promise<void> {
  try {
    const qrString = await generateQRCode(url);
    console.log(qrString);
    console.log(`\nor visit: ${url}`);

    // Try to copy to clipboard if requested
    if (autoCopy) {
      try {
        const available = await isClipboardAvailable();
        if (available) {
          await copyToClipboard(url);
          console.log("\n✓ URL copied to clipboard!");
        }
      } catch (error) {
        // Silently fail - clipboard copy is optional
      }
    } else {
      // Check if clipboard is available and show hint
      try {
        const available = await isClipboardAvailable();
        if (available) {
          console.log("\n💡 Tip: Use --copy-url to automatically copy URL to clipboard");
        }
      } catch {
        // Ignore clipboard check errors
      }
    }
  } catch (error) {
    console.error("Failed to display QR code:", error);
    console.log(`or visit: ${url}`);
  }
}
