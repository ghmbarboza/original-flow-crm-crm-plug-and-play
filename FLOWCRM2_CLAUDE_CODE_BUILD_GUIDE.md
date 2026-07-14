# FlowCRM 2.0 — Guia de Build para Claude Code

**Projeto:** FlowCRM 2.0  
**Repositório:** https://github.com/MindOpsTeam/via-flowcrm2.git  
**Lovable Project ID:** 86df5d75-50df-4efc-bd6d-7b98bc45e5ff  
**Local de trabalho:** `C:\Users\sahho\Documents\Projetos\viver-de-ia\crm-flow2`  
**Stack:** React 18 + TypeScript strict + Vite + Tailwind + shadcn/ui + TanStack Query + Supabase (Lovable Cloud)

---

## Contexto geral

Este projeto parte de um remix do projeto base Viver de IA já corrigido (`viver-de-ia-projetobase`). O base já tem: Auth robusto, tokens VIA completos, Geist configurado, dark mode, roles `admin|member` e zero hex hardcoded.

O objetivo é construir um CRM completo com IA e WhatsApp nativo, remixável por setor. Cada instalação é single-tenant: um projeto Lovable por cliente.

**Design System de referência:**
`C:\Users\sahho\Documents\Projetos\viver-de-ia\design-system\Viver de IA Design System V2`

Consulte esse diretório sempre que precisar de valor de token, cor, componente ou comportamento visual.

---

## Regras inegociáveis — leia antes de qualquer código

1. **Zero hex hardcoded** em qualquer arquivo `.tsx` ou `.ts` fora de `src/lib/via-colors.ts`. Sempre `var(--via-navy)` ou `bg-via-navy`. Se precisar de hex literal (Recharts, canvas, exportação), importe de `via-colors.ts`.
2. **Zero strings de role** além de `'admin'` e `'member'`. Sub-papéis (`diretor`, `gerente`, `agente`) ficam em `profiles.crm_role` (enum no banco).
3. **RLS em todas as tabelas**, sem exceção, filtrado por `org_id`.
4. **Todo import de página em `lazy()`** com `ErrorBoundary` + `Suspense`.
5. **TanStack Query** para todo fetch de dados. Nenhum `fetch` ou `supabase.from()` direto dentro de componente.
6. **Realtime** habilitado em: `deals`, `contacts`, `whatsapp_conversations`, `whatsapp_messages`, `notifications`.
7. **Lucide React** para ícones. `strokeWidth={1.5}` em todos. Sem Sparkles.
8. **Sem módulos fora do escopo:** sem contratos, sem roleplay, sem livecoach, sem TypeFlow, sem telefonia CTI.
9. **Erros sempre visíveis** para o usuário: mensagem amigável + orientação de resolução. Nunca falha silenciosa.
10. **Checklist de hex antes de cada commit:**

```bash
grep -r "#[0-9a-fA-F]\{6\}" src/ --include="*.tsx" --include="*.ts" \
  | grep -v "via-colors.ts" \
  | grep -v "//.*#"
```

Se retornar qualquer linha, há hex fora do arquivo permitido. Corrija antes do commit.

---

## Arquivo obrigatório — criar antes de qualquer componente

Crie `src/lib/via-colors.ts` com o conteúdo abaixo. Este é o único arquivo do projeto onde hex literals são permitidos.

