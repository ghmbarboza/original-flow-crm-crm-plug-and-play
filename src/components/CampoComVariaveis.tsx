import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { renderVariaveis, type ValoresVariaveis, type VariavelMensagem } from "@/lib/messageVars";

/**
 * Campo de mensagem com as variáveis disponíveis e a prévia do resultado.
 *
 * Existe para que toda tela com `{{variável}}` se comporte igual: o usuário não
 * deve precisar decorar o vocabulário de cada lugar, nem descobrir que escreveu
 * errado quando o cliente recebe "Olá !" — variável desconhecida vira string
 * vazia no envio, em silêncio.
 */
export function CampoComVariaveis({
  id,
  label,
  descricao,
  value,
  onChange,
  variaveis,
  valores,
  placeholder,
  rows = 4,
  testId,
}: {
  id: string;
  label: string;
  descricao?: string;
  value: string;
  onChange: (valor: string) => void;
  variaveis: readonly VariavelMensagem[];
  /** Valores de exemplo (ou reais) para a prévia. */
  valores: ValoresVariaveis;
  placeholder?: string;
  rows?: number;
  testId?: string;
}) {
  const campoRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Insere na posição do cursor, não no fim.
   *
   * Quem escreveu "Olá , tudo bem?" e voltou o cursor para depois do "Olá"
   * espera a variável ali; jogar no fim obrigaria a recortar e colar.
   */
  const inserir = (chave: string) => {
    const campo = campoRef.current;
    const token = `{{${chave}}}`;
    if (!campo) {
      onChange(value + token);
      return;
    }
    const inicio = campo.selectionStart ?? value.length;
    const fim = campo.selectionEnd ?? inicio;
    onChange(value.slice(0, inicio) + token + value.slice(fim));
    requestAnimationFrame(() => {
      campo.focus();
      const pos = inicio + token.length;
      campo.setSelectionRange(pos, pos);
    });
  };

  const previa = renderVariaveis(value, valores);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        ref={campoRef}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
      {descricao && (
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{descricao}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>Inserir:</span>
        {variaveis.map((v) => (
          <Button
            key={v.chave}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs font-normal"
            onClick={() => inserir(v.chave)}
            data-testid={`var-${v.chave}`}
          >
            {v.rotulo}
          </Button>
        ))}
      </div>

      {value.trim() && (
        <div className="space-y-1.5">
          <Label className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            Prévia — como o cliente vai receber
          </Label>
          <div
            className="whitespace-pre-wrap rounded-lg p-3 text-sm"
            style={{ background: "var(--via-surface)", color: "var(--via-text-body)" }}
            data-testid={testId ? `${testId}-previa` : "campo-previa"}
          >
            {previa}
          </div>
        </div>
      )}
    </div>
  );
}
