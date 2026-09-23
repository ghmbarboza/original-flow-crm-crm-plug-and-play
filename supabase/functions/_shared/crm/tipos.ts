// Conectores com outros CRMs (Sprint 12 B9): contrato comum dos adaptadores.
//
// Cada adaptador fala a API do CRM de origem e devolve registros já no
// vocabulário universal da importação (_shared/importar.ts): contatos com
// name/email/phone/company/owner_email, negócios com title/value/stage/status
// etc. Assim a sincronização reaproveita o mesmo grava-lotes do CSV.

import type { Dados } from "../importar.ts";

export type ProvedorCrm = "hubspot" | "pipedrive" | "rdstation" | "agendor" | "kommo" | "salesforce";
export type EntidadeCrm = "contacts" | "companies" | "deals";
export const ENTIDADES: EntidadeCrm[] = ["contacts", "companies", "deals"];

export interface CredencialCrm {
  /** Token da API (ou access token do OAuth). */
  token: string;
  /** Subdomínio/instância da conta quando a API é por conta (Pipedrive, Kommo, Salesforce). */
  domain?: string | null;
  /** Base alternativa da API, usada pelo hard smoke para apontar a integration-sandbox. */
  apiBase?: string | null;
}

export interface EtapaOrigem {
  id: string;
  name: string;
  pipeline: string;
  order: number;
  won?: boolean;
  lost?: boolean;
}

export interface FunilOrigem {
  id: string;
  name: string;
  stages: EtapaOrigem[];
}

export interface CampoOrigem {
  key: string;
  label: string;
  type?: string;
  custom?: boolean;
}

export interface EstruturaCrm {
  account?: string | null;
  pipelines: FunilOrigem[];
  fields: Partial<Record<EntidadeCrm, CampoOrigem[]>>;
  counts: Partial<Record<EntidadeCrm, number | null>>;
  users: { id: string; email: string; name?: string }[];
}

export interface PaginaCrm {
  rows: Dados[];
  /** Cursor da próxima página, null quando acabou. */
  next: string | null;
}

export interface AdaptadorCrm {
  provider: ProvedorCrm;
  /** Base da API já resolvida (apiBase da sandbox tem prioridade). */
  base(cred: CredencialCrm): string;
  lerEstrutura(cred: CredencialCrm): Promise<EstruturaCrm>;
  listar(cred: CredencialCrm, entidade: EntidadeCrm, cursor: string | null, estrutura: EstruturaCrm): Promise<PaginaCrm>;
}

export class ErroCrm extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const PAGINA = 100;

/** GET/POST com erro legível: 401/403 viram "credencial recusada", o resto traz o status. */
export async function chamar<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(url, init);
  const textoResp = await resp.text();
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) throw new ErroCrm(resp.status, "Credencial recusada pelo CRM de origem. Confira o token e as permissões.");
    if (resp.status === 429) throw new ErroCrm(429, "O CRM de origem limitou as chamadas. Tente de novo em alguns minutos.");
    throw new ErroCrm(resp.status, `CRM de origem respondeu ${resp.status}: ${textoResp.slice(0, 200)}`);
  }
  try {
    return (textoResp ? JSON.parse(textoResp) : {}) as T;
  } catch {
    throw new ErroCrm(502, "Resposta inválida do CRM de origem.");
  }
}

export function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

/** Remove chaves vazias para o import-run não sobrescrever com "". */
export function limpar(d: Record<string, unknown>): Dados {
  const out: Dados = {};
  for (const [k, v] of Object.entries(d)) {
    const s = str(v);
    if (s) out[k] = s;
  }
  return out;
}

export function usuarioPorId(estrutura: EstruturaCrm, id: unknown): string {
  const alvo = str(id);
  if (!alvo) return "";
  return estrutura.users.find((u) => u.id === alvo)?.email ?? "";
}

export function etapaPorId(estrutura: EstruturaCrm, id: unknown): EtapaOrigem | null {
  const alvo = str(id);
  if (!alvo) return null;
  for (const p of estrutura.pipelines) {
    const e = p.stages.find((s) => s.id === alvo);
    if (e) return e;
  }
  return null;
}
