from app import app, db
from models import RelatorioExpress
from sqlalchemy import text

def check_express_reports():
    with app.app_context():
        print("--- Checking Last 5 RelatorioExpress Records ---")
        reports = RelatorioExpress.query.order_by(RelatorioExpress.id.desc()).limit(5).all()
        
        for r in reports:
            print(f"ID: {r.id} | Num: {r.numero} | CreatedAt: {r.created_at} (Type: {type(r.created_at)})")

if __name__ == "__main__":
    check_express_reports()
