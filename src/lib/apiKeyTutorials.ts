// Catálogo de serviços cujas chaves podem ser guardadas no Vault, com o
// tutorial escrito em pt-BR exibido dentro do produto.
//
// É de propósito um mapa estático: editar copy aqui não exige tocar em
// componente nenhum. `passos` é curto (4-6 itens) e sempre termina em "cole a
// chave aqui" + aviso de cobrança do serviço.

export interface ApiKeyTutorial {
  /** Nome exibido ao usuário. */
  label: string;
  /** Documentação oficial, usada como complemento no rodapé do dialog. */
  url: string;
  /** Passo a passo numerado. */
  passos: string[];
  /** Aviso de custo/créditos do serviço. */
  aviso?: string;
}

export const API_KEY_TUTORIALS: Record<string, ApiKeyTutorial> = {
  google_client_id: {
    label: "Google (Gmail)",
    url: "https://console.cloud.google.com/apis/credentials",
    passos: [
      "Acesse console.cloud.google.com e crie um projeto (ou use um existente).",
      "Em \"APIs e serviços\" → \"Biblioteca\", procure Gmail API e clique em Ativar.",
      "Vá em \"Tela de permissão OAuth\": escolha Externo, preencha nome do app e e-mail de suporte, e adicione seu e-mail em \"Usuários de teste\".",
      "Em \"Credenciais\" → \"Criar credenciais\" → \"ID do cliente OAuth\", tipo Aplicativo da Web.",
      "Em \"URIs de redirecionamento autorizados\", cole exatamente o endereço mostrado abaixo do campo.",
      "Copie o Client ID e o Client Secret gerados e cole nos campos abaixo.",
    ],
    aviso: "Enquanto a tela de permissão estiver como \"Teste\", só os e-mails cadastrados em Usuários de teste conseguem conectar.",
  },
  openai: {
    label: "OpenAI",
    url: "https://platform.openai.com/docs/api-reference/authentication",
    passos: [
      "Crie ou acesse sua conta em platform.openai.com.",
      "No menu do canto superior direito, abra \"API keys\".",
      "Clique em \"Create new secret key\" e dê um nome (ex.: ViaFlow CRM).",
      "Copie a chave (ela começa com sk- e só aparece uma vez).",
      "Cole a chave no campo abaixo e salve.",
    ],
    aviso: "A OpenAI cobra por uso: é preciso ter crédito ou cartão em Billing.",
  },
  anthropic: {
    label: "Anthropic",
    url: "https://docs.anthropic.com/en/api/getting-started",
    passos: [
      "Acesse console.anthropic.com e faça login.",
      "Vá em Settings → API keys.",
      "Clique em \"Create key\" e nomeie a chave.",
      "Copie a chave gerada (começa com sk-ant-).",
      "Cole a chave no campo abaixo e salve.",
    ],
    aviso: "É necessário crédito pré-pago na aba Billing do console.",
  },
  google: {
    label: "Google AI (Gemini)",
    url: "https://ai.google.dev/gemini-api/docs/api-key",
    passos: [
      "Acesse aistudio.google.com com sua conta Google.",
      "No menu lateral, clique em \"Get API key\".",
      "Escolha \"Create API key\" e selecione um projeto do Google Cloud.",
      "Copie a chave exibida.",
      "Cole a chave no campo abaixo e salve.",
    ],
    aviso: "Existe um plano gratuito com limites; acima deles o uso é cobrado.",
  },
  gemini: {
    label: "Google Gemini",
    url: "https://ai.google.dev/gemini-api/docs/api-key",
    passos: [
      "Acesse aistudio.google.com com sua conta Google.",
      "Clique em \"Get API key\" no menu lateral.",
      "Crie a chave em \"Create API key\".",
      "Copie a chave e cole no campo abaixo.",
    ],
    aviso: "Plano gratuito com limites de requisições por minuto.",
  },
  elevenlabs: {
    label: "ElevenLabs",
    url: "https://elevenlabs.io/docs/api-reference/authentication",
    passos: [
      "Crie sua conta em elevenlabs.io e faça login.",
      "Clique no seu avatar (canto inferior esquerdo) e escolha \"API keys\".",
      "Clique em \"Create API key\", nomeie (ex.: ViaFlow) e confirme.",
      "Copie a chave (começa com sk_ e só aparece nesse momento).",
      "Cole a chave no campo abaixo e salve.",
      "Para escolher a voz, vá em Voices → a voz desejada → copie o Voice ID.",
    ],
    aviso: "Transcrição e voz consomem créditos do seu plano ElevenLabs.",
  },
  perplexity: {
    label: "Perplexity",
    url: "https://docs.perplexity.ai/guides/getting-started",
    passos: [
      "Acesse perplexity.ai/settings/api logado na sua conta.",
      "Adicione um método de pagamento (a API é paga desde o início).",
      "Clique em \"Generate\" para criar a chave.",
      "Copie a chave (começa com pplx-) e cole no campo abaixo.",
    ],
    aviso: "A API da Perplexity exige cartão cadastrado antes do primeiro uso.",
  },
  groq: {
    label: "Groq",
    url: "https://console.groq.com/docs/quickstart",
    passos: [
      "Acesse console.groq.com e faça login.",
      "No menu lateral, abra \"API Keys\".",
      "Clique em \"Create API Key\" e dê um nome.",
      "Copie a chave (gsk_...) e cole no campo abaixo.",
    ],
    aviso: "Há uma camada gratuita com limites por minuto.",
  },
  mistral: {
    label: "Mistral",
    url: "https://docs.mistral.ai/getting-started/quickstart/",
    passos: [
      "Acesse console.mistral.ai e faça login.",
      "Vá em API Keys no menu lateral.",
      "Clique em \"Create new key\".",
      "Copie a chave e cole no campo abaixo.",
    ],
    aviso: "Alguns modelos exigem plano pago ativado em Billing.",
  },
  cohere: {
    label: "Cohere",
    url: "https://docs.cohere.com/docs/the-cohere-platform",
    passos: [
      "Acesse dashboard.cohere.com e faça login.",
      "Abra \"API Keys\" no menu lateral.",
      "Use a Trial key para testes ou crie uma Production key.",
      "Copie a chave e cole no campo abaixo.",
    ],
    aviso: "A Trial key tem limite baixo de requisições; produção é cobrada.",
  },
  stripe: {
    label: "Stripe",
    url: "https://docs.stripe.com/keys",
    passos: [
      "Acesse dashboard.stripe.com e faça login.",
      "Vá em Developers → API keys.",
      "Em \"Secret key\", clique em \"Reveal\" (ou crie uma restricted key).",
      "Copie a chave (sk_live_ ou sk_test_) e cole no campo abaixo.",
    ],
    aviso: "Use a chave de teste (sk_test_) enquanto estiver validando o fluxo.",
  },
  resend: {
    label: "Resend",
    url: "https://resend.com/docs/dashboard/api-keys/introduction",
    passos: [
      "Acesse resend.com e faça login.",
      "No menu lateral, abra \"API Keys\".",
      "Clique em \"Create API Key\", nomeie e escolha a permissão de envio.",
      "Copie a chave (re_...) e cole no campo abaixo.",
    ],
    aviso: "Para enviar de um domínio próprio, verifique o domínio antes.",
  },
  sendgrid: {
    label: "SendGrid",
    url: "https://www.twilio.com/docs/sendgrid/ui/account-and-settings/api-keys",
    passos: [
      "Acesse app.sendgrid.com e faça login.",
      "Vá em Settings → API Keys.",
      "Clique em \"Create API Key\" e escolha \"Full Access\" ou \"Restricted\".",
      "Copie a chave (SG....) e cole no campo abaixo.",
    ],
    aviso: "O remetente precisa estar verificado em Sender Authentication.",
  },
  twilio: {
    label: "Twilio",
    url: "https://www.twilio.com/docs/iam/api-keys",
    passos: [
      "Acesse console.twilio.com e faça login.",
      "Vá em Account → API keys & tokens.",
      "Clique em \"Create API key\", escolha a região e o tipo Standard.",
      "Copie o SID e o Secret — o Secret só aparece uma vez.",
      "Cole o Secret no campo abaixo e salve.",
    ],
    aviso: "Contas trial só enviam para números verificados.",
  },
  pipedrive: {
    label: "Pipedrive",
    url: "https://pipedrive.readme.io/docs/how-to-find-the-api-token",
    passos: [
      "Faça login no Pipedrive com o usuário que terá a integração.",
      "Clique no avatar → \"Configurações pessoais\".",
      "Abra a aba \"API\".",
      "Copie o token pessoal e cole no campo abaixo.",
    ],
    aviso: "O token herda as permissões do usuário que o gerou.",
  },
  hubspot: {
    label: "HubSpot",
    url: "https://developers.hubspot.com/docs/api/private-apps",
    passos: [
      "No HubSpot, vá em Configurações → Integrações → Apps privados.",
      "Clique em \"Criar app privado\" e nomeie o app.",
      "Na aba Escopos, marque as permissões necessárias (contatos, negócios).",
      "Crie o app e copie o token de acesso.",
      "Cole o token no campo abaixo e salve.",
    ],
    aviso: "Apps privados exigem conta com permissão de super admin.",
  },
};

/** Fallback honesto para serviço fora do catálogo. */
export const TUTORIAL_GENERICO: string[] = [
  "Faça login no painel do serviço.",
  "Procure por \"API keys\", \"Developers\" ou \"Integrações\" nas configurações da conta.",
  "Crie uma nova chave e dê um nome que identifique o ViaFlow.",
  "Copie a chave gerada (normalmente ela só é exibida uma vez).",
  "Cole a chave no campo abaixo e salve.",
];

/** Resolve o tutorial pelo nome digitado, aceitando correspondência parcial. */
export function tutorialDoServico(name: string): ApiKeyTutorial | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  if (API_KEY_TUTORIALS[key]) return API_KEY_TUTORIALS[key];
  const parcial = Object.keys(API_KEY_TUTORIALS).find((k) => key.includes(k));
  if (parcial) return API_KEY_TUTORIALS[parcial];
  return {
    label: name,
    url: `https://www.google.com/search?q=${encodeURIComponent(`${name} API key documentation`)}`,
    passos: TUTORIAL_GENERICO,
  };
}
