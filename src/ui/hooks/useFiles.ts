import { useState, useEffect, useCallback } from "react";
import type { FileInfo } from "../types";
import { UI_POLL_INTERVAL_MS } from "../constants";

export function useFiles() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFiles = useCallback(async () => {
    try {
      // Use relative URL (without leading /) to work with custom URL paths
      const response = await fetch("files");
      const data = await response.json();
      setFiles(data || []);
    } catch {
      // Network error or server unavailable - show empty file list
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
    const interval = setInterval(loadFiles, UI_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadFiles]);

  return { files, loading, refresh: loadFiles };
}
