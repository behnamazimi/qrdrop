import { stat, readdir } from "fs/promises";
import { basename, join, extname } from "path";
import { validatePath, isSymlink, parseRangeHeader, isFileTypeAllowed } from "./security";
import type { FileInfo } from "./types/files";
import { formatError } from "./utils/error";

// Re-export the shared type for backward compatibility
export type { FileInfo } from "./types/files";

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".htm": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
  };

  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * List all files in a directory, excluding symlinks
 * @param baseDirectory - The directory path to list files from
 * @returns Array of file information objects, sorted alphabetically by name
 * @returns Empty array if directory doesn't exist or can't be read
 */
async function listFiles(baseDirectory: string): Promise<FileInfo[]> {
  const files: FileInfo[] = [];

  try {
    const entries = await readdir(baseDirectory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = join(baseDirectory, entry.name);

        // Skip symlinks
        if (await isSymlink(filePath)) {
          continue;
        }

        try {
          const stats = await stat(filePath);
          files.push({
            name: entry.name,
            size: stats.size,
            type: getMimeType(entry.name),
            modified: stats.mtime.toISOString(),
          });
        } catch {
          // Skip files we can't stat
          continue;
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
    return [];
  }

  return files.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Serve a file with HTTP range request support (RFC 7233)
 * Uses efficient file slicing to avoid loading entire file into memory
 * @param filename - The name of the file to serve
 * @param baseDirectory - The base directory to resolve the file path from
 * @param rangeHeader - The Range header value from the request, or null if no range requested
 * @returns HTTP Response with file content or appropriate error status
 * @returns 404 if file not found, 403 if symlink, 206 for partial content, 200 for full file
 */
export async function serveFile(
  filename: string,
  baseDirectory: string,
  rangeHeader: string | null
): Promise<Response> {
  const validatedPath = await validatePath(filename, baseDirectory);
  if (!validatedPath) {
    return new Response("File not found", { status: 404 });
  }

  // Check if it's a symlink
  if (await isSymlink(validatedPath)) {
    return new Response("Symlinks are not allowed", { status: 403 });
  }

  try {
    const stats = await stat(validatedPath);
    if (!stats.isFile()) {
      return new Response("Not a file", { status: 404 });
    }

    const fileSize = stats.size;
    const mimeType = getMimeType(validatedPath);

    // Parse range header
    const ranges = parseRangeHeader(rangeHeader, fileSize);

    if (!ranges) {
      // No range request, serve entire file
      const file = Bun.file(validatedPath);
      return new Response(file, {
        headers: {
          "Content-Type": mimeType,
          "Content-Length": fileSize.toString(),
          "Accept-Ranges": "bytes",
          "Last-Modified": stats.mtime.toUTCString(),
        },
      });
    }

    // Handle range request (serves first range only)
    // Note: Full multipart/byteranges support would require more complex response formatting
    const range = ranges[0]!;
    const start = range.start;
    const end = range.end;
    const contentLength = end - start + 1;

    // Use Bun's file slicing for efficient range reading without loading entire file
    const file = Bun.file(validatedPath);
    const rangeBlob = file.slice(start, end + 1);

    return new Response(rangeBlob, {
      status: 206, // Partial Content
      headers: {
        "Content-Type": mimeType,
        "Content-Length": contentLength.toString(),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Last-Modified": stats.mtime.toUTCString(),
      },
    });
  } catch (error) {
    console.error("File serving error:", formatError(error));
    return new Response("Internal server error", { status: 500 });
  }
}

/**
 * Get files from multiple file paths, handling both files and directories
 * @param filePaths - Array of file or directory paths to process
 * @param allowedTypes - Optional array of allowed file extensions to filter by
 * @returns Array of file information objects for all files found
 * @returns Files from directories are included, symlinks are excluded
 */
export async function getFiles(filePaths: string[], allowedTypes?: string[]): Promise<FileInfo[]> {
  const allFiles: FileInfo[] = [];

  for (const filePath of filePaths) {
    try {
      const stats = await stat(filePath);

      if (stats.isFile()) {
        // Single file
        if (await isSymlink(filePath)) {
          continue;
        }
        allFiles.push({
          name: basename(filePath),
          size: stats.size,
          type: getMimeType(filePath),
          modified: stats.mtime.toISOString(),
        });
      } else if (stats.isDirectory()) {
        // Directory - list all files
        const dirFiles = await listFiles(filePath);
        allFiles.push(...dirFiles);
      }
    } catch {
      // Skip files/directories we can't access
      continue;
    }
  }

  // Filter by allowed types if specified
  if (allowedTypes && allowedTypes.length > 0) {
    return allFiles.filter((file) => isFileTypeAllowed(file.name, allowedTypes));
  }

  return allFiles;
}
