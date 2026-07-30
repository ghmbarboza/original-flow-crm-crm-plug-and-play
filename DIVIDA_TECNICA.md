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

## 2. A IA padrão não é Claude

**Estado:** `supabase/functions/_shared/ai.ts` escolhe o provedor em tempo de
execução: usa a API da Anthropic quando o secret `ANTHROPIC_API_KEY` existe e,
sem ele, cai no AI Gateway do Lovable. Como o Gateway **não serve modelos
Claude** (só Google e OpenAI), a configuração padrão do projeto roda em Gemini.

**Por que ficou assim:** as três functions de IA exigiam `ANTHROPIC_API_KEY`, que
nunca foi configurada — as três respondiam 500 e o onboarding era intransponível
no passo 3. A `LOVABLE_API_KEY` é provisionada automaticamente, então o Gateway
funciona sem ninguém configurar nada.

**Consequência prática:** os prompts das três functions são agnósticos de
fornecedor (pedem JSON ou texto puro, e a estrutura é validada na volta), mas a
redação muda de modelo para modelo. O `<sector_context>` gerado por Gemini não
sai igual ao que sairia por Claude.

**O que dispararia a mudança:** avaliação de qualidade das respostas em produção,
ou exigência de rodar em Claude por decisão de produto.

**Como mudar:** cadastrar `ANTHROPIC_API_KEY` nos secrets do Supabase. As três
functions passam a usar Claude na chamada seguinte, sem alteração de código nem
de tela. Os modelos de cada provedor também são sobrescrevíveis sem redeploy,
por `AI_GATEWAY_MODEL` e `AI_ANTHROPIC_MODEL`.

---

## 3. ~~Passo 3 do wizard não tem caminho manual~~ — RESOLVIDA em 2026-07-29

**Era:** em `StepIA`, o botão de avançar era `disabled` enquanto não houvesse
blocos gerados. Não existia opção de escrever o prompt à mão nem de pular a
etapa, então qualquer indisponibilidade do provedor — 429, timeout, Gateway fora
— deixava o onboarding intransponível. O usuário via "Não foi possível gerar" e
não tinha para onde ir.

**Aconteceu em produção em 2026-07-29**, antes da correção: a geração falhou e o
passo 3 travou. A causa da falha nunca foi identificada, provavelmente 429 por
gerações em sequência curta.

**Como foi resolvida:** quando a geração falha, a tela oferece "Continuar com um
rascunho". `src/lib/promptRascunho.ts` monta os 8 blocos a partir do contexto já
coletado nos passos 1 e 2, sem chamar a IA, e o usuário revisa e avança
normalmente.

Duas decisões que fazem o rascunho ser aceitável:

1. **Não inventa.** O módulo não tem conhecimento de setor nenhum: reorganiza o
   que o usuário informou e marca `[COMPLETAR]` onde falta, dizendo o que
   preencher. Um template que fabricasse regras de financiamento imobiliário ou
   protocolos de saúde seria pior que não gerar nada — o usuário ativaria a IA
   confiando num texto que ninguém escreveu. Há teste unitário que falha se o
   rascunho mencionar termos de setor não fornecidos.
2. **Não ativa a IA.** Salvar por este caminho grava `is_active: false` de forma
   explícita (não confiando no default da coluna) e anota a versão como
   "Rascunho montado no setup sem IA — revise antes de ativar". Um prompt que a
   IA não escreveu não começa a atender cliente sozinho.

**Cobertura:** 11 testes unitários em `src/lib/promptRascunho.test.ts` e o e2e
"passo 3: falha da IA oferece rascunho e não trava o wizard". O e2e força a falha
interceptando a chamada, em vez de depender de o provedor estar fora — o teste
antigo só rodava quando a IA estava indisponível e por isso era pulado quase
sempre.

**O que ficou pendente:** o rascunho não importa FAQs nem objeções, porque essas
vinham do modelo. O usuário começa com base de conhecimento vazia e a preenche em
Configurações > IA.

---

## 4. Conexão Gmail sem credencial OAuth configurada

**Estado:** o botão "Conectar Gmail" em `/inbox` falha com "GOOGLE_CLIENT_ID não
configurado". As functions `gmail-auth-url`, `gmail-oauth-callback` e
`_shared/google.ts` estão prontas, mas os secrets `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` nunca foram cadastrados no Supabase.

**Reportado como:** `http-500` na auditoria automatizada de 2026-07-30 — a
varredura clicou o botão e capturou a resposta.

**Por que não é defeito de código:** o frontend mostra a causa real num toast
(via `erroDeFunction`, da PR #22) e a function responde 500 com mensagem
explicativa em vez de quebrar. O fluxo inteiro depende de credencial criada no
Google Cloud Console (OAuth consent + client web), que é decisão de configuração
do produto, não de implementação.

**O que dispararia a correção:** decisão de ativar o canal de email para
clientes. Aí: criar o OAuth client no Google Cloud Console com o redirect
`<SUPABASE_URL>/functions/v1/gmail-oauth-callback`, cadastrar os dois secrets e
o `APP_URL` no Supabase, e testar o ciclo conectar → sincronizar → enviar.
