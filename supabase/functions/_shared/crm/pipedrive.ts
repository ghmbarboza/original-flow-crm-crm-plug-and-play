// Pipedrive: api_token na query, API v1 (https://{empresa}.pipedrive.com/api/v1).
import {
  type AdaptadorCrm, type CredencialCrm, type EntidadeCrm, type EstruturaCrm, type PaginaCrm,
  PAGINA, chamar, etapaPorId, limpar, str, usuarioPorId,
} from "./tipos.ts";

const OBJETOS: Record<EntidadeCrm, string> = { contacts: "persons", companies: "organizations", deals: "deals" };
const CAMPOS: Record<EntidadeCrm, string> = { contacts: "personFields", companies: "organizationFields", deals: "dealFields" };

interface Lista<T> { data: T[] | null; additional_data?: { pagination?: { next_start?: number; more_items_in_collection?: boolean } } }
type Rel = { value?: number; name?: string; email?: string } | number | null;

function url(cred: CredencialCrm, caminho: string, params: Record<string, string> = {}) {
  const base = cred.apiBase ?? (cred.domain ? `https://${cred.domain}.pipedrive.com/api/v1` : "https://api.pipedrive.com/v1");
  const u = new URL(`${base.replace(/\/+$/, "")}${caminho}`);
  u.searchParams.set("api_token", cred.token);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

function primeiro(lista: unknown): string {
  if (!Array.isArray(lista)) return str(lista);
  const p = lista.find((x) => x?.primary) ?? lista[0];
  return str(p?.value ?? p);
}
function relNome(r: Rel): string { return typeof r === "object" && r ? str(r.name) : ""; }
function relId(r: Rel): string { return typeof r === "object" && r ? str(r.value) : str(r); }

function extras(estrutura: EstruturaCrm, entidade: EntidadeCrm, reg: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of (estrutura.fields[entidade] ?? []).filter((f) => f.custom)) {
    const v = reg[f.key];
    if (v !== null && v !== undefined && typeof v !== "object") out[`custom:${f.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`] = v;
  }
  return out;
}

export const pipedrive: AdaptadorCrm = {
  provider: "pipedrive",
  base: (cred) => (cred.apiBase ?? (cred.domain ? `https://${cred.domain}.pipedrive.com/api/v1` : "https://api.pipedrive.com/v1")).replace(/\/+$/, ""),

  async lerEstrutura(cred) {
    const [eu, funis, etapas, usuarios] = await Promise.all([
      chamar<{ data: { company_name?: string; company_domain?: string } }>(url(cred, "/users/me")),
      chamar<Lista<{ id: number; name: string; order_nr?: number }>>(url(cred, "/pipelines")),
      chamar<Lista<{ id: number; name: string; pipeline_id: number; order_nr: number }>>(url(cred, "/stages")),
      chamar<Lista<{ id: number; email: string; name?: string }>>(url(cred, "/users")),
    ]);
    const fields: EstruturaCrm["fields"] = {};
    const counts: EstruturaCrm["counts"] = {};
    for (const entidade of ["contacts", "companies", "deals"] as EntidadeCrm[]) {
      const f = await chamar<Lista<{ key: string; name: string; field_type: string; edit_flag?: boolean }>>(url(cred, `/${CAMPOS[entidade]}`));
      fields[entidade] = (f.data ?? []).map((c) => ({ key: c.key, label: c.name, type: c.field_type, custom: c.edit_flag === true && /^[a-f0-9]{40}$/.test(c.key) }));
      const s = await chamar<{ data?: { count?: number } | null }>(url(cred, `/${OBJETOS[entidade]}/summary`)).catch((): { data?: { count?: number } | null } => ({ data: null }));
      counts[entidade] = typeof s.data?.count === "number" ? s.data.count : null;
    }
    const pipelines = (funis.data ?? []).map((p) => ({
      id: String(p.id), name: p.name,
      stages: (etapas.data ?? []).filter((e) => e.pipeline_id === p.id).sort((a, b) => a.order_nr - b.order_nr)
        .map((e) => ({ id: String(e.id), name: e.name, pipeline: p.name, order: e.order_nr })),
    }));
    return {
      account: eu.data?.company_domain ?? eu.data?.company_name ?? null, pipelines, fields, counts,
      users: (usuarios.data ?? []).map((u) => ({ id: String(u.id), email: u.email, name: u.name })),
    };
  },

  async listar(cred, entidade, cursor, estrutura): Promise<PaginaCrm> {
    const start = cursor ? Number(cursor) : 0;
    const lista = await chamar<Lista<Record<string, unknown>>>(url(cred, `/${OBJETOS[entidade]}`, { start: String(start), limit: String(PAGINA) }));
    const rows = (lista.data ?? []).map((r) => {
      if (entidade === "contacts") {
        return limpar({
          external_id: r.id, name: r.name, email: primeiro(r.email), phone: primeiro(r.phone), title: r.job_title,
          company: relNome(r.org_id as Rel), owner_email: (typeof r.owner_id === "object" && r.owner_id ? str((r.owner_id as { email?: string }).email) : "") || usuarioPorId(estrutura, relId(r.owner_id as Rel)),
          created_at: r.add_time, ...extras(estrutura, entidade, r),
        });
      }
      if (entidade === "companies") {
        return limpar({
          external_id: r.id, name: r.name, website: r.address, owner_email: usuarioPorId(estrutura, relId(r.owner_id as Rel)), created_at: r.add_time,
          ...extras(estrutura, entidade, r),
        });
      }
      const etapa = etapaPorId(estrutura, r.stage_id);
      const pessoa = r.person_id as { name?: string; email?: { value: string; primary?: boolean }[] } | null;
      return limpar({
        external_id: r.id, title: r.title, value: r.value, currency: r.currency, stage: etapa?.name ?? "", pipeline: etapa?.pipeline ?? "",
        status: r.status === "won" ? "won" : r.status === "lost" ? "lost" : "open", close_date: r.expected_close_date ?? r.close_time,
        contact_name: pessoa?.name, contact_email: primeiro(pessoa?.email), company: relNome(r.org_id as Rel),
        owner_email: (typeof r.user_id === "object" && r.user_id ? str((r.user_id as { email?: string }).email) : "") || usuarioPorId(estrutura, relId(r.user_id as Rel)),
        loss_reason: r.lost_reason, created_at: r.add_time, ...extras(estrutura, entidade, r),
      });
    });
    const pag = lista.additional_data?.pagination;
    return { rows, next: pag?.more_items_in_collection && typeof pag.next_start === "number" ? String(pag.next_start) : null };
  },
};
