import { useState, useCallback, useRef } from "react";
import type { MessageType } from "../types";

interface UploadAreaProps {
  onUpload: (files: File[]) => void;
  showProgress: boolean;
  uploadProgress: number;
  messageText: string;
  messageType: MessageType;
}

export function UploadArea({
  onUpload,
  showProgress,
  uploadProgress,
  messageText,
  messageType,
}: UploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      onUpload(files);
    },
    [onUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      onUpload(files);
      e.target.value = ""; // Reset input
    },
    [onUpload]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <section className="section">
      <h2>Upload Files</h2>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
        <div
          className={`upload-area ${isDragging ? "dragover" : ""}`}
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="upload-icon">📤</div>
          <div className="upload-text">Drag and drop files here</div>
          <div className="upload-hint">or click to browse</div>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple />
        </div>

        <div className={`progress-container ${showProgress ? "active" : ""}`}>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
          <div className="progress-text">{uploadProgress}%</div>
        </div>

        {messageText && <div className={`message ${messageType}`}>{messageText}</div>}
      </div>
    </section>
  );
}
