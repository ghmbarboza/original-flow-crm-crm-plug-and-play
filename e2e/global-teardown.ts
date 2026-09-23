import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { credencial as env } from "./helpers";

/**
 * Limpeza dos registros criados pela suíte E2E.
 *
 * A suíte roda contra o backend real, então cada execução deixa contatos,
 * empresas, negócios, produtos e atividades no banco. Sem isso as listas crescem
 * indefinidamente e as telas ficam poluídas para quem usa o app de verdade.
 *
 * SEGURANÇA — duas travas, ambas obrigatórias:
 *  1. Só apaga linhas cujo nome/título contém "E2E", o marcador que uniqueName()
 *     carimba em tudo que a suíte cria. Nada sem esse marcador é tocado.
 *  2. Sempre escopado por org_id, resolvido da sessão/credencial em uso.
 *
 * CREDENCIAIS — do ambiente ou do `.env` local (gitignored), nunca do código:
 *  - Preferência: SUPABASE_SERVICE_ROLE_KEY (ignora RLS, mais confiável quando
 *    um registro ficou órfão de outro usuário).
 *  - Sem ela: autentica como o usuário do E2E e apaga pelas próprias policies.
 *    Funciona porque a suíte só cria registros da própria organização.
 *  - Sem nenhuma das duas: avisa e não apaga nada. Um teardown que não consegue
 *    autenticar deve ser silencioso, não derrubar um run que passou.
 */

const MARKER = "E2E";

/**
 * Ordem de exclusão ditada pelas foreign keys.
 *
 * Quase tudo é SET NULL ou CASCADE, mas deal_products.product_id -> products é
 * RESTRICT: apagar um produto ainda vinculado a um negócio falha. Por isso os
 * negócios saem ANTES dos produtos — o CASCADE de deal_products limpa o vínculo
 * e libera o produto.
 */
const TABELAS: { tabela: string; coluna: string }[] = [
  // Automação de teste que fica viva dispara a cada contato criado (inclusive
  // pelos próprios testes): foram 2.748 execuções acumuladas até 14/09.
  // O CASCADE de automation_logs leva o histórico junto.
  { tabela: "automations", coluna: "name" },
  { tabela: "activities", coluna: "title" },
  { tabela: "deals", coluna: "title" },
  { tabela: "contacts", coluna: "first_name" },
  { tabela: "companies", coluna: "name" },
  { tabela: "products", coluna: "name" },
  { tabela: "knowledge_documents", coluna: "title" },
  { tabela: "knowledge_facts", coluna: "title" },
  { tabela: "appointments", coluna: "title" },
];

async function limpar(client: SupabaseClient, orgId: string) {
  const resumo: string[] = [];

  for (const { tabela, coluna } of TABELAS) {
    const { data, error } = await client
      .from(tabela)
      .delete()
      .eq("org_id", orgId)
      .ilike(coluna, `%${MARKER}%`)
      .select("id");

    if (error) {
      resumo.push(`${tabela}: falhou (${error.message})`);
      continue;
    }
    resumo.push(`${tabela}: ${data?.length ?? 0}`);
  }

  // eslint-disable-next-line no-console
  console.log(`[e2e teardown] removidos — ${resumo.join(", ")}`);
}

export default async function globalTeardown() {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  if (!url) {
    // eslint-disable-next-line no-console
    console.warn("[e2e teardown] SUPABASE_URL ausente; nada foi limpo.");
    return;
  }

  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

  // ---- Caminho 1: service role (do ambiente, nunca do código) ----
  if (serviceKey) {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    // Sem sessão de usuário, a org vem do profile do e-mail usado pela suíte.
    const email = env("E2E_EMAIL") ?? "sabrina@viverdeia.ai";
    const { data: profile } = await admin
      .from("profiles").select("org_id").eq("email", email).maybeSingle();
    if (!profile?.org_id) {
      // eslint-disable-next-line no-console
      console.warn(`[e2e teardown] org de ${email} não encontrada; nada foi limpo.`);
      return;
    }
    await limpar(admin, profile.org_id as string);
    return;
  }

  // ---- Caminho 2: sessão do próprio usuário do E2E ----
  const anonKey = env("VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
  const password = env("E2E_PASSWORD");
  if (!anonKey || !password) {
    // eslint-disable-next-line no-console
    console.warn(
      "[e2e teardown] sem SUPABASE_SERVICE_ROLE_KEY e sem E2E_PASSWORD; nada foi limpo.",
    );
    return;
  }

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await client.auth.signInWithPassword({
    email: env("E2E_EMAIL") ?? "sabrina@viverdeia.ai",
    password,
  });
  if (authError || !auth.user) {
    // eslint-disable-next-line no-console
    console.warn(`[e2e teardown] login falhou (${authError?.message}); nada foi limpo.`);
    return;
  }

  const { data: profile } = await client
    .from("profiles").select("org_id").eq("id", auth.user.id).maybeSingle();
  if (!profile?.org_id) {
    // eslint-disable-next-line no-console
    console.warn("[e2e teardown] usuário sem org; nada foi limpo.");
    return;
  }

  await limpar(client, profile.org_id as string);
  await client.auth.signOut();
}
