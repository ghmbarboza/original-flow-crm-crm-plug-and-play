import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type CompanyInsert = Database["public"]["Tables"]["companies"]["Insert"];
export type DealStatus = Database["public"]["Enums"]["deal_status"];

/** Contato vinculado, no recorte que o drawer da empresa mostra. */
export interface CompanyContact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  status: Database["public"]["Enums"]["contact_status"];
}

/** Negócio vinculado, no recorte que o drawer da empresa mostra. */
export interface CompanyDeal {
  id: string;
  title: string;
  value: number;
  currency: string;
  status: DealStatus;
  close_date: string | null;
  stage: { name: string; color: string } | null;
}

export function useCompanies() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["companies", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Company[]> => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("org_id", orgId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCompany(id: string | null) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["company", id],
    enabled: !!id && !!orgId,
    queryFn: async (): Promise<Company> => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/** Contatos que apontam para esta empresa. Alimenta a seção "Contatos" do drawer. */
export function useCompanyContacts(companyId: string | null) {
  return useQuery({
    queryKey: ["company-contacts", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<CompanyContact[]> => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email, phone, title, status")
        .eq("company_id", companyId!)
        // Contatos absorvidos por um merge seguem no banco, mas não na lista.
        .is("merged_into_id", null)
        .order("first_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Negócios que apontam para esta empresa. Alimenta a seção "Negócios" do drawer. */
export function useCompanyDeals(companyId: string | null) {
  return useQuery({
    queryKey: ["company-deals", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<CompanyDeal[]> => {
      const { data, error } = await supabase
        .from("deals")
        .select("id, title, value, currency, status, close_date, stage:pipeline_stages(name, color)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompanyDeal[];
    },
  });
}

export function useCreateCompany() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<CompanyInsert, "org_id">) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { data, error } = await supabase
        .from("companies")
        .insert({ ...input, org_id: orgId })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["companies", orgId] }),
  });
}

export function useUpdateCompany() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CompanyInsert> & { id: string }) => {
      const { data, error } = await supabase
        .from("companies")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (company) => {
      queryClient.invalidateQueries({ queryKey: ["companies", orgId] });
      queryClient.invalidateQueries({ queryKey: ["company", company.id] });
      // O nome da empresa aparece na lista de contatos.
      queryClient.invalidateQueries({ queryKey: ["contacts", orgId] });
    },
  });
}

export function useDeleteCompany() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies", orgId] });
      // Contatos e negócios da empresa apagada ficam sem vínculo (FK ON DELETE SET NULL).
      queryClient.invalidateQueries({ queryKey: ["contacts", orgId] });
    },
  });
}
