/**
 * Resolução de problemas e glossário da Central de ajuda. Mesmo arquivo lido
 * pela tela de Ajuda e pelo assistente do CRM (edge function `assistente`).
 */
import type { Link } from "./guias.ts";

export interface Problema {
  id: string;
  sintoma: string;
  causas: string[];
  solucao: string[];
  link: Link;
  palavras?: string;
}

export const PROBLEMAS: Problema[] = [
  {
    id: "ia-nao-responde",
    sintoma: "A IA não está respondendo os clientes",
    causas: [
      "A IA está desligada ou fora do horário de atendimento.",
      "O canal do WhatsApp caiu ou ainda está aguardando pareamento.",
      "Um atendente assumiu a conversa: com humano na conversa a IA fica quieta.",
    ],
    solucao: [
      "Em Configurações > IA, confira se a IA está ativa e o horário em Comportamento.",
      "Em Configurações > Integrações > Canais, veja se o canal aparece como Conectado.",
      "Na conversa, devolva o atendimento para a IA.",
    ],
    link: { to: "/settings/ia", rotulo: "Abrir Configurações > IA" },
    palavras: "ia parada muda não atende sem resposta",
  },
  {
    id: "whatsapp-desconectado",
    sintoma: "O WhatsApp desconectou ou as mensagens não chegam",
    causas: ["O celular ficou sem internet ou saiu da sessão (Evolution).", "O token da Meta venceu (API oficial)."],
    solucao: ["Abra Configurações > Integrações > Canais e reconecte. No Evolution, leia o QR code de novo.", "Mensagens que chegaram durante a queda entram quando o provedor reenviar."],
    link: { to: "/settings/integrations?integration=channels", rotulo: "Abrir Canais" },
    palavras: "whatsapp caiu desconectado qr code mensagem não chega",
  },
  {
    id: "ia-inventou",
    sintoma: "A IA respondeu algo errado sobre preço, prazo ou produto",
    causas: ["A informação não está na base de conhecimento, ou está em documento antigo."],
    solucao: [
      "Cadastre o dado como Fato em Configurações > IA > Conhecimento. Fato vale mais que documento.",
      "Use Testar busca para ver o que a IA encontra para aquela pergunta.",
      "Responda as Pendências: são as perguntas que a IA não soube.",
    ],
    link: { to: "/settings/ia?aba=knowledge", rotulo: "Abrir Conhecimento" },
    palavras: "resposta errada inventou alucinação preço",
  },
  {
    id: "email-nao-sai",
    sintoma: "Os e-mails não estão saindo",
    causas: ["Nenhum provedor configurado.", "Domínio do remetente não verificado no Resend.", "Conta do Gmail desconectada."],
    solucao: [
      "Em Configurações > E-mail, clique em Enviar teste para mim e leia a mensagem de erro.",
      "Verifique o domínio do remetente na mesma tela.",
      "Se for Gmail, reconecte no card E-mail em Integrações.",
    ],
    link: { to: "/settings/email", rotulo: "Abrir Configurações > E-mail" },
    palavras: "email não envia resend gmail domínio spam",
  },
  {
    id: "importacao-erros",
    sintoma: "A importação terminou com linhas com erro",
    causas: ["Linha sem nome, e-mail ou telefone.", "E-mail sem arroba ou telefone curto.", "Etapa do CRM antigo sem correspondente no funil."],
    solucao: ["Em Configurações > Importação > Histórico, baixe o relatório de erros.", "Corrija as linhas na planilha e importe só elas. Registros existentes são atualizados, não duplicados."],
    link: { to: "/settings/importacao?secao=historico", rotulo: "Abrir Histórico" },
    palavras: "importação erro linha csv falhou",
  },
  {
    id: "ligacao-nao-sai",
    sintoma: "A ligação pela IA não sai",
    causas: ["Credenciais do Twilio ou ElevenLabs ausentes.", "Número sem ligar ativado ou não conectado ao agente.", "Contato sem telefone válido.", "Conta de teste do Twilio ligando para número não verificado."],
    solucao: ["Abra Voz: a tela mostra o que falta e leva ao lugar certo.", "Em Voz > Números, confira se o número está pronto e com ligar ativado."],
    link: { to: "/voz", rotulo: "Abrir Voz" },
    palavras: "ligação telefone twilio não liga chamada",
  },
  {
    id: "calendario",
    sintoma: "Não consigo conectar meu calendário",
    causas: ["As credenciais do Nylas da empresa ainda não foram cadastradas."],
    solucao: ["Peça a um administrador para cadastrar o Nylas em Integrações.", "Depois clique em Conectar meu calendário em Configurações > Agenda."],
    link: { to: "/settings/agenda", rotulo: "Abrir Configurações > Agenda" },
    palavras: "calendário google outlook agenda conectar nylas",
  },
  {
    id: "template-recusado",
    sintoma: "Template do WhatsApp recusado pela Meta",
    causas: ["Texto promocional numa categoria utilitária.", "Variáveis no começo ou no fim do texto.", "Link encurtado."],
    solucao: ["Ajuste o texto e reenvie em Configurações > Campanhas > Templates."],
    link: { to: "/settings/campaigns", rotulo: "Abrir Campanhas" },
    palavras: "template recusado meta rejeitado",
  },
  {
    id: "nao-vejo-aba",
    sintoma: "Não vejo uma tela ou aba das Configurações",
    causas: ["A tela é de administrador (IA, Integrações, E-mail, API, Formulários, Importação, Primeiros passos)."],
    solucao: ["Peça a um administrador para mudar seu papel em Configurações > Usuários ou fazer a configuração."],
    link: { to: "/settings/team", rotulo: "Abrir Usuários" },
    palavras: "sem permissão não aparece aba escondida admin",
  },
  {
    id: "duplicados",
    sintoma: "Tenho contatos duplicados",
    causas: ["O mesmo cliente chegou por canais diferentes, com dados diferentes (e-mail num, telefone no outro)."],
    solucao: ["Abra a ficha de um deles e use a opção de mesclar. O histórico dos dois fica no que permanecer."],
    link: { to: "/contacts", rotulo: "Abrir Contatos" },
    palavras: "duplicado repetido mesclar merge",
  },
];

