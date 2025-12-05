#!/usr/bin/env bun

import cliSpinners from "cli-spinners";
import { parseArgs } from "./src/cli";
import { getNetworkInfo } from "./src/network";
import { createServer } from "./src/server";
import { displayQRCode } from "./src/qr";
import { loadConfig, loadEnvVars, mergeConfig, getConfigPath } from "./src/config";
import { generateCompletion } from "./src/completion";
import { zipFiles } from "./src/zip";
import { resolve } from "path";
import { DEFAULT_TIMEOUT_MS } from "./src/constants";
import { initColors, color, success, error, info } from "./src/output";
import { logger } from "./src/logger";
import { open } from "fs/promises";
import { validateConfig } from "./src/config";
import { pickFilesInteractive, runConfigWizard, showStatus } from "./src/interactive";
import { SubCommand } from "./src/types/commands";
import { formatError } from "./src/utils/error";
import { generateCertificateCommand } from "./src/tls";

async function main() {
  try {
    const cliOptions = parseArgs();
    const { command } = cliOptions;

    // Handle completion command
    if (command.subcommand === SubCommand.Completion && command.completionShell) {
      const completion = generateCompletion(command.completionShell);
      console.log(completion);
      process.exit(0);
    }

    // Handle status subcommand
    if (command.subcommand === SubCommand.Status) {
      await showStatus();
      process.exit(0);
    }

    // Handle config init subcommand
    if (command.subcommand === SubCommand.ConfigInit) {
      await runConfigWizard();
      process.exit(0);
    }

    // Handle cert generate subcommand
    if (command.subcommand === SubCommand.CertGenerate) {
      // Parse cert-specific options (host, interface, cert, key)
      const certOptions = parseArgs();
      await generateCertificateCommand(
        certOptions.host,
        certOptions.interface,
        certOptions.cert,
        certOptions.key
      );
      process.exit(0);
    }

    // Load configuration (env vars < config file < CLI args)
    // Always load from default config path, unless --config specifies a custom path
    const envConfig = loadEnvVars();
    const configPath = cliOptions.config || getConfigPath();
    const fileConfig = await loadConfig(configPath);

    // Validate config file
    const validation = validateConfig(fileConfig);
    if (!validation.valid) {
      console.error(error("Configuration file validation failed:"));
      validation.errors.forEach((err) => console.error(`  - ${err}`));
      process.exit(1);
    }

    const options = mergeConfig(cliOptions, fileConfig, envConfig);

    // Initialize colors (respect --no-color flag)
    initColors(!options.noColor);

    // Initialize logger
    const logLevel = options.debug ? "debug" : options.verbose ? "info" : "warn";
    if (options.logFile) {
      try {
        const logFileHandle = await open(options.logFile, "a");
        logger.setFileHandle(logFileHandle);
      } catch (err) {
        console.warn(`Warning: Could not open log file: ${err}`);
      }
    }
    logger.init(logLevel, options.jsonLog, options.logFile);

    // Branding
    console.log(`${color.cyan("qrdrop")} - LAN file sharing\n`);
    logger.info("qrdrop started", { options: { ...options, files: options.files.length } });

    // Resolve output directory (default to current working directory)
    const outputDirectory = resolve(options.output || process.cwd());

    // Build file paths list
    let filePaths: string[] = [];

    // Handle interactive file picker
    if (command.subcommand === SubCommand.Interactive) {
      const interactiveFiles = await pickFilesInteractive();
      if (interactiveFiles) {
        filePaths.push(...interactiveFiles);
      }
    }

    // Add individual files
    filePaths.push(...options.files.map((f) => resolve(f)));

    // Add directory if specified
    if (options.directory) {
      filePaths.push(resolve(options.directory));
    }

    // Handle zip if requested
    if (options.zip && filePaths.length > 0) {
      try {
        // Show spinner while zipping
        const spinner = cliSpinners.dots;
        let spinnerIndex = 0;

        const updateSpinner = () => {
          const frame = spinner.frames[spinnerIndex % spinner.frames.length] ?? "⠋";
          process.stdout.write(`\r${color.cyan(frame)} Zipping files...`);
          spinnerIndex++;
        };

        // Start spinner
        updateSpinner();
        const spinnerInterval = setInterval(updateSpinner, spinner.interval);

        const zipPath = await zipFiles(filePaths);

        // Stop spinner and clear line
        clearInterval(spinnerInterval);
        process.stdout.write("\r" + " ".repeat(80) + "\r");

        // Replace file paths with the zip file
        filePaths = [zipPath];
        console.log(`${success(`Files zipped to: ${zipPath}`)}\n`);
      } catch (err) {
        console.error(error(`Error creating zip file: ${formatError(err)}`));
        process.exit(1);
      }
    }

    // Get network information
    const networkInfo = await getNetworkInfo(
      options.host,
      options.port,
      options.secure,
      options.interface,
      options.path
    );

    // Create and start server
    const server = await createServer({
      options,
      networkInfo,
      filePaths,
      outputDirectory,
    });

    // Build URL (includes path)
    const url = networkInfo.url;

    // Display QR code
    await displayQRCode(url, options.copyUrl);

    // Set up ephemeral timeout (default: 10 minutes)
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (!options.keepAlive) {
      const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
      timeoutId = setTimeout(async () => {
        console.log("\nServer timeout reached. Shutting down...");
        server.stop();
        await logger.close();
        process.exit(0);
      }, timeoutMs);

      // Log timeout info
      const timeoutMinutes = Math.floor(timeoutMs / 60000);
      const timeoutSeconds = Math.floor((timeoutMs % 60000) / 1000);
      if (timeoutMinutes > 0) {
        console.log(
          info(
            `Server will auto-close in ${timeoutMinutes} minute${timeoutMinutes > 1 ? "s" : ""}${timeoutSeconds > 0 ? ` ${timeoutSeconds} second${timeoutSeconds > 1 ? "s" : ""}` : ""}.`
          )
        );
      } else {
        console.log(
          info(
            `Server will auto-close in ${timeoutSeconds} second${timeoutSeconds > 1 ? "s" : ""}.`
          )
        );
      }
    }

    // Handle graceful shutdown
    const shutdown = async () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      // Restore stdin to normal mode if it was set to raw mode
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      console.log(`\n${info("Server stopped.")}`);
      server.stop();
      // Close logger to flush any pending writes
      await logger.close();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Set up "press q to quit" functionality
    if (process.stdin.isTTY) {
      // Set stdin to raw mode to capture individual keypresses
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");

      process.stdin.on("data", (key: string) => {
        // Handle 'q' or 'Q' to quit
        if (key === "q" || key === "Q") {
          shutdown();
        }
        // Handle Ctrl+C (\u0003) - in raw mode, we need to handle it explicitly
        else if (key === "\u0003") {
          shutdown();
        }
      });

      // Display hint after QR code
      console.log(color.gray("Press 'q' to quit"));
    }
  } catch (err) {
    console.error(error(`Error: ${formatError(err)}`));
    process.exit(1);
  }
}

main();
