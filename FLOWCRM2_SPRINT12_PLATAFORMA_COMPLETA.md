# FlowCRM 2.0 — Sprint 12: plataforma completa

Guia de construção. Cada bloco é uma entrega fechada (migration + functions + telas + prova), commitada na `main` e publicada. Um agente novo consegue executar qualquer bloco lendo só este arquivo, o `CLAUDE.md` e os arquivos citados.

Decisões da Sabrina (23/09/2026) que valem para todos os blocos:

- Configurações ganham **abas dedicadas por assunto**. Nada de empilhar recursos novos em abas existentes.
- Alerta do Evolution é só notificação de risco, sem orientação de boas práticas.
- Tudo configurável pelo usuário; o padrão nasce ligado quando o recurso é seguro e desligado quando tem custo externo (envio pago, ligação, API de terceiro).
- Prova real antes de dar por pronto: vitest, tsc, lint, build, e2e da tela, hard smoke contra produção quando toca function ou banco.
- Deploy: `git push` publica o front só com Publicar da Sabrina; function só publica pelo agente da Lovable com `supabase--deploy_edge_functions` (conferir `lovable_function_detail`); migration aplica com `lovable_query_sql read_only=false`.

Estado de partida: commit `7e4b480` (23/09/2026). Já entregues antes deste sprint: histórico automático do negócio, IA move etapa, abordagem ativa por canal, template aprovado selecionável, condição por origem nas automações.

## Mapa dos blocos e ordem

| Bloco | Assunto | Depende de | Aba nova em Configurações |
|---|---|---|---|
| B1 | E-mail de sistema com Resend | nada | **E-mail** |
| B2 | Notificações reais (atribuição, WhatsApp, e-mail, modelos) | B1 | Notificações ganha sub-abas **Preferências** e **Modelos** |
| B3 | Formulários: embed, UTM, campos novos, condicionais | nada | Captura de Leads vira **Formulários** |
| B4 | Perfis da IA por origem | B3 (origem pela UTM) | IA ganha sub-aba **Por origem** |
| B5 | API pública com escopos | nada | **API** |
| B6 | Produtos e serviços + modelo de negócio | nada | (página Produtos) + wizard |
| B7 | Kit inicial gerado no wizard | B6 | (wizard) + Biblioteca |
| B8 | Migração de CRMs: CSV universal | nada | **Importação** |
| B9 | Migração de CRMs: conectores por API | B8 | Importação |
| B10 | Nina: RAG (base de conhecimento vetorial) | nada | IA > Conhecimento (troca a busca) |
| B11 | Nina: agenda nativa, lembrete e no-show | nada | **Agenda** |
| B12 | Nina: análise pós-conversa | nada | IA ganha sub-aba **Análises** |
| B13 | Nina: voz (ligações) | B10 | **Voz** |

Paralelizáveis: B1, B3, B5, B6, B8, B10, B11, B12 não compartilham arquivos entre si. B2 depende de B1; B4 de B3; B7 de B6; B9 de B8; B13 de B10.

Ordem de execução escolhida: B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8 → B9 → B10 → B11 → B12 → B13.

## Invariantes (valem após todo bloco)

- `npm test`, `npx tsc -b --noEmit`, `npm run lint` (0 erros), `npm run build` verdes.
- `npx playwright test --project=chromium` verde nas specs tocadas; `npm run test:hard` verde nas specs tocadas.
- Nenhuma edge function nova sem `chamadaInterna` ou `cronAutorizado` quando for interna, ou sem checagem de sessão + org quando for chamada pelo front (padrão de `evolution-connect`).
- Toda tabela nova com RLS `user_belongs_to_org(org_id)` e probe anônimo sem vazamento.
- Remix: tudo que for cron, vault ou realtime entra em `garantir_infra_do_projeto()` (migration `20260915120000`).
- Texto de tela em pt-BR, sem travessão, sem jargão.

---

## B1. E-mail de sistema com Resend

