// Fixtures dos CRMs de origem para o hard smoke dos conectores (Sprint 12 B9).
//
// Caminho na sandbox: /crm/<provedor>/<caminho real da API>. Cada provedor
// responde com uma conta pequena: 1 funil com 3 etapas, 2 usuários, 2 contatos,
// 1 empresa e 2 negócios (um ganho). Os nomes levam "E2E" para o teardown
// global apagar o que a sincronização criar.

const DONO = "sabrina@viverdeia.ai";
const OUTRO = "vendedor.e2e@exemplo.com.br";
const EMPRESA = "E2E Conector Ltda";
const CONTATO_1 = { first: "E2E", last: "Ana Conector", email: "e2e.ana.conector@exemplo.com.br", phone: "+55 48 99999-0001", title: "Diretora" };
const CONTATO_2 = { first: "E2E", last: "Bruno Conector", email: "e2e.bruno.conector@exemplo.com.br", phone: "+55 48 99999-0002", title: "Comprador" };
const NEGOCIO_1 = { title: "E2E Proposta conector", value: 4900 };
const NEGOCIO_2 = { title: "E2E Fechado conector", value: 1200 };

type Resposta = { status: number; body: unknown } | null;

function hubspot(caminho: string, metodo: string): Resposta {
  if (caminho === "/crm/v3/pipelines/deals") {
    return { status: 200, body: { results: [{ id: "default", label: "Funil de vendas", stages: [
      { id: "appointmentscheduled", label: "Contato inicial", displayOrder: 0, metadata: { isClosed: "false", probability: "0.2" } },
      { id: "presentationscheduled", label: "Proposta enviada", displayOrder: 1, metadata: { isClosed: "false", probability: "0.6" } },
      { id: "closedwon", label: "Fechado ganho", displayOrder: 2, metadata: { isClosed: "true", probability: "1.0" } },
    ] }] } };
  }
  if (caminho.startsWith("/crm/v3/owners")) return { status: 200, body: { results: [{ id: "1", email: DONO, firstName: "Sabrina" }, { id: "2", email: OUTRO }] } };
  if (caminho.startsWith("/crm/v3/properties/")) {
    const obj = caminho.split("/").pop();
    const custom = obj === "contacts" ? [{ name: "plano_contratado", label: "Plano contratado", type: "string", hubspotDefined: false }] : [];
    return { status: 200, body: { results: [{ name: "email", label: "Email", type: "string", hubspotDefined: true }, ...custom] } };
  }
  if (caminho.endsWith("/search") && metodo === "POST") return { status: 200, body: { total: 2, results: [] } };
  if (caminho === "/crm/v3/objects/contacts") {
    return { status: 200, body: { results: [
      { id: "hs-c1", properties: { firstname: CONTATO_1.first, lastname: CONTATO_1.last, email: CONTATO_1.email, phone: CONTATO_1.phone, jobtitle: CONTATO_1.title, company: EMPRESA, lifecyclestage: "lead", hubspot_owner_id: "1", plano_contratado: "anual", createdate: "2026-01-10T12:00:00Z" } },
      { id: "hs-c2", properties: { firstname: CONTATO_2.first, lastname: CONTATO_2.last, email: CONTATO_2.email, mobilephone: CONTATO_2.phone, jobtitle: CONTATO_2.title, company: EMPRESA, lifecyclestage: "customer", hubspot_owner_id: "2" } },
    ] } };
  }
  if (caminho === "/crm/v3/objects/companies") {
    return { status: 200, body: { results: [{ id: "hs-e1", properties: { name: EMPRESA, domain: "e2e-conector.com.br", industry: "Tecnologia", numberofemployees: "25", hubspot_owner_id: "1" } }] } };
  }
  if (caminho === "/crm/v3/objects/deals") {
    return { status: 200, body: { results: [
      { id: "hs-d1", properties: { dealname: NEGOCIO_1.title, amount: String(NEGOCIO_1.value), dealstage: "presentationscheduled", pipeline: "default", closedate: "2026-12-31", hubspot_owner_id: "1" }, associations: { contacts: { results: [{ id: "hs-c1" }] }, companies: { results: [{ id: "hs-e1" }] } } },
      { id: "hs-d2", properties: { dealname: NEGOCIO_2.title, amount: String(NEGOCIO_2.value), dealstage: "closedwon", pipeline: "default", hubspot_owner_id: "2" }, associations: { contacts: { results: [{ id: "hs-c2" }] } } },
    ] } };
  }
  return null;
}

