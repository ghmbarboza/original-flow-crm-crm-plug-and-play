import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ErroVozes, useElevenLabsVoices } from "@/hooks/useElevenLabsVoices";

type Props = {
  /** voice_id atualmente gravado em `ai_messaging_config` (ou "" para nenhum). */
  value: string;
  onChange: (voiceId: string) => void;
  /** Só busca as vozes quando a tela sabe que existe chave salva. */
  temChave?: boolean;
};

/**
 * Seletor de vozes do ElevenLabs com prévia de áudio.
 *
 * O usuário escolhe pelo nome e pelas características da voz; o `voice_id` é
 * detalhe de implementação e continua sendo o que se grava no banco. O campo
 * manual segue disponível para quem tem voz clonada e sabe o ID.
 */
export function VoicePicker({ value, onChange, temChave = true }: Props) {
  const { data: vozes, isLoading, error, refetch, isFetching } = useElevenLabsVoices(temChave);
  const [tocando, setTocando] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Nunca deixar um preview tocando depois que a tela sai do ar.
  useEffect(() => () => audioRef.current?.pause(), []);

  const alternarPreview = (voiceId: string, url: string | null) => {
    if (!url) return;
    if (tocando === voiceId) {
      audioRef.current?.pause();
      setTocando(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setTocando(null);
    audio.onerror = () => setTocando(null);
    void audio.play().catch(() => setTocando(null));
    setTocando(voiceId);
  };

  const selecionada = vozes?.find((v) => v.voice_id === value);
  const semChave = !temChave || (error instanceof ErroVozes && error.code === "missing_key");

  const campoManual = (
    <div className="space-y-2">
      {manual ? (
        <div className="space-y-2 sm:max-w-xs">
          <Label htmlFor="voice-id-manual" className="text-xs">
            ID da voz (voz clonada ou avançada)
          </Label>
          <Input
            id="voice-id-manual"
            data-testid="voice-id-manual"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="EXAVITQu4vr4xnSDxMaL"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setManual(true)}
          className="text-xs underline underline-offset-2"
          style={{ color: "var(--via-text-muted)" }}
        >
          Inserir ID manualmente
        </button>
      )}
    </div>
  );

  if (semChave) {
    return (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          Salve sua chave do ElevenLabs acima para ver as vozes disponíveis.
        </p>
        {campoManual}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="voice-picker-loading">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Não foi possível listar as vozes."}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Tentar de novo
        </Button>
        {campoManual}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="voice-picker">
      <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
        {selecionada
          ? `Voz selecionada: ${selecionada.name}`
          : value
            ? `Voz selecionada: ${value}`
            : "Nenhuma voz selecionada — ouça as prévias e escolha uma."}
      </p>

      <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {(vozes ?? []).map((voz) => {
          const ativa = voz.voice_id === value;
          const emPlay = tocando === voz.voice_id;
          return (
            <li key={voz.voice_id}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                  ativa ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={!voz.preview_url}
                  aria-label={emPlay ? `Pausar prévia de ${voz.name}` : `Ouvir prévia de ${voz.name}`}
                  onClick={() => alternarPreview(voz.voice_id, voz.preview_url)}
                >
                  {emPlay ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>

                <button
                  type="button"
                  onClick={() => onChange(voz.voice_id)}
                  aria-pressed={ativa}
                  className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
                >
                  <span className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                    {voz.name}
                  </span>
                  {voz.labels.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {voz.labels.map((l) => (
                        <Badge key={l} variant="secondary" className="text-[10px] font-normal">
                          {l}
                        </Badge>
                      ))}
                    </span>
                  )}
                </button>

                {ativa && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
              </div>
            </li>
          );
        })}
        {(vozes ?? []).length === 0 && (
          <li className="text-sm" style={{ color: "var(--via-text-muted)" }}>
            Nenhuma voz encontrada nessa conta do ElevenLabs.
          </li>
        )}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          {isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
          Atualizar lista
        </Button>
        {campoManual}
      </div>
    </div>
  );
}
