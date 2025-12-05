/**
 * Application-wide constants
 */

// Timeout constants
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// Network constants
export const DEFAULT_START_PORT = 1673;
export const MAX_PORT_ATTEMPTS = 100;
export const PORT_CHECK_DELAY_MS = 10;

// Path and security constants
export const RANDOM_PATH_LENGTH = 16;
export const RANDOM_PATH_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// File size constants
export const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB

// Range request constants
export const MAX_RANGES = 5;

// Upload constants
export const MAX_UPLOAD_ATTEMPTS = 100;

// UI constants
// Download constants
export const ZIP_FILENAME = "qrdrop-files.zip";
