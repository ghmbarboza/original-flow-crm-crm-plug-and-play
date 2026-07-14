-- Bucket de avatars (foto de perfil) + políticas RLS de Storage.
-- Público para leitura; escrita restrita ao próprio usuário no prefixo {user.id}/*.

-- 1. Cria o bucket "avatars" com acesso público (idempotente).
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Leitura pública dos arquivos do bucket.
DROP POLICY IF EXISTS "Avatars são publicamente acessíveis" ON storage.objects;
CREATE POLICY "Avatars são publicamente acessíveis"
ON storage.objects
FOR SELECT
USING (bucket_id = 'avatars');

-- 3. Upload restrito ao próprio usuário: o primeiro segmento do caminho
--    deve ser o auth.uid() (ex.: "{user.id}/avatar.png").
DROP POLICY IF EXISTS "Usuários podem enviar o próprio avatar" ON storage.objects;
CREATE POLICY "Usuários podem enviar o próprio avatar"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Update (necessário para upsert) restrito ao próprio usuário.
DROP POLICY IF EXISTS "Usuários podem atualizar o próprio avatar" ON storage.objects;
CREATE POLICY "Usuários podem atualizar o próprio avatar"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. Delete do próprio avatar (ex.: ao trocar de extensão).
DROP POLICY IF EXISTS "Usuários podem remover o próprio avatar" ON storage.objects;
CREATE POLICY "Usuários podem remover o próprio avatar"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
