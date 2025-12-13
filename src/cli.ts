import { parseArgs as bunParseArgs } from "util";
import { initColors, color } from "./output";
import { SubCommand, type ParsedCommand } from "./types/commands";
import { readFileSync } from "fs";
import { join } from "path";

// Build-time constant injected during compilation
// If not defined (development mode), will be undefined
declare const BUILD_VERSION: string | undefined;

export interface CliOptions {
  files: string[];
  directory?: string;
  output?: string;
  secure: boolean;
  port?: number;
  host?: string;
  timeout?: number; // Timeout in milliseconds, undefined means use default (10 minutes)
  keepAlive: boolean; // If true, disable timeout (run indefinitely)
  interface?: string; // Network interface name or "any"
  zip: boolean; // If true, zip files/directories before sharing
  path?: string; // Custom URL path
  config?: string; // Custom config file path
  copyUrl: boolean; // If true, automatically copy URL to clipboard
  noColor: boolean; // If true, disable colored output
  allowIps?: string[]; // Allowed IP addresses (comma-separated)
  rateLimit?: number; // Rate limit: max requests per window
  rateLimitWindow?: number; // Rate limit window in seconds
  allowedTypes?: string[]; // Allowed file types/extensions (comma-separated)
  verbose: boolean; // Verbose logging
  debug: boolean; // Debug logging
  logFile?: string; // Log file path
  jsonLog: boolean; // JSON log format
  cert?: string; // Custom TLS certificate file path
  key?: string; // Custom TLS private key file path
  /** Parsed subcommand information */
  command: ParsedCommand;
}

// Define the parseArgs options configuration with proper types
const parseArgsConfig = {
  file: { type: "string", short: "f", multiple: true },
  directory: { type: "string", short: "d" },
  output: { type: "string", short: "o" },
  secure: { type: "boolean", default: false },
  port: { type: "string" },
  host: { type: "string" },
  timeout: { type: "string" },
  "keep-alive": { type: "boolean", default: false },
  interface: { type: "string" },
  zip: { type: "boolean", default: false },
  "url-path": { type: "string" },
  config: { type: "string" },
  "copy-url": { type: "boolean", default: false },
  "no-color": { type: "boolean", default: false },
  "allow-ips": { type: "string" },
  "rate-limit": { type: "string" },
  "rate-limit-window": { type: "string" },
  "allow-types": { type: "string" },
  verbose: { type: "boolean", default: false },
  debug: { type: "boolean", default: false },
  "log-file": { type: "string" },
  "json-log": { type: "boolean", default: false },
  help: { type: "boolean", short: "h", default: false },
  version: { type: "boolean", short: "v", default: false },
  interactive: { type: "boolean", default: false, short: "i" },
  cert: { type: "string" },
  key: { type: "string" },
} as const;

/**
 * Parse subcommand from positional arguments
 */
function parseSubcommand(args: string[]): ParsedCommand {
  if (args[0] === "status") {
    return { subcommand: SubCommand.Status };
  }

  if (args[0] === "config" && args[1] === "init") {
    return { subcommand: SubCommand.ConfigInit };
  }

  if (args[0] === "completion" && args[1]) {
    return { subcommand: SubCommand.Completion, completionShell: args[1] };
  }

  if (args[0] === "cert" && args[1] === "generate") {
    return { subcommand: SubCommand.CertGenerate };
  }

  return { subcommand: SubCommand.None };
}

/**
 * Parse command-line arguments into CliOptions using Bun's parseArgs
 * @returns Parsed CLI options object
 * @throws Error if required argument values are missing or invalid
 * @note Handles special case: --file . is treated as current directory
 */
