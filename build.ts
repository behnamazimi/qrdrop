/**
 * Build script for compiling the qrdrop binary
 * Uses Bun's build API to create a standalone executable with version embedded
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { $ } from "bun";

const PROJECT_ROOT = dirname(import.meta.path);
const DIST_DIR = join(PROJECT_ROOT, "dist");

async function build() {
  console.log("Building binary...");

  // Read version from package.json
  const packageJsonPath = join(PROJECT_ROOT, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  const version = packageJson.version;

  // Ensure dist directory exists
  await $`mkdir -p ${DIST_DIR}`;

  // Determine platform-specific settings
  const platform = process.platform;
  const ext = platform === "win32" ? ".exe" : "";
  const outfile = join(DIST_DIR, `qrdrop${ext}`);

  // Build the binary with version embedded
  const compileOptions =
    platform === "win32" ? { outfile, windows: { hideConsole: true } } : { outfile };

  const buildResult = await Bun.build({
    entrypoints: [join(PROJECT_ROOT, "index.ts")],
    minify: true,
    target: "bun",
    define: {
      BUILD_VERSION: JSON.stringify(version),
    },
    compile: compileOptions,
  });

  if (!buildResult.success) {
    console.error("Build failed:");
    for (const log of buildResult.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  console.log(`Binary built successfully: ${outfile}`);
  console.log(`Version: ${version}`);
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
