/**
 * UI-specific constants
 * These are inlined at build time for the browser bundle
 */

export const UI_POLL_INTERVAL_MS = 5000; // 5 seconds
export const DOWNLOAD_DELAY_MS = 200; // 200ms delay between downloads
export const BYTES_PER_KB = 1024;
export const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB"] as const;
