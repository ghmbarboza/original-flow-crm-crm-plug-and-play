// Semeia e limpa dados de demonstração de um org.
//
// Recebe { action: "seed" | "clear" }. Autentica o usuário pelo JWT do header
// Authorization e resolve o org_id pelo profile — o org_id NUNCA vem do body,
// sempre do usuário autenticado. Escreve com o service-role client, mas todo
// insert/delete é escopado ao org_id resolvido.
//
// Marcação: todas as linhas criadas recebem is_demo = true. O "clear" apaga só
// essas linhas (org_id + is_demo), na ordem correta de dependência.
//
// Não existe tabela `tasks` neste schema: tarefas são `activities` com
// type = 'task'. Por isso "atividades e tarefas" vivem em `activities`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Admin = ReturnType<typeof createClient>;

// ---- Dados fictícios (pt-BR) -------------------------------------------------

const COMPANIES = [
  { name: "Aurora Tecnologia", domain: "auroratech.com.br", industry: "Software", size: "51-200", website: "https://auroratech.com.br" },
  { name: "Marés Logística", domain: "mareslog.com.br", industry: "Logística", size: "201-500", website: "https://mareslog.com.br" },
  { name: "Verde Vale Agro", domain: "verdevale.agr.br", industry: "Agronegócio", size: "11-50", website: "https://verdevale.agr.br" },
  { name: "Clínica Bem Viver", domain: "bemviver.med.br", industry: "Saúde", size: "11-50", website: "https://bemviver.med.br" },
  { name: "Construtora Horizonte", domain: "horizonteconstr.com.br", industry: "Construção", size: "201-500", website: "https://horizonteconstr.com.br" },
  { name: "Doce Sabor Alimentos", domain: "docesabor.com.br", industry: "Alimentos", size: "51-200", website: "https://docesabor.com.br" },
  { name: "Nimbus Serviços Cloud", domain: "nimbuscloud.com.br", industry: "Software", size: "11-50", website: "https://nimbuscloud.com.br" },
  { name: "Bertoni Advocacia", domain: "bertoni.adv.br", industry: "Jurídico", size: "1-10", website: "https://bertoni.adv.br" },
];

// company: índice em COMPANIES a que o contato pertence.
const CONTACTS = [
  { first_name: "Mariana", last_name: "Costa", title: "Diretora de Operações", status: "customer", company: 0 },
  { first_name: "Rafael", last_name: "Almeida", title: "Gerente de TI", status: "prospect", company: 0 },
  { first_name: "Beatriz", last_name: "Souza", title: "Coordenadora de Logística", status: "customer", company: 1 },
  { first_name: "Thiago", last_name: "Fernandes", title: "Analista de Compras", status: "lead", company: 1 },
  { first_name: "Camila", last_name: "Rodrigues", title: "Proprietária", status: "prospect", company: 2 },
  { first_name: "Lucas", last_name: "Martins", title: "Gestor de Fazenda", status: "lead", company: 2 },
  { first_name: "Patrícia", last_name: "Gomes", title: "Administradora", status: "customer", company: 3 },
  { first_name: "Eduardo", last_name: "Barbosa", title: "Diretor Clínico", status: "prospect", company: 3 },
  { first_name: "Fernanda", last_name: "Lima", title: "Gerente de Obras", status: "lead", company: 4 },
  { first_name: "Gustavo", last_name: "Ribeiro", title: "Engenheiro Civil", status: "prospect", company: 4 },
  { first_name: "Juliana", last_name: "Carvalho", title: "Gerente de Produção", status: "customer", company: 5 },
  { first_name: "André", last_name: "Pereira", title: "Diretor Comercial", status: "prospect", company: 6 },
  { first_name: "Renata", last_name: "Nunes", title: "CTO", status: "lead", company: 6 },
  { first_name: "Felipe", last_name: "Cardoso", title: "Sócio", status: "customer", company: 7 },
  { first_name: "Aline", last_name: "Teixeira", title: "Advogada Associada", status: "lead", company: 7 },
];

