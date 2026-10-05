from app import app, db
from models import RelatorioExpress
from sqlalchemy import text
import datetime

def check_express_reports_deep():
    with app.app_context():
        print(f"--- Checking RelatorioExpress (Now: {datetime.datetime.now()}) ---")
        # Get last 10
        reports = RelatorioExpress.query.order_by(RelatorioExpress.id.desc()).limit(10).all()
        
        for r in reports:
            created_val = r.created_at
            data_rel_val = r.data_relatorio
            
            print(f"ID: {r.id} | Num: {r.numero}")
            print(f"  > CreatedAt: {created_val} ({type(created_val)})")
            print(f"  > DataRel:   {data_rel_val} ({type(data_rel_val)})")
            
            if created_val is None:
                print("  !!! ALERT: CreatedAt is NONE !!!")
            elif isinstance(created_val, datetime.datetime) and created_val.hour == 0 and created_val.minute == 0:
                 print("  !!! ALERT: CreatedAt is DATE ONLY (Midnight) !!!")

if __name__ == "__main__":
    check_express_reports_deep()
