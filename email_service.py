import os
import requests
from flask import current_app

class EmailServiceRelatorio:
    def __init__(self):
        self.api_key = os.getenv("RESEND_API_KEY")
        self.from_email = os.getenv("RESEND_FROM_EMAIL", "relatorios@elpconsultoria.eng.br")
        self.api_url = "https://api.resend.com/emails"

        print("🟢 Inicializando EmailServiceRelatorio...")
        if not self.api_key:
            print("❌ ERRO: RESEND_API_KEY não encontrada nas variáveis de ambiente.")
        else:
            print(f"✅ RESEND_API_KEY detectada (início): {self.api_key[:10]}...")

        print(f"📧 E-mails serão enviados de: {self.from_email}")

    def enviar_relatorio_por_email(self, relatorio_id, destinatarios, assunto, corpo_html, pdf_path):
        """Envia e-mail via Resend com anexo PDF"""
        print(f"📤 Iniciando envio de e-mail do relatório {relatorio_id} para {destinatarios}")

        try:
            import base64
            
            # Ler PDF e converter para base64
            with open(pdf_path, "rb") as pdf_file:
                pdf_bytes = pdf_file.read()
                pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')

            # Preparar payload JSON conforme API Resend v2
            payload = {
                "from": f"ELP Consultoria <{self.from_email}>",
                "to": destinatarios,  # Lista direta
                "subject": assunto,
                "html": corpo_html,
                "attachments": [
                    {
                        "filename": f"relatorio_{relatorio_id}.pdf",
                        "content": pdf_base64
                    }
                ]
            }

            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }

            response = requests.post(self.api_url, headers=headers, json=payload, timeout=30)

            if response.status_code == 200:
                print(f"✅ E-mail do relatório {relatorio_id} enviado com sucesso para {destinatarios}")
                return True
            else:
                print(f"❌ Erro ao enviar e-mail (HTTP {response.status_code}): {response.text}")
                return False

        except Exception as e:
            print(f"💥 Erro inesperado ao enviar e-mail: {e}")
            return False
