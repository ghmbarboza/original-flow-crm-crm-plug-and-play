# Roteiro de teste manual

Este roteiro cobre o que a varredura automatizada **não** cobre: usabilidade,
clareza, e se a jornada faz sentido para quem nunca viu o produto.

A parte mecânica — erro de console, request falhando, botão sem efeito, falta de
label — está em `e2e/_auditoria.spec.ts`. Rode antes de começar:

```
npm run audit:varredura    # botões, console, rede, links (o mais demorado)
npm run audit:axe          # WCAG 2.1 AA por tela
npm run audit:galeria      # capturas desktop + mobile
npm run audit:relatorio    # junta tudo em test-results/auditoria.md
```

São quatro execuções porque a varredura inteira num teste só estourava o timeout
e derrubava as outras fases junto. Cada fase grava o que achou em
`test-results/auditoria/`, e o relatório lê esse diretório — dá para rodar só
uma fase de novo sem perder o resto. O relatório diz no topo quantas rotas cada
fase cobriu, para "0 violações" não ser confundido com "não rodou".

Precisa de `E2E_PASSWORD` no ambiente ou no `.env` da raiz (que é gitignored).

## Como usar

Para cada passo há **o que fazer** e **o que observar**. O "observar" é onde está
o valor: não é só "funcionou?", é "um cliente do seu cliente entenderia isso?".

Anote no formato `[ ]` → `[x] ok` ou `[!] problema: ...`. O que virar `[!]` vale
uma issue.

Duas coisas que valem registrar sempre que acontecerem, em qualquer passo:

- **Esperei sem saber se estava carregando.** Falta de feedback é o defeito de
  usabilidade mais comum e o mais fácil de esquecer de reportar.
- **Precisei adivinhar.** Se você hesitou sobre o que um campo quer ou o que um
  botão vai fazer, isso é um achado, mesmo que você tenha acertado.

---

## Jornada 1 — Primeiro acesso (o momento que mais importa)

Faça isto **como se fosse a primeira vez**. É a jornada que decide se o cliente
do seu cliente adota ou abandona.

Se possível, use uma organização nova. Se não, veja a nota em "Preparação" no fim.

- [ ] **Cadastro** em `/auth`. Observar: a mensagem depois de submeter diz o que
      acontece agora? Se precisa confirmar email, isso está claro?
- [ ] **Onboarding, passo 1 (Empresa).** Observar: os campos pedem coisas que o
      dono do negócio sabe responder de cabeça? O seletor de setor tem o setor
      dele? Se escolher "Outro", a experiência degrada?
- [ ] **Passo 2 (Público).** Observar: "proibições da IA" é compreensível sem
      explicação? Você saberia o que escrever ali?
- [ ] **Passo 3 (IA).** Observar: **quanto tempo levou?** (medi 20–30s). Ficou
      claro que estava gerando? O prompt gerado parece plausível para o setor que
      você escolheu, ou parece genérico?
- [ ] **Passo 3, ainda.** Leia os 8 blocos. Observar: você entende o que cada um
      faz? Editaria algum antes de ativar? Os placeholders tipo `[solução]`
      incomodam?
- [ ] **Passo 4 (Pipeline).** Observar: as etapas sugeridas batem com como o
      negócio realmente vende?
- [ ] **Passo 5 (Canal).** Observar: dá para entender a diferença entre os
      provedores? "Pular" está claro que é reversível?
- [ ] **Passo 6 (Conclusão).** Observar: você sabe qual é o próximo passo ao cair
      no dashboard? O dashboard vazio orienta ou intimida?

### Caminho de falha do passo 3 (vale forçar)

A correção mais recente é justamente aqui. Para testar, desligue a internet por
uns segundos ao entrar no passo 3, ou bloqueie a chamada no DevTools
(`generate-system-prompt` → Block request URL).

- [ ] Aparece "Não foi possível gerar" **e** o botão "Continuar com um rascunho"?
- [ ] O rascunho preenche os 8 blocos com o que você informou?
- [ ] O aviso "Rascunho — revise antes de ativar" está visível e claro?
- [ ] Os trechos `[COMPLETAR]` dizem o que preencher?
- [ ] Consegue avançar e concluir o setup mesmo assim?
- [ ] Depois, em Configurações > IA, a IA está **desativada**?

---

## Jornada 2 — Do lead ao fechamento

O caminho principal de quem usa o CRM todo dia.

- [ ] **Criar contato** em `/contacts`. Observar: campos obrigatórios estão
      sinalizados antes de submeter ou só depois do erro?
- [ ] **Criar empresa** e vincular ao contato. Observar: a relação entre contato e
      empresa é óbvia na interface?
- [ ] **Criar negócio** em `/deals`, vinculado ao contato.
- [ ] **Arrastar no kanban** entre etapas. Observar: o arrasto é confortável? Dá
      feedback? Funciona no celular?
- [ ] **Abrir o detalhe do negócio.** Observar: a informação mais importante está
      acima da dobra? Você encontra o histórico?
- [ ] **Registrar atividade** e **criar tarefa** a partir do negócio.
- [ ] **Adicionar produto** ao negócio. Observar: o valor total atualiza sozinho?
- [ ] **Marcar como ganho** e depois um outro como **perdido**. Observar: pede
      motivo da perda? Os motivos oferecidos servem para o setor?
- [ ] Conferir em `/reports` se o que você fez apareceu.

---

## Jornada 3 — Atendimento

- [ ] **`/inbox`** com o estado vazio. Observar: explica como conectar um canal?
- [ ] Se houver conversa: **assumir** o atendimento da IA e **devolver**.
      Observar: fica claro quem está respondendo agora — IA ou humano?
