"""
Migration script to update fotos_relatorio table:
1. Convert anotacoes_dados and coordenadas_anotacao from TEXT to JSONB
2. Clean up invalid JSON data like "[object Object]"
3. Ensure all existing data is valid JSON or NULL
"""

import logging
from app import app, db
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)

def migrate_fotos_json_fields():
    """Migrate fotos_relatorio to use JSONB for JSON fields"""
    with app.app_context():
        try:
            logging.info("🔧 Starting migration of fotos_relatorio JSON fields...")
            
            # Step 1: Clean up invalid JSON data
            logging.info("Step 1: Cleaning up invalid JSON data...")
            
            # Find and fix invalid JSON entries
            invalid_patterns = [
                '[object Object]',
                'undefined',
                'null',
                '',
                'NaN'
            ]
            
            for pattern in invalid_patterns:
                # Fix anotacoes_dados
                result = db.session.execute(
                    text("UPDATE fotos_relatorio SET anotacoes_dados = NULL WHERE anotacoes_dados = :pattern"),
                    {"pattern": pattern}
                )
                if result.rowcount > 0:
                    logging.info(f"   ✓ Cleaned {result.rowcount} anotacoes_dados with pattern: {pattern}")
                
                # Fix coordenadas_anotacao
                result = db.session.execute(
                    text("UPDATE fotos_relatorio SET coordenadas_anotacao = NULL WHERE coordenadas_anotacao = :pattern"),
                    {"pattern": pattern}
                )
                if result.rowcount > 0:
                    logging.info(f"   ✓ Cleaned {result.rowcount} coordenadas_anotacao with pattern: {pattern}")
            
            db.session.commit()
            
            # Step 2: Try to parse remaining text as JSON and fix if needed
            logging.info("Step 2: Validating remaining JSON data...")
            
            # Get all non-null anotacoes_dados
            result = db.session.execute(
                text("SELECT id, anotacoes_dados FROM fotos_relatorio WHERE anotacoes_dados IS NOT NULL AND anotacoes_dados != ''")
            )
            
            import json
            fixed_count = 0
            for row in result:
                foto_id, anotacoes = row
                try:
                    # Try to parse as JSON
                    json.loads(anotacoes)
                except (json.JSONDecodeError, TypeError):
                    # Invalid JSON, set to NULL
                    db.session.execute(
                        text("UPDATE fotos_relatorio SET anotacoes_dados = NULL WHERE id = :id"),
                        {"id": foto_id}
                    )
                    fixed_count += 1
            
            if fixed_count > 0:
                logging.info(f"   ✓ Set {fixed_count} invalid anotacoes_dados to NULL")
            
            # Same for coordenadas_anotacao
            result = db.session.execute(
                text("SELECT id, coordenadas_anotacao FROM fotos_relatorio WHERE coordenadas_anotacao IS NOT NULL AND coordenadas_anotacao != ''")
            )
            
            fixed_count = 0
            for row in result:
                foto_id, coordenadas = row
                try:
                    json.loads(coordenadas)
                except (json.JSONDecodeError, TypeError):
                    db.session.execute(
                        text("UPDATE fotos_relatorio SET coordenadas_anotacao = NULL WHERE id = :id"),
                        {"id": foto_id}
                    )
                    fixed_count += 1
            
            if fixed_count > 0:
                logging.info(f"   ✓ Set {fixed_count} invalid coordenadas_anotacao to NULL")
            
            db.session.commit()
            
            # Step 3: Alter table columns to JSONB (PostgreSQL specific)
            logging.info("Step 3: Converting columns to JSONB type...")
            
            try:
                # Check if we're using PostgreSQL
                db.session.execute(text("SELECT version()"))
                
                # Convert anotacoes_dados to JSONB
                db.session.execute(
                    text("ALTER TABLE fotos_relatorio ALTER COLUMN anotacoes_dados TYPE JSONB USING anotacoes_dados::jsonb")
                )
                logging.info("   ✓ Converted anotacoes_dados to JSONB")
                
                # Convert coordenadas_anotacao to JSONB  
                db.session.execute(
                    text("ALTER TABLE fotos_relatorio ALTER COLUMN coordenadas_anotacao TYPE JSONB USING coordenadas_anotacao::jsonb")
                )
                logging.info("   ✓ Converted coordenadas_anotacao to JSONB")
                
                db.session.commit()
                
            except Exception as e:
                if "SQLite" in str(e) or "sqlite" in str(e):
                    logging.info("   ℹ️ SQLite detected - JSONB conversion not needed (using JSON type)")
                    db.session.rollback()
                else:
                    raise
            
            logging.info("✅ Migration completed successfully!")
            return True
            
        except Exception as e:
            logging.error(f"❌ Migration failed: {e}")
            db.session.rollback()
            return False

if __name__ == '__main__':
    migrate_fotos_json_fields()
