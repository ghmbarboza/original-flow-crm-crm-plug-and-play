/**
 * Importação universal (Sprint 12 B8): catálogo de campos por entidade, presets
 * de cabeçalho dos CRMs de origem, adivinhação de coluna e normalização de valores.
 * O servidor (function import-run) refaz a validação; aqui é o que a tela precisa.
 */

export type ImportKind = "contacts" | "companies" | "deals" | "activities";
export type ImportSource = "csv" | "hubspot" | "pipedrive" | "rdstation" | "agendor" | "kommo" | "salesforce" | "ploomes" | "bitrix";

export const IMPORT_KIND_LABELS: Record<ImportKind, string> = {
  contacts: "Contatos",
  companies: "Empresas",
  deals: "Negócios",
  activities: "Atividades",
};

export const IMPORT_SOURCE_LABELS: Record<ImportSource, string> = {
  csv: "CSV genérico (planilha)",
  hubspot: "HubSpot",
  pipedrive: "Pipedrive",
  rdstation: "RD Station CRM",
  agendor: "Agendor",
  kommo: "Kommo",
  salesforce: "Salesforce",
  ploomes: "Ploomes",
  bitrix: "Bitrix24",
};

export interface CampoImportacao {
  key: string;
  label: string;
  /** Chave de identificação para atualizar em vez de criar. */
  chave?: boolean;
}

export const IGNORAR = "__ignore__";
export const CUSTOM_PREFIX = "custom:";

