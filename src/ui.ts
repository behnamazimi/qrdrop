export function generateHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>qrdrop - File Sharing</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Work+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.13.5/dist/cdn.min.js"></script>
  <style>
    :root {
      --cream: #faf8f5;
      --warm-gray: #e8e4df;
      --soft-peach: #f5e6d3;
      --terracotta: #d4a574;
      --coral: #e8b4a0;
      --warm-brown: #8b6f47;
      --text-primary: #3d3528;
      --text-secondary: #6b5d47;
      --shadow-soft: rgba(139, 111, 71, 0.08);
      --shadow-medium: rgba(139, 111, 71, 0.12);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Work Sans', -apple-system, sans-serif;
      background: linear-gradient(135deg, var(--cream) 0%, var(--soft-peach) 50%, #f0e8dc 100%);
      background-attachment: fixed;
      color: var(--text-primary);
      min-height: 100vh;
      padding: 1.5rem 1rem;
      line-height: 1.5;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      animation: fadeInUp 0.6s ease-out;
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    header {
      text-align: center;
      margin-bottom: 1.5rem;
      animation: fadeInUp 0.6s ease-out 0.1s both;
      position: relative;
    }

    .stop-btn {
      position: absolute;
      top: 0;
      right: 0;
      background: rgba(232, 180, 160, 0.2);
      color: #8b4a3a;
      border: 1px solid rgba(232, 180, 160, 0.4);
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: 'Work Sans', sans-serif;
    }

    .stop-btn:hover {
      background: rgba(232, 180, 160, 0.3);
      transform: translateY(-1px);
    }

    h1 {
      font-family: 'Cormorant Garamond', serif;
      font-size: 2.5rem;
      font-weight: 500;
      color: var(--warm-brown);
      margin-bottom: 0.25rem;
      letter-spacing: -0.02em;
    }

    .subtitle {
      font-size: 0.95rem;
      color: var(--text-secondary);
      font-weight: 300;
    }

    .section {
      background: rgba(255, 255, 255, 0.6);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 4px 20px var(--shadow-soft), 0 1px 3px var(--shadow-medium);
      border: 1px solid rgba(212, 165, 116, 0.15);
      animation: fadeInUp 0.6s ease-out;
    }

    .section:nth-child(2) {
      animation-delay: 0.2s;
    }

    .section:nth-child(3) {
      animation-delay: 0.3s;
    }

    h2 {
      font-family: 'Cormorant Garamond', serif;
      font-size: 1.5rem;
      font-weight: 500;
      color: var(--warm-brown);
      margin-bottom: 1rem;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .download-all-btn {
      background: linear-gradient(135deg, var(--terracotta) 0%, var(--coral) 100%);
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-weight: 500;
      font-size: 0.8125rem;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: 'Work Sans', sans-serif;
      box-shadow: 0 2px 8px rgba(212, 165, 116, 0.3);
    }

    .download-all-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(212, 165, 116, 0.4);
    }

    .download-all-btn:active {
      transform: translateY(0);
    }

    .file-list {
      list-style: none;
    }

    .file-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.875rem;
      margin-bottom: 0.5rem;
      background: rgba(255, 255, 255, 0.7);
      border-radius: 10px;
      border: 1px solid rgba(212, 165, 116, 0.1);
      transition: all 0.3s ease;
      animation: slideIn 0.4s ease-out both;
    }

    .file-item:nth-child(1) { animation-delay: 0.1s; }
    .file-item:nth-child(2) { animation-delay: 0.15s; }
    .file-item:nth-child(3) { animation-delay: 0.2s; }
    .file-item:nth-child(4) { animation-delay: 0.25s; }
    .file-item:nth-child(5) { animation-delay: 0.3s; }
    .file-item:nth-child(n+6) { animation-delay: 0.35s; }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(-10px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .file-item:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px var(--shadow-medium);
      border-color: var(--terracotta);
      background: rgba(255, 255, 255, 0.9);
    }

    .file-info {
      flex: 1;
      min-width: 0;
    }

    .file-name {
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 0.125rem;
      word-break: break-word;
      font-size: 0.95rem;
    }

    .file-meta {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .file-size {
      font-variant-numeric: tabular-nums;
    }

    .download-btn {
      background: linear-gradient(135deg, var(--terracotta) 0%, var(--coral) 100%);
      color: white;
      border: none;
      padding: 0.625rem 1.25rem;
      border-radius: 8px;
      font-weight: 500;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: 'Work Sans', sans-serif;
      box-shadow: 0 2px 8px rgba(212, 165, 116, 0.3);
    }

    .download-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(212, 165, 116, 0.4);
    }

    .download-btn:active {
      transform: translateY(0);
    }

    .upload-area {
      border: 2px dashed rgba(212, 165, 116, 0.4);
      border-radius: 10px;
      padding: 1.25rem 1rem;
      text-align: center;
      background: rgba(255, 255, 255, 0.4);
      transition: all 0.3s ease;
      cursor: pointer;
      position: relative;
      max-width: 400px;
      margin: 0 auto;
    }

    .upload-area.dragover {
      border-color: var(--terracotta);
      background: rgba(245, 230, 211, 0.6);
      transform: scale(1.02);
    }

    .upload-icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      opacity: 0.6;
    }

    .upload-text {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-bottom: 0.25rem;
    }

    .upload-hint {
      font-size: 0.8rem;
      color: var(--text-secondary);
      opacity: 0.7;
    }

    input[type="file"] {
      display: none !important;
      visibility: hidden;
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
    }

    .progress-container {
      margin-top: 1rem;
      display: none;
    }

    .progress-container.active {
      display: block;
      animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .progress-bar {
      width: 100%;
      height: 8px;
      background: var(--warm-gray);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 0.5rem;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--terracotta) 0%, var(--coral) 100%);
      width: 0%;
      transition: width 0.3s ease;
      border-radius: 4px;
    }

    .progress-text {
      font-size: 0.875rem;
      color: var(--text-secondary);
      text-align: center;
    }

    .message {
      padding: 0.75rem;
      border-radius: 8px;
      margin-top: 0.75rem;
      display: none;
      font-size: 0.875rem;
      animation: slideIn 0.3s ease-out;
    }

    .message.success {
      background: rgba(212, 165, 116, 0.15);
      color: var(--warm-brown);
      border: 1px solid rgba(212, 165, 116, 0.3);
      display: block;
    }

    .message.error {
      background: rgba(232, 180, 160, 0.2);
      color: #8b4a3a;
      border: 1px solid rgba(232, 180, 160, 0.4);
      display: block;
    }

    .empty-state {
      text-align: center;
      padding: 1.5rem;
      color: var(--text-secondary);
      font-style: italic;
      font-size: 0.875rem;
    }

    .loading {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid var(--warm-gray);
      border-top-color: var(--terracotta);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin-right: 0.5rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 600px) {
      body {
        padding: 1rem 0.75rem;
      }

      h1 {
        font-size: 2rem;
      }

      .section {
        padding: 1.25rem;
      }

      .file-item {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
      }

      .download-btn {
        width: 100%;
      }
    }
  </style>
