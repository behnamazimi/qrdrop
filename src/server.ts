import type { CliOptions } from "./cli";
import type { NetworkInfo } from "./network";
import { getFiles, getMimeType } from "./files";
import { handleUpload } from "./upload";
import { generateHTML } from "./ui";
import { transferMonitor } from "./monitor";
import { generateSelfSignedCert, isCertificateExpiringSoon } from "./tls";
import { zipFiles } from "./zip";
import { resolve, join, basename } from "path";
import { exists, stat, unlink } from "fs/promises";
import { createRateLimiter } from "./rate-limit";
import { getClientIP, isIPAllowed, isFileTypeAllowed, parseRangeHeader } from "./security";
import { logger } from "./logger";
import { Router, createCorsHeaders, type RouteParams } from "./router";
import { formatError } from "./utils/error";
import { success, color } from "./output";
import { ZIP_FILENAME } from "./constants";

interface ServerConfig {
  options: CliOptions;
  networkInfo: NetworkInfo;
  filePaths: string[];
  outputDirectory: string;
}

// Bun server instance type - Bun.serve() returns a Server object
type BunServer = ReturnType<typeof Bun.serve>;
let serverInstance: BunServer | null = null;

// Track temporary zip files for cleanup on shutdown
const tempZipFiles = new Set<string>();

/**
 * Clean up all temporary zip files
 */
async function cleanupTempZipFiles(): Promise<void> {
  for (const zipPath of tempZipFiles) {
    try {
      await unlink(zipPath);
      logger.debug("Cleaned up temp zip file", { path: zipPath });
    } catch {
      // File may already be deleted, ignore
    }
  }
  tempZipFiles.clear();
}

// Register cleanup handlers for process exit
process.on("exit", () => {
  // Synchronous cleanup on exit - best effort
  for (const zipPath of tempZipFiles) {
    try {
      require("fs").unlinkSync(zipPath);
    } catch {
      // Ignore errors during exit
    }
  }
});

process.on("SIGINT", async () => {
  await cleanupTempZipFiles();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await cleanupTempZipFiles();
  process.exit(0);
});

/**
 * Build a map of filenames to their full paths
 */
async function buildFileMap(validFilePaths: string[]): Promise<Map<string, string>> {
  const fileMap = new Map<string, string>();

  for (const filePath of validFilePaths) {
    try {
      const stats = await stat(filePath);
      if (stats.isFile()) {
        const filename = basename(filePath);
        if (!fileMap.has(filename)) {
          fileMap.set(filename, filePath);
        }
      } else if (stats.isDirectory()) {
        const files = await getFiles([filePath]);
        for (const file of files) {
          if (!fileMap.has(file.name)) {
            fileMap.set(file.name, join(filePath, file.name));
          }
        }
      }
    } catch (error) {
      // Skip if we can't access - logged at debug level
      logger.debug("Could not access file path", { path: filePath, error: formatError(error) });
    }
  }

  return fileMap;
}

/**
 * Validate and filter file paths that exist
 */
async function validateFilePaths(filePaths: string[]): Promise<string[]> {
  const validFilePaths: string[] = [];

  for (const filePath of filePaths) {
    try {
      if (await exists(filePath)) {
        validFilePaths.push(resolve(filePath));
      }
    } catch {
      logger.debug("Could not validate file path", { path: filePath });
    }
  }

  return validFilePaths;
}

/**
 * Create access checker middleware
 */
