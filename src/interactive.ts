/**
 * Interactive CLI mode
 * Uses @clack/prompts for beautiful, modern CLI interactions
 */

import { readdir, readFile, mkdir, writeFile, exists } from "fs/promises";
import { resolve, join, basename, dirname } from "path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import * as toml from "@iarna/toml";
import { getConfigPath, type Config } from "./config";
import { formatError } from "./utils/error";
import { isFileTypeAllowed } from "./security";

/**
 * Interactive file picker
 * @param startPath - Directory to pick files from (default: current working directory)
 * @param allowedTypes - Optional array of allowed file extensions to filter by
 * @returns Array of selected file paths, or null if cancelled
 */
export async function pickFilesInteractive(
  startPath: string = process.cwd(),
  allowedTypes?: string[]
): Promise<string[] | null> {
  const currentPath = resolve(startPath);

  p.intro(pc.cyan(`Selecting files from: ${currentPath}`));

  try {
    const entries = await readdir(currentPath, { withFileTypes: true });
    let files = entries
      .filter((e) => e.isFile())
      .map((e) => join(currentPath, e.name))
      .sort();

    // Filter by allowed types if specified
    if (allowedTypes && allowedTypes.length > 0) {
      files = files.filter((file) => isFileTypeAllowed(basename(file), allowedTypes));
      if (files.length === 0) {
        p.log.warning(`No files matching allowed types (${allowedTypes.join(", ")}) found.`);
        p.outro("Cancelled");
        return null;
      }
      p.log.info(`Filtering by types: ${allowedTypes.join(", ")}`);
    }

    if (files.length === 0) {
      p.log.warning("No files found in this directory.");
      p.outro("Cancelled");
      return null;
    }

    const options = [
      ...files.map((file, index) => ({
        value: file,
        label: `${index + 1}. ${basename(file)}`,
      })),
      { value: "__ALL__", label: pc.bold("All files") },
    ];

    const selected = await p.multiselect({
      message: "Select files to share",
      options,
      required: false,
    });

    if (p.isCancel(selected)) {
      p.cancel("Cancelled");
      return null;
    }

    // Handle "All files" selection
    if (selected.includes("__ALL__")) {
      p.log.success(`Selected all ${files.length} files.`);
      return files;
    }

    if (selected.length === 0) {
      p.log.warning("No files selected.");
      p.outro("Cancelled");
      return null;
    }

    p.log.success(`Selected ${selected.length} file(s).`);
    return selected as string[];
  } catch (error) {
    p.log.error(`Error reading directory: ${error}`);
    return null;
  }
}

/**
 * Config wizard - creates config file interactively
 */
