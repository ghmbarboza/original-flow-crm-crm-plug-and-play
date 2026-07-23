# FlowCRM 2.0 — Sprint 7: Multicanal e Integração Zernio

**Branch:** `feat/sprint-7-multicanal-zernio`  
**Base:** `main` (após merge dos PRs #3 e #4)  
**Projeto Lovable:** `86df5d75-50df-4efc-bd6d-7b98bc45e5ff`  
**Repositório:** https://github.com/MindOpsTeam/via-flowcrm2.git

---

## Contexto e objetivo

O FlowCRM nasceu com foco em WhatsApp. Este sprint transforma a infraestrutura de mensagens em uma plataforma multicanal, adicionando o Zernio como terceiro provedor e abrindo suporte a Instagram DMs, Telegram, Facebook Messenger e outros canais que o Zernio oferece nativamente.

O usuário (admin da org) escolhe, no onboarding e nas configurações, quais canais ativar e por qual provedor cada canal opera. A experiência de atendimento no inbox unificado permanece a mesma independente do canal escolhido.

**Zernio API:**
- Base URL: `https://zernio.com/api/v1`
- Autenticação: `Authorization: Bearer ZERNIO_API_KEY`
- Documentação completa disponível no arquivo `zernio-api-openapi.yaml` na raiz do projeto

---

## O que NÃO muda

- Lógica de atendimento: status `ai_active`, `human_takeover`, `closed` permanecem iguais
- Regras de follow-up: funcionam da mesma forma em qualquer canal
- IA: continua respondendo pelo mesmo fluxo, independente do canal de origem
- RLS, TanStack Query, lazy(), tokens VIA: todas as regras do guia base permanecem

---

## Parte 1 — Renomeação estrutural (fazer primeiro, antes de qualquer feature nova)

Esta parte é cirúrgica. O objetivo é renomear `whatsapp_*` para `conversations_*` em todo o projeto, tornando a infraestrutura canal-agnóstica.

### Migration 7A — Renomeação de tabelas e enums

```sql
-- 1. Renomear tabelas
ALTER TABLE public.whatsapp_conversations RENAME TO conversations;
ALTER TABLE public.whatsapp_messages RENAME TO conversation_messages;
ALTER TABLE public.whatsapp_config RENAME TO messaging_config;
ALTER TABLE public.whatsapp_ai_config RENAME TO ai_messaging_config;
ALTER TABLE public.evolution_instances RENAME TO evolution_configs;
ALTER TABLE public.meta_instances RENAME TO meta_configs;

-- 2. Adicionar coluna channel em conversations
ALTER TABLE public.conversations
  ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp'
  CHECK (channel IN ('whatsapp','instagram','facebook','telegram','twitter','youtube','reddit','bluesky','threads'));

-- 3. Adicionar coluna channel_contact_id (identificador do contato no canal — não é sempre um telefone)
ALTER TABLE public.conversations
  ADD COLUMN channel_contact_id TEXT;

-- 4. Adicionar coluna channel_contact_name (nome retornado pelo canal, antes de vincular ao contato CRM)
ALTER TABLE public.conversations
  ADD COLUMN channel_contact_name TEXT;

-- 5. Atualizar enum whatsapp_provider para messaging_provider
ALTER TYPE public.whatsapp_provider RENAME TO messaging_provider;
ALTER TYPE public.messaging_provider ADD VALUE IF NOT EXISTS 'zernio';

-- 6. Atualizar coluna provider nas tabelas que usam o enum
ALTER TABLE public.conversations
  ALTER COLUMN provider TYPE messaging_provider
  USING provider::text::messaging_provider;

-- 7. Adicionar coluna assigned_channel em profiles (agente responsável por canal específico)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_channels TEXT[] DEFAULT '{}';

-- 8. Tabela de configuração do Zernio
CREATE TABLE public.zernio_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  webhook_secret TEXT,
  active_channels TEXT[] DEFAULT ARRAY['whatsapp'],
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.zernio_configs ENABLE ROW LEVEL SECURITY;

-- 9. Atualizar realtime para os novos nomes
ALTER PUBLICATION supabase_realtime DROP TABLE public.whatsapp_conversations;
ALTER PUBLICATION supabase_realtime DROP TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages;

-- 10. Recriar indexes com novos nomes
DROP INDEX IF EXISTS idx_wpp_conv_org;
DROP INDEX IF EXISTS idx_wpp_conv_phone;
DROP INDEX IF EXISTS idx_wpp_conv_last;
DROP INDEX IF EXISTS idx_wpp_msg_conv;

CREATE INDEX idx_conv_org     ON public.conversations(org_id);
CREATE INDEX idx_conv_channel ON public.conversations(org_id, channel);
CREATE INDEX idx_conv_phone   ON public.conversations(org_id, phone_number);
CREATE INDEX idx_conv_last    ON public.conversations(org_id, last_message_at DESC);
CREATE INDEX idx_msg_conv     ON public.conversation_messages(conversation_id, sent_at DESC);

-- 11. Policies RLS para zernio_configs (admin only para escrita, member para leitura)
CREATE POLICY "zernio_configs_read" ON public.zernio_configs
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "zernio_configs_write" ON public.zernio_configs
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
```

### Atualização de código após a migration

Após aplicar a migration, atualizar em todo o projeto:

**Hooks a renomear:**
- `useWhatsappConversations` → `useConversations`
- `useWhatsappMessages` → `useConversationMessages`
- `useWhatsappConfig` → `useMessagingConfig`
- `useWhatsappAiConfig` → `useAiMessagingConfig`

**Referências de tabela nos hooks (TanStack Query):**
- `.from('whatsapp_conversations')` → `.from('conversations')`
- `.from('whatsapp_messages')` → `.from('conversation_messages')`
- `.from('whatsapp_config')` → `.from('messaging_config')`
- `.from('whatsapp_ai_config')` → `.from('ai_messaging_config')`
- `.from('evolution_instances')` → `.from('evolution_configs')`
- `.from('meta_instances')` → `.from('meta_configs')`

**Rotas:** mantém `/whatsapp` como rota por compatibilidade, mas o título da página passa a ser "Atendimento" ou "Inbox".

**Checklist de renomeação:**
```bash
grep -r "whatsapp_conversations\|whatsapp_messages\|whatsapp_config\|whatsapp_ai_config\|evolution_instances\|meta_instances" src/ --include="*.tsx" --include="*.ts"
```
Deve retornar zero linhas após a atualização.

---

## Parte 2 — Integração Zernio

### Edge Functions a criar

**`zernio-webhook`** (verify_jwt=false)
```
POST /functions/v1/zernio-webhook

Recebe eventos do Zernio via webhook.
Eventos relevantes:
- message.received → cria/atualiza conversa + mensagem em conversation_messages
- conversation.started → cria conversa nova com channel correto
- message.delivered → atualiza status da mensagem

Fluxo:
1. Verificar assinatura do webhook (header X-Zernio-Signature vs webhook_secret)
2. Identificar org_id pelo profile_id recebido no payload
3. Identificar canal pelo campo platform do payload
4. Buscar ou criar conversa em conversations com UNIQUE(org_id, channel_contact_id, channel)
5. Criar mensagem em conversation_messages com direction='inbound'
6. Se conversa nova e status='ai_active', acionar ai-reply
7. Se número/id não encontrado nos contatos, criar contato com first_name='' e channel_contact_id
```

**`zernio-send-message`**
```
POST /functions/v1/zernio-send-message

Body: { conversation_id, content, type, media_url? }

Endpoint Zernio utilizado:
POST https://zernio.com/api/v1/inbox/conversations/{zernio_conversation_id}/messages
Headers: Authorization: Bearer ZERNIO_API_KEY

Fluxo:
1. Buscar conversa e zernio_config da org
2. Enviar mensagem via Zernio API
3. Salvar em conversation_messages com direction='outbound', is_from_ai=false
4. Atualizar last_message_at e last_message_preview na conversa
```

**`zernio-connect-channel`**
```
POST /functions/v1/zernio-connect-channel

Body: { channel: 'whatsapp' | 'instagram' | 'telegram' | ... }

Endpoint Zernio utilizado:
GET https://zernio.com/api/v1/connect/{channel}?profileId={profile_id}

Retorna URL de OAuth para o admin autorizar o canal.
Após autorização, o Zernio retorna o account conectado.
```

**`zernio-list-accounts`**
```
GET /functions/v1/zernio-list-accounts

Endpoint Zernio utilizado:
GET https://zernio.com/api/v1/accounts?profileId={profile_id}

Retorna contas conectadas no Zernio para exibir no painel de configurações.
```

### Variáveis de ambiente necessárias (Supabase Secrets)

```
ZERNIO_API_KEY        → chave de API do Zernio (zernio.com/dashboard/api-keys)
ZERNIO_WEBHOOK_SECRET → secret para verificar assinatura dos webhooks
```

---

## Parte 3 — Onboarding revisado

O wizard de onboarding (`/setup`) precisa ser reescrito para guiar o usuário canal por canal com clareza.

### Novo fluxo do wizard

**Passo 1 — Boas-vindas**
- Título: "Bem-vindo ao FlowCRM"
- Subtítulo: "Vamos configurar seus canais de atendimento"
- Botão: "Começar"

**Passo 2 — Escolha do modelo de integração**

Exibir três cards lado a lado:

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   Evolution API     │  │   API Oficial Meta  │  │      Zernio         │
│                     │  │                     │  │                     │
│ Conexão via QR Code │  │ Conexão via token   │  │ Multicanal: WhatsApp│
│ Sem conta Meta      │  │ Suporte a campanhas │  │ Instagram, Telegram │
│ Ideal para começar  │  │ Ideal para escala   │  │ e mais 10 canais    │
│                     │  │                     │  │                     │
│ ⚠️ Campanhas em     │  │ ✅ Campanhas        │  │ ✅ Campanhas        │
│ massa não           │  │ disponíveis         │  │ disponíveis         │
│ disponíveis         │  │                     │  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

Texto de apoio abaixo dos cards:
> "Você pode trocar de provedor depois em Configurações > Canais. Se optar pelo Zernio, poderá conectar canais adicionais como Instagram e Telegram a qualquer momento."

**Passo 3a — Configuração Evolution**
- Campo: URL do servidor Evolution
- Campo: API Key
- Campo: Nome da instância
- Botão: "Testar conexão"
- Após sucesso: exibe QR Code para escanear

**Passo 3b — Configuração Meta Oficial**
- Campo: Phone Number ID
- Campo: Business Account ID
- Campo: Access Token
- Botão: "Verificar credenciais"
- Após sucesso: exibe status "Conectado" com número ativo

**Passo 3c — Configuração Zernio**
- Campo: API Key do Zernio
- Campo: Profile ID
- Botão: "Verificar e conectar"
- Após verificação: exibe lista de canais disponíveis para ativar

Sub-passo — Seleção de canais (só para Zernio):
```
Selecione os canais que deseja ativar:

☑ WhatsApp       ☐ Instagram DMs    ☐ Facebook Messenger
☐ Telegram       ☐ Twitter/X DMs    ☐ YouTube comentários
☐ Reddit DMs     ☐ Bluesky DMs      ☐ Threads DMs
```

Para cada canal marcado: botão "Conectar [canal]" que abre OAuth do Zernio.

**Passo 4 — Configuração da IA**
- Nome do agente
- Tom de resposta (dropdown: profissional, amigável, técnico, consultivo)
- Objetivo principal (textarea)
- Toggle: ativar IA agora ou configurar depois

**Passo 5 — Concluído**
- Resumo do que foi configurado
- Link para o inbox
- Link para Configurações > IA (base de conhecimento)

---

## Parte 4 — Inbox multicanal

### Mudanças na tela `/whatsapp` (renomear título para "Atendimento")

**Lista de conversas (coluna esquerda):**
- Adicionar badge de canal ao lado do avatar: ícone pequeno do canal (Lucide `MessageCircle` para WhatsApp, `Instagram` para Instagram, etc.)
- Filtro por canal no topo da lista (chips clicáveis: Todos | WhatsApp | Instagram | Telegram | ...)
- Filtro por agente responsável

**Painel de mensagens (coluna direita):**
- Badge do canal visível no header da conversa
- Indicação do `channel_contact_name` quando não há contato CRM vinculado
- Botão "Vincular contato" para associar a conversa a um contato existente ou criar novo

**Ícones de canal a usar (Lucide com strokeWidth={1.5}):**
```tsx
whatsapp   → MessageCircle
instagram  → Instagram (se disponível) ou Camera
facebook   → Facebook
telegram   → Send
twitter    → Twitter
youtube    → Youtube
reddit     → MessageSquare
bluesky    → Cloud
threads    → AtSign
```

### Seleção de canal ao enviar mensagem

Quando a org tem múltiplos canais ativos, o campo de envio mostra de qual canal a resposta vai sair (informativo, não editável — a resposta sempre vai pelo mesmo canal que recebeu a mensagem).

---

## Parte 5 — Configurações > Canais

Renomear a aba "WhatsApp" em `/settings` para "Canais". Reorganizar em sub-abas:

**Sub-aba: Provedor ativo**
- Card mostrando provedor atual (Evolution / Meta / Zernio)
- Status de conexão em tempo real
- Botão "Trocar provedor" com wizard de reconfiguração

**Sub-aba: Canais ativos (só para Zernio)**
- Lista de canais conectados com status
- Botão "Adicionar canal" → abre OAuth do Zernio para o canal escolhido
- Botão "Desconectar" por canal
- Indicação de quais agentes estão atribuídos a cada canal

**Sub-aba: Distribuição**
- Modo de distribuição: fila aberta, round-robin, IA direciona
- Atribuição por canal: dropdown por canal ativo para definir agente ou time responsável
- Tempo de redistribuição por agente offline

**Sub-aba: Comportamento**
- Configurações específicas por provedor (mantém o que já existe para Evolution e Meta)
- Para Zernio: toggle por canal (responder em grupos, leitura automática)

---

## Parte 6 — Atribuição de agentes por canal

### Mudanças no schema de profiles

O campo `assigned_channels` já foi adicionado na Migration 7A. Ele é um array de strings com os canais que o agente está habilitado a atender. Exemplos:
```
['whatsapp']                          → agente só atende WhatsApp
['instagram', 'facebook']             → agente de redes sociais
['whatsapp', 'instagram', 'telegram'] → atende todos
[]                                    → sem restrição (atende tudo)
```

Array vazio significa sem restrição — atende qualquer canal.

### Distribuição com filtro de canal

Ao receber mensagem em um canal, a distribuição (round-robin ou IA direciona) considera apenas agentes com o canal na lista `assigned_channels` ou com lista vazia.

A lógica fica na edge function `zernio-webhook` e nas já existentes `evolution-webhook` e `meta-webhook`.

---

## Parte 7 — Criação automática de contato multicanal

Quando chega mensagem de identificador desconhecido em qualquer canal:

```typescript
// Lógica de criação automática de contato
const channelContactId = payload.from.id;        // ex: "instagram:123456789"
const channelContactName = payload.from.name;    // ex: "João Silva"
const channel = payload.platform;                 // ex: "instagram"

// Buscar contato existente por channel_contact_id
// Se não encontrar, criar:
{
  org_id,
  first_name: channelContactName || '',
  source: channel,                                // origem = canal
  custom_fields: {
    channel_contact_id: channelContactId,
    channel: channel
  }
}
```

O campo `whatsapp_phone` em `contacts` continua existindo para compatibilidade. Contatos vindos de outros canais usam `custom_fields` para guardar o identificador do canal até que o agente vincule manualmente um telefone.

---

## Deduplicação multicanal

A constraint `UNIQUE(org_id, phone_number)` em `conversations` foi criada para WhatsApp. Para outros canais, o identificador não é um telefone.

Adicionar constraint composta:
```sql
-- Remover constraint antiga
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS whatsapp_conversations_org_id_phone_number_key;

-- Adicionar constraint que considera canal + identificador
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_unique_channel_contact
  UNIQUE (org_id, channel, phone_number);

-- Para canais sem número de telefone, phone_number recebe o channel_contact_id
-- Exemplo: phone_number = 'ig:123456789' para Instagram
```

---

## Regras de negócio específicas do Sprint 7

- Toda conversa tem um `channel` definido no momento da criação. Não pode ser alterado depois.
- A resposta sempre sai pelo mesmo canal que recebeu a mensagem. Não é possível responder via WhatsApp uma mensagem que chegou pelo Instagram.
- Se o usuário tem Evolution ou Meta configurado e também configura Zernio, os provedores coexistem. Cada conversa sabe de qual provedor veio.
- Campanhas (disparos em massa) são disponíveis para Meta Oficial e Zernio. Bloqueadas para Evolution. A tela de campanhas exibe quais provedores estão disponíveis para envio.
- A IA responde em qualquer canal. O prompt e a base de conhecimento são os mesmos. O comportamento é idêntico.
- Fora do horário de atendimento: silêncio em todos os canais, não só WhatsApp.

---

## Edge Functions a atualizar

Além das novas funções Zernio, atualizar referências nas funções existentes:

| Função existente | O que atualizar |
|---|---|
| `evolution-webhook` | Tabela `whatsapp_conversations` → `conversations`, `whatsapp_messages` → `conversation_messages` |
| `evolution-send-message` | Mesmas referências de tabela |
| `meta-webhook` | Mesmas referências de tabela |
| `meta-send-message` | Mesmas referências de tabela |
| `ai-whatsapp-reply` | Renomear para `ai-reply`, atualizar referências |
| `followup-dispatcher` | Atualizar referências de tabela |
| `campaign-dispatcher` | Atualizar referências de tabela + adicionar suporte a Zernio como provedor de envio |
| `transfer-conversation` | Atualizar referências de tabela |
| `resolve-conversation` | Atualizar referências de tabela |

---

## Ordem de execução do Sprint 7

1. Criar branch `feat/sprint-7-multicanal-zernio` a partir da `main`
2. Aplicar Migration 7A via Lovable MCP
3. Atualizar `types.ts` após a migration
4. Atualizar todas as referências de tabela nos hooks e edge functions existentes (renomeação)
5. Rodar `tsc --noEmit` e `npm run test:e2e` para confirmar que nada quebrou
6. Criar edge functions Zernio: `zernio-webhook`, `zernio-send-message`, `zernio-connect-channel`, `zernio-list-accounts`
7. Adicionar `zernio` como opção no wizard de onboarding (`/setup`)
8. Atualizar settings: aba "WhatsApp" → "Canais" com sub-abas
9. Atualizar inbox: badge de canal, filtros, header da conversa
10. Atualizar distribuição de conversas com filtro por canal
11. Rodar suíte E2E completa
12. Commit e push, abrir PR

---

## Checklist de validação do Sprint 7

- [ ] Zero referências a `whatsapp_conversations` ou `whatsapp_messages` em `src/`
- [ ] Conversations com `channel='whatsapp'` continuam funcionando normalmente
- [ ] Wizard de onboarding exibe os 3 provedores com descrição clara
- [ ] Configuração Zernio aceita API Key e Profile ID e verifica conexão
- [ ] Seleção de canais Zernio funciona com OAuth por canal
- [ ] Badge de canal visível no inbox para cada conversa
- [ ] Filtro por canal funciona na lista de conversas
- [ ] Mensagem recebida via Zernio cria conversa com `channel` correto
- [ ] Resposta vai pelo mesmo canal que recebeu
- [ ] Agente com `assigned_channels` restrito não recebe conversas de outros canais
- [ ] Contato criado automaticamente de canal não-WhatsApp tem `source` preenchido
- [ ] tsc limpo, E2E passando

---

## Variáveis de ambiente do Sprint 7

Adicionar no Supabase após deploy:

```
ZERNIO_API_KEY        → obrigatório para Zernio funcionar
ZERNIO_WEBHOOK_SECRET → obrigatório para validar webhooks do Zernio
```

As existentes (`ANTHROPIC_API_KEY`, `META_WEBHOOK_VERIFY_TOKEN`, `FOLLOWUP_CRON_SECRET`) continuam necessárias.

---

*Sprint 7 — FlowCRM 2.0*  
*Repositório: https://github.com/MindOpsTeam/via-flowcrm2.git*  
*Lovable ID: 86df5d75-50df-4efc-bd6d-7b98bc45e5ff*
