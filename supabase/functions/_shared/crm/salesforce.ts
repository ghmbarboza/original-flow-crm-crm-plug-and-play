// Salesforce: OAuth 2.0 (Connected App), REST API + SOQL. O token de acesso é
// renovado pelo refresh_token; a conexão guarda o instance_url em `domain`.
import {
  type AdaptadorCrm, type CredencialCrm, type EntidadeCrm, type EstruturaCrm, type PaginaCrm,
  chamar, etapaPorId, limpar, str,
} from "./tipos.ts";

export const SALESFORCE_LOGIN = "https://login.salesforce.com";
const VERSAO = "v60.0";
const CAMPOS_PADRAO = new Set(["Id", "FirstName", "LastName", "Email", "Phone", "MobilePhone", "Title", "AccountId", "OwnerId", "LeadSource", "CreatedDate", "Name", "Website", "Industry", "NumberOfEmployees", "Amount", "StageName", "CloseDate", "IsWon", "IsClosed", "Description"]);
const MAX_CUSTOM = 40;

const SOQL: Record<EntidadeCrm, string> = {
  contacts: "SELECT Id, FirstName, LastName, Email, Phone, MobilePhone, Title, Account.Name, Owner.Email, LeadSource, CreatedDate{custom} FROM Contact ORDER BY CreatedDate",
  companies: "SELECT Id, Name, Website, Phone, Industry, NumberOfEmployees, Owner.Email, CreatedDate{custom} FROM Account ORDER BY CreatedDate",
  deals: "SELECT Id, Name, Amount, StageName, CloseDate, IsWon, IsClosed, Account.Name, AccountId, Owner.Email, CreatedDate{custom} FROM Opportunity ORDER BY CreatedDate",
};
const OBJETO: Record<EntidadeCrm, string> = { contacts: "Contact", companies: "Account", deals: "Opportunity" };

interface Consulta { totalSize?: number; done?: boolean; nextRecordsUrl?: string; records: Record<string, unknown>[] }

function headers(cred: CredencialCrm) {
  return { Authorization: `Bearer ${cred.token}`, "Content-Type": "application/json" };
}
function base(cred: CredencialCrm) {
  return (cred.apiBase ?? cred.domain ?? "").replace(/\/+$/, "");
}
function customDe(estrutura: EstruturaCrm, entidade: EntidadeCrm) {
  return (estrutura.fields[entidade] ?? []).filter((f) => f.custom).slice(0, MAX_CUSTOM).map((f) => f.key);
}
function extras(estrutura: EstruturaCrm, entidade: EntidadeCrm, r: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of customDe(estrutura, entidade)) {
    if (str(r[k])) out[`custom:${k.replace(/__c$/i, "").toLowerCase()}`] = r[k];
  }
  return out;
}
function rel(r: Record<string, unknown>, chave: string, campo: string) {
  const o = r[chave] as Record<string, unknown> | null | undefined;
  return o ? str(o[campo]) : "";
}

