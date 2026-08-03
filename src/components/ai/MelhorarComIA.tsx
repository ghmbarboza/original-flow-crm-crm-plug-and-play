import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";

/** Abaixo disso não há o que melhorar — a IA teria de inventar o conteúdo. */
export const MIN_CHARS_MELHORAR = 10;

interface Props {
  /** Texto atual do campo. */
  valor: string;
  /** Recebe o texto reescrito (e o original, quando o usuário desfaz). */
  onChange: (texto: string) => void;
  /** O que o campo representa — entra no prompt para orientar a reescrita. */
  contexto: string;
  /** Limite de caracteres do campo. */
  maxChars: number;
  disabled?: boolean;
  "data-testid"?: string;
}

/**
 * Botão "Melhorar com IA" para campos de texto livre.
 *
 * Um componente só para todos os campos: o texto do toast, o desfazer e o
 * tratamento de erro precisam ser idênticos no onboarding e em Configurações,
 * que editam o mesmo registro.
 */
export function MelhorarComIA({
  valor, onChange, contexto, maxChars, disabled, "data-testid": testId,
}: Props) {
  const [carregando, setCarregando] = useState(false);
  const curto = valor.trim().length < MIN_CHARS_MELHORAR;

  const melhorar = async () => {
    const anterior = valor;
    setCarregando(true);
    try {
      const { data, error } = await supabase.functions.invoke("improve-text", {
        body: { text: anterior.trim(), field_context: contexto, max_chars: maxChars },
      });
      if (error) throw await erroDeFunction(error, "Não foi possível melhorar o texto.");
      const melhorado = typeof data?.text === "string" ? data.text.trim() : "";
      if (!melhorado) throw new Error(data?.error ?? "Não foi possível melhorar o texto.");

      onChange(melhorado);
      // Desfazer é obrigatório aqui: o botão sobrescreve o que a pessoa
      // escreveu, e sem volta ela perderia o original.
      toast.success("Texto melhorado.", {
        action: { label: "Desfazer", onClick: () => onChange(anterior) },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível melhorar o texto.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 gap-1 px-2 text-xs"
      onClick={melhorar}
      disabled={disabled || carregando || curto}
      data-testid={testId ?? "melhorar-com-ia"}
      title={curto ? `Escreva ao menos ${MIN_CHARS_MELHORAR} caracteres` : "Reescrever com IA"}
    >
      {carregando ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
      ) : (
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
      )}
      Melhorar com IA
    </Button>
  );
}