// Agendor: header "Authorization: Token <token>", API v3 (https://api.agendor.com.br/v3).
import {
  type AdaptadorCrm, type CredencialCrm, type EntidadeCrm, type EstruturaCrm, type PaginaCrm,
  PAGINA, chamar, limpar, str,
} from "./tipos.ts";

const BASE = "https://api.agendor.com.br/v3";

function headers(cred: CredencialCrm) {
  return { Authorization: `Token ${cred.token}`, "Content-Type": "application/json" };
}
function url(cred: CredencialCrm, caminho: string, params: Record<string, string> = {}) {
  const u = new URL(`${(cred.apiBase ?? BASE).replace(/\/+$/, "")}${caminho}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

interface Lista<T> { data: T[]; meta?: { total?: number; next?: string | null } }
interface Contato { id: number; name?: string; role?: string; contact?: { email?: string; whatsapp?: string; mobile?: string; work?: string }; organization?: { name?: string }; ownerUser?: { email?: string }; createdAt?: string; leadOrigin?: { name?: string }; customFields?: Record<string, unknown> }
interface Organizacao { id: number; name?: string; website?: string; contact?: { work?: string; whatsapp?: string }; category?: { name?: string }; sector?: { name?: string }; ownerUser?: { email?: string }; createdAt?: string; customFields?: Record<string, unknown> }
interface Negocio {
  id: number; title?: string; value?: number; dealStatus?: { id?: number; name?: string }; dealStage?: { id?: number; name?: string }; funnel?: { name?: string };
  person?: { name?: string; contact?: { email?: string } }; organization?: { name?: string }; ownerUser?: { email?: string }; startTime?: string; endTime?: string;
  lossReason?: { name?: string } | null; customFields?: Record<string, unknown>;
}

function extras(campos?: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(campos ?? {})) {
    if (v !== null && v !== undefined && typeof v !== "object") out[`custom:${k}`] = v;
  }
  return out;
}

export const agendor: AdaptadorCrm = {
  provider: "agendor",
  base: (cred) => (cred.apiBase ?? BASE).replace(/\/+$/, ""),

  async lerEstrutura(cred) {
    const h = headers(cred);
    const [funis, usuarios] = await Promise.all([
      chamar<Lista<{ id: number; name: string; stages?: { id: number; name: string; sequence?: number }[] }>>(url(cred, "/funnels"), { headers: h }),
      chamar<Lista<{ id: number; email: string; name?: string }>>(url(cred, "/users"), { headers: h }),
    ]);
    const counts: EstruturaCrm["counts"] = {};
    for (const [entidade, caminho] of [["contacts", "/people"], ["companies", "/organizations"], ["deals", "/deals"]] as [EntidadeCrm, string][]) {
      const r = await chamar<Lista<unknown>>(url(cred, caminho, { per_page: "1" }), { headers: h }).catch((): Lista<unknown> => ({ data: [], meta: {} }));
      counts[entidade] = typeof r.meta?.total === "number" ? r.meta.total : null;
    }
    return {
      account: null,
      pipelines: funis.data.map((f) => ({
        id: String(f.id), name: f.name,
        stages: (f.stages ?? []).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).map((s, i) => ({ id: String(s.id), name: s.name, pipeline: f.name, order: s.sequence ?? i })),
      })),
      fields: {}, counts,
      users: usuarios.data.map((u) => ({ id: String(u.id), email: u.email, name: u.name })),
    };
  },

  async listar(cred, entidade, cursor): Promise<PaginaCrm> {
    const page = cursor ? Number(cursor) : 1;
    const params = { page: String(page), per_page: String(PAGINA) };
    const h = headers(cred);
    const proxima = (n: number) => (n >= PAGINA ? String(page + 1) : null);
    if (entidade === "contacts") {
      const r = await chamar<Lista<Contato>>(url(cred, "/people", params), { headers: h });
      const rows = r.data.map((c) => limpar({
        external_id: c.id, name: c.name, title: c.role, email: c.contact?.email, whatsapp_phone: c.contact?.whatsapp ?? c.contact?.mobile, phone: c.contact?.work,
        company: c.organization?.name, owner_email: c.ownerUser?.email, source: c.leadOrigin?.name, created_at: c.createdAt, ...extras(c.customFields),
      }));
      return { rows, next: proxima(r.data.length) };
    }
    if (entidade === "companies") {
      const r = await chamar<Lista<Organizacao>>(url(cred, "/organizations", params), { headers: h });
      const rows = r.data.map((o) => limpar({
        external_id: o.id, name: o.name, website: o.website, phone: o.contact?.work ?? o.contact?.whatsapp, industry: o.sector?.name ?? o.category?.name,
        owner_email: o.ownerUser?.email, created_at: o.createdAt, ...extras(o.customFields),
      }));
      return { rows, next: proxima(r.data.length) };
    }
    const r = await chamar<Lista<Negocio>>(url(cred, "/deals", params), { headers: h });
    const rows = r.data.map((d) => {
      const st = str(d.dealStatus?.name).toLowerCase();
      return limpar({
        external_id: d.id, title: d.title, value: d.value, stage: d.dealStage?.name, pipeline: d.funnel?.name,
        status: /ganh|won/.test(st) ? "won" : /perd|lost/.test(st) ? "lost" : "open", close_date: d.endTime,
        contact_name: d.person?.name, contact_email: d.person?.contact?.email, company: d.organization?.name, owner_email: d.ownerUser?.email,
        loss_reason: d.lossReason?.name, created_at: d.startTime, ...extras(d.customFields),
      });
    });
    return { rows, next: proxima(r.data.length) };
  },
};
