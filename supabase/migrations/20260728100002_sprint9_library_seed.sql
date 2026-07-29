-- =====================================================
-- FlowCRM 2.0 — Sprint 9 / Migration 9B: seed dos modelos de mercado
--
-- Conteúdo de partida, não estrutura. Pode ser atualizado sem nova migration.
-- ON CONFLICT DO NOTHING para a migration ser reexecutável sem duplicar.
-- =====================================================

-- =============================================
-- SEQUÊNCIAS DE EMAIL
-- =============================================

INSERT INTO public.library_templates
  (category, subcategory, title, description, preview, content, tags, sort_order)
VALUES

-- 1. Boas-vindas (3 etapas)
('email_sequence', 'boas_vindas',
 'Boas-vindas ao novo lead',
 'Sequência de 3 emails para apresentar sua empresa a um lead recém-captado. Tom consultivo, foco em valor, sem pressão de venda.',
 'Assunto: Bem-vindo! Aqui está o que preparamos para você',
 '{
   "steps": [
     {
       "order": 1,
       "delay_days": 0,
       "subject": "Bem-vindo! Aqui está o que preparamos para você",
       "body": "Olá {{contact.first_name}},\n\nFicamos muito felizes em ter você aqui.\n\nNos próximos dias vou te mostrar como empresas como a sua estão usando [solução] para [resultado principal].\n\nSe tiver qualquer dúvida, é só responder este email.\n\nAbraços,\n{{user.first_name}}"
     },
     {
       "order": 2,
       "delay_days": 2,
       "subject": "Como [empresa similar] conseguiu [resultado] em 30 dias",
       "body": "Olá {{contact.first_name}},\n\nQuero te contar uma história rápida.\n\n[Nome da empresa], do setor de [setor], estava enfrentando [problema comum]. Em 30 dias usando [solução], eles conseguiram [resultado concreto].\n\nO que mudou? [Explicação simples em 2-3 linhas].\n\nVocê gostaria de entender como isso se aplica ao seu caso?\n\nAbraços,\n{{user.first_name}}"
     },
     {
       "order": 3,
       "delay_days": 5,
       "subject": "Um convite para você",
       "body": "Olá {{contact.first_name}},\n\nEsta é minha última mensagem desta sequência — não quero encher sua caixa de entrada.\n\nSe fizer sentido, adoraria ter 20 minutos para entender melhor o seu momento e ver se consigo ajudar.\n\nSe não for o momento certo, sem problema. Fico à disposição quando precisar.\n\n[Link de agendamento]\n\nAbraços,\n{{user.first_name}}"
     }
   ]
 }',
 ARRAY['boas-vindas', 'prospecção', 'lead novo'],
 10),

