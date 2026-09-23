// Registro dos adaptadores e resolução de vínculos por ID de origem.
import { agendor } from "./agendor.ts";
import { hubspot } from "./hubspot.ts";
import { kommo } from "./kommo.ts";
import { pipedrive } from "./pipedrive.ts";
import { rdstation } from "./rdstation.ts";
import { salesforce } from "./salesforce.ts";
import type { AdaptadorCrm, ProvedorCrm } from "./tipos.ts";

export * from "./tipos.ts";
export { SALESFORCE_LOGIN, tokenSalesforce } from "./salesforce.ts";

const ADAPTADORES: Record<ProvedorCrm, AdaptadorCrm> = { hubspot, pipedrive, rdstation, agendor, kommo, salesforce };
export const PROVEDORES = Object.keys(ADAPTADORES) as ProvedorCrm[];

export function adaptadorDe(provider: string): AdaptadorCrm | null {
  return (ADAPTADORES as Record<string, AdaptadorCrm>)[provider] ?? null;
}

export const PROVEDOR_LABEL: Record<ProvedorCrm, string> = {
  hubspot: "HubSpot", pipedrive: "Pipedrive", rdstation: "RD Station CRM", agendor: "Agendor", kommo: "Kommo", salesforce: "Salesforce",
};
