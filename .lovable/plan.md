# Google Agenda direto (sem Nylas)

## Resposta curta
Hoje a agenda só conecta pelo Nylas (Configurações > Agenda > "Conectar meu calendário", com as credenciais do Nylas cadastradas em Configurações > Integrações). Ligar o Google Agenda direto é possível, usando o mesmo Client ID e Client Secret do Google que o app já usa para o Gmail.

## O que muda para você
1. **Uma vez, como administrador:** em Configurações > Integrações > Google, cadastrar o Client ID e o Client Secret do Google (o mesmo cadastro serve para Gmail e Agenda). No Google Cloud é preciso ativar a "Google Calendar API" e adicionar o endereço de retorno que a tela vai mostrar.
2. **Cada pessoa:** em Configurações > Agenda, aparece o botão **"Conectar Google Agenda"**. Ela escolhe a conta Google, autoriza, e pronto.
3. Depois disso, o comportamento é o mesmo de hoje: reuniões marcadas (pela IA, à mão ou pelo Cal.com) entram no Google Agenda com link do Google Meet, e horários ocupados ficam indisponíveis para a IA.
4. O Nylas continua como opção para quem usa Outlook.

## Detalhes técnicos
- `calendar_integrations.provider` passa a aceitar `google` além de `nylas` (migration nova, sem editar a antiga); tokens guardados como hoje no Gmail, um registro por usuário.
- Nova edge function `google-calendar-oauth-callback`; `calendar` ganha `connect` com `provider: "google"` (escopos `calendar.events` + `calendar.readonly` + `userinfo.email`), state assinado reaproveitando `assinarEstado`/`lerEstado` de `_shared/google.ts`.
- Novo `_shared/googleCalendar.ts` com o mesmo contrato do `_shared/nylas.ts` (`sincronizarEvento`, `apagarEvento`, `ocupacoes`) usando Calendar API v3 (`events.insert/patch/delete` com `conferenceData` para Meet, `freeBusy.query`), renovação de token via `getValidAccessToken`.
- `_shared/agenda.ts` escolhe o adaptador pelo `provider` da integração (sem `if` espalhado).
- Front: `AgendaSettings.tsx` mostra os dois botões; `status` informa se as credenciais Google estão prontas, com link para Integrações quando faltam.
- Testes: unitários do adaptador Google (conversão de evento, datas de dia inteiro, free/busy) com fake de rede; e2e de Configurações > Agenda atualizado.
- Deploy: `calendar`, `google-calendar-oauth-callback` (verify_jwt = false), `appointment-dispatcher`, `ai-reply`, `calcom-webhook` e demais que importam `_shared/agenda.ts`.
