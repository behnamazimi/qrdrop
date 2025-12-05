/**
 * Error formatting utilities
 */

/**
 * Format an unknown error into a human-readable message
 * @param error - The error to format (can be Error, string, or any other type)
 * @returns A string message suitable for display
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error);
}

/**
 * Check if an error is a Node.js filesystem error with a specific code
 * @param error - The error to check
 * @param code - The error code to check for (e.g., "ENOENT", "EACCES")
 */
function isNodeError(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException)?.code === code;
}

/**
 * Check if an error indicates a file/directory not found
 */
export function isNotFoundError(error: unknown): boolean {
  return isNodeError(error, "ENOENT");
}
