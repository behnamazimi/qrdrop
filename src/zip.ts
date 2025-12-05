import { join, basename } from "path";
import { tmpdir } from "os";
import { createWriteStream } from "fs";
import { stat } from "fs/promises";
import archiver from "archiver";

interface ZipProgress {
  /** Number of files processed so far */
  filesProcessed: number;
  /** Total bytes processed so far */
  bytesProcessed: number;
  /** Current file being processed */
  currentFile?: string;
}

type ZipProgressCallback = (progress: ZipProgress) => void;

/**
 * Create a zip archive from multiple file/directory paths
 * Uses archiver library - no external CLI dependency required
 * @param filePaths - Array of file or directory paths to archive
 * @param outputDir - Directory where the archive should be created (defaults to system temp dir)
 * @param onProgress - Optional callback for progress updates
 * @returns Path to the created archive file
 * @throws Error if archive creation fails
 */
export async function zipFiles(
  filePaths: string[],
  outputDir: string = tmpdir(),
  onProgress?: ZipProgressCallback
): Promise<string> {
  // Generate unique zip filename
  const timestamp = Date.now();
  const zipPath = join(outputDir, `qrdrop-${timestamp}.zip`);

  return new Promise(async (resolve, reject) => {
    try {
      // Create output stream
      const output = createWriteStream(zipPath);

      // Create archiver instance
      const archive = archiver("zip", {
        zlib: { level: 6 }, // Balanced compression level
      });

      // Track progress
      let filesProcessed = 0;

      // Handle output stream events
      output.on("close", () => {
        resolve(zipPath);
      });

      output.on("error", (err) => {
        reject(new Error(`Failed to write zip file: ${err.message}`));
      });

      // Handle archive events
      archive.on("error", (err) => {
        reject(new Error(`Failed to create zip archive: ${err.message}`));
      });

      archive.on("warning", (err) => {
        if (err.code === "ENOENT") {
          // Log warning but don't fail - file might have been deleted
          console.warn(`Warning: ${err.message}`);
        } else {
          reject(err);
        }
      });

      // Track progress on each file entry
      archive.on("entry", (entry) => {
        filesProcessed++;
        if (onProgress) {
          onProgress({
            filesProcessed,
            bytesProcessed: archive.pointer(),
            currentFile: entry.name,
          });
        }
      });

      // Pipe archive to output file
      archive.pipe(output);

      // Add files/directories to archive
      for (const filePath of filePaths) {
        try {
          const stats = await stat(filePath);
          const name = basename(filePath);

          if (stats.isDirectory()) {
            // Add directory recursively
            archive.directory(filePath, name);
          } else {
            // Add single file
            archive.file(filePath, { name });
          }
        } catch (err) {
          // Skip files that don't exist or can't be accessed
          console.warn(
            `Warning: Could not add ${filePath}: ${err instanceof Error ? err.message : err}`
          );
        }
      }

      // Finalize the archive
      await archive.finalize();
    } catch (error) {
      reject(
        new Error(
          `Failed to create zip archive: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  });
}
