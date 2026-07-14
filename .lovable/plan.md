## Diagnóstico

Encontrei uma **regressão** introduzida na última migration. A função `handle_new_user()` atual cria apenas o `profiles` — perdeu três comportamentos críticos do template original:

1. ❌ Não insere mais em `public.user_roles`
2. ❌ Não marca o primeiro usuário como `admin`
3. ❌ Não respeita `require_account_approval` (sempre `is_approved=false`)

A `ensure_auth_trigger()` RPC tem a mesma versão truncada — então o "auto-reparo" hoje recria um trigger quebrado.

A Edge Function `bootstrap-profile` (fallback chamado pelo `AuthContext` quando o perfil não existe pós-signup) ainda tem a lógica completa, **mas** ela só roda quando o perfil está ausente. Com o trigger atual criando o perfil sem role, o fallback entra no branch "existing" e atribui `agent` — nunca `admin`. **Resultado: hoje, mesmo sem remix, o primeiro usuário não vira admin.**

## Plano

### 1. Corrigir `handle_new_user()` (migration + RPC)

Nova migration que recria a função com a lógica original:

- Conta `profiles` para detectar `is_first_user`
- Lê `require_account_approval` em `project_config`
- `INSERT INTO profiles` com `is_approved = true se first_user, senão NOT require_approval`
- `INSERT INTO user_roles (user_id, role)` com `'admin'` se first_user, senão `'agent'`
- `ON CONFLICT DO NOTHING` em ambos (idempotente)
- `LOCK TABLE profiles IN SHARE ROW EXCLUSIVE MODE` para evitar race no "primeiro usuário"

A mesma SQL vai dentro de `ensure_auth_trigger()` (o `EXECUTE $ddl$ ... $ddl$`), para que o auto-reparo recrie a versão correta.

### 2. Alinhar `bootstrap-profile`

Hoje, quando o perfil já existe sem role, ele insere `agent`. Mudar para:
- Se não há role **e** é o único profile → inserir `admin`
- Caso contrário → `agent`

Garante que mesmo um cenário de "trigger criou profile mas falhou em user_roles" ainda eleve o primeiro usuário a admin.

### 3. Diagnóstico observável de remix

Estender `ensure-auth-trigger` (Edge Function) para retornar um payload de health-check além de `ok/created`:

```json
{
  "ok": true,
  "trigger": { "exists": true, "name": "on_auth_user_created" },
  "function": { "exists": true, "assignsAdmin": true, "insertsRole": true },
  "counts": { "profiles": 0, "admins": 0 }
}
```

`assignsAdmin` é verificado fazendo `pg_get_functiondef` da `handle_new_user` e checando se contém `'admin'::app_role`. Se `false`, a função sabe que está rodando uma versão antiga e chama `ensure_auth_trigger()` para recriar.

### 4. Painel de diagnóstico em Configurações → Segurança

Card novo "Estado do sistema de auth" (visível só para admin), que chama `ensure-auth-trigger` e mostra:

- ✓/✗ Trigger `on_auth_user_created` instalado
- ✓/✗ Função atribui admin ao primeiro usuário
- Total de perfis · Total de admins
- Botão "Revalidar" (re-executa a check)
- Aviso vermelho se algo estiver fora do esperado, com instrução de rodar a migration

Isso responde diretamente à sua pergunta: **abre Configurações → Segurança após o remix e vê 4 checks verdes antes de cadastrar o primeiro usuário.**

### 5. Procedimento de validação manual (README)

Adicionar seção "Validar remix em 30 segundos":

1. Após remix, abra `/settings/security` (faça login com qualquer conta de teste se necessário) → todos os checks devem estar verdes
2. Apague os usuários de teste no painel da Cloud (Auth → Users)
3. Vá em `/auth`, cadastre o primeiro usuário
4. Confirme: login direto (sem tela de aprovação) + menu Configurações visível = admin ✓

## Detalhes técnicos

- Migration nova: `..._restore_handle_new_user.sql` — não edita as anteriores, apenas substitui a função
- A RPC `ensure_auth_trigger` continua restrita a `service_role`
- `bootstrap-profile` ganha uma checagem extra `count(profiles) = 1 AND user_id = caller` para o caso admin
- O check `assignsAdmin` na Edge Function usa `admin.rpc('get_handle_new_user_def')` — uma RPC `SECURITY DEFINER` nova que retorna `pg_get_functiondef('public.handle_new_user'::regproc)` (revogada de anon/authenticated)
- Painel em React: novo componente `AuthHealthCard` consumido em `SecuritySettings.tsx`, com `useQuery` + botão de refetch

## Arquivos afetados

- `supabase/migrations/<ts>_restore_handle_new_user.sql` (novo)
- `supabase/functions/ensure-auth-trigger/index.ts` (estender resposta)
- `supabase/functions/bootstrap-profile/index.ts` (corrigir branch existing-sem-role)
- `src/components/settings/AuthHealthCard.tsx` (novo)
- `src/components/settings/SecuritySettings.tsx` (montar o card)
- `README.md` (seção de validação)
