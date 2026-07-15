import { useAuth } from "@/hooks/useAuth";

/**
 * Organização do usuário logado. Todo dado do CRM é filtrado por ela.
 *
 * Retorna null enquanto o profile carrega — os hooks de dados usam isso para
 * segurar a query (`enabled: !!orgId`) em vez de consultar sem filtro.
 */
export function useOrgId(): string | null {
  const { profile } = useAuth();
  return profile?.org_id ?? null;
}
