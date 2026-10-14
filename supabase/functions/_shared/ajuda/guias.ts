/**
 * Conteúdo da Central de ajuda: guias por área, na mesma ordem de capítulos das
 * Configurações. Cada passo pode levar direto à tela certa. Texto em pt-BR, sem
 * jargão técnico; nomes de telas iguais aos do menu.
 */

export type Capitulo = "Primeiros passos" | "Atendimento" | "Inteligência" | "Vendas" | "Captação" | "Automação" | "Análise" | "Conta e conexões";

export interface Link {
  to: string;
  rotulo: string;
}

export interface Passo {
  texto: string;
  link?: Link;
}

export interface Guia {
  id: string;
  capitulo: Capitulo;
  titulo: string;
  resumo: string;
  paraQue: string;
  passos: Passo[];
  dicas?: string[];
  onde: Link;
  /** Palavras extras para a busca (sinônimos que o usuário digita). */
  palavras?: string;
  admin?: boolean;
}

export const CAPITULOS: Capitulo[] = ["Primeiros passos", "Atendimento", "Inteligência", "Vendas", "Captação", "Automação", "Análise", "Conta e conexões"];

export const GUIAS: Guia[] = [
  // Primeiros passos -------------------------------------------------------
  {
    id: "visao-geral",
    capitulo: "Primeiros passos",
    titulo: "Como a plataforma funciona",
    resumo: "O caminho de um lead: chega por um canal, a IA atende, vira negócio no funil e as automações cuidam do resto.",
    paraQue: "Entender o todo antes de configurar os detalhes.",
    passos: [
      { texto: "O cliente chega por WhatsApp, e-mail, formulário, ligação ou importação, e vira um contato.", link: { to: "/contacts", rotulo: "Contatos" } },
      { texto: "A IA atende no seu nome, com a personalidade e a base de conhecimento que você definiu.", link: { to: "/settings/ia", rotulo: "Configurações > IA" } },
      { texto: "Toda conversa nova abre um negócio na primeira etapa do funil. A IA pode mover o negócio conforme a conversa avança.", link: { to: "/deals", rotulo: "Negócios" } },
      { texto: "Reuniões, tarefas e ligações ficam registradas na ficha do contato, com o que a IA aprendeu sobre ele." },
      { texto: "Automações e cadências fazem o acompanhamento sozinhas.", link: { to: "/settings/automations", rotulo: "Automações" } },
      { texto: "Painel, relatórios e metas mostram o resultado.", link: { to: "/dashboard", rotulo: "Dashboard" } },
    ],
    onde: { to: "/dashboard", rotulo: "Abrir o Dashboard" },
    palavras: "começar início tour onboarding",
  },
  {
    id: "onboarding",
    capitulo: "Primeiros passos",
    titulo: "Refazer o onboarding e ver dados de exemplo",
    resumo: "O assistente inicial deixa empresa, IA, funil e canal prontos. Dá para refazer quando quiser.",
    paraQue: "Recomeçar a configuração com calma ou mostrar a plataforma funcionando antes de usar com clientes reais.",
    passos: [
      { texto: "Abra Configurações > Primeiros passos.", link: { to: "/settings/inicio", rotulo: "Primeiros passos" } },
      { texto: "Em Refazer o onboarding, o assistente reabre já preenchido com os dados atuais. Nada é apagado." },
      { texto: "Em Dados de demonstração, carregue contatos, negócios, atividades e produtos fictícios. Eles ficam marcados e saem com um clique." },
    ],
    onde: { to: "/settings/inicio", rotulo: "Abrir Primeiros passos" },
    palavras: "demo demonstração exemplo assistente wizard",
    admin: true,
  },

  // Atendimento -----------------------------------------------------------
  {
    id: "whatsapp",
    capitulo: "Atendimento",
    titulo: "Conectar o WhatsApp e atender",
    resumo: "Um número por empresa, pela API oficial da Meta, pelo Zernio ou pelo Evolution.",
    paraQue: "Sem canal conectado, nenhuma mensagem entra nem sai e a IA não atende.",
    passos: [
      { texto: "Abra WhatsApp no menu. Sem canal conectado, o assistente de conexão aparece.", link: { to: "/whatsapp", rotulo: "WhatsApp" } },
      { texto: "Escolha o provedor: Meta (API oficial, templates aprovados), Zernio ou Evolution (QR code, sem templates)." },
      { texto: "Conectado, as conversas aparecem na caixa de entrada. Clique numa conversa para responder, transferir ou assumir no lugar da IA." },
      { texto: "O Modo foco esconde o que não é conversa para atender mais rápido." },
    ],
    dicas: [
      "Abordagem ativa (mandar a primeira mensagem) pelo Evolution tem risco alto de bloqueio do número. Para disparo, use a API oficial.",
      "A distribuição de conversas entre a equipe fica em Configurações > Integrações > Canais.",
    ],
    onde: { to: "/whatsapp", rotulo: "Abrir o WhatsApp" },
    palavras: "meta evolution zernio qr code canal número conversa inbox atendimento",
  },
  {
    id: "respostas-rapidas",
    capitulo: "Atendimento",
    titulo: "Respostas rápidas, SLA e NPS",
    resumo: "Mensagens prontas a um / de distância, prazo de resposta e pesquisa de satisfação.",
    paraQue: "Padronizar o atendimento humano e medir a qualidade.",
    passos: [
      { texto: "Abra Configurações > Respostas rápidas.", link: { to: "/settings/atendimento", rotulo: "Respostas rápidas" } },
      { texto: "Cadastre atalhos. No chat, digite / e escolha a resposta." },
      { texto: "Ative o SLA para ver quem está esperando demais e o NPS para perguntar a nota ao encerrar a conversa." },
    ],
    onde: { to: "/settings/atendimento", rotulo: "Abrir Respostas rápidas" },
    palavras: "atalho modelo mensagem pronta sla nps satisfação",
  },
  {
    id: "email",
    capitulo: "Atendimento",
    titulo: "E-mail: Gmail e Resend",
    resumo: "Gmail traz suas conversas para o CRM. Resend envia em nome da empresa, de um domínio seu.",
    paraQue: "Ter os e-mails no histórico do contato e mandar notificações e sequências com a marca da empresa.",
    passos: [
      { texto: "Em Configurações > Integrações, card E-mail, cadastre as credenciais do Google e clique em Conectar conta do Gmail.", link: { to: "/settings/integrations?integration=gmail", rotulo: "Card E-mail" } },
      { texto: "No mesmo card, salve a chave do Resend para e-mails em nome da empresa." },
      { texto: "Em Configurações > E-mail, escolha por onde sai, defina o remetente, verifique o domínio e mande um teste para você.", link: { to: "/settings/email", rotulo: "Configurações > E-mail" } },
      { texto: "As conversas de e-mail ficam em Email, no menu.", link: { to: "/inbox", rotulo: "Email" } },
    ],
    onde: { to: "/settings/integrations?integration=gmail", rotulo: "Conectar e-mail" },
    palavras: "gmail google resend domínio remetente smtp",
    admin: true,
  },
  {
    id: "voz",
    capitulo: "Atendimento",
    titulo: "Voz: áudio no WhatsApp e ligações por telefone",
    resumo: "A mesma agente responde em áudio e atende ou faz ligações, com transcrição e resumo na ficha.",
    paraQue: "Atender quem prefere falar e fazer ligações de qualificação e lembrete sem ocupar a equipe.",
    passos: [
      { texto: "Cadastre a chave do ElevenLabs em Integrações. Para responder em áudio no WhatsApp, ligue a Voz da agente em Configurações > IA.", link: { to: "/settings/integrations?integration=elevenlabs", rotulo: "Card ElevenLabs" } },
      { texto: "Para ligações, cadastre o Account SID e o Auth Token do Twilio no card Twilio.", link: { to: "/settings/integrations?integration=twilio", rotulo: "Card Twilio" } },
      { texto: "Abra Voz no menu e importe um número que você já tem no Twilio ou compre um novo. O agente de voz é conectado sozinho.", link: { to: "/voz", rotulo: "Voz" } },
      { texto: "Em Voz > Ligações, escolha um contato e clique em Ligar pela IA. A ligação aparece ao vivo e depois vira transcrição, resumo e classificação." },
      { texto: "Em Voz > Campanhas, um administrador liga para uma lista de contatos, com limite de ligações simultâneas." },
    ],
    dicas: ["Número brasileiro no Twilio exige cadastro regulatório. Conta de teste do Twilio só liga para números verificados."],
    onde: { to: "/voz", rotulo: "Abrir Voz" },
    palavras: "elevenlabs twilio telefone ligar ligação chamada áudio campanha discador",
  },

  // Inteligência ------------------------------------------------------------
  {
    id: "ia-perfil",
    capitulo: "Inteligência",
    titulo: "Personalidade e comportamento da IA",
    resumo: "Nome, tom, objetivo e as regras de como a agente conversa.",
    paraQue: "Fazer a IA soar como a sua equipe e saber quando passar para um humano.",
    passos: [
      { texto: "Abra Configurações > IA, aba Personalidade.", link: { to: "/settings/ia", rotulo: "Configurações > IA" } },
      { texto: "Defina nome, tom e objetivo. O prompt é gerado a partir do que você contou sobre a empresa, e pode ser editado." },
      { texto: "Na aba Comportamento, ajuste horário de atendimento, atraso de resposta e mensagem de transferência para humano." },
      { texto: "A aba Versões guarda o histórico do prompt para voltar atrás." },
    ],
    onde: { to: "/settings/ia", rotulo: "Abrir Configurações > IA" },
    palavras: "prompt agente tom horário ligar desligar ia",
    admin: true,
  },
  {
    id: "conhecimento",
    capitulo: "Inteligência",
    titulo: "Base de conhecimento da IA",
    resumo: "Documentos, fatos canônicos, FAQs e objeções. A IA consulta antes de responder e não inventa.",
    paraQue: "Respostas corretas sobre preço, prazo, política e produto, sempre iguais.",
    passos: [
      { texto: "Abra Configurações > IA, aba Conhecimento.", link: { to: "/settings/ia?aba=knowledge", rotulo: "Conhecimento" } },
      { texto: "Em Fatos, cadastre o que nunca pode mudar: preço, prazo, endereço, link. Fatos curtos e exatos, até 2.000 caracteres." },
      { texto: "Em Documentos, suba PDF, Word ou texto. O conteúdo vira trechos pesquisáveis." },
      { texto: "Em Testar busca, pergunte como o cliente perguntaria e veja o que a IA encontra." },
      { texto: "Em Pendências, responda o que a IA não soube. A resposta passa a valer para todos." },
    ],
    dicas: ["Quando a IA promete confirmar com a equipe, a pergunta vira pendência automaticamente."],
    onde: { to: "/settings/ia?aba=knowledge", rotulo: "Abrir Conhecimento" },
    palavras: "rag documento pdf fato faq objeção pendência dúvida treinar ensinar",
    admin: true,
  },
  {
    id: "ia-origens",
    capitulo: "Inteligência",
    titulo: "Perfis da IA por origem do lead",
    resumo: "Um jeito de atender para cada origem: anúncio, site, indicação, formulário.",
    paraQue: "Quem veio de um anúncio de promoção não deve ser atendido igual a quem pediu orçamento no site.",
    passos: [
      { texto: "Abra Configurações > IA, aba Por origem.", link: { to: "/settings/ia?aba=origens", rotulo: "Por origem" } },
      { texto: "Crie um perfil, escolha a origem (UTM ou fonte) e escreva as instruções extras e a etapa inicial do funil." },
    ],
    onde: { to: "/settings/ia?aba=origens", rotulo: "Abrir Por origem" },
    palavras: "utm anúncio campanha origem fonte perfil",
    admin: true,
  },
  {
    id: "memoria",
    capitulo: "Inteligência",
    titulo: "O que a IA sabe sobre cada lead",
    resumo: "Depois das conversas e ligações, a IA anota empresa, cargo, orçamento, prazo, dores e interesses.",
    paraQue: "Ter a qualificação (BANT) pronta na ficha sem ninguém digitar.",
    passos: [
      { texto: "Abra a ficha de um contato. O card O que a IA sabe mostra cada campo e se é inferido ou confirmado.", link: { to: "/contacts", rotulo: "Contatos" } },
      { texto: "Confirme o que estiver certo. Campo confirmado pela equipe a IA não sobrescreve." },
      { texto: "A frequência da análise e os critérios de mudança de etapa ficam em Configurações > IA > Análises.", link: { to: "/settings/ia?aba=analises", rotulo: "Análises" } },
    ],
    onde: { to: "/settings/ia?aba=analises", rotulo: "Abrir Análises" },
    palavras: "bant qualificação memória análise pontuação score inferido confirmado",
  },
  {
    id: "agenda",
    capitulo: "Inteligência",
    titulo: "Agenda: a IA marca reuniões",
    resumo: "Calendário conectado, política de horários, lembrete automático e aviso de não comparecimento.",
    paraQue: "Marcar reuniões pelo WhatsApp ou por telefone sem conflito de horário e sem esquecer ninguém.",
    passos: [
      { texto: "Um administrador cadastra as credenciais do Nylas em Integrações.", link: { to: "/settings/integrations?integration=nylas", rotulo: "Card Nylas" } },
      { texto: "Cada pessoa conecta o próprio Google Calendar ou Outlook em Configurações > Agenda.", link: { to: "/settings/agenda", rotulo: "Configurações > Agenda" } },
      { texto: "Na mesma tela, defina dias, horários, antecedência, dono padrão, e ligue a IA. Ela só marca depois que o cliente confirma por escrito." },
      { texto: "Edite o texto do lembrete e do aviso de não comparecimento." },
      { texto: "As reuniões ficam em Agenda, no menu, por semana.", link: { to: "/agenda", rotulo: "Agenda" } },
    ],
    onde: { to: "/agenda", rotulo: "Abrir a Agenda" },
    palavras: "reunião calendário google outlook nylas lembrete no-show horário cal.com",
  },

  // Vendas ---------------------------------------------------------------
  {
    id: "funil",
    capitulo: "Vendas",
    titulo: "Funil, etapas e negócios",
    resumo: "Kanban de negócios por etapa, com valor, produtos, qualificação e histórico.",
    paraQue: "Ver onde cada oportunidade está e o que precisa acontecer para avançar.",
    passos: [
      { texto: "Abra Negócios. Arraste o card entre as colunas ou abra o negócio para mudar a etapa.", link: { to: "/deals", rotulo: "Negócios" } },
      { texto: "Na ficha do negócio, adicione Produtos/Serviços, preencha a qualificação e registre atividades." },
      { texto: "As etapas, a probabilidade de fechamento e a mensagem automática de cada etapa ficam em Configurações > Automações > Funil.", link: { to: "/settings/automations?secao=funil", rotulo: "Funil" } },
    ],
    dicas: ["Regra da casa: um negócio aberto por contato. Conversa nova de quem já tem negócio aberto continua no mesmo."],
    onde: { to: "/deals", rotulo: "Abrir Negócios" },
    palavras: "pipeline kanban etapa oportunidade deal venda ganho perdido",
  },
  {
    id: "contatos",
    capitulo: "Vendas",
    titulo: "Contatos e empresas",
    resumo: "A pessoa com quem você fala e a empresa dela, com toda a timeline.",
    paraQue: "Ter num lugar só conversas, e-mails, ligações, reuniões, negócios e o que a IA sabe.",
    passos: [
      { texto: "Abra Contatos para buscar, filtrar e criar.", link: { to: "/contacts", rotulo: "Contatos" } },
      { texto: "Clique num contato e em Ver ficha para ver a timeline completa." },
      { texto: "Empresas agrupam os contatos e negócios da mesma organização.", link: { to: "/companies", rotulo: "Empresas" } },
    ],
    onde: { to: "/contacts", rotulo: "Abrir Contatos" },
    palavras: "lead cliente pessoa empresa ficha timeline histórico",
  },
  {
    id: "produtos",
    capitulo: "Vendas",
    titulo: "Produtos/Serviços",
    resumo: "Produtos, serviços e assinaturas com preço, cobrança e estoque.",
    paraQue: "Montar o valor dos negócios e deixar a IA responder sobre preço e disponibilidade.",
    passos: [
      { texto: "Abra Produtos/Serviços e cadastre cada item com tipo, preço e forma de cobrança.", link: { to: "/products", rotulo: "Produtos/Serviços" } },
      { texto: "Na ficha do negócio, adicione os itens com quantidade e desconto." },
      { texto: "Com controle de estoque ligado, a IA não promete item esgotado e avisa quando está baixo." },
    ],
    onde: { to: "/products", rotulo: "Abrir Produtos/Serviços" },
    palavras: "produto serviço preço catálogo assinatura estoque",
  },
  {
    id: "tarefas",
    capitulo: "Vendas",
    titulo: "Tarefas e atividades",
    resumo: "Ligações, reuniões, e-mails, notas e tarefas numa lista só, com responsável e prazo.",
    paraQue: "Não deixar nenhum retorno para trás.",
    passos: [
      { texto: "Abra Tarefas. Filtre por tipo, responsável e prazo.", link: { to: "/tasks", rotulo: "Tarefas" } },
      { texto: "Crie uma tarefa ligada a um contato ou negócio. Quem recebe é avisado." },
    ],
    onde: { to: "/tasks", rotulo: "Abrir Tarefas" },
    palavras: "tarefa atividade follow-up retorno prazo lembrete",
  },

  // Captação --------------------------------------------------------------
  {
    id: "formularios",
    capitulo: "Captação",
    titulo: "Formulários de captura",
    resumo: "Página própria ou embed no site, com origem por UTM e campos condicionais.",
    paraQue: "Transformar visitante do site ou do anúncio em contato e negócio sem digitação.",
    passos: [
      { texto: "Abra Configurações > Formulários e crie um formulário.", link: { to: "/settings/capture", rotulo: "Formulários" } },
      { texto: "Monte os campos. Um campo pode aparecer só quando outro tem certo valor." },
      { texto: "Escolha o funil e a etapa de destino e, se quiser, uma automação." },
      { texto: "Compartilhe o link público ou copie o código de embed para o site." },
    ],
    onde: { to: "/settings/capture", rotulo: "Abrir Formulários" },
    palavras: "form landing page site embed utm captura lead",
    admin: true,
  },
  {
    id: "importacao",
    capitulo: "Captação",
    titulo: "Importar de planilha ou de outro CRM",
    resumo: "CSV de qualquer CRM com de/para de colunas, ou conexão direta com HubSpot, Pipedrive, RD Station, Agendor, Kommo e Salesforce.",
    paraQue: "Trazer a base inteira sem retrabalho, com contatos, empresas, negócios e atividades ligados.",
    passos: [
      { texto: "Abra Configurações > Importação.", link: { to: "/settings/importacao", rotulo: "Importação" } },
      { texto: "Por arquivo: suba o CSV, confira o de/para das colunas e das etapas e importe. Cada linha com problema mostra o motivo." },
      { texto: "Por conexão: escolha o CRM, cole o token (Salesforce autoriza pelo card em Integrações), leia a estrutura e sincronize." },
      { texto: "Em Histórico, veja cada importação e desfaça se precisar." },
    ],
    dicas: ["Importar não dispara aviso de novo lead nem automações para cada registro. No fim chega um aviso com o resumo."],
    onde: { to: "/settings/importacao", rotulo: "Abrir Importação" },
    palavras: "csv planilha excel migração hubspot pipedrive rd station agendor kommo salesforce",
    admin: true,
  },

  // Automação -------------------------------------------------------------
  {
    id: "automacoes",
    capitulo: "Automação",
    titulo: "Automações e cadências",
    resumo: "Regras de gatilho e ação, ações por etapa do funil e sequências de mensagens.",
    paraQue: "Fazer o acompanhamento acontecer sozinho, no tempo certo.",
    passos: [
      { texto: "Abra Configurações > Automações.", link: { to: "/settings/automations", rotulo: "Automações" } },
      { texto: "Em Regras, escolha o gatilho (contato criado, etapa mudou, reunião marcada, não compareceu) e as ações." },
      { texto: "Em Funil, defina a mensagem automática de cada etapa e o que a IA pode fazer no funil." },
      { texto: "Em Cadências, monte sequências de e-mail ou WhatsApp com intervalos." },
    ],
    onde: { to: "/settings/automations", rotulo: "Abrir Automações" },
    palavras: "automação gatilho regra sequência cadência follow-up workflow",
  },
  {
    id: "campanhas",
    capitulo: "Automação",
    titulo: "Campanhas e templates do WhatsApp",
    resumo: "Disparos em massa pela API oficial, com templates aprovados pela Meta.",
    paraQue: "Falar com muitos contatos de uma vez sem risco de bloqueio.",
    passos: [
      { texto: "Abra Configurações > Campanhas, aba Templates, e crie ou sincronize os templates.", link: { to: "/settings/campaigns", rotulo: "Campanhas" } },
      { texto: "Na aba Campanhas, escolha o template, o público e o horário." },
    ],
    dicas: ["Templates só existem na API oficial e no Zernio. Com Evolution a tela avisa e não oferece templates."],
    onde: { to: "/settings/campaigns", rotulo: "Abrir Campanhas" },
    palavras: "disparo massa broadcast template meta aprovado",
  },
  {
    id: "biblioteca",
    capitulo: "Automação",
    titulo: "Biblioteca de modelos",
    resumo: "Automações, cadências e mensagens validadas em mercado, prontas para ativar.",
    paraQue: "Começar com o que já funciona e personalizar.",
    passos: [{ texto: "Abra Configurações > Biblioteca, filtre por categoria e ative um modelo.", link: { to: "/settings/library", rotulo: "Biblioteca" } }],
    onde: { to: "/settings/library", rotulo: "Abrir a Biblioteca" },
    palavras: "modelo template pronto kit",
  },

  // Análise ---------------------------------------------------------------
  {
    id: "relatorios",
    capitulo: "Análise",
    titulo: "Dashboard, metas e lead scoring",
    resumo: "Negócios por etapa, conversão por canal, leads por origem, IA x humano, SLA e NPS.",
    paraQue: "Saber o que está funcionando e onde agir.",
    passos: [
      { texto: "O Dashboard reúne tudo: negócios por etapa, atendimento, leads, conversão por canal, NPS e SLA, com filtro de período, responsável e canal e exportação em CSV e PDF.", link: { to: "/dashboard", rotulo: "Dashboard" } },
      { texto: "Metas acompanham o resultado individual e do time.", link: { to: "/sales-goals", rotulo: "Metas" } },
      { texto: "Lead Scoring pontua os contatos por comportamento, e a IA soma pontos quando qualifica.", link: { to: "/lead-scoring", rotulo: "Lead Scoring" } },
    ],
    onde: { to: "/dashboard", rotulo: "Abrir Dashboard" },
    palavras: "relatório métrica kpi conversão meta score pontuação nps sla",
  },

  // Conta e conexões -------------------------------------------------------
  {
    id: "usuarios",
    capitulo: "Conta e conexões",
    titulo: "Usuários, papéis e segurança",
    resumo: "Quem entra, o que cada um pode fazer e as regras de acesso.",
    paraQue: "Manter cada pessoa com o acesso certo.",
    passos: [
      { texto: "Abra Configurações > Usuários para aprovar novos cadastros, mudar papel e canais de cada pessoa.", link: { to: "/settings/team", rotulo: "Usuários" } },
      { texto: "No fim da mesma página, em Segurança e acesso, defina se novas contas precisam de aprovação e quais domínios de e-mail entram." },
    ],
    dicas: ["Administrador configura a empresa (IA, integrações, formulários, importação). Membro atende e vende."],
    onde: { to: "/settings/team", rotulo: "Abrir Usuários" },
    palavras: "equipe usuário permissão papel admin membro convite aprovação domínio",
  },
  {
    id: "integracoes",
    capitulo: "Conta e conexões",
    titulo: "Integrações e credenciais",
    resumo: "Toda chave e conexão com serviço externo fica num card em Configurações > Integrações.",
    paraQue: "Saber num lugar só o que está conectado e o que falta.",
    passos: [
      { texto: "Abra Configurações > Integrações. Cada card mostra se está pronto.", link: { to: "/settings/integrations", rotulo: "Integrações" } },
      { texto: "Abra o card, siga o passo a passo e salve. A chave vai para o cofre e nunca volta para a tela." },
      { texto: "As telas que usam a integração (Voz, Agenda, E-mail, Importação) mostram o estado e levam ao card certo." },
    ],
    onde: { to: "/settings/integrations", rotulo: "Abrir Integrações" },
    palavras: "chave api token credencial conectar integração cofre",
    admin: true,
  },
  {
    id: "api-webhooks",
    capitulo: "Conta e conexões",
    titulo: "API, webhooks, n8n e Make",
    resumo: "Outras ferramentas leem e escrevem no CRM, e o CRM avisa outras ferramentas.",
    paraQue: "Ligar o CRM ao ERP, ao site, ao n8n ou a qualquer sistema.",
    passos: [
      { texto: "Em Configurações > API, crie uma chave com os escopos necessários e veja a documentação e as chamadas recentes.", link: { to: "/settings/api", rotulo: "API" } },
      { texto: "Em Integrações > Webhooks, cadastre destinos para receber eventos do CRM e chaves para mandar dados para ele.", link: { to: "/settings/integrations?integration=webhooks", rotulo: "Webhooks" } },
    ],
    onde: { to: "/settings/api", rotulo: "Abrir API" },
    palavras: "api rest webhook n8n make zapier erp escopo",
    admin: true,
  },
  {
    id: "notificacoes",
    capitulo: "Conta e conexões",
    titulo: "Notificações",
    resumo: "O que cada pessoa recebe e por onde: no app, por e-mail ou pelo WhatsApp.",
    paraQue: "Ser avisado do que importa sem excesso.",
    passos: [
      { texto: "Abra Configurações > Notificações, escolha os canais de cada aviso e edite os textos.", link: { to: "/settings/notifications", rotulo: "Notificações" } },
      { texto: "O sino no topo mostra os avisos. Clique num aviso para ir ao registro." },
    ],
    onde: { to: "/settings/notifications", rotulo: "Abrir Notificações" },
    palavras: "aviso alerta sino notificação e-mail whatsapp",
  },
];
