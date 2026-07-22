import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Registro do service worker (PWA). Apenas em producao e de forma segura:
// nao quebra o boot do app se o registro falhar.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[pwa] falha ao registrar o service worker:", err);
    });
  });
}
