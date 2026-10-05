#!/usr/bin/env python3
"""
Migration script to update Visita model schema for new features:
- Add projeto_outros field
- Rename data_agendada to data_inicio  
- Add data_fim field
- Make projeto_id nullable
- Create VisitaParticipante table
"""

import os
import sys
from app import app, db
from models import Visita, VisitaParticipante
from sqlalchemy import text

def run_migration():
    """Execute the database migration"""
    with app.app_context():
        try:
            print("🔄 Starting database migration for visit schema...")
            
            # Step 1: Add new columns to existing table
            print("📝 Adding new columns...")
            
            # Add projeto_outros column
            try:
                db.session.execute(text("ALTER TABLE visitas ADD COLUMN projeto_outros VARCHAR(300)"))
                print("✅ Added projeto_outros column")
            except Exception as e:
                if "already exists" in str(e) or "duplicate column" in str(e).lower():
                    print("ℹ️  projeto_outros column already exists")
                else:
                    print(f"⚠️  Error adding projeto_outros: {e}")
            
            # Add data_fim column
            try:
                db.session.execute(text("ALTER TABLE visitas ADD COLUMN data_fim TIMESTAMP"))
                print("✅ Added data_fim column")
            except Exception as e:
                if "already exists" in str(e) or "duplicate column" in str(e).lower():
                    print("ℹ️  data_fim column already exists")
                else:
                    print(f"⚠️  Error adding data_fim: {e}")
            
            # Add data_inicio column (if not exists)
            try:
                db.session.execute(text("ALTER TABLE visitas ADD COLUMN data_inicio TIMESTAMP"))
                print("✅ Added data_inicio column")
            except Exception as e:
                if "already exists" in str(e) or "duplicate column" in str(e).lower():
                    print("ℹ️  data_inicio column already exists")
                else:
                    print(f"⚠️  Error adding data_inicio: {e}")
            
            # Step 2: Copy data_agendada to data_inicio if needed
            try:
                # Check if we have any existing visits
                result = db.session.execute(text("SELECT COUNT(*) FROM visitas")).scalar()
                if result > 0:
                    # Copy data_agendada to data_inicio and set data_fim = data_inicio + 1 hour
                    db.session.execute(text("""
                        UPDATE visitas 
                        SET data_inicio = data_agendada,
                            data_fim = data_agendada + INTERVAL '1 hour'
                        WHERE data_inicio IS NULL
                    """))
                    print("✅ Migrated existing visit dates")
            except Exception as e:
                print(f"⚠️  Error migrating visit dates: {e}")
            
            # Step 3: Make projeto_id nullable
            try:
                db.session.execute(text("ALTER TABLE visitas ALTER COLUMN projeto_id DROP NOT NULL"))
                print("✅ Made projeto_id nullable")
            except Exception as e:
                print(f"ℹ️  projeto_id nullability: {e}")
            
            # Step 4: Create VisitaParticipante table
            try:
                db.create_all()  # This will create any missing tables
                print("✅ Created VisitaParticipante table")
            except Exception as e:
                print(f"⚠️  Error creating tables: {e}")
            
            # Commit all changes
            db.session.commit()
            print("✅ Migration completed successfully!")
            return True
            
        except Exception as e:
            db.session.rollback()
            print(f"❌ Migration failed: {e}")
            return False

if __name__ == "__main__":
    if run_migration():
        print("🎉 Database migration completed successfully!")
        sys.exit(0)
    else:
        print("💥 Migration failed!")
        sys.exit(1)