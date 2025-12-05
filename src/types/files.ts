/**
 * Shared file information type used across backend and frontend
 */

/**
 * File information structure
 * @property name - File name
 * @property size - File size in bytes
 * @property type - MIME type of the file
 * @property modified - Last modification date (ISO string for serialization)
 */
export interface FileInfo {
  name: string;
  size: number;
  type: string;
  modified: string;
}

/**
 * Upload result from server
 */
export interface UploadResult {
  success: boolean;
  filename?: string;
  filenames?: string[];
  error?: string;
  size?: number;
  totalSize?: number;
  fileCount?: number;
}

/**
 * Message type for UI feedback
 */
export type MessageType = "success" | "error" | "";
