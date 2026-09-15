# Remix do FlowCRM 2.0 para um cliente

Um projeto Lovable por cliente. Este guia foi escrito a partir do remix de teste de 15/09/2026 (`via-flowcrm2-remix-teste-2`).

## O que o remix da Lovable faz e o que não faz

| Vem no remix | Não vem no remix |
|---|---|
| Código e as 44 edge functions, já publicadas | O arquivo `.env` (o app abre em branco até ele existir) |
| Tabelas, funções, triggers, policies e buckets | Crons (automações, NPS, follow-up, mensagens agendadas, ERP, webhooks, conversa parada) |
| | Segredos do Vault (`internal_cron_secret`, `project_url`) |
| | Realtime (inbox, kanban e notificações atualizando sozinhos) |
| | Biblioteca de modelos (16 modelos) |
| | Trigger de cadastro em `auth.users` |
| | Dados (organização, usuários, contatos) |

Tudo da coluna da direita que é infraestrutura se recria sozinho: a function `ensure-auth-trigger` roda a cada abertura do app e chama `garantir_infra_do_projeto()`, que cria só o que faltar. No remix de teste ela criou o segredo, os 7 crons, o realtime das 5 tabelas, os 16 modelos e o trigger na primeira chamada, e os crons passaram a chamar as functions do próprio remix com 200.

## Passo a passo

1. **Remix** do projeto `[ORIGINAL] Flow CRM 2.0` no workspace, com o nome `viver-de-ia-<cliente>` ou o combinado.
2. **Abrir o projeto no editor da Lovable** e esperar o preview carregar a tela de login. No remix de teste o preview abriu em branco com o erro `supabaseUrl is required` no console: a Lovable gera o build do remix antes de o Cloud novo existir, e o bundle sai sem `VITE_SUPABASE_URL`. Uma alteração mínima pelo agente (linha em branco no README) não atualizou o link `id-preview--...lovable.app` na hora. Ainda não está confirmado o que força o build novo: anote aqui o que resolver no primeiro cliente.
3. **Abrir o app uma vez** (preview ou publicado). Isso recria a infraestrutura. Para conferir sem abrir, chame a function e veja o campo `infra`:
   `curl -X POST https://<ref>.supabase.co/functions/v1/ensure-auth-trigger -d '{}'`
   No projeto pronto a resposta é `"infra":{"criado":[]}`.
4. **Criar a conta do administrador** do cliente pela tela de cadastro. Pelo código, o primeiro usuário vira admin e a organização nasce com o funil padrão (`handle_new_user` + `on_profile_created_assign_org`). Isso ainda não foi conferido num remix: confira no primeiro cliente que o admin entra direto, sem cair em "aguardando aprovação", e que o kanban mostra as etapas.
5. **Nenhum secret de ambiente é obrigatório.** Credenciais do Google, ElevenLabs e outras ficam no Vault por organização, cadastradas pela tela, e o login do Gmail volta para o endereço de onde foi pedido. `ANTHROPIC_API_KEY` só se o cliente for usar Claude; sem ela a IA usa o gateway da Lovable.
   A Lovable manda sozinha, logo depois do remix, uma mensagem "I've remixed this project... Update the value of the secret X" para cada secret que existir no projeto original. Por isso o original não deve ter secret de ambiente: se essa mensagem aparecer, clique em Skip e avise, porque alguém cadastrou um secret no original.
6. **Publicar** o app e, se houver, ligar o domínio do cliente.
7. **Integrações**: seguir o "Checklist do dia da entrega" em `PRONTIDAO_INTEGRACOES.md` (WhatsApp, Meta, Zernio, Cal.com, webhooks). Credenciais do Google, ElevenLabs e demais ficam no Vault por organização, cadastradas pela tela.

## Conferência final

Rodar no SQL do projeto do cliente:

```sql
select (select count(*) from cron.job) as crons,                 -- 7
       (select count(*) from library_templates) as modelos,      -- 16
       (select count(*) from pg_publication_tables
         where pubname = 'supabase_realtime') as realtime;       -- 5
```

E, depois de um minuto, `select status_code, content from net._http_response order by created desc limit 5;` deve mostrar só 200.
