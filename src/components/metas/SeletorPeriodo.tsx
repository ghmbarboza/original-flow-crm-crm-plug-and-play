import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TIPOS_PERIODO, deslocarPeriodo, periodoQueContem, rotuloPeriodo, type Periodo, type TipoPeriodo,
} from "@/lib/metas";

interface Props {
  valor: Periodo;
  onChange: (p: Periodo) => void;
  /** Tipos oferecidos; a tela de Metas não oferece "semana" na visão geral. */
  tipos?: TipoPeriodo[];
  testIdPrefix: string;
}

/**
 * Escolha de período: tipo (semana, mês, trimestre, semestre, ano ou
 * personalizado) e setas para andar entre períodos; no personalizado, início e fim.
 */
export function SeletorPeriodo({ valor, onChange, tipos, testIdPrefix }: Props) {
  const opcoes = TIPOS_PERIODO.filter((t) => !tipos || tipos.includes(t.value));

  const trocarTipo = (tipo: TipoPeriodo) => {
    if (tipo === "personalizado") onChange({ ...valor, tipo });
    else onChange(periodoQueContem(tipo, valor.inicio));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={valor.tipo} onValueChange={(v) => trocarTipo(v as TipoPeriodo)}>
        <SelectTrigger className="w-36" aria-label="Tipo de período" data-testid={`${testIdPrefix}-tipo`}><SelectValue /></SelectTrigger>
        <SelectContent>
          {opcoes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {valor.tipo === "personalizado" ? (
        <>
          <Input
            type="date" className="w-40" aria-label="Início do período" value={valor.inicio}
            onChange={(e) => {
              const inicio = e.target.value;
              if (inicio) onChange({ ...valor, inicio, fim: valor.fim < inicio ? inicio : valor.fim });
            }}
            data-testid={`${testIdPrefix}-inicio`}
          />
          <span className="text-sm" style={{ color: "var(--via-text-muted)" }}>até</span>
          <Input
            type="date" className="w-40" aria-label="Fim do período" value={valor.fim} min={valor.inicio}
            onChange={(e) => e.target.value && e.target.value >= valor.inicio && onChange({ ...valor, fim: e.target.value })}
            data-testid={`${testIdPrefix}-fim`}
          />
        </>
      ) : (
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="outline" className="h-9 w-9" aria-label="Período anterior" onClick={() => onChange(deslocarPeriodo(valor, -1))}>
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
          <span className="min-w-28 text-center text-sm font-medium tabular-nums" style={{ color: "var(--via-text-primary)" }} data-testid={`${testIdPrefix}-rotulo`}>
            {rotuloPeriodo(valor)}
          </span>
          <Button type="button" size="icon" variant="outline" className="h-9 w-9" aria-label="Próximo período" onClick={() => onChange(deslocarPeriodo(valor, 1))}>
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      )}
    </div>
  );
}
