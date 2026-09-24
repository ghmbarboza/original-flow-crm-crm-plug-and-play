/*
 * Service Worker do VIA Flow CRM (PWA manual, sem libs).
 *
 * Estrategias:
 *  - install : pre-cache do app shell minimo + skipWaiting().
 *  - activate: limpeza de caches antigos por versao + clients.claim().
 *  - fetch   : network-first para navegacao (evita HTML velho de SPA / tela
 *              branca apos deploy); cache-first para assets estaticos GET
 *              same-origin. Requisicoes ao Supabase / APIs passam direto.
 */

// Troque a versao (v1 -> v2 ...) sempre que quiser invalidar o cache antigo.
const CACHE = "flowcrm-v2";

// App shell minimo pre-cacheado no install.
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/pwa-icon.svg",
  "/pwa-192.png",
  "/pwa-512.png",
];

// --- install: pre-cache do shell e ativacao imediata -----------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        await cache.addAll(APP_SHELL);
      } catch (err) {
        // Nao quebra a instalacao se algum recurso do shell falhar.
        console.warn("[sw] falha ao pre-cachear o app shell:", err);
      }
      await self.skipWaiting();
    })()
  );
});

// --- activate: remove caches de versoes anteriores -------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
        );
      } catch (err) {
        console.warn("[sw] falha ao limpar caches antigos:", err);
      }
      await self.clients.claim();
    })()
  );
});

// --- fetch: roteamento de estrategias --------------------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Trata apenas GET.
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // So mexemos em requisicoes same-origin. Supabase / APIs / CDNs de outra
  // origem passam direto pela rede (nao interceptamos).
  if (url.origin !== self.location.origin) return;

  // Navegacoes (documentos HTML do SPA): network-first.
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  // Demais assets estaticos same-origin: cache-first.
  event.respondWith(cacheFirst(req));
});

// Network-first: tenta a rede, cacheia a resposta boa, cai no cache offline.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Fallback final: o index.html (app shell) para rotas do SPA.
    const shell = await cache.match("/index.html");
    if (shell) return shell;
    throw err;
  }
}

// Cache-first: serve do cache; senao busca na rede e cacheia.
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    // Sem rede e sem cache: propaga o erro (nao ha o que servir).
    throw err;
  }
}