-- 2. Nutrição de lead (5 etapas)
('email_sequence', 'nutricao',
 'Nutrição de lead — Educação e valor',
 'Sequência de 5 emails para educar o lead sobre o problema que você resolve. Ideal para leads que ainda estão na fase de consciência.',
 'Assunto: Você sabia que [problema] custa [impacto] para empresas do seu porte?',
 '{
   "steps": [
     {
       "order": 1,
       "delay_days": 0,
       "subject": "Você sabia que [problema] custa [impacto] para empresas do seu porte?",
       "body": "Olá {{contact.first_name}},\n\nUma pesquisa recente mostrou que empresas do setor de [setor] perdem em média [valor/tempo] por ano por causa de [problema].\n\nNos próximos emails vou te mostrar por que isso acontece e o que as empresas mais eficientes estão fazendo diferente.\n\nAbraços,\n{{user.first_name}}"
     },
     {
       "order": 2,
       "delay_days": 3,
       "subject": "Por que [problema] é mais difícil de resolver do que parece",
       "body": "Olá {{contact.first_name}},\n\nA maioria das empresas tenta resolver [problema] fazendo [abordagem comum]. O resultado?\n\n[Consequência 1]\n[Consequência 2]\n[Consequência 3]\n\nO problema não é falta de esforço — é falta de [insight principal].\n\nAmanhã te mostro como as empresas que resolveram isso pensaram diferente.\n\nAbraços,\n{{user.first_name}}"
     },
     {
       "order": 3,
       "delay_days": 6,
       "subject": "A virada: o que empresas líderes fazem diferente",
       "body": "Olá {{contact.first_name}},\n\nAs empresas que resolveram [problema] têm uma coisa em comum: elas [insight/abordagem diferente].\n\nEm vez de [abordagem antiga], elas [abordagem nova].\n\nO resultado prático: [benefício 1], [benefício 2] e [benefício 3].\n\nAbraços,\n{{user.first_name}}"
     },
     {
       "order": 4,
       "delay_days": 10,
       "subject": "Case: como [empresa] saiu de [situação A] para [situação B]",
       "body": "Olá {{contact.first_name}},\n\n[Nome], da [Empresa], estava exatamente na mesma situação que você pode estar agora.\n\n[Descrição do problema em 2 linhas]\n\nO que eles fizeram:\n1. [Passo 1]\n2. [Passo 2]\n3. [Passo 3]\n\nResultado em [prazo]: [resultado concreto com número].\n\nAbraços,\n{{user.first_name}}"
     },
     {
       "order": 5,
       "delay_days": 14,
       "subject": "Próximo passo — quando fizer sentido para você",
       "body": "Olá {{contact.first_name}},\n\nNos últimos dias compartilhei bastante sobre [tema]. Espero que tenha sido útil.\n\nSe quiser entender como isso se aplica especificamente ao seu caso, posso reservar 30 minutos para uma conversa sem compromisso.\n\n[Link de agendamento]\n\nSe preferir continuar recebendo conteúdo antes, sem problema — fico à disposição.\n\nAbraços,\n{{user.first_name}}"
     }
   ]
 }',
 ARRAY['nutrição', 'educação', 'mid-funnel'],
 20),

-- 3. Reengajamento de lead frio (3 etapas)
('email_sequence', 'reengajamento',
 'Reengajamento de lead frio',
 'Sequência de 3 emails para retomar contato com leads que pararam de responder. Tom direto, sem rodeios.',
 'Assunto: Ainda faz sentido conversar?',
 '{
   "steps": [
     {
       "order": 1,
       "delay_days": 0,
       "subject": "Ainda faz sentido conversar, {{contact.first_name}}?",
       "body": "Olá {{contact.first_name}},\n\nFaz um tempo que não nos falamos. Queria checar se [problema que discutimos] ainda é uma prioridade para você.\n\nSe o momento mudou, tudo bem — é só me falar e não entro mais em contato.\n\nSe ainda faz sentido, adoraria retomar.\n\nAbraços,\n{{user.first_name}}"
     },
     {
       "order": 2,
       "delay_days": 5,
       "subject": "Algo mudou desde a última vez que conversamos?",
       "body": "Olá {{contact.first_name}},\n\nDesde que conversamos, muita coisa pode ter mudado. Novos projetos, novas prioridades, novo momento.\n\nSe [problema] voltou a ser relevante, seria ótimo conversar. Tenho algumas ideias novas que podem fazer sentido para o seu contexto.\n\n[Link de agendamento]\n\nAbraços,\n{{user.first_name}}"
     },
     {
       "order": 3,
       "delay_days": 10,
       "subject": "Última mensagem",
       "body": "Olá {{contact.first_name}},\n\nEsta é minha última tentativa de contato. Não quero incomodar.\n\nSe em algum momento fizer sentido conversar, pode me encontrar aqui: [link ou email].\n\nDesejo muito sucesso no que estiver construindo.\n\nAbraços,\n{{user.first_name}}"
     }
   ]
 }',
 ARRAY['reengajamento', 'lead frio', 'breakup'],
 30),

