import { stat, readdir } from "fs/promises";
import { basename, join, extname } from "path";
import { validatePath, isSymlink, parseRangeHeader } from "./security";

export interface FileInfo {
  name: string;
  size: number;
  type: string;
  modified: Date;
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filename: string): string {
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
 * List files in a directory
 */
export async function listFiles(baseDirectory: string): Promise<FileInfo[]> {
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
            modified: stats.mtime,
          });
        } catch {
          // Skip files we can't stat
          continue;
        }
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
    return [];
  }

  return files.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get file info
 */
export async function getFileInfo(
  filename: string,
  baseDirectory: string
): Promise<FileInfo | null> {
  const validatedPath = await validatePath(filename, baseDirectory);
  if (!validatedPath) {
    return null;
  }

  // Check if it's a symlink
  if (await isSymlink(validatedPath)) {
    return null;
  }

  try {
    const stats = await stat(validatedPath);
    if (!stats.isFile()) {
      return null;
    }

    return {
      name: basename(validatedPath),
      size: stats.size,
      type: getMimeType(validatedPath),
      modified: stats.mtime,
    };
  } catch {
    return null;
  }
}

/**
 * Serve file with range request support (RFC 7233)
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

    // Handle single range (most common case)
    if (ranges.length === 1) {
      const range = ranges[0]!;
      const start = range.start;
      const end = range.end;
      const contentLength = end - start + 1;

      // Read the range
      const file = Bun.file(validatedPath);
      const buffer = await file.arrayBuffer();
      const rangeBuffer = buffer.slice(start, end + 1);

      return new Response(rangeBuffer, {
        status: 206, // Partial Content
        headers: {
          "Content-Type": mimeType,
          "Content-Length": contentLength.toString(),
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Last-Modified": stats.mtime.toUTCString(),
        },
      });
    }

    // Handle multiple ranges (multipart/byteranges)
    // For simplicity, we'll serve the first range
    // Full multipart support would require more complex response formatting
    const range = ranges[0]!;
    const start = range.start;
    const end = range.end;
    const contentLength = end - start + 1;

    const file = Bun.file(validatedPath);
    const buffer = await file.arrayBuffer();
    const rangeBuffer = buffer.slice(start, end + 1);

    return new Response(rangeBuffer, {
      status: 206,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": contentLength.toString(),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Last-Modified": stats.mtime.toUTCString(),
      },
    });
  } catch (error) {
    return new Response("Internal server error", { status: 500 });
  }
}

/**
 * Get all files from multiple file paths (handles directories)
 */
export async function getAllFiles(filePaths: string[]): Promise<FileInfo[]> {
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
          modified: stats.mtime,
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

  return allFiles;
}