```typescript
/**
 * Viver de IA — Paleta de cores canônica
 * NUNCA defina hex fora deste arquivo em src/.
 * NUNCA use roxo, cyan, amarelo, dourado, magenta ou neon.
 */

export const VIA = {
  navy:       '#0A1F3B',
  navyDeep:   '#02162A',
  navyDarker: '#010B1A',
  blue:       '#1E3A5F',
  blueSoft:   '#2A4A6E',
  white:      '#FFFFFF',
  gray50:     '#F7F8FA',
  gray100:    '#F0F2F5',
  gray200:    '#E4E7EC',
  gray300:    '#D0D5DD',
  gray400:    '#98A2B3',
  gray500:    '#667085',
  gray600:    '#475467',
  gray700:    '#344054',
  gray800:    '#1D2939',
  gray900:    '#101828',
  black:      '#000000',
  success:    '#1F8A5B',
  danger:     '#B83A3A',
  coral:      '#B85C5C',
} as const;

export const VIA_STAGE_COLORS = [
  { label: 'Navy',        value: VIA.navy,     text: VIA.white   },
  { label: 'Azul',        value: VIA.blue,     text: VIA.white   },
  { label: 'Azul suave',  value: VIA.blueSoft, text: VIA.white   },
  { label: 'Cinza',       value: VIA.gray500,  text: VIA.white   },
  { label: 'Cinza claro', value: VIA.gray300,  text: VIA.gray800 },
  { label: 'Sucesso',     value: VIA.success,  text: VIA.white   },
  { label: 'Coral',       value: VIA.coral,    text: VIA.white   },
] as const;

export const VIA_CHART_COLORS = [
  VIA.navy,
  VIA.blue,
  VIA.blueSoft,
  VIA.gray500,
  VIA.gray300,
  VIA.success,
] as const;

export const VIA_CONVERSATION_STATUS = {
  ai_active:      { bg: VIA.navy,    text: VIA.white,   label: 'IA ativa'              },
  human_takeover: { bg: VIA.blue,    text: VIA.white,   label: 'Em atendimento humano' },
  closed:         { bg: VIA.gray300, text: VIA.gray700, label: 'Encerrada'             },
} as const;

export const VIA_DEAL_STATUS = {
  open: { bg: VIA.navy,    text: VIA.white, label: 'Em aberto' },
  won:  { bg: VIA.success, text: VIA.white, label: 'Ganho'     },
  lost: { bg: VIA.coral,   text: VIA.white, label: 'Perdido'   },
} as const;

export const VIA_CAMPAIGN_STATUS = {
  draft:     { bg: VIA.gray200, text: VIA.gray700, label: 'Rascunho'  },
  sending:   { bg: VIA.blue,    text: VIA.white,   label: 'Enviando'  },
  paused:    { bg: VIA.gray400, text: VIA.white,   label: 'Pausada'   },
  completed: { bg: VIA.success, text: VIA.white,   label: 'Concluída' },
  cancelled: { bg: VIA.coral,   text: VIA.white,   label: 'Cancelada' },
} as const;

export const VIA_ROLE_COLORS = {
  admin:   { bg: VIA.navy,     text: VIA.white,   label: 'Admin'   },
  member:  { bg: VIA.gray200,  text: VIA.gray700, label: 'Membro'  },
  diretor: { bg: VIA.blue,     text: VIA.white,   label: 'Diretor' },
  gerente: { bg: VIA.blueSoft, text: VIA.white,   label: 'Gerente' },
  agente:  { bg: VIA.gray300,  text: VIA.gray800, label: 'Agente'  },
} as const;
```

---

## Papéis de usuário

| Role no banco | Descrição |
|---|---|
| `admin` | Configura tudo, vê tudo, gerencia usuários e integrações |
| `member` (crm_role: `diretor`) | Vê relatórios e métricas do seu time, não configura |
| `member` (crm_role: `gerente`) | Vê seu time, reatribui conversas e deals, acompanha performance individual |
| `member` (crm_role: `agente`) | Vê apenas seus próprios contatos, conversas e deals |

A hierarquia é configurável pelo Admin. Admin vincula Gerente a Agentes e Diretor a Gerentes.

---

## Rotas e estrutura de páginas

```
/ → Login (fora do AppLayout)
/setup → Wizard de onboarding (fullscreen, fora do AppLayout)
/f/:slug → Formulário público de captura (sem autenticação, sem sidebar)

AppLayout (sidebar + header):
  /dashboard
  /contacts
  /companies
  /deals
  /deals/:id
  /activities
  /tasks
  /products
  /whatsapp
  /whatsapp/campaigns
  /inbox
  /email-templates
  /email-sequences
  /lead-scoring
  /reports
  /sales-goals
  /automations
  /team
  /settings (abas: geral, whatsapp, ia, follow-up, atendimento, pipeline,
             produtos, captura, integracoes, relatorios, notificacoes,
             seguranca, demonstracao)
  /settings/security
```

---

## Sidebar — grupos e itens

```
GRUPO: CRM
  Dashboard        → /dashboard        (LayoutDashboard)
  Contatos         → /contacts         (Users)
  Empresas         → /companies        (Building2)
  Negócios         → /deals            (TrendingUp)
  Atividades       → /activities       (Activity)
  Tarefas          → /tasks            (CheckSquare)
  Produtos         → /products         (Package)

GRUPO: ATENDIMENTO
  WhatsApp         → /whatsapp         (MessageCircle)
  Email            → /inbox            (Mail)

GRUPO: MARKETING
  Automações       → /automations      (Zap)
  Sequências       → /email-sequences  (GitBranch)

GRUPO: ANALYTICS
  Relatórios       → /reports          (BarChart2)
  Metas            → /sales-goals      (Target)
  Lead Scoring     → /lead-scoring     (Award)

RODAPÉ:
  Configurações    → /settings         (Settings)
  Avatar + nome + logout
```

---

## Banco de dados — migrations