const PRODUCTS = [
  { name: "Plano Essencial", description: "Assinatura mensal com recursos básicos de CRM.", price: 149 },
  { name: "Plano Profissional", description: "Automações, relatórios avançados e integrações.", price: 349 },
  { name: "Plano Enterprise", description: "Suporte dedicado, SLA e usuários ilimitados.", price: 899 },
  { name: "Onboarding Assistido", description: "Implantação guiada e migração de dados.", price: 1200 },
  { name: "Treinamento da Equipe", description: "Capacitação da equipe comercial em 3 sessões.", price: 600 },
];

// deals: contato/empresa por índice; valor e status. stage é distribuído em runtime.
const DEALS = [
  { title: "Implantação CRM — Aurora Tecnologia", value: 24000, contact: 0, company: 0, status: "open" },
  { title: "Renovação de contrato — Marés Logística", value: 18500, contact: 2, company: 1, status: "won" },
  { title: "Migração de sistema — Verde Vale Agro", value: 9800, contact: 4, company: 2, status: "open" },
  { title: "Módulo de agendamento — Clínica Bem Viver", value: 12500, contact: 6, company: 3, status: "open" },
  { title: "Gestão de obras — Construtora Horizonte", value: 42000, contact: 8, company: 4, status: "open" },
  { title: "Automação de produção — Doce Sabor", value: 15750, contact: 10, company: 5, status: "won" },
  { title: "Infra Cloud — Nimbus Serviços", value: 30000, contact: 11, company: 6, status: "open" },
  { title: "Suite jurídica — Bertoni Advocacia", value: 8200, contact: 13, company: 7, status: "open" },
  { title: "Expansão de licenças — Aurora Tecnologia", value: 21000, contact: 1, company: 0, status: "open" },
  { title: "Consultoria de processos — Marés Logística", value: 6400, contact: 3, company: 1, status: "lost" },
];

