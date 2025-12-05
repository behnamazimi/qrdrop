import { readFile } from "fs/promises";
import { exists } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import * as toml from "@iarna/toml";
import type { CliOptions } from "./cli";
import { formatError, isNotFoundError } from "./utils/error";

export interface Config {
  files?: string[];
  directory?: string;
  output?: string;
  secure?: boolean;
  port?: number;
  host?: string;
  timeout?: number;
  keepAlive?: boolean;
  interface?: string;
  zip?: boolean;
  path?: string; // Internal: URL path
  urlPath?: string; // Config file: URL path (preferred name)
  copyUrl?: boolean;
  noColor?: boolean;
  verbose?: boolean;
  debug?: boolean;
  jsonLog?: boolean;
}

/**
 * Get the configuration directory path based on platform
 * @returns Config directory path: ~/.config/qrdrop on Linux/macOS, %APPDATA%/qrdrop on Windows
 */
function getConfigDir(): string {
  const platform = process.platform;
  if (platform === "win32") {
    const appData = process.env["APPDATA"] || join(homedir(), "AppData", "Roaming");
    return join(appData, "qrdrop");
  } else {
    const xdgConfig = process.env["XDG_CONFIG_HOME"] || join(homedir(), ".config");
    return join(xdgConfig, "qrdrop");
  }
}

/**
 * Get the configuration file path
 * @param customPath - Optional custom path, otherwise uses default location
 * @returns Full path to configuration file
 */
export function getConfigPath(customPath?: string): string {
  if (customPath) {
    return customPath;
  }
  return join(getConfigDir(), "config.toml");
}

/**
 * Load configuration from TOML file
 * @param configPath - Optional custom path to config file, otherwise uses default location
 * @returns Configuration object with values from file, or empty object if file doesn't exist
 * @note Timeout values are automatically converted from seconds to milliseconds
 */
export async function loadConfig(configPath?: string): Promise<Config> {
  const path = getConfigPath(configPath);

  try {
    if (await exists(path)) {
      const content = await readFile(path, "utf-8");
      const config = toml.parse<Config>(content);

      // Convert timeout from seconds to milliseconds if present
      if (config.timeout !== undefined) {
        config.timeout = config.timeout * 1000;
      }

      // Support both 'urlPath' (preferred) and 'path' (legacy) for URL path config
      if (config.urlPath !== undefined && config.path === undefined) {
        config.path = config.urlPath;
      }

      return config;
    }
  } catch (err) {
    // If file doesn't exist or can't be read, return empty config
    // Don't throw - config file is optional
    if (!isNotFoundError(err)) {
      console.warn(`Warning: Could not load config file ${path}: ${formatError(err)}`);
    }
  }

  return {};
}

/**
 * Load configuration from environment variables with QRDROP_ prefix
 * @returns Partial configuration object with values from environment variables
 * @note Boolean values accept: true, 1, false, 0 (case-insensitive)
 * @note Timeout values are automatically converted from seconds to milliseconds
 */
export function loadEnvVars(): Partial<Config> {
  const config: Partial<Config> = {};

  // Map environment variables to config keys
  const envMap: Record<string, keyof Config> = {
    QRDROP_FILES: "files",
    QRDROP_DIRECTORY: "directory",
    QRDROP_OUTPUT: "output",
    QRDROP_SECURE: "secure",
    QRDROP_PORT: "port",
    QRDROP_HOST: "host",
    QRDROP_TIMEOUT: "timeout",
    QRDROP_KEEP_ALIVE: "keepAlive",
    QRDROP_INTERFACE: "interface",
    QRDROP_ZIP: "zip",
    QRDROP_PATH: "path",
    QRDROP_COPY_URL: "copyUrl",
    QRDROP_NO_COLOR: "noColor",
  };

  for (const [envKey, configKey] of Object.entries(envMap)) {
    const value = process.env[envKey];
    if (value !== undefined) {
      // Type conversion
      if (
        configKey === "secure" ||
        configKey === "keepAlive" ||
        configKey === "zip" ||
        configKey === "copyUrl" ||
        configKey === "noColor"
      ) {
        config[configKey] = value.toLowerCase() === "true" || value === "1";
      } else if (configKey === "port" || configKey === "timeout") {
        const num = parseInt(value, 10);
        if (!isNaN(num)) {
          config[configKey] = num;
        }
      } else if (configKey === "files") {
        // Split comma-separated files
        config[configKey] = value.split(",").map((f) => f.trim());
      } else {
        // String config values: directory, output, host, interface, path
        (config as Record<string, unknown>)[configKey] = value;
      }
    }
  }

  // Convert timeout from seconds to milliseconds if present
  if (config.timeout !== undefined) {
    config.timeout = config.timeout * 1000;
  }

  return config;
}

/**
 * Validate configuration
 * @param config - Configuration object to validate
 * @returns Object with valid flag and error messages
 */
