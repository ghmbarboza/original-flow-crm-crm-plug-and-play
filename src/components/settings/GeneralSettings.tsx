import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  BUSINESS_SECTORS, COMPANY_SIZES, useOrganization, useUpdateOrganization,
} from "@/hooks/useSetup";
import { toast } from "sonner";
import { MelhorarComIA } from "@/components/ai/MelhorarComIA";

/**
 * Sobre a empresa — MESMOS registros que o onboarding grava em `organizations`
 * (etapas Empresa e Público). Editar aqui reflete no wizard e vice-versa;
 * fonte única, não cópia. Só admin edita a organização (RLS).
 */
function SobreAEmpresa() {
  const { data: org, isLoading } = useOrganization();
  const salvar = useUpdateOrganization();

  const [form, setForm] = useState({
    name: "",
    business_sector: "",
    outro_descricao: "",
    company_size: "",
    business_description: "",
    target_audience: "",
    main_problem_solved: "",
  });

  useEffect(() => {
    if (!org) return;
    const setor = org.business_sector ?? "";
    setForm({
      name: org.name ?? "",
      business_sector: setor.startsWith("outro") ? "outro" : setor,
      outro_descricao: setor.startsWith("outro:") ? setor.slice("outro:".length) : "",
      company_size: org.company_size ?? "",
      business_description: org.business_description ?? "",
      target_audience: org.target_audience ?? "",
      main_problem_solved: org.main_problem_solved ?? "",
    });
  }, [org]);

  const submeter = async () => {
    if (!form.name.trim()) {
      toast.error("O nome da empresa não pode ficar vazio.");
      return;
    }
    try {
      // Mesmo formato do onboarding: "outro" com descrição persiste como
      // "outro:<texto>" — fonte única exige o mesmo encoding dos dois lados.
      const setor =
        form.business_sector === "outro" && form.outro_descricao.trim()
          ? `outro:${form.outro_descricao.trim()}`
          : form.business_sector;
      await salvar.mutateAsync({
        name: form.name.trim(),
        business_sector: setor || null,
        company_size: form.company_size || null,
        business_description: form.business_description.trim() || null,
        target_audience: form.target_audience.trim() || null,
        main_problem_solved: form.main_problem_solved.trim() || null,
      });
      toast.success("Dados da empresa atualizados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Sobre a empresa</CardTitle>
        <CardDescription>
          O contexto preenchido no onboarding — a IA usa isso para se apresentar e vender.
          Editar aqui atualiza o onboarding também: é o mesmo registro.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="empresa-nome">Nome da empresa</Label>
          <Input
            id="empresa-nome"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={120}
            data-testid="empresa-nome"
          />
        </div>
        <div className="space-y-2">
          <Label id="empresa-setor-label">Setor de atuação</Label>
          <Select
            value={form.business_sector}
            onValueChange={(v) => setForm({ ...form, business_sector: v })}
          >
            <SelectTrigger aria-labelledby="empresa-setor-label" data-testid="empresa-setor">
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_SECTORS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.icon} {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {form.business_sector === "outro" && (
          <div className="space-y-2">
            <Label htmlFor="empresa-outro">Descreva seu setor</Label>
            <Input
              id="empresa-outro"
              value={form.outro_descricao}
              onChange={(e) => setForm({ ...form, outro_descricao: e.target.value })}
              placeholder="Ex.: pet shop, energia solar…"
              maxLength={80}
              data-testid="empresa-outro"
            />
          </div>
        )}
        <div className="space-y-2">
          <Label id="empresa-tamanho-label">Tamanho da equipe</Label>
          <Select
            value={form.company_size}
            onValueChange={(v) => setForm({ ...form, company_size: v })}
          >
            <SelectTrigger aria-labelledby="empresa-tamanho-label" data-testid="empresa-tamanho">
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {COMPANY_SIZES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="empresa-desc">O que sua empresa vende e para quem?</Label>
            <MelhorarComIA
              valor={form.business_description}
              onChange={(t) => setForm((f) => ({ ...f, business_description: t }))}
              contexto="o que a empresa vende e para quem"
              maxChars={300}
            />
          </div>
          <Textarea
            id="empresa-desc"
            rows={2}
            maxLength={300}
            value={form.business_description}
            onChange={(e) => setForm({ ...form, business_description: e.target.value })}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="empresa-publico">Para quem você vende?</Label>
            <MelhorarComIA
              valor={form.target_audience}
              onChange={(t) => setForm((f) => ({ ...f, target_audience: t }))}
              contexto="o público para quem a empresa vende"
              maxChars={200}
            />
          </div>
          <Textarea
            id="empresa-publico"
            rows={2}
            maxLength={200}
            value={form.target_audience}
            onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="empresa-problema">Qual problema você resolve para seu cliente?</Label>
            <MelhorarComIA
              valor={form.main_problem_solved}
              onChange={(t) => setForm((f) => ({ ...f, main_problem_solved: t }))}
              contexto="o problema que a empresa resolve para o cliente"
              maxChars={200}
            />
          </div>
          <Textarea
            id="empresa-problema"
            rows={2}
            maxLength={200}
            value={form.main_problem_solved}
            onChange={(e) => setForm({ ...form, main_problem_solved: e.target.value })}
          />
        </div>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button onClick={submeter} disabled={salvar.isPending} data-testid="empresa-salvar">
          {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar empresa
        </Button>
      </CardFooter>
    </Card>
  );
}

function getInitials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export default function GeneralSettings() {
  const { user, profile, refreshProfile, isAdmin } = useAuth();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redefinição de senha: só por link de email — a troca na tela foi removida
  // na validação de UX de 2026-07-30 (dois caminhos confundiam, e o link
  // funciona inclusive para quem não sabe a senha atual).
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name ?? "",
      email: profile.email ?? "",
      phone: profile.phone ?? "",
    });
    setAvatarUrl(profile.avatar_url ?? null);
    setLoading(false);
  }, [profile]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Permite reselecionar o mesmo arquivo numa próxima vez.
    e.target.value = "";
    if (!file || !user) return;

    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-busting para refletir a nova imagem imediatamente.
      const publicUrl = `${pub.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      await refreshProfile();
      toast.success("Foto de perfil atualizada com sucesso.");
    } catch (err) {
      toast.error("Não foi possível atualizar a foto de perfil.");
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      toast.error("Não foi possível salvar as alterações.");
      setSaving(false);
      return;
    }

    await refreshProfile();
    setSaving(false);
    toast.success("Informações atualizadas com sucesso.");
  };

  const handleSendResetLink = async () => {
    if (!user?.email) {
      toast.error("Sessão inválida. Entre novamente.");
      return;
    }
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) {
        toast.error("Não foi possível enviar o link de redefinição.");
        return;
      }
      toast.success(`Link de redefinição enviado para ${user.email}.`);
    } finally {
      setSendingReset(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Informações pessoais</CardTitle>
          <CardDescription>Atualize sua foto e seus dados de cadastro.</CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            {/* Foto à esquerda, centralizada verticalmente */}
            <div className="flex shrink-0 flex-col items-center gap-2">
              <Avatar className="h-20 w-20">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={form.full_name || "Avatar"} />}
                <AvatarFallback className="bg-[var(--via-navy)] text-white text-lg">
                  {getInitials(form.full_name)}
                </AvatarFallback>
              </Avatar>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Alterar foto
              </Button>
            </div>

            {/* Campos à direita, ocupando o restante do espaço */}
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Nome completo</Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={handleChange("full_name")}
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  readOnly
                  disabled
                  className="cursor-not-allowed opacity-70"
                />
              </div>
              {/* O campo "Empresa" (texto livre em profiles.company) saiu daqui:
                  o nome real da empresa mora em organizations.name e é editado
                  na seção "Sobre a empresa" abaixo — pedir duas vezes criava
                  duas verdades. */}
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={handleChange("phone")}
                  placeholder="(11) 99999-9999"
                  maxLength={30}
                />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} data-testid="general-save">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </CardFooter>
      </Card>

      {/* Só admin edita a organização — o RLS recusaria o update de um membro. */}
      {isAdmin && <SobreAEmpresa />}

      {/* A troca de senha na tela foi removida (validação de UX 2026-07-30):
          dois caminhos para a mesma coisa confundiam, e o link por email é o
          único que funciona também para quem esqueceu a senha atual. */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-base font-semibold">Enviar link de redefinição de senha</CardTitle>
              <CardDescription className="text-sm">
                Prefere redefinir por email? Enviaremos um link seguro para{" "}
                <span className="font-medium">{user?.email ?? "seu email"}</span> com instruções para criar uma nova senha.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={handleSendResetLink}
              disabled={sendingReset}
            >
              {sendingReset && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar link
            </Button>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
