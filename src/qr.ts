import QRCode from "qrcode";

/**
 * Generate QR code as string for terminal display
 * Optimized for dark terminals (most common)
 */
export async function generateQRCode(url: string): Promise<string> {
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
 * Display QR code in terminal with URL
 */
export async function displayQRCode(url: string): Promise<void> {
  try {
    const qrString = await generateQRCode(url);
    console.log(qrString);
    console.log(`\nor visit: ${url}`);
  } catch (error) {
    console.error("Failed to display QR code:", error);
    console.log(`or visit: ${url}`);
  }
}
