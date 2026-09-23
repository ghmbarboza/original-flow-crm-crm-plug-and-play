// Kommo (ex-amoCRM): token de longa duração (Bearer), API v4 em https://{subdominio}.kommo.com/api/v4.
import {
  type AdaptadorCrm, type CredencialCrm, type EntidadeCrm, type EstruturaCrm, type PaginaCrm,
  PAGINA, chamar, etapaPorId, limpar, str, usuarioPorId,
} from "./tipos.ts";

const ID_GANHO = 142;
const ID_PERDIDO = 143;
const OBJETOS: Record<EntidadeCrm, string> = { contacts: "contacts", companies: "companies", deals: "leads" };

interface CampoValor { field_id?: number; field_code?: string | null; field_name?: string; values?: { value?: unknown; enum_code?: string }[] }
interface Registro {
  id: number; name?: string; first_name?: string; last_name?: string; price?: number; status_id?: number; pipeline_id?: number;
  responsible_user_id?: number; created_at?: number; closed_at?: number | null; loss_reason_id?: number | null;
  custom_fields_values?: CampoValor[] | null; _embedded?: { companies?: { id: number; name?: string }[]; contacts?: { id: number; is_main?: boolean }[]; tags?: { name?: string }[] };
}
interface Lista { _embedded?: Record<string, Registro[]>; _links?: { next?: { href?: string } } }

function headers(cred: CredencialCrm) {
  return { Authorization: `Bearer ${cred.token}`, "Content-Type": "application/json" };
}
function base(cred: CredencialCrm) {
  return (cred.apiBase ?? `https://${cred.domain ?? ""}.kommo.com/api/v4`).replace(/\/+$/, "");
}
function campo(reg: Registro, codigo: string): string {
  const c = (reg.custom_fields_values ?? []).find((f) => f.field_code === codigo);
  return str(c?.values?.[0]?.value);
}
function extras(reg: Registro) {
  const out: Record<string, unknown> = {};
  for (const f of reg.custom_fields_values ?? []) {
    if (f.field_code || !f.field_name) continue;
    const v = f.values?.[0]?.value;
    if (v !== null && v !== undefined && typeof v !== "object") out[`custom:${f.field_name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`] = v;
  }
  return out;
}
function dataDe(ts?: number | null) {
  return typeof ts === "number" && ts > 0 ? new Date(ts * 1000).toISOString() : "";
}

export const kommo: AdaptadorCrm = {
  provider: "kommo",
  base,

  async lerEstrutura(cred) {
    const h = headers(cred);
    const b = base(cred);
    const [conta, funis, usuarios] = await Promise.all([
      chamar<{ name?: string; subdomain?: string }>(`${b}/account`, { headers: h }),
      chamar<{ _embedded?: { pipelines?: { id: number; name: string; sort?: number; _embedded?: { statuses?: { id: number; name: string; sort?: number }[] } }[] } }>(`${b}/leads/pipelines`, { headers: h }),
      chamar<{ _embedded?: { users?: { id: number; email: string; name?: string }[] } }>(`${b}/users?limit=250`, { headers: h }),
    ]);
    const fields: EstruturaCrm["fields"] = {};
    for (const entidade of ["contacts", "companies", "deals"] as EntidadeCrm[]) {
      const f = await chamar<{ _embedded?: { custom_fields?: { id: number; name: string; type?: string; code?: string | null }[] } }>(`${b}/${OBJETOS[entidade]}/custom_fields?limit=250`, { headers: h }).catch(() => ({ _embedded: { custom_fields: [] } }));
      fields[entidade] = (f._embedded?.custom_fields ?? []).map((c) => ({ key: String(c.id), label: c.name, type: c.type, custom: !c.code }));
    }
    return {
      account: conta.subdomain ?? conta.name ?? null,
      pipelines: (funis._embedded?.pipelines ?? []).map((p) => ({
        id: String(p.id), name: p.name,
        stages: (p._embedded?.statuses ?? []).sort((a, b2) => (a.sort ?? 0) - (b2.sort ?? 0)).map((s, i) => ({
          id: String(s.id), name: s.name, pipeline: p.name, order: s.sort ?? i, won: s.id === ID_GANHO, lost: s.id === ID_PERDIDO,
        })),
      })),
      fields, counts: {},
      users: (usuarios._embedded?.users ?? []).map((u) => ({ id: String(u.id), email: u.email, name: u.name })),
    };
  },

  async listar(cred, entidade, cursor, estrutura): Promise<PaginaCrm> {
    const page = cursor ? Number(cursor) : 1;
    const u = new URL(`${base(cred)}/${OBJETOS[entidade]}`);
    u.searchParams.set("page", String(page));
    u.searchParams.set("limit", String(PAGINA));
    u.searchParams.set("with", entidade === "deals" ? "contacts,companies" : "companies");
    const lista = await chamar<Lista>(u.toString(), { headers: headers(cred) });
    const registros = lista._embedded?.[OBJETOS[entidade]] ?? [];
    const rows = registros.map((r) => {
      const dono = usuarioPorId(estrutura, r.responsible_user_id);
      if (entidade === "contacts") {
        return limpar({
          external_id: r.id, first_name: r.first_name || r.name, last_name: r.last_name, email: campo(r, "EMAIL"), phone: campo(r, "PHONE"),
          title: campo(r, "POSITION"), company_external_id: r._embedded?.companies?.[0]?.id, owner_email: dono,
          tags: (r._embedded?.tags ?? []).map((t) => t.name).filter(Boolean).join(","), created_at: dataDe(r.created_at), ...extras(r),
        });
      }
      if (entidade === "companies") {
        return limpar({
          external_id: r.id, name: r.name, phone: campo(r, "PHONE"), website: campo(r, "WEB"), owner_email: dono, created_at: dataDe(r.created_at), ...extras(r),
        });
      }
      const etapa = etapaPorId(estrutura, r.status_id);
      const principal = (r._embedded?.contacts ?? []).find((c) => c.is_main) ?? r._embedded?.contacts?.[0];
      return limpar({
        external_id: r.id, title: r.name, value: r.price, stage: etapa?.name ?? "", pipeline: etapa?.pipeline ?? "",
        status: r.status_id === ID_GANHO ? "won" : r.status_id === ID_PERDIDO ? "lost" : "open", close_date: dataDe(r.closed_at),
        contact_external_id: principal?.id, company_external_id: r._embedded?.companies?.[0]?.id, owner_email: dono,
        tags: (r._embedded?.tags ?? []).map((t) => t.name).filter(Boolean).join(","), created_at: dataDe(r.created_at), ...extras(r),
      });
    });
    return { rows, next: lista._links?.next?.href ? String(page + 1) : null };
  },
};