**Contexto.** Hoje todo e-mail sai pelo Gmail conectado por OAuth (`supabase/functions/send-email`, `gmail-*`, `automation-dispatcher` ação `send_email`). O Resend só existe como tutorial de chave em `src/lib/apiKeyTutorials.ts:193-202`; nenhum código o usa. Sem e-mail de sistema, notificações por e-mail (B2) não têm por onde sair.

**Entrega.**
1. Tabela `email_settings` (org_id único, `provider` 'resend'|'gmail', `from_name`, `from_email`, `reply_to`, `domain_verified` bool, `updated_at`). Chave do Resend no Vault por org (`store-api-key` com provider `resend`, já suportado pelo diálogo genérico).
2. Function `resend-send` (interna, `chamadaInterna`): recebe `{org_id, to, subject, html, text?, reply_to?, tags?}`, lê a chave no Vault (`get_org_api_key`), envia via `https://api.resend.com/emails`, grava em `emails` com `provider = 'resend'` e `direction = 'outbound'`. Function `resend-domain-status` (front, sessão + org): consulta `GET /domains` e devolve se o domínio do `from_email` está verificado, com os registros DNS pendentes.
3. `send-email` e `automation-dispatcher.actSendEmail` passam a escolher o provedor: `email_settings.provider = 'resend'` → `resend-send`; senão Gmail como hoje.
4. Aba **E-mail** em Configurações (`SettingsPage.tsx` `VALID_TABS` + `TAB_META`): provedor (Resend ou Gmail), remetente, domínio (status DNS com botão "Verificar"), botão "Enviar teste para mim". A configuração do Gmail (hoje em Integrações > GmailSetup) migra para esta aba; Integrações mantém só um card que aponta para cá.
5. Sequências de e-mail (`email-sequence` dispatcher) usam o mesmo seletor de provedor.

**Prova.** vitest do seletor de provedor; hard smoke: `resend-send` com a `integration-sandbox` fingindo o Resend (capturar POST /emails com from/to/subject) e `emails` gravado; e2e da aba E-mail (salvar remetente, ver status do domínio, botão de teste com toast).

**Arquivos.** `supabase/migrations/2026092416xxxx_email_settings.sql`, `supabase/functions/resend-send/index.ts`, `supabase/functions/resend-domain-status/index.ts`, `supabase/functions/_shared/email.ts` (seletor), `src/components/settings/EmailSettings.tsx`, `src/hooks/useEmailSettings.ts`, `src/pages/SettingsPage.tsx`, `e2e/email-settings.spec.ts`, `e2e/hard/resend.spec.ts`.

## B2. Notificações reais

**Contexto.** `create_notification` e `notify_org_admins` (migration `20260722100002`) gravam só no app e respeitam só `channel_in_app`. A tela Notificações mostra E-mail e WhatsApp, mas nada lê `channel_email`/`channel_whatsapp` nem `profiles.phone`. Não há evento de atribuição ("negócio/lead/conversa caiu para mim"). Textos fixos no SQL.

**Entrega.**
1. Eventos novos, por trigger: `negocio_atribuido` (deals.owner_id muda para alguém), `lead_atribuido` (contacts.owner_id muda), `conversa_atribuida` (conversations.assigned_to muda). Removem-se da tela os eventos sem produtor (`tarefa_vencendo`, `mensagem_whatsapp`, `email_recebido`) ou ganham produtor: `tarefa_vencendo` por cron diário (tarefas com due_date nas próximas 24h), os outros dois saem.
2. Tabela `notification_templates` (org_id, event_type, `title_template`, `body_template`, `whatsapp_template`, `email_subject`, `email_html`, `updated_at`; único por org+evento). Seed por org com os textos atuais (função `seed_notification_templates(org)`, chamada em `assign_default_org` e em `garantir_infra_do_projeto`). Variáveis: `{{user.first_name}}`, `{{contact.name}}`, `{{deal.title}}`, `{{deal.value}}`, `{{stage.name}}`, `{{conversation.phone}}`, `{{link}}`.
3. `create_notification` passa a renderizar título/corpo do template da org (fallback ao texto passado) e a enfileirar entregas externas em `notification_deliveries` (id, notification_id, channel 'whatsapp'|'email', status, attempts, error, scheduled_at) quando `notification_preferences` do usuário tiver o canal ligado.
4. Function `notification-dispatcher` (cron a cada minuto, `cronAutorizado`): lê `notification_deliveries` pendentes; WhatsApp sai pelo canal da org (Evolution texto; Meta e Zernio exigem template aprovado configurado em `notification_templates.whatsapp_template` como nome de template) para `profiles.phone` do usuário; e-mail sai por `_shared/email.ts` (B1). Retry 1m/5m/30m, depois `failed`.
5. Aba Notificações vira duas sub-abas: **Preferências** (grade evento × canal, agora real, com o telefone do usuário exibido e link para Geral quando vazio) e **Modelos** (admin edita título, corpo, assunto/HTML do e-mail e template de WhatsApp por evento, com prévia e "Restaurar padrão").
6. Perfil: `profiles.phone` ganha validação de formato e aviso "usado para avisos por WhatsApp".