export const CAMPOS_POR_ENTIDADE: Record<ImportKind, CampoImportacao[]> = {
  contacts: [
    { key: "external_id", label: "ID no sistema de origem", chave: true },
    { key: "name", label: "Nome completo" },
    { key: "first_name", label: "Primeiro nome" },
    { key: "last_name", label: "Sobrenome" },
    { key: "email", label: "E-mail", chave: true },
    { key: "phone", label: "Telefone", chave: true },
    { key: "whatsapp_phone", label: "WhatsApp", chave: true },
    { key: "title", label: "Cargo" },
    { key: "status", label: "Status (lead, prospect, customer, churned)" },
    { key: "source", label: "Origem" },
    { key: "company", label: "Empresa (nome)" },
    { key: "owner_email", label: "Responsável (e-mail do usuário)" },
    { key: "tags", label: "Tags (separadas por vírgula)" },
    { key: "created_at", label: "Data de criação" },
  ],
  companies: [
    { key: "external_id", label: "ID no sistema de origem", chave: true },
    { key: "name", label: "Nome", chave: true },
    { key: "domain", label: "Domínio", chave: true },
    { key: "industry", label: "Segmento" },
    { key: "size", label: "Porte" },
    { key: "website", label: "Site" },
    { key: "owner_email", label: "Responsável (e-mail do usuário)" },
  ],
  deals: [
    { key: "external_id", label: "ID no sistema de origem", chave: true },
    { key: "title", label: "Título" },
    { key: "value", label: "Valor" },
    { key: "currency", label: "Moeda" },
    { key: "status", label: "Status (open, won, lost)" },
    { key: "stage", label: "Etapa (nome no sistema de origem)" },
    { key: "pipeline", label: "Funil (nome)" },
    { key: "contact_email", label: "Contato (e-mail)" },
    { key: "contact_phone", label: "Contato (telefone)" },
    { key: "contact_name", label: "Contato (nome)" },
    { key: "company", label: "Empresa (nome)" },
    { key: "owner_email", label: "Responsável (e-mail do usuário)" },
    { key: "close_date", label: "Data de fechamento" },
    { key: "created_at", label: "Data de criação" },
    { key: "loss_reason", label: "Motivo da perda" },
  ],
  activities: [
    { key: "type", label: "Tipo (task, call, meeting, note, email)" },
    { key: "title", label: "Título" },
    { key: "body", label: "Descrição" },
    { key: "due_date", label: "Data" },
    { key: "completed", label: "Concluída (sim/não)" },
    { key: "contact_email", label: "Contato (e-mail)" },
    { key: "contact_phone", label: "Contato (telefone)" },
    { key: "deal_external_id", label: "Negócio (ID de origem)" },
    { key: "deal_title", label: "Negócio (título)" },
    { key: "owner_email", label: "Responsável (e-mail do usuário)" },
  ],
};

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Cabeçalhos conhecidos (já normalizados) para cada campo, por entidade. Genéricos + exportações dos CRMs. */
const SINONIMOS: Record<ImportKind, Record<string, string[]>> = {
  contacts: {
    external_id: ["id", "record id", "contact id", "id do contato", "person id", "lead id", "identificador"],
    name: ["nome", "nome completo", "name", "full name", "contato", "person", "lead"],
    first_name: ["primeiro nome", "first name", "firstname", "nome proprio"],
    last_name: ["sobrenome", "last name", "lastname"],
    email: ["email", "e mail", "email address", "e mail principal", "emails"],
    phone: ["telefone", "fone", "phone", "phone number", "telefone principal", "telefone comercial", "phones"],
    whatsapp_phone: ["celular", "whatsapp", "mobile", "mobile phone", "telefone celular"],
    title: ["cargo", "title", "job title", "position", "funcao"],
    status: ["status", "situacao", "lifecycle stage", "estagio do ciclo de vida", "lead status"],
    source: ["origem", "source", "fonte", "lead source", "original source", "canal"],
    company: ["empresa", "company", "organization", "organizacao", "company name", "nome da empresa", "conta"],
    owner_email: ["responsavel", "owner", "contact owner", "dono", "proprietario", "owner email", "vendedor"],
    tags: ["tags", "etiquetas", "marcadores", "labels"],
    created_at: ["criado em", "data de criacao", "create date", "created at", "created", "data de cadastro"],
  },
  companies: {
    external_id: ["id", "record id", "company id", "id da empresa", "org id", "organization id"],
    name: ["nome", "name", "empresa", "company", "company name", "razao social", "organization", "organizacao"],
    domain: ["dominio", "domain", "company domain name", "website domain"],
    industry: ["segmento", "industry", "setor", "ramo", "area"],
    size: ["porte", "size", "tamanho", "number of employees", "funcionarios"],
    website: ["site", "website", "url", "web"],
    owner_email: ["responsavel", "owner", "company owner", "dono", "owner email"],
  },
  deals: {
    external_id: ["id", "record id", "deal id", "id do negocio", "opportunity id", "id da oportunidade"],
    title: ["titulo", "title", "deal name", "nome do negocio", "negocio", "oportunidade", "opportunity name", "name", "nome"],
    value: ["valor", "value", "amount", "deal value", "montante", "valor do negocio"],
    currency: ["moeda", "currency"],
    status: ["status", "situacao", "deal status", "is won", "resultado"],
    stage: ["etapa", "stage", "deal stage", "estagio", "fase", "pipeline stage", "stage name"],
    pipeline: ["funil", "pipeline", "pipeline name"],
    contact_email: ["email do contato", "contact email", "email", "e mail", "person email"],
    contact_phone: ["telefone do contato", "contact phone", "telefone", "phone", "person phone"],
    contact_name: ["contato", "contact", "person", "pessoa", "contact name", "nome do contato"],
    company: ["empresa", "company", "organization", "organizacao", "company name", "conta"],
    owner_email: ["responsavel", "owner", "deal owner", "dono", "vendedor", "owner email"],
    close_date: ["data de fechamento", "close date", "expected close date", "fechamento", "previsao de fechamento", "won time"],
    created_at: ["criado em", "data de criacao", "create date", "created at", "add time"],
    loss_reason: ["motivo da perda", "lost reason", "loss reason", "motivo"],
  },
  activities: {
    type: ["tipo", "type", "activity type", "tipo de atividade"],
    title: ["titulo", "title", "subject", "assunto", "atividade", "activity"],
    body: ["descricao", "description", "notes", "note", "observacoes", "body", "conteudo"],
    due_date: ["data", "date", "due date", "vencimento", "data de vencimento", "when", "quando", "start time"],
    completed: ["concluida", "done", "completed", "status", "marked as done"],
    contact_email: ["email do contato", "contact email", "email"],
    contact_phone: ["telefone do contato", "contact phone", "telefone"],
    deal_external_id: ["deal id", "id do negocio", "negocio id"],
    deal_title: ["negocio", "deal", "deal name", "nome do negocio", "oportunidade"],
    owner_email: ["responsavel", "owner", "assigned to", "atribuido a", "owner email"],
  },
};