Execute as migrations na ordem abaixo. Cada bloco é uma migration separada no Supabase.

### Migration 1 — Enums e tabelas core

```sql
-- Enums
CREATE TYPE public.crm_role AS ENUM ('diretor', 'gerente', 'agente');
CREATE TYPE public.contact_status AS ENUM ('lead', 'prospect', 'customer', 'churned');
CREATE TYPE public.deal_status AS ENUM ('open', 'won', 'lost');
CREATE TYPE public.activity_type AS ENUM ('call', 'email', 'meeting', 'note', 'task');
CREATE TYPE public.whatsapp_provider AS ENUM ('evolution', 'meta_official');
CREATE TYPE public.conversation_status AS ENUM ('ai_active', 'human_takeover', 'closed');
CREATE TYPE public.distribution_mode AS ENUM ('open_queue', 'round_robin', 'ai_directed');

-- Organizations (já existe no base — adicionar campos)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL';

-- Profiles: adicionar sub-papel CRM
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS crm_role crm_role,
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.profiles(id);

-- Teams
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.team_members (
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);

-- Pipelines
CREATE TABLE public.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency TEXT DEFAULT 'BRL',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#0A1F3B',
  win_probability NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.loss_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  "order" INTEGER DEFAULT 0
);

-- Companies
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  size TEXT,
  website TEXT,
  owner_id UUID REFERENCES auth.users(id),
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Contacts
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT,
  email TEXT,
  phone TEXT,
  whatsapp_phone TEXT,
  title TEXT,
  status contact_status DEFAULT 'lead',
  lead_score INTEGER DEFAULT 0,
  owner_id UUID REFERENCES auth.users(id),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  source TEXT,
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tags
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#0A1F3B',
  UNIQUE(org_id, name)
);

CREATE TABLE public.contact_tags (
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

-- Deals
CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  value NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  stage_id UUID REFERENCES public.pipeline_stages(id),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES auth.users(id),
  close_date DATE,
  probability NUMERIC DEFAULT 0,
  status deal_status DEFAULT 'open',
  loss_reason_id UUID REFERENCES public.loss_reasons(id),
  qualification JSONB DEFAULT '{"budget":null,"authority":null,"need":null,"timeline":null}',
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.deal_tags (
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, tag_id)
);

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  is_active BOOLEAN DEFAULT true,
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.deal_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC GENERATED ALWAYS AS (quantity * unit_price) STORED,
  UNIQUE(deal_id, product_id)
);

-- Activities
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type activity_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Custom Fields
CREATE TABLE public.custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contact','company','deal','product')),
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text','number','boolean','date','select','multi_select')),
  options JSONB DEFAULT '[]',
  is_required BOOLEAN DEFAULT false,
  field_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, entity_type, field_key)
);

-- Contact Groups
CREATE TABLE public.contact_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed','dynamic')),
  criteria JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.contact_group_members (
  group_id UUID NOT NULL REFERENCES public.contact_groups(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, contact_id)
);
```

### Migration 2 — Email e Analytics

```sql
-- Email
CREATE TABLE public.email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  provider TEXT DEFAULT 'gmail',
  email TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  user_id UUID REFERENCES auth.users(id),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound','outbound')),
  subject TEXT,
  body_html TEXT,
  from_email TEXT,
  to_emails JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  thread_id TEXT,
  open_count INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  variables JSONB DEFAULT '[]',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.email_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.email_sequences(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.email_templates(id),
  delay_days INTEGER NOT NULL DEFAULT 1,
  "order" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE public.email_sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.email_sequences(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active',
  current_step INTEGER DEFAULT 0,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Sales Goals
CREATE TABLE public.sales_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL DEFAULT 'revenue' CHECK (goal_type IN ('revenue','deals','activities','contacts')),
  target_value NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC NOT NULL DEFAULT 0,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  assign_type TEXT NOT NULL DEFAULT 'individual' CHECK (assign_type IN ('individual','team')),
  user_id UUID REFERENCES auth.users(id),
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Lead Scoring
CREATE TABLE public.lead_scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  label TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.lead_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Automations
CREATE TABLE public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  trigger JSONB NOT NULL DEFAULT '{}',
  conditions JSONB DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES auth.users(id),
  run_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  trigger_data JSONB,
  result JSONB,
  error_msg TEXT,
  ran_at TIMESTAMPTZ DEFAULT now()
);

-- Audit Log
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  meta JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Capture Forms
CREATE TABLE public.capture_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  fields JSONB NOT NULL DEFAULT '[]',
  target_pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE SET NULL,
  target_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  automation_id UUID REFERENCES public.automations(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Integrations
CREATE TABLE public.integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT now(),
  connected_by UUID REFERENCES auth.users(id),
  UNIQUE(org_id, provider)
);

-- API Keys
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  channel_in_app BOOLEAN DEFAULT true,
  channel_whatsapp BOOLEAN DEFAULT false,
  channel_email BOOLEAN DEFAULT false,
  UNIQUE(user_id, org_id, event_type)
);
```