function createAccessChecker(
  options: CliOptions,
  limiter: ReturnType<typeof createRateLimiter> | null
) {
  return function checkRequestAccess(
    request: Request,
    headers: Headers,
    server?: BunServer
  ): { allowed: boolean; response?: Response } {
    const clientIP = getClientIP(request, server);
    const url = new URL(request.url);
    const userAgent = request.headers.get("user-agent") || "unknown";
    const timestamp = new Date().toISOString();

    // Log all requests
    const logLevel = options.verbose || options.debug ? "info" : "debug";
    logger[logLevel]("Request received", {
      method: request.method,
      path: url.pathname,
      ip: clientIP,
      userAgent,
      timestamp,
    });

    // Check IP allowlist
    if (options.allowIps && options.allowIps.length > 0) {
      if (!isIPAllowed(clientIP, options.allowIps)) {
        logger.warn("Access denied", { ip: clientIP, path: url.pathname });
        return {
          allowed: false,
          response: new Response("Access denied", { status: 403, headers }),
        };
      }
    }

    // Check rate limiting
    if (limiter) {
      if (!limiter.check(clientIP)) {
        const remaining = limiter.getRemaining(clientIP);
        const resetTime = limiter.getResetTime(clientIP);
        headers.set("X-RateLimit-Limit", String(options.rateLimit || 100));
        headers.set("X-RateLimit-Remaining", String(remaining));
        headers.set("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)));
        headers.set("Retry-After", String(Math.ceil(resetTime / 1000)));
        logger.warn("Rate limit exceeded", { ip: clientIP, path: url.pathname });
        return {
          allowed: false,
          response: new Response("Rate limit exceeded", { status: 429, headers }),
        };
      }
    }

    return { allowed: true };
  };
}

/**
 * Create route handlers for the server
 */
function createRouteHandlers(
  options: CliOptions,
  validFilePaths: string[],
  fileMap: Map<string, string>,
  outputDirectory: string
) {
  // Handler: GET / - Web UI
  async function handleRootRequest(_request: Request, params: RouteParams): Promise<Response> {
    const html = await generateHTML();
    params.headers.set("Content-Type", "text/html");
    return new Response(html, { headers: params.headers });
  }

  // Handler: GET /files - List available files (JSON)
  async function handleFilesListRequest(_request: Request, params: RouteParams): Promise<Response> {
    const sharedFiles = await getFiles(validFilePaths, options.allowedTypes);
    logger.debug("Files list request", {
      fileCount: sharedFiles.length,
      fileNames: sharedFiles.map((f) => f.name),
      fileMapKeys: Array.from(fileMap.keys()),
    });
    params.headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify(sharedFiles), { headers: params.headers });
  }

  // Handler: GET /files/:filename - Download file
  async function handleFileDownloadRequest(
    request: Request,
    params: RouteParams
  ): Promise<Response> {
    let filename = params.filename as string;
    const rangeHeader = request.headers.get("range");

    transferMonitor.incrementActiveTransfers();

    try {
      // Check file type restrictions
      if (
        options.allowedTypes &&
        options.allowedTypes.length > 0 &&
        !isFileTypeAllowed(filename, options.allowedTypes)
      ) {
        transferMonitor.decrementActiveTransfers();
        return new Response("File type not allowed", { status: 403, headers: params.headers });
      }

      // Find the file in our file map
      // Try multiple variations of the filename to handle encoding issues
      let filePath: string | undefined = fileMap.get(filename);

      // If not found, try case-insensitive match
      if (!filePath) {
        for (const [key, path] of fileMap.entries()) {
          if (key.toLowerCase() === filename.toLowerCase()) {
            filePath = path;
            filename = key; // Use the actual key from fileMap
            logger.debug("Found file with case-insensitive match", {
              requested: params.filename,
              actual: key,
            });
            break;
          }
        }
      }

      // If still not found, try to find it in validFilePaths directly
      // This handles edge cases where fileMap might be out of sync
      if (!filePath) {
        for (const filePathCandidate of validFilePaths) {
          const candidateName = basename(filePathCandidate);
          if (
            candidateName === filename ||
            candidateName.toLowerCase() === filename.toLowerCase()
          ) {
            // Verify it exists and is a file
            try {
              const stats = await stat(filePathCandidate);
              if (stats.isFile()) {
                filePath = filePathCandidate;
                logger.debug("Found file in validFilePaths (fileMap fallback)", {
                  filename,
                  filePath,
                });
                break;
              }
            } catch {
              // Continue searching
            }
          }
        }
      }

      // If still not found, log and return 404
      if (!filePath) {
        logger.warn("File not found in fileMap or validFilePaths", {
          requestedFilename: filename,
          originalParam: params.filename,
          filenameEncoded: encodeURIComponent(filename),
          availableFiles: Array.from(fileMap.keys()),
          fileMapSize: fileMap.size,
          validFilePaths: validFilePaths.map((p) => basename(p)),
        });
        transferMonitor.decrementActiveTransfers();
        return new Response("File not found", { status: 404, headers: params.headers });
      }

      logger.debug("File found", { filename, filePath });

      // Verify the file still exists (important for temp zip files)
      if (!(await exists(filePath))) {
        logger.warn("File path does not exist", { filename, filePath });
        transferMonitor.decrementActiveTransfers();
        return new Response("File not found", { status: 404, headers: params.headers });
      }

      // For files from fileMap, we already know they're valid, so serve directly
      // This is especially important for zip files in temp directories
      try {
        const stats = await stat(filePath);
        if (!stats.isFile()) {
          logger.warn("File path is not a file", { filename, filePath });
          transferMonitor.decrementActiveTransfers();
          return new Response("Not a file", { status: 404, headers: params.headers });
        }

        const fileSize = stats.size;
        const mimeType = getMimeType(filePath);

        // Parse range header
        const ranges = parseRangeHeader(rangeHeader, fileSize);

        let response: Response;

        if (!ranges) {
          // No range request, serve entire file
          const file = Bun.file(filePath);
          response = new Response(file, {
            headers: {
              "Content-Type": mimeType,
              "Content-Length": fileSize.toString(),
              "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
              "Accept-Ranges": "bytes",
              "Last-Modified": stats.mtime.toUTCString(),
            },
          });
        } else {
          // Handle range request (serves first range only)
          const range = ranges[0]!;
          const start = range.start;
          const end = range.end;
          const contentLength = end - start + 1;

          // Use Bun's file slicing for efficient range reading
          const file = Bun.file(filePath);
          const rangeBlob = file.slice(start, end + 1);

          response = new Response(rangeBlob, {
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

        // Copy CORS headers
        for (const [key, value] of params.headers.entries()) {
          response.headers.set(key, value);
        }

        // Track download
        transferMonitor.recordDownload(fileSize);
        transferMonitor.decrementActiveTransfers();

        // Log successful download
        console.log(success(`Downloaded: ${color.cyan(filename)}`));

        return response;
      } catch (fileError) {
        transferMonitor.decrementActiveTransfers();
        logger.error("File serving error", { error: formatError(fileError) });
        return new Response("Internal server error", { status: 500, headers: params.headers });
      }
    } catch (error) {
      transferMonitor.decrementActiveTransfers();
      logger.error("File download error", { error: formatError(error) });
      return new Response("Internal server error", { status: 500, headers: params.headers });
    }
  }

  // Handler: POST /upload - File upload
  async function handleUploadRequest(request: Request, params: RouteParams): Promise<Response> {
    transferMonitor.incrementActiveTransfers();

    try {
      // Check file type restrictions for uploads (check all files)
      if (options.allowedTypes && options.allowedTypes.length > 0) {
        const clonedRequest = request.clone();
        const formData = await clonedRequest.formData();
        const disallowedFiles: string[] = [];

        for (const [key, value] of formData.entries()) {
          if (key === "file" && typeof value !== "string" && "name" in value) {
            const file = value as File;
            if (!isFileTypeAllowed(file.name, options.allowedTypes)) {
              disallowedFiles.push(file.name);
            }
          }
        }

        if (disallowedFiles.length > 0) {
          transferMonitor.decrementActiveTransfers();
          params.headers.set("Content-Type", "application/json");
          return new Response(
            JSON.stringify({
              success: false,
              error: `File type not allowed: ${disallowedFiles.join(", ")}`,
            }),
            {
              headers: params.headers,
              status: 403,
            }
          );
        }
      }

      const result = await handleUpload(request, outputDirectory);

      if (result.success) {
        // Track total upload size (use totalSize for multiple files, size for single)
        const uploadSize = result.totalSize || result.size || 0;
        if (uploadSize > 0) {
          transferMonitor.recordUpload(uploadSize);
        }

        // Log successful upload
        if (result.filenames && result.filenames.length > 1) {
          console.log(
            success(
              `Received ${result.fileCount} files: ${color.cyan(result.filenames.join(", "))}`
            )
          );
        } else {
          const filename = result.filenames?.[0] || result.filename || "unknown";
          console.log(success(`Received: ${color.cyan(filename)}`));
        }
      }

      transferMonitor.decrementActiveTransfers();
      params.headers.set("Content-Type", "application/json");
      return new Response(JSON.stringify(result), { headers: params.headers });
    } catch (error) {
      transferMonitor.decrementActiveTransfers();
      const errorMessage = formatError(error);
      logger.error("File upload error", { error: errorMessage });
      params.headers.set("Content-Type", "application/json");
      return new Response(JSON.stringify({ success: false, error: errorMessage }), {
        headers: params.headers,
        status: 500,
      });
    }
  }

  // Handler: GET /download-all - Download all files as a zip
  async function handleDownloadAllRequest(
    _request: Request,
    params: RouteParams
  ): Promise<Response> {
    transferMonitor.incrementActiveTransfers();

    try {
      // Get all file paths from the file map
      const allFilePaths = Array.from(fileMap.values());

      if (allFilePaths.length === 0) {
        transferMonitor.decrementActiveTransfers();
        params.headers.set("Content-Type", "application/json");
        return new Response(JSON.stringify({ error: "No files available" }), {
          status: 404,
          headers: params.headers,
        });
      }

      // Create zip file
      const zipPath = await zipFiles(allFilePaths);
      tempZipFiles.add(zipPath);

      // Read the zip file
      const zipFile = Bun.file(zipPath);
      const zipSize = zipFile.size;

      // Set response headers for download
      params.headers.set("Content-Type", "application/zip");
      params.headers.set("Content-Disposition", `attachment; filename="${ZIP_FILENAME}"`);
      params.headers.set("Content-Length", String(zipSize));

      // Track download
      transferMonitor.recordDownload(zipSize);
      transferMonitor.decrementActiveTransfers();

      // Log successful download
      console.log(
        success(`Downloaded: ${color.cyan(ZIP_FILENAME)} (${allFilePaths.length} files)`)
      );

      // Create response with the zip file stream
      const response = new Response(zipFile.stream(), { headers: params.headers });

      // Clean up temp file after response is sent (with a delay to ensure streaming completes)
      setTimeout(async () => {
        try {
          await unlink(zipPath);
          tempZipFiles.delete(zipPath);
          logger.debug("Cleaned up temp zip file after download", { path: zipPath });
        } catch {
          // File may already be deleted, ignore
        }
      }, 5000);

      return response;
    } catch (error) {
      transferMonitor.decrementActiveTransfers();
      logger.error("Download all error", { error: formatError(error) });
      params.headers.set("Content-Type", "application/json");
      return new Response(JSON.stringify({ error: "Failed to create zip archive" }), {
        status: 500,
        headers: params.headers,
      });
    }
  }

  // Handler: POST /stop - Stop server
  function handleStopRequest(_request: Request, params: RouteParams): Response {
    console.log("\nServer stopped from web UI.");
    setTimeout(async () => {
      await cleanupTempZipFiles();
      if (serverInstance) {
        serverInstance.stop();
        process.exit(0);
      }
    }, 100);
    params.headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ success: true, message: "Server stopping..." }), {
      headers: params.headers,
    });
  }

  // Handler: OPTIONS - CORS preflight
  function handleOptionsRequest(_request: Request, params: RouteParams): Response {
    return new Response(null, { headers: params.headers, status: 204 });
  }

  return {
    handleRootRequest,
    handleFilesListRequest,
    handleFileDownloadRequest,
    handleDownloadAllRequest,
    handleUploadRequest,
    handleStopRequest,
    handleOptionsRequest,
  };
}

