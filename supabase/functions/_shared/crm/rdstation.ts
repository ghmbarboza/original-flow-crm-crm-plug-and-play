// RD Station CRM: token na query, API v1 (https://crm.rdstation.com/api/v1).
import {
  type AdaptadorCrm, type CredencialCrm, type EntidadeCrm, type EstruturaCrm, type PaginaCrm,
  PAGINA, chamar, limpar, str,
} from "./tipos.ts";

const BASE = "https://crm.rdstation.com/api/v1";

function url(cred: CredencialCrm, caminho: string, params: Record<string, string> = {}) {
  const u = new URL(`${(cred.apiBase ?? BASE).replace(/\/+$/, "")}${caminho}`);
  u.searchParams.set("token", cred.token);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

interface Contato { id: string; name?: string; title?: string; emails?: { email: string }[]; phones?: { phone: string }[]; organization?: { name?: string }; user?: { email?: string }; created_at?: string }
interface Organizacao { id: string; name?: string; url?: string; phones?: { phone: string }[]; user?: { email?: string }; created_at?: string; organization_segments?: { name?: string }[] }
interface Negocio {
  id: string; name?: string; amount_total?: number; deal_stage?: { id?: string; name?: string }; deal_pipeline?: { name?: string };
  user?: { email?: string }; contacts?: { name?: string; emails?: { email: string }[] }[]; organization?: { name?: string };
  win?: boolean | null; closed_at?: string | null; prediction_date?: string | null; created_at?: string; deal_lost_reason?: { name?: string } | null;
  deal_custom_fields?: { custom_field?: { label?: string }; value?: unknown }[];
}

function extras(campos?: Negocio["deal_custom_fields"]) {
  const out: Record<string, unknown> = {};
  for (const c of campos ?? []) {
    const label = str(c.custom_field?.label);
    if (label && c.value !== null && c.value !== undefined && typeof c.value !== "object") out[`custom:${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`] = c.value;
  }
  return out;
}

export const rdstation: AdaptadorCrm = {
  provider: "rdstation",
  base: (cred) => (cred.apiBase ?? BASE).replace(/\/+$/, ""),

  async lerEstrutura(cred) {
    const [funis, usuarios] = await Promise.all([
      chamar<{ deal_pipelines?: { id: string; name: string }[] } | { id: string; name: string }[]>(url(cred, "/deal_pipelines")),
      chamar<{ users?: { id: string; email: string; name?: string }[] } | { id: string; email: string; name?: string }[]>(url(cred, "/users")),
    ]);
    const listaFunis = Array.isArray(funis) ? funis : funis.deal_pipelines ?? [];
    const listaUsuarios = Array.isArray(usuarios) ? usuarios : usuarios.users ?? [];
    const pipelines = [];
    for (const p of listaFunis) {
      const etapas = await chamar<{ deal_stages?: { id: string; name: string; order?: number }[] }>(url(cred, "/deal_stages", { deal_pipeline_id: p.id, limit: "200" }));
      pipelines.push({
        id: p.id, name: p.name,
        stages: (etapas.deal_stages ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((e, i) => ({ id: e.id, name: e.name, pipeline: p.name, order: e.order ?? i })),
      });
    }
    const custom = await chamar<{ custom_fields?: { key?: string; label?: string; type?: string; for?: string }[] } | { key?: string; label?: string; type?: string; for?: string }[]>(url(cred, "/custom_fields")).catch(() => ({ custom_fields: [] }));
    const listaCustom = (Array.isArray(custom) ? custom : custom.custom_fields ?? []).map((c) => ({ key: str(c.key ?? c.label), label: str(c.label), type: c.type, custom: true, for: c.for }));
    const counts: EstruturaCrm["counts"] = {};
    for (const [entidade, caminho] of [["contacts", "/contacts"], ["companies", "/organizations"], ["deals", "/deals"]] as [EntidadeCrm, string][]) {
      const r = await chamar<{ total?: number }>(url(cred, caminho, { limit: "1", page: "1" })).catch((): { total?: number | null } => ({ total: null }));
      counts[entidade] = typeof r.total === "number" ? r.total : null;
    }
    return {
      account: null, pipelines, counts,
      fields: {
        contacts: listaCustom.filter((c) => !c.for || c.for === "contact"),
        companies: listaCustom.filter((c) => c.for === "organization"),
        deals: listaCustom.filter((c) => !c.for || c.for === "deal"),
      },
      users: listaUsuarios.map((u) => ({ id: u.id, email: u.email, name: u.name })),
    };
  },

  async listar(cred, entidade, cursor): Promise<PaginaCrm> {
    const page = cursor ? Number(cursor) : 1;
    const params = { page: String(page), limit: String(PAGINA) };
    if (entidade === "contacts") {
      const r = await chamar<{ has_more?: boolean; contacts?: Contato[] }>(url(cred, "/contacts", params));
      const rows = (r.contacts ?? []).map((c) => limpar({
        external_id: c.id, name: c.name, title: c.title, email: c.emails?.[0]?.email, phone: c.phones?.[0]?.phone,
        company: c.organization?.name, owner_email: c.user?.email, created_at: c.created_at,
      }));
      return { rows, next: r.has_more ? String(page + 1) : null };
    }
    if (entidade === "companies") {
      const r = await chamar<{ has_more?: boolean; organizations?: Organizacao[] }>(url(cred, "/organizations", params));
      const rows = (r.organizations ?? []).map((o) => limpar({
        external_id: o.id, name: o.name, website: o.url, phone: o.phones?.[0]?.phone, industry: o.organization_segments?.[0]?.name,
        owner_email: o.user?.email, created_at: o.created_at,
      }));
      return { rows, next: r.has_more ? String(page + 1) : null };
    }
    const r = await chamar<{ has_more?: boolean; deals?: Negocio[] }>(url(cred, "/deals", params));
    const rows = (r.deals ?? []).map((d) => limpar({
      external_id: d.id, title: d.name, value: d.amount_total, stage: d.deal_stage?.name, pipeline: d.deal_pipeline?.name,
      status: d.win === true ? "won" : d.win === false ? "lost" : "open", close_date: d.closed_at ?? d.prediction_date,
      contact_name: d.contacts?.[0]?.name, contact_email: d.contacts?.[0]?.emails?.[0]?.email, company: d.organization?.name,
      owner_email: d.user?.email, loss_reason: d.deal_lost_reason?.name, created_at: d.created_at, ...extras(d.deal_custom_fields),
    }));
    return { rows, next: r.has_more ? String(page + 1) : null };
  },
};
