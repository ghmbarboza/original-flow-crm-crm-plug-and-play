# Flow CRM 2.0 — Instruções de Build para Claude Code

## Contexto do projeto

Você vai construir o **Flow CRM 2.0** do zero, em cima do projeto base Viver de IA já corrigido.

**Projeto base (ponto de partida):**
- Local: `C:\Users\sahho\Documents\Projetos\viver-de-ia\sabrina-projetobase`
- GitHub: https://github.com/MindOpsTeam/viver-de-ia-projetobase
- Já tem: Auth robusto, tokens VIA completos, Geist, dark mode, roles admin|member, zero hex hardcoded

**Design System de referência:**
- Local: `C:\Users\sahho\Documents\Projetos\viver-de-ia\design-system\Viver de IA Design System V2`
- Consulte esse repositório sempre que precisar de valor de token, cor, componente ou comportamento visual
- Paleta: navy `#0A1F3B`, branco `#FFFFFF`, cinzas, coral `#B85C5C`, success `#1F8A5B` — sem roxo, sem amarelo, sem cyan
- Fonte: Geist Sans + Geist Mono (já configurado no base)

**FlowCRM original (referência de estrutura, NÃO copiar código):**
- Local: `C:\Users\sahho\Documents\Projetos\viver-de-ia\sabrina-projetobase` (se disponível)
- Use apenas como referência de schema e lógica de negócio

---

## O que é o Flow CRM 2.0

CRM completo com IA e WhatsApp nativo, remixável por setor. Cada instalação é single-tenant (um projeto Lovable por cliente).

**Papéis de usuário:**
- `admin` — configura tudo, vê tudo, gerencia usuários e integrações
- `member` — papel base, comportamento depende do sub-papel (diretor, gerente, agente) configurável pelo admin

**Hierarquia configurável:** Admin vincula membros em times. Diretor vê relatórios do seu time. Gerente vê e reatribui conversas e deals do seu time. Agente vê apenas seus próprios registros.

---

## Regras inegociáveis de código

1. **Nunca hardcode hex** — sempre `var(--via-navy)`, `var(--via-coral)` etc ou classes Tailwind `bg-via-navy`
2. **Nunca hardcode strings de role** como `'owner'` ou `'agent'` — apenas `'admin'` e `'member'`
3. **RLS em todas as tabelas** — sem exceção, filtrado por `org_id`
4. **Todo import de página em `lazy()`** com `ErrorBoundary` + `Suspense`
5. **TanStack Query** para todo fetch de dados — sem fetch direto em componente
6. **Realtime** habilitado em: `deals`, `contacts`, `whatsapp_conversations`, `whatsapp_messages`
7. **Lucide React** para ícones, strokeWidth 1.5, sem Sparkles
8. **Sem módulos fora do escopo:** sem contratos, sem roleplay, sem livecoach, sem TypeFlow, sem telefonia

---

## Schema do banco de dados

Construa as migrations em ordem. Cada bloco é uma migration separada.

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

-- Organizations (já existe no base, adicionar campos)
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

-- Capture Forms (formulário público de captura)
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
-- Configuração do provedor ativo
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

-- Configuração de IA para WhatsApp
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

-- Base de Conhecimento da IA
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
  on_limit_reached TEXT NOT NULL DEFAULT 'mark_inactive' CHECK (on_limit_reached IN ('mark_inactive','notify_agent','both')),
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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled','limit_reached')),
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
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','paused','completed','cancelled')),
  message_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  audience_type TEXT NOT NULL DEFAULT 'group' CHECK (audience_type IN ('group','tag','filter','csv')),
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

-- Policies padrão por org (todas as tabelas com org_id)
-- Gera uma policy SELECT+INSERT+UPDATE+DELETE para cada tabela usando user_belongs_to_org()
-- Exceto: audit_logs (somente admin lê), api_keys (somente admin), meta_instances (somente admin)

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Índices críticos
CREATE INDEX idx_contacts_org ON public.contacts(org_id);
CREATE INDEX idx_contacts_owner ON public.contacts(owner_id);
CREATE INDEX idx_contacts_phone ON public.contacts(org_id, whatsapp_phone);
CREATE INDEX idx_deals_org ON public.deals(org_id);
CREATE INDEX idx_deals_stage ON public.deals(stage_id);
CREATE INDEX idx_deals_owner ON public.deals(owner_id);
CREATE INDEX idx_activities_org ON public.activities(org_id);
CREATE INDEX idx_wpp_conv_org ON public.whatsapp_conversations(org_id);
CREATE INDEX idx_wpp_conv_phone ON public.whatsapp_conversations(org_id, phone_number);
CREATE INDEX idx_wpp_conv_last ON public.whatsapp_conversations(org_id, last_message_at DESC);
CREATE INDEX idx_wpp_msg_conv ON public.whatsapp_messages(conversation_id, sent_at DESC);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_audit_org ON public.audit_logs(org_id, created_at DESC);

