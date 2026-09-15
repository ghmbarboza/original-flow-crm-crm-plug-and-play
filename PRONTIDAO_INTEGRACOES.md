# Prontidão das integrações (14/09/2026)

O que está provado por teste automatizado contra o backend de produção (`npm run test:hard`) e o que só a ferramenta real prova, com o checklist do dia da entrega.

## Como a prova funciona

- Cada integração recebe os payloads no formato documentado pelo fornecedor, e o teste confere o que ficou gravado no CRM.
- O que o CRM envia para fora passa pela function `integration-sandbox`, que finge ser o servidor Evolution e recebe os webhooks. O teste confere método, URL, headers, assinatura e corpo.
- Fornecedores com endereço fixo (Meta, Zernio, Google, ElevenLabs) são provados pelo caminho de erro contra a API real, com credencial falsa: o CRM precisa registrar a falha com o motivo.
- Tudo que o teste cria é apagado no fim. O teste nunca apaga registro que já existia antes dele começar.

## Por integração

| Integração | Provado por teste | Só a ferramenta real prova |
|---|---|---|
| **WhatsApp pelo Evolution** | conectar e registrar webhook com token; reconectar sem trocar o token; conexão aberta; token errado recusado; texto, rajada de 6 mensagens, foto com mídia; resposta pelo inbox; mensagem agendada; IA respondendo pelo canal; servidor fora do ar vira falha visível | parear o QR; o servidor gravar o webhook de verdade (v2.3); baixar mídia criptografada real |
| **WhatsApp API oficial (Meta)** | verificação do webhook com token da empresa; mensagem assinada; rajada de 5; assinatura errada recusada; envio, conexão e campanha com token recusado mostram o motivo da Meta | verificação no painel da Meta com a URL publicada; entrega em celular real; template aprovado; janela de 24 h |
| **Zernio (Instagram, Messenger, Telegram...)** | mensagem assinada vira conversa do canal; foto e documento gravados; rajada de 6 vira um contato e uma conversa; assinatura errada recusada; status de entrega e leitura; cadastro de webhook e envio com chave recusada mostram erro e não perdem a mensagem | login dos canais (OAuth); o Zernio aceitar o cadastro automático do webhook; envio real |
| **Agendamento (Cal.com)** | reserva assinada vira reunião ligada ao contato e ao negócio; sem assinatura, assinatura errada ou outra empresa não cria nada; outros eventos ignorados | o Cal.com assinar com o secret colado na tela |
| **ERP** | 4 eventos de entrada; token errado 401; evento desconhecido 400 com log; saída com Bearer e campos mapeados; destino 500 vira falha com motivo; botão Testar | o ERP do cliente aceitar o formato e a autenticação escolhidos |
| **Automações** | contato criado dispara a automação pelo cron e a tarefa aparece; condição que não bate registra que pulou | envio de e-mail pela conta Gmail conectada |
| **Webhooks (outras soluções, n8n, Make)** | saída assinada com envelope; evento não inscrito não sai; nova tentativa e reenvio; Testar; destino desativado; entrada com chave, upsert, lead plano (TypeFlow), contrato (AssinaAí), pagamento com idempotência (FinanceAI), feedback (Análise de Satisfação), agendamento, erros explicados, chave revogada | a solução do outro lado conferir a assinatura e responder 2xx em até 10 s |
| **Segurança** | dispatchers e IA recusam chamada sem segredo interno; disparo manual só para admin e lista fechada; login do Gmail com estado forjado recusado | |
| **Gmail** | estado do login assinado e com validade | consentimento no Google, troca do código, envio e sincronização |
| **Voz (ElevenLabs)** | sem chave, o aviso certo | qualidade de transcrição e de voz |

## Defeitos encontrados e corrigidos nesta rodada

