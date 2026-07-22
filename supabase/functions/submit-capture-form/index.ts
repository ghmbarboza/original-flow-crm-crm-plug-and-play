// Formulário público de captura de leads (SEM JWT).
//
// Duas responsabilidades, escolhidas pelo campo `action` do body:
//   - action: "get"    → { slug }          → retorna { name, fields } do form ativo
//   - action: "submit" → { slug, values }  → cria contato + deal e retorna { ok: true }
//
// Usa o service-role client porque é público: o visitante não tem sessão. Todo
// dado sensível (org_id, ids de pipeline, automação) fica no servidor — nunca
// vem do cliente. verify_jwt = false está declarado em supabase/config.toml.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

type FieldType = "text" | "email" | "phone" | "textarea";
interface CaptureField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
}

/** Só os campos válidos, no formato esperado. Tolera dados legados. */
function parseFields(raw: unknown): CaptureField[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (f): f is CaptureField =>
      !!f && typeof f === "object" &&
      typeof (f as CaptureField).key === "string" &&
      typeof (f as CaptureField).label === "string",
  );
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

    // Carrega o form ativo. Só as colunas necessárias — nada sensível para o público.
    const { data: form, error: formErr } = await admin
      .from("capture_forms")
      .select("id, org_id, name, fields, is_active, target_pipeline_id, target_stage_id, automation_id")
      .eq("slug", slug)
      .maybeSingle();
    if (formErr) return json({ error: formErr.message }, 500);
    if (!form || !form.is_active) {
      return json({ error: "Formulário não encontrado ou inativo." }, 404);
    }

    const fields = parseFields(form.fields);

    // --- Buscar o schema público ---
    if (action === "get") {
      return json({ name: form.name, fields });
    }

    // --- Submeter ---
    if (action === "submit") {
      const values = (body?.values ?? {}) as Record<string, unknown>;

      // Validação server-side dos obrigatórios.
      for (const field of fields) {
        if (field.required) {
          const v = values[field.key];
          if (v === undefined || v === null || String(v).trim() === "") {
            return json({ error: `Campo obrigatório não preenchido: ${field.label}.` }, 400);
          }
        }
      }

      // Mapeia os campos para as colunas reais de contacts. Chaves/tipos
      // reservados viram colunas; o resto vai para custom_fields.
      const strOf = (key: string): string => {
        const v = values[key];
        return v === undefined || v === null ? "" : String(v).trim();
      };

      const emailField = fields.find((f) => f.type === "email" || f.key === "email");
      const phoneField = fields.find((f) => f.type === "phone" || f.key === "phone");
      const nameField =
        fields.find((f) => f.key === "name") ?? fields.find((f) => f.type === "text");

      const email = emailField ? strOf(emailField.key) : "";
      const phone = phoneField ? strOf(phoneField.key) : "";
      const fullName = nameField ? strOf(nameField.key) : "";

      if (!fullName) return json({ error: "Informe o nome." }, 400);
      if (!email) return json({ error: "Informe o e-mail." }, 400);

      const [firstName, ...rest] = fullName.split(/\s+/);
      const lastName = rest.join(" ") || null;

      // Campos extras (não mapeados a colunas) viram custom_fields.
      const reservedKeys = new Set(
        [emailField?.key, phoneField?.key, nameField?.key].filter(Boolean) as string[],
      );
      const customFields: Record<string, unknown> = {};
      for (const field of fields) {
        if (!reservedKeys.has(field.key)) customFields[field.key] = strOf(field.key);
      }

      // Cria o contato no org_id do form (nunca do cliente).
      const { data: contact, error: contactErr } = await admin
        .from("contacts")
        .insert({
          org_id: form.org_id,
          first_name: firstName || fullName,
          last_name: lastName,
          email,
          phone: phone || null,
          source: "capture_form",
          custom_fields: customFields,
        })
        .select("id")
        .single();
      if (contactErr) return json({ error: contactErr.message }, 500);

      // Resolve a etapa de destino do deal. Prioridade:
      //   1. target_stage_id do form
      //   2. primeira etapa do target_pipeline_id do form
      //   3. primeira etapa do pipeline default (ou primeiro) da org
      let stageId: string | null = form.target_stage_id;
      if (!stageId) {
        let pipelineId = form.target_pipeline_id;
        if (!pipelineId) {
          const { data: pipeline } = await admin
            .from("pipelines")
            .select("id")
            .eq("org_id", form.org_id)
            .order("is_default", { ascending: false })
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          pipelineId = pipeline?.id ?? null;
        }
        if (pipelineId) {
          const { data: stage } = await admin
            .from("pipeline_stages")
            .select("id")
            .eq("pipeline_id", pipelineId)
            .order("order", { ascending: true })
            .limit(1)
            .maybeSingle();
          stageId = stage?.id ?? null;
        }
      }

      const { error: dealErr } = await admin.from("deals").insert({
        org_id: form.org_id,
        contact_id: contact.id,
        title: fullName,
        stage_id: stageId,
      });
      if (dealErr) return json({ error: dealErr.message }, 500);

      // Automação vinculada: registramos a execução em automation_logs com
      // status "queued" — o mecanismo de logs de automação já existe no schema.
      // A EXECUÇÃO EFETIVA das ações (enviar email, mover deal etc.) NÃO é feita
      // aqui: não há, hoje, um worker/dispatcher de automações acionável a partir
      // desta função. Fica como integração pendente, sinalizada pelo log.
      if (form.automation_id) {
        await admin.from("automation_logs").insert({
          org_id: form.org_id,
          automation_id: form.automation_id,
          status: "queued",
          trigger_data: { source: "capture_form", form_id: form.id, contact_id: contact.id },
        });
      }

      return json({ ok: true });
    }

    return json({ error: "Ação inválida. Use 'get' ou 'submit'." }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