export async function runConfigWizard(): Promise<void> {
  const configPath = getConfigPath();

  p.intro(pc.cyan("qrdrop Configuration Wizard"));

  console.log(pc.gray("This wizard will help you create a configuration file."));
  console.log(pc.gray("Press Enter to skip a setting and use the default."));
  console.log(pc.gray("Press Ctrl+C to cancel.\n"));

  const config: Partial<Config> = {};

  try {
    // Output directory
    const outputDir = await p.text({
      message: "Output directory for received files",
      placeholder: "current directory (default)",
    });

    if (p.isCancel(outputDir)) {
      p.cancel("Configuration cancelled.");
      return;
    }

    if (outputDir && typeof outputDir === "string" && outputDir.trim()) {
      config.output = outputDir.trim();
    }

    // Port
    const portStr = await p.text({
      message: "Default port",
      placeholder: "auto-discover (default)",
      validate: (value) => {
        if (!value) return;
        const port = parseInt(value, 10);
        if (isNaN(port) || port <= 0 || port > 65535) {
          return "Invalid port number (1-65535)";
        }
      },
    });

    if (p.isCancel(portStr)) {
      p.cancel("Configuration cancelled.");
      return;
    }

    if (portStr && typeof portStr === "string" && portStr.trim()) {
      config.port = parseInt(portStr.trim(), 10);
    }

    // Secure
    const secure = await p.confirm({
      message: "Enable HTTPS/TLS by default?",
      initialValue: false,
    });

    if (p.isCancel(secure)) {
      p.cancel("Configuration cancelled.");
      return;
    }

    if (secure) {
      config.secure = true;
    }

    // Timeout
    const timeoutStr = await p.text({
      message: "Default timeout in seconds",
      placeholder: "600 (default)",
      validate: (value) => {
        if (!value) return;
        const timeout = parseInt(value, 10);
        if (isNaN(timeout) || timeout <= 0) {
          return "Invalid timeout (must be positive number)";
        }
      },
    });

    if (p.isCancel(timeoutStr)) {
      p.cancel("Configuration cancelled.");
      return;
    }

    if (timeoutStr && typeof timeoutStr === "string" && timeoutStr.trim()) {
      config.timeout = parseInt(timeoutStr.trim(), 10);
    }

    // Keep alive
    const keepAlive = await p.confirm({
      message: "Keep server alive indefinitely?",
      initialValue: false,
    });

    if (p.isCancel(keepAlive)) {
      p.cancel("Configuration cancelled.");
      return;
    }

    if (keepAlive) {
      config.keepAlive = true;
    }

    // Copy URL
    const copyUrl = await p.confirm({
      message: "Automatically copy URL to clipboard?",
      initialValue: false,
    });

    if (p.isCancel(copyUrl)) {
      p.cancel("Configuration cancelled.");
      return;
    }

    if (copyUrl) {
      config.copyUrl = true;
    }

    // Convert config to TOML
    const configString = toml.stringify(config as Record<string, unknown>);

    // Ensure config directory exists
    const dir = dirname(configPath);
    await mkdir(dir, { recursive: true });

    // Check if config already exists
    if (await exists(configPath)) {
      const overwrite = await p.confirm({
        message: "Config file already exists. Overwrite?",
        initialValue: false,
      });

      if (p.isCancel(overwrite) || !overwrite) {
        p.cancel("Existing config preserved.");
        return;
      }
    }

    // Write config file
    await writeFile(
      configPath,
      `# qrdrop configuration file
# Generated by: qrdrop config init
# This file uses TOML format

${configString}
`,
      "utf-8"
    );

    p.log.success(`Configuration file created at: ${configPath}`);
    console.log(pc.gray("\nYou can edit this file manually or run 'qrdrop config init' again.\n"));

    // Show summary
    p.note(
      Object.keys(config).length > 0
        ? Object.entries(config)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n")
        : "(Using all defaults)",
      "Configuration summary"
    );

    p.outro("Configuration complete!");
  } catch (error) {
    p.log.error(`Error: ${formatError(error)}`);
    throw error;
  }
}

/**
 * Show server status
 */
export async function showStatus(): Promise<void> {
  const configPath = getConfigPath();

  p.intro(pc.cyan("qrdrop Status"));

  // Check config file
  p.log.step("Configuration:");
  if (await exists(configPath)) {
    p.log.success(`Config file: ${configPath}`);
    try {
      const content = await readFile(configPath, "utf-8");
      const config = toml.parse<Config>(content);
      const keys = Object.keys(config);
      if (keys.length > 0) {
        console.log(pc.gray(`    Settings: ${keys.join(", ")}`));
      }
    } catch {
      console.log(pc.yellow("    (Could not read config)"));
    }
  } else {
    p.log.warning("No config file found");
    console.log(pc.gray(`    Run 'qrdrop config init' to create one`));
  }

  console.log();
  p.log.step("Server:");
  p.log.warning("Not running");
  console.log(pc.gray("    Start with: qrdrop [options]"));

  p.note(
    `qrdrop                    Start server (upload via web UI)
qrdrop --file <path>      Share a file
qrdrop --directory        Share current directory
qrdrop --help             Show all options`,
    "Quick commands"
  );

  p.outro("Done");
}