export const salesforce: AdaptadorCrm = {
  provider: "salesforce",
  base,

  async lerEstrutura(cred) {
    const b = base(cred);
    const h = headers(cred);
    const fields: EstruturaCrm["fields"] = {};
    let etapas: { value: string; label: string; active?: boolean; closed?: boolean; won?: boolean }[] = [];
    for (const entidade of ["contacts", "companies", "deals"] as EntidadeCrm[]) {
      const d = await chamar<{ fields?: { name: string; label: string; type: string; custom?: boolean; picklistValues?: { value: string; label: string; active?: boolean }[] }[] }>(`${b}/services/data/${VERSAO}/sobjects/${OBJETO[entidade]}/describe`, { headers: h });
      fields[entidade] = (d.fields ?? []).filter((f) => f.custom || CAMPOS_PADRAO.has(f.name)).map((f) => ({ key: f.name, label: f.label, type: f.type, custom: f.custom === true }));
      if (entidade === "deals") etapas = (d.fields ?? []).find((f) => f.name === "StageName")?.picklistValues ?? [];
    }
    const estagios = await chamar<Consulta>(`${b}/services/data/${VERSAO}/query?q=${encodeURIComponent("SELECT MasterLabel, SortOrder, IsClosed, IsWon FROM OpportunityStage ORDER BY SortOrder")}`, { headers: h }).catch((): Consulta => ({ records: [] }));
    const porNome = new Map(estagios.records.map((e) => [str(e.MasterLabel), e]));
    const counts: EstruturaCrm["counts"] = {};
    for (const entidade of ["contacts", "companies", "deals"] as EntidadeCrm[]) {
      const c = await chamar<Consulta>(`${b}/services/data/${VERSAO}/query?q=${encodeURIComponent(`SELECT COUNT() FROM ${OBJETO[entidade]}`)}`, { headers: h }).catch((): Consulta => ({ records: [] }));
      counts[entidade] = typeof c.totalSize === "number" ? c.totalSize : null;
    }
    const usuarios = await chamar<Consulta>(`${b}/services/data/${VERSAO}/query?q=${encodeURIComponent("SELECT Id, Email, Name FROM User WHERE IsActive = true")}`, { headers: h }).catch((): Consulta => ({ records: [] }));
    return {
      account: cred.domain ?? null,
      pipelines: [{
        id: "opportunity", name: "Oportunidades",
        stages: etapas.filter((e) => e.active !== false).map((e, i) => {
          const meta = porNome.get(e.value);
          return { id: e.value, name: e.label, pipeline: "Oportunidades", order: Number(meta?.SortOrder ?? i), won: meta?.IsWon === true, lost: meta?.IsClosed === true && meta?.IsWon !== true };
        }),
      }],
      fields, counts,
      users: usuarios.records.map((u) => ({ id: str(u.Id), email: str(u.Email), name: str(u.Name) })),
    };
  },

  async listar(cred, entidade, cursor, estrutura): Promise<PaginaCrm> {
    const b = base(cred);
    const custom = customDe(estrutura, entidade);
    const soql = SOQL[entidade].replace("{custom}", custom.length ? ", " + custom.join(", ") : "");
    const url = cursor ? `${b}${cursor}` : `${b}/services/data/${VERSAO}/query?q=${encodeURIComponent(soql)}`;
    const q = await chamar<Consulta>(url, { headers: headers(cred) });
    const rows = q.records.map((r) => {
      if (entidade === "contacts") {
        return limpar({
          external_id: r.Id, first_name: r.FirstName, last_name: r.LastName, email: r.Email, phone: r.Phone, whatsapp_phone: r.MobilePhone, title: r.Title,
          company: rel(r, "Account", "Name"), owner_email: rel(r, "Owner", "Email"), source: r.LeadSource, created_at: r.CreatedDate, ...extras(estrutura, entidade, r),
        });
      }
      if (entidade === "companies") {
        return limpar({
          external_id: r.Id, name: r.Name, website: r.Website, phone: r.Phone, industry: r.Industry, size: r.NumberOfEmployees,
          owner_email: rel(r, "Owner", "Email"), created_at: r.CreatedDate, ...extras(estrutura, entidade, r),
        });
      }
      // StageName é o valor interno da picklist; o de/para usa o rótulo lido na estrutura.
      const etapa = etapaPorId(estrutura, r.StageName);
      return limpar({
        external_id: r.Id, title: r.Name, value: r.Amount, stage: etapa?.name ?? r.StageName, pipeline: "Oportunidades",
        status: r.IsWon === true ? "won" : r.IsClosed === true ? "lost" : "open", close_date: r.CloseDate,
        company: rel(r, "Account", "Name"), company_external_id: r.AccountId, owner_email: rel(r, "Owner", "Email"), created_at: r.CreatedDate,
        ...extras(estrutura, entidade, r),
      });
    });
    return { rows, next: q.done === false && q.nextRecordsUrl ? q.nextRecordsUrl : null };
  },
};

/** Troca code ou refresh_token por tokens no endpoint do Salesforce (ou da sandbox). */
export async function tokenSalesforce(
  loginBase: string,
  params: Record<string, string>,
): Promise<{ access_token: string; refresh_token?: string; instance_url: string }> {
  const resp = await fetch(`${loginBase.replace(/\/+$/, "")}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok || !corpo.access_token) {
    throw new Error(`Salesforce recusou a autorização: ${corpo.error_description ?? corpo.error ?? resp.status}`);
  }
  return corpo;
}
