import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NotificationPreferences from "@/components/settings/NotificationPreferences";
import NotificationTemplatesSettings from "@/components/settings/NotificationTemplatesSettings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const SECOES = ["preferencias", "modelos"] as const;
type Secao = (typeof SECOES)[number];

/**
 * Configurações > Notificações: Preferências (o que cada usuário recebe e por
 * onde) e Modelos (o texto de cada evento, por org). Deep-link: ?secao=modelos.
 */
export default function NotificationsTab() {
  const [params, setParams] = useSearchParams();
  const alvo = params.get("secao");
  const secao: Secao = (SECOES as readonly string[]).includes(alvo ?? "") ? (alvo as Secao) : "preferencias";
  const { user, isAdmin } = useAuth();
  const { data: telefone } = useQuery({
    queryKey: ["profile-phone", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("phone").eq("id", user!.id).maybeSingle();
      return (data?.phone as string | null) ?? null;
    },
  });

  const trocar = (valor: string) => {
    const proximos = new URLSearchParams(params);
    proximos.set("secao", valor);
    setParams(proximos, { replace: true });
  };

  return (
    <Tabs value={secao} onValueChange={trocar} className="space-y-4">
      <TabsList>
        <TabsTrigger data-testid="notifications-section" value="preferencias">Preferências</TabsTrigger>
        {isAdmin && <TabsTrigger data-testid="notifications-section" value="modelos">Modelos</TabsTrigger>}
      </TabsList>

      <TabsContent value="preferencias" className="space-y-3">
        <p className="text-sm" style={{ color: "var(--via-text-body)" }} data-testid="notifications-phone-hint">
          Avisos por WhatsApp vão para o seu telefone{telefone ? ` (${telefone})` : ""}.{" "}
          {telefone ? (
            <Link to="/settings" className="underline">Alterar em Geral</Link>
          ) : (
            <>Cadastre o seu número em <Link to="/settings" className="underline">Geral</Link> para receber.</>
          )}{" "}
          Avisos por e-mail saem pelo provedor configurado em <Link to="/settings/email" className="underline">E-mail</Link>.
        </p>
        <NotificationPreferences />
      </TabsContent>

      {isAdmin && (
        <TabsContent value="modelos">
          <NotificationTemplatesSettings />
        </TabsContent>
      )}
    </Tabs>
  );
}