export function parseArgs(): CliOptions {
  const { values, positionals } = bunParseArgs({
    args: Bun.argv,
    options: parseArgsConfig,
    strict: false, // Allow positional arguments and unknown options for subcommands
    allowPositionals: true,
  });

  // Initialize colors based on --no-color flag
  const noColor = values["no-color"] === true;
  initColors(!noColor);

  // Handle help flag
  if (values.help === true) {
    printHelp();
    process.exit(0);
  }

  // Handle version flag (--version or -v)
  if (values.version === true) {
    printVersion();
    process.exit(0);
  }

  // Parse subcommand
  const command = parseSubcommand(positionals);

  // For early-exit subcommands, return minimal options
  if (
    command.subcommand === SubCommand.Status ||
    command.subcommand === SubCommand.ConfigInit ||
    command.subcommand === SubCommand.Completion ||
    command.subcommand === SubCommand.CertGenerate
  ) {
    return createDefaultOptions(noColor, command);
  }

  // Build options object
  const options: CliOptions = {
    files: [],
    secure: values.secure === true,
    keepAlive: values["keep-alive"] === true,
    zip: values.zip === true,
    copyUrl: values["copy-url"] === true,
    noColor,
    verbose: values.verbose === true,
    debug: values.debug === true,
    jsonLog: values["json-log"] === true,
    command,
  };

  // Handle --interactive option
  if (values.interactive === true) {
    options.command = { subcommand: SubCommand.Interactive };
  }

  // Handle --file option (can be multiple)
  if (values.file) {
    const files = Array.isArray(values.file) ? values.file : [values.file];
    for (const file of files) {
      if (typeof file === "string") {
        if (file === ".") {
          options.directory = process.cwd();
        } else {
          options.files.push(file);
        }
      }
    }
  }

  // Handle --directory option
  if (typeof values.directory === "string") {
    options.directory = values.directory || process.cwd();
  }

  // Handle --output option
  if (typeof values.output === "string") {
    options.output = values.output;
  }

  // Handle --port option with validation
  if (typeof values.port === "string") {
    const port = parseInt(values.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port number: ${values.port}`);
    }
    options.port = port;
  }

  // Handle --host option
  if (typeof values.host === "string") {
    options.host = values.host;
  }

  // Handle --timeout option
  if (typeof values.timeout === "string") {
    const seconds = parseFloat(values.timeout);
    if (isNaN(seconds) || seconds < 0) {
      throw new Error(
        `Invalid timeout value: ${values.timeout}. Must be a positive number (seconds)`
      );
    }
    options.timeout = Math.floor(seconds * 1000);
  }

  // Handle --interface option
  if (typeof values.interface === "string") {
    options.interface = values.interface;
  }

  // Handle --url-path option
  if (typeof values["url-path"] === "string") {
    options.path = values["url-path"];
  }

  // Handle --config option (custom config path)
  if (typeof values.config === "string") {
    options.config = values.config;
  }

  // Handle --allow-ips option (comma-separated)
  if (typeof values["allow-ips"] === "string") {
    options.allowIps = values["allow-ips"].split(",").map((ip: string) => ip.trim());
  }

  // Handle --rate-limit option
  if (typeof values["rate-limit"] === "string") {
    const limit = parseInt(values["rate-limit"], 10);
    if (isNaN(limit) || limit < 1) {
      throw new Error(`Invalid rate limit: ${values["rate-limit"]}`);
    }
    options.rateLimit = limit;
  }

  // Handle --rate-limit-window option
  if (typeof values["rate-limit-window"] === "string") {
    const window = parseInt(values["rate-limit-window"], 10);
    if (isNaN(window) || window < 1) {
      throw new Error(`Invalid rate limit window: ${values["rate-limit-window"]}`);
    }
    options.rateLimitWindow = window;
  }

  // Handle --allow-types option (comma-separated)
  if (typeof values["allow-types"] === "string") {
    options.allowedTypes = values["allow-types"].split(",").map((type: string) => type.trim());
  }

  // Handle --log-file option
  if (typeof values["log-file"] === "string") {
    options.logFile = values["log-file"];
  }

  // Handle --cert option
  if (typeof values.cert === "string") {
    options.cert = values.cert;
  }

  // Handle --key option
  if (typeof values.key === "string") {
    options.key = values.key;
  }

  // Add positional arguments as files (skip subcommands)
  for (const arg of positionals) {
    if (!["init", "status", "config", "completion"].includes(arg)) {
      options.files.push(arg);
    }
  }

  return options;
}

function createDefaultOptions(noColor: boolean, command: ParsedCommand): CliOptions {
  const options: CliOptions = {
    files: [],
    secure: false,
    keepAlive: false,
    zip: false,
    copyUrl: false,
    noColor,
    verbose: false,
    debug: false,
    jsonLog: false,
    command,
  };

  // For cert generate command, we need to parse cert/key options
  if (command.subcommand === SubCommand.CertGenerate) {
    const { values } = bunParseArgs({
      args: Bun.argv,
      options: parseArgsConfig,
      strict: false,
      allowPositionals: true,
    });

    if (typeof values.cert === "string") {
      options.cert = values.cert;
    }
    if (typeof values.key === "string") {
      options.key = values.key;
    }
    if (typeof values.host === "string") {
      options.host = values.host;
    }
    if (typeof values.interface === "string") {
      options.interface = values.interface;
    }
  }

  return options;
}

function printVersion() {
  // Use build-time constant if available (compiled binary)
  if (typeof BUILD_VERSION !== "undefined") {
    console.log(BUILD_VERSION);
    return;
  }

  // Fallback: read from package.json (development mode)
  try {
    const packageJsonPath = import.meta.dir
      ? join(import.meta.dir, "..", "package.json")
      : join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    console.log(packageJson.version || "unknown");
  } catch (err) {
    console.log("unknown");
  }
}

function printHelp() {
  const cmd = color.cyan("qrdrop");
  const opt = color.yellow;
  const example = color.gray;
  const header = color.bright;

  console.log(`
${header("qrdrop")} - Two-way LAN file sharing tool

${header("USAGE")}
  ${cmd} [options]
  ${cmd} ${opt("--file")} <path>              # Share file(s)
  ${cmd} ${opt("--directory")} [path]         # Share directory
  ${cmd} ${opt("--output")} <path>           # Receive files to directory

${header("OPTIONS")}
  ${opt("-f, --file <path>")}        File(s) to share (can be used multiple times)
                      ${example("# Use --file . to share current directory")}
  ${opt("-d, --directory [path]")}   Share all files in directory (default: current)
  ${opt("-o, --output <path>")}     Directory for received files (default: current)
  ${opt("--secure")}                Enable HTTPS/TLS with self-signed certificate
  ${opt("--cert <path>")}           Custom TLS certificate file (implies --secure)
  ${opt("--key <path>")}            Custom TLS private key file (implies --secure)
  ${opt("--port <number>")}         Specify port (default: auto-discover)
  ${opt("--host <ip|fqdn>")}        Specify host IP or FQDN (default: auto-detect)
  ${opt("-i, --interface <name>")}  Network interface (use "any" for all)
  ${opt("--timeout <seconds>")}     Server timeout (default: 600s / 10 minutes)
  ${opt("--keep-alive")}            Disable automatic timeout (run indefinitely)
  ${opt("--zip")}                   Zip files/directories before sharing
  ${opt("--url-path <path>")}       Custom URL path (default: random)
  ${opt("--config <path>")}         Custom config file path (default: ~/.config/qrdrop/config.toml)
  ${opt("--copy-url")}              Automatically copy URL to clipboard
  ${opt("--no-color")}              Disable colored output
  ${opt("--allow-ips <ip1,ip2>")}   Restrict access to specific IPs (supports wildcards/CIDR)
  ${opt("--rate-limit <number>")}   Max requests per window (default: 100)
  ${opt("--rate-limit-window <sec>")} Rate limit window in seconds (default: 60)
  ${opt("--allow-types <ext1,ext2>")} Restrict to specific file types/extensions
  ${opt("--verbose")}                Verbose logging
  ${opt("--debug")}                 Debug logging
  ${opt("--log-file <path>")}      Write logs to file
  ${opt("--json-log")}              JSON log format
  ${opt("-h, --help")}              Show this help message
  ${opt("-v, --version")}           Show version number

${header("EXAMPLES")}
  ${example("# Basic usage")}
  ${cmd}                                    ${example("# Start server, upload via web UI")}
  ${cmd} ${opt("--file")} document.pdf      ${example("# Share a single file")}
  ${cmd} ${opt("-f")} file1.txt ${opt("-f")} file2.txt  ${example("# Share multiple files")}
  
  ${example("# Directory sharing")}
  ${cmd} ${opt("--file")} .                 ${example("# Share current directory")}
  ${cmd} ${opt("--directory")}              ${example("# Share current directory")}
  ${cmd} ${opt("-d")} ./folder              ${example("# Share files in ./folder")}
  
  ${example("# Two-way sharing")}
  ${cmd} ${opt("--file")} doc.pdf ${opt("--output")} ./received  ${example("# Share and receive")}
  
  ${example("# Network configuration")}
  ${cmd} ${opt("--secure")}                  ${example("# Enable HTTPS/TLS")}
  ${cmd} ${opt("--cert")} ./cert.pem ${opt("--key")} ./key.pem  ${example("# Use custom certificate")}
  ${cmd} ${opt("--port")} 8080               ${example("# Use specific port")}
  ${cmd} ${opt("-i")} eth0                   ${example("# Use specific interface")}
  ${cmd} ${opt("-i")} any                    ${example("# Bind to all interfaces")}
  
  ${example("# Advanced options")}
  ${cmd} ${opt("--timeout")} 300             ${example("# Set timeout to 5 minutes")}
  ${cmd} ${opt("--keep-alive")}              ${example("# Run indefinitely")}
  ${cmd} ${opt("--zip")} ${opt("--file")} ./folder    ${example("# Zip before sharing")}
  ${cmd} ${opt("--url-path")} /secret         ${example("# Use custom URL path")}
  ${cmd} ${opt("--copy-url")}                ${example("# Auto-copy URL to clipboard")}
  
  ${example("# Security options")}
  ${cmd} ${opt("--allow-ips")} 192.168.1.0/24  ${example("# Allow only local network")}
  ${cmd} ${opt("--rate-limit")} 50              ${example("# Limit to 50 requests per minute")}
  ${cmd} ${opt("--allow-types")} jpg,png,pdf   ${example("# Only allow images and PDFs")}
  
  ${example("# Shell completion")}
  ${cmd} completion bash                     ${example("# Generate bash completion")}
  ${cmd} completion zsh                      ${example("# Generate zsh completion")}
  ${cmd} completion fish                     ${example("# Generate fish completion")}
  ${cmd} completion powershell               ${example("# Generate PowerShell completion")}
  
  ${example("# Configuration")}
  ${cmd} config init                         ${example("# Interactive config setup")}
  ${cmd} status                              ${example("# Show server status")}
  ${cmd} cert generate                       ${example("# Generate TLS certificate")}
  ${cmd} cert generate ${opt("--host")} 192.168.1.100  ${example("# Generate cert for specific IP")}
  ${cmd} cert generate ${opt("-i")} eth0     ${example("# Generate cert for specific interface")}

${header("CONFIGURATION")}
  Config file: ${color.cyan("~/.config/qrdrop/config.toml")} (Linux/macOS)
               ${color.cyan("%APPDATA%/qrdrop/config.toml")} (Windows)
  
  Environment variables: ${color.cyan("QRDROP_*")} (e.g., ${color.cyan("QRDROP_PORT=8080")})
  
  Precedence: CLI args > Config file > Environment variables

${header("MORE INFO")}
  Visit: ${color.cyan("https://github.com/behnamazimi/qrdrop")}
`);
}