function pipedrive(caminho: string): Resposta {
  if (caminho === "/users/me") return { status: 200, body: { data: { id: 1, name: "Sabrina", email: DONO, company_domain: "e2e-conector" } } };
  if (caminho === "/users") return { status: 200, body: { data: [{ id: 1, email: DONO, name: "Sabrina" }, { id: 2, email: OUTRO, name: "Vendedor" }] } };
  if (caminho === "/pipelines") return { status: 200, body: { data: [{ id: 1, name: "Funil de vendas", order_nr: 1 }] } };
  if (caminho === "/stages") return { status: 200, body: { data: [{ id: 10, name: "Contato inicial", pipeline_id: 1, order_nr: 1 }, { id: 11, name: "Proposta enviada", pipeline_id: 1, order_nr: 2 }, { id: 12, name: "Negociação", pipeline_id: 1, order_nr: 3 }] } };
  if (caminho === "/personFields") return { status: 200, body: { data: [{ key: "name", name: "Nome", field_type: "varchar" }, { key: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678", name: "Plano contratado", field_type: "varchar", edit_flag: true }] } };
  if (caminho === "/organizationFields" || caminho === "/dealFields") return { status: 200, body: { data: [] } };
  if (caminho.endsWith("/summary")) return { status: 200, body: { data: { count: 2 } } };
  if (caminho === "/persons") {
    return { status: 200, body: { data: [
      { id: 101, name: `${CONTATO_1.first} ${CONTATO_1.last}`, email: [{ value: CONTATO_1.email, primary: true }], phone: [{ value: CONTATO_1.phone, primary: true }], job_title: CONTATO_1.title, org_id: { value: 201, name: EMPRESA }, owner_id: { id: 1, email: DONO }, add_time: "2026-01-10 12:00:00", a1b2c3d4e5f60718293a4b5c6d7e8f9012345678: "anual" },
      { id: 102, name: `${CONTATO_2.first} ${CONTATO_2.last}`, email: [{ value: CONTATO_2.email, primary: true }], phone: [{ value: CONTATO_2.phone, primary: true }], job_title: CONTATO_2.title, org_id: { value: 201, name: EMPRESA }, owner_id: { id: 2, email: OUTRO } },
    ], additional_data: { pagination: { more_items_in_collection: false } } } };
  }
  if (caminho === "/organizations") return { status: 200, body: { data: [{ id: 201, name: EMPRESA, address: "Florianópolis", owner_id: { id: 1 } }], additional_data: { pagination: { more_items_in_collection: false } } } };
  if (caminho === "/deals") {
    return { status: 200, body: { data: [
      { id: 301, title: NEGOCIO_1.title, value: NEGOCIO_1.value, currency: "BRL", stage_id: 11, pipeline_id: 1, status: "open", expected_close_date: "2026-12-31", person_id: { value: 101, name: `${CONTATO_1.first} ${CONTATO_1.last}`, email: [{ value: CONTATO_1.email, primary: true }] }, org_id: { value: 201, name: EMPRESA }, user_id: { id: 1, email: DONO }, add_time: "2026-02-01 10:00:00" },
      { id: 302, title: NEGOCIO_2.title, value: NEGOCIO_2.value, currency: "BRL", stage_id: 12, pipeline_id: 1, status: "won", person_id: { value: 102, name: `${CONTATO_2.first} ${CONTATO_2.last}`, email: [{ value: CONTATO_2.email, primary: true }] }, user_id: { id: 2, email: OUTRO } },
    ], additional_data: { pagination: { more_items_in_collection: false } } } };
  }
  return null;
}

function rdstation(caminho: string): Resposta {
  if (caminho === "/deal_pipelines") return { status: 200, body: [{ id: "p1", name: "Funil de vendas" }] };
  if (caminho === "/deal_stages") return { status: 200, body: { deal_stages: [{ id: "s1", name: "Contato inicial", order: 1 }, { id: "s2", name: "Proposta enviada", order: 2 }, { id: "s3", name: "Negociação", order: 3 }] } };
  if (caminho === "/users") return { status: 200, body: { users: [{ id: "u1", email: DONO, name: "Sabrina" }, { id: "u2", email: OUTRO, name: "Vendedor" }] } };
  if (caminho === "/custom_fields") return { status: 200, body: { custom_fields: [{ key: "plano_contratado", label: "Plano contratado", type: "text", for: "deal" }] } };
  if (caminho === "/contacts") {
    return { status: 200, body: { total: 2, has_more: false, contacts: [
      { id: "c1", name: `${CONTATO_1.first} ${CONTATO_1.last}`, title: CONTATO_1.title, emails: [{ email: CONTATO_1.email }], phones: [{ phone: CONTATO_1.phone }], organization: { name: EMPRESA }, user: { email: DONO }, created_at: "2026-01-10T12:00:00Z" },
      { id: "c2", name: `${CONTATO_2.first} ${CONTATO_2.last}`, title: CONTATO_2.title, emails: [{ email: CONTATO_2.email }], phones: [{ phone: CONTATO_2.phone }], organization: { name: EMPRESA }, user: { email: OUTRO } },
    ] } };
  }
  if (caminho === "/organizations") return { status: 200, body: { total: 1, has_more: false, organizations: [{ id: "o1", name: EMPRESA, url: "https://e2e-conector.com.br", user: { email: DONO }, organization_segments: [{ name: "Tecnologia" }] }] } };
  if (caminho === "/deals") {
    return { status: 200, body: { total: 2, has_more: false, deals: [
      { id: "d1", name: NEGOCIO_1.title, amount_total: NEGOCIO_1.value, deal_stage: { id: "s2", name: "Proposta enviada" }, deal_pipeline: { name: "Funil de vendas" }, user: { email: DONO }, contacts: [{ name: `${CONTATO_1.first} ${CONTATO_1.last}`, emails: [{ email: CONTATO_1.email }] }], organization: { name: EMPRESA }, win: null, prediction_date: "2026-12-31", deal_custom_fields: [{ custom_field: { label: "Plano contratado" }, value: "anual" }] },
      { id: "d2", name: NEGOCIO_2.title, amount_total: NEGOCIO_2.value, deal_stage: { id: "s3", name: "Negociação" }, deal_pipeline: { name: "Funil de vendas" }, user: { email: OUTRO }, contacts: [{ name: `${CONTATO_2.first} ${CONTATO_2.last}`, emails: [{ email: CONTATO_2.email }] }], win: true, closed_at: "2026-03-01T12:00:00Z" },
    ] } };
  }
  return null;
}

function agendor(caminho: string): Resposta {
  if (caminho === "/funnels") return { status: 200, body: { data: [{ id: 1, name: "Funil de vendas", stages: [{ id: 10, name: "Contato inicial", sequence: 1 }, { id: 11, name: "Proposta enviada", sequence: 2 }, { id: 12, name: "Negociação", sequence: 3 }] }] } };
  if (caminho === "/users") return { status: 200, body: { data: [{ id: 1, email: DONO, name: "Sabrina" }, { id: 2, email: OUTRO, name: "Vendedor" }] } };
  if (caminho === "/people") {
    return { status: 200, body: { data: [
      { id: 111, name: `${CONTATO_1.first} ${CONTATO_1.last}`, role: CONTATO_1.title, contact: { email: CONTATO_1.email, whatsapp: CONTATO_1.phone }, organization: { id: 211, name: EMPRESA }, ownerUser: { email: DONO }, leadOrigin: { name: "Indicação" }, createdAt: "2026-01-10T12:00:00Z", customFields: { plano_contratado: "anual" } },
      { id: 112, name: `${CONTATO_2.first} ${CONTATO_2.last}`, role: CONTATO_2.title, contact: { email: CONTATO_2.email, mobile: CONTATO_2.phone }, organization: { id: 211, name: EMPRESA }, ownerUser: { email: OUTRO } },
    ], meta: { total: 2 } } };
  }
  if (caminho === "/organizations") return { status: 200, body: { data: [{ id: 211, name: EMPRESA, website: "https://e2e-conector.com.br", sector: { name: "Tecnologia" }, ownerUser: { email: DONO } }], meta: { total: 1 } } };
  if (caminho === "/deals") {
    return { status: 200, body: { data: [
      { id: 311, title: NEGOCIO_1.title, value: NEGOCIO_1.value, dealStatus: { id: 1, name: "Em andamento" }, dealStage: { id: 11, name: "Proposta enviada" }, funnel: { name: "Funil de vendas" }, person: { name: `${CONTATO_1.first} ${CONTATO_1.last}`, contact: { email: CONTATO_1.email } }, organization: { name: EMPRESA }, ownerUser: { email: DONO }, startTime: "2026-02-01T10:00:00Z", endTime: "2026-12-31T00:00:00Z" },
      { id: 312, title: NEGOCIO_2.title, value: NEGOCIO_2.value, dealStatus: { id: 2, name: "Ganho" }, dealStage: { id: 12, name: "Negociação" }, funnel: { name: "Funil de vendas" }, person: { name: `${CONTATO_2.first} ${CONTATO_2.last}`, contact: { email: CONTATO_2.email } }, ownerUser: { email: OUTRO }, startTime: "2026-02-01T10:00:00Z" },
    ], meta: { total: 2 } } };
  }
  return null;
}

function kommo(caminho: string): Resposta {
  if (caminho === "/account") return { status: 200, body: { id: 1, name: "E2E Conector", subdomain: "e2e-conector" } };
  if (caminho === "/leads/pipelines") return { status: 200, body: { _embedded: { pipelines: [{ id: 1, name: "Funil de vendas", _embedded: { statuses: [{ id: 10, name: "Contato inicial", sort: 10 }, { id: 11, name: "Proposta enviada", sort: 20 }, { id: 142, name: "Venda ganha", sort: 10000 }, { id: 143, name: "Venda perdida", sort: 11000 }] } }] } } };
  if (caminho === "/users") return { status: 200, body: { _embedded: { users: [{ id: 1, email: DONO, name: "Sabrina" }, { id: 2, email: OUTRO, name: "Vendedor" }] } } };
  if (caminho.endsWith("/custom_fields")) {
    const custom = caminho.startsWith("/contacts") ? [{ id: 900, name: "Plano contratado", type: "text", code: null }] : [];
    return { status: 200, body: { _embedded: { custom_fields: [{ id: 1, name: "Email", type: "multitext", code: "EMAIL" }, ...custom] } } };
  }
  if (caminho === "/contacts") {
    return { status: 200, body: { _embedded: { contacts: [
      { id: 121, name: `${CONTATO_1.first} ${CONTATO_1.last}`, first_name: CONTATO_1.first, last_name: CONTATO_1.last, responsible_user_id: 1, created_at: 1767960000, custom_fields_values: [{ field_code: "EMAIL", values: [{ value: CONTATO_1.email }] }, { field_code: "PHONE", values: [{ value: CONTATO_1.phone }] }, { field_code: "POSITION", values: [{ value: CONTATO_1.title }] }, { field_id: 900, field_name: "Plano contratado", values: [{ value: "anual" }] }], _embedded: { companies: [{ id: 221 }], tags: [{ name: "vip" }] } },
      { id: 122, name: `${CONTATO_2.first} ${CONTATO_2.last}`, first_name: CONTATO_2.first, last_name: CONTATO_2.last, responsible_user_id: 2, custom_fields_values: [{ field_code: "EMAIL", values: [{ value: CONTATO_2.email }] }, { field_code: "PHONE", values: [{ value: CONTATO_2.phone }] }], _embedded: { companies: [{ id: 221 }] } },
    ] } } };
  }
  if (caminho === "/companies") return { status: 200, body: { _embedded: { companies: [{ id: 221, name: EMPRESA, responsible_user_id: 1, custom_fields_values: [{ field_code: "WEB", values: [{ value: "https://e2e-conector.com.br" }] }] }] } } };
  if (caminho === "/leads") {
    return { status: 200, body: { _embedded: { leads: [
      { id: 321, name: NEGOCIO_1.title, price: NEGOCIO_1.value, status_id: 11, pipeline_id: 1, responsible_user_id: 1, created_at: 1769860000, _embedded: { contacts: [{ id: 121, is_main: true }], companies: [{ id: 221 }] } },
      { id: 322, name: NEGOCIO_2.title, price: NEGOCIO_2.value, status_id: 142, pipeline_id: 1, responsible_user_id: 2, closed_at: 1772000000, _embedded: { contacts: [{ id: 122, is_main: true }] } },
    ] } } };
  }
  return null;
}

function salesforce(caminho: string, metodo: string, query: URLSearchParams, base: string): Resposta {
  if (caminho === "/services/oauth2/token" && metodo === "POST") {
    return { status: 200, body: { access_token: "sf-access-e2e", refresh_token: "sf-refresh-e2e", instance_url: base, id: `${base}/id/00D/005` } };
  }
  if (caminho.startsWith("/services/data/v60.0/sobjects/") && caminho.endsWith("/describe")) {
    const objeto = caminho.split("/")[5];
    const fields = objeto === "Opportunity"
      ? [{ name: "StageName", label: "Etapa", type: "picklist", picklistValues: [{ value: "Prospecting", label: "Contato inicial", active: true }, { value: "Proposal/Price Quote", label: "Proposta enviada", active: true }, { value: "Closed Won", label: "Fechado ganho", active: true }] }, { name: "Amount", label: "Valor", type: "currency" }]
      : objeto === "Contact"
        ? [{ name: "Email", label: "Email", type: "email" }, { name: "Plano_Contratado__c", label: "Plano contratado", type: "string", custom: true }]
        : [{ name: "Name", label: "Nome", type: "string" }];
    return { status: 200, body: { fields } };
  }
  if (caminho === "/services/data/v60.0/query") {
    const q = query.get("q") ?? "";
    if (q.includes("FROM OpportunityStage")) return { status: 200, body: { done: true, records: [{ MasterLabel: "Prospecting", SortOrder: 1, IsClosed: false, IsWon: false }, { MasterLabel: "Proposal/Price Quote", SortOrder: 2, IsClosed: false, IsWon: false }, { MasterLabel: "Closed Won", SortOrder: 3, IsClosed: true, IsWon: true }] } };
    if (q.startsWith("SELECT COUNT()")) return { status: 200, body: { totalSize: 2, done: true, records: [] } };
    if (q.includes("FROM User")) return { status: 200, body: { done: true, records: [{ Id: "005A", Email: DONO, Name: "Sabrina" }, { Id: "005B", Email: OUTRO, Name: "Vendedor" }] } };
    if (q.includes("FROM Contact")) {
      return { status: 200, body: { totalSize: 2, done: true, records: [
        { Id: "003A", FirstName: CONTATO_1.first, LastName: CONTATO_1.last, Email: CONTATO_1.email, Phone: CONTATO_1.phone, Title: CONTATO_1.title, Account: { Name: EMPRESA }, Owner: { Email: DONO }, LeadSource: "Web", CreatedDate: "2026-01-10T12:00:00.000+0000", Plano_Contratado__c: "anual" },
        { Id: "003B", FirstName: CONTATO_2.first, LastName: CONTATO_2.last, Email: CONTATO_2.email, MobilePhone: CONTATO_2.phone, Title: CONTATO_2.title, Account: { Name: EMPRESA }, Owner: { Email: OUTRO } },
      ] } };
    }
    if (q.includes("FROM Account")) return { status: 200, body: { totalSize: 1, done: true, records: [{ Id: "001A", Name: EMPRESA, Website: "https://e2e-conector.com.br", Industry: "Tecnologia", NumberOfEmployees: 25, Owner: { Email: DONO } }] } };
    if (q.includes("FROM Opportunity")) {
      return { status: 200, body: { totalSize: 2, done: true, records: [
        { Id: "006A", Name: NEGOCIO_1.title, Amount: NEGOCIO_1.value, StageName: "Proposal/Price Quote", CloseDate: "2026-12-31", IsWon: false, IsClosed: false, Account: { Name: EMPRESA }, AccountId: "001A", Owner: { Email: DONO }, OpportunityContactRoles: { records: [{ ContactId: "003A", IsPrimary: true }] } },
        { Id: "006B", Name: NEGOCIO_2.title, Amount: NEGOCIO_2.value, StageName: "Closed Won", CloseDate: "2026-03-01", IsWon: true, IsClosed: true, Account: { Name: EMPRESA }, AccountId: "001A", Owner: { Email: OUTRO }, OpportunityContactRoles: { records: [{ ContactId: "003B", IsPrimary: true }] } },
      ] } };
    }
  }
  return null;
}

/** Resposta de um CRM de origem falso, ou null quando o caminho não é /crm/... */
export function respostaCrm(caminho: string, metodo: string, query: URLSearchParams, baseDaSessao: string): Resposta {
  const m = caminho.match(/^\/crm\/(hubspot|pipedrive|rdstation|agendor|kommo|salesforce)(\/.*)?$/);
  if (!m) return null;
  const provedor = m[1];
  const resto = m[2] || "/";
  const base = `${baseDaSessao}/crm/${provedor}`;
  const r = provedor === "hubspot" ? hubspot(resto, metodo)
    : provedor === "pipedrive" ? pipedrive(resto)
    : provedor === "rdstation" ? rdstation(resto)
    : provedor === "agendor" ? agendor(resto)
    : provedor === "kommo" ? kommo(resto)
    : salesforce(resto, metodo, query, base);
  return r ?? { status: 404, body: { error: `sandbox ${provedor}: caminho ${resto} não simulado` } };
}
