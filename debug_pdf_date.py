from app import app, db
from models import Relatorio, RelatorioExpress
import pytz
from datetime import datetime

def debug_dates():
    with app.app_context():
        print("--- Debugging Dates ---")
        
        # Check Helper Logic
        brazil_tz = pytz.timezone('America/Sao_Paulo')
        utc_tz = pytz.UTC
        
        def to_brazil_tz(dt):
            if dt is None: 
                return datetime.now(brazil_tz)
            if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
                # Assuming input is UTC Naive
                print(f"  [Logic] Naive input {dt} -> localizing to UTC")
                dt = utc_tz.localize(dt)
            res = dt.astimezone(brazil_tz)
            print(f"  [Logic] Converted {dt} -> {res}")
            return res

        # Fetch latest common report
        rel = Relatorio.query.order_by(Relatorio.id.desc()).first()
        if rel:
            print(f"\nLast Relatorio ({rel.numero}):")
            print(f"  created_at (Raw): {rel.created_at} (Type: {type(rel.created_at)})")
            if rel.created_at:
                print("  Applying conversion:")
                conv = to_brazil_tz(rel.created_at)
                print(f"  Result: {conv.strftime('%d/%m/%Y %H:%M')}")
        
        # Fetch latest express report
        exp = RelatorioExpress.query.order_by(RelatorioExpress.id.desc()).first()
        if exp:
            print(f"\nLast RelatorioExpress ({exp.numero}):")
            print(f"  created_at (Raw): {exp.created_at}")
            if exp.created_at:
                print("  Applying conversion:")
                conv = to_brazil_tz(exp.created_at)
                print(f"  Result: {conv.strftime('%d/%m/%Y %H:%M')}")

if __name__ == "__main__":
    debug_dates()
