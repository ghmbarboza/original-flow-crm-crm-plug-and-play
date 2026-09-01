import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function AuthPage() {
  const { user, isApproved, profileSettled } = useAuth();
  const navigate = useNavigate();

  // Decide o destino só com o perfil resolvido. No instante pós-login o user já
  // existe mas o profile ainda não, e `isApproved` seria false para todo mundo:
  // era isso que fazia o admin ver um flash de "Aguardando Aprovação". Quem
  // navega primeiro nesse fluxo é o LoginForm, que consulta o is_approved real.
  useEffect(() => {
    if (!user || !profileSettled) return;
    navigate(isApproved ? "/dashboard" : "/pending-approval", { replace: true });
  }, [user, profileSettled, isApproved, navigate]);

  return <AuthLayout />;
}
