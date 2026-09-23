import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import {
  campoVisivel, lerTrackingDaPagina, normalizarTracking, parseCaptureFields, validarValores,
  type CaptureField, type Tracking,
} from "@/lib/formRules";

interface FormSchema {
  name: string;
  fields: CaptureField[];
  success_message: string | null;
  redirect_url: string | null;
  consent_text: string | null;
  theme: { primary?: string; background?: string };
}

const inputTypeFor = (type: CaptureField["type"]): string =>
  type === "email" ? "email" : type === "phone" ? "tel" : type === "number" ? "number" : type === "date" ? "date" : "text";

const VISITOR_KEY = "flowcrm_visitor";

function visitorId(): string | null {
  try {
    const atual = localStorage.getItem(VISITOR_KEY);
    if (atual) return atual;
    const novo = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, novo);
    return novo;
  } catch {
    return null;
  }
}

/**
 * Formulário público de captura de leads (`/f/:slug`).
 *
 * Sem autenticação e sem sidebar. O schema e o envio passam pela edge function
 * `submit-capture-form` (service role no servidor). Em `?embed=1` a página roda
 * dentro do iframe do site do cliente: sem moldura, avisa a altura por
 * postMessage e recebe as UTMs da página mãe pela query.
 */
export default function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const embed = params.get("embed") === "1";

  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found" | "done">("loading");
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mensagemFinal, setMensagemFinal] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  // Rastreamento: da própria URL (link direto) ou repassado pelo embed na query.
  const tracking = useMemo<Tracking>(() => {
    const daPagina = lerTrackingDaPagina(window.location.href, document.referrer);
    const doEmbed = normalizarTracking(Object.fromEntries(params.entries()));
    return { ...daPagina, ...doEmbed };
  }, [params]);

  useEffect(() => {
    let active = true;
    (async () => {
      setStatus("loading");
      if (!slug) {
        if (active) setStatus("not_found");
        return;
      }
      const { data, error } = await supabase.functions.invoke("submit-capture-form", { body: { action: "get", slug } });
      if (!active) return;
      if (error || !data || data.error || !Array.isArray(data.fields)) {
        setStatus("not_found");
        return;
      }
      const fields = parseCaptureFields(data.fields);
      setSchema({
        name: data.name,
        fields,
        success_message: data.success_message ?? null,
        redirect_url: data.redirect_url ?? null,
        consent_text: data.consent_text ?? null,
        theme: (data.theme ?? {}) as FormSchema["theme"],
      });
      setValues(Object.fromEntries(fields.map((f) => [f.key, f.type === "hidden" ? (f.value ?? "") : ""])));
      setStatus("ready");
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  // Altura para o iframe do embed, a cada mudança de layout.
  useEffect(() => {
    if (!embed || !raiz.current) return;
    const avisar = (redirect?: string | null) => {
      window.parent?.postMessage(
        { type: "flowcrm:form-height", slug, height: raiz.current?.scrollHeight ?? 0, redirect: redirect ?? null },
        "*",
      );
    };
    avisar();
    const ro = new ResizeObserver(() => avisar());
    ro.observe(raiz.current);
    return () => ro.disconnect();
  }, [embed, slug, status]);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schema || !slug) return;
    const erro = validarValores(schema.fields, values);
    if (erro) {
      setErrorMsg(erro);
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-capture-form", {
        body: { action: "submit", slug, values, tracking, visitor_id: visitorId() },
      });
      if (error) throw await erroDeFunction(error, "Falha no envio.");
      if (data?.error) throw new Error(data.error);
      setMensagemFinal(data?.success_message ?? schema.success_message ?? null);
      setStatus("done");
      const redirect = (data?.redirect_url ?? schema.redirect_url ?? "").trim();
      if (redirect) {
        if (embed) {
          window.parent?.postMessage({ type: "flowcrm:form-height", slug, height: raiz.current?.scrollHeight ?? 0, redirect }, "*");
        } else {
          window.location.href = redirect;
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Não foi possível enviar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const estilo: React.CSSProperties = {
    ...(schema?.theme?.primary ? ({ "--via-primary": schema.theme.primary, "--primary": schema.theme.primary } as React.CSSProperties) : {}),
    ...(schema?.theme?.background && !embed ? { background: schema.theme.background } : {}),
  };

  const renderCampo = (field: CaptureField) => {
    if (field.type === "hidden" || !campoVisivel(field, values)) return null;
    const id = `f-${field.key}`;
    const rotulo = (
      <Label htmlFor={id}>
        {field.label}
        {field.required && <span className="ml-0.5 text-via-coral">*</span>}
      </Label>
    );
    const ajuda = field.help ? <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{field.help}</p> : null;

    if (field.type === "checkbox") {
      return (
        <div key={field.key} className="space-y-1.5">
          <label className="flex items-start gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
            <Checkbox
              id={id}
              checked={values[field.key] === "true"}
              onCheckedChange={(v) => setValue(field.key, v ? "true" : "false")}
              aria-label={field.label}
            />
            <span>
              {field.label}
              {field.required && <span className="ml-0.5 text-via-coral">*</span>}
            </span>
          </label>
          {ajuda}
        </div>
      );
    }
    if (field.type === "select") {
      return (
        <div key={field.key} className="space-y-1.5">
          {rotulo}
          <Select value={values[field.key] || undefined} onValueChange={(v) => setValue(field.key, v)}>
            <SelectTrigger id={id} aria-label={field.label} data-testid={`campo-${field.key}`}>
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          {ajuda}
        </div>
      );
    }
    if (field.type === "radio") {
      return (
        <div key={field.key} className="space-y-1.5">
          {rotulo}
          <RadioGroup value={values[field.key] ?? ""} onValueChange={(v) => setValue(field.key, v)} className="flex flex-wrap gap-3">
            {(field.options ?? []).map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
                <RadioGroupItem value={o} id={`${id}-${o}`} />
                {o}
              </label>
            ))}
          </RadioGroup>
          {ajuda}
        </div>
      );
    }
    if (field.type === "textarea") {
      return (
        <div key={field.key} className="space-y-1.5">
          {rotulo}
          <Textarea id={id} rows={4} value={values[field.key] ?? ""} onChange={(e) => setValue(field.key, e.target.value)} />
          {ajuda}
        </div>
      );
    }
    return (
      <div key={field.key} className="space-y-1.5">
        {rotulo}
        <Input
          id={id}
          type={inputTypeFor(field.type)}
          value={values[field.key] ?? ""}
          onChange={(e) => setValue(field.key, e.target.value)}
          data-testid={`campo-${field.key}`}
        />
        {ajuda}
      </div>
    );
  };

  return (
    <div ref={raiz} className={embed ? "bg-transparent p-1" : "flex min-h-screen items-center justify-center bg-background p-6"} style={estilo}>
      <div className={embed ? "w-full" : "w-full max-w-md"}>
        {status === "loading" && (
          <div className="via-card flex flex-col items-center gap-3 p-10 text-center">
            <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Carregando formulário…</p>
          </div>
        )}

        {status === "not_found" && (
          <div className="via-card space-y-3 p-8 text-center">
            <ClipboardList className="mx-auto h-8 w-8" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1 className="font-display text-2xl font-medium tracking-tight" style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}>
              Formulário indisponível
            </h1>
            <p style={{ color: "var(--via-text-body)" }}>
              Este formulário não existe ou não está mais ativo. Confira o link com quem o compartilhou.
            </p>
          </div>
        )}

        {status === "done" && (
          <div className="via-card space-y-3 p-8 text-center" data-testid="form-done">
            <CheckCircle2 className="mx-auto h-9 w-9" strokeWidth={1.5} style={{ color: "var(--via-mint, #10b981)" }} />
            <h1 className="font-display text-2xl font-medium tracking-tight" style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}>
              Recebemos seus dados!
            </h1>
            <p style={{ color: "var(--via-text-body)" }}>
              {mensagemFinal || "Obrigado pelo interesse. Em breve entraremos em contato."}
            </p>
          </div>
        )}

        {status === "ready" && schema && (
          <form onSubmit={submit} className={embed ? "space-y-5" : "via-card space-y-5 p-8"} data-testid="public-form">
            {!embed && (
              <div className="space-y-1 text-center">
                <ClipboardList className="mx-auto h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
                <h1 className="font-display text-2xl font-medium tracking-tight" style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}>
                  {schema.name}
                </h1>
              </div>
            )}

            <div className="space-y-4">{schema.fields.map(renderCampo)}</div>

            {schema.consent_text && (
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{schema.consent_text}</p>
            )}

            {errorMsg && <p className="text-sm text-via-coral" data-testid="form-error">{errorMsg}</p>}

            <Button type="submit" className="w-full" disabled={submitting} data-testid="form-submit">
              {submitting ? "Enviando…" : "Enviar"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
