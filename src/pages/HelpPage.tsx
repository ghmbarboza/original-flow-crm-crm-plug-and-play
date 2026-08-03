import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  BarChart2,
  BookOpen,
  HelpCircle,
  Mail,
  MessageCircle,
  Rocket,
  Search,
  Settings,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EmptyState } from "@/components/EmptyState";

type Faq = { q: string; a: string };
type Section = { id: string; title: string; icon: LucideIcon; faqs: Faq[] };

const SECTIONS: Section[] = [
  {
    id: "primeiros-passos",
    title: "Primeiros passos",
    icon: Rocket,
    faqs: [
      {
        q: "Por onde começo a usar a plataforma?",
        a: "Comece cadastrando seus Contatos e Empresas, ou importe uma base existente. Em seguida crie seus Negócios no funil (Deals) e configure os pipelines em Configurações. Se quiser ver a plataforma preenchida antes de usar com dados reais, ative os dados de demonstração em Configurações · Demonstração.",
      },
      {
        q: "Como convido minha equipe?",
        a: "Em Configurações · Equipe (acesso de administrador) você aprova novos usuários, define permissões e acompanha os membros. Novos cadastros podem ficar pendentes de aprovação conforme a política definida em Configurações · Segurança.",
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
        a: "Em Configurações · IA você define a personalidade do agente, a base de conhecimento e o comportamento das respostas automáticas no WhatsApp.",
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
        a: "Na tela de E-mail você conecta sua conta Google (Gmail) via autorização OAuth. Depois é possível sincronizar mensagens, enviar e-mails e usar templates.",
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
        a: "Crie um formulário de captura em Configurações · Captura de Leads, defina os campos e o funil de destino, e compartilhe o link público (/f/seu-slug). Cada envio vira um contato/negócio e pode disparar uma automação.",
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
        a: "Em Configurações · Geral você gerencia seu perfil. As demais abas (Segurança, Integrações, IA, Automações, Equipe, Demonstração, Onboarding) são de administrador.",
      },
      {
        q: "Como refaço o onboarding?",
        a: "Em Configurações · Onboarding você pode reconfigurar ou refazer o passo a passo inicial da plataforma.",
      },
    ],
  },
];

export default function HelpPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.map((s) => ({
      ...s,
      faqs: s.faqs.filter(
        (f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q),
      ),
    })).filter((s) => s.faqs.length > 0 || s.title.toLowerCase().includes(q));
  }, [query]);

  const hasResults = filtered.some((s) => s.faqs.length > 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <HelpCircle
            className="h-7 w-7"
            strokeWidth={1.5}
            style={{ color: "var(--via-text-muted)" }}
          />
          <h1
            className="font-display text-3xl font-medium tracking-tight"
            style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
          >
            Central de ajuda
          </h1>
        </div>

        <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
          Respostas rápidas sobre como usar o Flow CRM. Não achou o que procurava? Fale com o
          suporte pelo e-mail{" "}
          <a
            href="mailto:suporte@viverdeia.ai"
            className="font-medium text-via-blue hover:underline"
          >
            suporte@viverdeia.ai
          </a>
          .
        </p>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            strokeWidth={1.5}
            style={{ color: "var(--via-text-muted)" }}
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar na ajuda…"
            className="pl-9"
            aria-label="Buscar na ajuda"
          />
        </div>

        {!hasResults ? (
          <EmptyState
            icon={Search}
            title="Nenhum resultado"
            description={
              <>
                Não encontramos nada para <span className="font-medium">“{query}”</span>. Tente
                outras palavras ou fale com o suporte.
              </>
            }
          />
        ) : (
          <div className="space-y-5">
            {filtered
              .filter((s) => s.faqs.length > 0)
              .map((section) => (
                <div key={section.id} className="via-card p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <section.icon
                      className="h-5 w-5"
                      strokeWidth={1.5}
                      style={{ color: "var(--via-text-muted)" }}
                    />
                    <h2
                      className="font-medium"
                      style={{ color: "var(--via-text-primary)" }}
                    >
                      {section.title}
                    </h2>
                  </div>
                  <Accordion type="single" collapsible className="w-full">
                    {section.faqs.map((faq, i) => (
                      <AccordionItem key={i} value={`${section.id}-${i}`}>
                        <AccordionTrigger className="text-left text-sm">{faq.q}</AccordionTrigger>
                        <AccordionContent
                          className="text-sm"
                          style={{ color: "var(--via-text-body)" }}
                        >
                          {faq.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              ))}
          </div>
        )}

        <div className="via-card p-5 text-center">
          <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            Ainda com dúvidas?
          </p>
          <p className="mb-3 mt-1 text-sm" style={{ color: "var(--via-text-muted)" }}>
            Comece um tour pela plataforma refazendo o onboarding ou fale com o suporte.
          </p>
          <Link
            to="/settings/onboarding"
            className="text-sm font-medium text-via-blue hover:underline"
          >
            Ir para o Onboarding
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
