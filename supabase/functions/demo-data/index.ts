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
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  gerarAudioDaResposta, resolverChaveElevenLabs, salvarAudioNoBucket,
} from "../_shared/audio.ts";

/** Voz padrão do ElevenLabs (Sarah) para o áudio da conversa demo. */
const VOZ_DEMO = "EXAVITQu4vr4xnSDxMaL";
/** Transcrição fictícia do áudio inbound da demo. */
const TRANSCRICAO_DEMO =
  "Oi, tudo bem? Vi a proposta que vocês mandaram e gostei bastante. Só queria entender melhor o prazo de implantação antes de fechar.";

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

// `ReturnType<typeof createClient>` resolve os genéricos como `never` e recusa o
// cliente real (`SupabaseClient<any, "public", any>`) no `deno check`. Tipar pela
// instância evita isso.
type Admin = SupabaseClient;

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

  // Mensagem de ÁUDIO na primeira conversa: é o único jeito de mostrar o player
  // e a transcrição sem depender de um cliente real mandar um voice note.
  //
  // Sem chave do ElevenLabs o áudio não é gerado, e a mensagem entra SEM
  // media_url — a UI então mostra "Áudio indisponível" com a transcrição ao
  // lado. Preferimos isso a não semear nada: a transcrição é o que a IA
  // realmente consome, e ela continua visível.
  let audioDemo = false;
  if (convIds[0]) {
    const chave = await resolverChaveElevenLabs(admin, orgId);
    let path: string | null = null;
    if (chave) {
      const bytes = await gerarAudioDaResposta(TRANSCRICAO_DEMO, VOZ_DEMO, chave);
      if (bytes) {
        path = await salvarAudioNoBucket(
          admin, orgId, convIds[0], bytes, "demo-inbound.mp3", "audio/mpeg",
        );
      }
    }
    const { error: audioErr } = await admin.from("conversation_messages").insert({
      org_id: orgId, is_demo: true, conversation_id: convIds[0],
      direction: "inbound", type: "audio",
      content: TRANSCRICAO_DEMO,
      media_url: path,
      media_type: path ? "audio/mpeg" : null,
      is_from_ai: false, is_internal_note: false, status: "received",
      sent_at: daysFromNow(-0.4),
    });
    if (audioErr) throw new Error(`Falha ao inserir mensagem de áudio: ${audioErr.message}`);
    audioDemo = true;
  }

  // ---- Módulos recentes ------------------------------------------------------
  // Regra da demo: nada aqui pode DISPARAR nada. Follow-up, automações e NPS
  // entram com is_active = false; quem quiser ver rodando ativa manualmente.

  // Respostas rápidas (atalhos do Inbox).
  const QUICK_REPLIES = [
    { shortcut: "/oi", title: "Saudação", category: "Abertura", message: "Olá! Sou do time comercial. Como posso ajudar você hoje?" },
    { shortcut: "/preco", title: "Tabela de preços", category: "Comercial", message: "Nossos planos começam em R$ 149/mês. Posso te enviar a comparação completa?" },
    { shortcut: "/prazo", title: "Prazo de implantação", category: "Comercial", message: "A implantação leva de 7 a 15 dias, dependendo do volume de dados a migrar." },
    { shortcut: "/reuniao", title: "Convite de reunião", category: "Agenda", message: "Consigo te mostrar em 20 minutos de call. Prefere amanhã de manhã ou à tarde?" },
    { shortcut: "/obrigado", title: "Encerramento", category: "Fechamento", message: "Obrigado pelo contato! Qualquer dúvida, é só chamar por aqui." },
  ];
  const { error: qrErr } = await admin.from("quick_replies").insert(
    QUICK_REPLIES.map((q) => ({ org_id: orgId, is_demo: true, is_active: true, ...q })),
  );
  if (qrErr) throw new Error(`Falha ao inserir respostas rápidas: ${qrErr.message}`);

  // Follow-up: config é única por org. Só cria se o org ainda não tem uma —
  // sobrescrever a config real do cliente seria destrutivo.
  const { data: fuExistente } = await admin
    .from("followup_configs").select("id").eq("org_id", orgId).maybeSingle();
  let followupSteps = 0;
  if (!fuExistente?.id) {
    const { error: fuErr } = await admin.from("followup_configs").insert({
      org_id: orgId, is_demo: true, is_active: false,
      max_attempts: 3, on_limit_reached: "notify_agent",
    });
    if (fuErr) throw new Error(`Falha ao inserir configuração de follow-up: ${fuErr.message}`);

    const FU_STEPS = [
      { order: 1, delay_hours: 24, message_template: "Oi {{primeiro_nome}}! Passando para saber se você conseguiu ver a proposta." },
      { order: 2, delay_hours: 72, message_template: "{{primeiro_nome}}, ficou alguma dúvida sobre os valores? Consigo ajustar o escopo se precisar." },
      { order: 3, delay_hours: 168, message_template: "Vou deixar o assunto em pausa por aqui, mas seguimos à disposição quando fizer sentido retomar." },
    ];
    const { error: fsErr } = await admin.from("followup_steps").insert(
      FU_STEPS.map((s) => ({ org_id: orgId, is_demo: true, ...s })),
    );
    if (fsErr) throw new Error(`Falha ao inserir etapas de follow-up: ${fsErr.message}`);
    followupSteps = FU_STEPS.length;
  }

  // Automações — pausadas.
  const AUTOMATIONS = [
    {
      name: "Tarefa ao criar contato",
      description: "Cria uma tarefa de primeiro contato assim que um lead entra.",
      trigger: { type: "contact_created" },
      conditions: [],
      actions: [{ type: "create_task", title: "Fazer primeiro contato", delay_hours: 2 }],
    },
    {
      name: "Aviso de negócio parado",
      description: "Notifica o responsável quando o negócio muda de etapa.",
      trigger: { type: "deal_stage_changed" },
      conditions: [],
      actions: [{ type: "notify_owner", message: "O negócio avançou de etapa — confirme os próximos passos." }],
    },
    {
      name: "Boas-vindas no WhatsApp",
      description: "Manda uma saudação quando o cliente escreve pela primeira vez.",
      trigger: { type: "message_received" },
      conditions: [],
      actions: [{ type: "send_whatsapp", message: "Olá! Recebemos sua mensagem e já estamos vendo por aqui." }],
    },
  ];
  const { error: autoErr } = await admin.from("automations").insert(
    AUTOMATIONS.map((a) => ({ org_id: orgId, is_demo: true, is_active: false, ...a })),
  );
  if (autoErr) throw new Error(`Falha ao inserir automações: ${autoErr.message}`);

  // NPS: config única por org, mesma regra do follow-up. As respostas são
  // semeadas de todo jeito — são o que alimenta o relatório na tela.
  const { data: npsExistente } = await admin
    .from("nps_configs").select("id").eq("org_id", orgId).maybeSingle();
  if (!npsExistente?.id) {
    const { error: npsCfgErr } = await admin.from("nps_configs").insert({
      org_id: orgId, is_demo: true, is_active: false,
      delay_minutes: 60,
      active_channels: ["whatsapp"],
      message: "De 0 a 10, quanto você recomendaria nosso atendimento para um amigo?",
      thank_you_message: "Obrigado pela nota! Seu retorno ajuda a melhorar o atendimento.",
    });
    if (npsCfgErr) throw new Error(`Falha ao inserir configuração de NPS: ${npsCfgErr.message}`);
  }

  const NPS = [
    { conv: 3, contact: 2, score: 10, comment: "Atendimento rápido e sem enrolação." },
    { conv: 0, contact: 0, score: 9, comment: "Muito bom, só o prazo que poderia ser menor." },
    { conv: 1, contact: 8, score: 7, comment: "Resolveram, mas demorou para responder." },
    { conv: 2, contact: 11, score: 5, comment: "Faltou clareza na explicação do contrato." },
    { conv: 4, contact: 4, score: 9, comment: null },
  ].filter((n) => !!convIds[n.conv]);
  const { error: npsErr } = await admin.from("nps_responses").insert(
    NPS.map((n, i) => ({
      org_id: orgId, is_demo: true,
      conversation_id: convIds[n.conv],
      contact_id: contactIds[n.contact] ?? null,
      channel: CONVERSATIONS[n.conv].channel,
      score: n.score,
      comment: n.comment,
      sent_at: daysFromNow(-i - 2),
      responded_at: daysFromNow(-i - 1.5),
    })),
  );
  if (npsErr) throw new Error(`Falha ao inserir respostas de NPS: ${npsErr.message}`);

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
      messages: messages.length + (audioDemo ? 1 : 0),
      quick_replies: QUICK_REPLIES.length,
      followup_steps: followupSteps,
      automations: AUTOMATIONS.length,
      nps_responses: NPS.length,
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
    { table: "nps_responses", key: "nps_responses" },
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
    { table: "quick_replies", key: "quick_replies" },
    { table: "followup_steps", key: "followup_steps" },
    { table: "followup_configs", key: "followup_configs" },
    { table: "automations", key: "automations" },
    { table: "nps_configs", key: "nps_configs" },
  ];
  const counts = {
    messages: 0, conversations: 0, emails: 0, lead_score_history: 0, sales_goals: 0,
    activities: 0, deals: 0, contacts: 0, companies: 0, products: 0,
    quick_replies: 0, followup_steps: 0, followup_configs: 0, automations: 0,
    nps_configs: 0, nps_responses: 0,
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

  // Áudios da demo no bucket: as linhas já saíram, os arquivos ficariam órfãos.
  // Cada conversa demo tem sua pasta sob {org}/audio/{conversation_id}, e os ids
  // já não existem mais — então varremos o que sobrou de mp3 de demo por nome.
  try {
    const { data: pastas } = await admin.storage.from("whatsapp-media").list(`${orgId}/audio`);
    for (const pasta of pastas ?? []) {
      const prefixo = `${orgId}/audio/${pasta.name}`;
      const { data: arquivos } = await admin.storage.from("whatsapp-media").list(prefixo);
      const demo = (arquivos ?? [])
        .filter((a) => a.name.startsWith("demo-"))
        .map((a) => `${prefixo}/${a.name}`);
      if (demo.length > 0) await admin.storage.from("whatsapp-media").remove(demo);
    }
  } catch (err) {
    // Arquivo órfão não impede a limpeza dos dados: registra e segue.
    console.error("[demo-data] falha ao limpar áudios do bucket:", err);
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
