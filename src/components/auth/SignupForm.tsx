import { useState } from "react";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const schema = z.object({
  fullName: z.string().trim().min(3, "Nome muito curto").max(100),
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Senha mínima 6 caracteres").max(72),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "As senhas não coincidem.", path: ["confirmPassword"],
});

export function SignupForm() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    const { error, pending, isApproved } = await signUp(form.fullName, form.email, form.password);
    setLoading(false);
    if (error) { toast.error(error); return; }
    if (isApproved === false) {
      toast.info("Conta criada! Aguardando confirmação de email e aprovação do administrador.");
      navigate("/pending-approval", { replace: true });
    } else if (isApproved === true) {
      toast.success("Conta criada com sucesso!");
      navigate("/dashboard", { replace: true });
    } else {
      // Fallback when profile not yet readable (email confirmation required)
      toast.info("Conta criada! Verifique seu email para confirmar o cadastro.");
      navigate("/auth", { replace: true });
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Criar conta</h2>
        <p className="text-sm text-muted-foreground">Preencha os dados para começar.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="su-name">Nome Completo</Label>
        <Input id="su-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="su-email">Email</Label>
        <Input id="su-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="su-pass">Senha</Label>
        <Input id="su-pass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="su-pass2">Confirmar Senha</Label>
        <Input id="su-pass2" type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Cadastrar
      </Button>
    </form>
  );
}