</head>
<body x-data="qrdropApp()" x-init="init()">
  <div class="container">
    <header>
      <button class="stop-btn" @click="stopServer()" title="Stop server">Stop Server</button>
      <h1>qrdrop</h1>
      <p class="subtitle">Share files seamlessly across your network</p>
    </header>

    <section class="section" x-show="!loading && files.length > 0">
      <h2>
        <span>Available Files</span>
        <button class="download-all-btn" @click="downloadAll()" x-show="files.length > 1">
          Download All
        </button>
      </h2>
      <ul class="file-list">
        <template x-for="(file, index) in files" :key="file.name">
          <li class="file-item" :style="\`animation-delay: \${0.1 + index * 0.05}s\`">
            <div class="file-info">
              <div class="file-name" x-text="file.name"></div>
              <div class="file-meta">
                <span class="file-size" x-text="formatSize(file.size)"></span>
                <span x-text="formatDate(file.modified)"></span>
              </div>
            </div>
            <button class="download-btn" @click="downloadFile(file.name)">
              Download
            </button>
          </li>
        </template>
      </ul>
    </section>

    <section class="section">
      <h2>Upload Files</h2>
      <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
        <div 
          class="upload-area" 
          :class="{ 'dragover': isDragging }"
          @click="$refs.fileInput.click()"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop($event)"
        >
          <div class="upload-icon">📤</div>
          <div class="upload-text">Drag and drop files here</div>
          <div class="upload-hint">or click to browse</div>
          <input type="file" x-ref="fileInput" @change="handleFileSelect($event)" multiple>
        </div>
        <div class="progress-container" :class="{ 'active': showProgress }" style="width: 100%; max-width: 400px;">
          <div class="progress-bar">
            <div class="progress-fill" :style="\`width: \${uploadProgress}%\`"></div>
          </div>
          <div class="progress-text" x-text="\`\${uploadProgress}%\`"></div>
        </div>
        <div 
          class="message" 
          :class="{ 'success': messageType === 'success', 'error': messageType === 'error' }"
          x-show="messageText"
          x-text="messageText"
          style="width: 100%; max-width: 400px;"
        ></div>
      </div>
    </section>
  </div>

  <script>
    function qrdropApp() {
      return {
        files: [],
        loading: true,
        isDragging: false,
        showProgress: false,
        uploadProgress: 0,
        messageText: '',
        messageType: '',

        init() {
          this.loadFiles();
          // Refresh file list every 5 seconds
          setInterval(() => this.loadFiles(), 5000);
        },

        async loadFiles() {
          try {
            const response = await fetch('/files');
            const files = await response.json();
            this.files = files || [];
            this.loading = false;
          } catch (error) {
            this.loading = false;
            this.files = [];
          }
        },

        formatSize(bytes) {
          if (bytes === 0) return '0 B';
          const k = 1024;
          const sizes = ['B', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        },

        formatDate(dateString) {
          const date = new Date(dateString);
          return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },

        downloadFile(filename) {
          const url = '/files/' + encodeURIComponent(filename);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        },

        downloadAll() {
          // Download all files with a small delay between each to avoid browser blocking
          this.files.forEach((file, index) => {
            setTimeout(() => {
              this.downloadFile(file.name);
            }, index * 200); // 200ms delay between each download
          });
        },

        stopServer() {
          // Send stop request to server
          fetch('/stop', { method: 'POST' })
            .then(() => {
              window.close();
            })
            .catch(() => {
              // If window.close() doesn't work or request fails, try to close anyway
              try {
                window.close();
              } catch (e) {
                alert('Failed to close window. Please close it manually.');
              }
            });
        },

        handleDrop(event) {
          this.isDragging = false;
          const files = Array.from(event.dataTransfer.files);
          this.handleUpload(files);
        },

        handleFileSelect(event) {
          const files = Array.from(event.target.files || []);
          this.handleUpload(files);
          event.target.value = ''; // Reset input
        },

        async handleUpload(files) {
          if (files.length === 0) return;

          this.messageText = '';
          this.messageType = '';
          this.showProgress = true;
          this.uploadProgress = 0;

          const formData = new FormData();
          files.forEach(file => formData.append('file', file));

          try {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                this.uploadProgress = Math.round((e.loaded / e.total) * 100);
              }
            });

            xhr.addEventListener('load', () => {
              this.showProgress = false;
              
              if (xhr.status === 200) {
                const result = JSON.parse(xhr.responseText);
                if (result.success) {
                  this.messageType = 'success';
                  this.messageText = \`Successfully uploaded: \${result.filename || files[0].name}\`;
                  this.loadFiles();
                } else {
                  this.messageType = 'error';
                  this.messageText = result.error || 'Upload failed';
                }
              } else {
                this.messageType = 'error';
                this.messageText = 'Upload failed';
              }
            });

            xhr.addEventListener('error', () => {
              this.showProgress = false;
              this.messageType = 'error';
              this.messageText = 'Upload failed';
            });

            xhr.open('POST', '/upload');
            xhr.send(formData);
          } catch (error) {
            this.showProgress = false;
            this.messageType = 'error';
            this.messageText = 'Upload failed';
          }
        }
      }
    }
  </script>
</body>
</html>`;
}