1. Webhook do Evolution aceitava mensagem de qualquer um que soubesse o nome da instância.
2. Webhook da Meta não conferia assinatura, e a verificação do painel dependia de um secret que nunca existiu.
3. `ai-reply` aberta: qualquer um com o id de uma conversa fazia a IA responder.
4. Login do Gmail aceitava estado forjado.
5. Todas as functions no ar com `verify_jwt=false`: dispatchers abertos.
6. Automações nunca rodaram: não havia agendamento (fila com 2.748 execuções de teste).
7. Campanha que estourava o tempo ficava presa em "enviando".
8. Zernio nunca registrava o webhook: canais conectados, nenhuma mensagem chegando.
9. Rajada de mensagens perdia mensagens (6 enviadas, 1 gravada) no Evolution, Meta e Zernio.
10. Horário de atendimento configurado na tela era ignorado pela IA.
11. Zernio perdia o texto digitado quando a listagem de contas falhava.
12. Zernio registrava erro falso de anexo em toda mensagem de texto.

## Checklist do dia da entrega (por cliente)

**WhatsApp pelo Evolution (5 min)**
- [ ] Configurações > Integrações > Canais: conectar com a URL e a chave global do servidor e parear o QR.
- [ ] Mandar "oi" do celular: a conversa aparece no inbox em até 10 s.
- [ ] Responder pelo inbox: chega no celular.
- [ ] Se a IA estiver ligada: ela responde dentro do horário configurado.

**WhatsApp API oficial (10 min)**
- [ ] Preencher Phone Number ID, Business Account ID, Access Token e App Secret.
- [ ] No painel da Meta: colar a URL e o token de verificação mostrados na tela, assinar `messages`.
- [ ] O canal passa para "Conectado" só depois da verificação da Meta.
- [ ] Mandar mensagem do celular e responder pelo inbox.

**Zernio (5 min por canal)**
- [ ] Salvar API Key e Profile ID: a tela só conclui se o Zernio aceitar o webhook.
- [ ] Conectar cada canal pelo login do Zernio.
- [ ] Mandar mensagem em cada canal e responder pelo inbox.

**Cal.com (3 min)**
- [ ] Salvar o link, copiar URL e Secret para o webhook do Cal.com (evento Booking created).
- [ ] Fazer uma reserva de teste: vira reunião no CRM.

**Webhooks para outra solução (5 min)**
- [ ] Criar o destino ou a chave na tela.
- [ ] Destino: botão Testar responde OK.
- [ ] Chave: mandar um `ping` e um evento real; conferir no log da tela.

## Pendências conhecidas

- Servidores Evolution usados nos testes (2.25.150.154:32768 e o do Easypanel) fora do ar desde 12/09. Quando voltarem: reconectar a instância `sabrina-testesdesolucoes` pela tela, para gravar o webhook com o token novo. Sem isso as mensagens dela serão recusadas.
- Painel Preditivo de Metas: o painel encontra o corretor pelo e-mail do responsável do negócio. Negócio aberto pela conversa sai sem responsável e é recusado lá até alguém ser atribuído.

## Resolvidas em 15/09

- **Painel Preditivo de Metas:** o destino de webhook ganhou o formato "Painel Preditivo de Metas", que converte na entrega para `{event_type, deal}` com `x-webhook-secret` (WEBHOOKS.md).
- **Contato único por canal no Zernio:** índice `uniq_contact_canal_por_org` (org + canal + identificador). A rajada adota o mesmo contato. A limpeza antiga, que apagava a "sobra", foi retirada, porque com o índice ela apagaria o contato certo. O `conversation.started` também passou a ser à prova de corrida.
- **Mídia pelo Zernio:** foto, vídeo e documento são baixados na hora e gravados no bucket, como no Evolution. A mídia do WhatsApp via Zernio agora é baixada com a API Key, que o endpoint `/v1/whatsapp/media` exige: antes o download dava 401, e o áudio desse canal nunca era transcrito.
- **URL do projeto nos agendamentos:** os crons chamam `chamar_function()`, que lê a URL do Vault (`project_url`). Quem grava a URL é a `check-user-active`, a partir do ambiente, no primeiro login. Num remix, os dispatchers ficam parados (com aviso no log do Postgres) até o primeiro login, e nunca chamam o projeto original.
