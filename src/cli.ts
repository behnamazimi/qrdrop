export interface CliOptions {
  files: string[];
  directory?: string;
  output?: string;
  secure: boolean;
  port?: number;
  host?: string;
  timeout?: number; // Timeout in milliseconds, undefined means use default (10 minutes)
  noTimeout: boolean; // If true, disable timeout (run indefinitely)
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    files: [],
    secure: false,
    noTimeout: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    const nextArg = args[i + 1];

    switch (arg) {
      case "--file":
      case "-f":
        if (nextArg && !nextArg.startsWith("-")) {
          // Handle --file . as current directory
          if (nextArg === ".") {
            options.directory = process.cwd();
          } else {
            options.files.push(nextArg);
          }
          i++;
        } else {
          throw new Error(`Missing value for ${arg}`);
        }
        break;

      case "--directory":
      case "-d":
        if (nextArg && !nextArg.startsWith("-")) {
          options.directory = nextArg;
          i++;
        } else {
          // Default to current directory if no path provided
          options.directory = process.cwd();
        }
        break;

      case "--output":
      case "-o":
        if (nextArg && !nextArg.startsWith("-")) {
          options.output = nextArg;
          i++;
        } else {
          throw new Error(`Missing value for ${arg}`);
        }
        break;

      case "--secure":
        options.secure = true;
        break;

      case "--port":
        if (nextArg && !nextArg.startsWith("-")) {
          const port = parseInt(nextArg, 10);
          if (isNaN(port) || port < 1 || port > 65535) {
            throw new Error(`Invalid port number: ${nextArg}`);
          }
          options.port = port;
          i++;
        } else {
          throw new Error(`Missing value for ${arg}`);
        }
        break;

      case "--host":
        if (nextArg && !nextArg.startsWith("-")) {
          options.host = nextArg;
          i++;
        } else {
          throw new Error(`Missing value for ${arg}`);
        }
        break;

      case "--timeout":
      case "--duration":
        if (nextArg && !nextArg.startsWith("-")) {
          // Accept timeout in seconds
          const seconds = parseFloat(nextArg);
          if (isNaN(seconds) || seconds < 0) {
            throw new Error(
              `Invalid timeout value: ${nextArg}. Must be a positive number (seconds)`
            );
          }
          options.timeout = Math.floor(seconds * 1000); // Convert to milliseconds
          i++;
        } else {
          throw new Error(`Missing value for ${arg}`);
        }
        break;

      case "--no-timeout":
      case "--persistent":
        options.noTimeout = true;
        break;

      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;

      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        // Treat as file path if it doesn't start with -
        options.files.push(arg);
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
qrdrop - Two-way LAN file sharing tool

Usage:
  qrdrop [options]

Options:
  -f, --file <path>     File(s) to share (can be used multiple times)
                        Use --file . to share current directory
  -d, --directory [path] Share all files in directory (default: current directory)
  -o, --output <path>   Directory for received files (default: current directory)
  --secure              Enable HTTPS/TLS with self-signed certificate
  --port <number>       Specify port (default: auto-discover)
  --host <ip>           Specify host IP (default: auto-detect LAN IP)
  --timeout <seconds>   Set server timeout in seconds (default: 600 seconds / 10 minutes)
  --no-timeout          Disable automatic timeout (run indefinitely)
  -h, --help            Show this help message

Examples:
  qrdrop                                    # Start server, upload files via web UI (no files shared)
  qrdrop --file document.pdf                # Share a single file
  qrdrop -f file1.txt -f file2.txt          # Share multiple files
  qrdrop --file .                           # Share current directory
  qrdrop --directory                        # Share current directory
  qrdrop -d ./folder                        # Share files in ./folder
  qrdrop --secure                           # Enable HTTPS/TLS
  qrdrop --timeout 300                      # Set timeout to 5 minutes
  qrdrop --no-timeout                       # Run indefinitely
`);
}
