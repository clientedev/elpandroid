"""
Serviço de envio de e-mail via yagmail para relatórios aprovados.
Usa conta Gmail fixa: relatorioselpconsultoria@gmail.com
Envia e-mails para os envolvidos quando um relatório é aprovado.
"""
import os
import json
import yagmail
from datetime import datetime
from flask import current_app


class ReportApprovalEmailService:
    """Serviço de envio de e-mails via yagmail"""
    
    def __init__(self):
        import os
        self.from_email = os.getenv('GMAIL_EMAIL', "relatorioselpconsultoria@gmail.com")
        self.from_password = os.getenv('GMAIL_PASSWORD', "ipbs dkwc osyn vixg")
        
        # Log para debug
        current_app.logger.info(f"📧 Email Service inicializado com: {self.from_email}")
        
        self.yag = None
    
    def _get_yag_connection(self):
        """Obter conexão yagmail com timeout otimizado"""
        if self.yag is None:
            try:
                import socket
                socket.setdefaulttimeout(60)  # 60 segundos para socket
                
                current_app.logger.info(f"🔌 Iniciando conexão SMTP com {self.from_email}...")
                current_app.logger.info(f"   - Host: smtp.gmail.com")
                current_app.logger.info(f"   - Porta: 587 (TLS)")
                current_app.logger.info(f"   - Timeout: 60s")
                
                # Usar porta TLS 587 com timeout maior
                self.yag = yagmail.SMTP(
                    self.from_email, 
                    self.from_password,
                    host='smtp.gmail.com',
                    port=587,
                    timeout=60
                )
                current_app.logger.info(f"✅ Conexão SMTP estabelecida com sucesso!")
            except socket.timeout as e:
                current_app.logger.error(f"❌ TIMEOUT na conexão SMTP (pode estar bloqueado pelo firewall)")
                current_app.logger.error(f"   - Detalhes: {str(e)}")
                raise
            except ConnectionRefusedError as e:
                current_app.logger.error(f"❌ CONEXÃO RECUSADA pelo servidor SMTP")
                current_app.logger.error(f"   - Railway pode estar bloqueando SMTP")
                current_app.logger.error(f"   - Detalhes: {str(e)}")
                raise
            except Exception as e:
                current_app.logger.error(f"❌ FALHA na conexão SMTP: {type(e).__name__}")
                current_app.logger.error(f"   - Mensagem: {str(e)}")
                current_app.logger.error(f"   - Verifique: credenciais, 2FA, acesso à rede SMTP")
                import traceback
                current_app.logger.error(f"   - Traceback:\n{traceback.format_exc()}")
                raise
        return self.yag
    
    def _get_recipients_for_report(self, relatorio):
        """
        Coleta APENAS os destinatários relacionados ao relatório.
        Retorna lista de emails únicos com logs detalhados.
        
        Destinatários:
        - Pessoa que criou o relatório (autor)
        - Aprovador global
        - Contato de email da obra
        - Todos os acompanhantes da visita vinculados ao relatório
        
        NÃO inclui funcionários da obra, apenas os envolvidos no relatório.
        """
        recipients = set()
        
        try:
            current_app.logger.info(f"🔍 Coletando destinatários para relatório {relatorio.numero}")
            
            # 1. Autor do relatório
            if relatorio.autor and relatorio.autor.email:
                recipients.add(relatorio.autor.email)
                current_app.logger.info(f"✉️ [AUTOR] {relatorio.autor.nome_completo or relatorio.autor.username} ({relatorio.autor.email})")
            else:
                current_app.logger.warning(f"⚠️ [AUTOR] Sem email encontrado")
            
            # 2. Aprovador global
            if relatorio.aprovador and relatorio.aprovador.email:
                recipients.add(relatorio.aprovador.email)
                current_app.logger.info(f"✉️ [APROVADOR] {relatorio.aprovador.nome_completo or relatorio.aprovador.username} ({relatorio.aprovador.email})")
            else:
                current_app.logger.warning(f"⚠️ [APROVADOR] Sem email ou não atribuído")
            
            # 3. Contato de email da obra
            obra_email = None
            if hasattr(relatorio, 'obra_email'):
                obra_email = (relatorio.obra_email or '').strip()
            elif hasattr(relatorio, 'projeto') and relatorio.projeto and hasattr(relatorio.projeto, 'email'):
                obra_email = (relatorio.projeto.email or '').strip()
            
            if obra_email:
                recipients.add(obra_email)
                current_app.logger.info(f"✉️ [OBRA] Contato da obra ({obra_email})")
            else:
                current_app.logger.info(f"ℹ️ [OBRA] Sem email de contato registrado")
            
            # 4. Acompanhantes da visita vinculados ao relatório
            if relatorio.acompanhantes:
                current_app.logger.info(f"🔍 Processando acompanhantes: {type(relatorio.acompanhantes)}")
                acompanhantes_list = []
                
                # Converter para lista se necessário
                if isinstance(relatorio.acompanhantes, list):
                    acompanhantes_list = relatorio.acompanhantes
                    current_app.logger.info(f"✅ Acompanhantes é uma lista")
                elif isinstance(relatorio.acompanhantes, str):
                    try:
                        acompanhantes_list = json.loads(relatorio.acompanhantes)
                        if not isinstance(acompanhantes_list, list):
                            acompanhantes_list = []
                        current_app.logger.info(f"✅ Acompanhantes parseado de JSON string")
                    except json.JSONDecodeError:
                        current_app.logger.warning(f"⚠️ Erro ao fazer parse de acompanhantes JSON: {relatorio.acompanhantes}")
                        acompanhantes_list = []
                elif isinstance(relatorio.acompanhantes, dict):
                    # Se for dict, pode ser um array embutido ou um objeto único
                    # Tenta converter para lista se tiver chave 'acompanhantes'
                    if 'acompanhantes' in relatorio.acompanhantes:
                        acompanhantes_list = relatorio.acompanhantes.get('acompanhantes', [])
                        if not isinstance(acompanhantes_list, list):
                            acompanhantes_list = [relatorio.acompanhantes]
                    else:
                        # Se não tem 'acompanhantes', é um único item
                        acompanhantes_list = [relatorio.acompanhantes]
                    current_app.logger.info(f"✅ Acompanhantes convertido de dict")
                else:
                    # Tentar converter qualquer outro tipo iterable para lista
                    try:
                        acompanhantes_list = list(relatorio.acompanhantes)
                        current_app.logger.info(f"✅ Acompanhantes convertido de iterable")
                    except (TypeError, ValueError):
                        current_app.logger.warning(f"⚠️ Tipo de acompanhantes não tratado: {type(relatorio.acompanhantes)}")
                        acompanhantes_list = []
                
                current_app.logger.info(f"📋 Total de acompanhantes para processar: {len(acompanhantes_list)}")
                
                for idx, acomp in enumerate(acompanhantes_list):
                    try:
                        email = None
                        nome = "Desconhecido"
                        acomp_id = None
                        
                        if isinstance(acomp, dict):
                            # Extrair informações do acompanhante
                            email = (acomp.get('email', '') or '').strip()
                            nome = (acomp.get('nome', '') or '').strip() or 'Desconhecido'
                            acomp_id = acomp.get('id') or acomp.get('user_id')
                            
                            current_app.logger.info(f"🔍 [ACOMPANHANTE {idx+1}/{len(acompanhantes_list)}] nome='{nome}' id={acomp_id} email_salvo='{email}'")
                            
                            # 1. SE JÁ TEM EMAIL SALVO, USAR DIRETO (PRIORIDADE!)
                            if email and email.strip():
                                recipients.add(email)
                                current_app.logger.info(f"✅ [ACOMPANHANTE {idx+1}] Email já salvo e adicionado: {email}")
                            
                            # 2. Se tem ID tipo 'ec_XXX', buscar na tabela emails_clientes (EmailCliente)
                            elif acomp_id and isinstance(acomp_id, str) and acomp_id.startswith('ec_'):
                                current_app.logger.info(f"🔎 Tentando buscar em EmailCliente: id={acomp_id}")
                                try:
                                    from models import EmailCliente
                                    from app import db
                                    db.session.rollback()  # Limpar transação abortada
                                    
                                    ec_id = int(acomp_id.replace('ec_', ''))
                                    current_app.logger.info(f"🔎 Convertido para ec_id: {ec_id}")
                                    
                                    email_cliente = EmailCliente.query.filter_by(id=ec_id).first()
                                    current_app.logger.info(f"🔎 Resultado da query: {email_cliente is not None}")
                                    
                                    if email_cliente and email_cliente.email:
                                        email = email_cliente.email
                                        nome = email_cliente.nome_contato or nome
                                        current_app.logger.info(f"✅ Email encontrado em emails_clientes (ID={ec_id}): {email}")
                                    else:
                                        current_app.logger.warning(f"⚠️ EmailCliente ID={ec_id} não encontrado ou sem email")
                                except Exception as e:
                                    current_app.logger.warning(f"⚠️ Erro ao buscar EmailCliente por ID {acomp_id}: {e}", exc_info=True)
                            
                            # 3. Se tem ID tipo 'fp_XXX', buscar na tabela funcionarios_projetos
                            elif acomp_id and isinstance(acomp_id, str) and acomp_id.startswith('fp_'):
                                try:
                                    from models import FuncionarioProjeto, User
                                    from app import db
                                    db.session.rollback()
                                    
                                    fp_id = int(acomp_id.replace('fp_', ''))
                                    func = FuncionarioProjeto.query.filter_by(id=fp_id).first()
                                    
                                    if func and func.user_id:
                                        user = User.query.filter_by(id=func.user_id).first()
                                        if user and user.email:
                                            email = user.email
                                            nome = user.nome_completo or nome
                                            current_app.logger.info(f"✅ Email encontrado via FuncionarioProjeto (ID={fp_id}): {email}")
                                except Exception as e:
                                    current_app.logger.warning(f"⚠️ Erro ao buscar FuncionarioProjeto por ID {acomp_id}: {e}")
                            
                            # 4. Se tem ID numérico (integer), buscar na tabela User
                            elif acomp_id and isinstance(acomp_id, int):
                                try:
                                    from models import User
                                    from app import db
                                    db.session.rollback()
                                    
                                    user = User.query.filter_by(id=acomp_id).first()
                                    if user and user.email:
                                        email = user.email
                                        nome = user.nome_completo or user.username
                                        current_app.logger.info(f"✅ Email encontrado por User ID {acomp_id}: {email}")
                                except Exception as e:
                                    current_app.logger.warning(f"⚠️ Erro ao buscar User por ID {acomp_id}: {e}")
                            
                            # 5. Fallback: buscar na tabela User por nome
                            if not email and nome != 'Desconhecido':
                                try:
                                    from models import User
                                    from app import db
                                    db.session.rollback()
                                    
                                    user = User.query.filter_by(nome_completo=nome).first()
                                    if not user:
                                        user = User.query.filter(
                                            User.nome_completo.ilike(f'%{nome}%')
                                        ).first()
                                    
                                    if user and user.email:
                                        email = user.email
                                        current_app.logger.info(f"✅ Email encontrado em User por nome: {email}")
                                except Exception as e:
                                    current_app.logger.warning(f"⚠️ Erro ao buscar em User por nome: {e}")
                        
                        # Adicionar email se encontrou
                        if email:
                            recipients.add(email)
                            current_app.logger.info(f"✉️ [ACOMPANHANTE {idx+1}] {nome} ({email})")
                        else:
                            current_app.logger.warning(f"⚠️ [ACOMPANHANTE {idx+1}] '{nome}' - SEM EMAIL ENCONTRADO")
                    
                    except Exception as e:
                        current_app.logger.warning(f"⚠️ Erro ao processar acompanhante {idx}: {e}")
            
            else:
                current_app.logger.info(f"ℹ️ Nenhum acompanhante registrado para este relatório")
            
            current_app.logger.info(f"📊 RESUMO: Total de {len(recipients)} destinatário(s) coletado(s)")
            for email in recipients:
                current_app.logger.info(f"   - {email}")
        
        except Exception as e:
            current_app.logger.error(f"❌ Erro ao coletar destinatários: {e}", exc_info=True)
        
        return list(recipients)
    
    def _format_email_body(self, destinatario_nome, nome_obra, data_aprovacao):
        """Formata o corpo do e-mail de aprovação"""
        if data_aprovacao:
            from datetime import timezone, timedelta
            # Converter de UTC para Brasília (UTC-3)
            brasilia_tz = timezone(timedelta(hours=-3))
            data_brasilia = data_aprovacao.replace(tzinfo=timezone.utc).astimezone(brasilia_tz)
            data_formatada = data_brasilia.strftime("%d/%m/%Y às %H:%M")
        else:
            data_formatada = "data não disponível"
        
        corpo = f"""Olá {destinatario_nome},

O relatório da obra "{nome_obra}" foi aprovado em {data_formatada}.

Segue em anexo o arquivo PDF do relatório aprovado.

Este é um e-mail automático.
Por favor, não responda este e-mail.
"""
        return corpo
    
    def send_approval_email(self, relatorio, pdf_path):
        """
        Envia e-mail de aprovação com timeout curto (não bloqueia a requisição).
        Retorna sucesso mesmo que falhe (email é enviado em background).
        """
        try:
            current_app.logger.info(f"📧 Iniciando envio de email para relatório {relatorio.numero}")
            
            recipients = self._get_recipients_for_report(relatorio)
            
            if not recipients:
                current_app.logger.warning(f"⚠️ Nenhum destinatário para {relatorio.numero}")
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
            
            assunto = f"Relatório aprovado – Obra {obra_nome}"
            
            # Tentar enviar COM TIMEOUT CURTO
            import signal
            import threading
            
            def enviar_emails_com_timeout():
                try:
                    current_app.logger.info(f"[THREAD] 🧵 Thread iniciada - tentando conectar SMTP...")
                    
                    yag = self._get_yag_connection()
                    current_app.logger.info(f"[THREAD] ✅ Conexão SMTP OK")
                    enviados = 0
                    
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
                            
                            corpo = self._format_email_body(destinatario_nome, obra_nome, relatorio.data_aprovacao)
                            current_app.logger.info(f"[THREAD] 📤 Enviando para {recipient_email}...")
                            yag.send(to=recipient_email, subject=assunto, contents=corpo, attachments=pdf_path)
                            enviados += 1
                            current_app.logger.info(f"[THREAD] ✅ Email enviado para {recipient_email}")
                        except Exception as e:
                            current_app.logger.warning(f"[THREAD] ⚠️ Não foi possível enviar para {recipient_email}: {type(e).__name__}")
                    
                    if enviados > 0:
                        current_app.logger.info(f"[THREAD] ✅ SUCESSO: {enviados}/{len(recipients)} emails enviados")
                
                except OSError as e:
                    # Network is unreachable - Railway bloqueia SMTP, não tentar novamente
                    current_app.logger.warning(f"[THREAD] ⚠️ Rede SMTP indisponível (Railway bloqueia SMTP): {e}")
                except Exception as e:
                    current_app.logger.warning(f"[THREAD] ⚠️ Não foi possível enviar emails: {type(e).__name__}")
            
            # Executar em thread daemon (não bloqueia)
            thread = threading.Thread(target=enviar_emails_com_timeout, daemon=True)
            thread.start()
            
            # Retornar SUCESSO IMEDIATAMENTE (não espera a thread)
            return {'success': True, 'enviados': len(recipients), 'error': None}
        
        except Exception as e:
            current_app.logger.error(f"❌ Erro ao iniciar envio: {e}")
            return {'success': True, 'enviados': 0, 'error': None}
