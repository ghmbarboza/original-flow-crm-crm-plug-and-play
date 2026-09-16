import { createRoot } from "react-dom/client";
import "./index.css";
import { backendDoBuild, telaSemBackend } from "./bootBackend";

const raiz = document.getElementById("root")!;

// Build sem backend (remix recém-criado): explica o que fazer em vez de tela
// branca. O App e o client do Supabase nem chegam a ser importados.
if (!backendDoBuild()) {
  telaSemBackend(raiz);
} else {
  // Antes do primeiro render: toda chamada de edge function com 401 tenta renovar
  // a sessão e repetir uma vez, em vez de pedir para recarregar a página.
  void Promise.all([
    import("./App.tsx"),
    import("./integrations/supabase/functionRetry401"),
  ]).then(([{ default: App }, { instalarRenovacaoDeSessaoNasFunctions }]) => {
    instalarRenovacaoDeSessaoNasFunctions();
    createRoot(raiz).render(<App />);
  });

  // Registro do service worker (PWA). Apenas em producao e de forma segura:
  // nao quebra o boot do app se o registro falhar.
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[pwa] falha ao registrar o service worker:", err);
      });
    });
  }
}
