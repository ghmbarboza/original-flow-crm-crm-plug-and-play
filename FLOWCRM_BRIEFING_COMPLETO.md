# FlowCRM — Briefing Completo de Build
**Versão:** 1.0  
**Data:** Julho 2026  
**Destino:** Claude Code / Lovable  
**Status:** Escopo validado, pronto para build

---

## 1. Identificação do Projeto

**Nome:** FlowCRM  
**Tipo:** CRM completo com IA e WhatsApp nativo, remixável por setor  
**Destino:** Plataforma Viver de IA — principal solução do Clube  
**Modelo de uso:** Cada membro do Clube faz seu próprio remix no Lovable e entrega para uso interno do time do seu cliente  
**Idioma:** Português (cada membro personaliza se necessário)  
**Stack:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Supabase (Lovable Cloud) + TanStack Query  
**Infraestrutura:** 100% Lovable Cloud — sem self-hosted

---

## 2. Objetivo e Público

**Objetivo central:** Oferecer um CRM com pipeline visual, comunicação via WhatsApp com IA nativa, automações, analytics e onboarding guiado — em um único produto remixável por setor.

**Público que usa a plataforma:**
- Admin: configura tudo, vê tudo, gerencia usuários e integrações
- Diretor: vê relatórios consolidados de toda a equipe, metas e forecast — não configura
- Gerente: vê seu time, reatribui conversas e deals, acompanha performance individual
- Agente: vê apenas seus próprios contatos, conversas e deals

A hierarquia é configurável pelo Admin. Diretor tem seu time abaixo, Gerente também. Um Gerente só vê os agentes do seu time.

---

## 3. Tabela de Auditoria — Base FlowCRM Original

| Funcionalidade | Status original | Decisão |
|---|---|---|
| Contatos com campos customizáveis | Completo | Migra |
| Empresas com relação 1:N | Completo | Migra |
| Pipeline Kanban com realtime | Completo | Migra |
| Atividades vinculadas a deal/contato | Completo | Migra |
| Tarefas com filtros | Completo | Migra |
| Email inbox + Gmail sync | Completo | Migra |
| Templates de email com variáveis | Completo | Migra |
| Sequências de email | Completo | Migra |
| Automações com builder visual | Completo | Migra |
| Lead scoring + tracking | Completo | Migra |
| Relatórios e forecast | Completo | Migra |
| IA Copilot + Insights + Sales Manager | Completo | Migra |
| API REST pública + webhooks | Completo | Migra |
| RBAC + 2FA + auditoria técnica | Completo | Migra |
| Onboarding checklist + wizard setup | Completo | Migra |
| Importação via CSV | Completo | Migra |
| Google Calendar sync | Parcial | Reconstruir |
| Contratos (ContractCreateModal) | Parcial | Remove — fora do escopo |
| WhatsApp (tabelas existem) | Desativado | Reconstruir com Nina |
| Timeline cronológica por contato | Não existe | Adicionar |
| Exportação de dados CSV | Não existe | Adicionar |
| Formulário web público de captura | Não existe | Adicionar |
| Módulo de Produtos | Não existe | Adicionar |
| Régua de follow-up WhatsApp | Não existe | Adicionar |
| Central de Ajuda + walkthroughs | Não existe | Adicionar |
| Modo Demonstração | Não existe | Adicionar |
| Notificações WhatsApp para agentes | Não existe | Adicionar |
| Grupos de contatos (fixos e dinâmicos) | Não existe | Adicionar |
| Painel de Configurações repensado | Incompleto | Reconstruir |
| Auditoria legível (Admin/Diretor) | Incompleto | Reconstruir |

---

## 4. Escopo Validado — Módulos do Build

### 4.1 CRM Core (migra do original)
- Contatos, empresas, pipeline, atividades, tarefas
- Campos customizáveis por entidade
- Importação e exportação via CSV
- Timeline cronológica unificada por contato (emails + atividades + notas + tarefas + mensagens WhatsApp)
- Vinculação de Produtos a Deals com cálculo automático de valor

### 4.2 Módulo de Produtos
- Menu próprio acessível no sidebar
- Campos: nome, descrição, preço, campos personalizados livres
- Importação via CSV com template padrão disponível para download
- Vinculação a Deals: ao abrir um deal, o agente seleciona produtos e o valor é calculado
- A IA lê sempre a versão atualizada dos produtos ao responder

### 4.3 WhatsApp — Duplo Provedor
**Provedor 1: Evolution API**
- Self-hosted ou Evolution Cloud
- Conexão via QR Code
- Sem conta Meta Business necessária
- Indicado para clientes menores ou operações iniciais
- Disparos em massa: NÃO disponível (bloqueado na interface com explicação clara ao usuário sobre risco de banimento de número e não conformidade com termos Meta)

