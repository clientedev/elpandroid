from app import app, db
from models import RelatorioExpress
import json

with app.app_context():
    report = RelatorioExpress.query.get(56)
    if report:
        print(f"Report ID: {report.id}")
        print(f"Info Tecnicas (Raw): {report.informacoes_tecnicas}")
        print(f"Info Tecnicas Type: {type(report.informacoes_tecnicas)}")
    else:
        print("Report 56 not found")
