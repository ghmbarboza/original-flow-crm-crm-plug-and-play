import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart2,
  BookOpen,
  Brain,
  CalendarDays,
  Download,
  Mail,
  MessageCircle,
  Mic,
  Package,
  Plug,
  Rocket,
  Settings,
  Users,
  Zap,
} from "lucide-react";

/** Perguntas frequentes da Central de ajuda, por assunto. */
export type Faq = { q: string; a: string };
export type Section = { id: string; title: string; icon: LucideIcon; faqs: Faq[] };

export const FAQ_SECOES: Section[] = [
  {
    id: "primeiros-passos",
    title: "Primeiros passos",
    icon: Rocket,
    faqs: [
      {
        q: "Por onde começo a usar a plataforma?",
        a: "O assistente de configuração (onboarding) já deixa empresa, IA, funil e canal prontos. Depois dele, o que mais rende é: ensinar a IA em Configurações · IA · Conhecimento, trazer sua base em Configurações · Importação e cadastrar Produtos/Serviços. Para ver a plataforma preenchida antes de usar com dados reais, carregue os dados de exemplo em Configurações · Primeiros passos.",
      },
      {
        q: "Como convido minha equipe?",
        a: "Em Configurações · Usuários (acesso de administrador) você aprova novos usuários, define permissões e acompanha os membros. Novos cadastros podem ficar pendentes de aprovação conforme a política definida na seção Segurança e acesso, no fim da mesma aba.",
      },
      {
        q: "O que é a organização (org)?",
        a: "Todos os seus dados — contatos, negócios, e-mails, automações — pertencem à sua organização e são isolados de outras contas. Cada usuário aprovado enxerga apenas os dados da própria organização.",
      },
    ],
  },
  {
    id: "contatos-empresas",
    title: "Contatos e Empresas",
    icon: Users,
    faqs: [
      {
        q: "Qual a diferença entre Contato e Empresa?",
        a: "Contato é a pessoa (com quem você fala); Empresa é a organização à qual o contato pode estar vinculado. Um contato pode ter empresa associada, e a página da empresa reúne seus contatos e negócios relacionados.",
      },
      {
        q: "Como o Lead Scoring funciona?",
        a: "Em Lead Scoring você define regras de pontuação por evento (ex.: abriu e-mail, respondeu no WhatsApp). Contatos acumulam pontos conforme interagem, ajudando a priorizar quem está mais quente.",
      },
    ],
  },
  {
    id: "negocios",
    title: "Negócios e Funil",
    icon: BarChart2,
    faqs: [
      {
        q: "Como movo um negócio de etapa?",
        a: "Em Negócios, use a visão Kanban e arraste o card entre as colunas do funil, ou abra o negócio e altere a etapa. As etapas do funil são configuráveis por pipeline.",
      },
      {
        q: "Posso ter mais de um funil (pipeline)?",
        a: "Sim. Pipelines e suas etapas são configurados na plataforma, e cada negócio pertence a um pipeline/etapa. Formulários de captura podem direcionar novos leads para um funil e etapa específicos.",
      },
    ],
  },
  {
    id: "atividades-tarefas",
    title: "Atividades e Tarefas",
    icon: Activity,
    faqs: [
      {
        q: "Qual a diferença entre Atividade e Tarefa?",
        a: "Atividade é um registro do que aconteceu ou vai acontecer (ligação, reunião, e-mail) e pode ficar vinculada a um contato, empresa ou negócio. Tarefa é um item de trabalho a fazer, com responsável e prazo.",
      },
    ],
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    icon: MessageCircle,
    faqs: [
      {
        q: "Como conecto o WhatsApp?",
        a: "Em WhatsApp você conecta um provedor (Evolution ou Meta) pelo assistente de configuração. Depois é possível atender conversas na caixa de entrada, transferir para outro atendente e usar o atendimento por IA.",
      },
      {
        q: "Como configuro o atendimento por IA?",
        a: "Em Configurações · IA você define a personalidade da agente (Perfil), o que ela sabe (Conhecimento: documentos, fatos, FAQs e objeções), um perfil por origem do lead (Origens) e a análise pós-conversa (Análises). A mesma agente atende no WhatsApp, por voz e por telefone.",
      },
    ],
  },
  {
    id: "email",
    title: "E-mail",
    icon: Mail,
    faqs: [
      {
        q: "Como conecto minha conta de e-mail?",
        a: "Em Configurações · Integrações, card E-mail: cadastre as credenciais do Google e clique em Conectar conta do Gmail, ou salve a chave do Resend para e-mails em nome da empresa. Remetente, domínio e teste de envio ficam em Configurações · E-mail.",
      },
      {
        q: "Para que servem os Templates?",
        a: "Templates são e-mails reutilizáveis com variáveis, criados em Templates de e-mail. Eles agilizam o envio e alimentam as etapas das Sequências de e-mail.",
      },
      {
        q: "O que são Sequências de e-mail?",
        a: "Sequências enviam uma série de e-mails ao longo do tempo para os contatos inscritos (ex.: onboarding de novos leads). Cada etapa usa um template e um intervalo.",
      },
    ],
  },
  {
    id: "automacoes",
    title: "Automações e Marketing",
    icon: Zap,
    faqs: [
      {
        q: "Como crio uma automação?",
        a: "Em Automações use o construtor visual para definir o gatilho (o que dispara) e as ações (o que acontece). Por exemplo: novo lead de um formulário de captura entra numa sequência de e-mail.",
      },
    ],
  },
  {
    id: "formularios",
    title: "Formulários de captura",
    icon: BookOpen,
    faqs: [
      {
        q: "Como capturo leads de fora da plataforma?",
        a: "Crie um formulário em Configurações · Formulários: campos (inclusive condicionais), origem por UTM e funil de destino. Compartilhe o link público ou o código de embed no site. Cada envio vira contato e negócio, pode disparar uma automação e cair no perfil de IA daquela origem.",
      },
    ],
  },
  {
    id: "conhecimento",
    title: "Conhecimento da IA",
    icon: Brain,
    faqs: [
      {
        q: "Como ensino a IA sobre a minha empresa?",
        a: "Em Configurações · IA · Conhecimento você sobe documentos (PDF, Word, texto), cadastra fatos canônicos (preço, prazo, endereço, o que nunca pode mudar) e revisa FAQs e objeções. A IA consulta essa base antes de responder e cita o que encontrou.",
      },
      {
        q: "O que acontece quando a IA não sabe responder?",
        a: "Ela registra a pergunta em Conhecimento · Pendências e avisa o cliente que vai confirmar. Você responde ali uma vez e a resposta passa a valer para todos.",
      },
      {
        q: "O que é a memória do lead?",
        a: "Depois de cada conversa a IA anota o que entendeu (empresa, cargo, orçamento, prazo, dores) na ficha do contato, em O que a IA sabe. O que a equipe confirmar fica travado e a IA não sobrescreve. A análise é configurada em Configurações · IA · Análises.",
      },
    ],
  },
  {
    id: "voz",
    title: "Voz e ligações",
    icon: Mic,
    faqs: [
      {
        q: "Como a agente responde em áudio no WhatsApp?",
        a: "Cadastre a chave do ElevenLabs em Configurações · Integrações e ligue a resposta em áudio em Configurações · IA (Voz da agente). Áudios recebidos são sempre transcritos.",
      },
      {
        q: "Como a IA atende e faz ligações por telefone?",
        a: "Cadastre Twilio e ElevenLabs em Configurações · Integrações. Depois, na tela Voz, importe ou compre um número: o agente de voz é conectado sozinho. Cada ligação vira transcrição, resumo, classificação e atividade na ficha do contato. Campanhas de ligação ficam na aba Campanhas da tela Voz e são de administrador.",
      },
    ],
  },
  {
    id: "agenda",
    title: "Agenda",
    icon: CalendarDays,
    faqs: [
      {
        q: "Como a IA marca reuniões?",
        a: "Em Configurações · Agenda você define a política (dias, horários, antecedência, dono padrão) e liga a IA. Ela só marca depois que o cliente confirma dia e horário por escrito. Lembrete e cobrança de no-show saem pelo WhatsApp com os textos que você definir.",
      },
      {
        q: "Como conecto meu calendário?",
        a: "Um administrador cadastra as credenciais do Nylas em Configurações · Integrações. Depois cada pessoa conecta o próprio Google Calendar ou Outlook em Configurações · Agenda. Reuniões entram no calendário com sala de vídeo, e horários ocupados ficam indisponíveis para a IA.",
      },
    ],
  },
  {
    id: "importacao",
    title: "Importação e migração",
    icon: Download,
    faqs: [
      {
        q: "Como trago meus dados de outro CRM?",
        a: "Em Configurações · Importação: por arquivo (CSV ou planilha de qualquer CRM, com de/para de colunas e etapas) ou conectando direto HubSpot, Pipedrive, RD Station, Agendor, Kommo ou Salesforce. Contatos, empresas, negócios e atividades chegam ligados entre si.",
      },
      {
        q: "Posso importar mais de uma vez?",
        a: "Sim. O histórico de importações fica na mesma tela, e registros repetidos são atualizados em vez de duplicados.",
      },
    ],
  },
  {
    id: "produtos",
    title: "Produtos/Serviços",
    icon: Package,
    faqs: [
      {
        q: "Para que serve o cadastro de Produtos/Serviços?",
        a: "Produtos, serviços e assinaturas com preço e forma de cobrança entram nos negócios (com quantidade e desconto) e são lidos pela IA ao responder sobre preço e condições. O modelo de negócio (B2B, B2C, misto) fica em Configurações · Geral.",
      },
    ],
  },
  {
    id: "integracoes",
    title: "Integrações e credenciais",
    icon: Plug,
    faqs: [
      {
        q: "Onde cadastro chaves e conecto serviços?",
        a: "Sempre em Configurações · Integrações, um card por serviço: canais de atendimento, ElevenLabs, Twilio, E-mail (Resend e Gmail), Cal.com, Nylas, Salesforce, ERP e webhooks. As telas que usam a integração (Voz, Agenda, E-mail, Importação) mostram só o estado e levam ao card certo.",
      },
      {
        q: "Como outras ferramentas acessam o CRM?",
        a: "Em Configurações · API você cria chaves com escopos (leitura ou escrita por recurso), acompanha as chamadas recentes e lê a documentação. Para n8n, Make e sistemas próprios, os webhooks de entrada e saída ficam em Integrações.",
      },
      {
        q: "Como recebo avisos do que acontece?",
        a: "Em Configurações · Notificações cada pessoa escolhe o que recebe e por onde (no app, e-mail ou WhatsApp), e os textos de cada aviso podem ser editados.",
      },
    ],
  },
  {
    id: "configuracoes",
    title: "Configurações e conta",
    icon: Settings,
    faqs: [
      {
        q: "Onde ajusto minhas informações pessoais?",
        a: "Em Configurações · Geral você gerencia seu perfil. As demais abas seguem a ordem de uso: Conta (Usuários, Notificações), Conexões (Integrações, E-mail, API), Captação, Inteligência, Automação e Primeiros passos; as de configuração da empresa são de administrador.",
      },
      {
        q: "Como refaço o onboarding?",
        a: "Em Configurações · Primeiros passos você refaz o assistente inicial com os dados atuais já preenchidos, e no mesmo lugar carrega ou remove os dados de exemplo.",
      },
    ],
  },
];
