import { networkInterfaces } from "os";
import {
  DEFAULT_START_PORT,
  MAX_PORT_ATTEMPTS,
  PORT_CHECK_DELAY_MS,
  RANDOM_PATH_LENGTH,
  RANDOM_PATH_CHARS,
} from "./constants";

export interface NetworkInfo {
  ip: string;
  port: number;
  url: string;
  path?: string;
}

/**
 * Get the IP address for a specific network interface
 * @param interfaceName - Name of the network interface, or "any" for all interfaces
 * @returns IP address string, or "0.0.0.0" if interfaceName is "any"
 * @returns null if interface doesn't exist or has no valid IPv4 address
 */
function getInterfaceIP(interfaceName: string): string | null {
  const interfaces = networkInterfaces();

  if (interfaceName === "any") {
    // Return 0.0.0.0 to bind to all interfaces
    return "0.0.0.0";
  }

  const iface = interfaces[interfaceName];
  if (!iface) {
    return null;
  }

  // Find first non-internal IPv4 address
  for (const addr of iface) {
    if (addr.internal) continue;
    const family = addr.family;
    if (family === "IPv4" || (typeof family === "number" && family === 4)) {
      return addr.address;
    }
  }

  return null;
}

/**
 * Auto-detect LAN IP address from network interfaces
 * Prefers IPv4 addresses on non-loopback interfaces
 * @param interfaceName - Optional specific interface name to use, otherwise auto-detects
 * @returns IP address string of the first valid non-loopback IPv4 address found
 * @returns null if no valid IP address can be detected
 */
function detectLANIP(interfaceName?: string): string | null {
  if (interfaceName) {
    return getInterfaceIP(interfaceName);
  }

  const interfaces = networkInterfaces();

  // Priority order: non-loopback IPv4 addresses
  const candidates: string[] = [];

  for (const [, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;

    for (const addr of addrs) {
      // Skip loopback and internal addresses
      if (addr.internal) continue;

      // Prefer IPv4
      // On Windows, family might be a number (4) instead of "IPv4"
      const family = addr.family;
      if (family === "IPv4" || (typeof family === "number" && family === 4)) {
        candidates.push(addr.address);
      }
    }
  }

  // Return first candidate, or null if none found
  return candidates[0] || null;
}

/**
 * Find an available port starting from the given port
 * Tests ports sequentially until an available one is found
 * @param startPort - Port number to start searching from (defaults to DEFAULT_START_PORT)
 * @returns Available port number
 * @throws Error if no available port found within MAX_PORT_ATTEMPTS
 * @note There's a small race condition window between checking and using the port,
 * but this is acceptable for most use cases
 */
async function findAvailablePort(startPort: number = DEFAULT_START_PORT): Promise<number> {
  let port = startPort;

  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    try {
      // Try to create a server on this port
      const testServer = Bun.serve({
        port,
        fetch: () => new Response(),
      });

      // If we can bind, the port is available
      // Stop immediately to free the port for actual use
      testServer.stop();

      // Small delay to ensure port is fully released
      await new Promise((resolve) => setTimeout(resolve, PORT_CHECK_DELAY_MS));

      return port;
    } catch (error) {
      // Port is in use, try next
      port++;
    }
  }

  throw new Error(`Could not find available port starting from ${startPort}`);
}

/**
 * Check if a string is an IP address or FQDN
 */
function isIPAddress(str: string): boolean {
  // Simple IPv4 check
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(str)) {
    const parts = str.split(".").map(Number);
    return parts.every((part) => part >= 0 && part <= 255);
  }
  // IPv6 check (simplified)
  if (str.includes(":")) {
    return true;
  }
  return false;
}

/**
 * Generate a random path for URL security
 */
function generateRandomPath(): string {
  let path = "/";
  for (let i = 0; i < RANDOM_PATH_LENGTH; i++) {
    path += RANDOM_PATH_CHARS[Math.floor(Math.random() * RANDOM_PATH_CHARS.length)];
  }
  return path;
}

/**
 * Get network information with auto-detection of IP and port
 * @param hostOverride - Optional IP address or FQDN to use instead of auto-detection
 * @param portOverride - Optional port number to use instead of auto-detection
 * @param secure - Whether to use HTTPS (default: false)
 * @param interfaceName - Optional network interface name to bind to
 * @param customPath - Optional custom URL path, otherwise generates random path
 * @returns NetworkInfo object with IP, port, URL, and path
 * @throws Error if LAN IP cannot be detected and no hostOverride provided
 */
export async function getNetworkInfo(
  hostOverride?: string,
  portOverride?: number,
  secure: boolean = false,
  interfaceName?: string,
  customPath?: string
): Promise<NetworkInfo> {
  let ip: string | null = null;
  let hostname: string;

  if (hostOverride) {
    // Check if it's an IP or FQDN
    if (isIPAddress(hostOverride)) {
      ip = hostOverride;
      hostname = hostOverride;
    } else {
      // It's an FQDN, use it directly
      hostname = hostOverride;
      ip = null; // Will bind to 0.0.0.0 but use FQDN in URL
    }
  } else {
    // Auto-detect with optional interface selection
    ip = detectLANIP(interfaceName);
    if (!ip) {
      throw new Error(
        `Could not detect LAN IP address${interfaceName ? ` on interface ${interfaceName}` : ""}. Please specify --host`
      );
    }
    hostname = ip;
  }

  const port = portOverride || (await findAvailablePort(DEFAULT_START_PORT));
  const protocol = secure ? "https" : "http";
  const path = customPath || generateRandomPath();
  const url = `${protocol}://${hostname}:${port}${path}`;

  // For binding, use IP or 0.0.0.0 if FQDN was provided
  const bindIP = ip || "0.0.0.0";

  return { ip: bindIP, port, url, path };
}