-- 4. Follow-up pós-reunião
('email_sequence', 'pos_venda',
 'Follow-up pós-reunião',
 'Sequência de 3 emails para manter o momentum depois de uma reunião comercial. Do resumo até o fechamento.',
 'Assunto: Resumo da nossa conversa de hoje',
 '{
   "steps": [
     {
       "order": 1,
       "delay_days": 0,
       "subject": "Resumo da nossa conversa de hoje",
       "body": "Olá {{contact.first_name}},\n\nFoi ótimo conversar hoje. Seguem os pontos principais:\n\n✅ [Ponto 1 discutido]\n✅ [Ponto 2 discutido]\n✅ [Próximo passo combinado]\n\nConforme combinamos, [próximo passo específico] acontece até [data].\n\nQualquer dúvida, pode me chamar.\n\nAbraços,\n{{user.first_name}}"
     },
     {
       "order": 2,
       "delay_days": 3,
       "subject": "Sobre [próximo passo da proposta]",
       "body": "Olá {{contact.first_name}},\n\nQueria dar um alô e ver se surgiu alguma dúvida depois da nossa conversa.\n\nSe precisar de mais informações ou quiser ajustar algum ponto da proposta, é só falar.\n\nAbraços,\n{{user.first_name}}"
     },
     {
       "order": 3,
       "delay_days": 7,
       "subject": "Como posso ajudar na decisão?",
       "body": "Olá {{contact.first_name}},\n\nSei que decisões assim envolvem várias pessoas e etapas. Queria saber se há algo que eu possa fazer para facilitar o processo interno de vocês.\n\nPosso preparar uma apresentação resumida para outros stakeholders, detalhar algum ponto específico ou ajustar a proposta se necessário.\n\nComo posso ajudar?\n\nAbraços,\n{{user.first_name}}"
     }
   ]
 }',
 ARRAY['pós-reunião', 'proposta', 'fechamento'],
 40),

-- =============================================
-- TEMPLATES DE EMAIL AVULSOS
-- =============================================

('email_template', 'prospeccao',
 'Email de prospecção fria — Abordagem por problema',
 'Email de primeiro contato focado no problema do lead, não no produto. Taxa de resposta acima da média para cold outreach.',
 'Assunto: [Empresa] + [Seu nome] — 2 minutos?',
 '{
   "subject": "{{contact.company}} + {{user.first_name}} — 2 minutos?",
   "body": "Olá {{contact.first_name}},\n\nVi que a {{contact.company}} [observação específica sobre a empresa — crescimento, produto novo, contratação].\n\nEmpresas nessa fase geralmente enfrentam [problema específico]. É algo que vocês estão lidando?\n\nAjudei [empresa similar] a resolver isso em [prazo] e achei que poderia fazer sentido conversar.\n\nVale um papo rápido?\n\n[Seu nome]\n[Cargo] | [Empresa]"
 }',
 ARRAY['cold email', 'prospecção', 'primeiro contato'],
 10),

('email_template', 'pos_venda',
 'Email de pesquisa de satisfação pós-venda',
 'Email simples e direto para coletar feedback após a entrega. Tom pessoal, sem formulário complexo.',
 'Assunto: Como foi a experiência com a gente?',
 '{
   "subject": "Como foi a experiência com a gente, {{contact.first_name}}?",
   "body": "Olá {{contact.first_name}},\n\nFaz [prazo] desde que [produto/serviço] entrou em operação em vocês.\n\nQueria saber: como está sendo a experiência?\n\nDe 0 a 10, qual a chance de você recomendar [empresa] para um colega ou parceiro?\n\nQualquer feedback, positivo ou negativo, me ajuda muito a melhorar.\n\nObrigado,\n{{user.first_name}}"
 }',
 ARRAY['pós-venda', 'NPS', 'satisfação'],
 20),

('email_template', 'retencao',
 'Email de renovação antecipada',
 'Abordagem de renovação 60 dias antes do vencimento. Foco em valor entregue, não em urgência.',
 'Assunto: Sua renovação se aproxima — e tenho boas novidades',
 '{
   "subject": "Sua renovação se aproxima — e tenho boas novidades, {{contact.first_name}}",
   "body": "Olá {{contact.first_name}},\n\nSeu contrato vence em [data]. Antes de falar de renovação, queria fazer um balanço rápido do que construímos juntos:\n\n📊 [Resultado 1 com número]\n📊 [Resultado 2 com número]\n📊 [Resultado 3 com número]\n\nPara o próximo ciclo, temos [novidade/melhoria] que vai [benefício adicional].\n\nPodemos conversar sobre a renovação e o que vem por aí?\n\n[Link de agendamento]\n\nAbraços,\n{{user.first_name}}"
 }',
 ARRAY['renovação', 'retenção', 'upsell'],
 30),

