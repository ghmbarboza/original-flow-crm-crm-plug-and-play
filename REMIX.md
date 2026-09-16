# Remix do FlowCRM 2.0 para um cliente

Um projeto Lovable por cliente. Guia escrito a partir dos remixes de teste de 15 e 16/09/2026 (`via-flowcrm2-remix-teste-2` e `-3`).

## O que o remix da Lovable faz e o que não faz

| Vem no remix | Não vem no remix |
|---|---|
| Código e as 44 edge functions, já publicadas | O endereço do banco no app publicado: a Lovable gera o build do remix antes do Cloud novo existir |
| Tabelas, funções, triggers, policies e buckets | Dados: nenhum lead, negócio, conversa, usuário ou credencial de cliente |

A infraestrutura que a Lovable não copia (agendamentos, segredo interno do cron, endereço do projeto, realtime e biblioteca de modelos) se recria sozinha: a function `ensure-auth-trigger` roda a cada abertura do app e chama `garantir_infra_do_projeto()`, que cria só o que faltar. Basta o app abrir uma vez dentro do editor da Lovable, onde as configurações existem.

No remix de teste 3 isso aconteceu sem nenhuma intervenção: 7 agendamentos respondendo 200, realtime nas 5 tabelas, 16 modelos, o endereço gravado apontando para o próprio remix e zero dados de produção.

## Passo a passo

1. **Remix** do projeto `[ORIGINAL] Flow CRM 2.0` no workspace, com o nome `viver-de-ia-<cliente>` ou o combinado.
2. **Abrir o projeto no editor da Lovable.** O preview do editor já carrega a tela de login, porque ali as configurações do projeto existem. É essa abertura que dispara o reparo da infraestrutura.
   O link `id-preview--...lovable.app` mostra a tela "Este projeto ainda não está ligado ao banco de dados" até sair um build novo. É esperado: aquele build foi gerado antes do banco do projeto existir. Uma linha em branco no README pelo agente não regerou o link na hora; o caminho é publicar (passo 6).
3. **Abrir o app uma vez** (preview ou publicado). Isso recria a infraestrutura. Para conferir sem abrir, chame a function e veja o campo `infra`:
   `curl -X POST https://<ref>.supabase.co/functions/v1/ensure-auth-trigger -d '{}'`
   No projeto pronto a resposta é `"infra":{"criado":[]}`.
4. **Criar a conta do administrador** do cliente pela tela de cadastro. Pelo código, o primeiro usuário vira admin e a organização nasce com o funil padrão (`handle_new_user` + `on_profile_created_assign_org`). Isso ainda não foi conferido num remix: confira no primeiro cliente que o admin entra direto, sem cair em "aguardando aprovação", e que o kanban mostra as etapas.
5. **Nenhum secret de ambiente é obrigatório.** Credenciais do Google, ElevenLabs e outras ficam no Vault por organização, cadastradas pela tela, e o login do Gmail volta para o endereço de onde foi pedido. `ANTHROPIC_API_KEY` só se o cliente for usar Claude; sem ela a IA usa o gateway da Lovable.
   A Lovable manda sozinha, logo depois do remix, uma mensagem "I've remixed this project... Update the value of the secret X" para cada secret que existir no projeto original. Por isso o original não deve ter secret de ambiente: se essa mensagem aparecer, clique em Skip e avise, porque alguém cadastrou um secret no original.
6. **Publicar** o app e, se houver, ligar o domínio do cliente. É a publicação que gera o app com o endereço do banco: no remix de teste 3, o `.env` dentro do ambiente da Lovable já apontava para o backend do próprio remix, e o build feito ali saiu com ele.
7. **Integrações**: seguir o "Checklist do dia da entrega" em `PRONTIDAO_INTEGRACOES.md` (WhatsApp, Meta, Zernio, Cal.com, webhooks). Credenciais do Google, ElevenLabs e demais ficam no Vault por organização, cadastradas pela tela.

## Primeiro usuário

O primeiro cadastro no projeto novo vira o dono da conta, conferido no banco do remix de teste 3:

- `handle_new_user`: se ainda não existe nenhum perfil, o usuário entra com `is_approved = true` e papel **admin**. Do segundo em diante, papel `member` e aprovação conforme `project_config.require_account_approval`.
- `assign_default_org`: cria a organização (`Minha empresa`) e liga o perfil a ela.
- Triggers da organização: semeiam o funil padrão com as etapas e as regras de pontuação de lead.
- `organizations.setup_completed` nasce `false`, e o assistente de configuração abre por cima do app para quem é admin (`SetupWizardContext`).

Ou seja, o admin não cai em "aguardando aprovação" e o onboarding abre sozinho. Falta só a confirmação pela tela no primeiro cliente.

## Conferência final

Rodar no SQL do projeto do cliente:

```sql
select (select count(*) from cron.job) as crons,                 -- 7
       (select count(*) from library_templates) as modelos,      -- 16
       (select count(*) from pg_publication_tables
         where pubname = 'supabase_realtime') as realtime;       -- 5
```

E, depois de um minuto, `select status_code, content from net._http_response order by created desc limit 5;` deve mostrar só 200.
