import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LinkBiblioteca } from "@/components/library/LinkBiblioteca";
import { Bot, Clock, MessageSquare, ShoppingCart, Sliders, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KnowledgePanel } from "@/components/settings/ai/KnowledgePanel";
import { PromptVersionsPanel } from "@/components/settings/ai/PromptVersionsPanel";
import { useActiveProducts } from "@/hooks/useProducts";
import { useStages } from "@/hooks/useDeals";
import {
  WEEK_DAYS, useAIConfig, useDeleteFAQ, useDeleteObjection, useFAQs, useImportFAQs,
  useImportObjections, useObjections, useSaveFAQ, useSaveObjection, useUpsertAIConfig,
  type HumanTriggerRules, type PurchaseIntentRules, type WorkingHours,
} from "@/hooks/useAIConfig";
import { useGenerateSystemPrompt } from "@/hooks/useGenerateSystemPrompt";
import { BRAND_TONES, useOrganization, useUpdateOrganization } from "@/hooks/useSetup";
import { formatCurrency } from "@/lib/format";

function defaultWorkingHours(): WorkingHours {
  const hours: WorkingHours = {};
  for (const day of WEEK_DAYS) {
    const weekend = day.key === "sat" || day.key === "sun";
    hours[day.key] = { enabled: !weekend, start: "09:00", end: "18:00" };
  }
  return hours;
}

