
#!/usr/bin/env python3
"""
Script de teste para verificar se imagens estão sendo salvas no PostgreSQL Railway
"""

from app import app, db
from models import FotoRelatorio
from sqlalchemy import text

def test_postgresql_image_save():
    with app.app_context():
        print("🔍 TESTE: Verificando imagens no PostgreSQL Railway\n")
        
        # Query SQL direta
        sql = text("""
            SELECT 
                id, 
                relatorio_id,
                filename,
                LENGTH(imagem) as imagem_size,
                imagem_hash,
                content_type,
                created_at
            FROM fotos_relatorio 
            ORDER BY id DESC 
            LIMIT 10
        """)
        
        resultados = db.session.execute(sql).fetchall()
        
        print(f"📊 Total de registros encontrados: {len(resultados)}\n")
        
        for row in resultados:
            status = "✅ COM IMAGEM" if row.imagem_size and row.imagem_size > 0 else "❌ SEM IMAGEM"
            print(f"ID: {row.id}")
            print(f"  - Relatório: {row.relatorio_id}")
            print(f"  - Arquivo: {row.filename}")
            print(f"  - Tamanho imagem: {row.imagem_size or 0} bytes")
            print(f"  - Hash: {row.imagem_hash or 'N/A'}")
            print(f"  - Content-Type: {row.content_type or 'N/A'}")
            print(f"  - Status: {status}")
            print(f"  - Criado: {row.created_at}")
            print()
        
        # Estatísticas
        total_query = text("SELECT COUNT(*) as total FROM fotos_relatorio")
        com_imagem_query = text("SELECT COUNT(*) as total FROM fotos_relatorio WHERE imagem IS NOT NULL AND LENGTH(imagem) > 0")
        
        total = db.session.execute(total_query).scalar()
        com_imagem = db.session.execute(com_imagem_query).scalar()
        sem_imagem = total - com_imagem
        
        print("=" * 60)
        print("📈 ESTATÍSTICAS POSTGRESQL RAILWAY:")
        print(f"  - Total de fotos: {total}")
        print(f"  - Com imagem (BYTEA): {com_imagem}")
        print(f"  - Sem imagem: {sem_imagem}")
        print(f"  - Taxa de sucesso: {(com_imagem/total*100) if total > 0 else 0:.1f}%")
        print("=" * 60)

if __name__ == '__main__':
    test_postgresql_image_save()
