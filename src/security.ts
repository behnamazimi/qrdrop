import { realpath, lstat } from "fs/promises";
import { resolve, normalize, sep } from "path";
import { MAX_RANGES } from "./constants";

/**
 * Recursively decode URL-encoded strings to prevent encoding bypass
 */
function recursiveDecode(str: string): string {
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
    // If we can't stat the file, assume it's not a symlink
    // This could happen if the file doesn't exist or we lack permissions
    return false;
  }
}

/**
 * Validate and parse Range header (RFC 7233)
 * Limits to max 5 ranges to prevent DoS
 */
interface Range {
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
 * Server interface for getting client IP (Bun server)
 */
interface ServerWithRequestIP {
  requestIP(request: Request): { address: string; family: string; port: number } | null;
}

/**
 * Get client IP address from request
 * @param request - The HTTP request
 * @param server - Optional Bun server instance for direct IP extraction
 * @returns Client IP address or "unknown" if not determinable
 */
export function getClientIP(request: Request, server?: ServerWithRequestIP): string {
  // First, try to get IP directly from Bun server if available
  if (server && typeof server.requestIP === "function") {
    try {
      const ipInfo = server.requestIP(request);
      if (ipInfo && ipInfo.address) {
        return ipInfo.address;
      }
    } catch {
      // Fall through to header-based detection
    }
  }

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

  return "unknown";
}

/**
 * Convert IPv4 address string to 32-bit integer
 */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return null;
    result = (result << 8) | num;
  }
  // Convert to unsigned 32-bit integer
  return result >>> 0;
}

/**
 * Check if an IP address matches a CIDR range
 * @param ip - IP address to check
 * @param cidr - CIDR notation (e.g., "192.168.1.0/24")
 * @returns true if IP is within the CIDR range
 */
function matchesCIDR(ip: string, cidr: string): boolean {
  const parts = cidr.split("/");
  if (parts.length !== 2) return false;

  const network = parts[0];
  const prefixStr = parts[1];
  if (!network || !prefixStr) return false;

  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const ipInt = ipv4ToInt(ip);
  const networkInt = ipv4ToInt(network);

  if (ipInt === null || networkInt === null) return false;

  // Create subnet mask from prefix length
  // For prefix 24: mask = 0xFFFFFF00
  // For prefix 0: mask = 0x00000000 (all IPs match)
  // For prefix 32: mask = 0xFFFFFFFF (exact match)
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;

  // Check if IP is in the network by comparing masked values
  return (ipInt & mask) === (networkInt & mask);
}

/**
 * Check if IP is in allowlist
 * Supports exact match, CIDR notation (any prefix), and wildcards
 * @param clientIP - Client IP address to check
 * @param allowedIPs - Array of allowed IPs, CIDR ranges, or wildcards
 * @returns true if IP is allowed, false otherwise
 */
export function isIPAllowed(clientIP: string, allowedIPs: string[]): boolean {
  if (allowedIPs.length === 0) return true;

  for (const allowed of allowedIPs) {
    // Exact match
    if (allowed === clientIP) {
      return true;
    }

    // CIDR notation support (any prefix length)
    if (allowed.includes("/")) {
      if (matchesCIDR(clientIP, allowed)) {
        return true;
      }
      continue;
    }

    // Wildcard support (e.g., "192.168.*" or "192.168.1.*")
    if (allowed.includes("*")) {
      // Escape special regex chars except *, then replace * with regex pattern
      const escaped = allowed.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      const pattern = escaped.replace(/\*/g, "\\d{1,3}");
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(clientIP)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if file type is allowed
 * @param filename - Filename to check
 * @param allowedTypes - Array of allowed file extensions (with or without dot)
 * @returns true if file type is allowed, false otherwise
 */
export function isFileTypeAllowed(filename: string, allowedTypes: string[]): boolean {
  if (allowedTypes.length === 0) return true;

  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const normalizedExt = ext.startsWith(".") ? ext : `.${ext}`;

  return allowedTypes.some((type) => {
    const normalizedType = type.startsWith(".") ? type : `.${type}`;
    return normalizedType.toLowerCase() === normalizedExt;
  });
}
