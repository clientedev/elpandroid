"""
Serviço de envio de e-mail via Resend API para relatórios aprovados.
Substitui yagmail com HTTP POST para Resend em thread daemon.
"""
import os
import json
import base64
import requests
import threading
from datetime import datetime
from flask import current_app


class ReportApprovalEmailService:
    """Serviço de envio de e-mails via Resend API"""
    
    def __init__(self):
        # Tentar carregar da variável de ambiente primeiro
        self.api_key = os.getenv('RESEND_API_KEY')
        
        # Se não encontrar, usar como fallback (será removido após verificação)
        if not self.api_key:
            self.api_key = ''
            current_app.logger.warning(f"⚠️ RESEND_API_KEY não configurada")
        
        self.from_email = os.getenv('RESEND_FROM_EMAIL', 'relatorios@elpconsultoria.eng.br')
        self.resend_endpoint = "https://api.resend.com/emails"
        
        current_app.logger.info(f"📧 Resend Service inicializado")
        current_app.logger.info(f"📮 Email FROM: {self.from_email}")
        current_app.logger.info(f"🔑 API KEY PREVIEW: {self.api_key[:15]}...")
    
    def _get_recipients_for_report(self, relatorio):
        """
        Coleta TODOS os destinatários para envio de relatório.
        Retorna lista de emails únicos.
        
        Destinatários (na ordem):
        1. Criador do relatório (autor)
        2. Aprovador global do relatório
        3. Acompanhantes da visita (via EmailCliente do projeto)
        """
        recipients = set()
        
        try:
            current_app.logger.info(f"\n{'='*60}")
            current_app.logger.info(f"📧 COLETANDO DESTINATÁRIOS PARA ENVIO")
            current_app.logger.info(f"Relatório: {relatorio.numero}")
            current_app.logger.info(f"{'='*60}\n")
            
            # ===== 1. AUTOR DO RELATÓRIO =====
            try:
                autor = relatorio.autor
                if autor and autor.email:
                    recipients.add(autor.email.strip().lower())
                    current_app.logger.info(f"✅ [1] CRIADOR: {autor.nome_completo or autor.username}")
                    current_app.logger.info(f"    📧 {autor.email}")
                else:
                    current_app.logger.warning(f"⚠️ [1] CRIADOR: Sem email")
            except Exception as e:
                current_app.logger.warning(f"⚠️ [1] CRIADOR: Erro - {e}")
            
            # ===== 2. APROVADOR GLOBAL =====
            try:
                aprovador = relatorio.aprovador
                if aprovador and aprovador.email:
                    recipients.add(aprovador.email.strip().lower())
                    current_app.logger.info(f"✅ [2] APROVADOR: {aprovador.nome_completo or aprovador.username}")
                    current_app.logger.info(f"    📧 {aprovador.email}")
                else:
                    current_app.logger.warning(f"⚠️ [2] APROVADOR: Sem email")
            except Exception as e:
                current_app.logger.warning(f"⚠️ [2] APROVADOR: Erro - {e}")

            # ===== 2.1. RESPONSÁVEL DO PROJETO e LEOPOLDO =====
            try:
                # Adicionar Leopoldo (Hardcoded)
                recipients.add('leopoldo@elpconsultoria.eng.br')
                current_app.logger.info(f"✅ [CC] LEOPOLDO: leopoldo@elpconsultoria.eng.br")

                # Adicionar Responsável do Projeto
                if hasattr(relatorio, 'projeto') and relatorio.projeto:
                    resp_id = relatorio.projeto.responsavel_id
                    if resp_id:
                        from models import User
                        resp = User.query.get(resp_id)
                        if resp and resp.email:
                            recipients.add(resp.email.strip().lower())
                            current_app.logger.info(f"✅ [CC] RESPONSÁVEL OBRA: {resp.nome_completo} - {resp.email}")
            except Exception as e:
                current_app.logger.warning(f"⚠️ [CC] Erro ao adicionar responsáveis: {e}")
            
            # ===== 3. ACOMPANHANTES VIA EMAILCLIENTE DO PROJETO =====
            try:
                from models import EmailCliente
                projeto_id = relatorio.projeto_id
                
                acompanhantes = EmailCliente.query.filter_by(
                    projeto_id=projeto_id,
                    ativo=True
                ).all()
                
                if acompanhantes:
                    current_app.logger.info(f"✅ [3] ACOMPANHANTES: Encontrados {len(acompanhantes)}")
                    for acomp in acompanhantes:
                        if acomp.email:
                            email_lower = acomp.email.strip().lower()
                            recipients.add(email_lower)
                            current_app.logger.info(f"    ✅ {acomp.nome_contato} - {acomp.email}")
                else:
                    current_app.logger.info(f"ℹ️ [3] ACOMPANHANTES: Nenhum registrado")
            except Exception as e:
                current_app.logger.error(f"❌ [3] ACOMPANHANTES: Erro - {e}", exc_info=True)
            
            # ===== RESULTADO FINAL =====
            recipients = set(email for email in recipients if '@' in email)
            
            current_app.logger.info(f"\n{'='*60}")
            current_app.logger.info(f"📊 TOTAL DE DESTINATÁRIOS: {len(recipients)}")
            current_app.logger.info(f"{'='*60}\n")
            
            return list(recipients)
        
        except Exception as e:
            current_app.logger.error(f"❌ ERRO ao coletar destinatários: {e}", exc_info=True)
            return []
    
    def _format_email_body(self, nome_destinatario, obra_nome, data_aprovacao, relatorio=None):
        """Formato HTML do corpo do e-mail"""
        if not data_aprovacao:
            data_aprovacao = datetime.now()
        
        data_formatada = data_aprovacao.strftime("%d/%m/%y") if hasattr(data_aprovacao, 'strftime') else str(data_aprovacao)
        numero_rel = getattr(relatorio, 'numero', 'N/A') if relatorio else 'N/A'

        # Identificar responsável da obra para contato
        contato_nome = "Responsável da Obra"
        contato_email = "contato@elpconsultoria.eng.br"
        
        try:
            if relatorio and hasattr(relatorio, 'projeto') and relatorio.projeto:
                resp_id = relatorio.projeto.responsavel_id
                if resp_id:
                    from models import User
                    resp = User.query.get(resp_id)
                    if resp:
                        contato_nome = getattr(resp, 'nome_completo', 'Responsável')
                        contato_email = getattr(resp, 'email', '')
        except Exception as e:
            current_app.logger.warning(f"Erro ao obter responsável para contato: {e}")

        corpo_html = f"""
        <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {{ font-family: Arial, sans-serif; background-color: #f5f5f5; }}
                    .container {{ max-width: 600px; margin: 20px auto; background-color: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
                    .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px; text-align: center; }}
                    .content {{ padding: 20px; line-height: 1.6; color: #333; }}
                    .footer {{ background-color: #f9f9f9; padding: 10px; font-size: 12px; text-align: center; color: #666; border-top: 1px solid #ddd; margin-top: 20px; }}
                    .highlight {{ color: #667eea; font-weight: bold; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>Relatório nº {numero_rel}</h2>
                    </div>
                    <div class="content">
                        <p>Olá <span class="highlight">{nome_destinatario}</span>,</p>
                        <p>Segue em anexo o relatório <span class="highlight">{numero_rel}</span> da obra <span class="highlight">{obra_nome}</span>.</p>
                        <p><strong>Data da visita:</strong> {data_formatada}</p>
                        
                        <p>Este é um e-mail automático; por favor, não responder.</p>
                       
                        <p>Para esclarecimentos, entre em contato com <strong>{contato_nome}</strong> através do e-mail <a href="mailto:{contato_email}">{contato_email}</a>.</p>
                        
                        <p>Atenciosamente,<br><strong>ELP Consultoria</strong></p>
                    </div>
                </div>
            </body>
        </html>
        """
        return corpo_html
    
    def _send_email_with_resend(self, recipient_email, assunto, corpo_html, pdf_base64, pdf_filename):
        """
        Envia um email individual via Resend API.
        Retorna True se sucesso, False caso contrário.
        """
        try:
            payload = {
                "from": self.from_email,
                "to": recipient_email,
                "subject": assunto,
                "html": corpo_html,
                "attachments": [
                    {
                        "filename": pdf_filename,
                        "content": pdf_base64
                    }
                ]
            }
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            response = requests.post(
                self.resend_endpoint,
                json=payload,
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                response_data = response.json()
                email_id = response_data.get('id', 'N/A')
                current_app.logger.info(f"✅ Email enviado para {recipient_email} - ID: {email_id}")
                return True
            else:
                error_msg = response.text if response.text else f"HTTP {response.status_code}"
                current_app.logger.error(f"❌ ERRO ao enviar para {recipient_email}: {error_msg}")
                return False
        
        except Exception as e:
            current_app.logger.error(f"❌ EXCEÇÃO ao enviar para {recipient_email}: {str(e)}", exc_info=True)
            return False
    
    def enviar_relatorio_normal(self, relatorio, pdf_path):
        """
        Envia relatório normal via Resend API para:
        - Criador do relatório (autor)
        - Aprovador global
        - Acompanhantes da visita
        
        Retorna dicionário com resultado do envio.
        """
        try:
            current_app.logger.info(f"\n{'='*60}")
            current_app.logger.info(f"📧 ENVIO DE RELATÓRIO NORMAL via RESEND")
            current_app.logger.info(f"Relatório: {relatorio.numero}")
            current_app.logger.info(f"{'='*60}\n")
            
            # Coleta os destinatários (criador, aprovador, acompanhantes)
            recipients = self._get_recipients_for_report(relatorio)
            
            if not recipients:
                current_app.logger.warning(f"⚠️ Nenhum destinatário para relatório {relatorio.numero}")
                return {
                    'success': False,
                    'sucessos': 0,
                    'falhas': 0,
                    'error': 'Nenhum destinatário encontrado'
                }
            
            # Obter nome da obra
            obra_nome = "Obra"
            if hasattr(relatorio, 'projeto') and relatorio.projeto:
                obra_nome = relatorio.projeto.nome
            elif hasattr(relatorio, 'obra_nome'):
                obra_nome = relatorio.obra_nome or "Obra"
            
            # Verificar PDF
            if not os.path.exists(pdf_path):
                current_app.logger.warning(f"⚠️ PDF não encontrado: {pdf_path}")
                return {
                    'success': False,
                    'sucessos': 0,
                    'falhas': 0,
                    'error': 'PDF não encontrado'
                }
            
            # Ler PDF e converter para base64
            with open(pdf_path, 'rb') as pdf_file:
                pdf_base64 = base64.b64encode(pdf_file.read()).decode('utf-8')
            
            pdf_filename = os.path.basename(pdf_path)
            assunto = f"Relatório da Obra {obra_nome}"
            
            sucessos = 0
            falhas = 0
            
            # Enviar para cada destinatário
            for recipient_email in recipients:
                try:
                    destinatario_nome = recipient_email.split('@')[0]
                    try:
                        from models import User
                        user = User.query.filter_by(email=recipient_email).first()
                        if user and user.nome_completo:
                            destinatario_nome = user.nome_completo
                    except:
                        pass
                    
                    # Corpo do email
                    corpo_html = f"""
                    <html>
                        <head>
                            <meta charset="UTF-8">
                            <style>
                                body {{ font-family: Arial, sans-serif; background-color: #f5f5f5; }}
                                .container {{ max-width: 600px; margin: 20px auto; background-color: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
                                .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px; text-align: center; }}
                                .content {{ padding: 20px; line-height: 1.6; color: #333; }}
                                .footer {{ background-color: #f9f9f9; padding: 10px; font-size: 12px; text-align: center; color: #666; border-top: 1px solid #ddd; margin-top: 20px; }}
                                .highlight {{ color: #667eea; font-weight: bold; }}
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="header">
                                    <h2>📋 Relatório da Obra</h2>
                                </div>
                                <div class="content">
                                    <p>Olá <span class="highlight">{destinatario_nome}</span>,</p>
                                    <p>Segue em anexo o relatório da obra <span class="highlight">{obra_nome}</span>.</p>
                                    <p>O documento contém todas as informações da visita realizada em nossa obra.</p>
                                    <p>Em caso de dúvidas ou necessidade de informações adicionais, por favor entre em contato conosco.</p>
                                    <p>Atenciosamente,<br><strong>ELP Consultoria e Engenharia</strong></p>
                                </div>
                                <div class="footer">
                                    <p>Por favor, não responda este e-mail. Este é um e-mail automático.</p>
                                </div>
                            </div>
                        </body>
                    </html>
                    """
                    
                    current_app.logger.info(f"📤 Enviando para {recipient_email}...")
                    
                    if self._send_email_with_resend(recipient_email, assunto, corpo_html, pdf_base64, pdf_filename):
                        sucessos += 1
                    else:
                        falhas += 1
                
                except Exception as e:
                    falhas += 1
                    current_app.logger.error(f"❌ EXCEÇÃO ao enviar para {recipient_email}: {str(e)}", exc_info=True)
            
            resultado_final = {
                'success': sucessos > 0,
                'sucessos': sucessos,
                'falhas': falhas,
                'error': None if sucessos > 0 else f'Falha ao enviar para {falhas} destinatários'
            }
            
            current_app.logger.info(f"\n{'='*60}")
            current_app.logger.info(f"📊 RESULTADO FINAL")
            current_app.logger.info(f"{'='*60}")
            current_app.logger.info(f"✅ Sucessos: {sucessos}")
            current_app.logger.info(f"❌ Falhas: {falhas}")
            current_app.logger.info(f"{'='*60}\n")
            
            return resultado_final
        
        except Exception as e:
            current_app.logger.error(f"❌ ERRO CRÍTICO ao enviar relatório: {e}", exc_info=True)
            return {
                'success': False,
                'sucessos': 0,
                'falhas': 0,
                'error': str(e)
            }
    
    def send_approval_email(self, relatorio, pdf_path):
        """
        Envia e-mail de aprovação com Resend SÍNCRONAMENTE (aguarda resposta).
        Retorna o resultado real do envio.
        """
        try:
            current_app.logger.info(f"\n{'='*70}")
            current_app.logger.info(f"📧 INICIANDO ENVIO DE EMAIL - RELATÓRIO {relatorio.numero}")
            current_app.logger.info(f"{'='*70}")
            
            recipients = self._get_recipients_for_report(relatorio)
            current_app.logger.info(f"\n📊 RECIPIENTS COLETADOS NA FUNÇÃO send_approval_email:")
            current_app.logger.info(f"   Total: {len(recipients)}")
            for i, email in enumerate(recipients, 1):
                current_app.logger.info(f"   {i}. {email}")
            
            if not recipients:
                current_app.logger.warning(f"⚠️ NENHUM DESTINATÁRIO! Retornando sucesso vazio")
                return {'success': True, 'enviados': 0, 'error': None}
            
            # Obter nome da obra
            obra_nome = "Obra"
            if hasattr(relatorio, 'projeto') and relatorio.projeto:
                obra_nome = relatorio.projeto.nome
            elif hasattr(relatorio, 'obra_nome'):
                obra_nome = relatorio.obra_nome or "Obra"
            
            # PDF existe?
            if not os.path.exists(pdf_path):
                current_app.logger.warning(f"⚠️ PDF não encontrado: {pdf_path}")
                return {'success': True, 'enviados': 0, 'error': None}
            
            # Assunto: Relatório “nº do relatório” – Obra “nome da obra”
            numero_rel = getattr(relatorio, 'numero', 'N/A')
            assunto = f"Relatório {numero_rel} – Obra {obra_nome}"
            
            # Ler PDF e converter para base64
            with open(pdf_path, 'rb') as pdf_file:
                pdf_base64 = base64.b64encode(pdf_file.read()).decode('utf-8')
            
            enviados = 0
            erros = []
            
            for idx, recipient_email in enumerate(recipients):
                try:
                    # DELAY para respeitar rate limit de 2 requests/segundo (500ms entre requisições)
                    if idx > 0:
                        import time
                        time.sleep(0.6)
                    
                    destinatario_nome = recipient_email.split('@')[0]
                    try:
                        from models import User
                        user = User.query.filter_by(email=recipient_email).first()
                        if user and user.nome_completo:
                            destinatario_nome = user.nome_completo
                    except:
                        pass
                    
                    corpo_html = self._format_email_body(destinatario_nome, obra_nome, relatorio.data_aprovacao, relatorio)
                    
                    current_app.logger.info(f"📤 [{idx+1}/{len(recipients)}] Enviando para {recipient_email}...")
                    
                    # Payload para Resend
                    payload = {
                        "from": self.from_email,
                        "to": recipient_email,
                        "subject": assunto,
                        "html": corpo_html,
                        "attachments": [
                            {
                                "filename": os.path.basename(pdf_path),
                                "content": pdf_base64
                            }
                        ]
                    }
                    
                    # Headers com API key
                    headers = {
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    }
                    
                    # Fazer POST para Resend - SÍNCRONO
                    response = requests.post(
                        self.resend_endpoint,
                        json=payload,
                        headers=headers,
                        timeout=30
                    )
                    
                    current_app.logger.info(f"📨 Resposta Resend - Status: {response.status_code}")
                    current_app.logger.info(f"📨 Resposta Body: {response.text[:500]}")
                    
                    if response.status_code == 200:
                        enviados += 1
                        response_data = response.json()
                        email_id = response_data.get('id', 'N/A')
                        current_app.logger.info(f"✅ Email enviado com sucesso para {recipient_email} - ID: {email_id}")
                    else:
                        error_msg = response.text if response.text else f"HTTP {response.status_code}"
                        erros.append(f"{recipient_email}: {error_msg}")
                        current_app.logger.error(f"❌ ERRO ao enviar para {recipient_email}: {error_msg}")
                
                except Exception as e:
                    erro_msg = f"{recipient_email}: {type(e).__name__}: {str(e)}"
                    erros.append(erro_msg)
                    current_app.logger.error(f"❌ EXCEÇÃO ao enviar para {recipient_email}: {erro_msg}", exc_info=True)
            
            resultado_final = {
                'success': enviados > 0,
                'enviados': enviados,
                'total': len(recipients),
                'error': "; ".join(erros) if erros else None
            }
            
            current_app.logger.info(f"\n{'='*60}")
            current_app.logger.info(f"📊 RESULTADO FINAL DO ENVIO")
            current_app.logger.info(f"{'='*60}")
            current_app.logger.info(f"✅ Enviados: {enviados}/{len(recipients)}")
            if erros:
                current_app.logger.info(f"❌ Erros: {'; '.join(erros)}")
            current_app.logger.info(f"{'='*60}\n")
            
            return resultado_final
        
        except Exception as e:
            current_app.logger.error(f"❌ ERRO CRÍTICO ao enviar emails: {e}", exc_info=True)
            return {'success': False, 'enviados': 0, 'error': str(e)}