**Prova.** SQL: mover owner_id gera `negocio_atribuido` para o novo dono. Hard smoke: preferência WhatsApp ligada + Evolution sandbox → `notification-dispatcher` manda para o telefone do usuário e marca `sent`; e-mail via Resend sandbox. e2e: editar modelo e ver prévia; ligar canal e ver telefone.

**Arquivos.** `supabase/migrations/2026092417xxxx_notificacoes_reais.sql`, `supabase/functions/notification-dispatcher/index.ts`, `src/components/settings/NotificationPreferences.tsx` (sub-abas), `src/components/settings/NotificationTemplatesSettings.tsx`, `src/hooks/useNotificationTemplates.ts`, `e2e/notifications.spec.ts`, `e2e/hard/notificacoes.spec.ts`.

## B3. Formulários: embed, UTM, campos novos, condicionais

**Contexto.** Só existe a página `/f/:slug` (`src/pages/PublicFormPage.tsx`, function `submit-capture-form`). Sem embed, sem UTM, `source` fixo `capture_form`, 4 tipos de campo, sem condição.

**Entrega.**
1. `capture_forms.fields[]` ganha tipos `select` (opções), `checkbox`, `radio`, `number`, `date`, `hidden`; cada campo aceita `show_when: {field, op: 'eq'|'neq'|'contains'|'not_empty', value}`. Renderização condicional em `PublicFormPage` e validação no servidor (campo oculto não é obrigatório).
2. `capture_forms` ganha `source_default` (texto, padrão `capture_form`), `success_message`, `redirect_url`, `theme` (cor primária, fundo, fonte), `consent_text`.
3. Rastreamento: a página pública e o embed capturam `utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid, referrer, page_url` e mandam em `tracking`. A function grava `contacts.source = utm_source || source_default`, `custom_fields.utm_*`, `custom_fields.landing_page`, e `tracking_events` (tabela já existe) com `form_submitted`.
4. Embed: function pública `capture-form-embed` serve `embed.js?form=<slug>` que injeta um iframe responsivo de `/f/<slug>?embed=1` e repassa as UTMs da página mãe pela query. A tela mostra os dois códigos (script e iframe) com botão copiar. `PublicFormPage` em modo embed esconde cabeçalho e ajusta altura por `postMessage`.
5. Aba **Formulários** (renomeia "Captura de Leads"; `VALID_TABS` mantém `capture` com redirect): editor com os campos novos, regra "mostrar quando", aparência, códigos de embed e contagem de envios por formulário (de `tracking_events`).

**Prova.** vitest do avaliador de `show_when`; e2e: criar formulário com select + condição, abrir `/f/slug?utm_source=meta_ads`, preencher, ver contato com `source = meta_ads`; hard: POST na function com tracking e conferir `custom_fields`.

**Arquivos.** `supabase/migrations/2026092418xxxx_formularios_v2.sql`, `supabase/functions/submit-capture-form/index.ts`, `supabase/functions/capture-form-embed/index.ts`, `src/lib/formRules.ts`, `src/pages/PublicFormPage.tsx`, `src/components/settings/CaptureFormsSettings.tsx` (vira `FormsSettings.tsx`), `e2e/forms.spec.ts`.

## B4. Perfis da IA por origem

