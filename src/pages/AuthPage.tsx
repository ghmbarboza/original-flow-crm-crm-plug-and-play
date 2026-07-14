import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function AuthPage() {
  const { user, isApproved } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate(isApproved ? "/dashboard" : "/pending-approval", { replace: true });
  }, [user, isApproved, navigate]);

  return <AuthLayout />;
}
