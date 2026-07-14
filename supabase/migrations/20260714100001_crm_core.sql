-- =====================================================
-- FlowCRM 2.0 — Migration 1: organizações, enums e núcleo do CRM
--
-- NOTA sobre `organizations`: o guia de build assume que a tabela já existe no
-- projeto base. Ela NÃO existe — o base só tem profiles, user_roles,
-- project_config, api_keys_registry e onboarding_progress. Como todo o RLS do
-- CRM é ancorado em `org_id`, a tabela é criada aqui.
--
-- Cada instalação é single-tenant (um projeto Lovable por cliente): existe uma
-- única organização e todo usuário pertence a ela. O schema mantém `org_id` em
-- todas as tabelas para que o modelo continue correto se um dia virar multi-org.
-- =====================================================

-- Enums -----------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.crm_role AS ENUM ('diretor', 'gerente', 'agente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.contact_status AS ENUM ('lead', 'prospect', 'customer', 'churned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.deal_status AS ENUM ('open', 'won', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.activity_type AS ENUM ('call', 'email', 'meeting', 'note', 'task');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.whatsapp_provider AS ENUM ('evolution', 'meta_official');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.conversation_status AS ENUM ('ai_active', 'human_takeover', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.distribution_mode AS ENUM ('open_queue', 'round_robin', 'ai_directed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Organizations ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Minha empresa',
  logo_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  currency TEXT NOT NULL DEFAULT 'BRL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles: vínculo com a org e sub-papel do CRM ------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS crm_role public.crm_role,
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- =====================================================
-- Bootstrap da organização
--
-- Implementado como trigger em `profiles`, e NÃO dentro de handle_new_user():
-- a função ensure_auth_trigger() do base reescreve handle_new_user() sempre que
-- a considera "desatualizada", o que apagaria qualquer lógica de org que
-- fosse adicionada lá. Um trigger separado sobrevive a esse auto-reparo.
-- =====================================================
CREATE OR REPLACE FUNCTION public.assign_default_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id UUID;
BEGIN
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Serializa a criação da org para que dois signups concorrentes não criem duas.
  LOCK TABLE public.organizations IN SHARE ROW EXCLUSIVE MODE;

  SELECT id INTO _org_id FROM public.organizations ORDER BY created_at LIMIT 1;

  IF _org_id IS NULL THEN
    INSERT INTO public.organizations DEFAULT VALUES RETURNING id INTO _org_id;
  END IF;

  UPDATE public.profiles SET org_id = _org_id WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_default_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_profile_created_assign_org ON public.profiles;
CREATE TRIGGER on_profile_created_assign_org
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.assign_default_org();

-- Backfill: perfis que já existiam antes desta migration.
DO $$
DECLARE
  _org_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE org_id IS NULL) THEN
    SELECT id INTO _org_id FROM public.organizations ORDER BY created_at LIMIT 1;
    IF _org_id IS NULL THEN
      INSERT INTO public.organizations DEFAULT VALUES RETURNING id INTO _org_id;
    END IF;
    UPDATE public.profiles SET org_id = _org_id WHERE org_id IS NULL;
  END IF;
END $$;

-- =====================================================
-- Helpers de RLS
--
-- current_org_id() lê a org do profile do usuário autenticado (lookup no banco,
-- não claim do JWT — claims não são populadas automaticamente no Lovable Cloud).
-- SECURITY DEFINER + STABLE: não recursa nas policies e é avaliada uma vez por query.
-- =====================================================
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _org_id IS NOT NULL AND _org_id = public.current_org_id();
$$;

GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_org(UUID) TO authenticated;

-- Teams -----------------------------------------------------------------
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.team_members (
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);

-- Pipelines -------------------------------------------------------------
CREATE TABLE public.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#0A1F3B',
  win_probability NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.loss_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0
);

-- Companies -------------------------------------------------------------
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  size TEXT,
  website TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  custom_fields JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contacts --------------------------------------------------------------
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT,
  email TEXT,
  phone TEXT,
  whatsapp_phone TEXT,
  title TEXT,
  status public.contact_status NOT NULL DEFAULT 'lead',
  lead_score INTEGER NOT NULL DEFAULT 0,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  source TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}',
  -- Merge manual de contatos (Admin): o registro absorvido aponta para o sobrevivente
  -- em vez de ser apagado, preservando o histórico. NULL = contato ativo.
  merged_into_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tags ------------------------------------------------------------------
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#0A1F3B',
  UNIQUE (org_id, name)
);

CREATE TABLE public.contact_tags (
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

-- Deals -----------------------------------------------------------------
CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  close_date DATE,
  probability NUMERIC NOT NULL DEFAULT 0,
  status public.deal_status NOT NULL DEFAULT 'open',
  loss_reason_id UUID REFERENCES public.loss_reasons(id) ON DELETE SET NULL,
  qualification JSONB NOT NULL DEFAULT '{"budget":null,"authority":null,"need":null,"timeline":null}',
  custom_fields JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.deal_tags (
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, tag_id)
);

-- Products --------------------------------------------------------------
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  is_active BOOLEAN NOT NULL DEFAULT true,
  custom_fields JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.deal_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC GENERATED ALWAYS AS (quantity * unit_price) STORED,
  UNIQUE (deal_id, product_id)
);

-- Activities ------------------------------------------------------------
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type public.activity_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Custom fields ---------------------------------------------------------
CREATE TABLE public.custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contact', 'company', 'deal', 'product')),
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'boolean', 'date', 'select', 'multi_select')),
  options JSONB NOT NULL DEFAULT '[]',
  is_required BOOLEAN NOT NULL DEFAULT false,
  field_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, entity_type, field_key)
);

-- Contact groups --------------------------------------------------------
CREATE TABLE public.contact_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed', 'dynamic')),
  criteria JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.contact_group_members (
  group_id UUID NOT NULL REFERENCES public.contact_groups(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, contact_id)
);
