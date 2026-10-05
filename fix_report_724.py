from app import app, db
from models import Relatorio
from datetime import timedelta

def fix_report_724():
    with app.app_context():
        report = Relatorio.query.get(724)
        if report:
            print(f"Current created_at for report 724: {report.created_at}")
            # Subtract 3 hours to convert from UTC to BRT (naive)
            report.created_at = report.created_at - timedelta(hours=3)
            # Also fix data_relatorio if it was also affected
            if report.data_relatorio:
                print(f"Current data_relatorio: {report.data_relatorio}")
                report.data_relatorio = report.data_relatorio - timedelta(hours=3)
            
            db.session.commit()
            print(f"Updated created_at for report 724: {report.created_at}")
        else:
            print("Report 724 not found.")

if __name__ == "__main__":
    fix_report_724()