export interface Termo {
  termo: string;
  definicao: string;
}

export const GLOSSARIO: Termo[] = [
  { termo: "Contato", definicao: "A pessoa com quem você fala. Tem timeline com conversas, e-mails, ligações, reuniões e negócios." },
  { termo: "Empresa", definicao: "A organização do contato. Agrupa contatos e negócios." },
  { termo: "Negócio", definicao: "Uma oportunidade de venda, com valor e etapa no funil. Um aberto por contato." },
  { termo: "Funil", definicao: "As etapas por onde o negócio passa até ser ganho ou perdido." },
  { termo: "Fato canônico", definicao: "Informação curta e exata (preço, prazo, endereço) que a IA sempre usa do jeito que está escrita." },
  { termo: "Pendência", definicao: "Pergunta que a IA não soube responder. Respondida uma vez, vale para todos." },
  { termo: "Perfil por origem", definicao: "Instruções extras da IA para leads de uma origem específica, como um anúncio." },
  { termo: "O que a IA sabe", definicao: "Memória do lead: o que a IA entendeu nas conversas e ligações. Inferido até a equipe confirmar." },
  { termo: "BANT", definicao: "Qualificação por orçamento, autoridade, necessidade e prazo." },
  { termo: "Cadência", definicao: "Sequência de mensagens enviadas ao longo do tempo." },
  { termo: "Template", definicao: "Mensagem aprovada pela Meta, obrigatória para iniciar conversa pela API oficial." },
  { termo: "UTM", definicao: "Marcação no link do anúncio que diz de onde o lead veio." },
  { termo: "SLA", definicao: "Prazo máximo para responder o cliente." },
  { termo: "NPS", definicao: "Nota de 0 a 10 que o cliente dá ao atendimento." },
  { termo: "Lead scoring", definicao: "Pontuação do contato pelo comportamento, para priorizar quem está mais quente." },
  { termo: "Webhook", definicao: "Aviso automático que o CRM manda para outro sistema (ou recebe dele) quando algo acontece." },
  { termo: "Escopo da chave de API", definicao: "O que uma chave pode ler ou escrever, por recurso." },
];