**Provedor 2: API Oficial Meta**
- Conexão via access_token + phone_number_id + business_account_id
- Suporte a múltiplas instâncias por conta
- Configurações por instância: resposta a grupos, rejeitar chamadas, mensagem de chamada, always online, leitura automática, webhook
- Disparos em massa: disponível (módulo Campanhas)

**Migração entre provedores:**
- O Admin pode trocar de provedor em Configurações > WhatsApp > Trocar Provedor
- Wizard de reconfiguração com aviso claro sobre o que muda e o que é mantido
- Histórico de conversas preservado, apenas o canal de envio muda

**Regra geral de WhatsApp:**
- Um único número por empresa, configurado pelo Admin
- Notificações do sistema (alertas para agentes) saem pelo mesmo número da empresa

### 4.4 Chat e IA — Módulo Central

**Interface de chat:**
- Inbox unificado de conversas WhatsApp
- Histórico completo sempre visível para o agente (o cliente nunca vê mensagens internas)
- Busca dentro de conversas
- Tags por conversa

**Status de conversa (obrigatório, sempre visível):**
- `IA ativa` — IA respondendo automaticamente
- `Em atendimento humano` — agente assumiu, IA silenciada nessa conversa
- `Encerrada` — conversa finalizada, IA não responde mais

**Transição IA → Humano:**
- Botão "Assumir conversa" disponível para qualquer agente com acesso
- Gatilhos automáticos configuráveis pelo Admin em Configurações > IA > Regras de Acionamento:
  - Por número de mensagens sem entendimento
  - Por palavra-chave detectada (ex: "falar com atendente")
  - Por sentimento negativo identificado
  - Combinação dos três
- Quando acionado automaticamente, o agente responsável recebe notificação via WhatsApp

**Transição Humano → IA:**
- Sempre manual: o agente clica em "Devolver para IA"
- A IA retoma com contexto do histórico completo

**Transferência entre agentes:**
- O agente pode transferir para outro agente ou para fila geral
- Histórico vai junto, o novo agente vê tudo
- O cliente não recebe mensagem automática de transição (troca silenciosa)

**Agente offline:**
- Se agente atribuído fica offline por tempo configurável pelo Admin (padrão sugerido: 30 minutos)
- A conversa volta para fila geral automaticamente
- O Gerente do time recebe notificação via WhatsApp

**Distribuição de conversas:**
- Fila aberta: qualquer agente do time pode pegar
- Round-robin: sistema distribui automaticamente em rotação
- Direcionamento por IA: quando a IA entende o contexto, pode direcionar para agente ou equipe específica
- Modo de distribuição configurável pelo Admin em Configurações > Atendimento

### 4.5 IA — Configuração e Comportamento

**Base de Conhecimento:**
- Menu próprio em Configurações > IA > Base de Conhecimento
- Campos: nome, descrição, tom de resposta, objetivo do agente
- Seção de Produtos (sincronizada com o Módulo de Produtos)
- Seção de FAQs: pergunta + resposta
- Seção de Objeções: objeção + como contornar
- Importação via CSV disponível

**Horário de atendimento:**
- Configurável por dia da semana e horário
- Fora do horário: IA fica em silêncio total (não envia mensagem automática)
- Mensagens recebidas fora do horário ficam na fila para o próximo dia útil

**Janela de contexto:**
- Padrão: últimas 20 mensagens da conversa
- Configurável pelo Admin (mínimo 10, máximo 50)
- Documentado na Central de Ajuda com explicação de impacto em custo e qualidade

**Comportamento de falha da IA:**
- Duplicação de mensagens: detectada e bloqueada (cooldown de 3 segundos entre respostas)
- Não entendimento: após X tentativas configuráveis, aciona humano automaticamente em vez de inserir regras no prompt
- Respostas sem sentido: log de erro registrado + notificação ao Admin

**Versionamento de Prompts:**
- Toda alteração no prompt ou base de conhecimento cria uma nova versão com timestamp e autor
- Alterações refletem imediatamente em toda a plataforma (conversas em andamento incluídas)
- Reversão disponível para qualquer versão anterior com um clique
- Ao reverter, o sistema exibe diff visual mostrando o que mudou
- Histórico de versões visível para Admin com notas opcionais por versão

### 4.6 Follow-up Automático