/** Cabeçalhos específicos das exportações de cada CRM (normalizados), quando fogem dos sinônimos gerais. */
export const PRESETS: Partial<Record<ImportSource, Partial<Record<ImportKind, Record<string, string>>>>> = {
  hubspot: {
    contacts: { "record id": "external_id", "first name": "first_name", "last name": "last_name", "phone number": "phone", "mobile phone number": "whatsapp_phone", "job title": "title", "lifecycle stage": "status", "original source": "source", "associated company": "company", "contact owner": "owner_email", "create date": "created_at" },
    companies: { "record id": "external_id", "company name": "name", "company domain name": "domain", "industry": "industry", "number of employees": "size", "website url": "website", "company owner": "owner_email" },
    deals: { "record id": "external_id", "deal name": "title", "amount": "value", "deal stage": "stage", "pipeline": "pipeline", "deal owner": "owner_email", "close date": "close_date", "create date": "created_at", "associated contact": "contact_name", "associated company": "company" },
  },
  pipedrive: {
    contacts: { "id": "external_id", "name": "name", "email": "email", "phone": "phone", "organization": "company", "owner": "owner_email", "label": "tags", "add time": "created_at" },
    companies: { "id": "external_id", "name": "name", "address": "website", "owner": "owner_email" },
    deals: { "id": "external_id", "title": "title", "value": "value", "currency": "currency", "status": "status", "stage": "stage", "pipeline": "pipeline", "person": "contact_name", "organization": "company", "owner": "owner_email", "expected close date": "close_date", "add time": "created_at", "lost reason": "loss_reason" },
  },
  rdstation: {
    contacts: { "nome": "name", "email": "email", "telefone": "phone", "celular": "whatsapp_phone", "cargo": "title", "empresa": "company", "responsavel": "owner_email", "origem": "source", "criado em": "created_at" },
    deals: { "nome": "title", "valor": "value", "etapa": "stage", "funil": "pipeline", "empresa": "company", "responsavel": "owner_email", "data de fechamento": "close_date", "motivo de perda": "loss_reason", "email do contato": "contact_email" },
  },
  agendor: {
    contacts: { "nome": "name", "email": "email", "telefone": "phone", "celular": "whatsapp_phone", "cargo": "title", "empresa": "company", "responsavel": "owner_email", "origem": "source" },
    companies: { "nome": "name", "site": "website", "segmento": "industry", "responsavel": "owner_email" },
    deals: { "titulo": "title", "valor": "value", "etapa": "stage", "funil": "pipeline", "pessoa": "contact_name", "empresa": "company", "responsavel": "owner_email", "data de fechamento": "close_date", "motivo de perda": "loss_reason" },
  },
  kommo: {
    contacts: { "id": "external_id", "nome completo": "name", "email": "email", "telefone": "phone", "empresa": "company", "responsavel": "owner_email", "tags": "tags" },
    deals: { "id": "external_id", "nome do lead": "title", "orcamento": "value", "etapa": "stage", "funil": "pipeline", "contato principal": "contact_name", "empresa": "company", "responsavel": "owner_email" },
  },
  salesforce: {
    contacts: { "contact id": "external_id", "first name": "first_name", "last name": "last_name", "email": "email", "phone": "phone", "mobile": "whatsapp_phone", "title": "title", "account name": "company", "contact owner": "owner_email", "lead source": "source" },
    companies: { "account id": "external_id", "account name": "name", "website": "website", "industry": "industry", "employees": "size", "account owner": "owner_email" },
    deals: { "opportunity id": "external_id", "opportunity name": "title", "amount": "value", "stage": "stage", "close date": "close_date", "account name": "company", "opportunity owner": "owner_email", "loss reason": "loss_reason" },
  },
  ploomes: {
    contacts: { "nome": "name", "email": "email", "telefone": "phone", "celular": "whatsapp_phone", "cargo": "title", "empresa": "company", "responsavel": "owner_email", "origem": "source" },
    deals: { "titulo": "title", "valor": "value", "estagio": "stage", "funil": "pipeline", "contato": "contact_name", "empresa": "company", "responsavel": "owner_email", "previsao de fechamento": "close_date" },
  },
  bitrix: {
    contacts: { "id": "external_id", "nome": "first_name", "sobrenome": "last_name", "e mail": "email", "telefone": "phone", "cargo": "title", "empresa": "company", "responsavel": "owner_email", "fonte": "source" },
    deals: { "id": "external_id", "nome": "title", "valor": "value", "fase": "stage", "funil": "pipeline", "contato": "contact_name", "empresa": "company", "responsavel": "owner_email", "data de fechamento": "close_date" },
  },
};

