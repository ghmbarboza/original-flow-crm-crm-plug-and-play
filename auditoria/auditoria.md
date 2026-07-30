# Auditoria automatizada

Cobertura desta execucao — varredura: 20/20 rotas · axe: 20/20 · galeria: 20/20

Achados mecanicos: 2 · violacoes de acessibilidade: 0

**Lista de candidatos, nao veredito.** Usabilidade nao esta aqui — ver
`TESTE_MANUAL.md`. Galeria de telas: `auditoria/galeria.html`.

## http-500 (1)

- `/inbox` — POST https://tvwhiyojgtbuwtuohdes.supabase.co/functions/v1/gmail-auth-url

## console-error (1)

- `/inbox` — Failed to load resource: the server responded with a status of 500 ()

## Acessibilidade (axe / WCAG 2.1 AA)

Nenhuma violacao.

## Nao clicado pela varredura (20 acao(oes) distinta(s))

Destrutivas, submits, dialogos nativos e abas ja ativas.
**As destrutivas precisam de teste manual.**

- "Alterar foto" (abre diálogo nativo) — /settings
- "Alterar senha" (submit de formulário) — /settings
- "Atendimento em tempo real" (já ativo) — /team
- "Ativa" (já ativo) — /automations
- "Ativar a regra "Email aberto"" (já ativo) — /lead-scoring
- "Ativar a regra "Formulário de captura preenchido"" (já ativo) — /lead-scoring
- "Ativar a regra "Link de email clicado"" (já ativo) — /lead-scoring
- "Ativar a regra "Mensagem recebida via Instagram"" (já ativo) — /lead-scoring
- "Ativar a regra "Mensagem recebida"" (já ativo) — /lead-scoring
- "Ativar a regra "Negócio criado"" (já ativo) — /lead-scoring
- "Ativar a regra "Nova conversa iniciada"" (já ativo) — /lead-scoring
- "Excluir regra" (destrutivo) — /lead-scoring
- "Excluir" (destrutivo) — /automations, /email-templates
- "Geral" (já ativo) — /settings
- "Kanban" (já ativo) — /deals
- "Lista" (já ativo) — /contacts
- "PDF" (abre diálogo nativo) — /reports
- "Regras" (já ativo) — /lead-scoring
- "Sair" (destrutivo) — em 19 telas
- "Todos" (já ativo) — /library