/**
 * Configure TLS for the server
 */
async function configureTLS(
  options: CliOptions,
  networkInfo: NetworkInfo
): Promise<{
  cert: ReturnType<typeof Bun.file>;
  key: ReturnType<typeof Bun.file>;
  minVersion: string;
} | null> {
  const useCustomCert = options.cert && options.key;

  if (!options.secure && !useCustomCert) {
    return null;
  }

  const { existsSync } = await import("fs");

  const certPath = options.cert ? resolve(options.cert) : join(process.cwd(), "qrdrop-cert.pem");
  const keyPath = options.key ? resolve(options.key) : join(process.cwd(), "qrdrop-key.pem");

  // Validate custom cert/key files exist
  if (useCustomCert) {
    if (!existsSync(certPath)) {
      throw new Error(`Certificate file not found: ${certPath}`);
    }
    if (!existsSync(keyPath)) {
      throw new Error(`Private key file not found: ${keyPath}`);
    }
  } else if (!existsSync(certPath) || !existsSync(keyPath)) {
    try {
      await generateSelfSignedCert(certPath, keyPath, networkInfo.ip);
    } catch (error) {
      logger.error("Failed to generate certificate", { error: formatError(error) });
      throw error;
    }
  }

  // Check certificate expiry
  const expiryCheck = isCertificateExpiringSoon(certPath);
  if (expiryCheck.expired) {
    console.warn(`⚠️  Warning: ${expiryCheck.message}`);
    console.warn("   Consider regenerating the certificate with --secure");
  } else if (expiryCheck.expiringSoon) {
    console.warn(`⚠️  Warning: ${expiryCheck.message}`);
  }

  return {
    cert: Bun.file(certPath),
    key: Bun.file(keyPath),
    minVersion: "TLSv1.2",
  };
}

