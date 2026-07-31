-- Sprint 10A-10 (Parte 10) — Follow-up com mídia.
--
-- Cada etapa da régua pode carregar um anexo: imagem, PDF (document) ou vídeo.
-- Duas origens, mutuamente exclusivas na prática:
--   media_path — arquivo enviado ao bucket whatsapp-media, no caminho
--                <org_id>/followup/<step_id>/<arquivo> (as policies por org do
--                bucket já cobrem esse prefixo). O dispatcher gera signed URL
--                na hora do envio — o bucket é privado.
--   media_url  — URL externa direta.
-- media_filename preserva o nome exibido no preview e enviado como fileName
-- aos provedores.

ALTER TABLE public.followup_steps
  ADD COLUMN IF NOT EXISTS media_path TEXT,
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT
    CHECK (media_type IS NULL OR media_type IN ('image', 'document', 'video')),
  ADD COLUMN IF NOT EXISTS media_filename TEXT;
