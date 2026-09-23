// Formulário público de captura: schema (`get`) e envio (`submit`).
//
// Pública (verify_jwt = false) e com service role: o visitante não tem sessão.
// O envio cria o contato no org do formulário, abre o negócio na etapa alvo,
// grava o rastreamento (UTM, referrer, página) e enfileira a automação ligada.
// Regras dos campos (visibilidade condicional e validação) em _shared/formRules.ts,
// espelho de src/lib/formRules.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  campoVisivel, normalizarTracking, origemDoTracking, parseCaptureFields, validarValores, type CaptureField,
} from "../_shared/formRules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Schema público: sem chaves internas do formulário. */
function schemaPublico(form: Record<string, unknown>, fields: CaptureField[]) {
  return {
    name: form.name,
    fields,
    success_message: form.success_message ?? null,
    redirect_url: form.redirect_url ?? null,
    consent_text: form.consent_text ?? null,
    theme: form.theme ?? {},
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    if (!slug) return json({ error: "Slug do formulário não informado." }, 400);

    const { data: form, error: formErr } = await admin
      .from("capture_forms")
      .select("id, org_id, name, fields, is_active, target_pipeline_id, target_stage_id, automation_id, source_default, success_message, redirect_url, consent_text, theme")
      .eq("slug", slug)
      .maybeSingle();
    if (formErr) return json({ error: formErr.message }, 500);
    if (!form || !form.is_active) {
      return json({ error: "Formulário não encontrado ou inativo." }, 404);
    }

    const fields = parseCaptureFields(form.fields);

    if (action === "get") {
      return json(schemaPublico(form as Record<string, unknown>, fields));
    }

    if (action === "submit") {
      const values = (body?.values ?? {}) as Record<string, unknown>;
      const tracking = normalizarTracking(body?.tracking);

      // Campos ocultos gravam o valor fixo, ignorando o que o navegador mandou.
      for (const f of fields) if (f.type === "hidden") values[f.key] = f.value ?? "";

      const erro = validarValores(fields, values);
      if (erro) return json({ error: erro }, 400);

      const strOf = (key: string): string => {
        const v = values[key];
        return v === undefined || v === null ? "" : String(v).trim();
      };

      const emailField = fields.find((f) => f.type === "email" || f.key === "email");
      const phoneField = fields.find((f) => f.type === "phone" || f.key === "phone");
      const nameField = fields.find((f) => f.key === "name") ?? fields.find((f) => f.type === "text");

      const email = emailField ? strOf(emailField.key) : "";
      const phone = phoneField ? strOf(phoneField.key) : "";
      const fullName = nameField ? strOf(nameField.key) : "";
      if (!fullName) return json({ error: "Informe o nome." }, 400);
      if (!email && !phone) return json({ error: "Informe o e-mail ou o telefone." }, 400);

      const [firstName, ...rest] = fullName.split(/\s+/);
      const lastName = rest.join(" ") || null;

      // Campos extras viram custom_fields (só os visíveis; checkbox vira booleano).
      const reservedKeys = new Set([emailField?.key, phoneField?.key, nameField?.key].filter(Boolean) as string[]);
      const customFields: Record<string, unknown> = {};
      for (const field of fields) {
        if (reservedKeys.has(field.key)) continue;
        if (!campoVisivel(field, values) && field.type !== "hidden") continue;
        const v = strOf(field.key);
        if (field.type === "checkbox") customFields[field.key] = v === "true";
        else if (field.type === "number" && v) customFields[field.key] = Number(v.replace(",", "."));
        else customFields[field.key] = v;
      }
      for (const [k, v] of Object.entries(tracking)) {
        if (k === "page_url") customFields.landing_page = v;
        else customFields[k] = v;
      }

      const source = origemDoTracking(tracking, form.source_default as string | null);

      const { data: contact, error: contactErr } = await admin
        .from("contacts")
        .insert({
          org_id: form.org_id,
          first_name: firstName || fullName,
          last_name: lastName,
          email: email || null,
          phone: phone || null,
          source,
          custom_fields: customFields,
        })
        .select("*")
        .single();
      if (contactErr) return json({ error: contactErr.message }, 500);

      // Etapa alvo: a configurada; senão a primeira do funil configurado ou do padrão.
      let stageId: string | null = form.target_stage_id;
      if (!stageId) {
        let pipelineId = form.target_pipeline_id;
        if (!pipelineId) {
          const { data: pipeline } = await admin
            .from("pipelines").select("id").eq("org_id", form.org_id)
            .order("is_default", { ascending: false }).order("created_at", { ascending: true })
            .limit(1).maybeSingle();
          pipelineId = pipeline?.id ?? null;
        }
        if (pipelineId) {
          const { data: stage } = await admin
            .from("pipeline_stages").select("id").eq("pipeline_id", pipelineId)
            .order("order", { ascending: true }).limit(1).maybeSingle();
          stageId = stage?.id ?? null;
        }
      }

      const { data: deal, error: dealErr } = await admin
        .from("deals")
        .insert({ org_id: form.org_id, contact_id: contact.id, title: fullName, stage_id: stageId })
        .select("id")
        .single();
      if (dealErr) return json({ error: dealErr.message }, 500);

      // Rastreamento do envio (relatório por formulário e por origem).
      await admin.from("tracking_events").insert({
        org_id: form.org_id,
        contact_id: contact.id,
        visitor_id: typeof body?.visitor_id === "string" ? body.visitor_id.slice(0, 80) : null,
        event_type: "form_submitted",
        page_url: tracking.page_url ?? null,
        meta: { form_id: form.id, form_slug: slug, deal_id: deal.id, source, ...tracking },
      });
      await admin.rpc("registrar_envio_formulario", { p_form: form.id });

      if (form.automation_id) {
        await admin.from("automation_logs").insert({
          org_id: form.org_id,
          automation_id: form.automation_id,
          status: "queued",
          trigger_data: {
            ...contact,
            contact_id: contact.id,
            deal_id: deal.id,
            form_id: form.id,
            source_event: "capture_form",
            tracking,
          },
        });
      }

      return json({ ok: true, redirect_url: form.redirect_url ?? null, success_message: form.success_message ?? null });
    }

    return json({ error: "Ação inválida. Use 'get' ou 'submit'." }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