### Migration 3 — WhatsApp duplo provedor

```sql
-- Config do provedor ativo
CREATE TABLE public.whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider whatsapp_provider NOT NULL DEFAULT 'evolution',
  distribution_mode distribution_mode NOT NULL DEFAULT 'open_queue',
  offline_timeout_minutes INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Instâncias Evolution API
CREATE TABLE public.evolution_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  server_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  phone_number TEXT,
  qr_code TEXT,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, instance_name)
);

-- Instâncias Meta API Oficial
CREATE TABLE public.meta_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  phone_number_id TEXT NOT NULL,
  business_account_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  settings JSONB NOT NULL DEFAULT '{
    "reply_groups": false,
    "reject_calls": false,
    "call_message": "",
    "always_online": false,
    "read_messages": true
  }',
  webhook_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Conversas (provider-agnostic)
CREATE TABLE public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  status conversation_status NOT NULL DEFAULT 'ai_active',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  provider whatsapp_provider NOT NULL DEFAULT 'evolution',
  provider_conversation_id TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, phone_number)
);

-- Mensagens
CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  provider_message_id TEXT UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','image','audio','video','document','sticker','location')),
  content TEXT,
  media_url TEXT,
  is_from_ai BOOLEAN DEFAULT false,
  is_internal_note BOOLEAN DEFAULT false,
  sent_by UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Config de IA para WhatsApp
CREATE TABLE public.whatsapp_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  agent_name TEXT NOT NULL DEFAULT 'Assistente',
  agent_tone TEXT NOT NULL DEFAULT 'profissional',
  agent_objective TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  prompt_version INTEGER NOT NULL DEFAULT 1,
  fallback_message TEXT NOT NULL DEFAULT 'Aguarde, um atendente irá ajudar em breve.',
  context_window_size INTEGER NOT NULL DEFAULT 20 CHECK (context_window_size BETWEEN 10 AND 50),
  response_delay_ms INTEGER NOT NULL DEFAULT 1500,
  cooldown_ms INTEGER NOT NULL DEFAULT 3000,
  max_ai_turns_before_human INTEGER NOT NULL DEFAULT 10,
  working_hours JSONB NOT NULL DEFAULT '{"start":"08:00","end":"18:00","days":[1,2,3,4,5]}',
  human_trigger_rules JSONB NOT NULL DEFAULT '{
    "keywords": [],
    "negative_sentiment": false,
    "max_no_understand": 3
  }',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Versionamento de prompts
CREATE TABLE public.ai_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  system_prompt TEXT NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Base de Conhecimento
CREATE TABLE public.ai_knowledge_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.ai_knowledge_objections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  objection TEXT NOT NULL,
  response TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Follow-up automático
CREATE TABLE public.followup_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT false,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  on_limit_reached TEXT NOT NULL DEFAULT 'mark_inactive'
    CHECK (on_limit_reached IN ('mark_inactive','notify_agent','both')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.followup_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL DEFAULT 0,
  delay_hours INTEGER NOT NULL DEFAULT 24,
  message_template TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.followup_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','cancelled','limit_reached')),
  next_attempt_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Campanhas (apenas Meta API Oficial)
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sending','paused','completed','cancelled')),
  message_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  audience_type TEXT NOT NULL DEFAULT 'group'
    CHECK (audience_type IN ('group','tag','filter','csv')),
  audience_config JSONB DEFAULT '{}',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  sent_at TIMESTAMPTZ,
  error_msg TEXT
);

-- Tracking
CREATE TABLE public.tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  visitor_id TEXT,
  event_type TEXT NOT NULL,
  page_url TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Google OAuth
CREATE TABLE public.google_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  scopes TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Migration 4 — RLS, Indexes e Realtime

```sql
-- Habilitar RLS em todas as tabelas novas
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loss_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_objections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Indexes críticos
CREATE INDEX idx_contacts_org    ON public.contacts(org_id);
CREATE INDEX idx_contacts_owner  ON public.contacts(owner_id);
CREATE INDEX idx_contacts_phone  ON public.contacts(org_id, whatsapp_phone);
CREATE INDEX idx_deals_org       ON public.deals(org_id);
CREATE INDEX idx_deals_stage     ON public.deals(stage_id);
CREATE INDEX idx_deals_owner     ON public.deals(owner_id);
CREATE INDEX idx_activities_org  ON public.activities(org_id);
CREATE INDEX idx_wpp_conv_org    ON public.whatsapp_conversations(org_id);
CREATE INDEX idx_wpp_conv_phone  ON public.whatsapp_conversations(org_id, phone_number);
CREATE INDEX idx_wpp_conv_last   ON public.whatsapp_conversations(org_id, last_message_at DESC);
CREATE INDEX idx_wpp_msg_conv    ON public.whatsapp_messages(conversation_id, sent_at DESC);
CREATE INDEX idx_notifications   ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_audit_org       ON public.audit_logs(org_id, created_at DESC);

