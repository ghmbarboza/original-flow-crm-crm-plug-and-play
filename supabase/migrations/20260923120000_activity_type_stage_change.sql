-- Histórico automático do negócio (23/09/2026), parte 1 de 2.
--
-- Valor novo no enum de atividades: 'stage_change' é a entrada que o banco
-- grava sozinho quando o negócio muda de etapa ou de status. Fica em arquivo
-- próprio porque um valor de enum recém-adicionado não pode ser usado na mesma
-- transação em que foi criado.
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'stage_change';