/**
 * Create and start the HTTP/HTTPS server for file sharing
 * @param config - Server configuration including options, network info, file paths, and output directory
 * @returns Bun server instance
 * @throws Error if server creation fails (e.g., TLS certificate generation fails)
 */
export async function createServer(config: ServerConfig) {
  const { options, networkInfo, filePaths, outputDirectory } = config;

  // Initialize rate limiter if configured
  const limiter =
    options.rateLimit !== undefined
      ? createRateLimiter(options.rateLimit, (options.rateLimitWindow || 60) * 1000)
      : null;

  // Cleanup rate limiter periodically
  if (limiter) {
    setInterval(() => limiter.cleanup(), 60000);
  }

  // Validate and build file structures
  const validFilePaths = await validateFilePaths(filePaths);
  const fileMap = await buildFileMap(validFilePaths);

  // Track zip files created with --zip flag to prevent premature cleanup
  // Check if any of the valid file paths are zip files in temp directory
  for (const filePath of validFilePaths) {
    if (
      filePath.endsWith(".zip") &&
      (filePath.includes("/tmp/") || filePath.includes("\\temp\\"))
    ) {
      tempZipFiles.add(filePath);
      logger.debug("Tracking zip file for cleanup", { path: filePath });
    }
  }

  // Create access checker
  const checkAccess = createAccessChecker(options, limiter);

  // Create route handlers
  const handlers = createRouteHandlers(options, validFilePaths, fileMap, outputDirectory);

  // Set up router
  const router = new Router();
  router
    .get("/", handlers.handleRootRequest)
    .get("/files", handlers.handleFilesListRequest)
    .get("/files/:filename", handlers.handleFileDownloadRequest)
    .get("/download-all", handlers.handleDownloadAllRequest)
    .post("/upload", handlers.handleUploadRequest)
    .post("/stop", handlers.handleStopRequest)
    .options("/", handlers.handleOptionsRequest)
    .options("/files", handlers.handleOptionsRequest)
    .options("/files/:filename", handlers.handleOptionsRequest)
    .options("/download-all", handlers.handleOptionsRequest)
    .options("/upload", handlers.handleOptionsRequest)
    .setNotFoundHandler((_request, params) => {
      logger.debug("Route not found", { path: params.pathname });
      return new Response("Not found", { status: 404, headers: params.headers });
    });

  // Configure TLS
  const tlsConfig = await configureTLS(options, networkInfo);

  // Server fetch handler
  const fetchHandler = (req: Request, server: BunServer) => {
    const url = new URL(req.url);
    let pathname = url.pathname;

    // Handle custom path prefix
    const customPath = networkInfo.path || "/";

    // Redirect custom path without trailing slash to include trailing slash
    // This ensures relative URLs in the UI work correctly
    if (customPath !== "/" && pathname === customPath) {
      const redirectUrl = new URL(req.url);
      redirectUrl.pathname = customPath + "/";
      return Response.redirect(redirectUrl.toString(), 301);
    }

    // Strip custom path prefix if present
    if (customPath !== "/" && pathname.startsWith(customPath)) {
      pathname = pathname.slice(customPath.length) || "/";
    }

    // Create CORS headers
    const headers = createCorsHeaders();

    // Handle OPTIONS preflight without access check
    if (req.method === "OPTIONS") {
      return new Response(null, { headers, status: 204 });
    }

    // Check access (pass server for IP extraction)
    const accessCheck = checkAccess(req, headers, server);
    if (!accessCheck.allowed) {
      return accessCheck.response!;
    }

    // Route the request
    return router.handle(req, headers, customPath);
  };

  // Build server configuration
  const baseConfig = {
    port: networkInfo.port,
    hostname: networkInfo.ip === "0.0.0.0" ? undefined : networkInfo.ip,
    fetch: fetchHandler,
  };

  // Create server with or without TLS
  serverInstance = tlsConfig ? Bun.serve({ ...baseConfig, tls: tlsConfig }) : Bun.serve(baseConfig);

  return serverInstance;
}
