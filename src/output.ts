/**
 * Colored output utilities for terminal
 * Uses picocolors for cross-platform terminal color support
 */

import pc from "picocolors";

let colorEnabled = true;

/**
 * Initialize color output
 * @param enabled - Whether colors should be enabled
 */
export function initColors(enabled: boolean = true): void {
  colorEnabled = enabled && process.stdout.isTTY;
}

/**
 * Helper to conditionally apply color
 */
function maybeColor<T extends string>(fn: (s: string) => string, text: T): string {
  return colorEnabled ? fn(text) : text;
}

/**
 * Color functions
 */
export const color = {
  reset: (text: string) => maybeColor(pc.reset, text),
  bright: (text: string) => maybeColor(pc.bold, text),
  dim: (text: string) => maybeColor(pc.dim, text),
  red: (text: string) => maybeColor(pc.red, text),
  green: (text: string) => maybeColor(pc.green, text),
  yellow: (text: string) => maybeColor(pc.yellow, text),
  blue: (text: string) => maybeColor(pc.blue, text),
  magenta: (text: string) => maybeColor(pc.magenta, text),
  cyan: (text: string) => maybeColor(pc.cyan, text),
  white: (text: string) => maybeColor(pc.white, text),
  gray: (text: string) => maybeColor(pc.gray, text),
};

/**
 * Success message
 */
export function success(message: string): string {
  return color.green(`✓ ${message}`);
}

/**
 * Error message
 */
export function error(message: string): string {
  return color.red(`✗ ${message}`);
}

/**
 * Info message
 */
export function info(message: string): string {
  return color.cyan(`ℹ ${message}`);
}
