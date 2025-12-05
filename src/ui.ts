// Import the HTML file directly so Bun embeds it in the compiled binary
// This uses Bun's file embedding feature for compiled binaries
import htmlContent from "./ui/dist/index.html" with { type: "text" };

/**
 * Get the pre-built HTML from the UI dist folder
 * The HTML is embedded at compile time when building the binary
 */
export async function generateHTML(): Promise<string> {
  // The import with { type: "text" } returns an HTMLBundle which has a toString() method
  // that returns the file content as a string
  return String(htmlContent);
}