-- =============================================
-- FOLLOW-UP WHATSAPP
-- =============================================

('followup', 'nutricao',
 'Follow-up padrão — 3 tentativas',
 'Régua simples e eficaz para leads que pararam de responder no WhatsApp. 3 tentativas em 7 dias, tom progressivamente mais direto.',
 'Mensagem 1: Oi {{contact.first_name}}, tudo bem? Vi que você...',
 '{
   "max_attempts": 3,
   "on_limit_reached": "notify_agent",
   "steps": [
     {
       "order": 1,
       "delay_hours": 24,
       "message": "Oi {{contact.first_name}}, tudo bem? 😊\n\nVi que você ainda não teve chance de ver minha última mensagem. Queria saber se surgiu alguma dúvida sobre [produto/serviço].\n\nEstou por aqui!"
     },
     {
       "order": 2,
       "delay_hours": 72,
       "message": "Olá {{contact.first_name}}!\n\nTentei falar com você nos últimos dias. Sei que o dia a dia é corrido.\n\nSe quiser conversar sobre [assunto], é só me dar um alô. Se não for o momento certo, sem problema também! 🙂"
     },
     {
       "order": 3,
       "delay_hours": 168,
       "message": "Oi {{contact.first_name}}, vou deixar você tranquilo por aqui.\n\nSe em algum momento quiser retomar a conversa sobre [assunto], pode me chamar quando quiser.\n\nBom sucesso! 👋"
     }
   ]
 }',
 ARRAY['follow-up', 'WhatsApp', 'lead'],
 10),

('followup', 'prospeccao',
 'Follow-up agressivo — 5 tentativas',
 'Régua mais persistente para leads de alto valor. 5 tentativas em 14 dias com variação de abordagem.',
 'Mensagem 1: Oi {{contact.first_name}}! Queria verificar se você recebeu...',
 '{
   "max_attempts": 5,
   "on_limit_reached": "both",
   "steps": [
     {
       "order": 1,
       "delay_hours": 2,
       "message": "Oi {{contact.first_name}}! Queria verificar se você recebeu minha mensagem anterior sobre [assunto]. 😊"
     },
     {
       "order": 2,
       "delay_hours": 24,
       "message": "Olá {{contact.first_name}}! Tentando falar com você sobre [assunto]. Vale muito a conversa — [benefício rápido em uma linha]. Tem 5 minutinhos esta semana?"
     },
     {
       "order": 3,
       "delay_hours": 72,
       "message": "{{contact.first_name}}, sei que você deve estar cheio de mensagens 😅\n\nSó queria compartilhar: [resultado/case rápido] que pode ser relevante para você. Vale dar uma olhada?"
     },
     {
       "order": 4,
       "delay_hours": 120,
       "message": "Oi {{contact.first_name}}! Última tentativa por aqui 😊\n\nSe [assunto] não for prioridade agora, tudo bem! Mas se quiser conversar quando o momento certo chegar, é só me chamar.\n\nBom sucesso!"
     },
     {
       "order": 5,
       "delay_hours": 168,
       "message": "{{contact.first_name}}, encerrando por aqui. Se um dia fizer sentido conversar sobre [assunto], estarei disponível. Cuide-se! 👋"
     }
   ]
 }',
 ARRAY['follow-up', 'WhatsApp', 'high-value', 'agressivo'],
 20),

('followup', 'pos_venda',
 'Follow-up pós-venda — Check-in de sucesso',
 'Sequência para acompanhar clientes nos primeiros 30 dias após a compra. Foco em onboarding e satisfação.',
 'Mensagem 1: Oi {{contact.first_name}}! Passando para saber como está sendo...',
 '{
   "max_attempts": 3,
   "on_limit_reached": "notify_agent",
   "steps": [
     {
       "order": 1,
       "delay_hours": 48,
       "message": "Oi {{contact.first_name}}! 😊 Passando para saber como está sendo a experiência com [produto/serviço].\n\nTem alguma dúvida ou algo que posso ajudar?"
     },
     {
       "order": 2,
       "delay_hours": 168,
       "message": "Olá {{contact.first_name}}! Faz uma semana que você começou a usar [produto/serviço].\n\nComo está indo? Está conseguindo [resultado esperado]? Me conta! 🙂"
     },
     {
       "order": 3,
       "delay_hours": 504,
       "message": "Oi {{contact.first_name}}! Já faz um mês com a gente. 🎉\n\nQueria saber: o que está funcionando bem e o que poderíamos melhorar?\n\nSeu feedback é muito importante para nós!"
     }
   ]
 }',
 ARRAY['follow-up', 'pós-venda', 'onboarding', 'sucesso do cliente'],
 30),

