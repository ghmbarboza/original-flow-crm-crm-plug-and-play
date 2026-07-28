-- =====================================================
-- FlowCRM 2.0 — Endurecimento de segurança (pré-publish)
--
-- Três correções apontadas pelo scanner do Lovable e pela auditoria manual,
-- em ordem de gravidade real (não a ordem que o scanner reportou).
-- =====================================================


-- -----------------------------------------------------
-- 1. zernio_configs — leitura restrita a admin
--
-- ESTE É O MAIS GRAVE E O SCANNER NÃO PEGOU. A tabela guarda api_key e
-- webhook_secret da conta Zernio, mas a policy de leitura exigia apenas
-- pertencer à organização: qualquer agente comum lia a credencial que dá
-- acesso à mensageria inteira da empresa.
--
-- As tabelas irmãs (evolution_configs, meta_configs) já exigiam admin. O
-- scanner não acusou porque procura falta de isolamento entre organizações,
-- e o isolamento existia — o que faltava era menor privilégio.
--
-- De quebra troca a subquery inline em profiles pelos helpers do projeto:
-- user_belongs_to_org() é SECURITY DEFINER e não recursa no RLS de profiles.
-- E troca o role {public} por {authenticated}: com {public} a policy também é
-- avaliada para anon, e a proteção passa a depender inteiramente de auth.uid()
-- ser NULL — defesa correta hoje, mas frágil de propósito.
-- -----------------------------------------------------
DROP POLICY IF EXISTS "zernio_configs_read" ON public.zernio_configs;
DROP POLICY IF EXISTS "zernio_configs_write" ON public.zernio_configs;

-- Uma policy só, ALL, no mesmo formato de evolution_configs e meta_configs.
DROP POLICY IF EXISTS "org_admins_all" ON public.zernio_configs;
CREATE POLICY "org_admins_all" ON public.zernio_configs
  FOR ALL TO authenticated
  USING (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), 'admin'::public.app_role));


-- -----------------------------------------------------
-- 2. whatsapp-media — bucket privado, caminhos escopados por organização
--
-- O bucket era público e a policy de SELECT era `TO public` checando só o
-- bucket_id: qualquer pessoa com a URL lia mídia de conversa de qualquer
-- cliente, sem sessão. O finding do scanner é real.
--
-- O relato do scanner não mencionou o lado da ESCRITA, que é igualmente
-- quebrado: INSERT exigia apenas estar autenticado, sem escopo de organização.
-- Qualquer usuário de qualquer org podia gravar em qualquer caminho. Corrigir
-- só a leitura deixaria isso de pé.
--
-- CONTEXTO QUE TORNA ISSO BARATO: o bucket está vazio (0 objetos), nenhuma
-- mensagem tem media_url preenchido e nenhuma linha de src/ ou
-- supabase/functions/ o referencia. Estamos acertando o desenho antes de
-- existir mídia, em vez de migrar arquivos e URLs depois.
--
-- CONVENÇÃO DE CAMINHO: <org_id>/<resto...>. A primeira pasta é a organização
-- dona do arquivo e é ela que o RLS compara — não é convenção de cliente, é
-- imposta no servidor.
--
-- CONSEQUÊNCIA PARA QUEM FOR IMPLEMENTAR MÍDIA: bucket privado significa que a
-- UI precisa de URL assinada (createSignedUrl), não de link direto. Gravar em
-- caminho sem o org_id na frente vai falhar no RLS.
-- -----------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'whatsapp-media';

DROP POLICY IF EXISTS "whatsapp media public read" ON storage.objects;
DROP POLICY IF EXISTS "whatsapp media authenticated write" ON storage.objects;

DROP POLICY IF EXISTS "whatsapp_media_org_read" ON storage.objects;
CREATE POLICY "whatsapp_media_org_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
  );

DROP POLICY IF EXISTS "whatsapp_media_org_write" ON storage.objects;
CREATE POLICY "whatsapp_media_org_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- Sem DELETE não havia como remover mídia nenhuma — o bucket só acumularia.
-- Restrito a admin: apagar mídia de conversa é ação destrutiva e auditável.
DROP POLICY IF EXISTS "whatsapp_media_admin_delete" ON storage.objects;
CREATE POLICY "whatsapp_media_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );


-- -----------------------------------------------------
-- 3. capture_forms — remove a leitura anônima
--
-- DESVIO DELIBERADO DO PLANO: o plano pedia uma view com os campos de
-- renderização e a PublicFormPage apontando para ela. Ao verificar, a premissa
-- não se sustenta — a PublicFormPage NÃO lê capture_forms. Ela chama a edge
-- function submit-capture-form (action=get), que roda com service role e já
-- devolve apenas { name, fields }. Os UUIDs internos nunca saem da function.
--
-- Ou seja: a policy anônima abaixo não tinha um único consumidor. Criar a view
-- resolveria o finding, mas adicionaria um caminho de leitura que nada usa —
-- mais superfície para proteger, não menos. Remover a policy fecha o vazamento
-- por completo e não deixa código órfão.
--
-- O acesso autenticado continua pela policy org_members_all, que é o que o
-- useCaptureForms usa na tela de Configurações.
--
-- SE UM DIA a página passar a ler direto do banco, a view volta a ser a
-- resposta certa — mas aí com um consumidor de verdade.
-- -----------------------------------------------------
DROP POLICY IF EXISTS "capture_forms_public_read" ON public.capture_forms;
