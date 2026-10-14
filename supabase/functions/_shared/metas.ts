// Regras puras das metas: período, métricas, filtros e progresso.
//
// Tudo é calculado a partir dos dados reais (negócios, contatos, atividades,
// conversas) dentro do período da própria meta: não existe valor "atual"
// guardado que precise de rotina para atualizar.

export type TipoPeriodo = "semana" | "mes" | "trimestre" | "semestre" | "ano" | "personalizado";

export interface Periodo {
  tipo: TipoPeriodo;
  /** Primeiro dia, AAAA-MM-DD. */
  inicio: string;
  /** Último dia (inclusive), AAAA-MM-DD. */
  fim: string;
}

export const TIPOS_PERIODO: { value: TipoPeriodo; label: string }[] = [
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
  { value: "trimestre", label: "Trimestre" },
  { value: "semestre", label: "Semestre" },
  { value: "ano", label: "Ano" },
  { value: "personalizado", label: "Personalizado" },
];

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (ano: number, mes: number, dia: number) => `${ano}-${pad(mes)}-${pad(dia)}`;
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Lê AAAA-MM-DD sem fuso: o dia é o do calendário, não o de UTC. */
function partes(data: string): [number, number, number] {
  const [a, m, d] = data.split("-").map(Number);
  return [a, m, d];
}