-- Storage bucket para mídia WhatsApp
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;
```

---

## Edge Functions a criar

| Função | Descrição |
|---|---|
| `evolution-webhook` | Recebe eventos da Evolution API |
| `evolution-send-message` | Envia mensagem via Evolution |
| `meta-webhook` | Recebe eventos da Meta API Oficial |
| `meta-send-message` | Envia mensagem via Meta API Oficial |
| `ai-whatsapp-reply` | Gera resposta da IA para WhatsApp |
| `followup-dispatcher` | pg_cron: dispara follow-ups pendentes |
| `campaign-dispatcher` | Envia campanhas agendadas (Meta apenas) |
| `transfer-conversation` | Transfere conversa entre agentes |
| `resolve-conversation` | Encerra conversa |
| `process-automation` | Executa automações |
| `gmail-initial-sync` | Sync inicial de emails Gmail |
| `ai-copilot` | Copilot global para o CRM |
| `ai-insights` | Insights de deals e contatos |
| `inbound-webhook` | Webhook público de entrada por org_id |
| `public-api` | API REST pública (contatos, deals, atividades) |
| `invite-member` | Convite por magic link |
| `typeflow-submit` | Processa envio do formulário público de captura |
| `validate-resend-key` | Valida chave Resend |
| `validate-evolution-key` | Valida chave Evolution API |
| `slack-connect` | OAuth Slack |
| `slack-send-test` | Envia mensagem de teste no Slack |

---

## Regras de negócio críticas

Estas regras devem ser implementadas no código, não apenas documentadas.

**Conversas WhatsApp:**
- Toda conversa nasce com `status = 'ai_active'`.
- `status = 'human_takeover'` só via botão "Assumir conversa" ou gatilho automático configurado pelo Admin.
- Retorno para `ai_active` é sempre manual, via botão "Devolver para IA".
- Cooldown de 3000ms entre respostas da IA (campo `cooldown_ms` em `whatsapp_ai_config`).
- Número de WhatsApp desconhecido cria `contact` automaticamente com `first_name = ''`.
- Deduplicação por `phone_number`: `UNIQUE(org_id, phone_number)` em `whatsapp_conversations`.
- Agente offline por tempo configurável: conversa volta para fila geral, Gerente recebe notificação.
- Transferência entre agentes: silenciosa para o cliente, histórico completo visível para o novo agente.

**IA e Prompts:**
- Toda alteração em `whatsapp_ai_config.system_prompt` gera novo registro em `ai_prompt_versions` com timestamp, autor e notas opcionais.
- Reversão aplica imediatamente em toda a plataforma, incluindo conversas em andamento.
- Alterações em prompt e base de conhecimento refletem imediatamente em todas as conversas.
- Fora do horário configurado em `working_hours`: IA fica em silêncio total, sem mensagem automática.

**Follow-up:**
- Sempre enviado pela IA.
- Pausa quando `conversation.status = 'human_takeover'`.
- Cancela automaticamente quando o contato responde.

**Campanhas:**
- Bloqueadas completamente para provedor `evolution` na interface.
- Mensagem explicativa ao usuário: "Campanhas em massa disponíveis apenas na integração via API Oficial Meta. Isso garante estabilidade, conformidade com os termos da Meta e protege seu número contra banimento."
- Disponíveis apenas para contas com `whatsapp_config.provider = 'meta_official'`.

**Auditoria:**
- Ao deletar contato: anonimizar dados pessoais no log (`audit_logs`), mas manter o registro da ação para compliance.

**Produtos:**
- Vinculados a Deals com cálculo automático de valor via `deal_products.total_price` (coluna gerada).
- IA sempre lê a versão atualizada dos produtos ao responder.

**Notificações:**
- Um único número de WhatsApp por empresa.
- Notificações do sistema (alertas para agentes) saem pelo mesmo número da empresa.

---

## Ordem de build — Sprints

### Sprint 1 — Fundação (primeiro commit)

**Objetivo:** projeto compilando, navegável, sem conteúdo real.

Passos:
1. Clonar o repositório: `git clone https://github.com/MindOpsTeam/via-flowcrm2.git crm-flow2`
2. Entrar na pasta: `cd crm-flow2`
3. Criar branch: `git checkout -b feat/sprint-1-fundacao`
4. Criar `src/lib/via-colors.ts` (conteúdo completo acima)
5. Executar as 4 migrations no Supabase, nessa ordem
6. Atualizar `App.tsx` com todas as rotas usando `lazy()` + `ErrorBoundary` + `Suspense`
7. Atualizar `AppSidebar.tsx` com os 4 grupos e todos os itens
8. Criar páginas stub para todas as rotas (só shell: título + texto placeholder)
9. Revisar `AppShell` e `MobileBottomNav` com tokens VIA
10. Executar checklist de hex antes do commit
11. Commit: `feat: sprint 1 - fundacao e schema`

