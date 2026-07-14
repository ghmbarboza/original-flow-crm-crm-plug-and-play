import { useState } from "react";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const schema = z.object({
  email: z.string().trim().email({ message: "Email inválido" }).max(255),
  password: z.string().min(6, { message: "Senha mínima 6 caracteres" }).max(72),
});

const emailSchema = z.string().trim().email({ message: "Email inválido" }).max(255);

export function LoginForm() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onForgotPassword = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error("Preencha o email primeiro para recuperar a senha.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) {
      toast.error("Não foi possível enviar o email de recuperação.");
      return;
    }
    toast.success("Email de recuperação enviado");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error, isApproved } = await signIn(email, password);
    setLoading(false);
    if (error) { toast.error(error); return; }
    if (isApproved === false) {
      toast.info("Conta aguardando aprovação do administrador.");
      navigate("/pending-approval", { replace: true });
      return;
    }
    toast.success("Login realizado");
    navigate("/dashboard", { replace: true });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">Senha</Label>
        <Input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Esqueceu a senha?
          </button>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}