-- Storage bucket para mídia WhatsApp
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;
```

---

## Rotas e estrutura de páginas

```
/ → Login (fora do AppLayout)
/setup → Wizard de onboarding (fora do AppLayout, fullscreen)
/f/:slug → Formulário público de captura (fora do AppLayout)

AppLayout (sidebar + header):
  /dashboard
  /contacts
  /companies
  /deals
  /deals/:id
  /activities
  /tasks
  /products
  /whatsapp → Inbox de conversas
  /whatsapp/campaigns → Campanhas (só com Meta API Oficial)
  /inbox → Email inbox
  /email-templates
  /email-sequences
  /lead-scoring
  /reports
  /sales-goals
  /automations
  /team
  /settings → aba: geral, whatsapp, ia, follow-up, atendimento, pipeline, produtos, captura, integrações, relatórios, notificações, segurança, demonstração
  /settings/security
```

---

## Sidebar — grupos e itens

```
GRUPO: CRM
  - Dashboard → /dashboard (LayoutDashboard)
  - Contatos → /contacts (Users)
  - Empresas → /companies (Building2)
  - Negócios → /deals (TrendingUp)
  - Atividades → /activities (Activity)
  - Tarefas → /tasks (CheckSquare)
  - Produtos → /products (Package)

GRUPO: ATENDIMENTO
  - WhatsApp → /whatsapp (MessageCircle)
  - Email → /inbox (Mail)

GRUPO: MARKETING
  - Automações → /automations (Zap)
  - Sequências → /email-sequences (GitBranch)

GRUPO: ANALYTICS
  - Relatórios → /reports (BarChart2)
  - Metas → /sales-goals (Target)
  - Lead Scoring → /lead-scoring (Award)

RODAPÉ:
  - Configurações → /settings (Settings)
  - Avatar + nome + logout