const FIRST_NAMES_FOR_EMAIL = (first: string, last: string) =>
  `${first}.${last}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const PHONE = (i: number) => `+55 11 9${String(80000000 + i * 137).padStart(8, "0")}`;

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

// ---- Seed --------------------------------------------------------------------

async function seed(admin: Admin, orgId: string) {
  // Idempotência: se já há contatos de demo neste org, não duplica.
  const { data: existing } = await admin
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_demo", true)
    .limit(1);
  if (existing && existing.length > 0) {
    return { skipped: true as const };
  }

  // Pipeline e stages do org (default primeiro). Deals precisam de um stage.
  const { data: pipeline } = await admin
    .from("pipelines")
    .select("id")
    .eq("org_id", orgId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let stageIds: string[] = [];
  if (pipeline?.id) {
    const { data: stages } = await admin
      .from("pipeline_stages")
      .select("id")
      .eq("org_id", orgId)
      .eq("pipeline_id", pipeline.id)
      .order("order", { ascending: true });
    stageIds = (stages ?? []).map((s) => s.id as string);
  }

  // Companies
  const { data: companyRows, error: companyErr } = await admin
    .from("companies")
    .insert(
      COMPANIES.map((c) => ({
        org_id: orgId,
        is_demo: true,
        name: c.name,
        domain: c.domain,
        industry: c.industry,
        size: c.size,
        website: c.website,
      })),
    )
    .select("id");
  if (companyErr) throw new Error(`Falha ao inserir empresas: ${companyErr.message}`);
  const companyIds = (companyRows ?? []).map((r) => r.id as string);

  // Contacts
  const { data: contactRows, error: contactErr } = await admin
    .from("contacts")
    .insert(
      CONTACTS.map((c, i) => ({
        org_id: orgId,
        is_demo: true,
        first_name: c.first_name,
        last_name: c.last_name,
        title: c.title,
        status: c.status,
        email: `${FIRST_NAMES_FOR_EMAIL(c.first_name, c.last_name)}@${COMPANIES[c.company].domain}`,
        phone: PHONE(i),
        company_id: companyIds[c.company] ?? null,
        lead_score: 10 + ((i * 7) % 80),
        source: "Demonstração",
      })),
    )
    .select("id");
  if (contactErr) throw new Error(`Falha ao inserir contatos: ${contactErr.message}`);
  const contactIds = (contactRows ?? []).map((r) => r.id as string);

  // Products
  const { error: productErr } = await admin.from("products").insert(
    PRODUCTS.map((p) => ({
      org_id: orgId,
      is_demo: true,
      name: p.name,
      description: p.description,
      price: p.price,
      is_active: true,
    })),
  );
  if (productErr) throw new Error(`Falha ao inserir produtos: ${productErr.message}`);

  // Deals — distribuídos pelos stages disponíveis.
  const { data: dealRows, error: dealErr } = await admin
    .from("deals")
    .insert(
      DEALS.map((d, i) => ({
        org_id: orgId,
        is_demo: true,
        title: d.title,
        value: d.value,
        status: d.status,
        stage_id: stageIds.length > 0 ? stageIds[i % stageIds.length] : null,
        contact_id: contactIds[d.contact] ?? null,
        company_id: companyIds[d.company] ?? null,
        probability: d.status === "won" ? 100 : d.status === "lost" ? 0 : 20 + ((i * 13) % 60),
        close_date: daysFromNow(7 + i * 3).slice(0, 10),
      })),
    )
    .select("id");
  if (dealErr) throw new Error(`Falha ao inserir negócios: ${dealErr.message}`);
  const dealIds = (dealRows ?? []).map((r) => r.id as string);

  // Activities (inclui tarefas: type = 'task').
  const activities = [
    { type: "call", title: "Ligação de qualificação", body: "Cliente demonstrou interesse no Plano Profissional.", deal: 0, contact: 0, completed: true },
    { type: "meeting", title: "Reunião de apresentação", body: "Apresentada a proposta comercial e o cronograma.", deal: 4, contact: 8, completed: true },
    { type: "email", title: "Envio de proposta", body: "Proposta enviada por email com validade de 15 dias.", deal: 6, contact: 11, completed: true },
    { type: "note", title: "Anotação de contexto", body: "Decisor pediu para retomar após reunião de diretoria.", deal: 2, contact: 4, completed: true },
    { type: "task", title: "Enviar contrato para assinatura", body: "Gerar contrato e encaminhar via assinatura digital.", deal: 1, contact: 2, completed: false, due: 2 },
    { type: "task", title: "Follow-up de proposta", body: "Confirmar recebimento e tirar dúvidas da proposta.", deal: 6, contact: 11, completed: false, due: 4 },
    { type: "task", title: "Agendar demonstração técnica", body: "Marcar demo com a equipe de TI do cliente.", deal: 0, contact: 1, completed: false, due: 1 },
  ];
  const { error: activityErr } = await admin.from("activities").insert(
    activities.map((a) => ({
      org_id: orgId,
      is_demo: true,
      type: a.type,
      title: a.title,
      body: a.body,
      deal_id: dealIds[a.deal] ?? null,
      contact_id: contactIds[a.contact] ?? null,
      due_date: a.completed ? null : daysFromNow(a.due ?? 3),
      completed_at: a.completed ? daysFromNow(-2) : null,
    })),
  );
  if (activityErr) throw new Error(`Falha ao inserir atividades: ${activityErr.message}`);

  // Conversas multicanal (WhatsApp via Evolution; demais canais via Zernio) + mensagens.
  const wphone = (i: number) => `5511${String(90000000 + i * 271).padStart(8, "0")}`;
  const CONVERSATIONS = [
    { contact: 0, deal: 0, channel: "whatsapp", status: "ai_active", preview: "Perfeito, aguardo a proposta!", unread: 2 },
    { contact: 8, deal: 4, channel: "instagram", status: "human_takeover", preview: "Podemos falar amanhã às 10h?", unread: 0 },
    { contact: 11, deal: 6, channel: "telegram", status: "ai_active", preview: "Qual o prazo de implantação?", unread: 1 },
    { contact: 2, deal: 1, channel: "whatsapp", status: "closed", preview: "Contrato assinado, obrigado!", unread: 0 },
    { contact: 4, deal: 2, channel: "facebook", status: "ai_active", preview: "Recebi, muito obrigada!", unread: 1 },
  ];
  const { data: convRows, error: convErr } = await admin
    .from("conversations")
    .insert(
      CONVERSATIONS.map((c, i) => {
        const isWa = c.channel === "whatsapp";
        const ct = CONTACTS[c.contact];
        const identifier = isWa ? wphone(i) : `${c.channel.slice(0, 2)}:${900100 + i}`;
        return {
          org_id: orgId,
          is_demo: true,
          contact_id: contactIds[c.contact] ?? null,
          deal_id: dealIds[c.deal] ?? null,
          phone_number: identifier,
          channel: c.channel,
          channel_contact_id: isWa ? null : identifier,
          channel_contact_name: isWa ? null : `${ct.first_name} ${ct.last_name}`,
          provider: isWa ? "evolution" : "zernio",
          status: c.status,
          last_message_at: daysFromNow(-i - 1),
          last_message_preview: c.preview,
          unread_count: c.unread,
        };
      }),
    )
    .select("id");
  if (convErr) throw new Error(`Falha ao inserir conversas: ${convErr.message}`);
  const convIds = (convRows ?? []).map((r) => r.id as string);

  // Mensagens: par cliente→nós por conversa (a última bate com o preview).
  const messages = convIds.flatMap((convId, i) => [
    {
      org_id: orgId, is_demo: true, conversation_id: convId,
      direction: "inbound", type: "text",
      content: "Olá! Gostaria de saber mais sobre a solução.",
      is_from_ai: false, is_internal_note: false, status: "received",
      sent_at: daysFromNow(-i - 1),
    },
    {
      org_id: orgId, is_demo: true, conversation_id: convId,
      direction: "outbound", type: "text",
      content: CONVERSATIONS[i].preview,
      is_from_ai: CONVERSATIONS[i].status === "ai_active",
      is_internal_note: false, status: "sent",
      sent_at: daysFromNow(-i - 0.5),
    },
  ]);
  const { error: msgErr } = await admin.from("conversation_messages").insert(messages);
  if (msgErr) throw new Error(`Falha ao inserir mensagens: ${msgErr.message}`);

  // Emails vinculados a contatos/negócios.
  const emailAddr = (ci: number) =>
    `${FIRST_NAMES_FOR_EMAIL(CONTACTS[ci].first_name, CONTACTS[ci].last_name)}@${COMPANIES[CONTACTS[ci].company].domain}`;
  const EMAILS = [
    { contact: 0, deal: 0, direction: "outbound", status: "sent", opens: 3, subject: "Proposta comercial — Aurora Tecnologia", body: "<p>Olá Mariana, segue nossa proposta do Plano Profissional. Fico à disposição.</p>" },
    { contact: 8, deal: 4, direction: "outbound", status: "sent", opens: 1, subject: "Cronograma da obra — Construtora Horizonte", body: "<p>Fernanda, segue o cronograma da implantação de gestão de obras.</p>" },
    { contact: 11, deal: 6, direction: "inbound", status: "received", opens: 0, subject: "Dúvida sobre infraestrutura cloud", body: "<p>Poderiam detalhar o SLA do ambiente cloud?</p>" },
    { contact: 2, deal: 1, direction: "outbound", status: "sent", opens: 2, subject: "Contrato assinado — Marés Logística", body: "<p>Beatriz, recebemos o contrato assinado. Sejam bem-vindos!</p>" },
  ];
  const { error: emailErr } = await admin.from("emails").insert(
    EMAILS.map((e, i) => ({
      org_id: orgId, is_demo: true,
      contact_id: contactIds[e.contact] ?? null,
      deal_id: dealIds[e.deal] ?? null,
      direction: e.direction,
      subject: e.subject,
      body_html: e.body,
      from_email: e.direction === "outbound" ? "comercial@viverdeia.ai" : emailAddr(e.contact),
      to_emails: e.direction === "outbound" ? [emailAddr(e.contact)] : ["comercial@viverdeia.ai"],
      status: e.status,
      open_count: e.opens,
      sent_at: daysFromNow(-i - 1),
    })),
  );
  if (emailErr) throw new Error(`Falha ao inserir emails: ${emailErr.message}`);

  // Metas de vendas do mês corrente (progresso é calculado ao vivo pelos deals ganhos).
  const now = new Date();
  const { error: goalErr } = await admin.from("sales_goals").insert([
    { org_id: orgId, is_demo: true, goal_type: "revenue", target_value: 100000, current_value: 0, period_month: now.getUTCMonth() + 1, period_year: now.getUTCFullYear(), assign_type: "team", user_id: null, team_id: null },
    { org_id: orgId, is_demo: true, goal_type: "deals", target_value: 10, current_value: 0, period_month: now.getUTCMonth() + 1, period_year: now.getUTCFullYear(), assign_type: "team", user_id: null, team_id: null },
  ]);
  if (goalErr) throw new Error(`Falha ao inserir metas: ${goalErr.message}`);

  // Histórico de lead scoring para alguns contatos.
  const SCORES = [
    { contact: 0, points: 15, reason: "Abriu email de proposta" },
    { contact: 0, points: 10, reason: "Respondeu no WhatsApp" },
    { contact: 8, points: 20, reason: "Participou de reunião" },
    { contact: 11, points: 5, reason: "Visitou a página de preços" },
    { contact: 2, points: 25, reason: "Negócio ganho" },
  ];
  const { error: scoreErr } = await admin.from("lead_score_history").insert(
    SCORES.map((s) => ({
      org_id: orgId, is_demo: true,
      contact_id: contactIds[s.contact],
      points: s.points, reason: s.reason,
    })),
  );
  if (scoreErr) throw new Error(`Falha ao inserir histórico de lead scoring: ${scoreErr.message}`);

  return {
    skipped: false as const,
    counts: {
      companies: companyIds.length,
      contacts: contactIds.length,
      products: PRODUCTS.length,
      deals: dealIds.length,
      activities: activities.length,
      conversations: convIds.length,
      messages: messages.length,
      emails: EMAILS.length,
      sales_goals: 2,
      lead_score_history: SCORES.length,
    },
  };
}

// ---- Clear -------------------------------------------------------------------

async function clear(admin: Admin, orgId: string) {
  // Ordem de dependência: filhos antes dos pais. Conversas/emails/scores
  // referenciam contatos/deals, então saem antes deles; mensagens antes das conversas.
  const order: Array<{ table: string; key: keyof typeof counts }> = [
    { table: "conversation_messages", key: "messages" },
    { table: "conversations", key: "conversations" },
    { table: "emails", key: "emails" },
    { table: "lead_score_history", key: "lead_score_history" },
    { table: "sales_goals", key: "sales_goals" },
    { table: "activities", key: "activities" },
    { table: "deals", key: "deals" },
    { table: "contacts", key: "contacts" },
    { table: "companies", key: "companies" },
    { table: "products", key: "products" },
  ];
  const counts = {
    messages: 0, conversations: 0, emails: 0, lead_score_history: 0, sales_goals: 0,
    activities: 0, deals: 0, contacts: 0, companies: 0, products: 0,
  };

  for (const { table, key } of order) {
    const { data, error } = await admin
      .from(table)
      .delete()
      .eq("org_id", orgId)
      .eq("is_demo", true)
      .select("id");
    if (error) throw new Error(`Falha ao limpar ${table}: ${error.message}`);
    counts[key] = (data ?? []).length;
  }

  return { counts };
}

// ---- Handler -----------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    const { data: userData } = authHeader
      ? await admin.auth.getUser(authHeader.replace("Bearer ", ""))
      : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = profile?.org_id as string | undefined;
    if (!orgId) return json({ error: "Organização não encontrada" }, 400);

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "seed") {
      const result = await seed(admin, orgId);
      if (result.skipped) {
        return json({ ok: true, action, skipped: true });
      }
      return json({ ok: true, action, counts: result.counts });
    }

    if (action === "clear") {
      const result = await clear(admin, orgId);
      return json({ ok: true, action, counts: result.counts });
    }

    return json({ error: "Ação inválida. Use 'seed' ou 'clear'." }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