export function validateConfig(config: Config): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.port !== undefined) {
    if (typeof config.port !== "number" || config.port < 1 || config.port > 65535) {
      errors.push(`Invalid port: ${config.port}. Must be between 1 and 65535.`);
    }
  }

  if (config.timeout !== undefined) {
    if (typeof config.timeout !== "number" || config.timeout < 0) {
      errors.push(`Invalid timeout: ${config.timeout}. Must be a positive number.`);
    }
  }

  if (config.keepAlive !== undefined && typeof config.keepAlive !== "boolean") {
    errors.push(`Invalid keepAlive: ${config.keepAlive}. Must be a boolean.`);
  }

  if (config.secure !== undefined && typeof config.secure !== "boolean") {
    errors.push(`Invalid secure: ${config.secure}. Must be a boolean.`);
  }

  if (config.zip !== undefined && typeof config.zip !== "boolean") {
    errors.push(`Invalid zip: ${config.zip}. Must be a boolean.`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Merge configurations with precedence: env vars < config file < CLI args
 */
export function mergeConfig(
  cliOptions: CliOptions,
  fileConfig: Config,
  envConfig: Partial<Config>
): CliOptions {
  // Start with env vars (lowest priority)
  const merged: CliOptions = {
    files: envConfig.files || [],
    secure: envConfig.secure || false,
    keepAlive: envConfig.keepAlive || false,
    zip: envConfig.zip || false,
    copyUrl: envConfig.copyUrl || false,
    noColor: envConfig.noColor || false,
    verbose: envConfig.verbose || false,
    debug: envConfig.debug || false,
    jsonLog: envConfig.jsonLog || false,
    command: cliOptions.command, // Preserve command from CLI
  };

  // Apply file config (medium priority)
  if (fileConfig.files) merged.files = [...merged.files, ...fileConfig.files];
  if (fileConfig.directory !== undefined) merged.directory = fileConfig.directory;
  if (fileConfig.output !== undefined) merged.output = fileConfig.output;
  if (fileConfig.secure !== undefined) merged.secure = fileConfig.secure;
  if (fileConfig.port !== undefined) merged.port = fileConfig.port;
  if (fileConfig.host !== undefined) merged.host = fileConfig.host;
  if (fileConfig.timeout !== undefined) merged.timeout = fileConfig.timeout;
  if (fileConfig.keepAlive !== undefined) merged.keepAlive = fileConfig.keepAlive;
  if (fileConfig.interface !== undefined) merged.interface = fileConfig.interface;
  if (fileConfig.zip !== undefined) merged.zip = fileConfig.zip;
  if (fileConfig.path !== undefined) merged.path = fileConfig.path;
  if (fileConfig.copyUrl !== undefined) merged.copyUrl = fileConfig.copyUrl;
  if (fileConfig.noColor !== undefined) merged.noColor = fileConfig.noColor;
  if (fileConfig.verbose !== undefined) merged.verbose = fileConfig.verbose;
  if (fileConfig.debug !== undefined) merged.debug = fileConfig.debug;
  if (fileConfig.jsonLog !== undefined) merged.jsonLog = fileConfig.jsonLog;

  // Apply CLI options (highest priority) - these override everything
  // Note: Boolean flags only override when true (user explicitly passed the flag)
  // This allows config file settings to be used when flags aren't passed
  if (cliOptions.files.length > 0) merged.files = cliOptions.files;
  if (cliOptions.directory !== undefined) merged.directory = cliOptions.directory;
  if (cliOptions.output !== undefined) merged.output = cliOptions.output;
  if (cliOptions.secure) merged.secure = cliOptions.secure;
  if (cliOptions.cert !== undefined) merged.cert = cliOptions.cert;
  if (cliOptions.key !== undefined) merged.key = cliOptions.key;
  if (cliOptions.port !== undefined) merged.port = cliOptions.port;
  if (cliOptions.host !== undefined) merged.host = cliOptions.host;
  if (cliOptions.timeout !== undefined) merged.timeout = cliOptions.timeout;
  if (cliOptions.keepAlive) merged.keepAlive = cliOptions.keepAlive;
  if (cliOptions.interface !== undefined) merged.interface = cliOptions.interface;
  if (cliOptions.zip) merged.zip = cliOptions.zip;
  if (cliOptions.path !== undefined) merged.path = cliOptions.path;
  if (cliOptions.copyUrl) merged.copyUrl = cliOptions.copyUrl;
  if (cliOptions.noColor) merged.noColor = cliOptions.noColor;
  if (cliOptions.verbose) merged.verbose = cliOptions.verbose;
  if (cliOptions.debug) merged.debug = cliOptions.debug;
  if (cliOptions.jsonLog) merged.jsonLog = cliOptions.jsonLog;
  if (cliOptions.allowIps !== undefined) merged.allowIps = cliOptions.allowIps;
  if (cliOptions.rateLimit !== undefined) merged.rateLimit = cliOptions.rateLimit;
  if (cliOptions.rateLimitWindow !== undefined) merged.rateLimitWindow = cliOptions.rateLimitWindow;
  if (cliOptions.allowedTypes !== undefined) merged.allowedTypes = cliOptions.allowedTypes;
  if (cliOptions.logFile !== undefined) merged.logFile = cliOptions.logFile;
  if (cliOptions.config !== undefined) merged.config = cliOptions.config;

  return merged;
}