export default function AISettings() {
  const { data: config, isLoading } = useAIConfig();
  const upsert = useUpsertAIConfig();
  const gerar = useGenerateSystemPrompt();
  const [regenerando, setRegenerando] = useState(false);

  // Contexto da marca: MESMOS registros de organizations que o onboarding
  // (etapa Público) grava — fonte única, não cópia. Salvos junto com o botão
  // principal desta tela.
  const { data: org } = useOrganization();
  const salvarOrg = useUpdateOrganization();
  const [marca, setMarca] = useState({
    brand_tone: "profissional",
    ai_prohibitions: "",
    good_response_example: "",
  });

  useEffect(() => {
    if (!org) return;
    setMarca({
      brand_tone: org.brand_tone ?? "profissional",
      ai_prohibitions: org.ai_prohibitions ?? "",
      good_response_example: org.good_response_example ?? "",
    });
  }, [org]);

  /**
   * Regenera o prompt a partir do contexto atual da organização.
   *
   * Só substitui o campo em tela — quem grava é o Salvar, que já versiona. Assim
   * o usuário compara antes de assumir, e desistir é fechar sem salvar.
   */
  const regenerarPrompt = async () => {
    if (form.system_prompt.trim() && !window.confirm(
      "Isso substitui o prompt atual pelo gerado a partir do contexto da empresa. O prompt em tela será perdido se você não salvar. Continuar?",
    )) return;
    setRegenerando(true);
    try {
      const r = await gerar.mutateAsync(form.agent_name || undefined);
      setForm((f) => ({ ...f, system_prompt: r.system_prompt }));
      toast.success("Prompt regenerado. Revise e salve para criar a nova versão.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível regenerar o prompt.");
    } finally {
      setRegenerando(false);
    }
  };

  const { data: faqs, isLoading: loadingFaqs } = useFAQs();
  const { data: objections, isLoading: loadingObjections } = useObjections();
  const { data: products } = useActiveProducts();
  const saveFAQ = useSaveFAQ();
  const deleteFAQ = useDeleteFAQ();
  const importFAQs = useImportFAQs();
  const saveObjection = useSaveObjection();
  const deleteObjection = useDeleteObjection();
  const importObjections = useImportObjections();

  const [form, setForm] = useState({
    is_active: true,
    agent_name: "",
    agent_tone: "",
    agent_objective: "",
    system_prompt: "",
    fallback_message: "",
    context_window_size: 20,
    response_delay_ms: 0,
    cooldown_ms: 3000,
    max_ai_turns_before_human: 0,
    voice_enabled: false,
    voice_id: "",
    voice_response_mode: "reply_to_audio",
  });
  const [workingHours, setWorkingHours] = useState<WorkingHours>(defaultWorkingHours());
  const [triggers, setTriggers] = useState<HumanTriggerRules>({ keywords: [], negative_sentiment: false });
  const [keywordsText, setKeywordsText] = useState("");
  const [intent, setIntent] = useState<PurchaseIntentRules>({
    keywords: [],
    notify: true,
    move_to_stage_id: null,
    take_over: false,
  });
  const [intentKeywordsText, setIntentKeywordsText] = useState("");
  const { data: stages } = useStages();

  useEffect(() => {
    if (!config) return;
    setForm({
      is_active: config.is_active,
      agent_name: config.agent_name ?? "",
      agent_tone: config.agent_tone ?? "",
      agent_objective: config.agent_objective ?? "",
      system_prompt: config.system_prompt ?? "",
      fallback_message: config.fallback_message ?? "",
      context_window_size: config.context_window_size ?? 20,
      response_delay_ms: config.response_delay_ms ?? 0,
      cooldown_ms: config.cooldown_ms ?? 3000,
      max_ai_turns_before_human: config.max_ai_turns_before_human ?? 0,
      voice_enabled: config.voice_enabled ?? false,
      voice_id: config.voice_id ?? "",
      voice_response_mode: config.voice_response_mode ?? "reply_to_audio",
    });
    const wh = (config.working_hours ?? {}) as unknown as Partial<WorkingHours>;
    setWorkingHours(Object.keys(wh).length ? { ...defaultWorkingHours(), ...wh } : defaultWorkingHours());
    const tr = (config.human_trigger_rules ?? {}) as unknown as Partial<HumanTriggerRules>;
    setTriggers({ keywords: tr.keywords ?? [], negative_sentiment: tr.negative_sentiment ?? false });
    setKeywordsText((tr.keywords ?? []).join(", "));
    const pi = tr.purchase_intent;
    setIntent({
      keywords: pi?.keywords ?? [],
      notify: pi?.notify ?? true,
      move_to_stage_id: pi?.move_to_stage_id ?? null,
      take_over: pi?.take_over ?? false,
    });
    setIntentKeywordsText((pi?.keywords ?? []).join(", "));
  }, [config]);

  const save = async () => {
    const keywords = keywordsText.split(",").map((k) => k.trim()).filter(Boolean);
    const intentKeywords = intentKeywordsText.split(",").map((k) => k.trim()).filter(Boolean);
    try {
      await upsert.mutateAsync({
        ...form,
        // Coluna nullable: string vazia viraria um voice_id inválido no TTS.
        voice_id: form.voice_id.trim() || null,
        working_hours: workingHours as never,
        human_trigger_rules: {
          ...triggers,
          keywords,
          purchase_intent: { ...intent, keywords: intentKeywords },
        } as never,
      });
      await salvarOrg.mutateAsync({
        brand_tone: marca.brand_tone,
        ai_prohibitions: marca.ai_prohibitions.trim() || null,
        good_response_example: marca.good_response_example.trim() || null,
      });
      toast.success("Configuração da IA salva.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="via-card flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <Bot className="h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Atendimento por IA</p>
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              Quando ativo, a IA responde novas conversas de WhatsApp automaticamente.
            </p>
          </div>
        </div>
        <Switch
          aria-label="Ativar o atendimento automático por IA"
          checked={form.is_active}
          onCheckedChange={(v) => setForm({ ...form, is_active: v })}
        />
      </div>

      <Tabs defaultValue="personality">
        <TabsList>
          <TabsTrigger value="personality">Personalidade</TabsTrigger>
          <TabsTrigger value="behavior">Comportamento</TabsTrigger>
          <TabsTrigger value="knowledge">Conhecimento</TabsTrigger>
          <TabsTrigger value="versions">Versões</TabsTrigger>
        </TabsList>

        {/* Personalidade */}
        <TabsContent value="personality" className="space-y-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agent_name">Nome do agente</Label>
              <Input id="agent_name" value={form.agent_name} onChange={(e) => setForm({ ...form, agent_name: e.target.value })} placeholder="Sofia" />
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Este nome aparece nas mensagens enviadas pela IA. Use o que faz sentido para sua marca.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent_tone">Tom</Label>
              <Input id="agent_tone" value={form.agent_tone} onChange={(e) => setForm({ ...form, agent_tone: e.target.value })} placeholder="Cordial e objetivo" />
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Define a personalidade da IA: afeta vocabulário, formalidade e a forma de perguntar.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent_objective">Objetivo</Label>
            <Input id="agent_objective" value={form.agent_objective} onChange={(e) => setForm({ ...form, agent_objective: e.target.value })} placeholder="Qualificar leads e agendar demonstrações" />
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Em uma frase: o que a IA deve conquistar na conversa?</p>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="system_prompt">Instruções (prompt do sistema)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                data-testid="ai-regenerate-prompt"
                disabled={regenerando}
                onClick={regenerarPrompt}
              >
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
                {regenerando ? "Gerando…" : "Regenerar do contexto"}
              </Button>
            </div>
            <Textarea id="system_prompt" rows={6} value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} placeholder="Descreva como a IA deve se comportar, o que pode e o que não pode fazer…" />
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              O conjunto completo de instruções da IA. Gerado no setup inicial, mas editável a
              qualquer momento. Ao salvar com um prompt diferente, uma nova versão é registrada
              na aba Versões.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fallback_message">Mensagem de fallback</Label>
            <Input id="fallback_message" value={form.fallback_message} onChange={(e) => setForm({ ...form, fallback_message: e.target.value })} placeholder="Vou chamar um atendente para te ajudar melhor." />
          </div>

          <Separator />

          {/* Voz da agente — a IA ouve áudios recebidos sempre; aqui se decide se
              ela também responde falando. */}
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                  Voz da agente
                </p>
                <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                  Áudios recebidos são sempre transcritos. Ative para a agente também responder
                  em áudio; se a geração de voz falhar, a resposta segue em texto.
                </p>
              </div>
              <Switch
                aria-label="Responder em áudio"
                data-testid="ai-voice-enabled"
                checked={form.voice_enabled}
                onCheckedChange={(v) => setForm({ ...form, voice_enabled: v })}
              />
            </div>
            {form.voice_enabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor="elevenlabs-key">Chave de API do ElevenLabs</Label>
                    {chaveElevenLabs && (
                      <Badge className="bg-success text-success-foreground">Configurada</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id="elevenlabs-key"
                      data-testid="ai-elevenlabs-key"
                      type="password"
                      className="sm:max-w-xs"
                      value={chaveNova}
                      onChange={(e) => setChaveNova(e.target.value)}
                      placeholder={chaveElevenLabs ? "••••••••  (deixe vazio para manter)" : "sk_..."}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!chaveNova.trim() || salvarChave.isPending}
                      onClick={async () => {
                        try {
                          await salvarChave.mutateAsync(chaveNova);
                          setChaveNova("");
                          toast.success("Chave do ElevenLabs guardada no Vault.");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Falha ao salvar a chave.");
                        }
                      }}
                    >
                      {salvarChave.isPending ? "Salvando…" : "Salvar chave"}
                    </Button>
                    <ApiKeyTutorialDialog service="elevenlabs" />
                  </div>
                  <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                    A chave é da sua organização e fica no Vault. Sem chave própria, usamos a
                    chave da plataforma (limitada, só para testes).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voice_id">ID da voz</Label>
                  <Input
                    id="voice_id"
                    value={form.voice_id}
                    onChange={(e) => setForm({ ...form, voice_id: e.target.value })}
                    placeholder="EXAVITQu4vr4xnSDxMaL"
                  />
                  <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                    Copie do ElevenLabs em Voices → a voz escolhida → Voice ID.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label id="voice-mode-label">Quando responder em áudio</Label>
                  <Select
                    value={form.voice_response_mode}
                    onValueChange={(v) => setForm({ ...form, voice_response_mode: v })}
                  >
                    <SelectTrigger aria-labelledby="voice-mode-label" data-testid="ai-voice-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reply_to_audio">Só quando o cliente enviar áudio</SelectItem>
                      <SelectItem value="always">Sempre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Contexto da marca — mesmos registros do onboarding (etapa Público). */}
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                Contexto da marca
              </p>
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                Preenchido no onboarding e usado na geração do prompt. Editar aqui atualiza o
                onboarding também — é o mesmo registro.
              </p>
            </div>
            <div className="space-y-2 sm:max-w-xs">
              <Label id="brand-tone-label">Tom da marca</Label>
              <Select value={marca.brand_tone} onValueChange={(v) => setMarca({ ...marca, brand_tone: v })}>
                <SelectTrigger aria-labelledby="brand-tone-label" data-testid="ai-brand-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRAND_TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-prohibitions">O que a IA nunca deve fazer ou dizer</Label>
              <Textarea
                id="ai-prohibitions"
                rows={3}
                maxLength={300}
                value={marca.ai_prohibitions}
                onChange={(e) => setMarca({ ...marca, ai_prohibitions: e.target.value })}
                placeholder="Ex.: Nunca prometer desconto sem aprovação do gerente."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-good-example">Exemplo de resposta ideal</Label>
              <Textarea
                id="ai-good-example"
                rows={3}
                maxLength={500}
                value={marca.good_response_example}
                onChange={(e) => setMarca({ ...marca, good_response_example: e.target.value })}
                placeholder="Cole uma mensagem que representa bem o tom da empresa."
              />
            </div>
          </div>
        </TabsContent>

        {/* Comportamento */}
        <TabsContent value="behavior" className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Sliders className="h-4 w-4" strokeWidth={1.5} />
              Janela de contexto: {form.context_window_size} mensagens
            </Label>
            <Slider
              min={10}
              max={50}
              step={1}
              value={[form.context_window_size]}
              onValueChange={([v]) => setForm({ ...form, context_window_size: v })}
            />
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              Quantas mensagens anteriores a IA lê antes de responder. Mais contexto melhora a
              resposta e encarece a chamada. 20 é um bom ponto de partida.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="delay">Atraso da resposta (ms)</Label>
              <Input id="delay" type="number" min="0" value={form.response_delay_ms} onChange={(e) => setForm({ ...form, response_delay_ms: Number(e.target.value) })} />
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Simula digitação humana antes de responder.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_turns">Máx. respostas antes de humano</Label>
              <Input id="max_turns" type="number" min="0" value={form.max_ai_turns_before_human} onChange={(e) => setForm({ ...form, max_ai_turns_before_human: Number(e.target.value) })} />
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>0 = sem limite. Ao atingir, transfere para humano.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cooldown">Intervalo mínimo entre respostas (ms)</Label>
              <Input id="cooldown" type="number" min="0" value={form.cooldown_ms} onChange={(e) => setForm({ ...form, cooldown_ms: Number(e.target.value) })} />
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                Evita respostas duplicadas quando várias mensagens chegam seguidas. 0 = sem proteção.
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" strokeWidth={1.5} />
              Acionamento humano
            </Label>
            <div className="space-y-2">
              <Label htmlFor="keywords" className="text-xs font-normal">Palavras-chave (separadas por vírgula)</Label>
              <Input id="keywords" value={keywordsText} onChange={(e) => setKeywordsText(e.target.value)} placeholder="falar com humano, atendente, reclamação" />
            </div>
            <label className="flex items-center gap-2">
              <Switch
                aria-label="Transferir ao detectar sentimento negativo"
                checked={triggers.negative_sentiment}
                onCheckedChange={(v) => setTriggers({ ...triggers, negative_sentiment: v })}
              />
              <span className="text-sm" style={{ color: "var(--via-text-body)" }}>Transferir ao detectar sentimento negativo</span>
            </label>
          </div>

          <Separator />

          {/* Detecção de intenção de compra (Parte 6 do Sprint 10A). */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" strokeWidth={1.5} />
              Detecção de intenção de compra
            </Label>
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              Quando o cliente usa uma destas palavras, a IA continua atendendo, mas o time é
              avisado — e o negócio pode avançar de etapa sozinho.
            </p>
            <div className="space-y-2">
              <Label htmlFor="intent-keywords" className="text-xs font-normal">Palavras e frases que indicam intenção (separadas por vírgula)</Label>
              <Input
                id="intent-keywords"
                value={intentKeywordsText}
                onChange={(e) => setIntentKeywordsText(e.target.value)}
                placeholder="quero comprar, fechar, quanto custa, me manda a proposta"
                data-testid="intent-keywords"
              />
            </div>
            <label className="flex items-center gap-2">
              <Switch
                aria-label="Notificar o agente responsável ao detectar intenção de compra"
                checked={intent.notify}
                onCheckedChange={(v) => setIntent({ ...intent, notify: v })}
                data-testid="intent-notify"
              />
              <span className="text-sm" style={{ color: "var(--via-text-body)" }}>Notificar o agente responsável</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm" style={{ color: "var(--via-text-body)" }}>Mover o negócio para a etapa</span>
              <Select
                value={intent.move_to_stage_id ?? "__none__"}
                onValueChange={(v) => setIntent({ ...intent, move_to_stage_id: v === "__none__" ? null : v })}
              >
                <SelectTrigger className="w-56" aria-label="Etapa de destino ao detectar intenção de compra" data-testid="intent-stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Não mover</SelectItem>
                  {(stages ?? []).map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} aria-hidden />
                        {stage.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2">
              <Switch
                aria-label="Assumir a conversa automaticamente ao detectar intenção de compra"
                checked={intent.take_over}
                onCheckedChange={(v) => setIntent({ ...intent, take_over: v })}
                data-testid="intent-take-over"
              />
              <span className="text-sm" style={{ color: "var(--via-text-body)" }}>
                Assumir conversa automaticamente (transfere para humano)
              </span>
            </label>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" strokeWidth={1.5} />
              Horário de atendimento
            </Label>
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              Fora deste horário a IA não responde, em nenhum canal. As mensagens ficam na conversa
              para a equipe atender no próximo período ativo.
            </p>
            <div className="space-y-2">
              {WEEK_DAYS.map((day) => {
                const wh = workingHours[day.key];
                return (
                  <div key={day.key} className="flex flex-wrap items-center gap-3">
                    <div className="flex w-32 items-center gap-2">
                      <Switch
                        aria-label={`Atender ${day.label}`}
                        checked={wh.enabled}
                        onCheckedChange={(v) => setWorkingHours({ ...workingHours, [day.key]: { ...wh, enabled: v } })}
                      />
                      <span className="text-sm" style={{ color: "var(--via-text-body)" }}>{day.label}</span>
                    </div>
                    <Input
                      type="time"
                      className="w-28"
                      value={wh.start}
                      disabled={!wh.enabled}
                      onChange={(e) => setWorkingHours({ ...workingHours, [day.key]: { ...wh, start: e.target.value } })}
                    />
                    <span style={{ color: "var(--via-text-muted)" }}>até</span>
                    <Input
                      type="time"
                      className="w-28"
                      value={wh.end}
                      disabled={!wh.enabled}
                      onChange={(e) => setWorkingHours({ ...workingHours, [day.key]: { ...wh, end: e.target.value } })}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* Base de conhecimento */}
        <TabsContent value="knowledge" className="pt-4">
          <Tabs defaultValue="faqs">
            <TabsList>
              <TabsTrigger value="faqs">FAQs</TabsTrigger>
              <TabsTrigger value="objections">Objeções</TabsTrigger>
              <TabsTrigger value="products">Produtos</TabsTrigger>
            </TabsList>

            <TabsContent value="faqs" className="pt-4">
              <KnowledgePanel
                items={(faqs ?? []).map((f) => ({ id: f.id, a: f.question, b: f.answer }))}
                isLoading={loadingFaqs}
                labelA="Pergunta"
                labelB="Resposta"
                emptyLabel={
                  <span className="flex flex-col items-center gap-2">
                    Nenhuma FAQ ainda. Comece do zero ou use um modelo pronto da Biblioteca.
                    <LinkBiblioteca categoria="ai_faq" />
                  </span>
                }
                onSave={(input) => saveFAQ.mutateAsync({ id: input.id, question: input.a, answer: input.b })}
                onDelete={(id) => deleteFAQ.mutateAsync(id)}
                onImport={(rows) => importFAQs.mutateAsync(rows.map((r) => ({ question: r.a, answer: r.b })))}
              />
            </TabsContent>

            <TabsContent value="objections" className="pt-4">
              <KnowledgePanel
                items={(objections ?? []).map((o) => ({ id: o.id, a: o.objection, b: o.response }))}
                isLoading={loadingObjections}
                labelA="Objeção"
                labelB="Como contornar"
                emptyLabel={
                  <span className="flex flex-col items-center gap-2">
                    Nenhuma objeção ainda. Comece do zero ou use um modelo pronto da Biblioteca.
                    <LinkBiblioteca categoria="ai_objection" />
                  </span>
                }
                onSave={(input) => saveObjection.mutateAsync({ id: input.id, objection: input.a, response: input.b })}
                onDelete={(id) => deleteObjection.mutateAsync(id)}
                onImport={(rows) => importObjections.mutateAsync(rows.map((r) => ({ objection: r.a, response: r.b })))}
              />
            </TabsContent>

            <TabsContent value="products" className="pt-4">
              <p className="mb-3 text-sm" style={{ color: "var(--via-text-muted)" }}>
                Os produtos ativos são sincronizados automaticamente do módulo Produtos e ficam disponíveis para a IA.
              </p>
              {(products ?? []).length === 0 ? (
                <p className="py-4 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
                  Nenhum produto ativo. Cadastre em Produtos.
                </p>
              ) : (
                <ul className="space-y-2">
                  {(products ?? []).map((product) => (
                    <li key={product.id} className="via-card flex items-center justify-between gap-3 p-3">
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{product.name}</p>
                        {product.description && <p className="text-sm" style={{ color: "var(--via-text-body)" }}>{product.description}</p>}
                      </div>
                      <span className="shrink-0 text-sm tabular-nums" style={{ color: "var(--via-text-muted)" }}>
                        {formatCurrency(product.price, product.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Versões de prompt */}
        <TabsContent value="versions" className="pt-4">
          <PromptVersionsPanel />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={save} disabled={upsert.isPending}>
          {upsert.isPending ? "Salvando…" : "Salvar configuração"}
        </Button>
      </div>
    </div>
  );
}
