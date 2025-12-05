import { useCallback } from "react";

export function Header() {
  const stopServer = useCallback(() => {
    fetch("/stop", { method: "POST" })
      .then(() => {
        window.close();
      })
      .catch(() => {
        try {
          window.close();
        } catch {
          // Some browsers don't allow window.close() for non-popup windows
          alert("Failed to close window. Please close it manually.");
        }
      });
  }, []);

  return (
    <header>
      <button className="stop-btn" onClick={stopServer} title="Stop server">
        Stop Server
      </button>
      <h1>qrdrop</h1>
      <p className="subtitle">Share files seamlessly across your network</p>
    </header>
  );
}