/** Período do tipo pedido que contém a data de referência (AAAA-MM-DD). */
export function periodoQueContem(tipo: Exclude<TipoPeriodo, "personalizado">, referencia: string): Periodo {
  const [ano, mes, dia] = partes(referencia);
  if (tipo === "semana") {
    // Semana de segunda a domingo.
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    const deslocamento = (data.getUTCDay() + 6) % 7;
    const seg = new Date(data.getTime() - deslocamento * 86_400_000);
    const dom = new Date(seg.getTime() + 6 * 86_400_000);
    const d = (x: Date) => iso(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
    return { tipo, inicio: d(seg), fim: d(dom) };
  }
  const meses = { mes: 1, trimestre: 3, semestre: 6, ano: 12 }[tipo];
  const primeiro = Math.floor((mes - 1) / meses) * meses + 1;
  const ultimo = primeiro + meses - 1;
  return { tipo, inicio: iso(ano, primeiro, 1), fim: iso(ano, ultimo, ultimoDia(ano, ultimo)) };
}

/** Período seguinte (ou anterior, com passo -1) do mesmo tipo. */
export function deslocarPeriodo(p: Periodo, passo: 1 | -1): Periodo {
  if (p.tipo === "personalizado") return p;
  const [ano, mes, dia] = partes(passo === 1 ? p.fim : p.inicio);
  const vizinho = new Date(Date.UTC(ano, mes - 1, dia + passo));
  return periodoQueContem(p.tipo, iso(vizinho.getUTCFullYear(), vizinho.getUTCMonth() + 1, vizinho.getUTCDate()));
}

/** Nome curto do período: "out/2026", "3º tri/2026", "06/10 a 12/10/2026". */
export function rotuloPeriodo(p: Periodo): string {
  const [ai, mi, di] = partes(p.inicio);
  const [af, mf, df] = partes(p.fim);
  if (p.tipo === "mes") return `${MESES[mi - 1]}/${ai}`;
  if (p.tipo === "trimestre") return `${Math.ceil(mi / 3)}º tri/${ai}`;
  if (p.tipo === "semestre") return `${mi <= 6 ? 1 : 2}º sem/${ai}`;
  if (p.tipo === "ano") return String(ai);
  const curto = (d: number, m: number) => `${pad(d)}/${pad(m)}`;
  return ai === af ? `${curto(di, mi)} a ${curto(df, mf)}/${af}` : `${curto(di, mi)}/${ai} a ${curto(df, mf)}/${af}`;
}

/** Os dois períodos têm algum dia em comum? */
export function periodosSeCruzam(a: Pick<Periodo, "inicio" | "fim">, b: Pick<Periodo, "inicio" | "fim">): boolean {
  return a.inicio <= b.fim && b.inicio <= a.fim;
}

/** O instante (ISO) cai dentro do período, considerando o horário de Brasília? */
export function dentroDoPeriodo(instante: string | null | undefined, p: Pick<Periodo, "inicio" | "fim">): boolean {
  if (!instante) return false;
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(instante));
  return dia >= p.inicio && dia <= p.fim;
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

export type Metrica =
  | "revenue" | "deals" | "deals_created" | "avg_ticket" | "min_deal_value"
  | "contacts" | "activities" | "conversion_rate" | "lead_to_deal" | "avg_response_time";

export type Unidade = "moeda" | "quantidade" | "percentual" | "horas";

export interface DefinicaoMetrica {
  value: Metrica;
  label: string;
  grupo: "Vendas" | "Leads e atividades" | "Conversão" | "Atendimento";
  unidade: Unidade;
  descricao: string;
  /** Ficar abaixo da meta é bater a meta (tempo de resposta). */
  menorEMelhor?: boolean;
}

export const METRICAS: DefinicaoMetrica[] = [
  { value: "revenue", label: "Receita ganha", grupo: "Vendas", unidade: "moeda", descricao: "Soma do valor dos negócios ganhos no período." },
  { value: "deals", label: "Negócios ganhos", grupo: "Vendas", unidade: "quantidade", descricao: "Quantidade de negócios ganhos no período." },
  { value: "deals_created", label: "Negócios criados", grupo: "Vendas", unidade: "quantidade", descricao: "Negócios abertos no período, ganhos ou não." },
  { value: "avg_ticket", label: "Ticket médio", grupo: "Vendas", unidade: "moeda", descricao: "Valor médio dos negócios ganhos no período." },
  { value: "min_deal_value", label: "Negócios ganhos acima de um valor", grupo: "Vendas", unidade: "quantidade", descricao: "Ganhos no período com valor igual ou maior que o mínimo." },
  { value: "contacts", label: "Novos leads", grupo: "Leads e atividades", unidade: "quantidade", descricao: "Contatos criados no período." },
  { value: "activities", label: "Atividades realizadas", grupo: "Leads e atividades", unidade: "quantidade", descricao: "Ligações, reuniões, e-mails e tarefas registrados no período (os tipos são configuráveis)." },
  { value: "conversion_rate", label: "Taxa de ganho", grupo: "Conversão", unidade: "percentual", descricao: "Ganhos ÷ (ganhos + perdidos), entre os negócios fechados no período." },
  { value: "lead_to_deal", label: "Conversão de lead em negócio", grupo: "Conversão", unidade: "percentual", descricao: "Dos leads criados no período, quantos já viraram negócio (até hoje)." },
  { value: "avg_response_time", label: "Tempo médio de 1ª resposta", grupo: "Atendimento", unidade: "horas", descricao: "Média do tempo até a primeira resposta nas conversas do período. Ficar abaixo é bater a meta.", menorEMelhor: true },
];

export const definicaoDaMetrica = (m: string): DefinicaoMetrica | undefined => METRICAS.find((d) => d.value === m);

/** Tipos de atividade que contam como "realizadas" (as de histórico automático ficam de fora). */
export const TIPOS_ATIVIDADE = [
  { value: "call", label: "Ligações" },
  { value: "meeting", label: "Reuniões" },
  { value: "email", label: "E-mails" },
  { value: "task", label: "Tarefas" },
  { value: "note", label: "Anotações" },
] as const;
const TIPOS_ATIVIDADE_PADRAO = ["call", "meeting", "email", "task"];

export interface FiltrosMeta {
  /** Só negócios deste funil. */
  pipeline_id?: string | null;
  /** Só contatos (e negócios de contatos) com esta origem. */
  origem?: string | null;
  /** Só estes tipos de atividade. */
  tipos_atividade?: string[];
  /** Valor mínimo do negócio, para "Negócios ganhos acima de um valor". */
  valor_minimo?: number | null;
}

export interface MetaParaCalculo {
  metrica: Metrica;
  /** null = time inteiro. */
  responsavel: string | null;
  periodo: Pick<Periodo, "inicio" | "fim">;
  filtros: FiltrosMeta;
}

export interface DadosMetas {
  negocios: {
    id: string; value: number | null; owner_id: string | null; status: string; contact_id: string | null;
    created_at: string; closed_at: string | null; pipeline_id: string | null; origem: string | null;
  }[];
  contatos: { id: string; owner_id: string | null; created_at: string; source: string | null }[];
  atividades: { user_id: string | null; type: string; created_at: string }[];
  conversas: { assigned_to: string | null; first_response_minutes: number | null; created_at: string }[];
}

// Taxa sem base (nenhum fechado, nenhum lead) é "sem dados", não 0%.
const pct = (parte: number, total: number): number | null => (total > 0 ? Math.round((parte / total) * 1000) / 10 : null);

/**
 * Valor realizado da meta no período dela, já com responsável e filtros
 * aplicados. null = sem dados para medir (taxa sem base, tempo de resposta sem
 * conversa): não é zero, e não pode contar como meta batida.
 */
export function realizado(meta: MetaParaCalculo, dados: DadosMetas): number | null {
  const { responsavel, periodo, filtros } = meta;
  const doResponsavel = (dono: string | null) => !responsavel || dono === responsavel;
  const daOrigem = (origem: string | null) => !filtros.origem || origem === filtros.origem;

  const negocios = dados.negocios.filter((n) =>
    doResponsavel(n.owner_id) && daOrigem(n.origem) && (!filtros.pipeline_id || n.pipeline_id === filtros.pipeline_id));
  const fechadosNoPeriodo = (status: string) =>
    negocios.filter((n) => n.status === status && dentroDoPeriodo(n.closed_at, periodo));
  const ganhos = () => fechadosNoPeriodo("won");
  const soma = (lista: { value: number | null }[]) => lista.reduce((t, n) => t + Number(n.value ?? 0), 0);

  switch (meta.metrica) {
    case "revenue": return soma(ganhos());
    case "deals": return ganhos().length;
    case "deals_created": return negocios.filter((n) => dentroDoPeriodo(n.created_at, periodo)).length;
    case "avg_ticket": {
      const g = ganhos();
      return g.length > 0 ? Math.round((soma(g) / g.length) * 100) / 100 : null;
    }
    case "min_deal_value": {
      const minimo = Number(filtros.valor_minimo ?? 0);
      return ganhos().filter((n) => Number(n.value ?? 0) >= minimo).length;
    }
    case "contacts":
      return dados.contatos.filter((c) => doResponsavel(c.owner_id) && daOrigem(c.source) && dentroDoPeriodo(c.created_at, periodo)).length;
    case "activities": {
      const tipos = filtros.tipos_atividade?.length ? filtros.tipos_atividade : TIPOS_ATIVIDADE_PADRAO;
      return dados.atividades.filter((a) => doResponsavel(a.user_id) && tipos.includes(a.type) && dentroDoPeriodo(a.created_at, periodo)).length;
    }
    case "conversion_rate": {
      const g = ganhos().length;
      return pct(g, g + fechadosNoPeriodo("lost").length);
    }
    case "lead_to_deal": {
      const leads = dados.contatos.filter((c) => doResponsavel(c.owner_id) && daOrigem(c.source) && dentroDoPeriodo(c.created_at, periodo));
      const comNegocio = new Set(
        dados.negocios.filter((n) => !filtros.pipeline_id || n.pipeline_id === filtros.pipeline_id).map((n) => n.contact_id),
      );
      return pct(leads.filter((c) => comNegocio.has(c.id)).length, leads.length);
    }
    case "avg_response_time": {
      const tempos = dados.conversas
        .filter((c) => doResponsavel(c.assigned_to) && c.first_response_minutes !== null && dentroDoPeriodo(c.created_at, periodo))
        .map((c) => Number(c.first_response_minutes));
      if (tempos.length === 0) return null;
      // Duas casas: arredondar para 0,1h deixaria 2,04h "bater" uma meta de 2h.
      return Math.round((tempos.reduce((t, v) => t + v, 0) / tempos.length / 60) * 100) / 100;
    }
  }
}

export interface Progresso {
  /** 0 a 100, para a barra. */
  percentual: number;
  atingiu: boolean;
  semDados: boolean;
}

// Só mostra 100% quando bateu: 99,6% arredondado viraria "100%" sem ter batido.
const parcial = (fracao: number) => Math.min(99, Math.max(0, Math.round(fracao * 100)));

/** Quanto da meta foi cumprido. Em "menor é melhor", estar abaixo do alvo é 100%. */
export function progresso(metrica: Metrica, alvo: number, valor: number | null): Progresso {
  if (valor === null) return { percentual: 0, atingiu: false, semDados: true };
  if (definicaoDaMetrica(metrica)?.menorEMelhor) {
    if (valor <= alvo) return { percentual: 100, atingiu: true, semDados: false };
    return { percentual: parcial(alvo / valor), atingiu: false, semDados: false };
  }
  if (alvo <= 0) return { percentual: 0, atingiu: false, semDados: false };
  if (valor >= alvo) return { percentual: 100, atingiu: true, semDados: false };
  return { percentual: parcial(valor / alvo), atingiu: false, semDados: false };
}
