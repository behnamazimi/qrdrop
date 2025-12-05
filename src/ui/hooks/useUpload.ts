import { useState, useCallback } from "react";
import type { MessageType, UploadResult } from "../types";

interface UseUploadOptions {
  onSuccess?: () => void;
}

export function useUpload(options: UseUploadOptions = {}) {
  const [showProgress, setShowProgress] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [messageText, setMessageText] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("");

  const clearMessage = useCallback(() => {
    setMessageText("");
    setMessageType("");
  }, []);

  const handleUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      clearMessage();
      setShowProgress(true);
      setUploadProgress(0);

      const formData = new FormData();
      files.forEach((file) => formData.append("file", file));

      try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener("load", () => {
          setShowProgress(false);

          if (xhr.status === 200) {
            const result: UploadResult = JSON.parse(xhr.responseText);
            if (result.success) {
              setMessageType("success");
              // Handle multiple file upload response
              if (result.fileCount && result.fileCount > 1) {
                setMessageText(`Successfully uploaded ${result.fileCount} files`);
              } else {
                setMessageText(`Successfully uploaded: ${result.filename || files[0]?.name}`);
              }
              options.onSuccess?.();
            } else {
              setMessageType("error");
              setMessageText(result.error || "Upload failed");
            }
          } else {
            setMessageType("error");
            setMessageText("Upload failed");
          }
        });

        xhr.addEventListener("error", () => {
          setShowProgress(false);
          setMessageType("error");
          setMessageText("Upload failed");
        });

        // Use relative URL (without leading /) to work with custom URL paths
        xhr.open("POST", "upload");
        xhr.send(formData);
      } catch {
        // Network error or server unavailable
        setShowProgress(false);
        setMessageType("error");
        setMessageText("Upload failed");
      }
    },
    [clearMessage, options]
  );

  return {
    showProgress,
    uploadProgress,
    messageText,
    messageType,
    handleUpload,
    clearMessage,
  };
}
