import { realpath, lstat } from "fs/promises";
import { resolve, normalize, sep } from "path";

const MAX_RANGES = 5;

/**
 * Recursively decode URL-encoded strings to prevent encoding bypass
 */
export function recursiveDecode(str: string): string {
  let decoded = decodeURIComponent(str);
  let previous = "";

  // Keep decoding until no more changes occur
  while (decoded !== previous) {
    previous = decoded;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // If decoding fails, return the last valid decode
      return previous;
    }
  }

  return decoded;
}

/**
 * Normalize and validate path to prevent traversal attacks
 */
export async function validatePath(
  requestedPath: string,
  baseDirectory: string
): Promise<string | null> {
  try {
    // Recursive decode to prevent encoding bypass
    const decoded = recursiveDecode(requestedPath);

    // Normalize the path
    const normalized = normalize(decoded);

    // Resolve to absolute path
    const resolved = resolve(baseDirectory, normalized);

    // Get canonical path (resolves symlinks)
    const canonical = await realpath(resolved);

    // Ensure the canonical path is within base directory
    const baseCanonical = await realpath(baseDirectory);

    if (!canonical.startsWith(baseCanonical + sep) && canonical !== baseCanonical) {
      return null; // Path traversal detected
    }

    return canonical;
  } catch (error) {
    // Path doesn't exist or is invalid
    return null;
  }
}

/**
 * Check if path is a symlink (reject symlinks for security)
 */
export async function isSymlink(filePath: string): Promise<boolean> {
  try {
    const stats = await lstat(filePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Validate and parse Range header (RFC 7233)
 * Limits to max 5 ranges to prevent DoS
 */
export interface Range {
  start: number;
  end: number;
}

export function parseRangeHeader(rangeHeader: string | null, fileSize: number): Range[] | null {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) {
    return null;
  }

  const ranges: Range[] = [];
  const rangeSpec = rangeHeader.slice(6); // Remove 'bytes='
  const rangeParts = rangeSpec.split(",");

  // Limit to MAX_RANGES to prevent DoS
  if (rangeParts.length > MAX_RANGES) {
    return null;
  }

  for (const part of rangeParts) {
    const trimmed = part.trim();
    const dashIndex = trimmed.indexOf("-");

    if (dashIndex === -1) continue;

    const startStr = trimmed.slice(0, dashIndex);
    const endStr = trimmed.slice(dashIndex + 1);

    let start: number;
    let end: number;

    if (startStr === "") {
      // Suffix range: -500 means last 500 bytes
      const suffix = parseInt(endStr, 10);
      if (isNaN(suffix) || suffix <= 0) continue;
      start = Math.max(0, fileSize - suffix);
      end = fileSize - 1;
    } else if (endStr === "") {
      // Prefix range: 500- means from byte 500 to end
      start = parseInt(startStr, 10);
      if (isNaN(start) || start < 0) continue;
      end = fileSize - 1;
    } else {
      // Full range: 500-999
      start = parseInt(startStr, 10);
      end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end) || start < 0 || end < start || end >= fileSize) {
        continue;
      }
    }

    // Ensure range is within file bounds
    start = Math.max(0, Math.min(start, fileSize - 1));
    end = Math.max(start, Math.min(end, fileSize - 1));

    ranges.push({ start, end });
  }

  return ranges.length > 0 ? ranges : null;
}

/**
 * Get client IP address from request
 */
export function getClientIP(request: Request): string {
  // Check X-Forwarded-For header (for proxies)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }

  // Check X-Real-IP header
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  // Fallback to connection remote address (if available in Bun)
  // Note: Bun doesn't expose this directly, so we'll rely on headers
  return "unknown";
}

/**
 * Check if IP is in allowlist (simple implementation)
 * In a real scenario, you might want more sophisticated IP matching
 */
export function isIPAllowed(clientIP: string, allowedIPs: string[]): boolean {
  if (allowedIPs.length === 0) return true;
  return allowedIPs.includes(clientIP);
}
