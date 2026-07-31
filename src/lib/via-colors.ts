/**
 * Viver de IA — Paleta de cores canônica.
 *
 * Único arquivo de `src/` onde hex literais são permitidos.
 *
 * A UI resolve cor por token CSS (`index.css` + namespace `via` do Tailwind).
 * Importe daqui apenas onde um hex é inevitável e um token CSS não funciona:
 * Recharts, canvas, geração de PDF/CSV e `style` inline de badges de status.
 * Os valores abaixo espelham os tokens de `src/index.css` — ao mudar um, mude o outro.
 *
 * Nunca use roxo, cyan, amarelo, dourado, magenta ou neon.
 */

export const VIA = {
  navy: '#0A1F3B',
  navyDeep: '#02162A',
  navyDarker: '#010B1A',
  blue: '#1E3A5F',
  blueSoft: '#2A4A6E',
  white: '#FFFFFF',
  gray50: '#F7F8FA',
  gray100: '#F0F2F5',
  gray200: '#E4E7EC',
  gray300: '#D0D5DD',
  gray400: '#98A2B3',
  gray500: '#667085',
  gray600: '#475467',
  gray700: '#344054',
  gray800: '#1D2939',
  gray900: '#101828',
  black: '#000000',
  // Sincronizado com --via-success do index.css (contraste AA com branco).
  success: '#187A4F',
  danger: '#B83A3A',
  // Sincronizado com --via-coral do index.css (contraste AA com branco).
  coral: '#A64B4B',
} as const;

/** Cores oferecidas ao usuário para etapas de pipeline e tags. Nunca usar `input[type=color]` livre. */
export const VIA_STAGE_COLORS = [
  { label: 'Navy', value: VIA.navy, text: VIA.white },
  { label: 'Azul', value: VIA.blue, text: VIA.white },
  { label: 'Azul suave', value: VIA.blueSoft, text: VIA.white },
  { label: 'Cinza', value: VIA.gray500, text: VIA.white },
  { label: 'Cinza claro', value: VIA.gray300, text: VIA.gray800 },
  { label: 'Sucesso', value: VIA.success, text: VIA.white },
  { label: 'Coral', value: VIA.coral, text: VIA.white },
] as const;

export const VIA_CHART_COLORS = [
  VIA.navy,
  VIA.blue,
  VIA.blueSoft,
  VIA.gray500,
  VIA.gray300,
  VIA.success,
] as const;

export const VIA_CONVERSATION_STATUS = {
  ai_active: { bg: VIA.navy, text: VIA.white, label: 'IA ativa' },
  human_takeover: { bg: VIA.blue, text: VIA.white, label: 'Em atendimento humano' },
  closed: { bg: VIA.gray300, text: VIA.gray700, label: 'Encerrada' },
} as const;

export const VIA_DEAL_STATUS = {
  open: { bg: VIA.navy, text: VIA.white, label: 'Em aberto' },
  won: { bg: VIA.success, text: VIA.white, label: 'Ganho' },
  lost: { bg: VIA.coral, text: VIA.white, label: 'Perdido' },
} as const;

export const VIA_CAMPAIGN_STATUS = {
  draft: { bg: VIA.gray200, text: VIA.gray700, label: 'Rascunho' },
  sending: { bg: VIA.blue, text: VIA.white, label: 'Enviando' },
  paused: { bg: VIA.gray400, text: VIA.white, label: 'Pausada' },
  completed: { bg: VIA.success, text: VIA.white, label: 'Concluída' },
  cancelled: { bg: VIA.coral, text: VIA.white, label: 'Cancelada' },
} as const;

export const VIA_ROLE_COLORS = {
  admin: { bg: VIA.navy, text: VIA.white, label: 'Admin' },
  member: { bg: VIA.gray200, text: VIA.gray700, label: 'Membro' },
  diretor: { bg: VIA.blue, text: VIA.white, label: 'Diretor' },
  gerente: { bg: VIA.blueSoft, text: VIA.white, label: 'Gerente' },
  agente: { bg: VIA.gray300, text: VIA.gray800, label: 'Agente' },
} as const;
