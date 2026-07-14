import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const step1Schema = z.object({
  full_name: z.string().trim().min(1, "Informe seu nome completo").max(120),
  email: z.string().trim().email("E-mail inválido").max(255),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  company: z.string().trim().max(120).optional().or(z.literal("")),
});

type Step1Form = z.infer<typeof step1Schema>;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isCompleted, isLoading, completeOnboarding, markStepComplete } = useOnboarding();

  const [form, setForm] = useState<Step1Form>({ full_name: "", email: "", phone: "", company: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Step1Form, string>>>({});
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && isCompleted) navigate("/dashboard", { replace: true });
  }, [isLoading, isCompleted, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email, phone, company" as any)
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const row = (data ?? {}) as any;
      setForm({
        full_name: row.full_name ?? "",
        email: row.email ?? user.email ?? "",
        phone: row.phone ?? "",
        company: row.company ?? "",
      });
      setLoadingProfile(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleChange = (field: keyof Step1Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleStart = async () => {
    if (!user) return;
    const parsed = step1Schema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof Step1Form, string>> = {};
      parsed.error.issues.forEach((i) => {
        const key = i.path[0] as keyof Step1Form;
        if (!fieldErrors[key]) fieldErrors[key] = i.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.full_name,
        email: parsed.data.email,
        phone: parsed.data.phone || null,
        company: parsed.data.company || null,
      } as any)
      .eq("id", user.id);

    if (error) {
      setSaving(false);
      toast.error("Não foi possível salvar seus dados.");
      return;
    }
    await markStepComplete("profile");
    await completeOnboarding();
    setSaving(false);
    toast.success("Tudo pronto! Bem-vindo.");
    navigate("/dashboard", { replace: true });
  };

  const handleSkip = async () => {
    await completeOnboarding();
    navigate("/dashboard", { replace: true });
  };

  if (isLoading || loadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando onboarding...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10 bg-background">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Etapa 1 — Seus dados</CardTitle>
          <CardDescription>
            Confirme suas informações de cadastro e adicione telefone e empresa (opcionais).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Nome completo</Label>
            <Input id="full_name" value={form.full_name} onChange={handleChange("full_name")} maxLength={120} />
            {errors.full_name && <p className="text-sm text-destructive">{errors.full_name}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={form.email} onChange={handleChange("email")} maxLength={255} />
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={form.phone} onChange={handleChange("phone")} placeholder="(11) 99999-9999" maxLength={30} />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="company">Empresa</Label>
            <Input id="company" value={form.company} onChange={handleChange("company")} maxLength={120} />
            {errors.company && <p className="text-sm text-destructive">{errors.company}</p>}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="ghost" onClick={handleSkip} disabled={saving}>Pular onboarding</Button>
          <Button onClick={handleStart} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar e continuar
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