- [ ] **`/whatsapp`**: percorrer o wizard de provedor sem concluir. Observar: dá
      para sair no meio sem quebrar? Os requisitos de cada provedor estão claros?
- [ ] **`/team`**: a carga por atendente faz sentido? Atualiza?

---

## Jornada 4 — Biblioteca de Modelos (novo)

- [ ] **`/library`** abre com os 16 modelos.
- [ ] **Filtros** por categoria. Observar: os nomes das categorias dizem o que
      contêm?
- [ ] **"Ver modelo"** num de cada categoria. Observar: o preview dá informação
      suficiente para decidir sem ativar? "Ver completo" funciona?
- [ ] **Ativar um template de email.** Observar: o toast explica o que aconteceu?
      Você caiu no lugar certo? Encontra o item criado?
- [ ] Abrir o item criado e editar. Observar: os placeholders tipo
      `[resultado principal]` são fáceis de achar e trocar?
- [ ] **Ativar uma sequência de email.** Observar: as etapas viraram templates
      separados — isso confunde? Os nomes "— etapa 1", "— etapa 2" ajudam?
- [ ] **Ativar um follow-up.** ⚠️ Observar: o aviso de que **substitui** a régua
      atual está claro ANTES de confirmar? Você entenderia o risco?
- [ ] Conferir que nada foi ativado automaticamente: sequências, automações e
      follow-up devem entrar **desligados**. Observar: isso está evidente na
      interface, ou parece que já está rodando?
- [ ] Ativar duas vezes o mesmo modelo. Observar: duplica? Avisa?

---

## Jornada 5 — Configurações

- [ ] Percorrer **todas as abas** de `/settings`. Observar: alguma aba parece
      vazia, inacabada ou fora de lugar?
- [ ] **Salvar** em cada aba que tem formulário. Observar: confirma que salvou?
      Se você sair sem salvar, avisa?
- [ ] **Configurações > IA**: editar o prompt e salvar. Observar: o histórico de
      versões aparece? Dá para comparar ou reverter?
- [ ] **Ativar a IA** e conferir que o toggle reflete o estado real.
- [ ] **Chaves de API**: cadastrar uma chave inválida e testar a conexão.
      Observar: a mensagem diz o que fazer, ou é técnica demais?
- [ ] **Horário de atendimento** e **follow-up**: as opções cobrem casos reais?

---

## Jornada 6 — Bordas que costumam quebrar

- [ ] **Celular.** Percorrer as jornadas 2 e 3 num telefone de verdade, não só no
      DevTools. Observar: sidebar, kanban, tabelas largas e diálogos.
- [ ] **Recarregar no meio.** Em cada formulário longo, dar F5 antes de salvar.
      Observar: perde tudo sem avisar?
- [ ] **Voltar do navegador.** Usar o botão voltar em vez dos botões da tela.
      Observar: o estado fica coerente?
- [ ] **Duas abas.** Abrir a mesma tela em duas abas, alterar numa e olhar a
      outra. Observar: fica inconsistente sem avisar?
- [ ] **Texto longo.** Colar 2.000 caracteres num campo de nome. Observar: corta,
      avisa, ou quebra o layout?
- [ ] **Acentuação e emoji** em todos os campos de texto.
- [ ] **Sessão expirada.** Deixar aberto por muito tempo (ou apagar o token no
      DevTools) e tentar salvar. Observar: manda para o login ou dá erro cru?
- [ ] **Offline.** Desligar a rede e tentar salvar. Observar: mensagem
      compreensível ou erro técnico?
- [ ] **Zoom em 200%** e navegação **só por teclado** (Tab). Observar: dá para
      usar? O foco fica visível?

---

## Achados conhecidos da varredura automatizada

Os achados da primeira execução **foram corrigidos** — diálogos sem descrição em
`/email-sequences` e `/sales-goals`, e os controles sem nome de `/lead-scoring`.
A mesma varredura no código encontrou o defeito repetido em outras telas
(`/settings`, `/deals`), corrigido junto. Se algum reaparecer no relatório, é
regressão, não achado velho.

O que foi corrigido, para você conferir com leitor de tela se quiser:

- Diálogos "Nova sequência", "Nova meta" e "Nova chave" agora têm descrição.
- Switches passaram a dizer de que item são — em `/lead-scoring` o nome inclui a
  regra ("Ativar a regra X"), não só "Ativa".
- Campos que dependiam de `placeholder` como muleta ganharam `label` de verdade;
  os `Select` do Radix ganharam `aria-labelledby` (são `<button>`, e `label for`
  não nomeia botão).

Falsos positivos já verificados e descartados: botão "PDF" em `/reports` (chama
`window.print()`), e abas já ativas em `/contacts`, `/deals`, `/library`,
`/settings` e `/lead-scoring`.

---

## Preparação

A suíte e o roteiro rodam contra o **backend de produção**, e existe **uma única
organização**. Consequências:

- Registros que você criar testando ficam lá. Use nomes reconhecíveis (ex.
  prefixo `TESTE`) para achar e limpar depois.
- Para testar o onboarding do zero é preciso reverter `setup_completed` da
  organização. Isso manda todo login para `/setup` enquanto durar. Não faça em
  horário em que alguém esteja usando — e me peça para reverter e restaurar, que
  é o que o spec do wizard já faz automaticamente.
- **Não ative modelos de follow-up** durante o teste se a régua atual importar:
  essa categoria substitui, não acrescenta.