- Configurável pelo usuário em Configurações > IA > Follow-up
- Parâmetros configuráveis:
  - Tempo de espera antes do primeiro follow-up
  - Mensagem de cada etapa (editável com variáveis)
  - Número máximo de tentativas
  - Intervalo entre tentativas
  - O que fazer ao atingir o limite: marcar como inativo, notificar agente, ou ambos
- Follow-up sempre enviado pela IA
- Se a conversa foi assumida por humano, o follow-up automático pausa
- Quando o contato responde, o follow-up cancela automaticamente
- Documentado na Central de Ajuda com boas práticas de intervalo para evitar banimento

### 4.7 Campanhas de Disparo (API Oficial apenas)

- Módulo acessível apenas para contas com provedor API Oficial Meta
- Para contas Evolution: módulo visível com bloqueio e mensagem explicativa ("Campanhas em massa disponíveis apenas na integração via API Oficial Meta. Isso garante estabilidade, conformidade com os termos da Meta e protege seu número contra banimento.")
- Wizard de criação de campanha:
  - Seleção de público: contatos do CRM por grupo, tag ou filtro; ou upload de CSV
  - Upload CSV: valida números, mapeia colunas, importa contatos novos automaticamente com registro de origem
  - Editor de mensagem com variáveis
  - Agendamento de envio
  - Intervalo mínimo entre mensagens: fixo no código como proteção silenciosa (boas práticas Meta)
  - Validação de números antes do envio
- Acompanhamento: status por campanha (rascunho, enviando, pausada, concluída, cancelada)
- Contatos novos vindos de CSV são criados no CRM com tag de origem da campanha

### 4.8 Grupos de Contatos

- Grupos fixos: Admin ou agente seleciona contatos manualmente
- Grupos dinâmicos: baseados em critérios automáticos (ex: "todos no estágio Proposta Enviada", "todos com tag Cliente Ativo", "todos sem resposta há X dias")
- Usados para: segmentação de campanhas, filtros de relatório, distribuição de conversas
- Gerenciado em Contatos > Grupos

### 4.9 Formulário Web Público de Captura

- Gerado em Configurações > Captura de Leads
- Campos configuráveis + campos obrigatórios
- Ao submeter: cria contato no CRM com origem registrada, cria deal no pipeline configurado, aciona automação se definida
- Snippet de embed disponível para sites externos
- Página pública com URL própria também disponível

### 4.10 Relatórios e Analytics

- Visualização dentro da plataforma com filtros por período, agente, pipeline e equipe
- Exportação em CSV e PDF
- Relatórios agendados: Admin, Diretor e Gerente podem configurar envio recorrente por email ou WhatsApp
- Configuração em Configurações > Relatórios > Recorrência
- Conteúdo do relatório agendado: métricas de conversas, deals por estágio, conversão, TMA, follow-ups, leads gerados

### 4.11 Notificações

- Canal configurável por usuário em Configurações > Notificações:
  - Dentro da plataforma (sino)
  - WhatsApp (mesmo número da empresa)
  - Email
- Eventos configuráveis: nova mensagem atribuída, IA acionou humano, agente offline redistribuiu conversa, meta atingida, relatório agendado disponível
- Admin define quais eventos geram notificação por padrão; cada usuário pode ajustar o canal

### 4.12 Central de Ajuda + Onboarding

**Walkthrough ativo:**
- Aparece na primeira vez que o usuário acessa cada módulo principal
- Adaptado por papel: Admin vê tour de configuração, Agente vê tour de operação, Gerente vê tour de gestão
- Pode ser reativado manualmente pelo usuário a qualquer momento

**Central de Ajuda (ícone fixo na interface):**
- FAQ por módulo com busca
- Tutoriais passo a passo por funcionalidade
- Insights de uso: mostra o que o usuário ainda não explorou com sugestão de próximo passo ("Você tem 10 contatos mas nunca configurou follow-up automático. Veja como em 2 minutos.")
- Seção de Boas Práticas: janela de contexto da IA, intervalos de follow-up, configuração de horário, proteção de número WhatsApp

### 4.13 Modo Demonstração

- Botão único em Configurações > Modo Demonstração > "Carregar dados de exemplo"
- Popula toda a plataforma: contatos, empresas, deals em todas as etapas, conversas com histórico, follow-ups, campanhas, métricas de dashboard, relatórios
- Dados realistas e coerentes entre si (contato vinculado ao deal vinculado à conversa)
- Segundo botão: "Remover dados de exemplo" — limpa tudo de uma vez sem afetar dados reais
- Útil para demos para clientes, gravações e apresentações

### 4.14 Painel de Configurações Repensado

Seções com linguagem acessível e guias contextuais em cada campo:

**Organização:** nome, logo, fuso horário, dados da empresa

**Usuários e Permissões:**
- Convidar usuários por email (magic link)
- Definir papel: Admin, Diretor, Gerente, Agente
- Vincular Gerente a Agentes, Diretor a Gerentes
- Matriz de permissões configurável

**WhatsApp:**
- Provedor atual + status de conexão em tempo real
- Trocar provedor (wizard com aviso)
- Configurações de comportamento por instância
- Múltiplas instâncias (API Oficial)

**IA:**
- Personalidade do agente (nome, tom, objetivo)
- Base de conhecimento (produtos, FAQs, objeções)
- Horário de atendimento
- Janela de contexto
- Regras de acionamento de humano
- Versionamento de prompts

**Follow-up:**
- Régua de tentativas
- Mensagens por etapa com variáveis
- Comportamento ao atingir limite

**Atendimento:**
- Modo de distribuição de conversas (fila aberta, round-robin, IA direciona)
- Tempo para redistribuição por agente offline
- Status padrão de novas conversas

**Pipeline:**
- Criar, renomear, reordenar etapas
- Motivos de perda
- Gatilhos de automação por etapa

**Produtos:**
- CRUD de produtos
- Importação CSV
- Template de planilha disponível para download

**Captura de Leads:**
- Formulário público configurável
- URL e snippet de embed

**Integrações:**
- Email (Resend): chave, from, domínio
- Slack: OAuth, canal de notificação
- Google Calendar: OAuth
- API Pública: gerar e revogar chaves

**Relatórios:**
- Agendamento recorrente
- Canal de entrega (email ou WhatsApp)

**Notificações:**
- Eventos e canais por papel

**Segurança:**
- 2FA/TOTP
- Log de auditoria (legível, com filtros por usuário, ação e data)
- Sessões ativas

**Modo Demonstração:**
- Carregar e remover dados de exemplo

---

## 5. Regras de Negócio — Registro Completo

### Hierarquia e Visibilidade
- Admin: acesso total a tudo
- Diretor: vê relatórios e métricas do seu time e dos times abaixo, não configura plataforma
- Gerente: vê seu time, pode reatribuir conversas e deals, acompanha performance individual dos seus agentes
- Agente: vê apenas seus próprios contatos, conversas e deals
- A hierarquia é configurável: Admin vincula Gerente a Agentes e Diretor a Gerentes

### Contatos e Deduplicação
- Toda mensagem de número desconhecido cria contato automaticamente
- A IA é configurada para perguntar informações na conversa
- Contato sem nome identificado fica sem nome até ser atualizado
- Histórico de mensagens sempre mantido no contato
- Se o número já existe no sistema com dado diferente: mantém um único registro, histórico preservado, dado mais recente prevalece — sem duplicação
- Admin pode mesclar contatos manualmente

### Conversa e Status
- Toda conversa tem status explícito: IA ativa / Em atendimento humano / Encerrada
- Retorno para IA após atendimento humano: sempre manual (botão "Devolver para IA")
- Transferência entre agentes: silenciosa para o cliente, histórico completo visível para o novo agente
- Agente offline por tempo configurável: conversa vai para fila geral + notificação ao Gerente

### IA e Prompts
- Alterações em prompt e base de conhecimento: refletem imediatamente em toda a plataforma
- Versionamento: toda alteração gera nova versão com timestamp, autor e notas opcionais
- Reversão: disponível para qualquer versão, aplica imediatamente
- A IA sempre lê a versão atual dos Produtos ao responder
- Janela de contexto: 20 mensagens por padrão, configurável entre 10 e 50

### Follow-up
- Sempre enviado pela IA
- Pausa se a conversa foi assumida por humano
- Cancela automaticamente se o contato responder
- Parâmetros inteiramente configuráveis pelo usuário

### WhatsApp e Número
- Um único número por empresa
- Notificações do sistema saem pelo mesmo número da empresa
- Disparos em massa: exclusivos para API Oficial Meta
- Evolution: disparos bloqueados com mensagem explicativa na interface

### Produtos
- Vinculados a Deals com cálculo automático de valor
- Importação via CSV com template padrão
- Campos personalizados disponíveis
- IA lê sempre a versão atualizada

### Relatórios
- Exportação em CSV e PDF
- Agendamento recorrente com entrega por email ou WhatsApp
- Visível para Admin, Diretor e Gerente conforme hierarquia

### Auditoria
- Log completo de todas as ações: quem fez, o que fez, quando, de qual IP, tempo de sessão
- Acessível para Admin em linguagem legível com filtros
- Boas práticas de mercado para LGPD: dados de contatos excluídos são anonimizados nos logs, o registro da ação é mantido para compliance

