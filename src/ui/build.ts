/**
 * Build script for the React UI
 * Bundles the React app and CSS, then inlines them into the HTML template
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";

// Set NODE_ENV to production BEFORE building so Bun uses the production JSX runtime
// This is required because Bun decides which JSX runtime to use (jsx vs jsxDEV) based on NODE_ENV
process.env.NODE_ENV = "production";

const UI_DIR = dirname(import.meta.path);
const DIST_DIR = join(UI_DIR, "dist");

async function build() {
  console.log("Building UI...");

  // Ensure dist directory exists
  await mkdir(DIST_DIR, { recursive: true });

  // Bundle the React app for browser
  const jsResult = await Bun.build({
    entrypoints: [join(UI_DIR, "index.tsx")],
    outdir: DIST_DIR,
    target: "browser",
    minify: true,
    sourcemap: "none",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
  });

  if (!jsResult.success) {
    console.error("JS build failed:");
    for (const log of jsResult.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  // Read the bundled JS
  const jsPath = join(DIST_DIR, "index.js");
  let jsContent = await readFile(jsPath, "utf-8");

  // Escape </script> tags in the JS to prevent breaking the HTML
  // This is a common issue when inlining JS that contains string literals with </script>
  jsContent = jsContent.replace(/<\/script>/gi, "<\\/script>");

  // Read CSS
  const cssPath = join(UI_DIR, "styles", "index.css");
  const cssContent = await readFile(cssPath, "utf-8");

  // Read HTML template
  const htmlTemplatePath = join(UI_DIR, "index.html");
  let htmlContent = await readFile(htmlTemplatePath, "utf-8");

  // Inline CSS and JS into HTML
  // Use a function replacer to avoid issues with special replacement patterns ($&, $$, etc.)
  // in the JS content that could interfere with String.replace()
  htmlContent = htmlContent.replace("{{STYLES}}", () => cssContent);
  htmlContent = htmlContent.replace("{{SCRIPT}}", () => jsContent);

  // Write final HTML
  const outputPath = join(DIST_DIR, "index.html");
  await writeFile(outputPath, htmlContent);

  console.log(`UI built successfully: ${outputPath}`);
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
