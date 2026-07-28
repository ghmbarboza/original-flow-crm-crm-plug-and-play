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

## 3. Passo 3 do wizard não tem caminho manual

**Estado:** em `StepIA`, o botão de avançar é `disabled` enquanto não houver
blocos gerados. Não existe opção de escrever o prompt à mão nem de pular a etapa.

**Consequência:** qualquer indisponibilidade do provedor de IA — sem créditos,
rate limit, provedor fora do ar — deixa o onboarding intransponível. O usuário vê
"Não foi possível gerar" e não tem para onde ir. Coberto pelo teste
"passo 3 sem IA mostra o erro e bloqueia o avanço" em `e2e/setup-wizard.spec.ts`,
que documenta o comportamento atual em vez de fingir que ele não existe.

**O que dispararia a correção:** o primeiro usuário travado aí.

**Correção quando for a hora:** permitir avançar com um prompt mínimo montado
localmente a partir do contexto já coletado nos passos 1 e 2, marcando a etapa
como pendente para revisão em Configurações > IA.
