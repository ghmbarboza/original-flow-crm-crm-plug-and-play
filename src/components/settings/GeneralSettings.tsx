import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

function getInitials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export default function GeneralSettings() {
  const { user, profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    company: "",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name ?? "",
      email: profile.email ?? "",
      phone: profile.phone ?? "",
      company: profile.company ?? "",
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
        company: form.company.trim() || null,
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
              <div className="space-y-2">
                <Label htmlFor="company">Empresa</Label>
                <Input
                  id="company"
                  value={form.company}
                  onChange={handleChange("company")}
                  maxLength={120}
                />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