/** Campo mais provável para um cabeçalho, ou IGNORAR. Preset da origem tem prioridade. */
export function adivinharCampo(header: string, kind: ImportKind, source: ImportSource = "csv"): string {
  const h = normalizar(header);
  if (!h) return IGNORAR;
  const preset = PRESETS[source]?.[kind];
  if (preset && preset[h]) return preset[h];
  const catalogo = SINONIMOS[kind];
  for (const [campo, nomes] of Object.entries(catalogo)) {
    if (nomes.includes(h)) return campo;
  }
  for (const [campo, nomes] of Object.entries(catalogo)) {
    if (nomes.some((n) => n.length > 3 && h.includes(n))) return campo;
  }
  return IGNORAR;
}

/** Mapeamento inicial de todas as colunas. */
export function mapearColunas(headers: string[], kind: ImportKind, source: ImportSource = "csv"): Record<number, string> {
  const usado = new Set<string>();
  const mapa: Record<number, string> = {};
  headers.forEach((h, i) => {
    const campo = adivinharCampo(h, kind, source);
    if (campo !== IGNORAR && usado.has(campo)) { mapa[i] = IGNORAR; return; }
    if (campo !== IGNORAR) usado.add(campo);
    mapa[i] = campo;
  });
  return mapa;
}

/** Linha do arquivo como objeto {campo: valor}. Colunas ignoradas ficam de fora; custom:<chave> vira custom_fields. */
export function linhaParaRegistro(headers: string[], mapping: Record<number, string>, row: string[]): Record<string, string> {
  const r: Record<string, string> = {};
  headers.forEach((_, i) => {
    const campo = mapping[i];
    if (!campo || campo === IGNORAR) return;
    const v = (row[i] ?? "").trim();
    if (v === "") return;
    r[campo] = v;
  });
  return r;
}

export function normalizarValor(v: string): number | null {
  const limpo = v.replace(/[^\d,.-]/g, "");
  if (!limpo) return null;
  // "1.234,56" (BR) vs "1,234.56" (EN): a última pontuação é o separador decimal.
  const ultimaVirgula = limpo.lastIndexOf(",");
  const ultimoPonto = limpo.lastIndexOf(".");
  let normalizado = limpo;
  if (ultimaVirgula > ultimoPonto) normalizado = limpo.replace(/\./g, "").replace(",", ".");
  else normalizado = limpo.replace(/,/g, "");
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** dd/mm/aaaa, aaaa-mm-dd, ISO e "dd/mm/aaaa hh:mm" viram ISO. */
export function normalizarData(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    const d = new Date(Date.UTC(Number(ano), Number(br[2]) - 1, Number(br[1]), Number(br[4] ?? 12), Number(br[5] ?? 0)));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizarBooleano(v: string): boolean {
  return ["sim", "s", "yes", "y", "true", "1", "concluida", "concluído", "concluida", "done", "x"].includes(v.trim().toLowerCase());
}

/** Valores distintos de uma coluna (para o de/para de etapas). */
export function valoresDistintos(rows: string[][], coluna: number, limite = 50): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = (r[coluna] ?? "").trim();
    if (v) set.add(v);
    if (set.size >= limite) break;
  }
  return [...set];
}

/** Sugere a etapa do CRM para um nome vindo de fora: igual, contém, ou palavras-chave. */
export function sugerirEtapa(nomeOrigem: string, etapas: { id: string; name: string }[]): string | null {
  const n = normalizar(nomeOrigem);
  const exata = etapas.find((e) => normalizar(e.name) === n);
  if (exata) return exata.id;
  const contem = etapas.find((e) => n.includes(normalizar(e.name)) || normalizar(e.name).includes(n));
  if (contem) return contem.id;
  const grupos: [RegExp, string[]][] = [
    [/ganh|won|fech|closed won|venc/, ["fechamento", "ganho", "fechado"]],
    [/perd|lost|closed lost/, ["perdido", "perda"]],
    [/propost|proposal|orcament|quote/, ["proposta", "orcamento"]],
    [/negoc|negotiat/, ["negociacao"]],
    [/qualif|sql|mql|contato|contact/, ["qualificacao", "contato"]],
    [/lead|prospec|novo|new|inbox/, ["prospeccao", "lead", "novo"]],
  ];
  for (const [re, palavras] of grupos) {
    if (re.test(n)) {
      const alvo = etapas.find((e) => palavras.some((p) => normalizar(e.name).includes(p)));
      if (alvo) return alvo.id;
    }
  }
  return null;
}
