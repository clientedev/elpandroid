"""
Database migration to add password reset fields to users table.
Run this script once to add the necessary columns for password recovery.
"""
from app import app, db
from sqlalchemy import text

def run_migration():
    """Add reset_token and reset_token_expires columns to users table"""
    with app.app_context():
        try:
            print("🔧 Starting database migration...")
            
            # Add reset_token column
            print("  ➤ Adding reset_token column...")
            db.session.execute(text("""
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS reset_token VARCHAR(100) UNIQUE;
            """))
            
            # Add reset_token_expires column
            print("  ➤ Adding reset_token_expires column...")
            db.session.execute(text("""
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;
            """))
            
            db.session.commit()
            print("✅ Migration completed successfully!")
            print("   - Added reset_token column")
            print("   - Added reset_token_expires column")
            
        except Exception as e:
            db.session.rollback()
            print(f"❌ Migration failed: {e}")
            raise

if __name__ == "__main__":
    print("\n" + "="*60)
    print("Password Recovery Migration")
    print("="*60 + "\n")
    
    run_migration()
    
    print("\n" + "="*60)
    print("Migration Complete - Ready for Testing")
    print("="*60 + "\n")