-- =============================================
-- AUTOMAÇÕES
-- =============================================

('automation', 'geral',
 'Mover deal ao responder email',
 'Quando um contato responde a um email, o deal vinculado avança automaticamente para a próxima etapa do pipeline.',
 'Gatilho: Email recebido → Ação: Mover deal para próxima etapa',
 '{
   "trigger": {
     "type": "email_received",
     "label": "Email recebido de contato"
   },
   "conditions": [
     {
       "field": "contact.deal_id",
       "operator": "is_not_null",
       "label": "Contato tem deal vinculado"
     }
   ],
   "actions": [
     {
       "type": "move_deal_to_next_stage",
       "label": "Mover deal para próxima etapa"
     },
     {
       "type": "create_activity",
       "label": "Registrar atividade: Email recebido",
       "params": {
         "type": "email",
         "title": "Email recebido de {{contact.first_name}}"
       }
     }
   ]
 }',
 ARRAY['automação', 'deal', 'email', 'pipeline'],
 10),

('automation', 'nutricao',
 'Criar tarefa quando deal entra em Proposta',
 'Automaticamente cria uma tarefa de acompanhamento para o responsável quando um deal chega na etapa de Proposta.',
 'Gatilho: Deal entra em etapa "Proposta" → Ação: Criar tarefa de follow-up',
 '{
   "trigger": {
     "type": "deal_stage_changed",
     "label": "Deal mudou de etapa"
   },
   "conditions": [
     {
       "field": "deal.stage.name",
       "operator": "equals",
       "value": "Proposta",
       "label": "Etapa é Proposta"
     }
   ],
   "actions": [
     {
       "type": "create_activity",
       "label": "Criar tarefa de follow-up em 2 dias",
       "params": {
         "type": "task",
         "title": "Follow-up proposta — {{deal.title}}",
         "due_days": 2,
         "assign_to": "deal_owner"
       }
     }
   ]
 }',
 ARRAY['automação', 'proposta', 'tarefa', 'follow-up'],
 20),

('automation', 'retencao',
 'Alertar gerente quando deal fica parado',
 'Notifica o gerente responsável quando um deal fica sem atualização por mais de 7 dias.',
 'Gatilho: Deal sem atualização há 7 dias → Ação: Notificar gerente',
 '{
   "trigger": {
     "type": "deal_stale",
     "label": "Deal sem atualização",
     "params": { "days_inactive": 7 }
   },
   "conditions": [
     {
       "field": "deal.status",
       "operator": "equals",
       "value": "open",
       "label": "Deal ainda está em aberto"
     }
   ],
   "actions": [
     {
       "type": "notify_user",
       "label": "Notificar gerente do responsável",
       "params": {
         "target": "deal_owner_manager",
         "message": "O deal {{deal.title}} está sem atualização há 7 dias. Responsável: {{deal.owner.name}}."
       }
     }
   ]
 }',
 ARRAY['automação', 'alerta', 'gerente', 'pipeline parado'],
 30),

('automation', 'boas_vindas',
 'Boas-vindas automático para novo lead',
 'Envia um email de boas-vindas automaticamente quando um novo contato é criado com status lead.',
 'Gatilho: Novo contato criado com status lead → Ação: Enviar email de boas-vindas',
 '{
   "trigger": {
     "type": "contact_created",
     "label": "Novo contato criado"
   },
   "conditions": [
     {
       "field": "contact.status",
       "operator": "equals",
       "value": "lead",
       "label": "Status é lead"
     }
   ],
   "actions": [
     {
       "type": "send_email",
       "label": "Enviar email de boas-vindas",
       "params": {
         "template": "boas_vindas_lead"
       }
     },
     {
       "type": "create_activity",
       "label": "Registrar primeiro contato",
       "params": {
         "type": "email",
         "title": "Email de boas-vindas enviado"
       }
     }
   ]
 }',
 ARRAY['automação', 'boas-vindas', 'lead', 'primeiro contato'],
 40),