**Contexto.** A IA tem um perfil por org (`ai_messaging_config`). A abordagem ativa aceita instrução por automação, mas o atendimento não sabe a origem do lead.

**Entrega.**
1. Tabela `ai_source_profiles` (org_id, `source` texto único por org, `label`, `instruction` extra para o atendimento, `outreach_instruction`, `outreach_template_name`, `funnel_mode` 'inherit'|'auto'|'suggest', `initial_stage_id`, `is_active`).
2. `ai-reply`: resolve `contacts.source` da conversa; se houver perfil ativo, anexa `instruction` ao prompt e sobrescreve `funnel_actions.mode` quando `funnel_mode != 'inherit'`. `ai-outreach`: usa `outreach_instruction`/`outreach_template_name` do perfil quando a ação da automação não informar. `submit-capture-form` e `webhook-inbound`: se o perfil tiver `initial_stage_id`, o negócio nasce nela.
3. Sub-aba **Por origem** na aba IA: lista de origens (sugeridas por `useContactSources`), cada uma com instrução, abordagem, modo do funil e etapa inicial; botão "Testar" que chama `ai-reply` em modo simulação (conversa demo) mostrando a resposta com e sem o perfil.

**Prova.** hard: contato com `source = meta_ads` + perfil com instrução "sempre ofereça a demonstração gratuita" → resposta da IA contém a oferta; e2e da sub-aba.

**Arquivos.** migration, `supabase/functions/ai-reply/index.ts`, `ai-outreach/index.ts`, `src/components/settings/ai/SourceProfilesPanel.tsx`, `src/hooks/useAISourceProfiles.ts`.

## B5. API pública com escopos

**Contexto.** `webhook-inbound` só escreve; `api_keys` existe sem uso; sem leitura de funil, contato, negócio ou conversa; sem `message.*`.

