# Webhooks do FlowCRM

Contrato para conectar o FlowCRM às outras soluções do Viver de IA, ao n8n, ao Make ou a qualquer sistema com HTTP.
Configuração pela tela: **Configurações > Integrações > Webhooks**.

## Enviar: FlowCRM chama a sua URL

Cada destino tem nome, URL, lista de eventos e um secret próprio. Uma empresa pode ter quantos destinos quiser.

### Requisição

```
POST <url do destino>
Content-Type: application/json
User-Agent: FlowCRM-Webhooks/1.0
X-FlowCRM-Event: deal.won
X-FlowCRM-Event-Id: 6f1c...   (igual ao "id" do corpo; use para ignorar repetição)
X-FlowCRM-Delivery: 9a2b...   (muda a cada entrega, inclusive no reenvio)
X-FlowCRM-Timestamp: 1789420000
X-FlowCRM-Signature: sha256=<hex>
```

```json
{
  "id": "6f1c...",
  "event": "deal.won",
  "org_id": "46f7...",
  "occurred_at": "2026-09-14T20:40:00.000Z",
  "source": "flowcrm",
  "data": {
    "deal": { "id": "...", "title": "Plano anual", "value": 4500, "status": "won", "stage": { "id": "...", "name": "Fechamento" } },
    "contact": { "id": "...", "name": "Maria Souza", "email": "maria@empresa.com", "whatsapp": "5511999998888", "company": { "name": "Empresa X" } }
  }
}
```

### Como conferir a assinatura

