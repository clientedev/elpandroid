-- Migration: Add acompanhantes column to relatorios table
-- Created: 2025-10-29
-- Description: Adds JSONB column to store visit attendees information

-- Add acompanhantes column (JSONB for PostgreSQL)
ALTER TABLE relatorios 
ADD COLUMN IF NOT EXISTS acompanhantes JSONB;

-- Add comment to column
COMMENT ON COLUMN relatorios.acompanhantes IS 'JSONB array storing visit attendees: [{"nome": "Name", "funcao": "Role", "origem": "Source"}]';

-- Verificação
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'relatorios' AND column_name = 'acompanhantes';
