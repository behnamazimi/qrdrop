import { useCallback } from "react";
import { Header } from "./components/Header";
import { FileList } from "./components/FileList";
import { UploadArea } from "./components/UploadArea";
import { Footer } from "./components/Footer";
import { useFiles } from "./hooks/useFiles";
import { useUpload } from "./hooks/useUpload";

export function App() {
  const { files, loading, refresh } = useFiles();

  const { showProgress, uploadProgress, messageText, messageType, handleUpload } = useUpload({
    onSuccess: refresh,
  });

  const onUpload = useCallback(
    (uploadedFiles: File[]) => {
      handleUpload(uploadedFiles);
    },
    [handleUpload]
  );

  return (
    <div className="container">
      <Header />
      <FileList files={files} loading={loading} />
      <UploadArea
        onUpload={onUpload}
        showProgress={showProgress}
        uploadProgress={uploadProgress}
        messageText={messageText}
        messageType={messageType}
      />
      <Footer />
    </div>
  );
}