`X-FlowCRM-Signature` é `sha256=` seguido do HMAC-SHA256 em hexadecimal de `"<X-FlowCRM-Timestamp>.<corpo cru>"`, com o secret do destino.
Use o corpo exatamente como chegou (antes de fazer parse). Recuse timestamps com mais de 5 minutos de diferença.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function assinaturaValida(secret, timestamp, corpoCru, cabecalho) {
  const esperado = "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${corpoCru}`).digest("hex");
  return esperado.length === cabecalho.length && timingSafeEqual(Buffer.from(esperado), Buffer.from(cabecalho));
}
```

### Eventos

| Evento | Quando | `data` |
|---|---|---|
| `contact.created` | contato novo | `contact` |
| `contact.updated` | nome, e-mail, telefone, empresa, status ou campos extras mudaram | `contact` |
| `deal.created` | negócio novo | `deal`, `contact` |
| `deal.stage_changed` | negócio mudou de etapa | `deal`, `contact`, `previous_stage` |
| `deal.won` / `deal.lost` | negócio ganho ou perdido | `deal`, `contact` |
| `activity.created` | tarefa, reunião, ligação, nota ou e-mail registrado | `activity`, `contact` |
| `message.received` | mensagem recebida em qualquer canal | `message`, `conversation`, `contact` |
| `nps.submitted` | cliente respondeu o NPS | `nps` (com `category`: promoter, passive, detractor), `contact` |
| `ping` | botão Testar | `message` |

Assinar `*` recebe todos, inclusive eventos criados no futuro. Dados de demonstração nunca são enviados.

O `deal` leva `stage` (`id`, `name`, `win_probability`), `owner` (`id`, `name`, `email`) e `custom_fields`, além dos campos de valor e status.

### Formato do Painel Preditivo de Metas

O destino pode trocar o formato para **Painel Preditivo de Metas**. Aí o corpo sai no formato que o `receive-crm-webhook` do painel já entende, sem n8n no meio:

```json
{
  "event_type": "deal.created",
  "deal": {
    "external_id": "<id do negócio>",
    "user_email": "<e-mail do responsável>",
    "title": "Apto Jardins",
    "stage": "visita",
    "value": 850000,
    "lead_origin": "whatsapp",
    "segment": "alto_padrao",
    "client_gender": "feminino",
    "closed_at": "só em fechamento"
  }
}
```

- Eventos: `deal.created`, `deal.stage_changed` e `deal.won` (vira `deal.closed`). Negócio perdido não vai, porque o painel não tem esse status.
- `stage`: pelo nome da etapa (lead, contato/qualificação, visita/reunião, proposta/negociação, fechamento) e, se o nome não disser nada, pela probabilidade de ganho da etapa. Ganho é sempre `fechamento`.
- `lead_origin` vem da origem do contato; `segment` do campo extra `segment` do negócio; `client_gender` e `client_age_range` dos campos extras `gender` e `age_range` do contato.
- O secret do destino vai em `x-webhook-secret` (os headers X-FlowCRM continuam indo).
- O painel acha o corretor pelo `user_email`: **negócio sem responsável, ou com responsável sem usuário no painel, é recusado lá** (`corretor_not_found`).
- O botão Testar manda um negócio vazio: o painel registra e responde 422 `corretor_not_found`, que o FlowCRM mostra como conexão ok (secret errado seria 401).

### Resposta, novas tentativas e reenvio

- Sucesso é qualquer **2xx em até 10 segundos**. Responda rápido e processe depois, se precisar.
- Qualquer outra coisa agenda nova tentativa em **1 min, 5 min, 30 min, 2 h e 12 h**. Depois da sexta falha a entrega fica como falha, com o status e o começo da resposta do destino.
- Na tela dá para ver as últimas entregas, testar o destino e reenviar uma entrega que falhou.
- A mesma ocorrência pode chegar mais de uma vez (reenvio, rede). Use `X-FlowCRM-Event-Id` para ignorar repetição.

## Receber: a sua solução chama o FlowCRM

### Requisição

```
POST https://<projeto>.supabase.co/functions/v1/webhook-inbound
Authorization: Bearer fcrm_...        (ou x-webhook-token: fcrm_...)
Content-Type: application/json
Idempotency-Key: <id único da ocorrência>   (opcional, recomendado)
```

A chave é criada na tela, uma por solução, e aparece **uma única vez** (o banco guarda só o hash). Revogar a chave recusa as chamadas na hora.

O corpo pode vir de três jeitos:

1. **Ação do CRM**: `{ "action": "contact.upsert", "data": { ... } }`
2. **Evento**, no mesmo envelope da saída: `{ "event": "contract.signed", "id": "...", "data": { ... } }`. Sem `Idempotency-Key`, o `id` do envelope é usado como chave de idempotência.
3. **Plano**, sem `action` nem `event`: tratado como `lead.created`. Serve para quem só sabe mandar a linha do lead.

### Quem é o contato

O FlowCRM procura o contato pelo **e-mail** e, se não achar, pelo **telefone** (só dígitos; número brasileiro sem DDI ganha 55).
Os dados podem vir em `data`, `data.contact`, `data.lead`, `data.customer`, `data.cliente`, `data.patient` ou `data.signers[0]`.
Campos aceitos: `email`, `phone`/`telefone`/`whatsapp`/`celular`, `name`/`nome` (ou `first_name` e `last_name`), `company`/`empresa`, `tags`, `source`/`origem`, `custom_fields`.

### Ações e eventos

| Nome | Sinônimos aceitos | O que faz |
|---|---|---|
| `lead.created` | `lead.captured`, `lead.qualified`, corpo plano | cria ou completa o contato e garante um negócio aberto |
| `contact.upsert` | `contact.created`, `contact.updated` | cria ou atualiza o contato, sobrescrevendo os campos enviados |
| `deal.create` | `deal.created` | cria negócio (`title`, `value`, `stage` pelo nome) |
| `deal.update` | `deal.updated`, `deal.stage_changed`, `deal.move` | atualiza `deal_id` ou o negócio aberto do contato (`stage`, `value`, `status`, `title`) | Aceita também `owner_email` (e-mail de um usuário ativo da organização) para trocar o responsável; o novo dono recebe a notificação de negócio atribuído.
| `deal.won` / `deal.lost` | | marca o negócio como ganho ou perdido |
| `activity.create` | `activity.created`, `task.create` | cria atividade (`type`: task, meeting, call, note, email) |
| `note.create` | `note.created` | registra uma nota |
| `appointment.scheduled` | `appointment.created`, `booking.created`, `meeting.scheduled` | reunião ligada ao negócio aberto (`start_time`) |
| `tag.add` | | aplica `tag` ao contato |
| `contract.signed` | `envelope.completed`, `document.signed` | nota "Contrato assinado" e negócio aberto vira ganho |
| `payment.confirmed` | `payment.received`, `transaction.confirmed`, `invoice.paid` | nota com o valor e negócio aberto vira ganho (com o valor) |
| `payment.overdue` | `invoice.overdue` | tag Inadimplente e nota |
| `nps.submitted` | `feedback.received`, `review.created` | nota "NPS n" com o comentário; tag Detrator (0 a 6) ou Promotor (9 e 10) |
| `ping` | | responde `{ "pong": true }` |

Nos eventos de solução, o contato só tem os campos **vazios** preenchidos: um pagamento não troca o nome que o vendedor corrigiu à mão. Para sobrescrever, use `contact.upsert`.

### Respostas

| HTTP | Quando |
|---|---|
| 200 | `{ "ok": true, "action": "...", "contact_id": "...", ... }`. Repetição da mesma `Idempotency-Key` devolve a resposta original com `"duplicate": true` |
| 400 | corpo que não é objeto JSON, ou ação desconhecida (a mensagem lista as aceitas) |
| 401 | chave ausente, errada ou revogada |
| 404 | negócio ou contato não encontrado numa atualização |
| 409 | a mesma `Idempotency-Key` ainda está sendo processada |
| 422 | faltou dado obrigatório (ex.: contato sem e-mail nem telefone, etapa que não existe) |

Toda chamada autenticada fica no log da tela, com o que chegou e o que foi respondido.

## Soluções do Viver de IA

| Solução | Como conectar |
|---|---|
| TypeFlow (captação de leads) | destino de lead da solução apontando para `webhook-inbound` com `x-webhook-token`; a linha do lead chega plana e vira `lead.created` |
| AssinaAí (contratos) | assinatura de webhook da solução com o evento `envelope.completed` |
| FinanceAI (financeiro) | webhook de saída com `transaction.confirmed` |
| Análise de Satisfação, Pesquisa de Satisfação do Paciente, Avaliação de Restaurantes | `feedback.received` / `nps.submitted` com o e-mail ou telefone do cliente |
| Sistema de Agendamentos, NinaTalks | `appointment.scheduled` |
| n8n, Make, Zapier | nó HTTP com a chave no header |
| Painel Preditivo de Metas | destino com formato "Painel Preditivo de Metas" (ver acima) |

Eventos de RH (candidato, colaborador) não fazem parte do CRM e são recusados com 400.

## Testes

`npm run test:hard` roda o hard smoke contra o backend, incluindo `e2e/hard/webhooks.spec.ts`: assinatura, novas tentativas, reenvio, teste, idempotência e os payloads reais das soluções acima.


## API pública (leitura e escrita com escopos)

Para uma solução operar o CRM (SDR de IA externo, TypeFlow, n8n, Make, sistema próprio) além do webhook de entrada, existe a API em `/functions/v1/api`. A chave nasce em Configurações > API (`fcrm_live_...`), com escopos por recurso e limite de chamadas por minuto; só o hash fica no banco. Cada chamada entra em `api_request_logs`.

| Rota | Escopo | O que faz |
|---|---|---|
| `GET /pipelines` | pipelines:read | funis com etapas em ordem |
| `GET /contacts?email=\|phone=\|q=` e `GET /contacts/:id` | contacts:read | busca e ficha (empresa, tags, negócios, atividades) |
| `POST /contacts` | contacts:write | cria ou atualiza por e-mail ou telefone (empresa pelo nome, dono por e-mail, campos extras) |
| `GET /deals?contact_id=\|status=` e `GET /deals/:id` | deals:read | negócios e ficha (etapa, produtos, histórico) |
| `POST /deals` | deals:write | cria (etapa por id ou nome, dono, produtos) |
| `PATCH /deals/:id` | deals:write | etapa (pelo `mover_negocio`, com motivo no histórico), status, valor, dono, campos |
| `GET /conversations?phone=` e `GET /conversations/:id/messages` | conversations:read | conversas e mensagens |
| `POST /conversations/:id/messages` | conversations:write | registra mensagem já enviada por fora (aparece na inbox) |
| `POST /conversations/:id/send` | conversations:write | envia pelo canal da org (Evolution, Meta ou Zernio) |
| `POST /conversations/:id/handoff`, `/pause-ai`, `/resume-ai` | conversations:write | transfere para humano, pausa ou reativa a IA interna |
| `POST /activities` | activities:write | tarefa, ligação, reunião, nota ou e-mail |
| `GET /products?q=` | products:read | catálogo ativo |
| `POST /products` | products:write | cria ou atualiza (acha pelo `external_id` em custom_fields e, sem ele, pelo nome); aceita `{ products: [...] }` com até 100 por chamada. Usado para espelhar catálogos externos, como a HeroSpark |
| `GET /knowledge` | knowledge:read | perfil do agente, FAQs e objeções |

Documentação legível por máquina em `GET /api/openapi.json` (sem chave). Eventos de saída novos para quem assina webhooks: `message.sent`, `conversation.started`, `conversation.handoff`, `deal.assigned`.
