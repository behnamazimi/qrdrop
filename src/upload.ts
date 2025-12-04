import { mkdir, writeFile } from "fs/promises";
import { join, resolve, basename } from "path";

const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB

export interface UploadResult {
  success: boolean;
  filename?: string;
  error?: string;
  size?: number;
}

/**
 * Ensure output directory exists
 */
export async function ensureOutputDirectory(outputDir: string): Promise<void> {
  try {
    await mkdir(outputDir, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create output directory: ${outputDir}`);
  }
}

/**
 * Sanitize filename to prevent directory traversal
 */
function sanitizeFilename(filename: string): string {
  // Remove path separators and dangerous characters
  return basename(filename.replace(/[<>:"|?*\x00-\x1f]/g, "_"));
}

/**
 * Handle file upload from multipart form data
 */
export async function handleUpload(
  request: Request,
  outputDirectory: string
): Promise<UploadResult> {
  try {
    // Ensure output directory exists
    await ensureOutputDirectory(outputDirectory);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return {
        success: false,
        error: "No file provided",
      };
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`,
      };
    }

    // Sanitize filename
    const filename = sanitizeFilename(file.name || "uploaded-file");
    const filePath = join(outputDirectory, filename);

    // Validate the resolved path is within output directory
    const resolvedPath = resolve(filePath);
    const resolvedOutput = resolve(outputDirectory);

    if (!resolvedPath.startsWith(resolvedOutput)) {
      return {
        success: false,
        error: "Invalid file path",
      };
    }

    // Handle filename conflicts by appending a number
    let finalPath = resolvedPath;
    let counter = 1;
    const ext = file.name ? file.name.split(".").pop() : "";
    const baseName = ext ? filename.replace(`.${ext}`, "") : filename;

    // Check if file exists and create unique name
    try {
      const { access, constants } = await import("fs/promises");
      while (true) {
        try {
          await access(finalPath, constants.F_OK);
          // File exists, try next name
          const newName = ext ? `${baseName}_${counter}.${ext}` : `${baseName}_${counter}`;
          finalPath = resolve(outputDirectory, newName);
          counter++;
        } catch {
          // File doesn't exist, we can use this path
          break;
        }
      }
    } catch {
      // If access is not available, we'll handle the error when writing
    }

    // Convert file to array buffer once (file can only be read once)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Retry with new name if file was created between check and write (race condition)
    let written = false;
    let attempts = 0;
    const maxAttempts = 100;

    while (!written && attempts < maxAttempts) {
      try {
        // Try to write - if file exists, it will throw EEXIST which we catch below
        // Note: Bun's writeFile may not support flag option, so we rely on error handling
        try {
          await writeFile(finalPath, buffer, { flag: "wx" as any });
        } catch (flagError: any) {
          // If flag is not supported, fall back to regular write and check error
          if (flagError?.message?.includes("flag") || flagError?.code === "EINVAL") {
            await writeFile(finalPath, buffer);
          } else {
            throw flagError;
          }
        }
        written = true;
      } catch (error: any) {
        // If file exists (EEXIST), try next name
        if (error?.code === "EEXIST" || error?.code === "EACCES") {
          const newName = ext ? `${baseName}_${counter}.${ext}` : `${baseName}_${counter}`;
          finalPath = resolve(outputDirectory, newName);
          counter++;
          attempts++;
        } else {
          // Other error, rethrow
          throw error;
        }
      }
    }

    if (!written) {
      throw new Error("Could not create unique filename after multiple attempts");
    }

    return {
      success: true,
      filename: basename(finalPath),
      size: buffer.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

/**
 * Handle multiple file uploads
 */
export async function handleMultipleUploads(
  request: Request,
  outputDirectory: string
): Promise<UploadResult[]> {
  try {
    await ensureOutputDirectory(outputDirectory);

    const formData = await request.formData();
    const results: UploadResult[] = [];

    // Get all files from form data
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "file" && value instanceof File) {
        files.push(value);
      }
    }

    // Handle each file
    for (const file of files) {
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        results.push({
          success: false,
          error: `File ${file.name} exceeds maximum size`,
        });
        continue;
      }

      // Sanitize filename
      const filename = sanitizeFilename(file.name || "uploaded-file");
      const filePath = join(outputDirectory, filename);

      // Validate path
      const resolvedPath = resolve(filePath);
      const resolvedOutput = resolve(outputDirectory);

      if (!resolvedPath.startsWith(resolvedOutput)) {
        results.push({
          success: false,
          error: `Invalid path for ${file.name}`,
        });
        continue;
      }

      // Handle filename conflicts
      let finalPath = resolvedPath;
      let counter = 1;

      // Properly extract extension (handle dotfiles and files without extensions)
      let ext = "";
      let baseName = filename;
      if (file.name && file.name.includes(".")) {
        const lastDotIndex = file.name.lastIndexOf(".");
        // Only treat as extension if it's not the first character (not a dotfile like .gitignore)
        if (lastDotIndex > 0) {
          ext = file.name.slice(lastDotIndex + 1);
          baseName = filename.slice(0, lastDotIndex);
        }
      }

      try {
        const { access, constants } = await import("fs/promises");
        while (true) {
          try {
            await access(finalPath, constants.F_OK);
            // File exists, try next name
            const newName = ext ? `${baseName}_${counter}.${ext}` : `${baseName}_${counter}`;
            finalPath = resolve(outputDirectory, newName);
            counter++;
          } catch {
            // File doesn't exist, we can use this path
            break;
          }
        }
      } catch {
        // Continue if access is not available
      }

      // Convert file to array buffer once (file can only be read once)
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Retry with new name if file was created between check and write (race condition)
      let written = false;
      let attempts = 0;
      const maxAttempts = 100;

      while (!written && attempts < maxAttempts) {
        try {
          // Try to write - if file exists, it will throw EEXIST which we catch below
          // Note: Bun's writeFile may not support flag option, so we rely on error handling
          try {
            await writeFile(finalPath, buffer, { flag: "wx" as any });
          } catch (flagError: any) {
            // If flag is not supported, fall back to regular write and check error
            if (flagError?.message?.includes("flag") || flagError?.code === "EINVAL") {
              await writeFile(finalPath, buffer);
            } else {
              throw flagError;
            }
          }
          written = true;

          results.push({
            success: true,
            filename: basename(finalPath),
            size: buffer.length,
          });
        } catch (error: any) {
          // If file exists (EEXIST), try next name
          if (error?.code === "EEXIST" || error?.code === "EACCES") {
            const newName = ext ? `${baseName}_${counter}.${ext}` : `${baseName}_${counter}`;
            finalPath = resolve(outputDirectory, newName);
            counter++;
            attempts++;
          } else {
            // Other error
            results.push({
              success: false,
              error: error instanceof Error ? error.message : "Upload failed",
            });
            break;
          }
        }
      }

      if (!written && attempts >= maxAttempts) {
        results.push({
          success: false,
          error: "Could not create unique filename after multiple attempts",
        });
      }
    }

    return results;
  } catch (error) {
    return [
      {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      },
    ];
  }
}
