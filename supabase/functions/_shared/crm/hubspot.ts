// HubSpot: token de app privado (Bearer), API CRM v3.
import {
  type AdaptadorCrm, type CampoOrigem, type CredencialCrm, type EntidadeCrm, type EstruturaCrm, type PaginaCrm,
  PAGINA, chamar, etapaPorId, limpar, str, usuarioPorId,
} from "./tipos.ts";

const BASE = "https://api.hubapi.com";
const OBJETOS: Record<EntidadeCrm, string> = { contacts: "contacts", companies: "companies", deals: "deals" };
const PADRAO: Record<EntidadeCrm, string[]> = {
  contacts: ["firstname", "lastname", "email", "phone", "mobilephone", "jobtitle", "company", "lifecyclestage", "hs_lead_status", "hubspot_owner_id", "hs_analytics_source", "createdate"],
  companies: ["name", "domain", "website", "industry", "numberofemployees", "phone", "hubspot_owner_id", "createdate"],
  deals: ["dealname", "amount", "dealstage", "pipeline", "closedate", "hubspot_owner_id", "createdate", "closed_lost_reason", "deal_currency_code"],
};
const MAX_CUSTOM = 40;

interface Registro { id: string; properties: Record<string, unknown>; associations?: Record<string, { results: { id: string }[] }> }
interface Lista { results: Registro[]; paging?: { next?: { after?: string } } }

function headers(cred: CredencialCrm) {
  return { Authorization: `Bearer ${cred.token}`, "Content-Type": "application/json" };
}

function propriedades(estrutura: EstruturaCrm, entidade: EntidadeCrm): string[] {
  const custom = (estrutura.fields[entidade] ?? []).filter((f) => f.custom).slice(0, MAX_CUSTOM).map((f) => f.key);
  return [...PADRAO[entidade], ...custom];
}

function extras(estrutura: EstruturaCrm, entidade: EntidadeCrm, props: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of (estrutura.fields[entidade] ?? []).filter((f) => f.custom).slice(0, MAX_CUSTOM)) {
    if (str(props[f.key])) out[`custom:${f.key}`] = props[f.key];
  }
  return out;
}

export const hubspot: AdaptadorCrm = {
  provider: "hubspot",
  base: (cred) => (cred.apiBase ?? BASE).replace(/\/+$/, ""),

  async lerEstrutura(cred) {
    const base = this.base(cred);
    const h = headers(cred);
    const [funis, donos] = await Promise.all([
      chamar<{ results: { id: string; label: string; stages: { id: string; label: string; displayOrder: number; metadata?: { isClosed?: string; probability?: string } }[] }[] }>(`${base}/crm/v3/pipelines/deals`, { headers: h }),
      chamar<{ results: { id: string; email: string; firstName?: string; lastName?: string }[] }>(`${base}/crm/v3/owners?limit=500`, { headers: h }),
    ]);
    const fields: EstruturaCrm["fields"] = {};
    const counts: EstruturaCrm["counts"] = {};
    for (const entidade of ["contacts", "companies", "deals"] as EntidadeCrm[]) {
      const props = await chamar<{ results: { name: string; label: string; type: string; hubspotDefined?: boolean; createdUserId?: string }[] }>(`${base}/crm/v3/properties/${OBJETOS[entidade]}`, { headers: h });
      fields[entidade] = props.results.map((p): CampoOrigem => ({ key: p.name, label: p.label, type: p.type, custom: p.hubspotDefined === false }));
      const total = await chamar<{ total?: number }>(`${base}/crm/v3/objects/${OBJETOS[entidade]}/search`, { method: "POST", headers: h, body: JSON.stringify({ limit: 1, properties: [] }) }).catch((): { total?: number | null } => ({ total: null }));
      counts[entidade] = typeof total.total === "number" ? total.total : null;
    }
    return {
      account: null,
      pipelines: funis.results.map((p) => ({
        id: p.id, name: p.label,
        stages: [...p.stages].sort((a, b) => a.displayOrder - b.displayOrder).map((s) => ({
          id: s.id, name: s.label, pipeline: p.label, order: s.displayOrder,
          won: s.metadata?.isClosed === "true" && s.metadata?.probability === "1.0",
          lost: s.metadata?.isClosed === "true" && s.metadata?.probability === "0.0",
        })),
      })),
      fields, counts,
      users: donos.results.map((u) => ({ id: u.id, email: u.email, name: [u.firstName, u.lastName].filter(Boolean).join(" ") })),
    };
  },

  async listar(cred, entidade, cursor, estrutura): Promise<PaginaCrm> {
    const base = this.base(cred);
    const url = new URL(`${base}/crm/v3/objects/${OBJETOS[entidade]}`);
    url.searchParams.set("limit", String(PAGINA));
    url.searchParams.set("properties", propriedades(estrutura, entidade).join(","));
    if (entidade === "deals") url.searchParams.set("associations", "contacts,companies");
    if (entidade === "contacts") url.searchParams.set("associations", "companies");
    if (cursor) url.searchParams.set("after", cursor);
    const lista = await chamar<Lista>(url.toString(), { headers: headers(cred) });
    const rows = lista.results.map((r) => {
      const p = r.properties;
      if (entidade === "contacts") {
        return limpar({
          external_id: r.id, first_name: p.firstname, last_name: p.lastname, email: p.email, phone: p.phone, whatsapp_phone: p.mobilephone,
          title: p.jobtitle, company: p.company, status: str(p.lifecyclestage) === "customer" ? "customer" : "lead",
          source: p.hs_analytics_source, owner_email: usuarioPorId(estrutura, p.hubspot_owner_id), created_at: p.createdate,
          ...extras(estrutura, entidade, p),
        });
      }
      if (entidade === "companies") {
        return limpar({
          external_id: r.id, name: p.name, domain: p.domain, website: p.website, industry: p.industry, size: p.numberofemployees, phone: p.phone,
          owner_email: usuarioPorId(estrutura, p.hubspot_owner_id), created_at: p.createdate, ...extras(estrutura, entidade, p),
        });
      }
      const etapa = etapaPorId(estrutura, p.dealstage);
      return limpar({
        external_id: r.id, title: p.dealname, value: p.amount, currency: p.deal_currency_code, stage: etapa?.name ?? p.dealstage, pipeline: etapa?.pipeline,
        status: etapa?.won ? "won" : etapa?.lost ? "lost" : "open", close_date: p.closedate, owner_email: usuarioPorId(estrutura, p.hubspot_owner_id),
        loss_reason: p.closed_lost_reason, created_at: p.createdate,
        contact_external_id: r.associations?.contacts?.results?.[0]?.id, company_external_id: r.associations?.companies?.results?.[0]?.id,
        ...extras(estrutura, entidade, p),
      });
    });
    return { rows, next: lista.paging?.next?.after ?? null };
  },
};
