import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme, readTheme } from "./lib/theme";
import "./styles/app.css";

applyTheme(readTheme());

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// The service worker only caches the shell so the app opens offline; it never
// caches API responses, because a stale streak is worse than no streak.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* Without a worker the app still runs, just not offline. */
    });
  });
}
