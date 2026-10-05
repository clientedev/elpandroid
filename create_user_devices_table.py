"""
Script to create user_devices table directly in PostgreSQL database
Run this to bypass Alembic migration issues
"""
import psycopg2

# Database connection
DATABASE_URL = "postgresql://postgres:KgyYkEmMztCNMSPHVbOpWLTiKZFXYwpB@switchback.proxy.rlwy.net:17107/railway"

def create_user_devices_table():
    try:
        # Connect to database
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        print("🔌 Connected to PostgreSQL database")
        
        # Create table
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS user_devices (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            player_id VARCHAR(255) NOT NULL UNIQUE,
            device_info TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_user_devices_user FOREIGN KEY (user_id) 
                REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT uq_user_player UNIQUE (user_id, player_id)
        );
        """
        
        cursor.execute(create_table_sql)
        print("✅ Table user_devices created successfully")
        
        # Create indexes
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_devices_user_id 
            ON user_devices(user_id);
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_devices_player_id 
            ON user_devices(player_id);
        """)
        print("✅ Indexes created successfully")
        
        # Migrate existing fcm_token data
        migrate_sql = """
        INSERT INTO user_devices (user_id, player_id, device_info)
        SELECT id, fcm_token, 'Migrated from fcm_token column'
        FROM users
        WHERE fcm_token IS NOT NULL 
        AND fcm_token != ''
        AND LENGTH(fcm_token) = 36
        ON CONFLICT (player_id) DO NOTHING;
        """
        
        cursor.execute(migrate_sql)
        migrated_count = cursor.rowcount
        print(f"✅ Migrated {migrated_count} existing devices from fcm_token")
        
        # Commit changes
        conn.commit()
        
        # Verify
        cursor.execute("SELECT COUNT(*) FROM user_devices;")
        total_devices = cursor.fetchone()[0]
        print(f"📊 Total devices in table: {total_devices}")
        
        # Show devices per user
        cursor.execute("""
            SELECT u.id, u.nome_completo, COUNT(d.id) as device_count
            FROM users u
            LEFT JOIN user_devices d ON d.user_id = u.id
            GROUP BY u.id, u.nome_completo
            HAVING COUNT(d.id) > 0
            ORDER BY device_count DESC;
        """)
        
        print("\n📱 Devices per user:")
        for row in cursor.fetchall():
            print(f"   User {row[0]} ({row[1]}): {row[2]} device(s)")
        
        cursor.close()
        conn.close()
        
        print("\n🎉 SUCCESS! Table created and data migrated!")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    create_user_devices_table()
