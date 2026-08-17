import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Eye, EyeOff, Loader2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAIConfig, useUpsertAIConfig } from "@/hooks/useAIConfig";
import { useOrgApiKey, useSaveOrgApiKey } from "@/hooks/useOrgApiKey";
import { useSaveSetupStep } from "@/hooks/useSetup";
import { PularEtapa } from "@/components/setup/PularEtapa";
import { VoicePicker } from "@/components/settings/VoicePicker";
import { ApiKeyTutorialDialog } from "@/components/settings/ApiKeyTutorialDialog";

/**
 * Etapa Voz: a chave do ElevenLabs é da ORGANIZAÇÃO (Vault), e a configuração de
 * voz grava no MESMO registro de `ai_messaging_config` usado por
 * Configurações > IA > Voz da agente — fonte única, não cópia.
 */
export function StepVoz({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { data: config } = useAIConfig();
  const { data: chaveConfigurada } = useOrgApiKey("elevenlabs");
  const upsertConfig = useUpsertAIConfig();
  const salvarChave = useSaveOrgApiKey("elevenlabs");
  const salvarEtapa = useSaveSetupStep();

  const [apiKey, setApiKey] = useState("");
  const [mostrarChave, setMostrarChave] = useState(false);
  const [voiceId, setVoiceId] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [modo, setModo] = useState("reply_to_audio");
  const [salvando, setSalvando] = useState(false);

  // Abre com o que já está no banco (refazer o onboarding não perde nada).
  useEffect(() => {
    if (!config) return;
    setVoiceId(config.voice_id ?? "");
    setVoiceEnabled(config.voice_enabled ?? false);
    setModo(config.voice_response_mode ?? "reply_to_audio");
  }, [config]);

  /**
   * Salva a chave sem sair da etapa e já testa: as vozes só carregam depois que
   * existe chave no Vault, e antes disso a tela dizia "salve sua chave acima"
   * sem oferecer onde salvar — o único caminho era "Continuar", que fecha a
   * etapa justamente antes de mostrar as vozes.
   */
  const salvarChaveAgora = async () => {
    if (!apiKey.trim()) {
      toast.error("Cole a chave do ElevenLabs antes de salvar.");
      return;
    }
    try {
      await salvarChave.mutateAsync(apiKey);
      setApiKey("");
      // A listagem é o teste real da chave: se ela não valer, o VoicePicker
      // mostra o erro devolvido pela API do ElevenLabs.
      await queryClient.invalidateQueries({ queryKey: ["elevenlabs-voices"] });
      toast.success("Chave salva. Carregando as vozes disponíveis…");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a chave.");
    }
  };

  const salvarEAvancar = async () => {
    setSalvando(true);
    try {
      if (apiKey.trim()) {
        await salvarChave.mutateAsync(apiKey);
        setApiKey("");
      }
      await upsertConfig.mutateAsync({
        voice_enabled: voiceEnabled,
        // Coluna nullable: string vazia viraria um voice_id inválido no TTS.
        voice_id: voiceId.trim() || null,
        voice_response_mode: modo,
      });
      await salvarEtapa.mutateAsync({ step: "voz" });
      onNext();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a configuração de voz.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-medium" style={{ color: "var(--via-text-primary)" }}>
          A voz da sua agente
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
          Sua agente pode ouvir os áudios que os clientes mandam no WhatsApp e responder
          com voz natural. Áudios recebidos são sempre transcritos; responder falando é
          opcional e você decide quando.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="voz-api-key">Chave de API do ElevenLabs</Label>
          {chaveConfigurada && (
            <Badge className="bg-success text-success-foreground">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Configurada
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              id="voz-api-key"
              data-testid="setup-voz-api-key"
              type={mostrarChave ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={chaveConfigurada ? "••••••••  (deixe vazio para manter)" : "sk_..."}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setMostrarChave((v) => !v)}
              aria-label={mostrarChave ? "Ocultar a chave" : "Mostrar a chave"}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {mostrarChave ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={salvarChaveAgora}
            disabled={!apiKey.trim() || salvarChave.isPending}
            data-testid="setup-voz-save-key"
          >
            {salvarChave.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />
                Salvando…
              </>
            ) : (
              "Salvar e testar"
            )}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ApiKeyTutorialDialog service="elevenlabs" />
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            A chave é guardada no Vault e vale para toda a sua organização.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Escolha a voz</Label>
        <VoicePicker value={voiceId} onChange={setVoiceId} temChave={!!chaveConfigurada} />
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            <Mic className="h-4 w-4" strokeWidth={1.5} /> Responder em áudio
          </p>
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            Se a geração de voz falhar, a resposta segue em texto — o cliente nunca fica sem retorno.
          </p>
        </div>
        <Switch
          aria-label="Responder em áudio"
          data-testid="setup-voz-enabled"
          checked={voiceEnabled}
          onCheckedChange={setVoiceEnabled}
        />
      </div>

      {voiceEnabled && (
        <div className="space-y-2 sm:max-w-xs">
          <Label id="voz-modo-label">Quando responder em áudio</Label>
          <Select value={modo} onValueChange={setModo}>
            <SelectTrigger aria-labelledby="voz-modo-label" data-testid="setup-voz-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reply_to_audio">Só quando o cliente enviar áudio</SelectItem>
              <SelectItem value="always">Sempre</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <Button variant="outline" onClick={onBack}>Voltar</Button>
        <PularEtapa
          step="voz"
          impacto="Sem voz, a agente atende normalmente por texto. Configure depois em Configurações > IA, seção Voz da agente."
          onPulado={onNext}
          disabled={salvando}
        >
          <Button onClick={salvarEAvancar} disabled={salvando} data-testid="setup-voz-next">
            {salvando ? "Salvando…" : "Continuar"}
          </Button>
        </PularEtapa>
      </div>
    </div>
  );
}
