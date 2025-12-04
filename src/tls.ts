import { existsSync } from "fs";
import { execSync } from "child_process";

/**
 * Generate self-signed certificate for HTTPS
 */
export async function generateSelfSignedCert(
  certPath: string,
  keyPath: string,
  hostname: string
): Promise<void> {
  if (existsSync(certPath) && existsSync(keyPath)) {
    return; // Certificate already exists
  }

  try {
    // Use openssl to generate self-signed certificate
    // Cross-platform: handle path separators and redirect stderr
    const subject = `/CN=${hostname}/O=qrdrop`;
    const isWindows = process.platform === "win32";
    const stderrRedirect = isWindows ? "2>nul" : "2>/dev/null";

    const options: { stdio: "ignore"; shell?: string } = { stdio: "ignore" };
    if (isWindows) {
      options.shell = process.env["COMSPEC"] || "cmd.exe";
    }

    execSync(
      `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "${subject}" ${stderrRedirect}`,
      options
    );
  } catch (error) {
    // If openssl is not available, throw error
    throw new Error(
      "OpenSSL not found. Please install OpenSSL to use --secure option, or use --secure=false"
    );
  }
}
