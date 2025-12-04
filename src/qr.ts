import QRCode from "qrcode";

/**
 * Generate QR code as string for terminal display
 */
export async function generateQRCode(url: string): Promise<string> {
  try {
    // For utf8 type, we can only specify errorCorrectionLevel
    // The size is automatically determined for terminal display
    const qrString = await QRCode.toString(url, {
      type: "utf8",
      errorCorrectionLevel: "M",
    });
    return qrString;
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
    console.log(`\nor visit: ${url}\n`);
  } catch (error) {
    console.error("Failed to display QR code:", error);
    console.log(`\nor visit: ${url}\n`);
  }
}
