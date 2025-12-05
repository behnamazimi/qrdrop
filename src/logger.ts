/**
 * Structured logging system
 */

import type { FileHandle } from "fs/promises";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
}

class Logger {
  private level: LogLevel = "info";
  private jsonOutput: boolean = false;
  private logFile: string | null = null;
  private _fileHandle: FileHandle | null = null;

  /**
   * Initialize logger
   */
  init(level: LogLevel = "info", json: boolean = false, logFile?: string): void {
    this.level = level;
    this.jsonOutput = json;
    this.logFile = logFile || null;
  }

  /**
   * Set the file handle for log file output
   */
  setFileHandle(handle: FileHandle | null): void {
    this._fileHandle = handle;
  }

  /**
   * Get numeric level for comparison
   */
  private getLevelValue(level: LogLevel): number {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level];
  }

  /**
   * Check if level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return this.getLevelValue(level) >= this.getLevelValue(this.level);
  }

  /**
   * Write log entry
   * Note: File writes are fire-and-forget to avoid blocking callers
   */
  private writeLog(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    let output: string;

    if (this.jsonOutput) {
      output = JSON.stringify(entry) + "\n";
    } else {
      const timestamp = entry.timestamp;
      const levelStr = entry.level.toUpperCase().padEnd(5);
      const dataStr = entry.data ? " " + JSON.stringify(entry.data) : "";
      output = `[${timestamp}] ${levelStr} ${entry.message}${dataStr}\n`;
    }

    // Write to console
    if (entry.level === "error") {
      console.error(output.trim());
    } else if (entry.level === "warn") {
      console.warn(output.trim());
    } else {
      console.log(output.trim());
    }

    // Write to file if configured (fire-and-forget)
    if (this.logFile && this._fileHandle) {
      this._fileHandle.write(output).catch(() => {
        // Ignore file write errors - logging shouldn't crash the app
      });
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: "debug",
      message,
      data,
    });
  }

  /**
   * Log info message
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: "info",
      message,
      data,
    });
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: "warn",
      message,
      data,
    });
  }

  /**
   * Log error message
   */
  error(message: string, data?: Record<string, unknown>): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: "error",
      message,
      data,
    });
  }

  /**
   * Close logger and cleanup
   */
  async close(): Promise<void> {
    if (this._fileHandle) {
      try {
        await this._fileHandle.close();
      } catch {
        // Ignore close errors
      }
      this._fileHandle = null;
    }
  }
}

export const logger = new Logger();
