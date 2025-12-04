#!/usr/bin/env bun

import { parseArgs } from "./src/cli";
import { getNetworkInfo } from "./src/network";
import { createServer } from "./src/server";
import { displayQRCode } from "./src/qr";
import { resolve } from "path";

async function main() {
  try {
    // Parse CLI arguments
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    // Branding
    console.log("qrdrop - LAN file sharing\n");

    // Resolve output directory (default to current working directory)
    const outputDirectory = resolve(options.output || process.cwd());

    // Build file paths list
    const filePaths: string[] = [];

    // Add individual files
    filePaths.push(...options.files.map((f) => resolve(f)));

    // Add directory if specified
    if (options.directory) {
      filePaths.push(resolve(options.directory));
    }

    // Get network information
    const networkInfo = await getNetworkInfo(options.host, options.port, options.secure);

    // Create and start server
    const server = await createServer({
      options,
      networkInfo,
      filePaths,
      outputDirectory,
    });

    // Build URL
    const url = networkInfo.url;

    // Display QR code
    await displayQRCode(url);

    // Set up ephemeral timeout (default: 10 minutes)
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const DEFAULT_TIMEOUT = 10 * 60 * 1000; // 10 minutes in milliseconds

    if (!options.noTimeout) {
      const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT;
      timeoutId = setTimeout(() => {
        console.log("\nServer timeout reached. Shutting down...");
        server.stop();
        process.exit(0);
      }, timeoutMs);

      // Log timeout info
      const timeoutMinutes = Math.floor(timeoutMs / 60000);
      const timeoutSeconds = Math.floor((timeoutMs % 60000) / 1000);
      if (timeoutMinutes > 0) {
        console.log(
          `Server will auto-close in ${timeoutMinutes} minute${timeoutMinutes > 1 ? "s" : ""}${timeoutSeconds > 0 ? ` ${timeoutSeconds} second${timeoutSeconds > 1 ? "s" : ""}` : ""}.\n`
        );
      } else {
        console.log(
          `Server will auto-close in ${timeoutSeconds} second${timeoutSeconds > 1 ? "s" : ""}.\n`
        );
      }
    }

    // Handle graceful shutdown
    const shutdown = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      console.log("\nServer stopped.");
      server.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
