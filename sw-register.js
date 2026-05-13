// Service Worker Registration for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Surface failures only in development; production users don't need
      // the noise, but local debugging does. Detection logic must stay in
      // sync with js/utils/env.js (this script loads as a non-module script
      // before bundles, so it can't import from env.js).
      const h = location.hostname;
      const isDev =
        h === "localhost" ||
        h === "127.0.0.1" ||
        h.startsWith("192.168.") ||
        h.startsWith("10.") ||
        h.startsWith("172.") ||
        h.endsWith(".local") ||
        h.endsWith(".dev") ||
        h.endsWith(".pages.dev");
      if (isDev) console.warn("[SW] Registration failed:", err);
    });
  });
}
