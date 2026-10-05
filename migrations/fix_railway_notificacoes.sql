-- Migration para corrigir a tabela notificacoes no banco Railway
-- Execute este arquivo diretamente no banco de dados Railway
-- Data: 2025-10-31

-- Verificar se as colunas já existem antes de adicionar
DO $$ 
BEGIN
    -- Adicionar coluna email_enviado se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notificacoes' AND column_name = 'email_enviado'
    ) THEN
        ALTER TABLE notificacoes ADD COLUMN email_enviado BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Coluna email_enviado adicionada com sucesso';
    ELSE
        RAISE NOTICE 'Coluna email_enviado já existe';
    END IF;

    -- Adicionar coluna email_sucesso se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notificacoes' AND column_name = 'email_sucesso'
    ) THEN
        ALTER TABLE notificacoes ADD COLUMN email_sucesso BOOLEAN;
        RAISE NOTICE 'Coluna email_sucesso adicionada com sucesso';
    ELSE
        RAISE NOTICE 'Coluna email_sucesso já existe';
    END IF;

    -- Adicionar coluna email_erro se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notificacoes' AND column_name = 'email_erro'
    ) THEN
        ALTER TABLE notificacoes ADD COLUMN email_erro TEXT;
        RAISE NOTICE 'Coluna email_erro adicionada com sucesso';
    ELSE
        RAISE NOTICE 'Coluna email_erro já existe';
    END IF;

    -- Adicionar coluna push_enviado se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notificacoes' AND column_name = 'push_enviado'
    ) THEN
        ALTER TABLE notificacoes ADD COLUMN push_enviado BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Coluna push_enviado adicionada com sucesso';
    ELSE
        RAISE NOTICE 'Coluna push_enviado já existe';
    END IF;

    -- Adicionar coluna push_sucesso se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notificacoes' AND column_name = 'push_sucesso'
    ) THEN
        ALTER TABLE notificacoes ADD COLUMN push_sucesso BOOLEAN;
        RAISE NOTICE 'Coluna push_sucesso adicionada com sucesso';
    ELSE
        RAISE NOTICE 'Coluna push_sucesso já existe';
    END IF;

    -- Adicionar coluna push_erro se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notificacoes' AND column_name = 'push_erro'
    ) THEN
        ALTER TABLE notificacoes ADD COLUMN push_erro TEXT;
        RAISE NOTICE 'Coluna push_erro adicionada com sucesso';
    ELSE
        RAISE NOTICE 'Coluna push_erro já existe';
    END IF;

END $$;

-- Verificar colunas após migration
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'notificacoes' 
ORDER BY ordinal_position;
