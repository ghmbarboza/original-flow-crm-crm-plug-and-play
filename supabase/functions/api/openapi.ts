// Especificação OpenAPI 3 da API pública, servida em GET /api/openapi.json.
// Mantida à mão, curta de propósito: descreve o que existe em rotas.ts.

const seguranca = [{ bearer: [] }];
const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, ...(required.length ? { required } : {}) });
const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
const num = (description?: string) => ({ type: "number", ...(description ? { description } : {}) });
const resp = (description: string) => ({ "200": { description }, "401": { description: "Chave ausente, inválida ou revogada" }, "403": { description: "Escopo insuficiente" }, "429": { description: "Limite por minuto" } });
const corpo = (schema: unknown) => ({ required: true, content: { "application/json": { schema } } });
const param = (name: string, description: string, where = "query") => ({ name, in: where, required: where === "path", schema: { type: "string" }, description });

export function openapi(baseUrl: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "FlowCRM API",
      version: "1.0.0",
      description: "Acesso de outras ferramentas ao CRM. Chave em Configurações > API, enviada em Authorization: Bearer fcrm_live_... Escopos por recurso; limite de chamadas por minuto por chave.",
    },
    servers: [{ url: baseUrl }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    paths: {
      "/pipelines": { get: { summary: "Funis e etapas", security: seguranca, responses: resp("Funis com etapas em ordem") } },
      "/contacts": {
        get: { summary: "Buscar contatos", security: seguranca, parameters: [param("email", "e-mail exato"), param("phone", "telefone, só dígitos"), param("q", "nome ou e-mail contém"), param("limit", "máximo 100")], responses: resp("Lista de contatos") },
        post: { summary: "Criar ou atualizar contato (por e-mail ou telefone)", security: seguranca, requestBody: corpo(obj({ name: str(), first_name: str(), last_name: str(), email: str(), phone: str(), whatsapp: str(), title: str("cargo"), status: str("lead, prospect, customer, churned"), source: str("origem"), company: str("nome da empresa"), company_id: str(), owner_email: str("e-mail de um usuário do CRM"), custom_fields: { type: "object" } })), responses: { ...resp("contact_id e created"), "201": { description: "Contato criado" } } },
      },
      "/contacts/{id}": { get: { summary: "Contato com empresa, tags, negócios e últimas atividades", security: seguranca, parameters: [param("id", "id do contato", "path")], responses: resp("Ficha do contato") } },
      "/deals": {
        get: { summary: "Listar negócios", security: seguranca, parameters: [param("contact_id", "filtra por contato"), param("status", "open, won, lost"), param("stage_id", "filtra por etapa"), param("limit", "máximo 100")], responses: resp("Lista de negócios") },
        post: { summary: "Criar negócio", security: seguranca, requestBody: corpo(obj({ contact_id: str(), email: str("contato pelo e-mail, se não houver contact_id"), phone: str(), title: str(), value: num(), currency: str(), pipeline_id: str(), stage: str("id ou nome da etapa"), owner_email: str(), company_id: str(), close_date: str("AAAA-MM-DD"), custom_fields: { type: "object" }, products: { type: "array", items: obj({ product_id: str(), quantity: num(), unit_price: num() }) } })), responses: { "201": { description: "deal_id e stage_id" }, ...resp("") } },
      },
      "/deals/{id}": {
        get: { summary: "Negócio com etapa, produtos e histórico", security: seguranca, parameters: [param("id", "id do negócio", "path")], responses: resp("Negócio") },
        patch: { summary: "Atualizar negócio (etapa por id ou nome, status, valor, dono...)", security: seguranca, parameters: [param("id", "id do negócio", "path")], requestBody: corpo(obj({ stage: str("id ou nome"), pipeline_id: str(), status: str("open, won, lost"), loss_reason: str(), value: num(), title: str(), owner_email: str(), company_id: str(), close_date: str(), custom_fields: { type: "object" }, reason: str("motivo registrado no histórico") })), responses: resp("deal_id e moved") },
      },
      "/conversations": { get: { summary: "Listar conversas", security: seguranca, parameters: [param("phone", "telefone"), param("contact_id", "contato"), param("status", "ai_active, human_takeover, closed"), param("limit", "máximo 100")], responses: resp("Lista de conversas") } },
      "/conversations/{id}/messages": {
        get: { summary: "Mensagens da conversa (mais antigas primeiro)", security: seguranca, parameters: [param("id", "id da conversa", "path"), param("limit", "máximo 100")], responses: resp("Mensagens") },
        post: { summary: "Registrar mensagem sem enviar (ex.: SDR externo que já enviou pelo próprio canal)", security: seguranca, parameters: [param("id", "id da conversa", "path")], requestBody: corpo(obj({ content: str(), direction: str("outbound (padrão) ou inbound"), internal_note: { type: "boolean" } }, ["content"])), responses: { "201": { description: "message_id" }, ...resp("") } },
      },
      "/conversations/{id}/send": { post: { summary: "Enviar mensagem pelo canal do CRM (Evolution, Meta ou Zernio)", security: seguranca, parameters: [param("id", "id da conversa", "path")], requestBody: corpo(obj({ content: str() }, ["content"])), responses: { "201": { description: "message_id e sent" }, "502": { description: "O canal não aceitou o envio" }, ...resp("") } } },
      "/conversations/{id}/handoff": { post: { summary: "Transferir para humano (pausa a IA interna)", security: seguranca, parameters: [param("id", "id da conversa", "path")], requestBody: corpo(obj({ assign_to_email: str(), reason: str() })), responses: resp("status da conversa") } },
      "/conversations/{id}/pause-ai": { post: { summary: "Pausar a IA interna nesta conversa", security: seguranca, parameters: [param("id", "id da conversa", "path")], responses: resp("status da conversa") } },
      "/conversations/{id}/resume-ai": { post: { summary: "Reativar a IA interna nesta conversa", security: seguranca, parameters: [param("id", "id da conversa", "path")], responses: resp("status da conversa") } },
      "/activities": { post: { summary: "Criar atividade (task, call, meeting, note, email)", security: seguranca, requestBody: corpo(obj({ type: str(), title: str(), body: str(), due_date: str("ISO 8601"), contact_id: str(), deal_id: str(), owner_email: str() }, ["title"])), responses: { "201": { description: "activity_id" }, ...resp("") } } },
      "/products": {
        get: { summary: "Produtos ativos", security: seguranca, parameters: [param("q", "nome ou descrição contém"), param("limit", "máximo 100")], responses: resp("Lista de produtos") },
        post: { summary: "Criar ou atualizar produto (um ou vários): acha pelo external_id e, sem ele, pelo nome", security: seguranca, requestBody: corpo(obj({ name: str(), description: str(), price: num("em reais; aceita 129,90"), currency: str("padrão BRL"), is_active: { type: "boolean" }, external_id: str("id do produto no sistema de origem, ex.: HeroSpark"), custom_fields: { type: "object" }, products: { type: "array", description: "lote de até 100 produtos com os mesmos campos", items: obj({ name: str(), description: str(), price: num(), external_id: str() }) } })), responses: { "201": { description: "product_id e created (no lote: products, created, updated)" }, "422": { description: "name ausente ou preço inválido" }, ...resp("Produto atualizado") } },
      },
      "/knowledge": { get: { summary: "Base de conhecimento da IA (FAQs, objeções, perfil do agente)", security: seguranca, responses: resp("Conhecimento") } },
    },
  };
}
