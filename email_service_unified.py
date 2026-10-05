"""
Serviço unificado de envio de emails para relatórios via Resend.
Implementação robusta que garante envio para TODOS os destinatários.
"""
import os
import json
import base64
import requests
import logging
import time
from datetime import datetime
from flask import current_app
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)


def _similarity(a, b):
    """Calcula similaridade entre duas strings (0-1)"""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


class UnifiedReportEmailService:
    """Serviço centralizado de envio de emails para relatórios"""
    
    def __init__(self):
        # API key vem das variáveis de ambiente
        self.api_key = os.getenv('RESEND_API_KEY', '')
        self.from_email = os.getenv('RESEND_FROM_EMAIL', 'relatorios@elpconsultoria.eng.br')
        self.resend_endpoint = "https://api.resend.com/emails"
        
        logger.info(f"📧 Serviço Unified de Email inicializado")
        logger.info(f"📮 De: {self.from_email}")
        logger.info(f"🔑 API KEY: {self.api_key[:15]}...")
    
    def _find_email_by_name(self, nome):
        """
        Procura email de uma pessoa pelo nome em múltiplas tabelas.
        Retorna o email encontrado ou None.
        """
        if not nome or not isinstance(nome, str):
            return None
        
        nome_clean = nome.strip().lower()
        best_match = None
        best_score = 0.6  # Threshold mínimo
        
        try:
            from models import User, EmailCliente
            
            # 1. Procurar em User por nome_completo ou username
            users = User.query.all()
            for user in users:
                score = 0
                # Tentar nome_completo
                if hasattr(user, 'nome_completo') and user.nome_completo:
                    score = _similarity(nome_clean, user.nome_completo.strip().lower())
                # Tentar username
                if hasattr(user, 'username') and user.username:
                    score = max(score, _similarity(nome_clean, user.username.strip().lower()))
                
                if score > best_score and user.email:
                    best_score = score
                    best_match = user.email.strip()
                    logger.info(f"      ✅ Encontrado em User: {nome} → {best_match} (score: {score:.2f})")
            
            # 2. Procurar em EmailCliente
            emails = EmailCliente.query.all()
            for email_cliente in emails:
                if hasattr(email_cliente, 'nome') and email_cliente.nome:
                    score = _similarity(nome_clean, email_cliente.nome.strip().lower())
                    if score > best_score and email_cliente.email:
                        best_score = score
                        best_match = email_cliente.email.strip()
                        logger.info(f"      ✅ Encontrado em EmailCliente: {nome} → {best_match} (score: {score:.2f})")
        
        except Exception as e:
            logger.debug(f"      ⚠️ Erro ao procurar email para '{nome}': {e}")
        
        return best_match if best_score > 0.6 else None
    
    def _collect_all_recipients(self, relatorio):
        """
        Coleta TODOS os destinatários do relatório com logging detalhado.
        
        Retorna:
            dict com 'emails' (lista de strings) e 'por_tipo' (dict com contagem)
        """
        recipients = set()
        recipients_by_type = {
            'autor': [],
            'aprovador': [],
            'obra': [],
            'acompanhantes': []
        }
        
        try:
            tipo_relatorio = type(relatorio).__name__
            logger.info(f"\n{'='*70}")
            logger.info(f"🔍 COLETANDO DESTINATÁRIOS - {tipo_relatorio}")
            logger.info(f"{'='*70}")
            
            # 1. AUTOR DO RELATÓRIO
            try:
                autor = getattr(relatorio, 'autor', None)
                if not autor and hasattr(relatorio, 'autor_id'):
                    from models import User
                    autor = User.query.get(relatorio.autor_id)
                
                if autor and hasattr(autor, 'email') and autor.email:
                    email_clean = autor.email.strip().lower()
                    if '@' in email_clean:
                        recipients.add(email_clean)
                        recipients_by_type['autor'].append(email_clean)
                        nome = getattr(autor, 'nome_completo', None) or getattr(autor, 'username', 'Autor')
                        logger.info(f"✅ [AUTOR] {nome} → {email_clean}")
                    else:
                        logger.warning(f"⚠️ [AUTOR] Email inválido: {autor.email}")
                else:
                    logger.warning(f"⚠️ [AUTOR] Sem email - autor_id={getattr(relatorio, 'autor_id', None)}")
            except Exception as e:
                logger.warning(f"⚠️ [AUTOR] Erro: {e}")
            
            # 2. APROVADOR
            try:
                aprovador = getattr(relatorio, 'aprovador', None)
                if not aprovador and hasattr(relatorio, 'aprovador_id') and relatorio.aprovador_id:
                    from models import User
                    aprovador = User.query.get(relatorio.aprovador_id)
                
                if aprovador and hasattr(aprovador, 'email') and aprovador.email:
                    email_clean = aprovador.email.strip().lower()
                    if '@' in email_clean:
                        recipients.add(email_clean)
                        recipients_by_type['aprovador'].append(email_clean)
                        nome = getattr(aprovador, 'nome_completo', None) or getattr(aprovador, 'username', 'Aprovador')
                        logger.info(f"✅ [APROVADOR] {nome} → {email_clean}")
                    else:
                        logger.warning(f"⚠️ [APROVADOR] Email inválido: {aprovador.email}")
                else:
                    logger.info(f"ℹ️ [APROVADOR] Sem aprovador designado")

                # ADICIONAR LEOPOLDO (Hardcoded conforme solicitado)
                email_leopoldo = 'leopoldo@elpconsultoria.eng.br'
                recipients.add(email_leopoldo)
                recipients_by_type['aprovador'].append(email_leopoldo)
                logger.info(f"✅ [CC] Leopoldo → {email_leopoldo}")

            except Exception as e:
                logger.warning(f"⚠️ [APROVADOR] Erro: {e}")
            
            # 3. CONTATO DA OBRA
            try:
                # Express: email direto do campo obra_email
                if hasattr(relatorio, 'obra_email'):
                    obra_email = (getattr(relatorio, 'obra_email', '') or '').strip()
                    if obra_email and '@' in obra_email:
                        email_clean = obra_email.lower()
                        if email_clean and '@' in email_clean:
                            recipients.add(email_clean)
                            recipients_by_type['obra'].append(email_clean)
                            logger.info(f"✅ [OBRA] {email_clean}")
                        else:
                            logger.warning(f"⚠️ [OBRA] Email inválido após limpeza: {obra_email}")
                    elif obra_email:
                        logger.warning(f"⚠️ [OBRA] Email inválido (sem @): {obra_email}")
                    else:
                        logger.info(f"ℹ️ [OBRA] Campo obra_email vazio")
                
                # Normal: procurar em EmailCliente (contatos da obra)
                if hasattr(relatorio, 'projeto_id') and relatorio.projeto_id:
                    try:
                        from models import EmailCliente
                        contatos = EmailCliente.query.filter_by(projeto_id=relatorio.projeto_id).all()
                        if contatos:
                            logger.info(f"📧 Procurando contatos em EmailCliente (projeto_id={relatorio.projeto_id})...")
                            for contato in contatos:
                                if contato.email and '@' in contato.email:
                                    email_clean = contato.email.strip().lower()
                                    recipients.add(email_clean)
                                    recipients_by_type['obra'].append(email_clean)
                                    logger.info(f"✅ [OBRA] {contato.nome_contato} → {email_clean}")
                        else:
                            logger.info(f"ℹ️ [OBRA] Nenhum contato em EmailCliente")
                    except Exception as email_cliente_err:
                        logger.debug(f"ℹ️ [OBRA] Erro ao procurar EmailCliente: {email_cliente_err}")
                else:
                    logger.info(f"ℹ️ [OBRA] Sem projeto_id")
            except Exception as e:
                logger.warning(f"⚠️ [OBRA] Erro geral: {e}")
            
            # 4. ACOMPANHANTES - CORRIGIDO PARA PROCURAR EMAIL PELO NOME
            try:
                acompanhantes_data = getattr(relatorio, 'acompanhantes', None)
                acompanhantes_list = []
                
                if acompanhantes_data:
                    # Se for lista
                    if isinstance(acompanhantes_data, list):
                        acompanhantes_list = acompanhantes_data
                    # Se for string JSON
                    elif isinstance(acompanhantes_data, str):
                        try:
                            parsed = json.loads(acompanhantes_data)
                            if isinstance(parsed, list):
                                acompanhantes_list = parsed
                        except Exception as json_err:
                            logger.warning(f"⚠️ [ACOMPANHANTES] Erro ao parsear JSON: {json_err}")
                
                if acompanhantes_list and len(acompanhantes_list) > 0:
                    logger.info(f"📋 Processando {len(acompanhantes_list)} acompanhante(s)...")
                    
                    for idx, acomp in enumerate(acompanhantes_list, 1):
                        try:
                            email = None
                            nome = "Acompanhante"
                            
                            # ===== CASO 1: É um dicionário =====
                            if isinstance(acomp, dict):
                                # Procurar nome
                                nome = (acomp.get('nome') or acomp.get('name') or acomp.get('Nome') or f'Acompanhante {idx}')
                                
                                # PRIMEIRO: Procurar email direto nos campos
                                email = (acomp.get('email') or 
                                        acomp.get('Email') or 
                                        acomp.get('EMAIL') or
                                        acomp.get('e-mail') or
                                        acomp.get('E-mail') or
                                        '').strip()
                                
                                # SEGUNDO: Se não tem email direto, procurar pelo nome nas tabelas
                                if not email and nome and nome != f'Acompanhante {idx}':
                                    logger.info(f"   [ACOMP {idx}] Procurando email para '{nome}'...")
                                    email = self._find_email_by_name(nome)
                                
                                # TERCEIRO: Tentar ID de usuário
                                if not email:
                                    user_id = acomp.get('id') or acomp.get('user_id') or acomp.get('userId')
                                    if user_id and str(user_id).isdigit():
                                        try:
                                            from models import User
                                            user = User.query.get(int(user_id))
                                            if user and hasattr(user, 'email') and user.email:
                                                email = user.email.strip()
                                                nome = getattr(user, 'nome_completo', nome) or getattr(user, 'username', nome)
                                                logger.info(f"   [ACOMP {idx}] Email recuperado via User ID: {user_id}")
                                        except Exception as user_err:
                                            logger.debug(f"   [ACOMP {idx}] ID não é usuário válido")
                            
                            # ===== CASO 2: É um objeto com atributos =====
                            elif hasattr(acomp, 'email'):
                                email = (getattr(acomp, 'email', '') or '').strip()
                                nome = getattr(acomp, 'nome', None) or getattr(acomp, 'name', f'Acompanhante {idx}')
                            
                            # ===== CASO 3: É ID de usuário (int ou str) =====
                            elif isinstance(acomp, (int, str)) and str(acomp).isdigit():
                                try:
                                    from models import User
                                    user = User.query.get(int(acomp))
                                    if user and hasattr(user, 'email') and user.email:
                                        email = user.email.strip()
                                        nome = getattr(user, 'nome_completo', None) or getattr(user, 'username', f'Acompanhante {idx}')
                                        logger.info(f"   [ACOMP {idx}] Email recuperado via User ID: {acomp}")
                                except Exception as user_err:
                                    logger.debug(f"   [ACOMP {idx}] ID de usuário inválido")
                            
                            # ===== VALIDAR E ADICIONAR =====
                            if email and '@' in email and email.strip():
                                email_clean = email.lower().strip()
                                if email_clean and '@' in email_clean:
                                    recipients.add(email_clean)
                                    recipients_by_type['acompanhantes'].append(email_clean)
                                    logger.info(f"✅ [ACOMP {idx}] {nome} → {email_clean}")
                                else:
                                    logger.info(f"ℹ️ [ACOMP {idx}] {nome} - Email inválido após limpeza: '{email}'")
                            else:
                                logger.info(f"ℹ️ [ACOMP {idx}] {nome} - Email não encontrado ou vazio")
                        
                        except Exception as e:
                            logger.warning(f"⚠️ [ACOMP {idx}] Erro ao processar: {type(e).__name__}: {e}")
                else:
                    logger.info(f"ℹ️ [ACOMPANHANTES] Nenhum registrado")
            except Exception as e:
                logger.warning(f"⚠️ [ACOMPANHANTES] Erro geral: {type(e).__name__}: {e}")
            
            # Resultado final - Filtrar emails vazios
            emails_finais = [e for e in recipients if e and '@' in e]
            resultado = {
                'emails': sorted(list(emails_finais)),
                'por_tipo': recipients_by_type,
                'total': len(emails_finais)
            }
            
            logger.info(f"\n{'='*70}")
            logger.info(f"📊 RESUMO FINAL - Total: {resultado['total']} destinatários únicos")
            logger.info(f"   - Autor: {len(resultado['por_tipo']['autor'])} - {resultado['por_tipo']['autor']}")
            logger.info(f"   - Aprovador: {len(resultado['por_tipo']['aprovador'])} - {resultado['por_tipo']['aprovador']}")
            logger.info(f"   - Obra: {len(resultado['por_tipo']['obra'])} - {resultado['por_tipo']['obra']}")
            logger.info(f"   - Acompanhantes: {len(resultado['por_tipo']['acompanhantes'])} - {resultado['por_tipo']['acompanhantes']}")
            if emails_finais:
                logger.info(f"📧 Emails válidos para envio:")
                for email in sorted(emails_finais):
                    logger.info(f"   • {email}")
            else:
                logger.warning(f"⚠️ NENHUM EMAIL VÁLIDO ENCONTRADO!")
            logger.info(f"{'='*70}\n")
            
            return resultado
        
        except Exception as e:
            logger.error(f"❌ ERRO ao coletar destinatários: {e}", exc_info=True)
            return {'emails': [], 'por_tipo': {}, 'total': 0}
    
    def _build_html_body(self, destinatario_nome, obra_nome, data_aprovacao, relatorio=None):
        """Cria HTML do email com styling profissional e texto customizado"""
        if not data_aprovacao:
            data_aprovacao = datetime.now()
        
        data_str = data_aprovacao.strftime("%d/%m/%Y") if hasattr(data_aprovacao, 'strftime') else str(data_aprovacao)
        
        # Identificar autor do preenchimento para contato
        contato_nome = "Equipe ELP"
        contato_email = "contato@elpconsultoria.eng.br"
        
        try:
            if relatorio:
                autor = getattr(relatorio, 'autor', None)
                if not autor and hasattr(relatorio, 'autor_id'):
                    from models import User
                    autor = User.query.get(relatorio.autor_id)
                
                if autor:
                    contato_nome = getattr(autor, 'nome_completo', 'Autor')
                    contato_email = getattr(autor, 'email', '')
        except Exception as e:
            logger.warning(f"Erro ao obter autor para contato: {e}")

        html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * {{ margin: 0; padding: 0; }}
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; }}
        .wrapper {{ background: #f5f5f5; padding: 20px 0; }}
        .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-top: 4px solid #333; }}
        .header {{ background: #ffffff; color: #333; padding: 30px 20px 10px; border-bottom: 2px solid #f0f0f0; }}
        .header h1 {{ font-size: 24px; margin-bottom: 5px; font-weight: 500; }}
        .content {{ padding: 30px 20px; line-height: 1.6; color: #444; }}
        .content p {{ margin-bottom: 15px; }}
        .highlight {{ color: #222; font-weight: 600; }}
        .footer {{ background: #fafafa; padding: 20px; font-size: 13px; text-align: center; color: #666; border-top: 1px solid #eee; }}
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <h1>Relatório de Obra</h1>
            </div>
            
            <div class="content">
                <p>Prezados,</p>
                
                <p>Segue em anexo o relatório de visita da obra <span class="highlight">{obra_nome}</span>.</p>
                
                <p>Para esclarecimentos, entre em contato com <strong>{contato_nome}</strong> através do e-mail <a href="mailto:{contato_email}" style="color: #0056b3; text-decoration: none;">{contato_email}</a>.</p>
                
                <p style="margin-top: 30px;">Atenciosamente,<br/>
                <strong>ELP Consultoria</strong></p>
            </div>
            
            <div class="footer">
                <p>Este é um e-mail automático do sistema de relatório elp</p>
            </div>
        </div>
    </div>
</body>
</html>"""
        return html
    
    def send_approval_email(self, relatorio, pdf_path):
        """
        Envia email de aprovação de forma SÍNCRONA para TODOS os destinatários.
        """
        try:
            logger.info(f"\n{'='*70}")
            logger.info(f"📧 INICIANDO ENVIO DE EMAIL")
            logger.info(f"{'='*70}")
            logger.info(f"Relatório: {getattr(relatorio, 'numero', 'N/A')}")
            logger.info(f"Tipo: {type(relatorio).__name__}")
            logger.info(f"PDF: {pdf_path}")
            
            # Coletar destinatários
            recipients_data = self._collect_all_recipients(relatorio)
            recipients = recipients_data['emails']
            
            if not recipients:
                logger.warning(f"⚠️ Nenhum destinatário encontrado para {getattr(relatorio, 'numero', 'relatório')}")
                return {'success': True, 'enviados': 0, 'total': 0, 'erros': []}
            
            # Obter nome da obra
            obra_nome = "Obra"
            if hasattr(relatorio, 'obra_nome'):
                obra_nome = relatorio.obra_nome or "Obra"
            elif hasattr(relatorio, 'projeto') and relatorio.projeto:
                obra_nome = relatorio.projeto.nome or "Obra"
            
            # Validar PDF
            if not os.path.exists(pdf_path):
                logger.error(f"❌ PDF não encontrado: {pdf_path}")
                return {'success': False, 'enviados': 0, 'total': len(recipients), 'erros': ['PDF não encontrado']}
            
            # Ler PDF
            try:
                with open(pdf_path, 'rb') as f:
                    pdf_base64 = base64.b64encode(f.read()).decode('utf-8')
                logger.info(f"✅ PDF lido com sucesso")
            except Exception as e:
                logger.error(f"❌ Erro ao ler PDF: {e}")
                return {'success': False, 'enviados': 0, 'total': len(recipients), 'erros': [f'Erro ao ler PDF: {e}']}
            
            # Preparar assunto (Express: Relatório de visita do dia “xx/xx/xx” – Obra “nome da obra”)
            data_visita_str = "Data N/A"
            if hasattr(relatorio, 'data_visita') and relatorio.data_visita:
                # Se for datetime
                if hasattr(relatorio.data_visita, 'strftime'):
                    data_visita_str = relatorio.data_visita.strftime("%d/%m/%y")
                else:
                    data_visita_str = str(relatorio.data_visita)
            elif hasattr(relatorio, 'created_at') and relatorio.created_at:
                data_visita_str = relatorio.created_at.strftime("%d/%m/%y")
                
            assunto = f"Relatório de visita do dia {data_visita_str} – Obra {obra_nome}"
            
            # Enviar para TODOS os destinatários numa única chamada (usando array no campo "to")
            enviados = 0
            erros = []
            
            logger.info(f"\n{'='*70}")
            logger.info(f"📤 ENVIANDO EMAIL EM LOTE - {len(recipients)} destinatário(s)")
            logger.info(f"{'='*70}")
            
            try:
                # Validar emails (apenas pra logs de erro, enviamos tudo que tiver @)
                valid_recipients = [email for email in recipients if email and '@' in email]
                if len(valid_recipients) < len(recipients):
                    logger.warning(f"⚠️ {len(recipients) - len(valid_recipients)} e-mails inválidos foram ignorados.")
                
                if not valid_recipients:
                    logger.error("❌ Nenhum e-mail válido restante após validação.")
                    return {'success': False, 'enviados': 0, 'total': len(recipients), 'erros': ['Nenhum e-mail válido']}

                logger.info(f"📤 Preparando email batched para {len(valid_recipients)} destinatários.")
                
                # O destinatário nominal fica como genérico já que enviamos um para todos
                destinatario_nome = "Equipe"
                
                # Montar HTML do corpo
                corpo_html = self._build_html_body(destinatario_nome, obra_nome, getattr(relatorio, 'data_aprovacao', None), relatorio)
                
                # A API do Resend suporta enviar array de emails diretamente no "to"
                payload = {
                    "from": self.from_email,
                    "to": valid_recipients,
                    "subject": assunto,
                    "html": corpo_html,
                    "attachments": [
                        {
                            "filename": os.path.basename(pdf_path),
                            "content": pdf_base64
                        }
                    ]
                }
                
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                }
                
                logger.info(f"   Enviando via Resend API (Batch TO)...")
                
                # POST para Resend
                response = requests.post(
                    self.resend_endpoint,
                    json=payload,
                    headers=headers,
                    timeout=45
                )
                
                if response.status_code == 200:
                    response_data = response.json()
                    email_id = response_data.get('id', 'N/A')
                    enviados = len(valid_recipients)  # Todos no lote foram aceitos
                    logger.info(f"✅ Email em lote enviado com sucesso! ID: {email_id}")
                else:
                    erro = f"HTTP {response.status_code}: {response.text[:100]}"
                    erros.append(f"Erro Master: {erro}")
                    logger.error(f"❌ Erro ao enviar email em lote: {erro}")
            
            except Exception as e:
                erro = f"{type(e).__name__}: {str(e)}"
                erros.append(f"Exceção Batch: {erro}")
                logger.error(f"❌ Exceção ao enviar email em lote: {erro}", exc_info=True)
            
            # Resultado final
            resultado = {
                'success': enviados > 0,
                'enviados': enviados,
                'total': len(recipients),
                'erros': erros
            }
            
            logger.info(f"\n{'='*70}")
            logger.info(f"📊 RESULTADO FINAL")
            logger.info(f"{'='*70}")
            logger.info(f"✅ Enviados: {resultado['enviados']}/{resultado['total']}")
            if erros:
                logger.info(f"❌ Erros ({len(erros)}):")
                for erro in erros:
                    logger.info(f"   - {erro}")
            logger.info(f"{'='*70}\n")
            
            return resultado
        
        except Exception as e:
            logger.error(f"❌ ERRO CRÍTICO ao enviar emails: {e}", exc_info=True)
            return {'success': False, 'enviados': 0, 'total': 0, 'erros': [str(e)]}


# Singleton global
_email_service = None

def get_email_service():
    global _email_service
    if _email_service is None:
        _email_service = UnifiedReportEmailService()
    return _email_service
