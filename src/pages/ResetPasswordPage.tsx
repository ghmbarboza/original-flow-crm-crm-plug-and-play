import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Tela dedicada de redefinição de senha (fora do AppLayout, sem sidebar).
 *
 * O Supabase entrega o token do link de recuperação no HASH da URL
 * (`#access_token=...&type=recovery`). Com `detectSessionInUrl` (default), o
 * client troca esse hash por uma sessão de recuperação e dispara o evento
 * PASSWORD_RECOVERY — é essa sessão que autoriza o `updateUser({ password })`.
 * Detectamos o fluxo por qualquer um dos sinais (hash, evento ou sessão ativa).
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [form, setForm] = useState({ next: "", confirm: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const isRecoveryHash = hash.get("type") === "recovery" && !!hash.get("access_token");
    if (isRecoveryHash) setStatus("ready");

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setStatus("ready");
    });

    // getSession() resolve após o client processar o hash: se há sessão
    // (de recuperação ou normal), libera o form; sem sessão e sem hash de
    // recovery, o link é inválido/expirado.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStatus("ready");
      else if (!isRecoveryHash) setStatus("invalid");
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.next.length < MIN_PASSWORD_LENGTH) {
      toast.error(`A nova senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (form.next !== form.confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: form.next });
    setSaving(false);

    if (error) {
      toast.error(error.message || "Não foi possível redefinir a senha.");
      return;
    }
    toast.success("Senha redefinida com sucesso.");
    navigate("/dashboard", { replace: true });
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center p-4 font-sans"
      style={{ background: "var(--via-white)" }}
    >
      <Card className="w-full max-w-md">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Redefinir senha</CardTitle>
            <CardDescription>
              {status === "invalid"
                ? "Link inválido ou expirado."
                : "Escolha uma nova senha para acessar sua conta."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {status === "checking" && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verificando o link…
              </div>
            )}

            {status === "invalid" && (
              <p className="text-sm text-muted-foreground">
                O link de redefinição não é mais válido. Solicite um novo pela tela de{" "}
                <Link to="/auth" className="font-medium underline">
                  login
                </Link>{" "}
                (opção “Esqueceu a senha?”).
              </p>
            )}

            {status === "ready" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="new_password">Nova senha</Label>
                  <Input
                    id="new_password"
                    type="password"
                    autoComplete="new-password"
                    value={form.next}
                    onChange={(e) => setForm((p) => ({ ...p, next: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Confirmar nova senha</Label>
                  <Input
                    id="confirm_password"
                    type="password"
                    autoComplete="new-password"
                    value={form.confirm}
                    onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))}
                  />
                </div>
              </>
            )}
          </CardContent>

          <CardFooter>
            {status === "ready" && (
              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Redefinir senha
              </Button>
            )}
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
