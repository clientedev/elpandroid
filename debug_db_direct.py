import psycopg2
import os
import json

db_url = "postgresql://postgres:KgyYkEmMztCNMSPHVbOpWLTiKZFXYwpB@switchback.proxy.rlwy.net:17107/railway"

try:
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("SELECT id, informacoes_tecnicas FROM relatorios_express WHERE id = 56;")
    row = cur.fetchone()
    
    if row:
        print(f"Report ID: {row[0]}")
        print(f"Info Tecnicas: {row[1]}")
    else:
        print("Report 56 not found")
        
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