```

---

## Edge Functions a criar

```
evolution-webhook/        → recebe eventos da Evolution API
evolution-send-message/   → envia mensagem via Evolution
meta-webhook/             → recebe eventos da Meta API Oficial
meta-send-message/        → envia mensagem via Meta API Oficial
ai-whatsapp-reply/        → gera resposta da IA para WhatsApp
followup-dispatcher/      → pg_cron: dispara follow-ups pendentes
campaign-dispatcher/      → envia campanhas agendadas (Meta apenas)
transfer-conversation/    → transfere conversa entre agentes
resolve-conversation/     → encerra conversa
process-automation/       → executa automações
gmail-initial-sync/       → sync inicial de emails Gmail
ai-copilot/               → copilot global para o CRM
ai-insights/              → insights de deals e contatos
inbound-webhook/          → webhook público de entrada por org_id
public-api/               → API REST pública (contatos, deals, atividades)
invite-member/            → convite por magic link
typeflow-submit/          → processa envio do formulário público de captura
validate-resend-key/      → valida chave Resend
validate-evolution-key/   → valida chave Evolution API
slack-connect/            → OAuth Slack
slack-send-test/          → envia mensagem de teste no Slack
```

---

## Ordem de build — Sprints

### Sprint 1 — Fundação
- Aplicar as 4 migrations acima no projeto base
- Atualizar `App.tsx` com todas as rotas usando `lazy()` + `ErrorBoundary` + `Suspense`
- Atualizar `AppSidebar.tsx` com os 4 grupos e todos os itens acima
- Criar páginas stub para todas as rotas (só o shell, sem conteúdo ainda)
- `AppShell` e `MobileBottomNav` revisados com DS VIA

### Sprint 2 — CRM Core
- `/contacts`: tabela + Kanban por owner, drawer de detalhes, criação, importação CSV, tags
- `/companies`: tabela, drawer, relação com contatos
- `/deals`: Kanban com realtime, lista, filtros, drawer de detalhes
- `/deals/:id`: página completa com produtos vinculados, timeline, atividades
- `/activities` e `/tasks`
- `/products`: CRUD, importação CSV

### Sprint 3 — WhatsApp e IA
- Configuração inicial: wizard de escolha de provedor (Evolution vs Meta)
- `/whatsapp`: inbox unificado, status de conversa, assumir/devolver para IA, transferir
- Configuração de IA: personalidade, base de conhecimento (FAQs, objeções), horário, janela de contexto
- Versionamento de prompts com diff e reversão
- Follow-up automático: régua configurável
- Edge Functions: evolution-webhook, evolution-send-message, meta-webhook, meta-send-message, ai-whatsapp-reply, followup-dispatcher
- `/whatsapp/campaigns`: só aparece para contas com provedor Meta (Evolution vê bloqueio explicativo)

### Sprint 4 — Email, Analytics e Automações
- `/inbox`: email inbox com Gmail sync
- `/email-templates` e `/email-sequences`
- `/automations`: builder visual trigger > condições > ações
- `/reports`: métricas de conversas, deals, follow-ups, leads
- `/sales-goals` e `/lead-scoring`
- Agendamento de relatórios recorrentes

### Sprint 5 — Configurações e Polish
- `/settings` completo: todas as abas documentadas no briefing
- Modo demonstração: seed + limpeza por botão
- Formulário público `/f/:slug`
- Central de ajuda + walkthroughs por módulo
- Notificações: sino, WhatsApp, email
- PWA: manifest + ícone + splash
- Empty states, skeletons, error states em todas as telas
- Auditoria LGPD: log legível com filtros

---

## Regras de negócio críticas para implementar

- Toda conversa nasce com `status = 'ai_active'`
- `status = 'human_takeover'` só via botão "Assumir conversa" ou gatilho automático configurado
- Retorno para `ai_active` é sempre manual ("Devolver para IA")
- Cooldown de 3000ms entre respostas da IA (campo `cooldown_ms` em `whatsapp_ai_config`)
- Número de WhatsApp desconhecido → cria `contact` automaticamente com `first_name = ''`
- Deduplicação por `phone_number` em `whatsapp_conversations`: `UNIQUE(org_id, phone_number)`
- Campanhas: bloquear completamente para provedor `evolution` na interface, com mensagem explicativa
- Follow-up pausa quando `conversation.status = 'human_takeover'`, cancela quando contato responde
- Auditoria: ao deletar contato, anonimizar dados pessoais no log mas manter o registro da ação
- Versionamento de prompts: toda alteração em `whatsapp_ai_config.system_prompt` gera novo registro em `ai_prompt_versions`

---

## Como começar

1. Abra o terminal na pasta `C:\Users\sahho\Documents\Projetos\viver-de-ia\sabrina-projetobase`
2. Confirme que está na branch `main` com o último commit `101f859`
3. Crie uma branch nova: `git checkout -b feat/flowcrm-2-foundation`
4. Execute as migrations na ordem (Sprint 1)
5. Atualize `App.tsx` e `AppSidebar.tsx`
6. Commit por sprint: `feat: sprint 1 — fundação e schema`

Consulte o DS em `C:\Users\sahho\Documents\Projetos\viver-de-ia\design-system\Viver de IA Design System V2` sempre que precisar de valor de token, componente ou comportamento visual.

---

## Arquivo obrigatório — criar antes de qualquer componente

Crie o arquivo `src/lib/via-colors.ts` com o conteúdo abaixo. Este é o único lugar no projeto onde hex literals são permitidos. Todo componente React, todo gráfico Recharts, todo seed de banco deve importar daqui.

```typescript
/**
 * Viver de IA — Paleta de cores canônica
 *
 * REGRA DE USO:
 * - Em componentes React: use classes Tailwind (bg-via-navy, text-via-gray-500)
 *   ou variáveis CSS (var(--via-navy)) sempre que possível.
 * - Use estas constantes APENAS quando precisar de hex literal:
 *   gráficos Recharts, canvas, exportação PDF, seeds de banco de dados.
 * - NUNCA defina hex fora deste arquivo em src/.
 * - NUNCA use roxo, cyan, amarelo, dourado, magenta ou neon.
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

### Regras de aplicação por contexto

**Componentes React (sempre preferir):**
```tsx
// Certo — usa token CSS ou classe Tailwind
<div className="bg-via-navy text-white" />
<div style={{ color: 'var(--via-navy)' }} />

// Errado — hex literal em componente
<div style={{ backgroundColor: '#0A1F3B' }} />
```

**Gráficos Recharts (hex literal obrigatório):**
```tsx
import { VIA_CHART_COLORS } from '@/lib/via-colors';

<Bar dataKey="value" fill={VIA_CHART_COLORS[0]} />
<Line stroke={VIA_CHART_COLORS[1]} />
```

**Pills de status (usando os mapas):**
```tsx
import { VIA_DEAL_STATUS } from '@/lib/via-colors';

const s = VIA_DEAL_STATUS[deal.status];
<span style={{ background: s.bg, color: s.text }}>{s.label}</span>
```

**Seletor de cor para stages/tags (nunca input[type=color] livre):**
```tsx
import { VIA_STAGE_COLORS } from '@/lib/via-colors';

// Renderiza botões coloridos — o usuário escolhe, não digita hex
{VIA_STAGE_COLORS.map(c => (
  <button
    key={c.value}
    style={{ background: c.value }}
    onClick={() => setColor(c.value)}
  />
))}
```

**Seeds de banco (valor default nos stages iniciais):**
```sql
-- Usar apenas valores de VIA_STAGE_COLORS
INSERT INTO pipeline_stages (name, color) VALUES
  ('Prospecção',    '#0A1F3B'),
  ('Qualificação',  '#1E3A5F'),
  ('Proposta',      '#2A4A6E'),
  ('Negociação',    '#667085'),
  ('Fechamento',    '#1F8A5B');
```

### Checklist antes de cada commit

```
grep -r "#[0-9a-fA-F]\{6\}" src/ --include="*.tsx" --include="*.ts" \
  | grep -v "via-colors.ts" \
  | grep -v "//.*#"
```

Se retornar qualquer linha, há hex hardcoded fora do arquivo permitido. Corrija antes do commit.