### Modo Demonstração
- Dados padronizados, carregados e removidos por botão
- Não afeta dados reais
- Disponível para todos os papéis (cada um vê a demo no contexto do seu papel)

---

## 6. Integrações

| Integração | Provedor | Onde configura | Observação |
|---|---|---|---|
| WhatsApp | Evolution ou API Oficial Meta | Configurações > WhatsApp | Escolha no setup inicial, migrável depois |
| Email transacional | Resend | Configurações > Integrações | Templates com variáveis |
| Email inbox | Gmail | Configurações > Integrações | Sync inicial via Edge Function |
| Calendário | Google Calendar | Configurações > Integrações | OAuth, reconstruir do parcial |
| Notificações | Slack | Configurações > Integrações | OAuth |
| IA | Lovable AI Gateway | Automático | Sem API key do usuário |
| API pública | REST própria | Configurações > Integrações | Chaves geráveis e revoáveis |
| Webhooks | Entrada por org_id | Configurações > Integrações | Entidades: contact, company, deal, activity |

---

## 7. Arquitetura e Boas Práticas Técnicas

- Stack: React 18 + TypeScript strict + Vite + Tailwind + shadcn/ui + TanStack Query
- Backend: Lovable Cloud (Supabase: Postgres + Auth + Realtime + Edge Functions Deno)
- Cada remix gera uma instância Lovable independente por cliente (single-tenant por instalação)
- RLS habilitado em todas as tabelas com políticas por authenticated user
- Fila de mensagens WhatsApp via Edge Function com tratamento de concorrência
- Cooldown de 3 segundos entre respostas da IA para evitar duplicação
- Erros sempre visíveis para o usuário com mensagem amigável e orientação de resolução
- Mobile: PWA com atalho de aplicativo (não nativo), layout responsivo com MobileBottomNav
- Code splitting: toda página em lazy() com ErrorBoundary + Suspense
- Dados de demonstração: seed completo e coerente ativado por botão

---

## 8. O que Fica de Fora (Decisão Validada)

| Funcionalidade | Motivo |
|---|---|
| Contratos e propostas | Existe solução separada no Clube |
| CTI / telefone | Módulo futuro |
| Portal do cliente / self-service | Módulo futuro |
| Tickets de suporte / helpdesk | Módulo futuro |
| Multi-idioma | Cada membro personaliza se necessário |
| Limites de cota por plano | Cada empresa define internamente |

---

## 9. Checklist Pré-Build

- [ ] Projeto Lovable criado e conectado ao Supabase
- [ ] LOVABLE_API_KEY configurada (auto)
- [ ] Resend configurado (from_email + api_key)
- [ ] Variáveis de ambiente do WhatsApp definidas conforme provedor escolhido
- [ ] Google OAuth configurado (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET)
- [ ] Slack OAuth configurado (se necessário no setup inicial)
- [ ] Design system do Viver de IA aplicado (tokens HSL, logo, cores)
- [ ] Seed de demonstração preparado antes do lançamento
- [ ] Documentação interna de configuração produzida para membros do Clube

---

## 10. Registro de Decisões

| Decisão | Escolha | Motivo |
|---|---|---|
| Multi-tenant | Single-tenant por instalação | Cada remix é um projeto Lovable independente |
| Número WhatsApp | Um por empresa | Preserva marca, facilita escala |
| Distribuição de conversas | Configurável (fila, round-robin, IA direciona) | Atende diferentes portes de operação |
| Follow-up | Sempre pela IA | Consistência e automação |
| Disparos em massa | Exclusivo API Oficial | Proteção de número e conformidade Meta |
| Retorno IA após humano | Manual | Controle do agente, evita interferência |
| Alteração de prompt | Reflete imediatamente | Comportamento esperado pelo usuário |
| Reversão de prompt | Aplica imediatamente | Consistência com regra acima |
| Contato sem nome | Criado sem nome | Histórico preservado sempre |
| Deduplicação | Um registro, sem duplicatas | Integridade do banco |
| Mobile | PWA / atalho de app | Não nativo, menor complexidade |
| Contratos | Fora do escopo | Solução separada já existe no Clube |
| Idioma | Português | Membros personalizam se necessário |
| Auditoria LGPD | Anonimiza dados, mantém registro da ação | Compliance sem perder rastreabilidade |
| Modo demo | Botão de seed e limpeza | Simples, sem ambiente separado |
| Agente offline | Redistribui após tempo configurável | Evita cliente sem resposta |
