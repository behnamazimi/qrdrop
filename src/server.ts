import type { CliOptions } from "./cli";
import type { NetworkInfo } from "./network";
import { serveFile, getAllFiles } from "./files";
import { handleUpload } from "./upload";
import { generateHTML } from "./ui";
import { transferMonitor } from "./monitor";
import { generateSelfSignedCert } from "./tls";
import { resolve, dirname, join, basename } from "path";
import { exists, stat } from "fs/promises";

export interface ServerConfig {
  options: CliOptions;
  networkInfo: NetworkInfo;
  filePaths: string[];
  outputDirectory: string;
}

let serverInstance: any = null;

export async function createServer(config: ServerConfig) {
  const { options, networkInfo, filePaths, outputDirectory } = config;

  // Validate file paths exist
  const validFilePaths: string[] = [];
  for (const filePath of filePaths) {
    try {
      if (await exists(filePath)) {
        validFilePaths.push(resolve(filePath));
      }
    } catch {
      // Silently skip invalid paths
    }
  }

  // Build file map: filename -> full path
  // Note: If multiple files in different directories have the same name,
  // only the first one encountered will be accessible. This is a known limitation.
  const fileMap = new Map<string, string>();

  for (const filePath of validFilePaths) {
    try {
      const stats = await stat(filePath);
      if (stats.isFile()) {
        // Single file
        const filename = basename(filePath);
        // Only add if not already in map (first file with this name wins)
        if (!fileMap.has(filename)) {
          fileMap.set(filename, filePath);
        }
      } else if (stats.isDirectory()) {
        // Directory - map all files in it
        const files = await getAllFiles([filePath]);
        for (const file of files) {
          // Only add if not already in map (first file with this name wins)
          if (!fileMap.has(file.name)) {
            fileMap.set(file.name, join(filePath, file.name));
          }
        }
      }
    } catch {
      // Skip if we can't access
    }
  }

  // Base directory for serving (use first file's directory or current dir)
  // Note: baseDir is determined per-file in serveFile function

  async function handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS headers
    const headers = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });

    // Handle OPTIONS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers, status: 204 });
    }

    try {
      // Route: GET / - Web UI
      if (pathname === "/" && request.method === "GET") {
        const html = generateHTML();
        headers.set("Content-Type", "text/html");
        return new Response(html, { headers });
      }

      // Route: GET /files - List available files (JSON)
      if (pathname === "/files" && request.method === "GET") {
        // Get files from shared paths only (not from output directory unless explicitly shared)
        const sharedFiles = await getAllFiles(validFilePaths);

        headers.set("Content-Type", "application/json");
        return new Response(JSON.stringify(sharedFiles), { headers });
      }

      // Route: GET /files/:filename - Download file
      if (pathname.startsWith("/files/") && request.method === "GET") {
        const filename = decodeURIComponent(pathname.slice(7)); // Remove '/files/'
        const rangeHeader = request.headers.get("range");

        transferMonitor.incrementActiveTransfers();

        try {
          // Find the file in our file map
          if (!fileMap.has(filename)) {
            return new Response("File not found", { status: 404, headers });
          }

          const filePath = fileMap.get(filename)!;

          // Get file info for size tracking
          const stats = await stat(filePath);
          const fileSize = stats.size;

          // Serve the file - use the directory containing the file as base
          const fileBaseDir = dirname(filePath);
          const response = await serveFile(basename(filePath), fileBaseDir, rangeHeader);

          // Copy CORS headers
          for (const [key, value] of headers.entries()) {
            response.headers.set(key, value);
          }

          // Track download
          transferMonitor.recordDownload(fileSize);
          transferMonitor.decrementActiveTransfers();

          return response;
        } catch (error) {
          transferMonitor.decrementActiveTransfers();
          return new Response("Internal server error", { status: 500, headers });
        }
      }

      // Route: POST /stop - Stop server
      if (pathname === "/stop" && request.method === "POST") {
        // Log that server was stopped from UI
        console.log("\nServer stopped from web UI.");
        // Stop the server gracefully
        setTimeout(() => {
          if (serverInstance) {
            serverInstance.stop();
            process.exit(0);
          }
        }, 100);
        headers.set("Content-Type", "application/json");
        return new Response(JSON.stringify({ success: true, message: "Server stopping..." }), {
          headers,
        });
      }

      // Route: POST /upload - File upload
      if (pathname === "/upload" && request.method === "POST") {
        transferMonitor.incrementActiveTransfers();

        try {
          const result = await handleUpload(request, outputDirectory);

          if (result.success && result.size) {
            transferMonitor.recordUpload(result.size);
          }

          transferMonitor.decrementActiveTransfers();

          headers.set("Content-Type", "application/json");
          return new Response(JSON.stringify(result), { headers });
        } catch (error) {
          transferMonitor.decrementActiveTransfers();
          headers.set("Content-Type", "application/json");
          return new Response(
            JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Upload failed",
            }),
            { headers, status: 500 }
          );
        }
      }

      // 404 for unknown routes
      return new Response("Not found", { status: 404, headers });
    } catch (error) {
      console.error("Server error:", error);
      return new Response("Internal server error", { status: 500, headers });
    }
  }

  // Server configuration
  const serverConfig: any = {
    port: networkInfo.port,
    hostname: networkInfo.ip,
    fetch: handleRequest,
  };

  // Add TLS if secure mode is enabled
  if (options.secure) {
    const { existsSync } = await import("fs");
    const certPath = join(process.cwd(), "qrdrop-cert.pem");
    const keyPath = join(process.cwd(), "qrdrop-key.pem");

    if (!existsSync(certPath) || !existsSync(keyPath)) {
      try {
        await generateSelfSignedCert(certPath, keyPath, networkInfo.ip);
      } catch (error) {
        console.error("Failed to generate certificate:", error);
        throw error;
      }
    }

    serverConfig.tls = {
      cert: Bun.file(certPath),
      key: Bun.file(keyPath),
    };
  }

  serverInstance = Bun.serve(serverConfig);
  return serverInstance;
}