Entregável: projeto abre no browser, sidebar navegável, todas as rotas resolvem sem erro 404.

---

### Sprint 2 — CRM Core

**Objetivo:** módulo CRM completo e funcional.

Entregas por página:

**`/contacts`**
- Tabela com colunas: nome, email, telefone, empresa, status, score, owner, criado em
- Kanban opcional por owner
- Drawer de detalhes: todos os campos, tags, timeline básica, atividades vinculadas
- Criar contato (formulário inline ou modal)
- Importação via CSV (upload + mapeamento de colunas + preview de erros)
- Exportação via CSV
- Tags com CRUD
- Grupos de contatos (fixos e dinâmicos) em sub-aba ou página Contatos > Grupos
- Campos customizáveis configurados em Configurações > Campos

**`/companies`**
- Tabela com colunas: nome, domínio, setor, tamanho, owner
- Drawer de detalhes com contatos vinculados e deals vinculados

**`/deals`**
- Kanban com drag-and-drop entre etapas e realtime
- Vista de lista com filtros por etapa, owner, valor e data de fechamento
- Drawer de preview rápido ao clicar no card

**`/deals/:id`**
- Página completa com: dados do deal, contato e empresa vinculados, valor calculado pelos produtos
- Seção de Produtos: seleção e quantidade, total calculado automaticamente
- Timeline cronológica unificada: emails + atividades + notas + tarefas + mensagens WhatsApp, em ordem cronológica
- Atividades vinculadas: listar, criar, marcar como concluída
- Qualificação BANT (budget, authority, need, timeline)

**`/activities`**
- Lista com filtros por tipo, status, owner, data
- Criar atividade vinculada a contato e/ou deal

**`/tasks`**
- Lista com filtros e ordenação
- Criar, editar, marcar como concluída

**`/products`**
- Tabela: nome, descrição, preço, status ativo/inativo
- CRUD completo
- Importação via CSV (template disponível para download)
- Campos customizados configuráveis

Commit ao final: `feat: sprint 2 - crm core`

---

### Sprint 3 — WhatsApp e IA

**Objetivo:** módulo de atendimento WhatsApp com IA funcional.

**Wizard de escolha de provedor** (aparece quando nenhum provedor está configurado):
- Passo 1: escolha Evolution API ou API Oficial Meta
- Passo 2a (Evolution): campos server_url, api_key, instance_name + botão de teste de conexão + QR Code
- Passo 2b (Meta): campos phone_number_id, business_account_id, access_token + botão de verificação + configuração de webhook
- Passo 3: resumo e confirmação

**`/whatsapp` — Inbox unificado:**
- Lista de conversas à esquerda: preview da última mensagem, status badge, avatar, unread count
- Painel de mensagens à direita: histórico completo, campo de envio, botão de nota interna
- Status sempre visível no topo: badge colorido com `VIA_CONVERSATION_STATUS`
- Botão "Assumir conversa" quando `status = 'ai_active'`
- Botão "Devolver para IA" quando `status = 'human_takeover'`
- Botão "Transferir" com seleção de agente ou fila geral
- Botão "Encerrar" para fechar a conversa
- Busca dentro de conversas
- Tags por conversa

**Configuração de IA** (em `/settings` aba `ia`):
- Personalidade: nome do agente, tom, objetivo
- Base de Conhecimento:
  - FAQs: pergunta + resposta (CRUD + importação CSV)
  - Objeções: objeção + como contornar (CRUD + importação CSV)
  - Produtos: sincronizado automaticamente com o Módulo de Produtos
- Horário de atendimento: por dia da semana e horário
- Janela de contexto: slider entre 10 e 50 mensagens
- Regras de acionamento humano: palavras-chave, sentimento negativo, max tentativas sem entendimento
- Versionamento de prompts:
  - Lista de versões com timestamp e autor
  - Diff visual entre versão atual e anterior
  - Botão de reversão por versão

