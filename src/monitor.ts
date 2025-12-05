interface TransferStats {
  downloads: number;
  uploads: number;
  totalBytesDownloaded: number;
  totalBytesUploaded: number;
  activeTransfers: number;
}

class TransferMonitor {
  private stats: TransferStats = {
    downloads: 0,
    uploads: 0,
    totalBytesDownloaded: 0,
    totalBytesUploaded: 0,
    activeTransfers: 0,
  };

  recordDownload(bytes: number): void {
    this.stats.downloads++;
    this.stats.totalBytesDownloaded += bytes;
  }

  recordUpload(bytes: number): void {
    this.stats.uploads++;
    this.stats.totalBytesUploaded += bytes;
  }

  incrementActiveTransfers(): void {
    this.stats.activeTransfers++;
  }

  decrementActiveTransfers(): void {
    this.stats.activeTransfers = Math.max(0, this.stats.activeTransfers - 1);
  }

  getStats(): TransferStats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = {
      downloads: 0,
      uploads: 0,
      totalBytesDownloaded: 0,
      totalBytesUploaded: 0,
      activeTransfers: 0,
    };
  }
}

export const transferMonitor = new TransferMonitor();
