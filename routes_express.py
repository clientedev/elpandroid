"""
Rotas para Relatório Express
Funcionalidade independente com obra criada junto do relatório
Status: Em preenchimento → Aguardando Aprovação → Aprovado / Rejeitado
"""
import os
import json
import logging
from datetime import datetime
from pytz import timezone as tz
from flask import render_template, redirect, url_for, flash, request, jsonify, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from app import app, db
from models import RelatorioExpress, FotoRelatorioExpress, User, ChecklistPadrao

logger = logging.getLogger(__name__)

def generate_express_number():
    """Gera o próximo número para Relatório Express"""
    last_report = RelatorioExpress.query.order_by(RelatorioExpress.id.desc()).first()
    if last_report:
        try:
            num = int(last_report.numero.replace('EXP-', ''))
            return f"EXP-{str(num + 1).zfill(4)}"
        except:
            pass
    return "EXP-0001"


@app.route('/relatorios-express')
@login_required
def express_reports_list():
    """Lista todos os Relatórios Express com filtros"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = 20
        
        status_filter = request.args.get('status', '')
        search_query = request.args.get('q', '')
        
        query = RelatorioExpress.query
        
        if status_filter:
            if status_filter == 'Em preenchimento':
                query = query.filter(RelatorioExpress.status == 'Em preenchimento')
            elif status_filter == 'Aguardando Aprovação':
                query = query.filter(RelatorioExpress.status == 'Aguardando Aprovação')
            elif status_filter == 'Aprovado':
                query = query.filter(RelatorioExpress.status == 'Aprovado')
            elif status_filter == 'Rejeitado':
                query = query.filter(RelatorioExpress.status == 'Rejeitado')
        
        if search_query:
            query = query.filter(
                db.or_(
                    RelatorioExpress.numero.ilike(f'%{search_query}%'),
                    RelatorioExpress.titulo.ilike(f'%{search_query}%'),
                    RelatorioExpress.obra_nome.ilike(f'%{search_query}%'),
                    RelatorioExpress.obra_construtora.ilike(f'%{search_query}%')
                )
            )
        
        relatorios = query.order_by(RelatorioExpress.created_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        return render_template('reports/express_list.html',
            relatorios=relatorios,
            status_filter=status_filter,
            search_query=search_query
        )
    except Exception as e:
        logger.error(f"Erro ao listar Relatórios Express: {e}")
        flash('Erro ao carregar lista de relatórios.', 'error')
        return redirect(url_for('index'))


@app.route('/relatorio-express/novo')
@login_required
def new_express_report():
    """Formulário para criar novo Relatório Express"""
    try:
        next_numero = generate_express_number()
        today = datetime.now().strftime('%Y-%m-%d')
        
        report_data = {
            'id': None,
            'numero': next_numero,
            'titulo': 'Relatório Express de Visita',
            'status': 'preenchimento',
            'obra_nome': '',
            'obra_endereco': '',
            'obra_tipo': '',
            'obra_construtora': '',
            'obra_responsavel': '',
            'obra_email': '',
            'obra_telefone': '',
            'acompanhantes': [],
            'informacoes_tecnicas': '{}',
            'imagens': []
        }
        
        # Carregar checklist padrão
        checklist_items = ChecklistPadrao.query.filter_by(ativo=True).order_by(ChecklistPadrao.ordem).all()
        
        return render_template('reports/express_form.html',
            report_data=report_data,
            edit_mode=False,
            existing_report=None,
            next_numero=next_numero,
            today=today,
            checklist_items=checklist_items
        )
    except Exception as e:
        logger.error(f"Erro ao carregar formulário Express: {e}")
        flash('Erro ao carregar formulário.', 'error')
        return redirect(url_for('express_reports_list'))


@app.route('/relatorio-express/criar', methods=['POST'])
@login_required
def create_express_report():
    """Cria novo Relatório Express"""
    try:
        action = request.form.get('action', 'save_draft')
        
        obra_nome = request.form.get('obra_nome', '').strip()
        if not obra_nome:
            flash('O nome da obra é obrigatório.', 'error')
            return redirect(url_for('new_express_report'))
        
        numero = request.form.get('numero') or generate_express_number()
        
        existing = RelatorioExpress.query.filter_by(numero=numero).first()
        if existing:
            numero = generate_express_number()
        
        relatorio = RelatorioExpress(
            numero=numero,
            titulo=request.form.get('titulo', 'Relatório Express de Visita'),
            empresa_nome=obra_nome,
            empresa_endereco=request.form.get('obra_endereco', ''),
            empresa_telefone=request.form.get('obra_telefone', ''),
            empresa_email=request.form.get('obra_email', ''),
            empresa_responsavel=request.form.get('obra_responsavel', ''),
            data_visita=datetime.now().date(),
            obra_nome=obra_nome,
            obra_endereco=request.form.get('obra_endereco', ''),
            obra_tipo=request.form.get('obra_tipo', ''),
            obra_construtora=request.form.get('obra_construtora', ''),
            obra_responsavel=request.form.get('obra_responsavel', ''),
            obra_email=request.form.get('obra_email', ''),
            obra_telefone=request.form.get('obra_telefone', ''),
            autor_id=current_user.id,
            criado_por=current_user.id,
            conteudo=request.form.get('conteudo', ''),
            status='Em preenchimento'
        )
        
        # Processar informacoes_tecnicas
        informacoes_tecnicas = request.form.get('informacoes_tecnicas')
        logger.info(f"CREATE EXPRESS: informacoes_tecnicas received: {informacoes_tecnicas}")
        if informacoes_tecnicas:
            relatorio.informacoes_tecnicas = informacoes_tecnicas

        
        data_relatorio = request.form.get('data_relatorio')
        if data_relatorio:
            try:
                relatorio.data_relatorio = datetime.strptime(data_relatorio, '%Y-%m-%d')
            except:
                relatorio.data_relatorio = now_brt()
        
        acompanhantes_str = request.form.get('acompanhantes', '[]')
        try:
            relatorio.acompanhantes = json.loads(acompanhantes_str) if acompanhantes_str else []
        except:
            relatorio.acompanhantes = []
        
        checklist_data = []
        for key, value in request.form.items():
            if key.startswith('obs_'):
                item_name = key.replace('obs_', '')
                checked = request.form.get(item_name) == 'on'
                if value.strip() or checked:
                    checklist_data.append({
                        'item': item_name,
                        'checked': checked,
                        'observacao': value.strip()
                    })
        relatorio.checklist_data = json.dumps(checklist_data)
        
        if action == 'submit_approval':
            relatorio.status = 'Aguardando Aprovação'
        
        db.session.add(relatorio)
        db.session.commit()
        
        if action == 'submit_approval':
            try:
                from notification_service import notification_service
                notification_service.criar_notificacao_express_pendente(relatorio.id)
                logger.info(f"✅ Notificação de aprovação pendente enviada para Relatório Express {numero}")
            except Exception as notif_error:
                logger.error(f"⚠️ Erro ao criar notificação: {notif_error}")
            flash(f'Relatório Express {numero} enviado para aprovação!', 'success')
        else:
            flash(f'Relatório Express {numero} salvo com sucesso!', 'success')
        
        return redirect(url_for('express_reports_list'))
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erro ao criar Relatório Express: {e}")
        flash('Erro ao criar relatório. Tente novamente.', 'error')
        return redirect(url_for('new_express_report'))


@app.route('/relatorio-express/<int:report_id>/editar')
@login_required
def edit_express_report(report_id):
    """Edita um Relatório Express existente"""
    try:
        relatorio = RelatorioExpress.query.get_or_404(report_id)
        
        if relatorio.status == 'Aprovado' and not current_user.is_master:
            flash('Relatórios aprovados não podem ser editados.', 'warning')
            return redirect(url_for('view_express_report', report_id=report_id))
        
        today = datetime.now().strftime('%Y-%m-%d')
        
        checklist_data = []
        if relatorio.checklist_data:
            try:
                checklist_data = json.loads(relatorio.checklist_data)
            except:
                checklist_data = []
        
        report_data = {
            'id': relatorio.id,
            'numero': relatorio.numero,
            'titulo': relatorio.titulo,
            'status': relatorio.status,
            'obra_nome': relatorio.obra_nome,
            'obra_endereco': relatorio.obra_endereco,
            'obra_tipo': relatorio.obra_tipo,
            'obra_construtora': relatorio.obra_construtora,
            'obra_responsavel': relatorio.obra_responsavel,
            'obra_email': relatorio.obra_email,
            'obra_telefone': relatorio.obra_telefone,
            'conteudo': relatorio.conteudo,
            'acompanhantes': relatorio.acompanhantes or [],
            'checklist_data': checklist_data,
            'informacoes_tecnicas': relatorio.informacoes_tecnicas,
            'imagens': []
        }
        
        fotos = FotoRelatorioExpress.query.filter_by(
            relatorio_express_id=report_id
        ).order_by(FotoRelatorioExpress.ordem).all()
        
        for foto in fotos:
            report_data['imagens'].append({
                'id': foto.id,
                'url': foto.url,
                'legenda': foto.legenda,
                'local': foto.local or '',
                'ordem': foto.ordem
            })
        
        # Carregar checklist padrão
        checklist_items = ChecklistPadrao.query.filter_by(ativo=True).order_by(ChecklistPadrao.ordem).all()
        
        return render_template('reports/express_form.html',
            report_data=report_data,
            edit_mode=True,
            existing_report=relatorio,
            next_numero=relatorio.numero,
            today=today,
            checklist_items=checklist_items
        )
    except Exception as e:
        logger.error(f"Erro ao editar Relatório Express: {e}")
        flash('Erro ao carregar relatório para edição.', 'error')
        return redirect(url_for('express_reports_list'))


@app.route('/relatorio-express/<int:report_id>/atualizar', methods=['POST'])
@login_required
def update_express_report(report_id):
    """Atualiza um Relatório Express existente"""
    try:
        relatorio = RelatorioExpress.query.get_or_404(report_id)
        
        if relatorio.status == 'Aprovado' and not current_user.is_master:
            flash('Relatórios aprovados não podem ser editados.', 'warning')
            return redirect(url_for('view_express_report', report_id=report_id))
        
        action = request.form.get('action', 'save_draft')
        
        relatorio.titulo = request.form.get('titulo', relatorio.titulo)
        relatorio.obra_nome = request.form.get('obra_nome', relatorio.obra_nome)
        relatorio.obra_endereco = request.form.get('obra_endereco', '')
        relatorio.obra_tipo = request.form.get('obra_tipo', '')
        relatorio.obra_construtora = request.form.get('obra_construtora', '')
        relatorio.obra_responsavel = request.form.get('obra_responsavel', '')
        relatorio.obra_email = request.form.get('obra_email', '')
        relatorio.obra_telefone = request.form.get('obra_telefone', '')
        relatorio.conteudo = request.form.get('conteudo', '')
        relatorio.atualizado_por = current_user.id
        
        # Processar informacoes_tecnicas
        informacoes_tecnicas = request.form.get('informacoes_tecnicas')
        logger.info(f"UPDATE EXPRESS: informacoes_tecnicas received: {informacoes_tecnicas}")
        if informacoes_tecnicas:
            relatorio.informacoes_tecnicas = informacoes_tecnicas
        
        relatorio.empresa_nome = request.form.get('obra_nome', relatorio.empresa_nome)
        relatorio.empresa_endereco = request.form.get('obra_endereco', '')
        relatorio.empresa_telefone = request.form.get('obra_telefone', '')
        relatorio.empresa_email = request.form.get('obra_email', '')
        relatorio.empresa_responsavel = request.form.get('obra_responsavel', '')
        
        acompanhantes_str = request.form.get('acompanhantes', '[]')
        try:
            relatorio.acompanhantes = json.loads(acompanhantes_str) if acompanhantes_str else []
        except:
            pass
        
        checklist_data = []
        for key, value in request.form.items():
            if key.startswith('obs_'):
                item_name = key.replace('obs_', '')
                checked = request.form.get(item_name) == 'on'
                if value.strip() or checked:
                    checklist_data.append({
                        'item': item_name,
                        'checked': checked,
                        'observacao': value.strip()
                    })
        relatorio.checklist_data = json.dumps(checklist_data)
        
        status_anterior = relatorio.status
        
        if action == 'submit_approval':
            relatorio.status = 'Aguardando Aprovação'
        
        db.session.commit()
        
        if action == 'submit_approval':
            try:
                from notification_service import notification_service
                notification_service.criar_notificacao_express_pendente(relatorio.id)
                logger.info(f"✅ Notificação de aprovação pendente enviada para Relatório Express {relatorio.numero}")
            except Exception as notif_error:
                logger.error(f"⚠️ Erro ao criar notificação: {notif_error}")
            flash(f'Relatório Express {relatorio.numero} enviado para aprovação!', 'success')
        else:
            if status_anterior == 'Aguardando Aprovação':
                try:
                    from notification_service import notification_service
                    notification_service.criar_notificacao_express_editado(relatorio.id, current_user.id)
                    logger.info(f"✅ Notificação de edição enviada para Relatório Express {relatorio.numero}")
                except Exception as notif_error:
                    logger.error(f"⚠️ Erro ao criar notificação de edição: {notif_error}")
            flash(f'Relatório Express {relatorio.numero} atualizado!', 'success')
        
        return redirect(url_for('express_reports_list'))
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erro ao atualizar Relatório Express: {e}")
        flash('Erro ao atualizar relatório.', 'error')
        return redirect(url_for('edit_express_report', report_id=report_id))


def is_aprovador_global():
    """Verifica se o usuário atual é aprovador global"""
    try:
        if not current_user or not current_user.is_authenticated:
            return False
        
        if current_user.is_master:
            return True
        
        from models import AprovadorPadrao
        
        aprovador_global = AprovadorPadrao.query.filter_by(
            projeto_id=None,
            aprovador_id=current_user.id,
            ativo=True
        ).first()
        
        return aprovador_global is not None
    except Exception as e:
        logger.error(f"Erro ao verificar aprovador global: {e}")
        return False

def has_express_approval_permission():
    """Verifica se o usuário tem permissão para aprovar Relatórios Express
    
    Permissões:
    - Aprovador Global (definido em AprovadorPadrao com projeto_id=None)
    - Usuários com is_aprovador_express=True
    
    Nota: Usuários Master NÃO têm permissão automática
    """
    try:
        if not current_user or not current_user.is_authenticated:
            return False
        
        # Verificar se é Aprovador Global (sem incluir Master automaticamente)
        from models import AprovadorPadrao
        aprovador_global = AprovadorPadrao.query.filter_by(
            projeto_id=None,
            aprovador_id=current_user.id,
            ativo=True
        ).first()
        
        if aprovador_global:
            return True
            
        # Verificar permissão específica
        return getattr(current_user, 'is_aprovador_express', False)
    except Exception:
        return False


@app.route('/relatorio-express/<int:report_id>')
@login_required
def view_express_report(report_id):
    """Visualiza um Relatório Express"""
    try:
        relatorio = RelatorioExpress.query.get_or_404(report_id)
        
        fotos = FotoRelatorioExpress.query.filter_by(
            relatorio_express_id=report_id
        ).order_by(FotoRelatorioExpress.ordem).all()
        
        pode_aprovar = has_express_approval_permission()

        # Processar informações técnicas de forma segura
        tech_info = {}
        logger.info(f"VIEW EXPRESS: raw informacoes_tecnicas: {relatorio.informacoes_tecnicas}")
        if relatorio.informacoes_tecnicas:
            if isinstance(relatorio.informacoes_tecnicas, str):
                try:
                    tech_info = json.loads(relatorio.informacoes_tecnicas)
                    logger.info(f"VIEW EXPRESS: parsed tech_info: {tech_info}")
                except Exception as e:
                    logger.error(f"VIEW EXPRESS: error parsing json: {e}")
                    tech_info = {}
            else:
                tech_info = relatorio.informacoes_tecnicas

        return render_template('reports/express_view.html',
            relatorio=relatorio,
            fotos=fotos,
            pode_aprovar=pode_aprovar,
            tech_info=tech_info
        )
    except Exception as e:
        logger.error(f"Erro ao visualizar Relatório Express: {e}")
        flash('Erro ao carregar relatório.', 'error')
        return redirect(url_for('express_reports_list'))


@app.route('/relatorio-express/<int:report_id>/aprovar', methods=['POST'])
@login_required
def approve_express_report(report_id):
    """Aprova um Relatório Express e envia e-mails para os envolvidos"""
    try:
        if not has_express_approval_permission():
            flash('Apenas aprovadores podem aprovar relatórios.', 'error')
            return redirect(url_for('express_reports_list'))
        
        relatorio = RelatorioExpress.query.get_or_404(report_id)
        
        if relatorio.status != 'Aguardando Aprovação':
            flash('Este relatório não está aguardando aprovação.', 'warning')
            return redirect(url_for('express_reports_list'))
        
        relatorio.status = 'Aprovado'
        relatorio.aprovador_id = current_user.id
        # Usar timezone do Brasil (BRT/BRST)
        br_tz = tz('America/Sao_Paulo')
        relatorio.data_aprovacao = datetime.now(br_tz).replace(tzinfo=None)
        
        db.session.commit()
        
        try:
            from notification_service import notification_service
            notification_service.criar_notificacao_express_aprovado(relatorio.id, current_user.id)
            logger.info(f"✅ Notificação de aprovação enviada ao autor do Relatório Express {relatorio.numero}")
        except Exception as notif_error:
            logger.error(f"⚠️ Erro ao criar notificação de aprovação: {notif_error}")
        
        # ========== GERAR PDF E ENVIAR EMAIL SÍNCRONO (MESMO SISTEMA DO NORMAL) ==========
        from pdf_generator_express import gerar_pdf_relatorio_express
        from email_service_unified import get_email_service
        
        pdf_path = None
        email_enviado = False
        mensagem_erro = ""
        
        # Gerar PDF
        try:
            logger.info(f"📄 Gerando PDF para {relatorio.numero}...")
            resultado_pdf = gerar_pdf_relatorio_express(relatorio.id, salvar_arquivo=True)
            
            if resultado_pdf.get('success'):
                pdf_path = resultado_pdf.get('path')
                logger.info(f"✅ PDF gerado: {pdf_path}")
            else:
                mensagem_erro = f"Erro ao gerar PDF: {resultado_pdf.get('error', 'Desconhecido')}"
                logger.warning(mensagem_erro)
        except Exception as pdf_err:
            mensagem_erro = f"Erro ao gerar PDF: {str(pdf_err)}"
            logger.error(mensagem_erro, exc_info=True)
        
        # Enviar emails
        emails_enviados = 0
        if pdf_path and os.path.exists(pdf_path):
            try:
                logger.info(f"📧 Enviando email para {relatorio.numero}...")
                email_service = get_email_service()
                resultado = email_service.send_approval_email(relatorio, pdf_path)
                emails_enviados = resultado.get('enviados', 0)
                
                if emails_enviados > 0:
                    total = resultado.get('total', 0)
                    flash(f'✅ Relatório Express {relatorio.numero} aprovado com sucesso! 📧 Email enviado para {emails_enviados}/{total} destinatário(s).', 'success')
                    logger.info(f"✅ Email enviado com sucesso para {emails_enviados}/{total} destinatário(s)")
                    email_enviado = True
                else:
                    mensagem_erro = f"Nenhum email enviado - verifique os destinatários"
                    flash(f'✅ Relatório aprovado! ⚠️ {mensagem_erro}', 'warning')
                    logger.warning(mensagem_erro)
            except Exception as email_err:
                mensagem_erro = f"Erro ao enviar email: {str(email_err)}"
                flash(f'✅ Relatório aprovado! ⚠️ {mensagem_erro}', 'warning')
                logger.error(mensagem_erro, exc_info=True)
        else:
            if mensagem_erro:
                flash(f'✅ Relatório aprovado! ⚠️ {mensagem_erro}', 'warning')
            else:
                flash(f'✅ Relatório Express {relatorio.numero} aprovado com sucesso!', 'success')
        
        return redirect(url_for('express_reports_list'))
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erro ao aprovar Relatório Express: {e}")
        flash('Erro ao aprovar relatório.', 'error')
        return redirect(url_for('express_reports_list'))


@app.route('/relatorio-express/<int:report_id>/rejeitar', methods=['POST'])
@login_required
def reject_express_report(report_id):
    """Rejeita um Relatório Express"""
    try:
        if not has_express_approval_permission():
            flash('Apenas aprovadores podem rejeitar relatórios.', 'error')
            return redirect(url_for('express_reports_list'))
        
        relatorio = RelatorioExpress.query.get_or_404(report_id)
        
        if relatorio.status != 'Aguardando Aprovação':
            flash('Este relatório não está aguardando aprovação.', 'warning')
            return redirect(url_for('express_reports_list'))
        
        comentario = request.form.get('comentario_rejeicao', '')
        
        relatorio.status = 'Rejeitado'
        relatorio.aprovador_id = current_user.id
        relatorio.comentario_aprovacao = comentario
        
        db.session.commit()
        
        try:
            from notification_service import notification_service
            notification_service.criar_notificacao_express_reprovado(relatorio.id, comentario)
            logger.info(f"✅ Notificação de rejeição enviada ao autor do Relatório Express {relatorio.numero}")
        except Exception as notif_error:
            logger.error(f"⚠️ Erro ao criar notificação de rejeição: {notif_error}")
        
        flash(f'Relatório Express {relatorio.numero} rejeitado.', 'info')
        return redirect(url_for('express_reports_list'))
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erro ao rejeitar Relatório Express: {e}")
        flash('Erro ao rejeitar relatório.', 'error')
        return redirect(url_for('express_reports_list'))


@app.route('/relatorio-express/<int:report_id>/excluir', methods=['POST'])
@login_required
def delete_express_report(report_id):
    """Exclui um Relatório Express"""
    try:
        relatorio = RelatorioExpress.query.get_or_404(report_id)
        
        if relatorio.status == 'Aprovado' and not current_user.is_master:
            flash('Relatórios aprovados não podem ser excluídos.', 'warning')
            return redirect(url_for('express_reports_list'))
        
        FotoRelatorioExpress.query.filter_by(relatorio_express_id=report_id).delete()
        
        db.session.delete(relatorio)
        db.session.commit()
        
        flash(f'Relatório Express {relatorio.numero} excluído.', 'success')
        return redirect(url_for('express_reports_list'))
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erro ao excluir Relatório Express: {e}")
        flash('Erro ao excluir relatório.', 'error')
        return redirect(url_for('express_reports_list'))


@app.route('/api/relatorios-express/autosave', methods=['POST'])
@login_required
def autosave_express_report_api():
    """API completa para autosave do Relatório Express - cria ou atualiza"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'Nenhum dado fornecido'}), 400
        
        relatorio_id = data.get('id')
        logger.info(f"📦 Express AutoSave - ID: {relatorio_id}, dados recebidos")
        
        if not relatorio_id:
            obra_nome = data.get('obra_nome', '').strip()
            if not obra_nome:
                return jsonify({'success': False, 'error': 'Nome da obra é obrigatório'}), 400
            
            numero = data.get('numero') or generate_express_number()
            existing = RelatorioExpress.query.filter_by(numero=numero).first()
            if existing:
                numero = generate_express_number()
            
            acompanhantes = data.get('acompanhantes', [])
            if isinstance(acompanhantes, str):
                try:
                    acompanhantes = json.loads(acompanhantes)
                except:
                    acompanhantes = []
            
            checklist_data = data.get('checklist_data')
            if checklist_data and not isinstance(checklist_data, str):
                checklist_data = json.dumps(checklist_data)
            
            relatorio = RelatorioExpress(
                numero=numero,
                titulo=data.get('titulo', 'Relatório Express de Visita'),
                empresa_nome=obra_nome,
                empresa_endereco=data.get('obra_endereco', ''),
                empresa_telefone=data.get('obra_telefone', ''),
                empresa_email=data.get('obra_email', ''),
                empresa_responsavel=data.get('obra_responsavel', ''),
                data_visita=datetime.now().date(),
                obra_nome=obra_nome,
                obra_endereco=data.get('obra_endereco', ''),
                obra_tipo=data.get('obra_tipo', ''),
                obra_construtora=data.get('obra_construtora', ''),
                obra_responsavel=data.get('obra_responsavel', ''),
                obra_email=data.get('obra_email', ''),
                obra_telefone=data.get('obra_telefone', ''),
                autor_id=current_user.id,
                criado_por=current_user.id,
                conteudo=data.get('conteudo', ''),
                observacoes_finais=data.get('observacoes_finais', ''),
                checklist_data=checklist_data,
                acompanhantes=acompanhantes,
                status='Em preenchimento'
            )
            
            # Processar informacoes_tecnicas
            informacoes_tecnicas = data.get('informacoes_tecnicas')
            if informacoes_tecnicas:
                if isinstance(informacoes_tecnicas, dict):
                    informacoes_tecnicas = json.dumps(informacoes_tecnicas)
                relatorio.informacoes_tecnicas = informacoes_tecnicas

            
            if data.get('data_relatorio'):
                try:
                    relatorio.data_relatorio = datetime.strptime(data['data_relatorio'], '%Y-%m-%d')
                except:
                    relatorio.data_relatorio = now_brt()
            
            db.session.add(relatorio)
            db.session.flush()
            relatorio_id = relatorio.id
            logger.info(f"✅ Express AutoSave: Novo relatório criado com ID {relatorio_id}")
        else:
            relatorio = RelatorioExpress.query.get(relatorio_id)
            if not relatorio:
                return jsonify({'success': False, 'error': 'Relatório não encontrado'}), 404
            
            campos = ['titulo', 'obra_nome', 'obra_endereco', 'obra_tipo', 'obra_construtora',
                      'obra_responsavel', 'obra_email', 'obra_telefone', 'conteudo', 'observacoes_finais', 'informacoes_tecnicas']
            for campo in campos:
                if campo in data:
                    value = data[campo]
                    if campo == 'informacoes_tecnicas' and isinstance(value, dict):
                        value = json.dumps(value)
                    setattr(relatorio, campo, value)
            
            if 'obra_nome' in data:
                relatorio.empresa_nome = data['obra_nome']
            if 'obra_endereco' in data:
                relatorio.empresa_endereco = data['obra_endereco']
            if 'obra_telefone' in data:
                relatorio.empresa_telefone = data['obra_telefone']
            if 'obra_email' in data:
                relatorio.empresa_email = data['obra_email']
            if 'obra_responsavel' in data:
                relatorio.empresa_responsavel = data['obra_responsavel']
            
            if 'acompanhantes' in data:
                acompanhantes = data['acompanhantes']
                if isinstance(acompanhantes, str):
                    try:
                        acompanhantes = json.loads(acompanhantes)
                    except:
                        acompanhantes = []
                relatorio.acompanhantes = acompanhantes
            
            if 'checklist_data' in data:
                checklist_data = data['checklist_data']
                if checklist_data and not isinstance(checklist_data, str):
                    checklist_data = json.dumps(checklist_data)
                relatorio.checklist_data = checklist_data
            
            relatorio.atualizado_por = current_user.id
            relatorio.updated_at = datetime.now()
            logger.info(f"✅ Express AutoSave: Relatório {relatorio_id} atualizado")
        
        imagens_resultado = []
        if 'fotos' in data and data['fotos']:
            TEMP_UPLOAD_FOLDER = os.path.join(app.config.get('UPLOAD_FOLDER', 'uploads'), 'temp')
            import glob as globlib
            import hashlib
            
            for foto_info in data['fotos']:
                if foto_info.get('deletar'):
                    foto_id = foto_info.get('id')
                    if foto_id:
                        foto = FotoRelatorioExpress.query.get(foto_id)
                        if foto and foto.relatorio_express_id == relatorio_id:
                            db.session.delete(foto)
                            logger.info(f"📸 Express AutoSave: Foto {foto_id} removida")
                    continue
                
                if not foto_info.get('id') and foto_info.get('temp_id'):
                    temp_id = foto_info['temp_id']
                    temp_pattern = os.path.join(TEMP_UPLOAD_FOLDER, f"{temp_id}.*")
                    matching_files = globlib.glob(temp_pattern)
                    
                    if matching_files:
                        temp_filepath = matching_files[0]
                        extension = temp_filepath.rsplit('.', 1)[1].lower() if '.' in temp_filepath else 'jpg'
                        
                        with open(temp_filepath, 'rb') as f:
                            imagem_data = f.read()
                        
                        imagem_hash = hashlib.sha256(imagem_data).hexdigest()
                        
                        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S%f')
                        filename = f"express_{relatorio_id}_{timestamp}.{extension}"
                        upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
                        filepath = os.path.join(upload_folder, filename)
                        
                        import shutil
                        shutil.copy(temp_filepath, filepath)
                        
                        max_ordem = db.session.query(db.func.max(FotoRelatorioExpress.ordem)).filter_by(
                            relatorio_express_id=relatorio_id
                        ).scalar() or 0
                        
                        nova_foto = FotoRelatorioExpress(
                            relatorio_express_id=relatorio_id,
                            filename=filename,
                            url=f"/uploads/{filename}",
                            legenda=foto_info.get('caption', ''),
                            local=foto_info.get('local', ''),
                            ordem=max_ordem + 1,
                            imagem=imagem_data,
                            imagem_hash=imagem_hash,
                            content_type=f"image/{extension}",
                            imagem_size=len(imagem_data)
                        )
                        db.session.add(nova_foto)
                        db.session.flush()
                        
                        imagens_resultado.append({
                            'id': nova_foto.id,
                            'temp_id': temp_id,
                            'url': nova_foto.url,
                            'legenda': nova_foto.legenda
                        })
                        
                        try:
                            os.remove(temp_filepath)
                        except:
                            pass
                        
                        logger.info(f"📸 Express AutoSave: Nova foto salva ID {nova_foto.id}")
                
                elif foto_info.get('id'):
                    foto_id = foto_info['id']
                    foto = FotoRelatorioExpress.query.get(foto_id)
                    if foto and foto.relatorio_express_id == relatorio_id:
                        if 'caption' in foto_info:
                            foto.legenda = foto_info['caption']
                        if 'local' in foto_info:
                            foto.local = foto_info['local']
                        if 'ordem' in foto_info:
                            foto.ordem = foto_info['ordem']
                        
                        imagens_resultado.append({
                            'id': foto.id,
                            'url': foto.url,
                            'legenda': foto.legenda
                        })
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Salvo automaticamente',
            'relatorio_id': relatorio_id,
            'imagens': imagens_resultado,
            'saved_at': datetime.now().isoformat()
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"❌ Erro no Express AutoSave: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/relatorios-express/<int:report_id>/submit-approval', methods=['POST'])
@login_required
def submit_express_for_approval(report_id):
    """Envia Relatório Express para aprovação via API"""
    try:
        relatorio = RelatorioExpress.query.get_or_404(report_id)
        
        if relatorio.status == 'Aprovado':
            return jsonify({'success': False, 'error': 'Relatório já está aprovado'}), 400
        
        relatorio.status = 'Aguardando Aprovação'
        relatorio.atualizado_por = current_user.id
        relatorio.updated_at = datetime.now()
        
        db.session.commit()
        
        # Enviar notificação para o aprovador global
        try:
            from notification_service import notification_service
            notification_service.criar_notificacao_express_pendente(relatorio.id)
            logger.info(f"✅ Notificação de aprovação pendente enviada para Relatório Express {relatorio.numero}")
        except Exception as notif_error:
            logger.error(f"⚠️ Erro ao criar notificação: {notif_error}")
        
        return jsonify({
            'success': True,
            'message': f'Relatório {relatorio.numero} enviado para aprovação',
            'status': relatorio.status
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erro ao enviar Express para aprovação: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/relatorio-express/<int:report_id>/duplicar')
@login_required
def duplicate_express_report(report_id):
    """Duplica um Relatório Express aprovado - abre formulário com dados preenchidos"""
    try:
        relatorio_original = RelatorioExpress.query.get_or_404(report_id)
        
        next_numero = generate_express_number()
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Carregar checklist_data do relatório original (garantir que é lista)
        checklist_data = []
        if relatorio_original.checklist_data:
            try:
                if isinstance(relatorio_original.checklist_data, str):
                    checklist_data = json.loads(relatorio_original.checklist_data)
                elif isinstance(relatorio_original.checklist_data, list):
                    checklist_data = relatorio_original.checklist_data
            except:
                checklist_data = []
        
        # Carregar acompanhantes (garantir que é lista)
        acompanhantes = []
        if relatorio_original.acompanhantes:
            try:
                if isinstance(relatorio_original.acompanhantes, str):
                    acompanhantes = json.loads(relatorio_original.acompanhantes)
                elif isinstance(relatorio_original.acompanhantes, list):
                    acompanhantes = relatorio_original.acompanhantes
            except:
                acompanhantes = []
        
        # Preparar dados pré-preenchidos com todas as informações da obra
        report_data = {
            'id': None,  # Novo relatório
            'numero': next_numero,
            'titulo': relatorio_original.titulo,
            'status': 'Em preenchimento',
            'obra_nome': relatorio_original.obra_nome or '',
            'obra_endereco': relatorio_original.obra_endereco or '',
            'obra_tipo': relatorio_original.obra_tipo or '',
            'obra_construtora': relatorio_original.obra_construtora or '',
            'obra_responsavel': relatorio_original.obra_responsavel or '',
            'obra_email': relatorio_original.obra_email or '',
            'obra_telefone': relatorio_original.obra_telefone or '',
            'conteudo': '',  # Novo conteúdo
            'acompanhantes': acompanhantes,
            'informacoes_tecnicas': relatorio_original.informacoes_tecnicas,
            'checklist_data': checklist_data,  # Duplicar checklist
            'imagens': [],  # Sem fotos (novo relatório)
            'duplicado_de': relatorio_original.numero
        }
        
        flash(f'Criando novo relatório baseado em {relatorio_original.numero}. Dados da obra e checklist foram copiados.', 'info')
        
        return render_template('reports/express_form.html',
            report_data=report_data,
            edit_mode=False,
            existing_report=None,
            next_numero=next_numero,
            today=today,
            is_duplicate=True,
            checklist_items=ChecklistPadrao.query.filter_by(ativo=True).order_by(ChecklistPadrao.ordem).all()
        )
    except Exception as e:
        logger.error(f"Erro ao duplicar Relatório Express: {e}")
        flash('Erro ao duplicar relatório.', 'error')
        return redirect(url_for('express_reports_list'))


@app.route('/relatorio-express/<int:report_id>/pdf')
@login_required
def generate_express_pdf(report_id):
    """Gera PDF do Relatório Express - Visualização Inline"""
    try:
        from flask import Response
        from pdf_generator_express import gerar_pdf_relatorio_express
        
        relatorio_express = RelatorioExpress.query.get_or_404(report_id)
        
        # Gerar PDF em memória usando o gerador centralizado (que contém as correções de data)
        pdf_io = gerar_pdf_relatorio_express(relatorio_express, salvar_arquivo=False)
        
        # Sanitizar nome
        import re
        def sanitize(name):
            if not name: return 'express'
            return re.sub(r'[^\w\s-]', '', name).strip().replace(' ', '_')[:50]
            
        obra_nome = sanitize(relatorio_express.obra_nome)
        filename = f"relatorio_express_{relatorio_express.numero.replace('/', '_')}_{obra_nome}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        return Response(
            pdf_io.getvalue(),
            mimetype='application/pdf',
            headers={
                'Content-Disposition': f'inline; filename="{filename}"',
                'Content-Type': 'application/pdf'
            }
        )
        
    except Exception as e:
        logger.error(f"Erro ao gerar PDF do Relatório Express: {e}", exc_info=True)
        flash(f'Erro ao gerar PDF: {str(e)}', 'error')
        return redirect(url_for('view_express_report', report_id=report_id))


@app.route('/relatorio-express/<int:report_id>/pdf/download')
@login_required
def download_express_pdf(report_id):
    """Baixa PDF do Relatório Express - Visualização Download"""
    try:
        from flask import Response
        from pdf_generator_express import gerar_pdf_relatorio_express
        
        relatorio_express = RelatorioExpress.query.get_or_404(report_id)
        
        # Gerar PDF em memória
        pdf_io = gerar_pdf_relatorio_express(relatorio_express, salvar_arquivo=False)
        
        # Sanitizar nome
        import re
        def sanitize(name):
            if not name: return 'express'
            return re.sub(r'[^\w\s-]', '', name).strip().replace(' ', '_')[:50]
            
        obra_nome = sanitize(relatorio_express.obra_nome)
        filename = f"relatorio_express_{relatorio_express.numero.replace('/', '_')}_{obra_nome}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        return Response(
            pdf_io.getvalue(),
            mimetype='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Type': 'application/pdf'
            }
        )
        
    except Exception as e:
        logger.error(f"Erro ao baixar PDF do Relatório Express: {e}", exc_info=True)
        flash(f'Erro ao gerar PDF: {str(e)}', 'error')
        return redirect(url_for('view_express_report', report_id=report_id))


logger.info("✅ Rotas de Relatório Express carregadas com sucesso")
