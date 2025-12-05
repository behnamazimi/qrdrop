import { mkdir, writeFile } from "fs/promises";
import { join, resolve, basename } from "path";
import { MAX_FILE_SIZE, MAX_UPLOAD_ATTEMPTS } from "./constants";
import type { UploadResult } from "./types/files";

// Re-export for backward compatibility
export type { UploadResult } from "./types/files";

/**
 * Ensure the output directory exists, creating it if necessary
 * @param outputDir - The directory path to ensure exists
 * @throws Error if directory creation fails
 */
async function ensureOutputDirectory(outputDir: string): Promise<void> {
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
 * Extract file extension properly handling dotfiles and files without extensions
 */
function extractFileExtension(filename: string): { ext: string; baseName: string } {
  let ext = "";
  let baseName = filename;

  if (filename.includes(".")) {
    const lastDotIndex = filename.lastIndexOf(".");
    // Only treat as extension if it's not the first character (not a dotfile like .gitignore)
    if (lastDotIndex > 0) {
      ext = filename.slice(lastDotIndex + 1);
      baseName = filename.slice(0, lastDotIndex);
    }
  }

  return { ext, baseName };
}

/**
 * Validate file size and path
 */
function validateFile(
  file: File,
  outputDirectory: string,
  filename: string
): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`,
    };
  }

  // Validate the resolved path is within output directory
  const filePath = join(outputDirectory, filename);
  const resolvedPath = resolve(filePath);
  const resolvedOutput = resolve(outputDirectory);

  if (!resolvedPath.startsWith(resolvedOutput)) {
    return {
      valid: false,
      error: "Invalid file path",
    };
  }

  return { valid: true };
}

/**
 * Find a unique file path by appending numbers if file exists
 */
async function findUniqueFilePath(
  outputDirectory: string,
  filename: string,
  ext: string,
  baseName: string
): Promise<string> {
  let finalPath = resolve(outputDirectory, filename);
  let counter = 1;

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

  return finalPath;
}

/**
 * Write file with retry logic for handling race conditions
 */
async function writeFileWithRetry(
  file: File,
  outputDirectory: string,
  ext: string,
  baseName: string,
  initialPath: string
): Promise<{ success: boolean; filename?: string; size?: number; error?: string }> {
  // Convert file to array buffer once (file can only be read once)
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Retry with new name if file was created between check and write (race condition)
  let finalPath = initialPath;
  let written = false;
  let attempts = 0;
  let counter = 1;

  while (!written && attempts < MAX_UPLOAD_ATTEMPTS) {
    try {
      // Try to write with exclusive flag - throws EEXIST if file already exists
      await writeFile(finalPath, buffer, { flag: "wx" });
      written = true;
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;
      // If file exists (EEXIST), try next name
      if (nodeError?.code === "EEXIST" || nodeError?.code === "EACCES") {
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
    return {
      success: false,
      error: "Could not create unique filename after multiple attempts",
    };
  }

  return {
    success: true,
    filename: basename(finalPath),
    size: buffer.length,
  };
}

/**
 * Process a single file upload
 */
async function processSingleFile(
  file: File,
  outputDirectory: string
): Promise<{ success: boolean; filename?: string; size?: number; error?: string }> {
  // Sanitize filename
  const filename = sanitizeFilename(file.name || "uploaded-file");

  // Validate file
  const validation = validateFile(file, outputDirectory, filename);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  // Extract extension
  const { ext, baseName } = extractFileExtension(filename);

  // Find unique file path
  const initialPath = await findUniqueFilePath(outputDirectory, filename, ext, baseName);

  // Write file with retry logic
  return writeFileWithRetry(file, outputDirectory, ext, baseName, initialPath);
}

/**
 * Handle file upload(s) from multipart form data
 * Supports both single and multiple file uploads
 * @param request - The HTTP request containing the file upload(s)
 * @param outputDirectory - Directory where the uploaded file(s) should be saved
 * @returns Upload result with success status, filename(s), size, or error message
 * @returns Automatically handles filename conflicts by appending numbers
 */
export async function handleUpload(
  request: Request,
  outputDirectory: string
): Promise<UploadResult> {
  try {
    // Ensure output directory exists
    await ensureOutputDirectory(outputDirectory);

    const formData = await request.formData();

    // Get all files from the form data
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "file" && typeof value !== "string" && "name" in value) {
        files.push(value as File);
      }
    }

    if (files.length === 0) {
      return {
        success: false,
        error: "No file provided",
      };
    }

    // Handle single file upload (backward compatible)
    if (files.length === 1) {
      const result = await processSingleFile(files[0]!, outputDirectory);
      return result;
    }

    // Handle multiple file uploads
    const results: { success: boolean; filename?: string; size?: number; error?: string }[] = [];
    const successfulFiles: string[] = [];
    let totalSize = 0;
    const errors: string[] = [];

    for (const file of files) {
      const result = await processSingleFile(file, outputDirectory);
      results.push(result);

      if (result.success && result.filename) {
        successfulFiles.push(result.filename);
        totalSize += result.size || 0;
      } else if (result.error) {
        errors.push(`${file.name}: ${result.error}`);
      }
    }

    // All files failed
    if (successfulFiles.length === 0) {
      return {
        success: false,
        error: errors.join("; "),
      };
    }

    // Some or all files succeeded
    return {
      success: true,
      filename: successfulFiles[0], // For backward compatibility
      filenames: successfulFiles,
      size: results[0]?.size, // For backward compatibility
      totalSize,
      fileCount: successfulFiles.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}
