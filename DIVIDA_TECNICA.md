# Dívida técnica

Itens conhecidos e conscientemente adiados. Cada entrada registra o que está
assim, por que foi aceito, e o que dispararia a correção.

---

## 1. Bucket `avatars` com leitura pública

**Estado:** o bucket `avatars` é público (`public = true`). Qualquer pessoa com a
URL de um avatar consegue abri-lo sem sessão.

**Reportado como:** warning do scanner de segurança do Lovable
(2026-07-28), com a descrição "as policies dependem apenas da convenção de
nomes de pasta".

**Por que não foi corrigido junto com o hardening de 2026-07-28:**

A parte do warning sobre "depender de convenção de nomes" **não procede**. A
policy de escrita compara a primeira pasta do caminho com `auth.uid()` e é
avaliada pelo RLS no servidor, não pelo cliente. Um usuário não consegue gravar
na pasta de outro, mesmo forjando o caminho. A escrita está correta.

O que sobra é a leitura pública, e para foto de perfil isso é a escolha comum e
normalmente deliberada: avatar aparece em lista de equipe, em atribuição de
lead e em comentário, e bucket privado obrigaria URL assinada com renovação em
todos esses pontos. O custo é real e o dado exposto é uma foto de perfil que a
própria pessoa subiu para ser vista.

**O que dispararia a correção:**

- O produto passar a tratar avatar como dado sensível (ex.: cliente
  corporativo com exigência contratual de mídia privada).
- O bucket passar a guardar qualquer coisa além de foto de perfil.
- Enumeração virar risco concreto — hoje o nome do objeto é o UUID do usuário,
  então não é adivinhável, mas uma URL vazada é permanente.

**Correção quando for a hora:** tornar o bucket privado, restringir o SELECT a
`authenticated` e servir os avatares por `createSignedUrl`, com cache no
cliente para não assinar a cada render de lista.

**Referência:** o mesmo desenho de caminho escopado foi aplicado ao
`whatsapp-media` em `supabase/migrations/20260729100001_hardening_seguranca.sql`
— serve de modelo, com a diferença de que lá o bucket ficou privado.

---

## 2. Wizard de setup sem cobertura E2E

**Estado:** o wizard `/setup` (Sprint 9) tem `data-testid` em todas as etapas,
mas não existe spec do Playwright exercitando o fluxo ponta a ponta.

**Por que:** a suíte E2E atual loga como admin de uma organização que o
`global-setup.ts` marca com `setup_completed = true`, justamente para não cair
no guard do wizard. Testar o wizard exige uma organização em estado oposto, ou
seja, uma segunda fixture — e a etapa de IA chama a `generate-system-prompt`,
que consome a API da Anthropic a cada execução.

**O que dispararia a correção:** qualquer mudança na sequência de etapas ou na
lógica de retomada por `setup_progress.current_step`. Hoje uma regressão aí só
apareceria em teste manual.

**Correção quando for a hora:** organização dedicada criada no `global-setup`
com `setup_completed = false`, e a chamada da IA dublada por variável de
ambiente para não gastar crédito em CI.