**Follow-up automático** (em `/settings` aba `follow-up`):
- Toggle para ativar/desativar
- Régua de etapas: delay em horas + mensagem com variáveis
- Número máximo de tentativas
- Comportamento ao atingir limite: marcar inativo, notificar agente ou ambos

**`/whatsapp/campaigns`:**
- Para contas Meta: wizard de criação (público, mensagem, agendamento)
- Para contas Evolution: tela bloqueada com mensagem explicativa

**Edge Functions a criar neste sprint:**
`evolution-webhook`, `evolution-send-message`, `meta-webhook`, `meta-send-message`, `ai-whatsapp-reply`, `followup-dispatcher`, `campaign-dispatcher`, `transfer-conversation`, `resolve-conversation`

Commit ao final: `feat: sprint 3 - whatsapp e ia`

---

### Sprint 4 — Email, Analytics e Automações

**`/inbox`:**
- Email inbox com sincronização Gmail
- Histórico de threads por contato
- Envio de emails com templates

**`/email-templates`:**
- CRUD de templates com editor rich text
- Variáveis dinâmicas: `{{contact.first_name}}`, `{{deal.title}}` etc
- Preview antes de salvar

**`/email-sequences`:**
- CRUD de sequências com etapas
- Cada etapa: delay em dias + template vinculado
- Enroll de contatos na sequência

**`/automations`:**
- Builder visual: trigger (evento) + condições + ações
- Triggers disponíveis: novo contato, deal mudou de etapa, formulário submetido, tag adicionada, mensagem recebida
- Ações disponíveis: enviar email, criar atividade, mover deal, adicionar tag, notificar agente, iniciar sequência
- Log de execuções por automação

**`/reports`:**
- Métricas de conversas: TMA, conversas abertas/fechadas, atendimento humano x IA
- Métricas de deals: conversão por etapa, forecast, receita prevista
- Métricas de follow-up: taxa de resposta, abandono
- Métricas de leads gerados
- Filtros: período, agente, pipeline, equipe
- Exportação CSV e PDF
- Agendamento de relatórios recorrentes: frequência, canal (email ou WhatsApp)

**`/sales-goals`:**
- Metas por usuário ou time (tipo: receita, deals, atividades, contatos)
- Progresso visual com barra e percentual
- Filtro por mês e ano

**`/lead-scoring`:**
- CRUD de regras de pontuação por evento
- Histórico de pontos por contato

Commit ao final: `feat: sprint 4 - email analytics automacoes`

---

### Sprint 5 — Configurações e Polish

**`/settings` — todas as abas:**

| Aba | Conteúdo |
|---|---|
| Geral | Nome da org, logo, fuso horário, moeda |
| Usuários e Permissões | Convidar por email, definir papel, vincular hierarquia, matriz de permissões |
| WhatsApp | Provedor ativo, status de conexão, trocar provedor (wizard), configurações por instância |
| IA | Personalidade, base de conhecimento, horário, janela de contexto, regras de acionamento, versionamento |
| Follow-up | Régua configurável, mensagens por etapa, comportamento ao atingir limite |
| Atendimento | Modo de distribuição, tempo de redistribuição por agente offline, status padrão |
| Pipeline | CRUD de pipelines e etapas, motivos de perda, gatilhos de automação por etapa |
| Produtos | CRUD, importação CSV, template para download |
| Captura de Leads | Formulário público configurável, URL e snippet de embed |
| Integrações | Email (Resend), Slack, Google Calendar, API pública (gerar e revogar chaves) |
| Relatórios | Agendamento recorrente, canal de entrega |
| Notificações | Eventos e canais por papel |
| Segurança | 2FA/TOTP, log de auditoria com filtros, sessões ativas |
| Demonstração | Botão "Carregar dados de exemplo" e "Remover dados de exemplo" |

**Modo Demonstração:**
- Seed completo e coerente: contatos, empresas, deals em todas as etapas, conversas com histórico, follow-ups, campanhas, métricas de dashboard, relatórios
- Dados realistas: contato vinculado ao deal vinculado à conversa
- Não afeta dados reais
- Acessível para todos os papéis (cada um vê no contexto do seu papel)

**`/f/:slug` — formulário público de captura:**
- Sem auth, sem sidebar, layout limpo
- Campos configuráveis via `/settings` aba captura
- Ao submeter: cria contato + deal + aciona automação se definida

