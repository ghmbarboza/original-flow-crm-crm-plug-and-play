import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Instância ainda sem ninguém cadastrado: a tela de login vira "Configuração
 * inicial" e o primeiro cadastro cria o administrador (migration
 * 20260916120000). A RPC é `SECURITY DEFINER` e responde sem login.
 *
 * Em caso de erro (rede, backend fora), devolve `false`: mostrar o login comum
 * é o comportamento seguro, porque o cadastro continua acessível pelo botão.
 */
export function usePrimeiroAcesso() {
  const { data, isLoading } = useQuery({
    queryKey: ["primeiro-acesso"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("instancia_sem_usuarios");
      if (error) throw error;
      return data === true;
    },
  });

  return { primeiroAcesso: data ?? false, carregando: isLoading };
}