-- =============================================
-- BASE DE CONHECIMENTO DA IA — FAQs
-- =============================================

('ai_faq', 'geral',
 'Perguntas frequentes — Processo de vendas',
 'Conjunto de FAQs para guiar a IA nos principais momentos do processo de vendas: preço, prazo, suporte e diferencial.',
 'P: Quanto custa? R: Nossos planos começam em...',
 '{
   "faqs": [
     {
       "question": "Quanto custa?",
       "answer": "Nossos planos começam em [valor]. O valor final depende do tamanho do time e das funcionalidades que você precisa. Posso te passar mais detalhes ou agendar uma conversa com nosso time comercial?"
     },
     {
       "question": "Vocês têm período de teste?",
       "answer": "Sim! Oferecemos [X dias] de teste gratuito sem precisar de cartão de crédito. Você pode testar todas as funcionalidades sem compromisso."
     },
     {
       "question": "Quanto tempo leva para implementar?",
       "answer": "A implementação básica leva em média [prazo]. Para integrações mais complexas, pode variar. Nossa equipe acompanha todo o processo."
     },
     {
       "question": "Vocês têm suporte em português?",
       "answer": "Sim, todo o nosso suporte é em português, em horário comercial de segunda a sexta."
     },
     {
       "question": "Posso cancelar a qualquer momento?",
       "answer": "Sim, sem fidelidade. Você pode cancelar quando quiser sem multa."
     },
     {
       "question": "O que diferencia vocês dos concorrentes?",
       "answer": "[Diferencial 1], [Diferencial 2] e [Diferencial 3]. Mas a melhor forma de entender é conversando sobre o seu caso específico — posso agendar uma demonstração?"
     }
   ]
 }',
 ARRAY['FAQ', 'vendas', 'preço', 'suporte'],
 10),

-- =============================================
-- BASE DE CONHECIMENTO DA IA — OBJEÇÕES
-- =============================================

('ai_objection', 'geral',
 'Objeções comuns em vendas B2B',
 'As 6 objeções mais frequentes em vendas consultivas e como contorná-las de forma honesta e eficaz.',
 'Objeção: Está caro. Resposta: Entendo. Podemos olhar juntos...',
 '{
   "objections": [
     {
       "objection": "Está caro",
       "response": "Entendo. Quando você diz caro, está comparando com alguma solução específica ou é o investimento total que está acima do orçamento? Quero entender melhor para ver se consigo ajudar."
     },
     {
       "objection": "Não tenho orçamento agora",
       "response": "Faz sentido. Quando costuma revisar o orçamento? Posso te mandar informações que ajudem a montar o case interno quando chegar esse momento."
     },
     {
       "objection": "Preciso pensar",
       "response": "Claro, é uma decisão importante. O que falta para você se sentir mais confortável? Às vezes é uma dúvida específica que ainda não respondemos."
     },
     {
       "objection": "Já temos uma solução",
       "response": "Ótimo! Como está sendo a experiência? Pergunto porque muitos clientes vieram de soluções similares e o que os motivou foi [diferencial específico]. Mas se está funcionando bem, faz sentido manter."
     },
     {
       "objection": "Não é o momento certo",
       "response": "Entendo. O que precisaria mudar para ser o momento certo? Assim consigo te ajudar melhor quando chegar lá."
     },
     {
       "objection": "Preciso consultar outras pessoas",
       "response": "Faz todo sentido. Posso preparar algo que facilite essa conversa interna? Um resumo dos pontos principais ou uma proposta formal, por exemplo."
     }
   ]
 }',
 ARRAY['objeções', 'vendas B2B', 'consultivo'],
 10)
ON CONFLICT (category, title) DO NOTHING;
