## Objetivo

Resolver os 2 findings críticos que estão bloqueando o publish do frontend, aplicando a migração de hardening que já existe no repositório (`supabase/migrations/20260729100001_hardening_seguranca.sql`) mas ainda não rodou no banco.

## Estado atual (verificado agora)

- `storage.buckets` → `whatsapp-media` ainda está com `public = true`.
- `pg_policies` em `capture_forms` ainda tem a policy `capture_forms_public_read` para o role `anon`.
- A migração `20260729100001_hardening_seguranca.sql` já contém a correção de ambos (mais um endurecimento em `zernio_configs`), mas não foi aplicada.

## Passos

1. **whatsapp-media privado** — `supabase--storage_update_bucket(name="whatsapp-media", public=false)`. Bucket está vazio e nenhum código de runtime usa URL pública dele, então não há regressão a esperar.
2. **Policies** — aplicar o conteúdo da migração de hardening via `supabase--migration`:
   - Recria as policies do bucket `whatsapp-media` escopadas por `org_id` (leitura/escrita para membros da org, exclusão só para admin).
   - Remove a policy `capture_forms_public_read` de `anon`. A `PublicFormPage` lê pela edge function `submit-capture-form` (service role), então não há consumidor legítimo dessa leitura anônima.
   - Endurece `zernio_configs` para admin only (já vem no arquivo; guarda api_key e webhook_secret).
3. **Marcar os findings como corrigidos** via `security--manage_security_finding`, com a explicação do que foi feito.
4. **Rodar o scan de novo** (`security--run_security_scan`) para confirmar que os críticos sumiram.
5. **Publicar o frontend** com `preview_ui--publish`.

## Fora de escopo

- Não altero código de aplicação — a UI ainda não consome mídia do bucket, nenhum caminho quebra.
- Não mexo no bucket `avatars` nem nos findings `warn` que não bloqueavam o publish.
- Não toco em `supabase/config.toml`, edge functions, nem em schema além do que a migração traz.

## Detalhes técnicos

- O `UPDATE storage.buckets SET public = false` da migração não pode ser executado pelo pipeline de migration; por isso o passo 1 usa o tool dedicado e a migração enviada conterá apenas o bloco de policies (`storage.objects`, `capture_forms`, `zernio_configs`). Efeito final idêntico ao arquivo do repo.
- Convenção de caminho imposta pelo RLS: `<org_id>/<resto>`. Quando a mídia for implementada, a UI precisará de `createSignedUrl`, não link direto.