**Entrega.**
1. `api_keys` ganha `scopes text[]` (`contacts:read`, `contacts:write`, `deals:read`, `deals:write`, `conversations:read`, `conversations:write`, `pipelines:read`, `activities:write`, `products:read`, `knowledge:read`) e `rate_limit_per_minute` (padrão 120). Chave `fcrm_live_...`, hash SHA-256, exibida uma vez.
2. Function `api` (verify_jwt false, roteador por caminho): `GET /pipelines`, `GET /contacts?email|phone|id`, `GET /contacts/:id` (com tags, negócios, últimas atividades), `POST /contacts`, `GET /deals/:id`, `POST /deals`, `PATCH /deals/:id` (stage por id ou nome, pipeline, owner, company, custom_fields, products), `GET /conversations?phone`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages` (registra mensagem enviada por SDR externo, marca `is_from_ai` false e `external_agent` no metadata), `POST /conversations/:id/send` (envia pelo canal da org), `POST /conversations/:id/handoff` (human_takeover) e `/pause-ai`, `POST /activities`, `GET /products`, `GET /knowledge` (FAQs, objeções). Rate limit por chave em `api_rate_limits` (janela por minuto). Todo acesso em `api_request_logs`.
3. Eventos de saída novos no `webhook-dispatcher`: `message.sent`, `conversation.started`, `conversation.handoff`, `deal.assigned`.
4. Aba **API**: chaves (criar com escopos, revogar, último uso), logs recentes, e a documentação OpenAPI gerada (`/api/openapi.json`) com exemplos de curl. `WEBHOOKS.md` ganha a seção da API.

**Prova.** hard: chave com `deals:write` cria e move negócio; chave sem escopo recebe 403; `POST /conversations/:id/messages` aparece na inbox; rate limit devolve 429; e2e da aba.

**Arquivos.** migration, `supabase/functions/api/index.ts` (+ `rotas/*.ts`), `supabase/functions/_shared/apiAuth.ts`, `src/components/settings/ApiSettings.tsx`, `src/hooks/useApiKeys.ts`, `WEBHOOKS.md`.

## B6. Produtos e serviços + modelo de negócio

**Contexto.** `products` sem tipo; serviço = produto sem estoque. Org sem modelo de negócio. Negócio liga a contato e empresa, ambos opcionais.

**Entrega.**
1. `products` ganha `kind` ('product'|'service'|'subscription'), `billing` ('one_time'|'monthly'|'yearly'|'hourly'), `unit` (un, h, mês, pacote), `duration_minutes` (serviço), `setup_fee`. `deal_products` ganha `billing` copiado.
2. `organizations.business_model` ('b2b'|'b2c'|'b2b2c'|'mixed'). Regras: `b2b` exige empresa no negócio (validação no form e no `webhook-inbound`); `b2c` esconde a coluna empresa do Kanban; `b2b2c` mostra empresa e contato final; `mixed` livre. Rótulos: "Produtos" vira "Produtos e serviços" na navegação.
3. Wizard: passo Empresa ganha "Como você vende" (modelo de negócio) e "O que você vende" (produtos, serviços, os dois); o passo de pipeline usa isso (B2B: Qualificação, Proposta, Negociação; B2C: Interesse, Visita/Atendimento, Fechamento).
4. Página Produtos: filtro por tipo, formulário com os campos novos, valor do negócio soma recorrência anualizada quando `billing` recorrente (exibido como "R$ X/mês, R$ Y/ano").

**Prova.** vitest do cálculo de valor; e2e: criar serviço por hora, ligar ao negócio, ver total; org B2B recusa negócio sem empresa.

## B7. Kit inicial gerado no wizard

**Contexto.** Wizard gera prompt, FAQs e objeções por IA; funil fixo por setor; biblioteca genérica, ativada à mão, com colchetes não preenchidos.

**Entrega.**
1. Function `generate-starter-kit` (front, sessão + org): recebe o perfil da org (nome, setor, descrição, público, problema, tom, modelo de negócio, produtos) e devolve em JSON: 3 automações (boas-vindas por origem formulário, intenção de compra, negócio parado), 2 follow-ups (prospecção e pós-venda), 2 sequências de e-mail, 4 modelos de e-mail, 4 templates de WhatsApp no formato da Meta (nome snake_case, categoria, corpo com {{1}}, exemplos), 5 respostas rápidas. Modelo `estruturado` (`chamarIA` tarefa estruturado).
2. Passo novo do wizard "Kit inicial" (antes de Concluído): mostra o kit gerado, cada item com toggle, botão "Regenerar" e "Aplicar selecionados". Aplicar grava nas tabelas reais e marca `library_activations`.
3. Biblioteca: seed atual troca colchetes por variáveis reais (`{{company}}`, `{{sector}}`, `{{product}}`, `{{audience}}`, `{{problem}}`); `aplicarContexto` passa a ler `target_audience` e `main_problem_solved`; categoria nova `whatsapp_template` com 6 modelos no formato da Meta e botão Ativar = submeter via `message-templates`.

**Prova.** hard: `generate-starter-kit` devolve JSON válido para uma org de exemplo; e2e do passo com aplicar 2 itens e conferir nas telas.

## B8. Migração de CRMs: CSV universal

**Contexto.** Só CSV de contatos (8 colunas, sem upsert), CSV de produtos, histórico de conversas.

**Entrega.**
1. Tabelas `imports` (org, kind 'contacts'|'companies'|'deals'|'activities'|'notes', source 'csv'|'hubspot'|..., status, mapping jsonb, stats jsonb, error_report_path, created_by) e `import_rows` (import_id, row_number, raw jsonb, status, entity_id, error).
2. Function `import-run` (front, sessão + org, lotes de 500 com continuação): aplica o mapeamento, faz upsert por chave (e-mail/telefone para contato, domínio/nome para empresa, id externo `custom_fields.external_id` para tudo), resolve etapa por de/para de nomes (`mapping.stages`), dono por e-mail do usuário, tags, custom fields novos criados sob demanda em `custom_field_definitions`.
3. Aba **Importação**: assistente em 4 passos (arquivo → entidade → de/para de colunas e de etapas com sugestão automática → prévia e execução), histórico de importações com relatório de erros para baixar, e "Desfazer" (apaga o que a importação criou, marca o que atualizou).
4. Presets de colunas por CRM de origem (exportação CSV de HubSpot, Pipedrive, RD Station, Agendor, Kommo, Salesforce, Ploomes, Bitrix) em `src/lib/importPresets.ts`.

**Prova.** vitest do mapeador e dos presets; e2e: importar CSV de negócios com de/para de etapas e ver no Kanban; desfazer.

## B9. Migração de CRMs: conectores por API

**Contexto.** Nenhum conector existe. Pipedrive e HubSpot só como tutorial de chave.

**Entrega.**
1. Function `crm-connect` (front): por provedor, valida credencial e lê a estrutura: HubSpot (OAuth, escopos crm.objects.*.read; ou private app token), Pipedrive (API token), RD Station CRM (token), Agendor (token), Kommo (OAuth), Salesforce (OAuth + REST). Devolve funis, etapas, campos personalizados, contagens.
2. Function `crm-sync` (interna, em lotes com cursor, agendável): puxa contatos, empresas, negócios (com etapa mapeada), atividades e notas para `imports`/`import_rows` e roda `import-run`. Registra `crm_connections` (org, provider, credenciais no Vault, last_sync_at, cursor).
3. Aba Importação ganha "Conectar CRM": escolher provedor, autorizar, revisar o de/para (etapas e campos, com sugestão automática por nome), escolher o que trazer, rodar; depois sincronização incremental opcional (diária).
4. OAuth: rotas `crm-oauth-start` e `crm-oauth-callback` reaproveitando o padrão do Gmail (state com origem, credenciais no Vault por org).

**Prova.** hard com a `integration-sandbox` fingindo Pipedrive e HubSpot (payloads reais de exemplo em `e2e/hard/fixtures/`): estrutura lida, de/para sugerido, importação executada, negócios nas etapas certas.

## B10 a B13. Porte da Nina Zernio

Preenchido a partir do inventário do repositório `MindOpsTeam/remix-of-nina-zernio-original` (clone local em `solucoes/nina-zernio`). Ver seção "Nina" abaixo.

### Fontes do porte

- **Nina Zernio** (`MindOpsTeam/remix-of-nina-zernio-original`, clone em `solucoes/nina-zernio`): RAG híbrido (tsvector + pg_trgm, sem embeddings), fatos canônicos, `registrar_duvida`, agenda Nylas com ferramentas (disponibilidade, agendar, remarcar, cancelar), ações governadas com evidência literal e auditoria (`agent_action_runs`), análise pós-conversa (`analyze-conversation` grava em `contacts.client_memory`), simulador, avaliação com golden set, sugestões de aprendizado, agrupamento de rajadas por fila. **Não tem** lembrete, no-show nem ligações. Atenção: as RPCs `search_workspace_knowledge`, `write_knowledge_document`, `publish_compiled_agent_draft`, `consume_agent_rate_limit` e `enqueue_nina_processing` não estão versionadas no repo; extrair com `pg_get_functiondef` do banco da Nina (Lovable Cloud) antes de portar. A Nina é single-tenant (`user_id` nulo, `workspace_id` só na camada do agente): tudo portado troca por `org_id` + RLS do CRM.
- **Nina Talks hotelaria** (`solucoes/ninatalks-hotelaria`): ligações inbound/outbound (Twilio + ElevenLabs Conversational AI), gravação, transcrição e classificação pós-ligação, lembrete de reunião e no-show, RAG com embeddings (`knowledge_chunks` + `match_knowledge_chunks`).
- Diferenças de stack a tratar em todo porte: `Deno.serve` + supabase-js `2.45.0` pinado, `_shared/seguranca.ts` no lugar de `_shared/auth.ts`, `chamarIA`/`FerramentaIA` no lugar de `runNinaAgent`, `conversation_messages` (direction/is_from_ai) no lugar de `messages`, `ai_messaging_config` no lugar de `nina_settings`.

## B10. Base de conhecimento com RAG

**Contexto.** CRM: FAQs e objeções inteiras no prompt, produtos por `ilike`. Nina Zernio: documentos viram chunks (cerca de 1200 caracteres, 12% de sobreposição, extração no navegador de PDF, DOCX, TXT, CSV, XLSX), busca híbrida full-text pt-BR + trigram, 6 resultados; fatos canônicos com status e validade; perguntas sem resposta.

**Entrega.**
1. Extensões `pg_trgm` e `vector`. Tabelas `knowledge_documents` (org, título, tipo, fingerprint, fonte, status, ingestion_report), `knowledge_chunks` (org, document_id, ordem, texto, `fts tsvector` gerado em `portuguese`, `embedding vector(1536)` opcional), `knowledge_facts` (org, texto, status confirmed|needs_review, always_include, valid_until), `unanswered_questions` (org, conversation_id, pergunta, status). RLS por org.
2. RPC `buscar_conhecimento(org, consulta, limite)` híbrida: rank FTS + similaridade trigram + (quando houver embedding) cosseno, fundidos por RRF. RPC `gravar_documento_conhecimento` idempotente por fingerprint. Function `knowledge-embed` (interna, opcional, só quando existir chave de embeddings na org) que preenche `embedding` em lote.
3. `ai-reply`: ferramenta `buscar_conhecimento` (substitui FAQs inteiras no prompt quando a org tiver documentos ou fatos; FAQs e objeções entram como documentos na migração) e `registrar_duvida`; fatos `always_include` e regras de verdade no system prompt (portar `nina-engine.ts:63-102`).
4. Tela IA > Conhecimento reescrita: documentos (upload com extração no navegador, portar `src/lib/material-extraction.ts` e `src/domain/knowledge.ts`), fatos canônicos com revisão, perguntas sem resposta com botão "virar fato/FAQ", teste de busca.

**Prova.** SQL: busca por sinônimo com erro de digitação encontra o chunk; hard: conversa pergunta algo que só está no documento e a IA responde com o dado; e2e do upload de TXT.

## B11. Agenda nativa, lembrete e no-show

**Contexto.** CRM só manda link do Cal.com e cria atividade `meeting` pelo webhook. Nina Zernio: Nylas v3 (OAuth hospedado, grant por integração), `appointments` como fonte da verdade, sincronização num sentido com sala Meet/Teams automática, disponibilidade consultada só na tabela (não no free/busy). Nina Talks: `meeting-reminder-tick` e `meeting-noshow-tick`.

**Entrega.**
1. Tabelas `appointments` (org, contact_id, deal_id, owner_id, início, fim, título, local/link, status scheduled|confirmed|completed|no_show|cancelled, calendar_sync_status, external_event_id, reminder_sent_at, source ia|manual|calcom), `calendar_integrations` (org, user_id, provider nylas|calcom, grant_id, calendar_id, settings), `calendar_oauth_states`, `scheduling_policies` (org: antecedência mínima, janelas por dia da semana, duração padrão, buffer, dias máximos à frente, exige confirmação literal).
2. Function `calendar` (front): portar `nylas-calendar` (status, connect, sync_all, sync_event, delete_event, disconnect) por org e usuário; `calcom-webhook` passa a gravar em `appointments`. Free/busy do Nylas entra na disponibilidade (melhoria sobre a Nina).
3. Ferramentas da IA em `ai-reply`: `consultar_disponibilidade`, `agendar_reuniao`, `remarcar_reuniao`, `cancelar_reuniao`, com política de agenda e confirmação literal (portar `_shared/action-policy.ts` e `action-audit.ts`, tabela `agent_action_runs`).
4. Function `appointment-dispatcher` (cron a cada 5 min): lembrete X horas antes (WhatsApp pelo canal da org: texto no Evolution, template aprovado na Meta/Zernio; e-mail via B1), pedido de confirmação com resposta "confirmo" tratada pela IA, e marcação `no_show` Y minutos após o início sem confirmação/presença, com gatilho de automação `appointment.no_show` e notificação ao dono.
5. Aba **Agenda** em Configurações: conexão de calendário por usuário, política de agenda, textos dos lembretes. Página **Agenda** no menu (lista e semana), com criar, remarcar e cancelar à mão.

**Prova.** hard: IA agenda com evidência literal e a sandbox fingindo o Nylas recebe o evento; sem evidência, recusa; dispatcher manda lembrete e marca no-show; e2e da aba e da página.

## B12. Análise pós-conversa

**Contexto.** Nina Zernio `analyze-conversation`: na 1ª interação e a cada 5, extrai interesses, dores, score 0 a 100, próxima melhor ação, orçamento, prazo de decisão, empresa, cargo, urgência, resumo; grava em `contacts.client_memory` sem sobrescrever o que já está confirmado; sugere etapa por `pipeline_stages.ai_trigger_criteria` com confiança acima de 70. CRM tem BANT em `deals.qualification`, lead scoring por regras e `predict-deal-close`.

**Entrega.**
1. `contacts.client_memory jsonb` (lead_profile, sales_intelligence, lead_state com unknown|inferred|confirmed, interaction_summary), `pipeline_stages.ai_trigger_criteria text`.
2. Function `analyze-conversation` (interna) portada: chamada por `ai-reply` após responder (1ª e a cada 5, configurável), grava memória, preenche BANT do negócio aberto quando vazio, alimenta `lead_score_history`, e sugere ou move etapa pelos critérios da etapa respeitando `funnel_actions.mode`.
3. `ai-reply` injeta a memória do lead no prompt (portar `_shared/lead-state.ts`).
4. Sub-aba **Análises** na aba IA: frequência da análise, critérios de etapa (editor por etapa), e na ficha do contato um card "O que a IA sabe" com os campos e a origem (inferido ou confirmado), editável.

**Prova.** hard: 6 mensagens com orçamento e prazo geram memória preenchida e BANT do negócio com budget e timeline; e2e do card.

## B13. Voz (ligações)

**Contexto.** A Nina Zernio não tem ligação; a Nina Talks hotelaria tem a camada completa: números Twilio (buscar, comprar, importar), agente de voz ElevenLabs Conversational AI, ligação inbound e outbound, ConversationRelay, gravação, transcrição, classificação pós-ligação, escalonamento para humano, campanhas de voz, "Ao vivo".

**Entrega (porte por org).**
1. Tabelas `voice_agents` (org, elevenlabs_agent_id, voz, prompt compilado do mesmo perfil da IA), `phone_numbers` (org, provider twilio, número, elevenlabs_phone_id, roteamento inbound), `calls` (org, contact_id, deal_id, direção, status, duração, gravação_path, transcrição, resumo, classificação, sentimento), `voice_campaigns`.
2. Functions portadas: `twilio-numbers-search/buy/import`, `elevenlabs-agent-sync`, `elevenlabs-phone-register`, `twilio-incoming`, `voice-outbound`, `twilio-conversation-relay`, `twilio-recording-callback`, `transcribe-voice`, `lead-classify-from-call`, `voice-escalate`. Credenciais Twilio e ElevenLabs no Vault por org.
3. Após a ligação: `calls` vira atividade `call` na linha do tempo com resumo e classificação; `analyze-conversation` (B12) roda sobre a transcrição; a IA de chat lê a memória atualizada.
4. Aba **Voz** em Configurações: números, agente de voz (voz, saudação, horário), escalonamento; página **Ligações** (histórico, ao vivo, campanhas de voz).

**Prova.** hard com a sandbox fingindo Twilio e ElevenLabs (webhooks reais gravados em `e2e/hard/fixtures/`); e2e das telas. Ligações reais só com as credenciais da Sabrina.



---

## Como cada bloco é entregue

1. Ler este guia e os arquivos citados; `git pull --rebase`.
2. Migration em arquivo próprio; aplicar em produção com `lovable_query_sql read_only=false`; conferir com SELECT.
3. Functions: `deno check`; hard smoke com a `integration-sandbox`.
4. Front: vitest + tsc + lint + build + e2e da tela.
5. Revisão: `code-reviewer` e, quando tocar auth, dados ou webhook, `security-reviewer`. Corrigir antes de commitar.
6. Commit convencional na `main`, push; pedir ao agente da Lovable o deploy das functions tocadas; conferir versão.
7. Registrar no `TESTE_MANUAL.md` o que a varredura não cobre e no `DIVIDA_TECNICA.md` o que ficou adiado.
