import { useCallback, useState } from "react";
import type { FileInfo } from "../types";
import { BYTES_PER_KB, FILE_SIZE_UNITS } from "../constants";

type DownloadAllStatus = "idle" | "zipping" | "downloading" | "error";

interface FileListProps {
  files: FileInfo[];
  loading: boolean;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(BYTES_PER_KB));
  return Math.round((bytes / Math.pow(BYTES_PER_KB, i)) * 100) / 100 + " " + FILE_SIZE_UNITS[i];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return (
    date.toLocaleDateString() +
    " " +
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

function getDownloadAllButtonText(status: DownloadAllStatus): string {
  switch (status) {
    case "zipping":
      return "Preparing zip...";
    case "downloading":
      return "Downloading...";
    case "error":
      return "Failed - Retry";
    default:
      return "Download All as Zip";
  }
}

export function FileList({ files, loading }: FileListProps) {
  const [downloadAllStatus, setDownloadAllStatus] = useState<DownloadAllStatus>("idle");

  const downloadFile = useCallback((filename: string) => {
    // Use relative URL (without leading /) to work with custom URL paths
    const url = "files/" + encodeURIComponent(filename);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const downloadAll = useCallback(async () => {
    if (downloadAllStatus === "zipping" || downloadAllStatus === "downloading") {
      return; // Prevent multiple clicks while in progress
    }

    setDownloadAllStatus("zipping");

    try {
      // Request the zip file from the server
      const response = await fetch("download-all");

      if (!response.ok) {
        throw new Error("Failed to generate zip");
      }

      setDownloadAllStatus("downloading");

      // Get the blob from the response
      const blob = await response.blob();

      // Create a download link for the blob
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "qrdrop-files.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the object URL
      URL.revokeObjectURL(url);

      setDownloadAllStatus("idle");
    } catch {
      setDownloadAllStatus("error");
      // Reset to idle after 3 seconds so user can retry
      setTimeout(() => setDownloadAllStatus("idle"), 3000);
    }
  }, [downloadAllStatus]);

  if (loading || files.length === 0) {
    return null;
  }

  const isDownloadAllBusy = downloadAllStatus === "zipping" || downloadAllStatus === "downloading";

  return (
    <section className="section">
      <h2>
        <span>Available Files</span>
        {files.length > 1 && (
          <button
            className={`download-all-btn ${isDownloadAllBusy ? "loading" : ""} ${downloadAllStatus === "error" ? "error" : ""}`}
            onClick={downloadAll}
            disabled={isDownloadAllBusy}
          >
            {isDownloadAllBusy && <span className="btn-spinner" />}
            {getDownloadAllButtonText(downloadAllStatus)}
          </button>
        )}
      </h2>
      <ul className="file-list">
        {files.map((file, index) => (
          <li
            key={file.name}
            className="file-item"
            style={{ animationDelay: `${0.1 + index * 0.05}s` }}
          >
            <div className="file-info">
              <div className="file-name">{file.name}</div>
              <div className="file-meta">
                <span className="file-size">{formatSize(file.size)}</span>
                <span>{formatDate(file.modified)}</span>
              </div>
            </div>
            <button className="download-btn" onClick={() => downloadFile(file.name)}>
              Download
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
