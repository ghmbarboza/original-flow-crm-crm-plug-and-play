/**
 * Conferência do backend antes do primeiro render.
 *
 * POR QUE ISSO EXISTE: num remix, a Lovable gera o build do app ANTES de o
 * Cloud do projeto novo existir, e o bundle sai sem `VITE_SUPABASE_URL`. O
 * `client.ts` (arquivo gerado) chama `createClient(undefined, undefined)`, que
 * lança "supabaseUrl is required" no import. O app inteiro morria aí: tela
 * branca, sem nada no console além do erro. Acontecido no remix de teste de
 * 15/09/2026.
 *
 * Aqui a falta de backend vira uma tela que diz o que fazer, e o `App` só é
 * importado quando há backend (import dinâmico: o `client.ts` não chega a rodar).
 */

export interface Backend {
  url: string;
  chave: string;
}

/** Devolve o backend do build, ou null quando o build saiu sem ele. */
export function backendDoBuild(env: Record<string, unknown> = import.meta.env): Backend | null {
  const url = typeof env.VITE_SUPABASE_URL === "string" ? env.VITE_SUPABASE_URL.trim() : "";
  const chave = typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === "string"
    ? env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
    : "";
  return url && chave ? { url, chave } : null;
}

/** Tela de backend ausente, em HTML puro: não depende de React nem do client. */
export function telaSemBackend(raiz: HTMLElement) {
  raiz.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
                font-family:Geist,system-ui,sans-serif;background:#ffffff;color:#0f172a">
      <div style="max-width:520px">
        <h1 style="font-size:20px;font-weight:600;margin:0 0 12px">Este projeto ainda não está ligado ao banco de dados</h1>
        <p style="margin:0 0 12px;line-height:1.6;color:#334155">
          O app foi gerado antes do banco do projeto existir, então ele não sabe com qual backend falar.
          Isso acontece logo depois de um remix e não tem a ver com os seus dados.
        </p>
        <p style="margin:0 0 12px;line-height:1.6;color:#334155">
          Para resolver, abra o projeto no editor da Lovable e clique em <strong>Publicar</strong>,
          ou peça ao agente para gerar um build novo. Depois recarregue esta página.
        </p>
        <p style="margin:0;font-size:13px;color:#64748b">Detalhe técnico: VITE_SUPABASE_URL não veio no build.</p>
      </div>
    </div>`;
}
