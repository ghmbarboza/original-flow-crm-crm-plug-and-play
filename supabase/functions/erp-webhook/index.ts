// Recebimento de eventos do ERP (Parte 2 do Sprint 10B).
//
// O ERP envia POST com o token da org (header x-erp-token ou ?token=) e um
// corpo { "event": "...", ...campos }. Cada evento tem uma ação fixa,
// habilitável individualmente em inbound_event_handlers:
//
//   pedido_faturado     → marca o deal aberto mais recente do contato como Ganho
//   estoque_atualizado  → atualiza o estoque do produto (por nome)
//   cliente_inadimplente→ adiciona a tag "Inadimplente" ao contato
//   nova_oportunidade   → cria deal na primeira etapa do pipeline
//
// Tudo é registrado em erp_webhook_logs (inclusive falhas), que é a tela de
// debugging do admin. O token identifica a org — sem token válido, nada é
// lido nem escrito.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Contato ativo da org pelo email. */
async function findContact(admin: SupabaseClient, orgId: string, email?: string) {
  if (!email) return null;
  const { data } = await admin
    .from("contacts")
    .select("id, owner_id")
    .eq("org_id", orgId)
    .eq("email", email)
    .is("merged_into_id", null)
    .limit(1)
    .maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const token = req.headers.get("x-erp-token") ?? url.searchParams.get("token") ?? "";
  if (!token) return json({ error: "Token ausente. Envie no header x-erp-token." }, 401);

  const { data: config } = await admin
    .from("erp_integration_configs")
    .select("org_id, is_active, inbound_event_handlers")
    .eq("inbound_token", token)
    .maybeSingle();
  if (!config) return json({ error: "Token inválido." }, 401);
  if (!config.is_active) return json({ error: "Integração ERP desativada." }, 403);

  const orgId = config.org_id;
  const payload = await req.json().catch(() => null);
  const event = String(payload?.event ?? "");

  const log = async (status: "success" | "failed", error?: string) => {
    await admin.from("erp_webhook_logs").insert({
      org_id: orgId,
      direction: "inbound",
      event_type: event || "desconhecido",
      payload,
      status,
      error_msg: error ?? null,
    });
    await admin.from("erp_integration_configs")
      .update({ last_inbound_at: new Date().toISOString() })
      .eq("org_id", orgId);
  };

  if (!payload || !event) {
    await log("failed", 'Corpo inválido: esperado JSON com o campo "event".');
    return json({ error: 'Corpo inválido: esperado JSON com o campo "event".' }, 400);
  }

  const handlers = (config.inbound_event_handlers ?? {}) as Record<string, boolean>;
  if (handlers[event] === false) {
    await log("failed", "Evento desabilitado na configuração.");
    return json({ skipped: `evento ${event} desabilitado` });
  }

  try {
    switch (event) {
      case "pedido_faturado": {
        const contact = await findContact(admin, orgId, payload.cliente_email);
        if (!contact) throw new Error(`Contato não encontrado para ${payload.cliente_email ?? "(sem email)"}.`);
        const { data: deal } = await admin
          .from("deals")
          .select("id")
          .eq("org_id", orgId)
          .eq("contact_id", contact.id)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!deal) throw new Error("Nenhum deal aberto para este contato.");
        const { error } = await admin
          .from("deals")
          .update({ status: "won", probability: 100, updated_at: new Date().toISOString() })
          .eq("id", deal.id);
        if (error) throw error;
        await log("success");
        return json({ ok: true, deal_id: deal.id, action: "deal marcado como ganho" });
      }

      case "estoque_atualizado": {
        const nome = String(payload.produto_nome ?? payload.produto ?? "");
        const quantidade = Number(payload.quantidade ?? payload.estoque);
        if (!nome || Number.isNaN(quantidade)) {
          throw new Error("Informe produto_nome e quantidade.");
        }
        const { data: product } = await admin
          .from("products")
          .select("id")
          .eq("org_id", orgId)
          .ilike("name", nome)
          .limit(1)
          .maybeSingle();
        if (!product) throw new Error(`Produto "${nome}" não encontrado.`);
        const { error } = await admin
          .from("products")
          .update({ stock_quantity: quantidade, track_stock: true, updated_at: new Date().toISOString() })
          .eq("id", product.id);
        if (error) throw error;
        await log("success");
        return json({ ok: true, product_id: product.id, action: "estoque atualizado" });
      }

      case "cliente_inadimplente": {
        const contact = await findContact(admin, orgId, payload.cliente_email);
        if (!contact) throw new Error(`Contato não encontrado para ${payload.cliente_email ?? "(sem email)"}.`);
        // Tag "Inadimplente" da org: cria se ainda não existe.
        let { data: tag } = await admin
          .from("tags").select("id").eq("org_id", orgId).ilike("name", "Inadimplente").limit(1).maybeSingle();
        if (!tag) {
          const { data: created, error } = await admin
            .from("tags").insert({ org_id: orgId, name: "Inadimplente", color: "#dc2626" }).select("id").single();
          if (error) throw error;
          tag = created;
        }
        const { error } = await admin.from("contact_tags").upsert(
          { contact_id: contact.id, tag_id: tag.id },
          { onConflict: "contact_id,tag_id", ignoreDuplicates: true },
        );
        if (error) throw error;
        await log("success");
        return json({ ok: true, contact_id: contact.id, action: 'tag "Inadimplente" adicionada' });
      }

      case "nova_oportunidade": {
        const titulo = String(payload.titulo ?? payload.oportunidade_nome ?? "Oportunidade do ERP");
        const valor = Number(payload.valor ?? 0);
        const contact = await findContact(admin, orgId, payload.cliente_email);
        // Primeira etapa do pipeline default da org.
        const { data: pipeline } = await admin
          .from("pipelines").select("id").eq("org_id", orgId)
          .order("is_default", { ascending: false }).order("created_at").limit(1).maybeSingle();
        const { data: stage } = pipeline
          ? await admin.from("pipeline_stages").select("id, win_probability")
              .eq("pipeline_id", pipeline.id).order("order").limit(1).maybeSingle()
          : { data: null };
        const { data: deal, error } = await admin
          .from("deals")
          .insert({
            org_id: orgId,
            title: titulo,
            value: valor,
            contact_id: contact?.id ?? null,
            stage_id: stage?.id ?? null,
            probability: stage?.win_probability ?? 0,
          })
          .select("id")
          .single();
        if (error) throw error;
        await log("success");
        return json({ ok: true, deal_id: deal.id, action: "deal criado" });
      }

      default: {
        await log("failed", `Evento desconhecido: ${event}.`);
        return json({ error: `Evento desconhecido: ${event}. Válidos: pedido_faturado, estoque_atualizado, cliente_inadimplente, nova_oportunidade.` }, 400);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro inesperado";
    await log("failed", msg);
    return json({ error: msg }, 422);
  }
});
