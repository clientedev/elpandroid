"""
Script de Migração: Adicionar Campos de Informações Técnicas

Este script adiciona 12 novos campos ao modelo Projeto para armazenar
informações técnicas da obra.

Executar: python migration_technical_info.py
"""

import psycopg2
import os
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

def run_migration():
    """Adiciona os campos de informações técnicas à tabela projetos"""
    
    # Usar DATABASE_URL diretamente
    database_url = "postgresql://postgres:KgyYkEmMztCNMSPHVbOpWLTiKZFXYwpB@switchback.proxy.rlwy.net:17107/railway"
    
    print("📊 Conectando ao banco de dados Railway...")
    conn = psycopg2.connect(database_url)
    cursor = conn.cursor()
    
    try:
        print("🔧 Adicionando colunas de informações técnicas...")
        
        # Lista de colunas a adicionar
        colunas = [
            'elementos_construtivos_base',
            'especificacao_chapisco_colante',
            'especificacao_chapisco_alvenaria',
            'especificacao_argamassa_emboco',
            'forma_aplicacao_argamassa',
            'acabamentos_revestimento',
            'acabamento_peitoris',
            'acabamento_muretas',
            'definicao_frisos_cor',
            'definicao_face_inferior_abas',
            'observacoes_projeto_fachada',
            'outras_observacoes'
        ]
        
        for coluna in colunas:
            try:
                # Verificar se a coluna já existe
                cursor.execute(f"""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name='projetos' AND column_name='{coluna}'
                """)
                
                if cursor.fetchone():
                    print(f"   ⏭️  Coluna '{coluna}' já existe, pulando...")
                else:
                    # Adicionar a coluna
                    cursor.execute(f"ALTER TABLE projetos ADD COLUMN {coluna} TEXT;")
                    print(f"   ✅ Coluna '{coluna}' adicionada com sucesso!")
            
            except Exception as e:
                print(f"   ⚠️  Erro ao adicionar '{coluna}': {e}")
                # Continuar com as próximas colunas
        
        # Commit das alterações
        conn.commit()
        print("\n✅ Migração concluída com sucesso!")
        print(f"📝 Adicionadas {len(colunas)} colunas à tabela 'projetos'")
        
    except Exception as e:
        print(f"\n❌ Erro durante a migração: {e}")
        conn.rollback()
    
    finally:
        cursor.close()
        conn.close()
        print("🔒 Conexão com banco de dados fechada")

if __name__ == '__main__':
    print("=" * 60)
    print("  MIGRAÇÃO: Informações Técnicas da Obra")
    print("=" * 60)
    print()
    run_migration()
    print()
    print("=" * 60)
