from app import app, db
from models import Relatorio, RelatorioExpress
from sqlalchemy import text
import sys

def fix_dates():
    with app.app_context():
        print("--- Migrating Report Dates to Brazil Time ---")
        print("Disconnecting UTC assumption. Subtracting 3 hours from existing records.")
        
        try:
            # Using raw SQL for efficiency and clarity
            sql_rel = text("UPDATE relatorios SET created_at = created_at - INTERVAL '3 hours';")
            result_rel = db.session.execute(sql_rel)
            print(f"✅ Relatorios updated: {result_rel.rowcount} rows affected (if supported)")
            
            sql_exp = text("UPDATE relatorios_express SET created_at = created_at - INTERVAL '3 hours';")
            result_exp = db.session.execute(sql_exp)
            print(f"✅ Relatorios Express updated: {result_exp.rowcount} rows affected (if supported)")
            
            db.session.commit()
            print("🚀 Successfully migrated dates!")
            
        except Exception as e:
            db.session.rollback()
            print(f"❌ Error during migration: {e}")
            sys.exit(1)

if __name__ == "__main__":
    # Prompt for confirmation
    print("⚠️  This script subtracts 3 hours from ALL reports 'created_at'.")
    print("Run this ONLY ONCE after changing default to brazil_now.")
    # In agent mode, I skip interactive confirmation
    fix_dates()
