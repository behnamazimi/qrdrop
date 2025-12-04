import { networkInterfaces } from "os";

export interface NetworkInfo {
  ip: string;
  port: number;
  url: string;
}

/**
 * Auto-detect LAN IP address from network interfaces
 * Prefers IPv4 addresses on non-loopback interfaces
 */
export function detectLANIP(): string | null {
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
 * Note: There's a small race condition window between checking and using the port,
 * but this is acceptable for most use cases. For production, consider using a port lock.
 */
export async function findAvailablePort(startPort: number = 8080): Promise<number> {
  const maxAttempts = 100;
  let port = startPort;

  for (let i = 0; i < maxAttempts; i++) {
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
      await new Promise((resolve) => setTimeout(resolve, 10));

      return port;
    } catch (error) {
      // Port is in use, try next
      port++;
    }
  }

  throw new Error(`Could not find available port starting from ${startPort}`);
}

/**
 * Get network information with auto-detection
 */
export async function getNetworkInfo(
  hostOverride?: string,
  portOverride?: number,
  secure: boolean = false
): Promise<NetworkInfo> {
  const ip = hostOverride || detectLANIP();
  if (!ip) {
    throw new Error("Could not detect LAN IP address. Please specify --host");
  }

  const port = portOverride || (await findAvailablePort());
  const protocol = secure ? "https" : "http";
  const url = `${protocol}://${ip}:${port}`;

  return { ip, port, url };
}
