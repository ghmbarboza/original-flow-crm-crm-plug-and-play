import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";

export default function PendingApprovalPage() {
  const { profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  const onCheck = async () => {
    setChecking(true);
    await refreshProfile();
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: p } = await supabase
        .from("profiles")
        .select("is_approved, is_active")
        .eq("id", user.id)
        .maybeSingle();
      setChecking(false);
      if (p?.is_approved && p?.is_active) {
        toast.success("Conta aprovada! Redirecionando...");
        navigate("/dashboard", { replace: true });
        return;
      }
    } else {
      setChecking(false);
    }
    toast.info("Sua conta ainda aguarda aprovação.");
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="max-w-md text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center">
          <Clock className="h-8 w-8 text-warning" />
        </div>
        <h1 className="text-2xl font-medium tracking-tight">Aguardando Aprovação</h1>
        <p className="text-muted-foreground">
          Olá, {profile?.full_name ?? "usuário"}! Sua conta foi criada com sucesso, mas ainda
          precisa ser aprovada por um administrador.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={signOut}>Fazer Logout</Button>
          <Button onClick={onCheck} disabled={checking}>
            {checking ? "Verificando..." : "Verificar novamente"}
          </Button>
        </div>
      </div>
    </main>
  );
}
