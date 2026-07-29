import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CaptureFieldType = "text" | "email" | "phone" | "textarea";
interface CaptureField {
  key: string;
  label: string;
  type: CaptureFieldType;
  required: boolean;
}
interface FormSchema {
  name: string;
  fields: CaptureField[];
}

const inputTypeFor = (type: CaptureFieldType): string =>
  type === "email" ? "email" : type === "phone" ? "tel" : "text";

/**
 * Formulário público de captura de leads (`/f/:slug`).
 *
 * Sem autenticação e sem sidebar: é a única rota acessível a visitantes. O
 * schema e o envio passam pela edge function `submit-capture-form` (verify_jwt
 * = false), que usa service-role no servidor — nada aqui depende de RLS anônimo.
 */
export default function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>();

  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found" | "done">("loading");
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setStatus("loading");
      if (!slug) {
        if (active) setStatus("not_found");
        return;
      }
      const { data, error } = await supabase.functions.invoke("submit-capture-form", {
        body: { action: "get", slug },
      });
      if (!active) return;
      if (error || !data || data.error || !Array.isArray(data.fields)) {
        setStatus("not_found");
        return;
      }
      setSchema({ name: data.name, fields: data.fields as CaptureField[] });
      setValues(
        Object.fromEntries((data.fields as CaptureField[]).map((f) => [f.key, ""])),
      );
      setStatus("ready");
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  const setValue = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schema || !slug) return;

    // Validação client-side dos obrigatórios (o servidor revalida).
    const missing = schema.fields.find((f) => f.required && !values[f.key]?.trim());
    if (missing) {
      setErrorMsg(`Preencha o campo "${missing.label}".`);
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-capture-form", {
        body: { action: "submit", slug, values },
      });
      if (error) throw await erroDeFunction(error, "Falha no envio.");
      if (data?.error) throw new Error(data.error);
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Não foi possível enviar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        {status === "loading" && (
          <div className="via-card flex flex-col items-center gap-3 p-10 text-center">
            <Loader2
              className="h-6 w-6 animate-spin"
              strokeWidth={1.5}
              style={{ color: "var(--via-text-muted)" }}
            />
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
              Carregando formulário…
            </p>
          </div>
        )}

        {status === "not_found" && (
          <div className="via-card space-y-3 p-8 text-center">
            <ClipboardList
              className="mx-auto h-8 w-8"
              strokeWidth={1.5}
              style={{ color: "var(--via-text-muted)" }}
            />
            <h1
              className="font-display text-2xl font-medium tracking-tight"
              style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
            >
              Formulário indisponível
            </h1>
            <p style={{ color: "var(--via-text-body)" }}>
              Este formulário não existe ou não está mais ativo. Confira o link com quem o
              compartilhou.
            </p>
          </div>
        )}

        {status === "done" && (
          <div className="via-card space-y-3 p-8 text-center">
            <CheckCircle2
              className="mx-auto h-9 w-9"
              strokeWidth={1.5}
              style={{ color: "var(--via-mint, #10b981)" }}
            />
            <h1
              className="font-display text-2xl font-medium tracking-tight"
              style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
            >
              Recebemos seus dados!
            </h1>
            <p style={{ color: "var(--via-text-body)" }}>
              Obrigado pelo interesse. Em breve entraremos em contato.
            </p>
          </div>
        )}

        {status === "ready" && schema && (
          <form onSubmit={submit} className="via-card space-y-5 p-8">
            <div className="space-y-1 text-center">
              <ClipboardList
                className="mx-auto h-7 w-7"
                strokeWidth={1.5}
                style={{ color: "var(--via-text-muted)" }}
              />
              <h1
                className="font-display text-2xl font-medium tracking-tight"
                style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
              >
                {schema.name}
              </h1>
            </div>

            <div className="space-y-4">
              {schema.fields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`f-${field.key}`}>
                    {field.label}
                    {field.required && <span className="ml-0.5 text-via-coral">*</span>}
                  </Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={`f-${field.key}`}
                      rows={4}
                      value={values[field.key] ?? ""}
                      required={field.required}
                      onChange={(e) => setValue(field.key, e.target.value)}
                    />
                  ) : (
                    <Input
                      id={`f-${field.key}`}
                      type={inputTypeFor(field.type)}
                      value={values[field.key] ?? ""}
                      required={field.required}
                      onChange={(e) => setValue(field.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>

            {errorMsg && <p className="text-sm text-via-coral">{errorMsg}</p>}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Enviando…" : "Enviar"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
