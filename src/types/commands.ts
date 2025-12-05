/**
 * Subcommand types for CLI parsing
 */

/**
 * Available subcommands
 */
export enum SubCommand {
  None = "none",
  Status = "status",
  ConfigInit = "config-init",
  Completion = "completion",
  Interactive = "interactive",
  CertGenerate = "cert-generate",
}

/**
 * Result of parsing CLI arguments
 */
export interface ParsedCommand {
  subcommand: SubCommand;
  /** Shell name for completion subcommand */
  completionShell?: string;
}