**Central de Ajuda:**
- Ícone fixo no canto da interface (ponto de interrogação ou similar)
- FAQ por módulo com busca
- Tutoriais passo a passo
- Insights de uso: "Você tem 10 contatos mas nunca configurou follow-up automático. Veja como em 2 minutos."
- Seção de Boas Práticas: janela de contexto, intervalos de follow-up, proteção de número WhatsApp

**Walkthroughs:**
- Aparecem na primeira vez que o usuário acessa cada módulo principal
- Adaptados por papel: Admin vê tour de configuração, Agente vê tour de operação, Gerente vê tour de gestão
- Reativáveis manualmente pelo usuário

**Notificações:**
- Sino na header com badge de não lidas
- Canal configurável por usuário: plataforma, WhatsApp ou email
- Realtime via Supabase

**PWA:**
- `manifest.json` com nome, ícone e cores VIA
- Splash screen
- Atalho de aplicativo (não nativo, PWA)
- Layout responsivo com `MobileBottomNav`

**Polish geral:**
- Empty states em todas as telas (com texto de direcionamento, não genérico)
- Skeletons em todos os carregamentos
- Error states com mensagem amigável e orientação de resolução
- Auditoria LGPD: log legível com filtros por usuário, ação e data

Commit ao final: `feat: sprint 5 - configuracoes e polish`

---

## Padrões de código — exemplos de referência

**Componente com TanStack Query:**
```tsx
// src/hooks/useContacts.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useContacts(orgId: string) {
  return useQuery({
    queryKey: ['contacts', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*, company:companies(name), tags:contact_tags(tag:tags(*))')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
```

**Página com lazy + ErrorBoundary:**
```tsx
// src/App.tsx
const Contacts = lazy(() => import('@/pages/Contacts'));

<Route
  path="/contacts"
  element={
    <ErrorBoundary fallback={<ErrorPage />}>
      <Suspense fallback={<PageSkeleton />}>
        <Contacts />
      </Suspense>
    </ErrorBoundary>
  }
/>
```

**Status badge com mapa VIA:**
```tsx
import { VIA_CONVERSATION_STATUS } from '@/lib/via-colors';

const badge = VIA_CONVERSATION_STATUS[conversation.status];
<span
  className="px-2 py-0.5 rounded-full text-xs font-medium"
  style={{ background: badge.bg, color: badge.text }}
>
  {badge.label}
</span>
```

**Gráfico Recharts com cores VIA:**
```tsx
import { VIA_CHART_COLORS } from '@/lib/via-colors';

<BarChart data={data}>
  <Bar dataKey="value" fill={VIA_CHART_COLORS[0]} />
  <Bar dataKey="converted" fill={VIA_CHART_COLORS[5]} />
</BarChart>
```

**Seed de stages no banco:**
```sql
INSERT INTO pipeline_stages (org_id, pipeline_id, name, color, "order") VALUES
  (:org_id, :pipeline_id, 'Prospecção',   '#0A1F3B', 0),
  (:org_id, :pipeline_id, 'Qualificação', '#1E3A5F', 1),
  (:org_id, :pipeline_id, 'Proposta',     '#2A4A6E', 2),
  (:org_id, :pipeline_id, 'Negociação',   '#667085', 3),
  (:org_id, :pipeline_id, 'Fechamento',   '#1F8A5B', 4);
```

---

## O que fica fora do escopo (não construir)

| Funcionalidade | Motivo |
|---|---|
| Contratos e propostas | Solução separada já existe no Clube |
| CTI / telefonia | Módulo futuro |
| Portal do cliente | Módulo futuro |
| Helpdesk / tickets | Módulo futuro |
| Multi-idioma | Cada membro personaliza se necessário |
| Limites de cota por plano | Cada empresa define internamente |

---

## Checklist de início de sprint

Antes de começar qualquer sprint, confirme:

- [ ] Branch criada a partir de `main`
- [ ] `src/lib/via-colors.ts` existe e está correto
- [ ] Design System consultado em `C:\Users\sahho\Documents\Projetos\viver-de-ia\design-system\Viver de IA Design System V2`
- [ ] Nenhum `fetch` direto em componente (usar TanStack Query)
- [ ] Nenhum hex hardcoded fora de `via-colors.ts`
- [ ] Nenhuma string de role além de `'admin'` e `'member'`
- [ ] Todas as páginas novas importadas com `lazy()`
- [ ] Todos os ícones Lucide com `strokeWidth={1.5}`

---

*Guia gerado para uso exclusivo do Claude Code no projeto FlowCRM 2.0.*  
*Repositório: https://github.com/MindOpsTeam/via-flowcrm2.git*  
*Lovable ID: 86df5d75-50df-4efc-bd6d-7b98bc45e5ff*
