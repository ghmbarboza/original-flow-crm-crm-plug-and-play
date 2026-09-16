import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Num remix, o servidor de desenvolvimento da Lovable sobe ANTES de o `.env` do
 * projeto novo existir. O Vite lê o `.env` uma vez, no start, então o preview do
 * editor fica sem `VITE_SUPABASE_URL` até alguém reiniciar o servidor à mão.
 * Foi o que aconteceu nos remixes de teste de 15 e 16/09/2026.
 *
 * Aqui o servidor observa o arquivo e se reinicia sozinho quando ele aparece ou
 * muda. Vale só em desenvolvimento; no build o valor já entra no bundle.
 */
function reiniciarQuandoOEnvChegar(): Plugin {
  const arquivos = [".env", ".env.local"].map((f) => path.resolve(__dirname, f));
  return {
    name: "via-reiniciar-quando-o-env-chegar",
    apply: "serve",
    configureServer(server) {
      server.watcher.add(arquivos);
      const aoMudar = (arquivo: string) => {
        if (!arquivos.includes(path.resolve(arquivo))) return;
        server.config.logger.info("[via] .env mudou; reiniciando o servidor para carregar o backend");
        void server.restart();
      };
      server.watcher.on("add", aoMudar);
      server.watcher.on("change", aoMudar);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    reiniciarQuandoOEnvChegar(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
