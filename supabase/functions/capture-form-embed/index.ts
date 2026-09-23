// Embed do formulário de captura no site do cliente.
//
//   GET /capture-form-embed?form=<slug>
//
// Devolve um JavaScript que injeta um iframe responsivo da página pública
// `/f/<slug>?embed=1`, repassando as UTMs, o referrer e a URL da página mãe, e
// ajusta a altura pelo postMessage que a página envia. A origem do app vem do
// Vault (app_url, registrada pelo ensure-auth-trigger na abertura do app).
//
// Pública (verify_jwt = false): é carregada pelo navegador do visitante.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CACHE_SEGUNDOS = 300;

function js(corpo: string, status = 200) {
  return new Response(corpo, {
    status,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SEGUNDOS}`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" } });
  }
  const url = new URL(req.url);
  const slug = (url.searchParams.get("form") ?? "").trim();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return js('console.error("[FlowCRM] parâmetro form inválido");', 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: form } = await admin.from("capture_forms").select("id, is_active").eq("slug", slug).maybeSingle();
  if (!form || !form.is_active) return js('console.error("[FlowCRM] formulário não encontrado ou inativo");', 404);

  const { data: appUrl } = await admin.rpc("app_url");
  const origem = typeof appUrl === "string" && appUrl ? appUrl.replace(/\/$/, "") : "";
  if (!origem) return js('console.error("[FlowCRM] URL do app não registrada: abra o CRM uma vez para registrar");', 500);

  const codigo = `(function(){
  var origem = ${JSON.stringify(origem)};
  var slug = ${JSON.stringify(slug)};
  var script = document.currentScript;
  var alvo = (script && script.getAttribute("data-target")) ? document.querySelector(script.getAttribute("data-target")) : null;
  var container = alvo || document.createElement("div");
  if (!alvo && script && script.parentNode) script.parentNode.insertBefore(container, script.nextSibling);
  var params = new URLSearchParams();
  params.set("embed", "1");
  var chaves = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"];
  var atual = new URLSearchParams(window.location.search);
  chaves.forEach(function(k){ var v = atual.get(k); if (v) params.set(k, v); });
  params.set("page_url", window.location.origin + window.location.pathname);
  if (document.referrer) params.set("referrer", document.referrer);
  var iframe = document.createElement("iframe");
  iframe.src = origem + "/f/" + slug + "?" + params.toString();
  iframe.title = "Formulário";
  iframe.style.width = "100%";
  iframe.style.border = "0";
  iframe.style.minHeight = "420px";
  iframe.setAttribute("scrolling", "no");
  iframe.setAttribute("loading", "lazy");
  container.appendChild(iframe);
  window.addEventListener("message", function(ev){
    if (ev.origin !== origem || !ev.data || ev.data.type !== "flowcrm:form-height" || ev.data.slug !== slug) return;
    var h = Number(ev.data.height);
    if (h > 0) iframe.style.height = (h + 8) + "px";
    if (ev.data.redirect) window.location.href = ev.data.redirect;
  });
})();`;
  return js(codigo);
});
