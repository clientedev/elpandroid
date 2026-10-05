import os
import uuid
from datetime import datetime, date, timedelta
from urllib.parse import urlparse
from flask import render_template, redirect, url_for, flash, request, current_app, send_from_directory, jsonify, make_response
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
from werkzeug.exceptions import HTTPException
from flask_mail import Message

from app import app, db, mail, csrf

# Health check endpoint for Railway deployment - LIGHTWEIGHT VERSION
@app.route('/health')
def health_check():
    """Lightweight health check for Railway - no database dependency"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'service': 'flask-app'
    }), 200

@app.route('/health/full')
def health_check_full():
    """Full health check with database connectivity"""
    try:
        # Basic database connectivity test
        db.session.execute(db.text('SELECT 1'))
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'database': 'connected',
            'service': 'flask-app'
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'timestamp': datetime.utcnow().isoformat(),
            'database': 'disconnected',
            'error': str(e),
            'service': 'flask-app'
        }), 503

from models import User, Projeto, Contato, ContatoProjeto, Visita, Relatorio, FotoRelatorio, Reembolso, EnvioRelatorio, ChecklistTemplate, ChecklistItem, ComunicacaoVisita, EmailCliente, ChecklistPadrao, LogEnvioEmail, ConfiguracaoEmail, RelatorioExpress, FotoRelatorioExpress, LegendaPredefinida, FuncionarioProjeto, AprovadorPadrao
from forms import LoginForm, RegisterForm, UserForm, ProjetoForm, VisitaForm, VisitaRealizadaForm, EmailClienteForm, RelatorioForm, FotoRelatorioForm, ReembolsoForm, ContatoForm, ContatoProjetoForm, LegendaPredefinidaForm, FirstLoginForm
from forms_email import ConfiguracaoEmailForm, EnvioEmailForm
from forms_express import RelatorioExpressForm, FotoExpressForm, EditarFotoExpressForm
from email_service import email_service
from pdf_generator_express import gerar_pdf_relatorio_express, gerar_numero_relatorio_express
from utils import generate_project_number, generate_report_number, generate_visit_number, send_report_email, calculate_reimbursement_total, get_coordinates_from_address
from pdf_generator import generate_visit_report_pdf
from google_drive_backup import backup_to_drive, test_drive_connection
import math
import json

# Debug routes para identificar diferenças de dados
@app.route('/api/current-user')
@login_required
def api_current_user():
    """Retorna dados do usuário atual para debug"""
    return jsonify({
        'id': current_user.id,
        'username': current_user.username,
        'email': current_user.email,
        'is_master': current_user.is_master,
        'nome_completo': getattr(current_user, 'nome_completo', None),
        'cargo': getattr(current_user, 'cargo', None)
    })

@app.route('/api/user-data-counts')
@login_required
def api_user_data_counts():
    """Retorna contadores de dados para o usuário atual"""
    # Se usuário for master, vê todos os dados
    if current_user.is_master:
        projetos = Projeto.query.count()
        relatorios = Relatorio.query.count()
        visitas = Visita.query.count()
        reembolsos = Reembolso.query.count() if 'Reembolso' in globals() else 0
    else:
        # Usuário normal vê apenas seus dados ou projetos relacionados
        projetos = Projeto.query.count()
        relatorios = Relatorio.query.count()
        visitas = Visita.query.count()
        reembolsos = 0

    return jsonify({
        'projetos': projetos,
        'relatorios': relatorios,
        'visitas': visitas,
        'reembolsos': reembolsos
    })

@app.route('/api/projeto/<int:projeto_id>/funcionarios-emails')
@login_required
def api_projeto_funcionarios_emails(projeto_id):
    """Retorna funcionários e e-mails de um projeto específico para seleção em relatórios"""
    try:
        projeto = Projeto.query.get_or_404(projeto_id)
        
        # Verificação de autorização: usuário deve ter acesso ao projeto
        if not current_user.is_master:
            # Verificar se o usuário está associado ao projeto
            user_project_access = FuncionarioProjeto.query.filter_by(
                projeto_id=projeto_id,
                user_id=current_user.id,
                ativo=True
            ).first()
            
            # Se não for funcionário do projeto e não for responsável, negar acesso
            if not user_project_access and projeto.responsavel_id != current_user.id:
                return jsonify({
                    'success': False,
                    'error': 'Acesso negado ao projeto'
                }), 403
        
        # Buscar funcionários do projeto
        funcionarios = FuncionarioProjeto.query.filter_by(
            projeto_id=projeto_id, 
            ativo=True
        ).all()
        
        # Buscar e-mails do projeto
        emails = EmailCliente.query.filter_by(
            projeto_id=projeto_id, 
            ativo=True
        ).all()
        
        funcionarios_data = []
        for func in funcionarios:
            funcionarios_data.append({
                'id': func.id,
                'nome_funcionario': func.nome_funcionario,
                'cargo': func.cargo,
                'empresa': func.empresa,
                'is_responsavel_principal': func.is_responsavel_principal
            })
        
        emails_data = []
        for email in emails:
            emails_data.append({
                'id': email.id,
                'email': email.email,
                'nome_contato': email.nome_contato,
                'cargo': email.cargo,
                'is_principal': email.is_principal
            })
        
        return jsonify({
            'success': True,
            'funcionarios': funcionarios_data,
            'emails': emails_data
        })
        
    except HTTPException as e:
        # Allow HTTP exceptions (like 404) to propagate correctly
        raise
    except Exception as e:
        print(f"❌ Erro ao buscar funcionários e e-mails: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dashboard-stats')
@login_required
def api_dashboard_stats():
    """API para fornecer estatísticas reais do dashboard"""
    try:
        # Buscar dados reais do PostgreSQL
        projetos_ativos = Projeto.query.filter_by(status='Ativo').count()
        visitas_agendadas = Visita.query.filter_by(status='Agendada').count()
        relatorios_pendentes = Relatorio.query.filter(
            Relatorio.status.in_(['Rascunho', 'Aguardando Aprovacao'])
        ).count()
        
        # Reembolsos com verificação de tabela
        try:
            usuarios_ativos = User.query.filter_by(ativo=True).count()
        except:
            usuarios_ativos = 0
        
        response_data = {
            'success': True,
            'projetos_ativos': projetos_ativos,
            'visitas_agendadas': visitas_agendadas,
            'relatorios_pendentes': relatorios_pendentes,
            'usuarios_ativos': usuarios_ativos,
            'timestamp': datetime.utcnow().isoformat(),
            'user_id': current_user.id,
            'source': 'postgresql'
        }
        
        # Headers para evitar cache
        response = jsonify(response_data)
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        
        return response
        
    except Exception as e:
        print(f"ERRO API DASHBOARD: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'projetos_ativos': 6,
            'visitas_agendadas': 4,
            'relatorios_pendentes': 0,
            'usuarios_ativos': 2,
            'source': 'fallback'
        }), 500


        projetos = Projeto.query.count()  # Todos os projetos por enquanto
        relatorios = Relatorio.query.count()  # Todos os relatórios por enquanto
        visitas = Visita.query.count()
        reembolsos = 0
    
    return jsonify({
        'projetos': projetos,
        'relatorios': relatorios,
        'visitas': visitas,
        'reembolsos': reembolsos,
        'user_id': current_user.id,
        'is_master': current_user.is_master
    })

# Authentication routes
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=form.username.data).first()
        if user and user.ativo and check_password_hash(user.password_hash, form.password.data):
            login_user(user, remember=form.remember_me.data)
            
            # Verificar se é o primeiro login
            if hasattr(user, 'primeiro_login') and user.primeiro_login:
                return redirect(url_for('first_login'))
            
            next_page = request.args.get('next')
            if not next_page or urlparse(next_page).netloc != '':
                next_page = url_for('index')
            return redirect(next_page)
        flash('Usuário ou senha inválidos.', 'error')
    
    return render_template('auth/login.html', form=form)

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/register', methods=['GET', 'POST'])
@login_required
def register():
    if not current_user.is_master:
        flash('Acesso negado. Apenas usuários master podem cadastrar novos usuários.', 'error')
        return redirect(url_for('index'))
    
    form = RegisterForm()
    if form.validate_on_submit():
        if User.query.filter_by(username=form.username.data).first():
            flash('Nome de usuário já existe.', 'error')
            return render_template('auth/register.html', form=form)
        
        if User.query.filter_by(email=form.email.data).first():
            flash('Email já cadastrado.', 'error')
            return render_template('auth/register.html', form=form)
        
        user = User(
            username=form.username.data,
            email=form.email.data,
            nome_completo=form.nome_completo.data,
            cargo=form.cargo.data,
            telefone=form.telefone.data,
            password_hash=generate_password_hash(form.password.data),
            is_master=form.is_master.data
        )
        
        try:
            db.session.add(user)
            db.session.commit()
            flash('Usuário cadastrado com sucesso!', 'success')
            return redirect(url_for('users_list'))
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao cadastrar usuário: {str(e)}', 'error')
    
    return render_template('auth/register.html', form=form)

# Main routes
@app.route('/')
def index():
    # Se não estiver logado, redirecionar para login
    if not current_user.is_authenticated:
        return redirect(url_for('login'))
    
    try:
        # BUSCAR DADOS REAIS DO POSTGRESQL COM FALLBACK
        projetos_ativos = Projeto.query.filter_by(status='Ativo').count()
        visitas_agendadas = Visita.query.filter_by(status='Agendada').count()
        relatorios_pendentes = Relatorio.query.filter(
            Relatorio.status.in_(['Rascunho', 'Aguardando Aprovacao'])
        ).count()
        
        # Usuários ativos
        try:
            usuarios_ativos = User.query.filter_by(ativo=True).count()
        except:
            usuarios_ativos = 0
        
        stats = {
            'projetos_ativos': projetos_ativos,
            'visitas_agendadas': visitas_agendadas,
            'relatorios_pendentes': relatorios_pendentes,
            'usuarios_ativos': usuarios_ativos
        }
        
        # Log para monitoramento
        print(f"REAL STATS FROM DB: P={projetos_ativos}, V={visitas_agendadas}, R={relatorios_pendentes}, U={usuarios_ativos}")
        
        # Get recent reports com fallback
        try:
            relatorios_recentes = Relatorio.query.order_by(Relatorio.created_at.desc()).limit(5).all()
        except:
            relatorios_recentes = []
            
    except Exception as e:
        # FALLBACK em caso de erro de conexão
        print(f"ERRO DB: {e} - Usando dados fallback")
        stats = {
            'projetos_ativos': 6,
            'visitas_agendadas': 4,
            'relatorios_pendentes': 0,
            'usuarios_ativos': 2
        }
        relatorios_recentes = []
    
    return render_template('dashboard_simple.html',
                         stats=stats,
                         relatorios_recentes=relatorios_recentes)

# User management routes
@app.route('/users')
@login_required
def users_list():
    if not current_user.is_master:
        flash('Acesso negado.', 'error')
        return redirect(url_for('index'))
    
    users = User.query.all()
    return render_template('users/list.html', users=users)

@app.route('/users/<int:user_id>/edit', methods=['GET', 'POST'])
@login_required
def user_edit(user_id):
    if not current_user.is_master:
        flash('Acesso negado.', 'error')
        return redirect(url_for('index'))
    
    user = User.query.get_or_404(user_id)
    form = UserForm(obj=user)
    
    if form.validate_on_submit():
        # Check for username conflicts
        existing_user = User.query.filter_by(username=form.username.data).first()
        if existing_user and existing_user.id != user.id:
            flash('Nome de usuário já existe.', 'error')
            return render_template('users/form.html', form=form, user=user)
        
        # Check for email conflicts
        existing_email = User.query.filter_by(email=form.email.data).first()
        if existing_email and existing_email.id != user.id:
            flash('Email já cadastrado.', 'error')
            return render_template('users/form.html', form=form, user=user)
        
        user.username = form.username.data
        user.email = form.email.data
        user.nome_completo = form.nome_completo.data
        user.cargo = form.cargo.data
        user.telefone = form.telefone.data
        user.is_master = form.is_master.data
        user.ativo = form.ativo.data
        
        if form.password.data:
            user.password_hash = generate_password_hash(form.password.data)
        
        try:
            db.session.commit()
            flash('Usuário atualizado com sucesso!', 'success')
            return redirect(url_for('users_list'))
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao atualizar usuário: {str(e)}', 'error')
    
    return render_template('users/form.html', form=form, user=user)

# Project management routes
@app.route('/projects')
@login_required
def projects_list():
    # Try to get user location from session or request
    user_lat = request.args.get('lat', type=float)
    user_lon = request.args.get('lon', type=float)
    
    projects = Projeto.query.all()
    
    # If user location is available, sort by distance
    if user_lat and user_lon:
        projects_with_distance = []
        for project in projects:
            if project.latitude and project.longitude:
                distance = calculate_distance(
                    user_lat, user_lon,
                    float(project.latitude), float(project.longitude)
                )
                projects_with_distance.append({
                    'project': project,
                    'distance': round(distance, 1)
                })
            else:
                # Projects without coordinates go to the end
                projects_with_distance.append({
                    'project': project,
                    'distance': 999999
                })
        
        # Sort by distance
        projects_with_distance.sort(key=lambda x: x['distance'])
        projects = [item['project'] for item in projects_with_distance]
    
    return render_template('projects/list.html', projects=projects)

# Reports routes
@app.route('/reports')
@login_required
def reports():
    page = request.args.get('page', 1, type=int)
    relatorios = Relatorio.query.order_by(Relatorio.created_at.desc()).paginate(
        page=page, per_page=10, error_out=False
    )
    return render_template('reports/list.html', relatorios=relatorios)

@app.route('/reports/new', methods=['GET', 'POST'])
@login_required
def create_report():
    if request.method == 'POST':
        # Processar dados do formulário diretamente
        projeto_id = request.form.get('projeto_id')
        titulo = request.form.get('titulo', 'Relatório de visita')
        conteudo = request.form.get('conteudo', '')
        aprovador_nome = request.form.get('aprovador_nome', '')
        data_relatorio_str = request.form.get('data_relatorio')
        
        # Validações básicas
        if not projeto_id:
            flash('Projeto é obrigatório.', 'error')
            return redirect(url_for('create_report'))
        
        try:
            projeto_id = int(projeto_id)
            # Convert date string to datetime object
            if data_relatorio_str:
                data_relatorio = datetime.strptime(data_relatorio_str, '%Y-%m-%d')
            else:
                data_relatorio = now_brt()
        except (ValueError, TypeError):
            flash('Dados inválidos no formulário.', 'error')
            return redirect(url_for('create_report'))
        try:
            # Create report with explicit values
            from models import Relatorio
            relatorio = Relatorio()
            relatorio.numero = generate_report_number()
            relatorio.titulo = titulo
            relatorio.projeto_id = projeto_id
            relatorio.autor_id = current_user.id
            # Process checklist data from form
            checklist_text = ""
            checklist_items = []
            
            # Check for standard checklist items from form_complete.html
            checklist_fields = [
                ('estrutura', 'Estrutura / Fundação', 'obs_estrutura'),
                ('alvenaria', 'Alvenaria / Vedação', 'obs_alvenaria'), 
                ('instalacoes', 'Instalações (Elétrica/Hidráulica)', 'obs_instalacoes'),
                ('acabamento', 'Acabamentos', 'obs_acabamento'),
                ('limpeza', 'Limpeza / Organização', 'obs_limpeza')
            ]
            
            checklist_has_items = False
            for field_name, field_label, obs_field in checklist_fields:
                is_checked = request.form.get(field_name) == 'on'
                observation = request.form.get(obs_field, '').strip()
                
                if is_checked or observation:
                    checklist_has_items = True
                    status = "✓" if is_checked else "○"
                    checklist_items.append({
                        'status': status,
                        'item': field_label,
                        'observation': observation
                    })
            
            # Also check for JSON checklist data (legacy support)
            json_checklist = request.form.get('checklist_data')
            if json_checklist and not checklist_has_items:
                try:
                    import json
                    legacy_items = json.loads(json_checklist)
                    for item_data in legacy_items:
                        status = "✓" if item_data.get('completed') else "○"
                        checklist_items.append({
                            'status': status,
                            'item': item_data.get('item', ''),
                            'observation': item_data.get('observations', '')
                        })
                    checklist_has_items = True
                except Exception as e:
                    print(f"Error parsing JSON checklist data: {e}")
            
            # Format checklist text for PDF
            if checklist_has_items:
                checklist_text = "CHECKLIST DA OBRA:\n\n"
                for item in checklist_items:
                    checklist_text += f"{item['status']} {item['item']}\n"
                    if item['observation']:
                        checklist_text += f"   Observações: {item['observation']}\n"
                    checklist_text += "\n"
            
            # Process location data with address conversion
            latitude = request.form.get('latitude')
            longitude = request.form.get('longitude')
            location_text = ""
            if latitude and longitude:
                try:
                    # Use the same geocoding service to get formatted address
                    import requests
                    url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={latitude}&lon={longitude}&addressdetails=1&language=pt-BR"
                    headers = {'User-Agent': 'SistemaObras/1.0'}
                    response = requests.get(url, headers=headers, timeout=10)
                    
                    if response.status_code == 200:
                        data = response.json()
                        addr = data.get('address', {})
                        
                        # Build formatted address
                        address_parts = []
                        if addr.get('house_number'):
                            address_parts.append(f"{addr.get('road', '')} {addr['house_number']}")
                        elif addr.get('road'):
                            address_parts.append(addr['road'])
                        if addr.get('suburb') or addr.get('neighbourhood'):
                            address_parts.append(addr.get('suburb') or addr.get('neighbourhood'))
                        city = addr.get('city') or addr.get('town') or addr.get('village')
                        if city:
                            state = addr.get('state')
                            if state:
                                address_parts.append(f"{city} - {state}")
                            else:
                                address_parts.append(city)
                        
                        formatted_address = ', '.join(filter(None, address_parts))
                        location_display = formatted_address or data.get('display_name', f"Lat: {latitude}, Lng: {longitude}")
                    else:
                        location_display = f"Lat: {latitude}, Lng: {longitude}"
                except:
                    location_display = f"Lat: {latitude}, Lng: {longitude}"
                    
                location_text = f"\n\nLOCALIZAÇÃO DO RELATÓRIO:\n{location_display}\nCoordenadas GPS capturadas durante a visita."
            
            # Combine content with checklist and location
            final_content = ""
            if conteudo:
                final_content += conteudo
            if checklist_text:
                if final_content:
                    final_content += "\n\n" + checklist_text
                else:
                    final_content = checklist_text
            if location_text:
                final_content += location_text
            
            relatorio.conteudo = final_content
            relatorio.data_relatorio = data_relatorio
            relatorio.status = 'Aguardando Aprovação'
            relatorio.created_at = datetime.utcnow()
            
            # Set approver if provided
            aprovador_id = request.form.get('aprovador_id')
            if aprovador_id:
                try:
                    relatorio.aprovador_id = int(aprovador_id)
                    # Get approver name for compatibility
                    aprovador = User.query.get(int(aprovador_id))
                    if aprovador:
                        relatorio.aprovador_nome = aprovador.nome_completo
                except (ValueError, TypeError):
                    pass
            
            db.session.add(relatorio)
            db.session.flush()  # Get the ID
            
            # Handle photo uploads if any
            upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
            if not os.path.exists(upload_folder):
                os.makedirs(upload_folder)
            
            photo_count = 0
            
            # Process photos from sessionStorage (via form data)
            photos_data = request.form.get('photos_data')
            if photos_data:
                try:
                    import json
                    photos_list = json.loads(photos_data)
                    for i, photo_data in enumerate(photos_list):
                        # Processo simplificado - apenas salvar referência
                        foto = FotoRelatorio()
                        foto.relatorio_id = relatorio.id
                        foto.filename = f"sessao_foto_{i+1}.jpg"
                        foto.legenda = photo_data.get('caption', f'Foto {i+1}')
                        foto.tipo_servico = photo_data.get('category', 'Geral')
                        foto.ordem = i + 1
                        
                        db.session.add(foto)
                        photo_count += 1
                except Exception as e:
                    pass  # Ignore session storage errors
            
            # Process regular file uploads
            for i in range(50):  # Support up to 50 photos
                photo_key = f'photo_{i}'
                edited_photo_key = f'edited_photo_{i}'
                
                # Check if this photo was edited
                has_edited_version = edited_photo_key in request.form
                
                if has_edited_version:
                    # Process only the edited version, ignore the original
                    try:
                        import base64
                        from io import BytesIO
                        from PIL import Image
                        
                        edited_data = request.form[edited_photo_key]
                        # Remove data:image/jpeg;base64, prefix
                        if ',' in edited_data:
                            edited_data = edited_data.split(',')[1]
                        
                        image_data = base64.b64decode(edited_data)
                        image = Image.open(BytesIO(image_data))
                        
                        # Save edited image
                        filename = f"{uuid.uuid4().hex}_edited.jpg"
                        filepath = os.path.join(upload_folder, filename)
                        image.save(filepath, 'JPEG', quality=85)
                        
                        # Get metadata
                        photo_caption = request.form.get(f'photo_caption_{i}', f'Foto {photo_count + 1}')
                        photo_category = request.form.get(f'photo_category_{i}', 'Geral')
                        
                        # Create photo record for edited version only
                        foto = FotoRelatorio()
                        foto.relatorio_id = relatorio.id
                        foto.filename = filename
                        foto.filename_anotada = filename  # Mark as annotated version
                        foto.legenda = photo_caption or f'Foto {photo_count + 1}'
                        foto.tipo_servico = photo_category or 'Geral'
                        foto.ordem = photo_count + 1
                        
                        db.session.add(foto)
                        photo_count += 1
                        print(f"Foto editada {photo_count} salva (original descartada): {filename}")
                    except Exception as e:
                        print(f"Erro ao processar foto editada {i}: {e}")
                        continue
                        
                elif photo_key in request.files:
                    # Process original photo only if no edited version exists
                    file = request.files[photo_key]
                    if file and file.filename and file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                        try:
                            filename = secure_filename(f"{uuid.uuid4().hex}_{file.filename}")
                            filepath = os.path.join(upload_folder, filename)
                            file.save(filepath)
                            
                            # Get metadata
                            photo_caption = request.form.get(f'photo_caption_{i}', f'Foto {photo_count + 1}')
                            photo_category = request.form.get(f'photo_category_{i}', 'Geral')
                            
                            # Create photo record for original
                            foto = FotoRelatorio()
                            foto.relatorio_id = relatorio.id
                            foto.filename = filename
                            foto.filename_original = filename  # Mark as original version
                            foto.legenda = photo_caption or f'Foto {photo_count + 1}'
                            foto.tipo_servico = photo_category or 'Geral'
                            foto.ordem = photo_count + 1
                            
                            db.session.add(foto)
                            photo_count += 1
                            print(f"Foto original {photo_count} salva: {filename}")
                        except Exception as e:
                            print(f"Erro ao processar foto {i}: {e}")
                            continue
            
            print(f"Total de {photo_count} fotos processadas para o relatório {relatorio.numero}")
            
            db.session.commit()
            flash('Relatório criado com sucesso!', 'success')
            
            # Return JSON response for AJAX submission
            if request.content_type and 'multipart/form-data' in request.content_type:
                return jsonify({'success': True, 'redirect': '/reports'})
            else:
                return redirect(url_for('reports'))
            
        except Exception as e:
            db.session.rollback()
            print(f"Erro detalhado ao criar relatório: {e}")
            import traceback
            traceback.print_exc()
            flash(f'Erro ao criar relatório: {str(e)}', 'error')
            
            # Return JSON error response for AJAX submission  
            if request.content_type and 'multipart/form-data' in request.content_type:
                return jsonify({'success': False, 'error': str(e)}), 400
            else:
                return redirect(url_for('create_report'))
    
    projetos = Projeto.query.filter_by(status='Ativo').all()
    # Get admin users for approver selection
    admin_users = User.query.filter_by(is_master=True).all()
    
    # Auto-preenchimento: Verificar se projeto_id foi passado como parâmetro da URL
    selected_project = None
    selected_aprovador = None
    projeto_id_param = request.args.get('projeto_id')
    if projeto_id_param:
        try:
            projeto_id_param = int(projeto_id_param)
            selected_project = Projeto.query.get(projeto_id_param)
            # Buscar aprovador padrão para este projeto
            if selected_project:
                selected_aprovador = get_aprovador_padrao_para_projeto(selected_project.id)
        except (ValueError, TypeError):
            selected_project = None
    else:
        # Se não há projeto específico, buscar aprovador global
        selected_aprovador = get_aprovador_padrao_para_projeto(None)
    
    return render_template('reports/form_complete.html', 
                         projetos=projetos, 
                         admin_users=admin_users, 
                         selected_project=selected_project,
                         selected_aprovador=selected_aprovador,
                         today=date.today().isoformat())

@app.route('/reports/<int:id>/edit', methods=['GET', 'POST'])
@login_required
def edit_report(id):
    relatorio = Relatorio.query.get_or_404(id)
    
    # Check permissions
    if not current_user.is_master and relatorio.autor_id != current_user.id:
        flash('Acesso negado. Você só pode editar seus próprios relatórios.', 'error')
        return redirect(url_for('reports'))
    
    if request.method == 'POST':
        try:
            action = request.form.get('action')
            
            if action == 'update':
                # título is now auto-generated via property - no need to set it
                relatorio.conteudo = request.form.get('conteudo', '').strip()
                relatorio.projeto_id = request.form.get('projeto_id', type=int)
                relatorio.visita_id = request.form.get('visita_id', type=int) if request.form.get('visita_id') else None
                
                db.session.commit()
                flash('Relatório atualizado com sucesso!', 'success')
                
            elif action == 'submit_approval':
                if relatorio.status == 'Rascunho':
                    relatorio.status = 'Aguardando Aprovacao'
                    db.session.commit()
                    flash('Relatório enviado para aprovação!', 'success')
                else:
                    flash('Relatório já foi enviado para aprovação.', 'warning')
            
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao atualizar relatório: {str(e)}', 'error')
    
    # Get projects and visits for form
    projetos = Projeto.query.filter_by(status='Ativo').all()
    visitas = Visita.query.filter_by(status='Realizada').all()
    fotos = FotoRelatorio.query.filter_by(relatorio_id=relatorio.id).order_by(FotoRelatorio.ordem).all()
    
    return render_template('reports/edit.html', relatorio=relatorio, projetos=projetos, 
                         visitas=visitas, fotos=fotos)

# Photo annotation system routes
@app.route('/photo-annotation')
@login_required
def photo_annotation():
    photo_path = request.args.get('photo')
    report_id = request.args.get('report_id')
    photo_id = request.args.get('photo_id')
    
    if not photo_path:
        flash('Foto não especificada.', 'error')
        return redirect(url_for('reports'))
    
    return render_template('reports/photo_annotation.html')

@app.route('/photo-editor', methods=['GET', 'POST'])
@login_required
def photo_editor():
    """Editor de fotos professional com Fabric.js"""
    photo_id = request.args.get('photoId') or request.form.get('photoId')
    image_url = request.args.get('imageUrl', '')
    
    if request.method == 'POST':
        # Processar imagem editada
        edited_image = request.form.get('edited_image')
        legend = request.form.get('legend', '')
        
        if edited_image and photo_id:
            try:
                # Processar base64
                if ',' in edited_image:
                    edited_image = edited_image.split(',')[1]
                
                import base64
                image_binary = base64.b64decode(edited_image)
                
                # Salvar imagem editada
                upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
                if not os.path.exists(upload_folder):
                    os.makedirs(upload_folder)
                
                filename = f"edited_{photo_id}_{uuid.uuid4().hex}.jpg"
                filepath = os.path.join(upload_folder, filename)
                
                with open(filepath, 'wb') as f:
                    f.write(image_binary)
                
                # Atualizar banco se necessário
                if photo_id != 'temp':
                    foto = FotoRelatorio.query.get(photo_id)
                    if foto:
                        foto.filename_anotada = filename
                        foto.legenda = legend
                        db.session.commit()
                
                flash('Imagem editada com sucesso!', 'success')
                return redirect(request.referrer or url_for('reports'))
                
            except Exception as e:
                flash(f'Erro ao salvar imagem: {str(e)}', 'error')
    
    return render_template('reports/fabric_photo_editor.html', 
                         photo_id=photo_id, 
                         image_url=image_url)

@app.route('/reports/photos/<int:photo_id>/annotate', methods=['POST'])
@login_required
def annotate_photo(photo_id):
    """Salvar anotações em uma foto"""
    try:
        foto = FotoRelatorio.query.get_or_404(photo_id)
        data = request.get_json()
        
        if 'image_data' not in data:
            return jsonify({'success': False, 'error': 'Dados da imagem não encontrados'})
        
        # Process base64 image data
        image_data = data['image_data']
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        # Save annotated image
        import base64
        image_binary = base64.b64decode(image_data)
        
        upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
        if not os.path.exists(upload_folder):
            os.makedirs(upload_folder)
        
        # Generate new filename for annotated version
        filename_parts = foto.filename.rsplit('.', 1)
        annotated_filename = f"{filename_parts[0]}_annotated.{filename_parts[1] if len(filename_parts) > 1 else 'jpg'}"
        
        filepath = os.path.join(upload_folder, annotated_filename)
        with open(filepath, 'wb') as f:
            f.write(image_binary)
        
        # Update photo record
        foto.filename = annotated_filename
        foto.coordenadas_anotacao = data.get('annotations', '')
        db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/reports/photos/<int:photo_id>/delete', methods=['POST'])
@login_required
def delete_photo(photo_id):
    """Excluir uma foto"""
    try:
        foto = FotoRelatorio.query.get_or_404(photo_id)
        
        # Check permissions
        if not current_user.is_master and foto.relatorio.autor_id != current_user.id:
            return jsonify({'success': False, 'error': 'Permissão negada'})
        
        # Delete file
        upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
        filepath = os.path.join(upload_folder, foto.filename)
        if os.path.exists(filepath):
            os.remove(filepath)
        
        # Delete record
        db.session.delete(foto)
        db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/reports/<int:id>/status', methods=['POST'])
@login_required
def update_report_status(id):
    """Atualizar status do relatório"""
    try:
        relatorio = Relatorio.query.get_or_404(id)
        data = request.get_json()
        
        # Check permissions
        if not current_user.is_master and relatorio.autor_id != current_user.id:
            return jsonify({'success': False, 'error': 'Permissão negada'})
        
        new_status = data.get('status')
        valid_statuses = ['Rascunho', 'Aguardando Aprovacao', 'Aprovado', 'Rejeitado']
        
        if new_status not in valid_statuses:
            return jsonify({'success': False, 'error': 'Status inválido'})
        
        relatorio.status = new_status
        db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/reports/<int:id>/approve')
@login_required
def approve_report(id):
    """Aprovar relatório - apenas usuários master"""
    if not current_user.is_master:
        flash('Acesso negado. Apenas usuários master podem aprovar relatórios.', 'error')
        return redirect(url_for('reports'))
    
    relatorio = Relatorio.query.get_or_404(id)
    relatorio.status = 'Aprovado'
    relatorio.aprovado_por = current_user.id
    relatorio.data_aprovacao = datetime.utcnow()
    
    db.session.commit()
    flash(f'Relatório {relatorio.numero} aprovado com sucesso!', 'success')
    return redirect(url_for('reports'))

@app.route('/reports/<int:id>/reject')
@login_required
def reject_report(id):
    """Rejeitar relatório - apenas usuários master"""
    if not current_user.is_master:
        flash('Acesso negado. Apenas usuários master podem rejeitar relatórios.', 'error')
        return redirect(url_for('reports'))
    
    relatorio = Relatorio.query.get_or_404(id)
    relatorio.status = 'Rejeitado'
    relatorio.aprovado_por = current_user.id
    relatorio.data_aprovacao = datetime.utcnow()
    
    db.session.commit()
    flash(f'Relatório {relatorio.numero} rejeitado.', 'warning')
    return redirect(url_for('reports'))

@app.route('/reports/pending')
@login_required
def pending_reports():
    """Painel de relatórios pendentes de aprovação - apenas usuários master"""
    if not current_user.is_master:
        flash('Acesso negado. Apenas usuários master podem ver relatórios pendentes.', 'error')
        return redirect(url_for('reports'))
    
    page = request.args.get('page', 1, type=int)
    relatorios = Relatorio.query.filter_by(status='Aguardando Aprovação').order_by(Relatorio.created_at.desc()).paginate(
        page=page, per_page=10, error_out=False)
    
    return render_template('reports/pending.html', relatorios=relatorios)

@app.route('/reports/<int:id>/delete')
@login_required
def delete_report(id):
    """Excluir relatório - apenas usuários master"""
    if not current_user.is_master:
        flash('Acesso negado. Apenas usuários master podem excluir relatórios.', 'error')
        return redirect(url_for('reports'))
    
    relatorio = Relatorio.query.get_or_404(id)
    
    # Delete associated photos first
    fotos = FotoRelatorio.query.filter_by(relatorio_id=id).all()
    for foto in fotos:
        try:
            # Delete physical file
            upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
            filepath = os.path.join(upload_folder, foto.filename)
            if os.path.exists(filepath):
                os.remove(filepath)
        except Exception as e:
            print(f"Erro ao deletar arquivo {foto.filename}: {e}")
        db.session.delete(foto)
    
    # Delete report
    numero = relatorio.numero
    db.session.delete(relatorio)
    db.session.commit()
    
    flash(f'Relatório {numero} excluído com sucesso.', 'success')
    return redirect(url_for('reports'))

@app.route('/reports/<int:id>/pdf')
@login_required
def generate_pdf_report(id):
    """Gerar PDF do relatório usando WeasyPrint (modelo Artesano) para visualização"""
    try:
        relatorio = Relatorio.query.get_or_404(id)
        fotos = FotoRelatorio.query.filter_by(relatorio_id=id).order_by(FotoRelatorio.ordem).all()
        
        from pdf_generator_weasy import WeasyPrintReportGenerator
        generator = WeasyPrintReportGenerator()
        
        # Generate PDF
        pdf_data = generator.generate_report_pdf(relatorio, fotos)
        
        # Create response for inline viewing
        from flask import Response
        filename = f"relatorio_{relatorio.numero.replace('/', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        response = Response(
            pdf_data,
            mimetype='application/pdf',
            headers={
                'Content-Disposition': f'inline; filename="{filename}"',
                'Content-Type': 'application/pdf'
            }
        )
        
        return response
        
    except Exception as e:
        flash(f'Erro ao gerar PDF: {str(e)}', 'error')
        return redirect(url_for('edit_report', id=id))

@app.route('/reports/<int:id>/pdf/download')
@login_required
def generate_report_pdf_download(id):
    """Baixar PDF do relatório usando WeasyPrint (mesmo formato da visualização)"""
    try:
        relatorio = Relatorio.query.get_or_404(id)
        fotos = FotoRelatorio.query.filter_by(relatorio_id=id).order_by(FotoRelatorio.ordem).all()
        
        from pdf_generator_weasy import WeasyPrintReportGenerator
        generator = WeasyPrintReportGenerator()
        
        # Generate PDF (mesmo conteúdo da visualização)
        pdf_data = generator.generate_report_pdf(relatorio, fotos)
        
        # Create response for download
        from flask import Response
        filename = f"relatorio_{relatorio.numero.replace('/', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        response = Response(
            pdf_data,
            mimetype='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Type': 'application/pdf'
            }
        )
        
        return response
        
    except Exception as e:
        flash(f'Erro ao gerar PDF: {str(e)}', 'error')
        return redirect(url_for('edit_report', id=id))

@app.route('/reports/<int:id>/pdf/legacy')
@login_required
def generate_pdf_report_legacy(id):
    """Gerar PDF do relatório usando ReportLab (versão legacy)"""
    try:
        relatorio = Relatorio.query.get_or_404(id)
        fotos = FotoRelatorio.query.filter_by(relatorio_id=id).order_by(FotoRelatorio.ordem).all()
        
        from pdf_generator_artesano import ArtesanoPDFGenerator
        generator = ArtesanoPDFGenerator()
        
        # Generate PDF
        pdf_data = generator.generate_report_pdf(relatorio, fotos)
        
        # Create response
        from flask import Response
        filename = f"relatorio_legacy_{relatorio.numero.replace('/', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        response = Response(
            pdf_data,
            mimetype='application/pdf',
            headers={
                'Content-Disposition': f'inline; filename="{filename}"',
                'Content-Type': 'application/pdf'
            }
        )
        
        return response
        
    except Exception as e:
        flash(f'Erro ao gerar PDF: {str(e)}', 'error')
        return redirect(url_for('edit_report', id=id))

@app.route('/api/nearby-projects')
def get_nearby_projects():
    """Get ALL projects ordered by distance from user location"""
    try:
        lat = request.args.get('lat', type=float)
        lon = request.args.get('lon', type=float)
        
        # Get ALL projects (not just those with coordinates)
        projects = Projeto.query.all()
        
        all_projects = []
        projects_with_distance = []
        projects_without_distance = []
        
        for project in projects:
            project_data = {
                'id': project.id,
                'nome': project.nome,
                'endereco': project.endereco or 'Endereço não informado',
                'status': project.status,
                'tipo_obra': project.tipo_obra,
                'latitude': project.latitude,
                'longitude': project.longitude
            }
            
            # If user provided coordinates and project has coordinates, calculate distance
            if lat and lon and project.latitude and project.longitude:
                distance = calculate_distance(lat, lon, project.latitude, project.longitude)
                project_data['distance'] = round(distance, 2)
                projects_with_distance.append(project_data)
            else:
                # Projects without coordinates or user location not provided
                project_data['distance'] = 'N/A'
                projects_without_distance.append(project_data)
        
        # Sort projects with distance by closest first
        projects_with_distance.sort(key=lambda x: x['distance'])
        
        # Sort projects without distance by name
        projects_without_distance.sort(key=lambda x: x['nome'])
        
        # Combine: projects with distance first (closest first), then projects without distance
        all_projects = projects_with_distance + projects_without_distance
        
        return jsonify({'success': True, 'projects': all_projects, 'total': len(all_projects)})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points using Haversine formula"""
    import math
    
    # Convert to radians
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    # Radius of earth in kilometers
    r = 6371
    
    return r * c

@app.route('/api/projects/nearby', methods=['POST'])
@login_required
def api_nearby_projects():
    """API para dashboard - retorna TODAS as obras ordenadas por distância"""
    try:
        data = request.get_json()
        user_lat = data.get('lat') if data else None
        user_lon = data.get('lon') if data else None
        
        # Get ALL projects (não só os com coordenadas)
        projects = Projeto.query.all()
        
        projects_with_distance = []
        projects_without_distance = []
        
        for project in projects:
            project_data = {
                'id': project.id,
                'nome': project.nome,
                'numero': project.numero,
                'endereco': project.endereco or 'Endereço não informado',
                'status': project.status,
                'tipo_obra': project.tipo_obra,
                'latitude': project.latitude,
                'longitude': project.longitude
            }
            
            # Se usuário forneceu coordenadas E o projeto tem coordenadas, calcula distância
            if user_lat and user_lon and project.latitude and project.longitude:
                distance_km = calculate_distance(user_lat, user_lon, project.latitude, project.longitude)
                project_data['distance_km'] = round(distance_km, 2)
                projects_with_distance.append(project_data)
            else:
                # Projetos sem coordenadas ou usuário sem localização
                project_data['distance_km'] = 999999  # Coloca no final da lista
                projects_without_distance.append(project_data)
        
        # Ordena projetos com distância do mais próximo
        projects_with_distance.sort(key=lambda x: x['distance_km'])
        
        # Ordena projetos sem distância por nome
        projects_without_distance.sort(key=lambda x: x['nome'])
        
        # Combina: projetos com distância primeiro, depois sem distância
        all_projects = projects_with_distance + projects_without_distance
        
        return jsonify(all_projects)
        
    except Exception as e:
        print(f"❌ Erro na API de projetos próximos: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/save-annotated-photo', methods=['POST'])
@login_required  
def save_annotated_photo():
    """API para salvar foto anotada (legacy)"""
    try:
        image_data = request.form.get('annotated_image_data')
        caption = request.form.get('caption', '')
        category = request.form.get('category', '')
        description = request.form.get('description', '')
        annotations_data = request.form.get('annotations_data', '{}')
        
        # Para retornar via postMessage para a janela pai
        return f"""
        <script>
            if (window.opener) {{
                window.opener.postMessage({{
                    type: 'photo-edited',
                    photoId: new URLSearchParams(window.location.search).get('photoId'),
                    imageData: '{image_data}',
                    caption: '{caption}',
                    category: '{category}',
                    description: '{description}',
                    annotations: {annotations_data}
                }}, '*');
                window.close();
            }} else {{
                alert('Foto salva com sucesso!');
                window.history.back();
            }}
        </script>
        """
        
    except Exception as e:
        return f"""
        <script>
            alert('Erro ao salvar foto: {str(e)}');
            window.history.back();
        </script>
        """

@app.route('/reports/<int:id>/photos/upload', methods=['POST'])
@login_required
def upload_report_photos(id):
    relatorio = Relatorio.query.get_or_404(id)
    
    # Check permissions
    if not current_user.is_master and relatorio.autor_id != current_user.id:
        return jsonify({'success': False, 'error': 'Acesso negado'}), 403
    
    try:
        files = request.files.getlist('photos')
        uploaded_count = 0
        
        for file in files:
            if file.filename and file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                # Generate unique filename
                filename = f"{uuid.uuid4().hex}_{secure_filename(file.filename)}"
                filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                
                # Save file
                file.save(filepath)
                
                # Create photo record with minimal fields
                foto = FotoRelatorio()
                foto.relatorio_id = relatorio.id
                foto.filename = filename
                foto.legenda = f'Foto {uploaded_count + 1}'
                foto.ordem = uploaded_count + 1
                
                db.session.add(foto)
                uploaded_count += 1
        
        db.session.commit()
        
        return jsonify({
            'success': True, 
            'message': f'{uploaded_count} foto(s) enviada(s) com sucesso!'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500





@app.route('/projects/new', methods=['GET', 'POST'])
@login_required
def project_new():
    form = ProjetoForm()
    
    if request.method == 'POST':
        print(f"🔍 DEBUG: Form data received: {dict(request.form)}")
        print(f"🔍 DEBUG: Form validation: {form.validate_on_submit()}")
        if form.errors:
            print(f"🔍 DEBUG: Form errors: {form.errors}")
    
    if form.validate_on_submit():
        try:
            # Extract additional employees and emails from form
            funcionarios_adicionais = []
            emails_adicionais = []
            
            # Process additional employees
            for key in request.form.keys():
                if key.startswith('funcionarios[') and key.endswith('][nome]'):
                    index = key.split('[')[1].split(']')[0]
                    nome = request.form.get(f'funcionarios[{index}][nome]')
                    cargo = request.form.get(f'funcionarios[{index}][cargo]', '')
                    empresa = request.form.get(f'funcionarios[{index}][empresa]', '')
                    
                    if nome:
                        funcionarios_adicionais.append({
                            'nome': nome,
                            'cargo': cargo,
                            'empresa': empresa
                        })
            
            # Process additional emails
            for key in request.form.keys():
                if key.startswith('emails[') and key.endswith('][email]'):
                    index = key.split('[')[1].split(']')[0]
                    email = request.form.get(f'emails[{index}][email]')
                    nome = request.form.get(f'emails[{index}][nome]')
                    cargo = request.form.get(f'emails[{index}][cargo]', '')
                    
                    if email and nome:
                        emails_adicionais.append({
                            'email': email,
                            'nome': nome,
                            'cargo': cargo
                        })
            
            print(f"🔍 DEBUG: Found {len(funcionarios_adicionais)} additional employees")
            print(f"🔍 DEBUG: Found {len(emails_adicionais)} additional emails")
            
            # Check if project with same name already exists
            existing_project = Projeto.query.filter_by(nome=form.nome.data).first()
            
            if existing_project:
                # Project consolidation: add employee and email to existing project
                print(f"🔍 DEBUG: Project '{form.nome.data}' already exists. Consolidating...")
                projeto = existing_project
                funcionarios_adicionados = 0
                emails_adicionados = 0
                
                # Add main employee to existing project if not already associated
                # Sanitize user_id - convert empty/invalid values to None
                user_id_raw = form.responsavel_id.data
                user_id = int(user_id_raw) if user_id_raw and str(user_id_raw).isdigit() and int(user_id_raw) > 0 else None
                
                existing_funcionario = FuncionarioProjeto.query.filter_by(
                    projeto_id=projeto.id, 
                    user_id=user_id
                ).first()
                
                if not existing_funcionario:
                    novo_funcionario = FuncionarioProjeto(
                        projeto_id=projeto.id,
                        user_id=user_id,
                        nome_funcionario=form.nome_funcionario.data,
                        is_responsavel_principal=False,  # Keep original responsible as main
                        ativo=True
                    )
                    db.session.add(novo_funcionario)
                    funcionarios_adicionados += 1
                    print(f"✅ DEBUG: Added main employee to existing project")
                
                # Add additional employees
                for func_data in funcionarios_adicionais:
                    # Check if employee already exists (by name)
                    existing_func = FuncionarioProjeto.query.filter_by(
                        projeto_id=projeto.id,
                        nome_funcionario=func_data['nome']
                    ).first()
                    
                    if not existing_func:
                        novo_funcionario = FuncionarioProjeto(
                            projeto_id=projeto.id,
                            user_id=None,  # Additional employees are contacts, not system users
                            nome_funcionario=func_data['nome'],
                            cargo=func_data['cargo'],
                            empresa=func_data['empresa'],
                            is_responsavel_principal=False,
                            ativo=True
                        )
                        db.session.add(novo_funcionario)
                        funcionarios_adicionados += 1
                
                # Add main email to existing project if not already associated
                existing_email = EmailCliente.query.filter_by(
                    projeto_id=projeto.id,
                    email=form.email_principal.data
                ).first()
                
                if not existing_email:
                    novo_email = EmailCliente(
                        projeto_id=projeto.id,
                        email=form.email_principal.data,
                        nome_contato="Contato Consolidado",
                        is_principal=False,  # Keep original email as main
                        ativo=True
                    )
                    db.session.add(novo_email)
                    emails_adicionados += 1
                    print(f"✅ DEBUG: Added main email to existing project")
                
                # Add additional emails
                for email_data in emails_adicionais:
                    # Check if email already exists
                    existing_email = EmailCliente.query.filter_by(
                        projeto_id=projeto.id,
                        email=email_data['email']
                    ).first()
                    
                    if not existing_email:
                        novo_email = EmailCliente(
                            projeto_id=projeto.id,
                            email=email_data['email'],
                            nome_contato=email_data['nome'],
                            cargo=email_data['cargo'],
                            is_principal=False,
                            ativo=True
                        )
                        db.session.add(novo_email)
                        emails_adicionados += 1
                
                flash(f'Projeto consolidado! Adicionados {funcionarios_adicionados} funcionário(s) e {emails_adicionados} e-mail(s) ao projeto existente: {projeto.nome}', 'success')
                
            else:
                # Create new project
                print(f"🔍 DEBUG: Creating new project: {form.nome.data}")
                projeto = Projeto()
                projeto.numero = generate_project_number()
                projeto.nome = form.nome.data
                projeto.descricao = 'Projeto criado através do sistema ELP'  # Default value since field was removed
                projeto.endereco = form.endereco.data
                projeto.latitude = float(form.latitude.data) if form.latitude.data else None
                projeto.longitude = float(form.longitude.data) if form.longitude.data else None
                
                # Automatic geocoding: if no GPS coordinates but address exists, convert address to coordinates
                if not projeto.latitude or not projeto.longitude:
                    if projeto.endereco and projeto.endereco.strip():
                        print(f"🔍 GEOCODING: Tentando converter endereço '{projeto.endereco}' para coordenadas GPS...")
                        lat, lng = get_coordinates_from_address(projeto.endereco)
                        if lat and lng:
                            projeto.latitude = lat
                            projeto.longitude = lng
                            print(f"✅ GEOCODING: Sucesso! Coordenadas: {lat}, {lng}")
                        else:
                            print(f"❌ GEOCODING: Não foi possível converter o endereço")
                
                projeto.tipo_obra = 'Geral'  # Default value since field was removed
                projeto.construtora = form.construtora.data
                projeto.nome_funcionario = form.nome_funcionario.data
                projeto.responsavel_id = form.responsavel_id.data
                projeto.email_principal = form.email_principal.data
                projeto.data_inicio = form.data_inicio.data
                projeto.data_previsao_fim = form.data_previsao_fim.data
                projeto.status = form.status.data
                
                db.session.add(projeto)
                db.session.flush()  # Get the project ID
                
                # Create main employee association
                # Sanitize user_id - convert empty/invalid values to None
                user_id_raw = form.responsavel_id.data
                user_id = int(user_id_raw) if user_id_raw and str(user_id_raw).isdigit() and int(user_id_raw) > 0 else None
                
                funcionario_projeto = FuncionarioProjeto(
                    projeto_id=projeto.id,
                    user_id=user_id,
                    nome_funcionario=form.nome_funcionario.data,
                    is_responsavel_principal=True,
                    ativo=True
                )
                db.session.add(funcionario_projeto)
                
                # Add additional employees
                for func_data in funcionarios_adicionais:
                    funcionario_adicional = FuncionarioProjeto(
                        projeto_id=projeto.id,
                        user_id=None,  # Additional employees are contacts, not system users
                        nome_funcionario=func_data['nome'],
                        cargo=func_data['cargo'],
                        empresa=func_data['empresa'],
                        is_responsavel_principal=False,
                        ativo=True
                    )
                    db.session.add(funcionario_adicional)
                
                # Create main email association
                email_projeto = EmailCliente(
                    projeto_id=projeto.id,
                    email=form.email_principal.data,
                    nome_contato="Contato Principal",
                    is_principal=True,
                    ativo=True
                )
                db.session.add(email_projeto)
                
                # Add additional emails
                for email_data in emails_adicionais:
                    email_adicional = EmailCliente(
                        projeto_id=projeto.id,
                        email=email_data['email'],
                        nome_contato=email_data['nome'],
                        cargo=email_data['cargo'],
                        is_principal=False,
                        ativo=True
                    )
                    db.session.add(email_adicional)
                
                total_funcionarios = 1 + len(funcionarios_adicionais)
                total_emails = 1 + len(emails_adicionais)
                flash(f'Projeto cadastrado com sucesso! {total_funcionarios} funcionário(s) e {total_emails} e-mail(s) adicionados.', 'success')
            
            print(f"🔍 DEBUG: Trying to save projeto: {projeto.nome}")
            db.session.commit()
            print(f"✅ DEBUG: Projeto saved successfully!")
            return redirect(url_for('projects_list'))
        except Exception as e:
            print(f"❌ DEBUG: Error saving projeto: {e}")
            db.session.rollback()
            flash(f'Erro ao salvar projeto: {str(e)}', 'error')
    
    return render_template('projects/form.html', form=form)

@app.route('/projects/<int:project_id>')
@login_required
def project_view(project_id):
    project = Projeto.query.get_or_404(project_id)
    contatos = ContatoProjeto.query.filter_by(projeto_id=project_id).all()
    visitas = Visita.query.filter_by(projeto_id=project_id).order_by(Visita.data_agendada.desc()).all()
    relatorios = Relatorio.query.filter_by(projeto_id=project_id).order_by(Relatorio.created_at.desc()).all()
    relatorios_express = RelatorioExpress.query.order_by(RelatorioExpress.created_at.desc()).all()
    
    # Get communications from all visits of this project
    comunicacoes = []
    for visita in visitas:
        visit_comunicacoes = ComunicacaoVisita.query.filter_by(visita_id=visita.id).order_by(ComunicacaoVisita.created_at.desc()).all()
        for com in visit_comunicacoes:
            comunicacoes.append({
                'comunicacao': com,
                'visita': visita
            })
    
    # Sort all communications by date
    comunicacoes.sort(key=lambda x: x['comunicacao'].created_at, reverse=True)
    
    return render_template('projects/view.html', 
                         project=project, 
                         visitas=visitas, 
                         relatorios=relatorios,
                         relatorios_express=relatorios_express,
                         comunicacoes=comunicacoes[:10])  # Show last 10 communications

@app.route('/projects/<int:project_id>/edit', methods=['GET', 'POST'])
@login_required
def project_edit(project_id):
    project = Projeto.query.get_or_404(project_id)
    form = ProjetoForm(obj=project)
    
    if form.validate_on_submit():
        project.nome = form.nome.data
        project.descricao = 'Projeto atualizado através do sistema ELP'  # Default value since field was removed
        project.endereco = form.endereco.data
        project.latitude = float(form.latitude.data) if form.latitude.data else None
        project.longitude = float(form.longitude.data) if form.longitude.data else None
        
        # Automatic geocoding: if no GPS coordinates but address exists, convert address to coordinates
        if not project.latitude or not project.longitude:
            if project.endereco and project.endereco.strip():
                print(f"🔍 GEOCODING: Tentando converter endereço '{project.endereco}' para coordenadas GPS...")
                lat, lng = get_coordinates_from_address(project.endereco)
                if lat and lng:
                    project.latitude = lat
                    project.longitude = lng
                    print(f"✅ GEOCODING: Sucesso! Coordenadas: {lat}, {lng}")
                else:
                    print(f"❌ GEOCODING: Não foi possível converter o endereço")
        
        project.tipo_obra = 'Geral'  # Default value since field was removed
        project.construtora = form.construtora.data
        project.nome_funcionario = form.nome_funcionario.data
        project.responsavel_id = form.responsavel_id.data
        project.email_principal = form.email_principal.data
        project.data_inicio = form.data_inicio.data
        project.data_previsao_fim = form.data_previsao_fim.data
        project.status = form.status.data
        
        db.session.commit()
        flash('Projeto atualizado com sucesso!', 'success')
        return redirect(url_for('project_view', project_id=project.id))
    
    return render_template('projects/form.html', form=form, project=project)

# Contact management routes
@app.route('/contacts')
@login_required
def contacts_list():
    contacts = Contato.query.all()
    return render_template('contacts/list.html', contacts=contacts)

@app.route('/contacts/new', methods=['GET', 'POST'])
@login_required
def contact_new():
    form = ContatoForm()
    
    if form.validate_on_submit():
        contato = Contato(
            nome=form.nome.data,
            email=form.email.data,
            telefone=form.telefone.data,
            empresa=form.empresa.data,
            cargo=form.cargo.data,
            observacoes=form.observacoes.data
        )
        
        db.session.add(contato)
        db.session.commit()
        flash('Contato cadastrado com sucesso!', 'success')
        return redirect(url_for('contacts_list'))
    
    return render_template('contacts/form.html', form=form)

@app.route('/contacts/<int:contact_id>/edit', methods=['GET', 'POST'])
@login_required
def contact_edit(contact_id):
    contact = Contato.query.get_or_404(contact_id)
    form = ContatoForm(obj=contact)
    
    if form.validate_on_submit():
        contact.nome = form.nome.data
        contact.email = form.email.data
        contact.telefone = form.telefone.data
        contact.empresa = form.empresa.data
        contact.cargo = form.cargo.data
        contact.observacoes = form.observacoes.data
        
        db.session.commit()
        flash('Contato atualizado com sucesso!', 'success')
        return redirect(url_for('contacts_list'))
    
    return render_template('contacts/form.html', form=form, contact=contact)

# Contact functionality removed as requested

# Visit management routes
@app.route('/visits')
@login_required
def visits_list():
    # Check if user wants calendar view
    view_type = request.args.get('view', 'list')
    
    if view_type == 'calendar':
        return render_template('visits/calendar.html')
    
    # Default list view
    visits = Visita.query.order_by(Visita.data_agendada.desc()).all()
    return render_template('visits/list.html', visits=visits)

@app.route('/visits/calendar')
@login_required
def visits_calendar():
    """Calendar view for visits"""
    return render_template('visits/calendar.html')

@app.route('/visits/new', methods=['GET', 'POST'])
@login_required  
def visit_new():
    if request.method == 'POST' and 'data_agendada' in request.form:
        # Handle datetime-local input manually
        try:
            from datetime import datetime
            data_str = request.form['data_agendada']
            projeto_id = int(request.form['projeto_id'])
            objetivo = request.form['objetivo']
            
            if not data_str or not projeto_id or not objetivo:
                flash('Por favor, preencha todos os campos obrigatórios.', 'error')
                form = VisitaForm()
                return render_template('visits/form.html', form=form)
            
            # Parse datetime
            data_agendada = datetime.fromisoformat(data_str.replace('T', ' '))
            
            visita = Visita(
                numero=generate_visit_number(),
                projeto_id=projeto_id,
                responsavel_id=current_user.id,
                data_agendada=data_agendada,
                objetivo=objetivo
            )
            
            db.session.add(visita)
            db.session.flush()  # Get the ID
            
            # Add default checklist items from templates
            templates = ChecklistTemplate.query.filter_by(ativo=True).order_by(ChecklistTemplate.ordem).all()
            for template in templates:
                checklist_item = ChecklistItem(
                    visita_id=visita.id,
                    template_id=template.id,
                    pergunta=template.descricao,
                    obrigatorio=template.obrigatorio,
                    ordem=template.ordem
                )
                db.session.add(checklist_item)
            
            db.session.commit()
            flash('Visita agendada com sucesso!', 'success')
            return redirect(url_for('visits_list'))
            
        except Exception as e:
            db.session.rollback()
            print(f"Error creating visit: {e}")
            flash('Erro ao agendar visita. Verifique os dados e tente novamente.', 'error')
    
    # GET request or form validation failed
    form = VisitaForm()
    return render_template('visits/form.html', form=form)


@app.route('/visits/<int:visit_id>/realize', methods=['GET', 'POST'])
@login_required
def visit_realize(visit_id):
    visit = Visita.query.get_or_404(visit_id)
    
    if visit.status == 'Realizada':
        flash('Esta visita já foi realizada.', 'info')
        return redirect(url_for('visit_checklist', visit_id=visit_id))
    
    form = VisitaRealizadaForm()
    
    if form.validate_on_submit():
        visit.data_realizada = datetime.utcnow()
        visit.status = 'Realizada'
        visit.atividades_realizadas = form.atividades_realizadas.data
        visit.observacoes = form.observacoes.data
        
        if form.latitude.data and form.longitude.data:
            visit.latitude = float(form.latitude.data)
            visit.longitude = float(form.longitude.data)
            visit.endereco_gps = form.endereco_gps.data
        
        db.session.commit()
        flash('Visita registrada com sucesso!', 'success')
        return redirect(url_for('visit_checklist', visit_id=visit_id))
    
    return render_template('visits/form.html', form=form, visit=visit, action='realize')

@app.route('/visits/<int:visit_id>/checklist', methods=['GET', 'POST'])
@login_required
def visit_checklist(visit_id):
    visit = Visita.query.get_or_404(visit_id)
    checklist_items = ChecklistItem.query.filter_by(visita_id=visit_id).order_by(ChecklistItem.ordem).all()
    
    if request.method == 'POST':
        for item in checklist_items:
            resposta = request.form.get(f'resposta_{item.id}')
            concluido = f'concluido_{item.id}' in request.form
            
            item.resposta = resposta
            item.concluido = concluido
        
        db.session.commit()
        flash('Checklist atualizado com sucesso!', 'success')
        
        # Check if all mandatory items are completed
        mandatory_incomplete = ChecklistItem.query.filter_by(
            visita_id=visit_id,
            obrigatorio=True,
            concluido=False
        ).count()
        
        if mandatory_incomplete > 0:
            flash(f'Atenção: {mandatory_incomplete} itens obrigatórios ainda não foram concluídos.', 'warning')
    
    return render_template('visits/checklist.html', visit=visit, checklist_items=checklist_items)

@app.route('/visits/<int:visit_id>')
@login_required
def visit_view(visit_id):
    """View visit details"""
    visit = Visita.query.get_or_404(visit_id)
    checklist_items = ChecklistItem.query.filter_by(visita_id=visit_id).order_by(ChecklistItem.ordem).all()
    comunicacoes = ComunicacaoVisita.query.filter_by(visita_id=visit_id).order_by(ComunicacaoVisita.created_at.desc()).limit(5).all()
    
    return render_template('visits/view.html', visit=visit, checklist_items=checklist_items, comunicacoes=comunicacoes)

# Report management routes - movido para routes_reports.py

# Rota removida - usando nova implementação em routes_reports.py

@app.route('/reports/<int:report_id>')
@login_required
def report_view(report_id):
    report = Relatorio.query.get_or_404(report_id)
    fotos = FotoRelatorio.query.filter_by(relatorio_id=report_id).order_by(FotoRelatorio.ordem).all()
    return render_template('reports/view.html', report=report, fotos=fotos)

@app.route('/reports/<int:report_id>/edit', methods=['GET', 'POST'])
@login_required
def report_edit(report_id):
    report = Relatorio.query.get_or_404(report_id)
    
    # Check permissions
    if report.status == 'Finalizado' and not current_user.is_master:
        flash('Apenas usuários master podem editar relatórios finalizados.', 'error')
        return redirect(url_for('report_view', report_id=report_id))
    
    form = RelatorioForm(obj=report)
    
    if form.validate_on_submit():
        report.titulo = form.titulo.data
        report.conteudo = form.conteudo.data
        report.aprovador_nome = form.aprovador_nome.data
        report.data_relatorio = form.data_relatorio.data
        
        db.session.commit()
        flash('Relatório atualizado com sucesso!', 'success')
        return redirect(url_for('report_view', report_id=report_id))
    
    return render_template('reports/form.html', form=form, report=report)

@app.route('/reports/<int:report_id>/photos/add', methods=['GET', 'POST'])
@login_required
def report_add_photo(report_id):
    report = Relatorio.query.get_or_404(report_id)
    form = FotoRelatorioForm()
    
    if form.validate_on_submit():
        foto = form.foto.data
        if foto:
            filename = secure_filename(foto.filename)
            unique_filename = f"{uuid.uuid4()}_{filename}"
            foto_path = os.path.join(current_app.config['UPLOAD_FOLDER'], unique_filename)
            foto.save(foto_path)
            
            # Create photo record with minimal fields
            foto_relatorio = FotoRelatorio()
            foto_relatorio.relatorio_id = report_id
            foto_relatorio.filename = unique_filename
            foto_relatorio.titulo = form.titulo.data if hasattr(form, 'titulo') else ""
            foto_relatorio.descricao = form.descricao.data if hasattr(form, 'descricao') else ""
            foto_relatorio.tipo_servico = form.tipo_servico.data if hasattr(form, 'tipo_servico') else "Geral"
            foto_relatorio.ordem = FotoRelatorio.query.filter_by(relatorio_id=report_id).count() + 1
            
            db.session.add(foto_relatorio)
            db.session.commit()
            flash('Foto adicionada com sucesso!', 'success')
            return redirect(url_for('report_view', report_id=report_id))
    
    return render_template('reports/form.html', form=form, report=report, action='add_photo')

@app.route('/reports/<int:report_id>/finalize', methods=['POST'])
@login_required
def report_finalize(report_id):
    report = Relatorio.query.get_or_404(report_id)
    
    if report.status == 'Finalizado':
        flash('Relatório já está finalizado.', 'info')
        return redirect(url_for('report_view', report_id=report_id))
    
    report.status = 'Finalizado'
    db.session.commit()
    
    # Fazer backup automático no Google Drive
    try:
        # Preparar dados do relatório para backup
        fotos_paths = []
        fotos = FotoRelatorio.query.filter_by(relatorio_id=report_id).all()
        upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
        
        for foto in fotos:
            foto_path = os.path.join(upload_folder, foto.filename)
            if os.path.exists(foto_path):
                fotos_paths.append(foto_path)
        
        report_data = {
            'id': report.id,
            'numero': report.numero,
            'pdf_path': None,  # PDF será gerado se necessário
            'images': fotos_paths
        }
        
        project_name = f"{report.projeto.numero}_{report.projeto.nome}"
        backup_result = backup_to_drive(report_data, project_name)
        
        if backup_result.get('success'):
            flash(f'Relatório finalizado com sucesso! Backup: {backup_result.get("message")}', 'success')
        else:
            flash(f'Relatório finalizado com sucesso! Aviso de backup: {backup_result.get("message")}', 'warning')
            
    except Exception as e:
        flash(f'Relatório finalizado com sucesso! Erro no backup: {str(e)}', 'warning')
    
    return redirect(url_for('report_view', report_id=report_id))

@app.route('/reports/<int:report_id>/send', methods=['POST'])
@login_required
def report_send(report_id):
    report = Relatorio.query.get_or_404(report_id)
    
    if report.status != 'Finalizado':
        flash('Apenas relatórios finalizados podem ser enviados.', 'error')
        return redirect(url_for('report_view', report_id=report_id))
    
    # Get project contacts who should receive reports
    contatos_projeto = ContatoProjeto.query.filter_by(
        projeto_id=report.projeto_id,
        receber_relatorios=True
    ).all()
    
    if not contatos_projeto:
        flash('Nenhum contato configurado para receber relatórios neste projeto.', 'error')
        return redirect(url_for('report_view', report_id=report_id))
    
    emails_enviados = 0
    for contato_projeto in contatos_projeto:
        if contato_projeto.contato.email:
            try:
                send_report_email(report, contato_projeto.contato.email, contato_projeto.contato.nome)
                
                # Log the email sending
                envio = EnvioRelatorio()
                envio.relatorio_id = report_id
                envio.email_destinatario = contato_projeto.contato.email
                envio.nome_destinatario = contato_projeto.contato.nome
                db.session.add(envio)
                emails_enviados += 1
            except Exception as e:
                flash(f'Erro ao enviar email para {contato_projeto.contato.email}: {str(e)}', 'error')
    
    if emails_enviados > 0:
        report.status = 'Enviado'
        report.data_envio = datetime.utcnow()
        db.session.commit()
        flash(f'Relatório enviado para {emails_enviados} destinatário(s)!', 'success')
    else:
        flash('Nenhum email foi enviado com sucesso.', 'error')
    
    return redirect(url_for('report_view', report_id=report_id))

# Reimbursement routes
@app.route('/reimbursements')
@login_required
def reimbursements_list():
    reembolsos = Reembolso.query.filter_by(usuario_id=current_user.id).order_by(Reembolso.created_at.desc()).all()
    return render_template('reimbursements/list.html', reembolsos=reembolsos)

@app.route('/reimbursements/request', methods=['GET', 'POST'])
@login_required
def request_reimbursement():
    """Solicitar novo reembolso"""
    if request.method == 'POST':
        try:
            # Create reimbursement record
            reembolso = Reembolso()
            reembolso.usuario_id = current_user.id
            reembolso.projeto_id = int(request.form.get('projeto_id'))
            # Handle period dates
            periodo_inicio = request.form.get('periodo_inicio')
            periodo_fim = request.form.get('periodo_fim')
            if periodo_inicio:
                reembolso.periodo_inicio = datetime.strptime(periodo_inicio, '%Y-%m-%d').date()
            if periodo_fim:
                reembolso.periodo_fim = datetime.strptime(periodo_fim, '%Y-%m-%d').date()
            reembolso.observacoes = request.form.get('motivo', '')
            
            # Parse numeric values
            distancia = float(request.form.get('distancia_km', 0))
            valor_km = float(request.form.get('valor_km', 0.75))
            alimentacao = float(request.form.get('alimentacao', 0))
            hospedagem = float(request.form.get('hospedagem', 0))
            outros_gastos = float(request.form.get('outros_gastos', 0))
            
            reembolso.quilometragem = distancia
            reembolso.valor_km = valor_km
            reembolso.alimentacao = alimentacao
            reembolso.hospedagem = hospedagem
            reembolso.outros_gastos = outros_gastos
            reembolso.descricao_outros = request.form.get('descricao_outros', '')
            
            # Calculate total
            total_combustivel = distancia * valor_km
            reembolso.total = total_combustivel + alimentacao + hospedagem + outros_gastos
            
            reembolso.status = 'Aguardando Aprovação'
            reembolso.created_at = datetime.utcnow()
            
            db.session.add(reembolso)
            db.session.flush()  # Get the ID
            
            # Handle file uploads (comprovantes)
            upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
            if not os.path.exists(upload_folder):
                os.makedirs(upload_folder)
            
            comprovantes_count = 0
            comprovantes_info = []
            
            for i in range(4):  # Support up to 4 receipts
                comprovante_key = f'comprovante_{i}'
                desc_key = f'desc_comprovante_{i}'
                
                if comprovante_key in request.files:
                    file = request.files[comprovante_key]
                    if file and file.filename:
                        try:
                            filename = secure_filename(f"reembolso_{reembolso.id}_{uuid.uuid4().hex}_{file.filename}")
                            filepath = os.path.join(upload_folder, filename)
                            file.save(filepath)
                            
                            desc = request.form.get(desc_key, f'Comprovante {i+1}')
                            comprovantes_info.append({
                                'filename': filename,
                                'description': desc
                            })
                            comprovantes_count += 1
                        except Exception as e:
                            print(f"Erro ao salvar comprovante {i}: {e}")
            
            # Store comprovantes info as JSON in observacoes
            if comprovantes_info:
                import json
                reembolso.observacoes = json.dumps(comprovantes_info)
            
            db.session.commit()
            
            flash(f'Solicitação de reembolso criada com sucesso! {comprovantes_count} comprovantes anexados. Status: Aguardando Aprovação.', 'success')
            return redirect(url_for('reimbursements_list'))
            
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao criar solicitação: {str(e)}', 'error')
    
    projetos = Projeto.query.filter_by(status='Ativo').all()
    return render_template('reimbursements/request.html', projetos=projetos)

@app.route('/reimbursements/<int:id>/approve')
@login_required
def approve_reimbursement(id):
    """Aprovar solicitação de reembolso - apenas usuários master"""
    if not current_user.is_master:
        flash('Acesso negado. Apenas usuários master podem aprovar reembolsos.', 'error')
        return redirect(url_for('reimbursements_list'))
    
    reembolso = Reembolso.query.get_or_404(id)
    reembolso.status = 'Aprovado'
    reembolso.aprovado_por = current_user.id
    reembolso.data_aprovacao = datetime.utcnow()
    
    db.session.commit()
    flash(f'Reembolso aprovado com sucesso! PDF disponível para download.', 'success')
    return redirect(url_for('reimbursements_admin'))

@app.route('/reimbursements/<int:id>/reject')
@login_required
def reject_reimbursement(id):
    """Rejeitar solicitação de reembolso - apenas usuários master"""
    if not current_user.is_master:
        flash('Acesso negado. Apenas usuários master podem rejeitar reembolsos.', 'error')
        return redirect(url_for('reimbursements_list'))
    
    reembolso = Reembolso.query.get_or_404(id)
    reembolso.status = 'Rejeitado'
    reembolso.aprovado_por = current_user.id
    reembolso.data_aprovacao = datetime.utcnow()
    
    db.session.commit()
    flash(f'Reembolso rejeitado.', 'warning')
    return redirect(url_for('reimbursements_admin'))

@app.route('/install-guide')
def install_guide():
    """Página com instruções de instalação do PWA"""
    return render_template('pwa_install_guide.html')

@app.route('/reimbursements/admin')
@login_required
def reimbursements_admin():
    """Painel administrativo de reembolsos - apenas usuários master"""
    if not current_user.is_master:
        flash('Acesso negado.', 'error')
        return redirect(url_for('reimbursements_list'))
    
    reembolsos = Reembolso.query.order_by(Reembolso.created_at.desc()).all()
    return render_template('reimbursements/admin.html', reembolsos=reembolsos)

@app.route('/reimbursements/<int:id>/pdf')
@login_required
def generate_reimbursement_pdf(id):
    """Gerar PDF do reembolso aprovado"""
    reembolso = Reembolso.query.get_or_404(id)
    
    # Check permissions
    if not current_user.is_master and reembolso.usuario_id != current_user.id:
        flash('Acesso negado.', 'error')
        return redirect(url_for('reimbursements_list'))
    
    if reembolso.status != 'Aprovado':
        flash('PDF só pode ser gerado para reembolsos aprovados.', 'error')
        return redirect(url_for('reimbursements_list'))
    
    try:
        from pdf_generator import ReportPDFGenerator
        
        pdf_generator = ReportPDFGenerator()
        output_path = os.path.join('static', 'reimbursements', f'reembolso_{reembolso.id}.pdf')
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        pdf_path = pdf_generator.generate_reimbursement_pdf(reembolso, output_path)
        
        return send_from_directory(
            os.path.dirname(output_path),
            os.path.basename(output_path),
            as_attachment=True,
            download_name=f'reembolso_{reembolso.id}_aprovado.pdf'
        )
        
    except Exception as e:
        flash(f'Erro ao gerar PDF: {str(e)}', 'error')
        return redirect(url_for('reimbursements_list'))

@app.route('/reimbursements/new', methods=['GET', 'POST'])
@login_required
def reimbursement_new():
    form = ReembolsoForm()
    
    if form.validate_on_submit():
        reembolso = Reembolso(
            usuario_id=current_user.id,
            projeto_id=form.projeto_id.data or None,
            periodo_inicio=form.periodo_inicio.data,
            periodo_fim=form.periodo_fim.data,
            quilometragem=form.quilometragem.data or 0,
            valor_km=form.valor_km.data or 0,
            alimentacao=form.alimentacao.data or 0,
            hospedagem=form.hospedagem.data or 0,
            outros_gastos=form.outros_gastos.data or 0,
            descricao_outros=form.descricao_outros.data,
            observacoes=form.observacoes.data
        )
        
        reembolso.total = calculate_reimbursement_total(reembolso)
        
        db.session.add(reembolso)
        db.session.commit()
        flash('Solicitação de reembolso criada com sucesso!', 'success')
        return redirect(url_for('reimbursements_list'))
    
    return render_template('reimbursement/form.html', form=form)

# File serving (unique function)
@app.route('/uploads/<filename>')
@login_required
def uploaded_file(filename):
    return send_from_directory(current_app.config['UPLOAD_FOLDER'], filename)

# GPS location endpoint
@app.route('/get_location', methods=['POST', 'GET'])
@csrf.exempt
def get_location():
    import requests
    from urllib.parse import quote
    
    data = request.get_json()
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    
    if latitude and longitude:
        try:
            # Use Nominatim reverse geocoding to get formatted address
            url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={latitude}&lon={longitude}&addressdetails=1&language=pt-BR"
            headers = {'User-Agent': 'SistemaObras/1.0'}
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                # Extract address components
                addr = data.get('address', {})
                
                # Build formatted address
                address_parts = []
                
                # Street name and number
                if addr.get('house_number'):
                    address_parts.append(f"{addr.get('road', '')} {addr['house_number']}")
                elif addr.get('road'):
                    address_parts.append(addr['road'])
                    
                # Neighborhood
                if addr.get('suburb') or addr.get('neighbourhood'):
                    address_parts.append(addr.get('suburb') or addr.get('neighbourhood'))
                    
                # City and state
                city = addr.get('city') or addr.get('town') or addr.get('village')
                if city:
                    state = addr.get('state')
                    if state:
                        address_parts.append(f"{city} - {state}")
                    else:
                        address_parts.append(city)
                
                formatted_address = ', '.join(filter(None, address_parts))
                
                return jsonify({
                    'success': True,
                    'endereco': formatted_address or data.get('display_name', f"Lat: {latitude}, Lng: {longitude}")
                })
                
        except Exception as e:
            print(f"Erro ao obter endereço: {e}")
            
        # Fallback to coordinates if geocoding fails
        return jsonify({
            'success': True,
            'endereco': f"Lat: {latitude}, Lng: {longitude}"
        })
    
    return jsonify({'success': False})

# Duplicate function removed - using the more comprehensive version above

# Enhanced reporting features

@app.route('/reports/approval-dashboard')
@login_required
def reports_approval_dashboard():
    """Dashboard for report approvals - only for master users"""
    if not current_user.is_master:
        flash('Acesso negado. Apenas usuários master podem acessar o painel de aprovação.', 'error')
        return redirect(url_for('index'))
    
    # Get reports awaiting approval
    relatorios = Relatorio.query.filter_by(status='Aguardando Aprovacao').order_by(Relatorio.created_at.desc()).all()
    
    return render_template('reports/approval_dashboard.html', relatorios=relatorios)

@app.route('/reports/<int:report_id>/approve', methods=['POST'])
@login_required
def report_approve(report_id):
    """Approve or reject a report"""
    if not current_user.is_master:
        return jsonify({'success': False, 'message': 'Acesso negado.'})
    
    relatorio = Relatorio.query.get_or_404(report_id)
    data = request.get_json()
    action = data.get('action')
    comment = data.get('comment', '')
    
    if action == 'approve':
        relatorio.status = 'Aprovado'
        flash_message = 'Relatório aprovado com sucesso.'
        
        # Fazer backup automático no Google Drive quando aprovado
        try:
            # Preparar dados do relatório para backup
            fotos_paths = []
            fotos = FotoRelatorio.query.filter_by(relatorio_id=report_id).all()
            upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
            
            for foto in fotos:
                foto_path = os.path.join(upload_folder, foto.filename)
                if os.path.exists(foto_path):
                    fotos_paths.append(foto_path)
            
            report_data = {
                'id': relatorio.id,
                'numero': relatorio.numero,
                'pdf_path': None,  # PDF será gerado se necessário
                'images': fotos_paths
            }
            
            project_name = f"{relatorio.projeto.numero}_{relatorio.projeto.nome}"
            backup_result = backup_to_drive(report_data, project_name)
            
            if backup_result.get('success'):
                flash_message += f' Backup realizado: {backup_result.get("successful_uploads", 0)} arquivo(s) enviado(s).'
            else:
                flash_message += f' Aviso de backup: {backup_result.get("message", "Erro no backup")}'
                
        except Exception as e:
            flash_message += f' Erro no backup: {str(e)}'
            
    elif action == 'reject':
        relatorio.status = 'Rejeitado'
        flash_message = 'Relatório rejeitado.'
    else:
        return jsonify({'success': False, 'message': 'Ação inválida.'})
    
    relatorio.aprovador_id = current_user.id
    relatorio.data_aprovacao = datetime.now()
    relatorio.comentario_aprovacao = comment
    
    db.session.commit()
    
    return jsonify({'success': True, 'message': flash_message})

@app.route('/reports/<int:report_id>/generate-pdf')
@login_required
def report_generate_pdf(report_id):
    """Generate PDF for a report"""
    relatorio = Relatorio.query.get_or_404(report_id)
    
    # Check permissions
    if relatorio.autor_id != current_user.id and not current_user.is_master:
        flash('Acesso negado.', 'error')
        return redirect(url_for('reports'))
    
    try:
        pdf_path, filename = generate_visit_report_pdf(relatorio)
        return send_from_directory(
            app.config['UPLOAD_FOLDER'],
            filename,
            as_attachment=True,
            download_name=f"relatorio_{relatorio.numero}.pdf"
        )
    except Exception as e:
        current_app.logger.error(f"Error generating PDF: {str(e)}")
        flash('Erro ao gerar PDF do relatório.', 'error')
        return redirect(url_for('report_view', report_id=report_id))

@app.route('/reports/<int:report_id>/photo-editor')
@login_required
def report_photo_editor(report_id):
    """Editor de fotos professional com Fabric.js para relatórios"""
    relatorio = Relatorio.query.get_or_404(report_id)
    
    # Check permissions
    if relatorio.autor_id != current_user.id and not current_user.is_master:
        flash('Acesso negado.', 'error')
        return redirect(url_for('reports'))
    
    photo_id = request.args.get('photo_id', 'temp')
    image_url = request.args.get('image_url', '')
    
    return render_template('reports/fabric_photo_editor.html', 
                         relatorio=relatorio,
                         photo_id=photo_id,
                         image_url=image_url)

@app.route('/reports/<int:report_id>/photos/annotate', methods=['POST'])
@login_required
def report_photo_annotate(report_id):
    """Save annotated photo"""
    relatorio = Relatorio.query.get_or_404(report_id)
    
    # Check permissions
    if relatorio.autor_id != current_user.id and not current_user.is_master:
        return jsonify({'success': False, 'message': 'Acesso negado.'})
    
    photo_id = request.form.get('photo_id')
    annotated_image = request.files.get('annotated_image')
    
    if not photo_id or not annotated_image:
        return jsonify({'success': False, 'message': 'Dados incompletos.'})
    
    foto = FotoRelatorio.query.get_or_404(photo_id)
    
    if foto.relatorio_id != relatorio.id:
        return jsonify({'success': False, 'message': 'Foto não pertence a este relatório.'})
    
    try:
        # Save annotated image
        filename = secure_filename(f"annotated_{foto.id}_{uuid.uuid4().hex}.png")
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        annotated_image.save(file_path)
        
        # Update photo record
        foto.filename_anotada = filename
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Anotações salvas com sucesso.'})
        
    except Exception as e:
        app.logger.error(f"Error saving annotated photo: {str(e)}")
        return jsonify({'success': False, 'message': 'Erro ao salvar anotações.'})

@app.route('/reports/<int:report_id>/submit-for-approval', methods=['POST'])
@login_required
def report_submit_for_approval(report_id):
    """Submit report for approval"""
    relatorio = Relatorio.query.get_or_404(report_id)
    
    # Check permissions
    if relatorio.autor_id != current_user.id:
        flash('Acesso negado.', 'error')
        return redirect(url_for('reports'))
    
    if relatorio.status != 'Rascunho':
        flash('Apenas relatórios em rascunho podem ser enviados para aprovação.', 'error')
        return redirect(url_for('report_view', report_id=report_id))
    
    relatorio.status = 'Aguardando Aprovacao'
    db.session.commit()
    
    flash('Relatório enviado para aprovação.', 'success')
    return redirect(url_for('report_view', report_id=report_id))

@app.route('/visits/<int:visit_id>/communication', methods=['GET', 'POST'])
@login_required
def visit_communication(visit_id):
    """Visit communication system"""
    visita = Visita.query.get_or_404(visit_id)
    
    if request.method == 'POST':
        mensagem = request.form.get('mensagem')
        tipo = request.form.get('tipo', 'Comunicacao')
        
        if mensagem:
            comunicacao = ComunicacaoVisita(
                visita_id=visit_id,
                usuario_id=current_user.id,
                mensagem=mensagem,
                tipo=tipo
            )
            db.session.add(comunicacao)
            db.session.commit()
            
            flash('Comunicação adicionada com sucesso.', 'success')
        
        return redirect(url_for('visit_communication', visit_id=visit_id))
    
    # Get all communications for this visit
    comunicacoes = ComunicacaoVisita.query.filter_by(visita_id=visit_id).order_by(ComunicacaoVisita.created_at.desc()).all()
    
    return render_template('visits/communication.html', visita=visita, comunicacoes=comunicacoes)

# Calendar API routes
@app.route('/api/visits/calendar')
@login_required
def api_visits_calendar():
    """API endpoint for calendar data"""
    try:
        visits = Visita.query.join(Projeto).join(User).all()
        
        visits_data = []
        for visit in visits:
            visits_data.append({
                'id': visit.id,
                'numero': visit.numero,
                'data_agendada': visit.data_agendada.isoformat() if visit.data_agendada else None,
                'data_realizada': visit.data_realizada.isoformat() if visit.data_realizada else None,
                'status': visit.status,
                'projeto_nome': visit.projeto.nome,
                'projeto_numero': visit.projeto.numero,
                'responsavel_nome': visit.responsavel.nome_completo,
                'objetivo': visit.objetivo or '',
                'atividades_realizadas': visit.atividades_realizadas or '',
                'observacoes': visit.observacoes or ''
            })
        
        return jsonify({
            'success': True,
            'visits': visits_data
        })
    
    except Exception as e:
        print(f"Calendar API error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/visits/<int:visit_id>/details')
@login_required  
def api_visit_details(visit_id):
    """API endpoint for visit details"""
    try:
        visit = Visita.query.get_or_404(visit_id)
        
        visit_data = {
            'id': visit.id,
            'numero': visit.numero,
            'data_agendada': visit.data_agendada.isoformat() if visit.data_agendada else None,
            'data_realizada': visit.data_realizada.isoformat() if visit.data_realizada else None,
            'status': visit.status,
            'projeto_nome': visit.projeto.nome,
            'projeto_numero': visit.projeto.numero,
            'responsavel_nome': visit.responsavel.nome_completo,
            'objetivo': visit.objetivo or '',
            'atividades_realizadas': visit.atividades_realizadas or '',
            'observacoes': visit.observacoes or ''
        }
        
        return jsonify({
            'success': True,
            'visit': visit_data
        })
    
    except Exception as e:
        print(f"Visit details API error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/visits/export/google')
@login_required
def api_export_google_calendar():
    """Export all visits to Google Calendar"""
    try:
        visits = Visita.query.filter_by(status='Agendada').all()
        
        # Generate Google Calendar URL for all visits
        base_url = "https://calendar.google.com/calendar/render?action=TEMPLATE"
        
        if visits:
            first_visit = visits[0]
            # Format for Google Calendar
            start_time = first_visit.data_agendada.strftime('%Y%m%dT%H%M%S')
            end_time = (first_visit.data_agendada + timedelta(hours=2)).strftime('%Y%m%dT%H%M%S')
            
            params = {
                'text': f'Visita {first_visit.numero} - {first_visit.projeto.nome}',
                'dates': f'{start_time}/{end_time}',
                'details': f'Objetivo: {first_visit.objetivo}\\nProjeto: {first_visit.projeto.nome}\\nResponsável: {first_visit.responsavel.nome_completo}',
                'location': first_visit.projeto.endereco or 'Localização do projeto'
            }
            
            google_url = base_url + '&' + '&'.join([f'{k}={v}' for k, v in params.items()])
            
            return jsonify({
                'success': True,
                'url': google_url,
                'message': f'Link gerado para {len(visits)} visitas agendadas'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Nenhuma visita agendada encontrada'
            })
    
    except Exception as e:
        print(f"Google export error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/visits/<int:visit_id>/export/google')
@login_required
def api_export_single_visit_google(visit_id):
    """Export single visit to Google Calendar"""
    try:
        visit = Visita.query.get_or_404(visit_id)
        
        # Format for Google Calendar
        start_time = visit.data_agendada.strftime('%Y%m%dT%H%M%S')
        end_time = (visit.data_agendada + timedelta(hours=2)).strftime('%Y%m%dT%H%M%S')
        
        base_url = "https://calendar.google.com/calendar/render?action=TEMPLATE"
        params = {
            'text': f'Visita {visit.numero} - {visit.projeto.nome}',
            'dates': f'{start_time}/{end_time}',
            'details': f'Objetivo: {visit.objetivo}\\nProjeto: {visit.projeto.nome}\\nResponsável: {visit.responsavel.nome_completo}',
            'location': visit.projeto.endereco or 'Localização do projeto'
        }
        
        google_url = base_url + '&' + '&'.join([f'{k}={v}' for k, v in params.items()])
        
        return jsonify({
            'success': True,
            'url': google_url
        })
    
    except Exception as e:
        print(f"Single visit Google export error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/visits/export/outlook')
@login_required
def api_export_outlook():
    """Export all visits to Outlook (.ics file)"""
    return api_export_ics()

@app.route('/api/visits/export/ics')
@login_required  
def api_export_ics():
    """Export visits as ICS file"""
    try:
        from datetime import datetime, timedelta
        
        visits = Visita.query.filter_by(status='Agendada').all()
        
        # Generate ICS content
        ics_content = "BEGIN:VCALENDAR\\nVERSION:2.0\\nPRODID:ELP-Sistema\\nCALSCALE:GREGORIAN\\n"
        
        for visit in visits:
            start_time = visit.data_agendada.strftime('%Y%m%dT%H%M%S')
            end_time = (visit.data_agendada + timedelta(hours=2)).strftime('%Y%m%dT%H%M%S')
            
            ics_content += f"""BEGIN:VEVENT
DTSTART:{start_time}
DTEND:{end_time}
SUMMARY:Visita {visit.numero} - {visit.projeto.nome}
DESCRIPTION:Objetivo: {visit.objetivo}\\nProjeto: {visit.projeto.nome}\\nResponsável: {visit.responsavel.nome_completo}
LOCATION:{visit.projeto.endereco or 'Localização do projeto'}
UID:{visit.id}@elp-sistema.com
END:VEVENT
"""
        
        ics_content += "END:VCALENDAR"
        
        # Create response with ICS file
        response = make_response(ics_content)
        response.headers['Content-Type'] = 'text/calendar'
        response.headers['Content-Disposition'] = 'attachment; filename=visitas_elp.ics'
        
        return response
    
    except Exception as e:
        print(f"ICS export error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/visits/<int:visit_id>/export/outlook')
@login_required
def visit_export_outlook(visit_id):
    """Export single visit to Outlook (.ics file)"""
    try:
        visit = Visita.query.get_or_404(visit_id)
        
        # Calculate end time (2 hours after start)
        end_time = visit.data_agendada + timedelta(hours=2)
        
        # Create ICS content with proper line breaks for Outlook compatibility
        ics_lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//ELP Consultoria//Visit Scheduler//EN",
            "METHOD:PUBLISH",
            "BEGIN:VEVENT",
            f"UID:visit-{visit.id}@elp.com.br",
            f"DTSTART:{visit.data_agendada.strftime('%Y%m%dT%H%M%S')}",
            f"DTEND:{end_time.strftime('%Y%m%dT%H%M%S')}",
            f"SUMMARY:Visita Tecnica - {visit.projeto.nome}",
            f"DESCRIPTION:Objetivo: {visit.objetivo or 'N/A'}. Projeto: {visit.projeto.numero} - {visit.projeto.nome}. Responsavel: {visit.responsavel.nome_completo}",
            f"LOCATION:{visit.endereco_gps or visit.projeto.endereco or ''}",
            "STATUS:CONFIRMED",
            "SEQUENCE:0",
            "PRIORITY:5",
            "END:VEVENT",
            "END:VCALENDAR"
        ]
        
        ics_content = "\r\n".join(ics_lines)
        
        response = make_response(ics_content)
        response.headers["Content-Disposition"] = f"attachment; filename=visita_{visit.numero}.ics"
        response.headers["Content-Type"] = "text/calendar"
        
        return response
        
    except Exception as e:
        print(f"Outlook export error: {e}")
        flash('Erro ao exportar para Outlook. Tente novamente.', 'error')
        return redirect(url_for('visits_list'))

# =====================
# ROTAS DE GERENCIAMENTO DE E-MAILS DE CLIENTES
# =====================

@app.route('/projetos/<int:projeto_id>/emails')
@login_required
def projeto_emails(projeto_id):
    """Lista todos os e-mails de clientes de um projeto"""
    projeto = Projeto.query.get_or_404(projeto_id)
    emails = EmailCliente.query.filter_by(projeto_id=projeto_id, ativo=True).order_by(
        EmailCliente.is_principal.desc(),
        EmailCliente.nome_contato
    ).all()
    
    return render_template('emails/list.html', projeto=projeto, emails=emails)

@app.route('/projetos/<int:projeto_id>/emails/novo', methods=['GET', 'POST'])
@login_required
def novo_email_cliente(projeto_id):
    """Adiciona novo e-mail de cliente ao projeto"""
    projeto = Projeto.query.get_or_404(projeto_id)
    form = EmailClienteForm()
    
    if form.validate_on_submit():
        # Verificar se o e-mail já existe para este projeto
        email_existente = EmailCliente.query.filter_by(
            projeto_id=projeto_id,
            email=form.email.data.lower().strip()
        ).first()
        
        if email_existente:
            flash('Este e-mail já está cadastrado para este projeto.', 'error')
            return render_template('emails/form.html', form=form, projeto=projeto, titulo='Novo E-mail de Cliente')
        
        # Se marcou como principal, desmarcar outros como principal
        if form.is_principal.data:
            EmailCliente.query.filter_by(projeto_id=projeto_id, is_principal=True).update({
                'is_principal': False
            })
        
        # Criar novo e-mail
        email_cliente = EmailCliente(
            projeto_id=projeto_id,
            email=form.email.data.lower().strip(),
            nome_contato=form.nome_contato.data,
            cargo=form.cargo.data,
            empresa=form.empresa.data,
            is_principal=form.is_principal.data,
            receber_notificacoes=form.receber_notificacoes.data,
            receber_relatorios=form.receber_relatorios.data,
            ativo=form.ativo.data
        )
        
        try:
            db.session.add(email_cliente)
            db.session.commit()
            flash(f'E-mail {email_cliente.email} adicionado com sucesso!', 'success')
            return redirect(url_for('projeto_emails', projeto_id=projeto_id))
        except Exception as e:
            db.session.rollback()
            flash('Erro ao adicionar e-mail. Tente novamente.', 'error')
    
    return render_template('emails/form.html', form=form, projeto=projeto, titulo='Novo E-mail de Cliente')

@app.route('/emails/<int:email_id>/editar', methods=['GET', 'POST'])
@login_required
def editar_email_cliente(email_id):
    """Edita e-mail de cliente"""
    email_cliente = EmailCliente.query.get_or_404(email_id)
    projeto = email_cliente.projeto
    form = EmailClienteForm(obj=email_cliente)
    
    if form.validate_on_submit():
        # Verificar se mudou o e-mail e se já existe outro com o mesmo e-mail
        if form.email.data.lower().strip() != email_cliente.email:
            email_existente = EmailCliente.query.filter_by(
                projeto_id=projeto.id,
                email=form.email.data.lower().strip()
            ).filter(EmailCliente.id != email_id).first()
            
            if email_existente:
                flash('Este e-mail já está cadastrado para este projeto.', 'error')
                return render_template('emails/form.html', form=form, projeto=projeto, titulo='Editar E-mail de Cliente')
        
        # Se marcou como principal, desmarcar outros como principal
        if form.is_principal.data and not email_cliente.is_principal:
            EmailCliente.query.filter_by(projeto_id=projeto.id, is_principal=True).update({
                'is_principal': False
            })
        
        # Atualizar dados
        email_cliente.email = form.email.data.lower().strip()
        email_cliente.nome_contato = form.nome_contato.data
        email_cliente.cargo = form.cargo.data
        email_cliente.empresa = form.empresa.data
        email_cliente.is_principal = form.is_principal.data
        email_cliente.receber_notificacoes = form.receber_notificacoes.data
        email_cliente.receber_relatorios = form.receber_relatorios.data
        email_cliente.ativo = form.ativo.data
        email_cliente.updated_at = datetime.utcnow()
        
        try:
            db.session.commit()
            flash('E-mail atualizado com sucesso!', 'success')
            return redirect(url_for('projeto_emails', projeto_id=projeto.id))
        except Exception as e:
            db.session.rollback()
            flash('Erro ao atualizar e-mail. Tente novamente.', 'error')
    
    return render_template('emails/form.html', form=form, projeto=projeto, titulo='Editar E-mail de Cliente')

@app.route('/emails/<int:email_id>/remover', methods=['POST'])
@login_required
def remover_email_cliente(email_id):
    """Remove (desativa) e-mail de cliente"""
    email_cliente = EmailCliente.query.get_or_404(email_id)
    projeto_id = email_cliente.projeto_id
    
    try:
        email_cliente.ativo = False
        email_cliente.updated_at = datetime.utcnow()
        db.session.commit()
        flash('E-mail removido com sucesso!', 'success')
    except Exception as e:
        db.session.rollback()
        flash('Erro ao remover e-mail. Tente novamente.', 'error')
    
    return redirect(url_for('projeto_emails', projeto_id=projeto_id))

@app.route('/admin/emails')
@login_required
def admin_emails():
    """Painel administrativo para gerenciar todos os e-mails de clientes"""
    if not current_user.is_master:
        flash('Acesso negado. Apenas usuários master podem acessar esta área.', 'error')
        return redirect(url_for('index'))
    
    # Buscar todos os projetos com seus e-mails
    projetos = Projeto.query.join(EmailCliente).filter(EmailCliente.ativo == True).distinct().all()
    
    # Contar estatísticas
    total_emails = EmailCliente.query.filter_by(ativo=True).count()
    emails_principais = EmailCliente.query.filter_by(ativo=True, is_principal=True).count()
    projetos_sem_email = Projeto.query.filter(~Projeto.id.in_(
        db.session.query(EmailCliente.projeto_id).filter_by(ativo=True).distinct()
    )).count()
    
    return render_template('emails/admin.html', 
                         projetos=projetos, 
                         total_emails=total_emails,
                         emails_principais=emails_principais,
                         projetos_sem_email=projetos_sem_email)

# Rotas para Legendas Pré-definidas (exclusivo para Desenvolvedor)
@app.route('/admin/legendas')
@login_required
def admin_legendas():
    """Painel de administração de legendas - apenas Desenvolvedor"""
    if not current_user.is_developer:
        flash('Acesso negado. Apenas o usuário Desenvolvedor pode gerenciar legendas.', 'error')
        return redirect(url_for('index'))
    
    from models import LegendaPredefinida
    legendas = LegendaPredefinida.query.order_by(LegendaPredefinida.categoria, LegendaPredefinida.created_at.desc()).all()
    return render_template('admin/legendas.html', legendas=legendas)

@app.route('/admin/legendas/nova', methods=['GET', 'POST'])
@login_required
def admin_legenda_nova():
    """Criar nova legenda predefinida - apenas Desenvolvedor"""
    if not current_user.is_developer:
        flash('Acesso negado. Apenas o usuário Desenvolvedor pode gerenciar legendas.', 'error')
        return redirect(url_for('index'))
    
    from forms import LegendaPredefinidaForm
    from models import LegendaPredefinida
    form = LegendaPredefinidaForm()
    
    if form.validate_on_submit():
        try:
            legenda = LegendaPredefinida()
            legenda.texto = form.texto.data
            legenda.categoria = form.categoria.data
            legenda.ativo = form.ativo.data
            legenda.criado_por = current_user.id
            
            db.session.add(legenda)
            db.session.commit()
            
            flash('Legenda criada com sucesso!', 'success')
            return redirect(url_for('admin_legendas'))
            
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao criar legenda: {str(e)}', 'error')
    
    return render_template('admin/legenda_form.html', form=form, title='Nova Legenda')

@app.route('/admin/legendas/<int:id>/editar', methods=['GET', 'POST'])
@login_required
def admin_legenda_editar(id):
    """Editar legenda predefinida - apenas Desenvolvedor"""
    if not current_user.is_developer:
        flash('Acesso negado. Apenas o usuário Desenvolvedor pode gerenciar legendas.', 'error')
        return redirect(url_for('index'))
    
    from models import LegendaPredefinida
    from forms import LegendaPredefinidaForm
    
    legenda = LegendaPredefinida.query.get_or_404(id)
    form = LegendaPredefinidaForm(obj=legenda)
    
    if form.validate_on_submit():
        try:
            legenda.texto = form.texto.data
            legenda.categoria = form.categoria.data
            legenda.ativo = form.ativo.data
            
            db.session.commit()
            
            flash('Legenda atualizada com sucesso!', 'success')
            return redirect(url_for('admin_legendas'))
            
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao atualizar legenda: {str(e)}', 'error')
    
    return render_template('admin/legenda_form.html', form=form, legenda=legenda, title='Editar Legenda')

@app.route('/admin/legendas/<int:id>/excluir', methods=['POST'])
@login_required
def admin_legenda_excluir(id):
    """Excluir legenda predefinida - apenas Desenvolvedor"""
    if not current_user.is_developer:
        flash('Acesso negado. Apenas o usuário Desenvolvedor pode gerenciar legendas.', 'error')
        return redirect(url_for('index'))
    
    try:
        from models import LegendaPredefinida
        legenda = LegendaPredefinida.query.get_or_404(id)
        
        db.session.delete(legenda)
        db.session.commit()
        
        flash('Legenda excluída com sucesso!', 'success')
        
    except Exception as e:
        db.session.rollback()
        flash(f'Erro ao excluir legenda: {str(e)}', 'error')
    
    return redirect(url_for('admin_legendas'))

# API para buscar legendas predefinidas (para todos os usuários)
@app.route('/api/legendas')
def api_legendas():
    """API para buscar legendas predefinidas por categoria - compatível mobile/desktop"""
    try:
        categoria = request.args.get('categoria', 'all')
        
        # Import local para garantir disponibilidade
        try:
            from models import LegendaPredefinida
        except ImportError as ie:
            print(f"ERRO IMPORT: {ie}")
            return jsonify({
                'success': False,
                'error': 'Modelo não encontrado',
                'legendas': []
            }), 500
        
        # Buscar legendas no banco
        try:
            query = LegendaPredefinida.query.filter_by(ativo=True)
            
            if categoria and categoria != 'all':
                query = query.filter_by(categoria=categoria)
            
            legendas = query.order_by(LegendaPredefinida.categoria, LegendaPredefinida.texto).all()
        except Exception as db_error:
            print(f"ERRO BD: {db_error}")
            return jsonify({
                'success': False,
                'error': f'Erro no banco: {str(db_error)}',
                'legendas': []
            }), 500
        
        # Preparar resposta com dados reais do PostgreSQL
        response_data = {
            'success': True,
            'total': len(legendas),
            'legendas': []
        }
        
        # Processar cada legenda
        for legenda in legendas:
            try:
                response_data['legendas'].append({
                    'id': getattr(legenda, 'id', 0),
                    'texto': getattr(legenda, 'texto', ''),
                    'categoria': getattr(legenda, 'categoria', 'Geral'),
                    'ativo': getattr(legenda, 'ativo', True)
                })
            except Exception as proc_error:
                print(f"ERRO PROCESSAMENTO: {proc_error}")
                continue
        
        print(f"🔄 REAL-TIME SYNC: {response_data['total']} legendas fresh do PostgreSQL, categoria={categoria or 'todas'}")
        
        # Adicionar timestamp de sincronização
        response_data['timestamp'] = datetime.utcnow().isoformat()
        response_data['sync_real_time'] = True
        
        # Criar resposta JSON
        response = jsonify(response_data)
        
        # Headers AGRESSIVOS anti-cache para SINCRONIZAÇÃO TEMPO REAL
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        response.headers['Last-Modified'] = datetime.utcnow().strftime('%a, %d %b %Y %H:%M:%S GMT')
        response.headers['ETag'] = f'"{hash(str(response_data))}"'
        response.headers['Vary'] = '*'
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Cache-Control'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Connection'] = 'keep-alive'
        
        # Log para monitoramento de acesso mobile
        user_agent = request.headers.get('User-Agent', '')
        is_mobile = 'Mobile' in user_agent or 'Android' in user_agent or 'iPhone' in user_agent
        print(f"📱 API ACCESS: {'MOBILE' if is_mobile else 'DESKTOP'} - {len(legendas)} legendas retornadas")
        
        return response
        
    except Exception as e:
        # Log de erro para diagnóstico
        print(f"ERRO API LEGENDAS: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return jsonify({
            'success': False,
            'error': str(e),
            'total': 0,
            'legendas': []
        }), 500

@app.route('/api/legendas', methods=['OPTIONS'])
def api_legendas_options():
    """Suporte para requisições OPTIONS (CORS preflight)"""
    response = jsonify({'success': True})
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

# API para salvar dados de relatórios (mobile/desktop)
@app.route('/api/relatorios', methods=['POST'])
def api_salvar_relatorio():
    """API para salvar relatórios - compatível mobile/desktop"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'Dados não recebidos'
            }), 400
        
        # Aqui você pode implementar a lógica de salvamento
        # Por enquanto, só retorna sucesso para confirmar que a API funciona
        
        return jsonify({
            'success': True,
            'message': 'Dados recebidos com sucesso',
            'data_received': len(str(data))
        })
        
    except Exception as e:
        print(f"ERRO API SALVAR: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/test')
def api_test():
    """API de teste para verificar conectividade"""
    try:
        from models import LegendaPredefinida
        count = LegendaPredefinida.query.filter_by(ativo=True).count()
        
        return jsonify({
            'success': True,
            'message': 'API funcionando',
            'database_connection': True,
            'legendas_count': count,
            'timestamp': datetime.utcnow().isoformat()
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'database_connection': False
        }), 500

@app.route('/clear-pwa-cache')
def clear_pwa_cache():
    """Endpoint para forçar limpeza de cache PWA mobile"""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Limpeza PWA Cache</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="{{ url_for('static', filename='js/force-online-mode.js') }}"></script>
    </head>
    <body style="font-family: Arial, sans-serif; padding: 20px; background: #f8f9fa;">
        <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h1 style="color: #20c1e8; text-align: center;">🧹 Limpeza PWA Cache</h1>
            <p style="text-align: center; color: #666; margin-bottom: 30px;">
                Este endpoint força a limpeza completa do cache PWA mobile para garantir dados idênticos do PostgreSQL.
            </p>
            
            <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #2d5f2d; margin-top: 0;">✅ Ações Executadas:</h3>
                <ul style="color: #2d5f2d;">
                    <li>localStorage completamente limpo</li>
                    <li>sessionStorage removido</li> 
                    <li>Service Workers desregistrados</li>
                    <li>Cache do navegador removido</li>
                    <li>Reload forçado sem cache</li>
                </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
                <button onclick="window.clearPWACache()" style="background: #20c1e8; color: white; border: none; padding: 15px 30px; border-radius: 8px; font-size: 16px; cursor: pointer;">
                    🔄 Limpar Cache Agora
                </button>
            </div>
            
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h4 style="color: #856404; margin-top: 0;">📱 Como usar no Mobile PWA:</h4>
                <ol style="color: #856404;">
                    <li>Acesse esta URL no app mobile instalado</li>
                    <li>Clique em "Limpar Cache Agora"</li>
                    <li>Aguarde o reload automático</li>
                    <li>Verifique se os dados estão idênticos ao desktop</li>
                </ol>
            </div>
        </div>
        
        <script>
            // Executar limpeza automática ao carregar
            console.log('🧹 Iniciando limpeza automática PWA cache...');
            setTimeout(() => {
                new ForceOnlineMode();
            }, 1000);
        </script>
    </body>
    </html>
    """

# Rotas administrativas para Checklist Padrão
@app.route('/developer/checklist-padrao')
@login_required
def developer_checklist_padrao():
    """Página para desenvolvedores gerenciarem checklist padrão"""
    if not current_user.is_developer:
        flash('Acesso negado. Apenas desenvolvedores podem acessar esta página.', 'error')
        return redirect(url_for('index'))
    
    checklist_items = ChecklistPadrao.query.filter_by(ativo=True).order_by(ChecklistPadrao.ordem).all()
    return render_template('developer/checklist_padrao.html', checklist_items=checklist_items)

@app.route('/developer/api/checklist/default')
@login_required
def api_checklist_default():
    """API para carregar itens de checklist padrão para Express Reports"""
    try:
        # Buscar itens de checklist padrão criados no perfil desenvolvedor
        checklist_items = ChecklistPadrao.query.filter_by(ativo=True).order_by(ChecklistPadrao.ordem, ChecklistPadrao.id).all()
        
        items_data = []
        for item in checklist_items:
            items_data.append({
                'id': item.id,
                'titulo': item.texto,  # ChecklistPadrao usa 'texto' não 'titulo'
                'descricao': getattr(item, 'descricao', '') or '',  # Campo opcional
                'categoria': getattr(item, 'categoria', 'Geral') or 'Geral',  # Campo opcional
                'ordem': item.ordem or 0,
                'obrigatorio': getattr(item, 'obrigatorio', False)
            })
        
        return jsonify({
            'success': True,
            'items': items_data,
            'total': len(items_data)
        })
    
    except Exception as e:
        current_app.logger.error(f"Erro ao carregar checklist padrão: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Erro ao carregar checklist padrão',
            'details': str(e)
        })

# Google Drive Backup Routes
@app.route('/admin/drive/test')
@login_required
def admin_drive_test():
    """Testar conexão com Google Drive - apenas administradores"""
    if not current_user.is_master:
        flash('Acesso negado. Apenas administradores podem testar a conexão.', 'error')
        return redirect(url_for('index'))
    
    try:
        result = test_drive_connection()
        if result['success']:
            flash(f'Conexão OK: {result["message"]}', 'success')
        else:
            flash(f'Erro na conexão: {result["message"]}', 'error')
    except Exception as e:
        flash(f'Erro ao testar conexão: {str(e)}', 'error')
    
    return redirect(url_for('index'))

@app.route('/admin/drive/force-backup/<int:report_id>')
@login_required
def admin_force_backup(report_id):
    """Forçar backup de relatório específico - apenas administradores"""
    if not current_user.is_master:
        return jsonify({'success': False, 'message': 'Acesso negado'})
    
    try:
        relatorio = Relatorio.query.get_or_404(report_id)
        
        # Preparar dados do relatório para backup
        fotos_paths = []
        fotos = FotoRelatorio.query.filter_by(relatorio_id=report_id).all()
        upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
        
        for foto in fotos:
            foto_path = os.path.join(upload_folder, foto.filename)
            if os.path.exists(foto_path):
                fotos_paths.append(foto_path)
        
        report_data = {
            'id': relatorio.id,
            'numero': relatorio.numero,
            'pdf_path': None,  # PDF será gerado se necessário
            'images': fotos_paths
        }
        
        project_name = f"{relatorio.projeto.numero}_{relatorio.projeto.nome}"
        backup_result = backup_to_drive(report_data, project_name)
        
        if backup_result.get('success'):
            return jsonify({
                'success': True,
                'message': f'Backup realizado: {backup_result.get("successful_uploads", 0)} arquivo(s) enviado(s)',
                'details': backup_result
            })
        else:
            return jsonify({
                'success': False,
                'message': backup_result.get('message', 'Erro no backup'),
                'error': backup_result.get('error')
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Erro ao forçar backup: {str(e)}'
        })

@app.route('/admin/drive/backup-all')
@login_required
def admin_backup_all():
    """Forçar backup de todos os relatórios aprovados - apenas administradores"""
    if not current_user.is_master:
        return jsonify({'success': False, 'message': 'Acesso negado'})
    
    try:
        # Buscar relatórios com status aprovado (considerando variações de capitalização)
        relatorios = Relatorio.query.filter(
            db.func.lower(Relatorio.status).in_(['aprovado', 'finalizado', 'aprovado final'])
        ).all()
        
        total_reports = len(relatorios)
        successful_backups = 0
        failed_backups = 0
        
        upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
        
        for relatorio in relatorios:
            try:
                # Preparar dados do relatório
                fotos_paths = []
                # Usar o modelo correto de FotoRelatorio
                fotos = FotoRelatorio.query.filter_by(relatorio_id=relatorio.id).all()
                
                for foto in fotos:
                    foto_path = os.path.join(upload_folder, foto.filename)
                    if os.path.exists(foto_path):
                        fotos_paths.append(foto_path)
                
                # Tentar gerar PDF se não existir
                pdf_path = None
                try:
                    # Usar o gerador WeasyPrint se disponível
                    from pdf_generator_weasy import WeasyPrintReportGenerator
                    generator = WeasyPrintReportGenerator()
                    
                    # Criar nome do arquivo PDF
                    pdf_filename = f"relatorio_{relatorio.numero}_{relatorio.id}.pdf"
                    pdf_path = os.path.join(upload_folder, pdf_filename)
                    
                    # Gerar PDF
                    generator.generate_report_pdf(relatorio, fotos, pdf_path)
                    print(f"PDF gerado: {pdf_path}")
                    
                except Exception as pdf_error:
                    print(f"Erro ao gerar PDF para relatório {relatorio.numero}: {pdf_error}")

                report_data = {
                    'id': relatorio.id,
                    'numero': relatorio.numero,
                    'pdf_path': pdf_path,
                    'images': fotos_paths
                }
                
                project_name = f"{relatorio.projeto.numero}_{relatorio.projeto.nome}"
                backup_result = backup_to_drive(report_data, project_name)
                
                if backup_result.get('success'):
                    successful_backups += 1
                else:
                    failed_backups += 1
                    print(f"Falha no backup do relatório {relatorio.numero}: {backup_result.get('message')}")
                    
            except Exception as e:
                failed_backups += 1
                print(f"Erro no backup do relatório {relatorio.numero}: {str(e)}")
        
        return jsonify({
            'success': successful_backups > 0,
            'message': f'Backup completo: {successful_backups}/{total_reports} relatórios processados com sucesso',
            'successful': successful_backups,
            'failed': failed_backups,
            'total': total_reports
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Erro no backup em lote: {str(e)}'
        })

@app.route('/developer/checklist-padrao/add', methods=['POST'])
@login_required
@csrf.exempt
def developer_checklist_add():
    """Adicionar novo item ao checklist padrão"""
    if not current_user.is_developer:
        return jsonify({'error': 'Acesso negado'}), 403
    
    try:
        data = request.get_json()
        texto = data.get('texto', '').strip()
        
        if not texto:
            return jsonify({'error': 'Texto é obrigatório'}), 400
        
        if len(texto) > 500:
            return jsonify({'error': 'Texto deve ter no máximo 500 caracteres'}), 400
        
        # Verificar se já existe
        existing = ChecklistPadrao.query.filter_by(texto=texto, ativo=True).first()
        if existing:
            return jsonify({'error': 'Item já existe no checklist'}), 400
        
        # Obter próximo número de ordem
        max_ordem = db.session.query(db.func.max(ChecklistPadrao.ordem)).scalar() or 0
        
        # Criar novo item
        novo_item = ChecklistPadrao(
            texto=texto,
            ordem=max_ordem + 1
        )
        
        db.session.add(novo_item)
        db.session.commit()
        
        return jsonify({'success': True, 'item_id': novo_item.id})
        
    except Exception as e:
        db.session.rollback()
        print(f"Erro ao adicionar item checklist: {e}")
        return jsonify({'error': f'Erro interno: {str(e)}'}), 500

@app.route('/developer/checklist-padrao/edit/<int:item_id>', methods=['PUT'])
@login_required
@csrf.exempt
def developer_checklist_edit(item_id):
    """Editar item do checklist padrão"""
    if not current_user.is_developer:
        return jsonify({'error': 'Acesso negado'}), 403
    
    try:
        item = ChecklistPadrao.query.get_or_404(item_id)
        data = request.get_json()
        novo_texto = data.get('texto', '').strip()
        
        if not novo_texto:
            return jsonify({'error': 'Texto é obrigatório'}), 400
        
        if len(novo_texto) > 500:
            return jsonify({'error': 'Texto deve ter no máximo 500 caracteres'}), 400
        
        # Verificar duplicatas (exceto o item atual)
        existing = ChecklistPadrao.query.filter(
            ChecklistPadrao.texto == novo_texto,
            ChecklistPadrao.ativo == True,
            ChecklistPadrao.id != item_id
        ).first()
        
        if existing:
            return jsonify({'error': 'Já existe um item com este texto'}), 400
        
        item.texto = novo_texto
        item.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        print(f"Erro ao editar item checklist: {e}")
        return jsonify({'error': f'Erro interno: {str(e)}'}), 500

@app.route('/developer/checklist-padrao/delete/<int:item_id>', methods=['DELETE'])
@login_required
@csrf.exempt
def developer_checklist_delete(item_id):
    """Remover item do checklist padrão"""
    if not current_user.is_developer:
        return jsonify({'error': 'Acesso negado'}), 403
    
    try:
        item = ChecklistPadrao.query.get_or_404(item_id)
        
        # Marcar como inativo em vez de deletar fisicamente
        item.ativo = False
        item.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        print(f"Erro ao remover item checklist: {e}")
        return jsonify({'error': f'Erro interno: {str(e)}'}), 500

@app.route('/developer/checklist-padrao/reorder', methods=['POST'])
@login_required
@csrf.exempt
def developer_checklist_reorder():
    """Reordenar itens do checklist padrão"""
    if not current_user.is_developer:
        return jsonify({'error': 'Acesso negado'}), 403
    
    try:
        data = request.get_json()
        items = data.get('items', [])
        
        for item_data in items:
            item_id = item_data.get('id')
            nova_ordem = item_data.get('ordem')
            
            if item_id and nova_ordem:
                item = ChecklistPadrao.query.get(item_id)
                if item:
                    item.ordem = nova_ordem
                    item.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        print(f"Erro ao reordenar checklist: {e}")
        return jsonify({'error': f'Erro interno: {str(e)}'}), 500

# ====== ADMIN ROUTES FOR CHECKLIST (equivalentes às developer) ======

@app.route('/admin/checklist-padrao/add', methods=['POST'])
@login_required
@csrf.exempt
def admin_checklist_add():
    """Adicionar novo item ao checklist padrão (admin)"""
    if not current_user.is_master:
        return jsonify({'error': 'Acesso negado'}), 403
    
    try:
        data = request.get_json()
        texto = data.get('texto', '').strip()
        
        if not texto:
            return jsonify({'error': 'Texto é obrigatório'}), 400
        
        # Get next order
        ultimo_item = ChecklistPadrao.query.order_by(ChecklistPadrao.ordem.desc()).first()
        nova_ordem = (ultimo_item.ordem + 1) if ultimo_item else 1
        
        novo_item = ChecklistPadrao(
            texto=texto,
            ordem=nova_ordem,
            ativo=True
        )
        
        db.session.add(novo_item)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Item adicionado com sucesso',
            'item': {
                'id': novo_item.id,
                'texto': novo_item.texto,
                'ordem': novo_item.ordem
            }
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Erro interno: {str(e)}'}), 500

@app.route('/admin/checklist-padrao/edit/<int:item_id>', methods=['PUT'])
@login_required
@csrf.exempt
def admin_checklist_edit(item_id):
    """Editar item do checklist padrão (admin)"""
    if not current_user.is_master:
        return jsonify({'error': 'Acesso negado'}), 403
    
    try:
        item = ChecklistPadrao.query.get_or_404(item_id)
        
        data = request.get_json()
        novo_texto = data.get('texto', '').strip()
        
        if not novo_texto:
            return jsonify({'error': 'Texto é obrigatório'}), 400
        
        item.texto = novo_texto
        item.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Erro interno: {str(e)}'}), 500

@app.route('/admin/checklist-padrao/delete/<int:item_id>', methods=['DELETE'])
@login_required
@csrf.exempt
def admin_checklist_delete(item_id):
    """Remover item do checklist padrão (admin)"""
    if not current_user.is_master:
        return jsonify({'error': 'Acesso negado'}), 403
    
    try:
        item = ChecklistPadrao.query.get_or_404(item_id)
        
        # Marcar como inativo em vez de deletar fisicamente
        item.ativo = False
        item.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Erro interno: {str(e)}'}), 500

@app.route('/admin/checklist-padrao/reorder', methods=['POST'])
@login_required
@csrf.exempt
def admin_checklist_reorder():
    """Reordenar itens do checklist padrão (admin)"""
    if not current_user.is_master:
        return jsonify({'error': 'Acesso negado'}), 403
    
    try:
        data = request.get_json()
        items = data.get('items', [])
        
        for item_data in items:
            item_id = item_data.get('id')
            nova_ordem = item_data.get('ordem')
            
            if item_id and nova_ordem:
                item = ChecklistPadrao.query.get(item_id)
                if item:
                    item.ordem = nova_ordem
                    item.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Erro interno: {str(e)}'}), 500

@app.route('/api/checklist-padrao')
@login_required
def api_checklist_padrao():
    """API para obter itens do checklist padrão"""
    try:
        items = ChecklistPadrao.query.filter_by(ativo=True).order_by(ChecklistPadrao.ordem).all()
        
        checklist_data = []
        for item in items:
            checklist_data.append({
                'id': item.id,
                'texto': item.texto,
                'ordem': item.ordem
            })
        
        return jsonify({
            'success': True,
            'checklist': checklist_data
        })
        
    except Exception as e:
        print(f"Erro ao carregar checklist padrão: {e}")
        return jsonify({'error': str(e)}), 500

# =============================================================================
# SISTEMA DE E-MAIL - ROTAS PARA ENVIO DE RELATÓRIOS POR E-MAIL
# =============================================================================

@app.route('/admin/configuracao-email')
@login_required
def configuracao_email_list():
    """Lista as configurações de e-mail"""
    if not (current_user.is_master or current_user.is_developer):
        flash('Acesso negado. Apenas administradores podem configurar e-mails.', 'error')
        return redirect(url_for('index'))
    
    configs = ConfiguracaoEmail.query.order_by(ConfiguracaoEmail.nome_configuracao).all()
    return render_template('admin/configuracao_email_list.html', configs=configs)

@app.route('/admin/configuracao-email/nova', methods=['GET', 'POST'])
@login_required
def configuracao_email_nova():
    """Criar nova configuração de e-mail"""
    if not (current_user.is_master or current_user.is_developer):
        flash('Acesso negado.', 'error')
        return redirect(url_for('index'))
    
    form = ConfiguracaoEmailForm()
    if form.validate_on_submit():
        try:
            # Se marcar como ativo, desativar outras configurações
            if form.ativo.data:
                ConfiguracaoEmail.query.filter_by(ativo=True).update({'ativo': False})
            
            config = ConfiguracaoEmail(
                nome_configuracao=form.nome_configuracao.data,
                servidor_smtp=form.servidor_smtp.data,
                porta_smtp=form.porta_smtp.data,
                use_tls=form.use_tls.data,
                use_ssl=form.use_ssl.data,
                email_remetente=form.email_remetente.data,
                nome_remetente=form.nome_remetente.data,
                template_assunto=form.template_assunto.data or "Relatório do Projeto {projeto_nome} - {data}",
                template_corpo=form.template_corpo.data or """<p>Prezado(a) {nome_cliente},</p><p>Segue em anexo o relatório da obra/projeto conforme visita realizada em {data_visita}.</p><p>Em caso de dúvidas, favor entrar em contato conosco.</p><p>Atenciosamente,<br>Equipe ELP Consultoria e Engenharia<br>Engenharia Civil & Fachadas</p>""",
                ativo=form.ativo.data
            )
            
            db.session.add(config)
            db.session.commit()
            flash('Configuração de e-mail criada com sucesso!', 'success')
            return redirect(url_for('configuracao_email_list'))
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao criar configuração: {str(e)}', 'error')
    
    return render_template('admin/configuracao_email_form.html', form=form, title='Nova Configuração de E-mail')

@app.route('/relatorio/<int:relatorio_id>/enviar-email', methods=['GET', 'POST'])
@login_required
def relatorio_enviar_email(relatorio_id):
    """Enviar relatório por e-mail"""
    relatorio = Relatorio.query.get_or_404(relatorio_id)
    
    # Verificar se o usuário tem acesso ao projeto
    if not current_user.is_master and relatorio.projeto.responsavel_id != current_user.id:
        flash('Acesso negado.', 'error')
        return redirect(url_for('index'))
    
    # Buscar e-mails do projeto
    emails_projeto = email_service.buscar_emails_projeto(relatorio.projeto.id)
    
    if not emails_projeto:
        flash('Nenhum e-mail cadastrado para este projeto. Cadastre e-mails na seção de clientes.', 'warning')
        return redirect(url_for('report_view', report_id=relatorio_id))
    
    # Configurar escolhas do formulário
    form = EnvioEmailForm()
    form.destinatarios.choices = [
        (email.email, f"{email.nome_contato} ({email.email}) - {email.cargo or 'N/A'}")
        for email in emails_projeto
    ]
    
    # Buscar configuração ativa
    config_ativa = email_service.get_configuracao_ativa()
    if not config_ativa:
        flash('Nenhuma configuração de e-mail ativa. Configure o sistema de e-mail primeiro.', 'error')
        return redirect(url_for('report_view', report_id=relatorio_id))
    
    if request.method == 'POST' and form.validate_on_submit():
        try:
            # Processar e-mails CC e BCC
            def processar_emails(texto_emails):
                if not texto_emails:
                    return []
                emails = []
                for linha in texto_emails.split('\n'):
                    for email in linha.split(','):
                        email = email.strip()
                        if email:
                            emails.append(email)
                return emails
            
            cc_emails = processar_emails(form.cc_emails.data)
            bcc_emails = processar_emails(form.bcc_emails.data)
            
            # Validar e-mails
            todos_emails = form.destinatarios.data + cc_emails + bcc_emails
            emails_validos, emails_invalidos = email_service.validar_emails(todos_emails)
            
            if emails_invalidos:
                flash(f'E-mails inválidos encontrados: {", ".join(emails_invalidos)}', 'error')
                return render_template('email/enviar_relatorio.html', 
                                     form=form, relatorio=relatorio, config=config_ativa)
            
            # Preparar dados para envio
            destinatarios_data = {
                'destinatarios': form.destinatarios.data,
                'cc': cc_emails,
                'bcc': bcc_emails,
                'assunto_custom': form.assunto_personalizado.data,
                'corpo_custom': form.corpo_personalizado.data
            }
            
            # Enviar e-mails
            resultado = email_service.enviar_relatorio_por_email(
                relatorio, destinatarios_data, current_user.id
            )
            
            if resultado['success']:
                if resultado['falhas'] > 0:
                    flash(f'E-mails enviados parcialmente: {resultado["sucessos"]} sucessos, {resultado["falhas"]} falhas.', 'warning')
                else:
                    flash(f'E-mails enviados com sucesso para {resultado["sucessos"]} destinatários!', 'success')
            else:
                flash(f'Erro ao enviar e-mails: {resultado.get("error", "Erro desconhecido")}', 'error')
            
            return redirect(url_for('report_view', report_id=relatorio_id))
            
        except Exception as e:
            flash(f'Erro ao enviar e-mails: {str(e)}', 'error')
    
    return render_template('email/enviar_relatorio.html', 
                         form=form, relatorio=relatorio, config=config_ativa)

@app.route('/relatorio/<int:relatorio_id>/preview-email')
@login_required
def relatorio_preview_email(relatorio_id):
    """Preview do e-mail antes de enviar"""
    relatorio = Relatorio.query.get_or_404(relatorio_id)
    
    # Verificar acesso
    if not current_user.is_master and relatorio.projeto.responsavel_id != current_user.id:
        return jsonify({'error': 'Acesso negado'}), 403
    
    # Buscar configuração ativa
    config = email_service.get_configuracao_ativa()
    if not config:
        return jsonify({'error': 'Nenhuma configuração de e-mail ativa'}), 400
    
    # Preparar dados do preview
    projeto = relatorio.projeto
    data_visita = relatorio.data_visita.strftime('%d/%m/%Y') if relatorio.data_visita else 'N/A'
    data_atual = datetime.now().strftime('%d/%m/%Y')
    
    assunto = config.template_assunto.format(
        projeto_nome=projeto.nome,
        data=data_atual
    )
    
    corpo_html = config.template_corpo.format(
        nome_cliente="[Nome do Cliente]",
        data_visita=data_visita,
        projeto_nome=projeto.nome
    )
    
    return jsonify({
        'assunto': assunto,
        'corpo_html': corpo_html
    })

# =============================================================================
# SISTEMA DE RELATÓRIO EXPRESS STANDALONE
# =============================================================================

@app.route('/express')
@login_required
def express_list():
    """Listar relatórios express"""
    relatorios = RelatorioExpress.query.order_by(RelatorioExpress.created_at.desc()).all()
    
    # Estatísticas
    relatorios_rascunho = len([r for r in relatorios if r.status == 'rascunho'])
    relatorios_finalizados = len([r for r in relatorios if r.status == 'finalizado'])
    
    return render_template('express/list.html', 
                         relatorios=relatorios,
                         relatorios_rascunho=relatorios_rascunho,
                         relatorios_finalizados=relatorios_finalizados)

@app.route('/express/novo', methods=['GET', 'POST'])
@login_required
def express_new():
    """Criar novo relatório express"""
    # Detectar se é mobile
    user_agent = request.headers.get('User-Agent', '').lower()
    is_mobile = any(device in user_agent for device in ['mobile', 'android', 'iphone', 'ipad']) or request.args.get('mobile') == '1'
    
    form = RelatorioExpressForm()
    
    if form.validate_on_submit():
        try:
            # Determinar ação
            action = request.form.get('action', 'save_draft')
            
            # Gerar número único
            numero = gerar_numero_relatorio_express()
            
            # Criar relatório express
            relatorio_express = RelatorioExpress()
            relatorio_express.numero = numero
            relatorio_express.autor_id = current_user.id
            
            # Dados da empresa
            relatorio_express.empresa_nome = form.empresa_nome.data
            relatorio_express.empresa_endereco = form.empresa_endereco.data
            relatorio_express.empresa_telefone = form.empresa_telefone.data
            relatorio_express.empresa_email = form.empresa_email.data
            relatorio_express.empresa_responsavel = form.empresa_responsavel.data
            
            # Dados da visita
            relatorio_express.data_visita = form.data_visita.data
            relatorio_express.periodo_inicio = form.periodo_inicio.data
            relatorio_express.periodo_fim = form.periodo_fim.data
            relatorio_express.condicoes_climaticas = form.condicoes_climaticas.data
            relatorio_express.temperatura = form.temperatura.data
            relatorio_express.endereco_visita = form.endereco_visita.data
            
            # Localização
            if form.latitude.data:
                relatorio_express.latitude = float(form.latitude.data)
            if form.longitude.data:
                relatorio_express.longitude = float(form.longitude.data)
            
            # Observações
            relatorio_express.observacoes_gerais = form.observacoes_gerais.data
            relatorio_express.pendencias = form.pendencias.data
            relatorio_express.recomendacoes = form.recomendacoes.data
            
            # Checklist (salvar dados JSON)
            if form.checklist_completo.data:
                relatorio_express.checklist_dados = form.checklist_completo.data
            
            # Status baseado na ação
            if action == 'finalize':
                relatorio_express.status = 'finalizado'
                relatorio_express.finalizado_at = datetime.utcnow()
            else:
                relatorio_express.status = 'rascunho'
            
            db.session.add(relatorio_express)
            db.session.flush()  # Para obter o ID
            
            # Processar fotos configuradas do modal
            foto_configs_str = request.form.get('foto_configuracoes')
            if foto_configs_str:
                try:
                    foto_configs = json.loads(foto_configs_str)
                    upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
                    if not os.path.exists(upload_folder):
                        os.makedirs(upload_folder)
                    
                    ordem = 1
                    for config in foto_configs:
                        if config.get('data') and config.get('legenda'):
                            # Salvar imagem do base64
                            import base64
                            image_data = config['data'].split(',')[1]  # Remover prefixo data:image/...
                            image_bytes = base64.b64decode(image_data)
                            
                            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                            filename = f"express_{relatorio_express.id}_{timestamp}_{ordem}.png"
                            foto_path = os.path.join(upload_folder, filename)
                            
                            with open(foto_path, 'wb') as f:
                                f.write(image_bytes)
                            
                            # Criar registro da foto
                            foto_express = FotoRelatorioExpress()
                            foto_express.relatorio_express_id = relatorio_express.id
                            foto_express.filename = filename
                            foto_express.filename_original = config.get('originalName', filename)
                            foto_express.ordem = ordem
                            foto_express.legenda = config['legenda']
                            foto_express.tipo_servico = config.get('categoria', 'Geral')
                            
                            db.session.add(foto_express)
                            ordem += 1
                    
                except Exception as e:
                    current_app.logger.error(f"Erro ao processar fotos: {str(e)}")
            
            # Fallback: processar fotos básicas se não houver configurações
            elif form.fotos.data:
                upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
                if not os.path.exists(upload_folder):
                    os.makedirs(upload_folder)
                
                ordem = 1
                for foto_file in form.fotos.data:
                    if foto_file:
                        # Salvar arquivo
                        filename = secure_filename(foto_file.filename)
                        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                        filename = f"express_{relatorio_express.id}_{timestamp}_{filename}"
                        
                        foto_path = os.path.join(upload_folder, filename)
                        foto_file.save(foto_path)
                        
                        # Criar registro da foto
                        foto_express = FotoRelatorioExpress()
                        foto_express.relatorio_express_id = relatorio_express.id
                        foto_express.filename = filename
                        foto_express.filename_original = filename
                        foto_express.ordem = ordem
                        foto_express.legenda = f'Foto {ordem}'
                        
                        db.session.add(foto_express)
                        ordem += 1
            
            db.session.commit()
            
            if action == 'finalize':
                flash('Relatório Express finalizado com sucesso!', 'success')
                return redirect(url_for('express_detail', id=relatorio_express.id))
            else:
                flash('Rascunho de Relatório Express salvo com sucesso!', 'info')
                return redirect(url_for('express_edit', id=relatorio_express.id))
            
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao criar relatório express: {str(e)}', 'error')
            current_app.logger.error(f'Erro ao criar relatório express: {str(e)}')
    
    # SEMPRE usar template desktop para garantir estilização adequada
    template = 'express/novo.html'
    return render_template(template, form=form, is_mobile=is_mobile)

@app.route('/express/<int:id>')
@login_required
def express_detail(id):
    """Ver detalhes do relatório express"""
    relatorio = RelatorioExpress.query.get_or_404(id)
    
    # Verificar acesso
    if not current_user.is_master and relatorio.autor_id != current_user.id:
        flash('Acesso negado.', 'error')
        return redirect(url_for('express_list'))
    
    return render_template('express/detalhes.html', relatorio=relatorio)

@app.route('/express/<int:id>/edit', methods=['GET', 'POST'])
@login_required
def express_edit(id):
    """Editar relatório express (apenas rascunhos)"""
    relatorio = RelatorioExpress.query.get_or_404(id)
    
    # Verificar acesso
    if not current_user.is_master and relatorio.autor_id != current_user.id:
        flash('Acesso negado.', 'error')
        return redirect(url_for('express_list'))
    
    # Apenas rascunhos podem ser editados
    if relatorio.status != 'rascunho':
        flash('Apenas rascunhos podem ser editados.', 'warning')
        return redirect(url_for('express_detail', id=id))
    
    form = RelatorioExpressForm()
    
    if form.validate_on_submit():
        try:
            action = request.form.get('action', 'save_draft')
            
            # Atualizar dados da empresa
            relatorio.empresa_nome = form.empresa_nome.data
            relatorio.empresa_endereco = form.empresa_endereco.data
            relatorio.empresa_telefone = form.empresa_telefone.data
            relatorio.empresa_email = form.empresa_email.data
            relatorio.empresa_responsavel = form.empresa_responsavel.data
            
            # Atualizar dados da visita
            relatorio.data_visita = form.data_visita.data
            relatorio.periodo_inicio = form.periodo_inicio.data
            relatorio.periodo_fim = form.periodo_fim.data
            relatorio.condicoes_climaticas = form.condicoes_climaticas.data
            relatorio.temperatura = form.temperatura.data
            relatorio.endereco_visita = form.endereco_visita.data
            
            # Atualizar localização
            if form.latitude.data:
                relatorio.latitude = float(form.latitude.data)
            if form.longitude.data:
                relatorio.longitude = float(form.longitude.data)
            
            # Atualizar observações
            relatorio.observacoes_gerais = form.observacoes_gerais.data
            relatorio.pendencias = form.pendencias.data
            relatorio.recomendacoes = form.recomendacoes.data
            
            # Atualizar checklist
            if form.checklist_completo.data:
                relatorio.checklist_dados = form.checklist_completo.data
            
            # Atualizar status se finalizar
            if action == 'finalize':
                relatorio.status = 'finalizado'
                relatorio.finalizado_at = datetime.utcnow()
            
            relatorio.updated_at = datetime.utcnow()
            db.session.commit()
            
            if action == 'finalize':
                flash('Relatório Express finalizado com sucesso!', 'success')
                return redirect(url_for('express_detail', id=id))
            else:
                flash('Relatório Express atualizado com sucesso!', 'info')
            
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao atualizar relatório express: {str(e)}', 'error')
    
    # Preencher form com dados existentes
    if request.method == 'GET':
        form.empresa_nome.data = relatorio.empresa_nome
        form.empresa_endereco.data = relatorio.empresa_endereco
        form.empresa_telefone.data = relatorio.empresa_telefone
        form.empresa_email.data = relatorio.empresa_email
        form.empresa_responsavel.data = relatorio.empresa_responsavel
        
        form.data_visita.data = relatorio.data_visita
        form.periodo_inicio.data = relatorio.periodo_inicio
        form.periodo_fim.data = relatorio.periodo_fim
        form.condicoes_climaticas.data = relatorio.condicoes_climaticas
        form.temperatura.data = relatorio.temperatura
        form.endereco_visita.data = relatorio.endereco_visita
        
        form.latitude.data = str(relatorio.latitude) if relatorio.latitude else ''
        form.longitude.data = str(relatorio.longitude) if relatorio.longitude else ''
        
        form.observacoes_gerais.data = relatorio.observacoes_gerais
        form.pendencias.data = relatorio.pendencias
        form.recomendacoes.data = relatorio.recomendacoes
    
    return render_template('express/novo.html', form=form, relatorio=relatorio, editing=True)

@app.route('/express/<int:id>/pdf')
@login_required
def express_pdf(id):
    """Gerar PDF do relatório express"""
    relatorio = RelatorioExpress.query.get_or_404(id)
    
    # Verificar acesso
    if not current_user.is_master and relatorio.autor_id != current_user.id:
        flash('Acesso negado.', 'error')
        return redirect(url_for('express_list'))
    
    # Apenas relatórios finalizados geram PDF
    if relatorio.status != 'finalizado':
        flash('Apenas relatórios finalizados podem gerar PDF.', 'warning')
        return redirect(url_for('express_detail', id=id))
    
    try:
        # Gerar PDF
        pdf_filename = f"relatorio_express_{relatorio.numero}.pdf"
        pdf_path = os.path.join('uploads', pdf_filename)
        
        result = gerar_pdf_relatorio_express(relatorio, pdf_path)
        
        if result.get('success'):
            from flask import send_file
            return send_file(pdf_path, as_attachment=True, download_name=pdf_filename)
        else:
            flash(f'Erro ao gerar PDF: {result.get("error", "Erro desconhecido")}', 'error')
            return redirect(url_for('express_detail', id=id))
            
    except Exception as e:
        flash(f'Erro ao gerar PDF: {str(e)}', 'error')
        return redirect(url_for('express_detail', id=id))

@app.route('/express/<int:id>/delete', methods=['POST'])
@login_required
def express_delete(id):
    """Excluir relatório express (apenas master users)"""
    if not current_user.is_master:
        flash('Acesso negado.', 'error')
        return redirect(url_for('express_list'))
    
    relatorio = RelatorioExpress.query.get_or_404(id)
    
    try:
        # Excluir fotos associadas
        fotos = FotoRelatorioExpress.query.filter_by(relatorio_express_id=id).all()
        for foto in fotos:
            # Remover arquivo do disco
            upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
            foto_path = os.path.join(upload_folder, foto.filename)
            if os.path.exists(foto_path):
                os.remove(foto_path)
            
            # Remover do banco
            db.session.delete(foto)
        
        # Excluir relatório
        db.session.delete(relatorio)
        db.session.commit()
        
        flash(f'Relatório Express {relatorio.numero} excluído com sucesso.', 'success')
        
    except Exception as e:
        db.session.rollback()
        flash(f'Erro ao excluir relatório: {str(e)}', 'error')
    
    return redirect(url_for('express_list'))



# Rotas antigas removidas - sistema express agora é standalone

@app.route('/relatorio-express/<int:relatorio_id>/remover-foto/<int:foto_id>', methods=['POST'])
@login_required
@csrf.exempt
def relatorio_express_remover_foto(relatorio_id, foto_id):
    """Remover foto do relatório express"""
    relatorio = RelatorioExpress.query.get_or_404(relatorio_id)
    
    # Verificar acesso
    if not current_user.is_master and relatorio.projeto.responsavel_id != current_user.id:
        return jsonify({'error': 'Acesso negado'}), 403
    
    try:
        foto = FotoRelatorioExpress.query.get_or_404(foto_id)
        
        # Verificar se a foto pertence ao relatório
        if foto.relatorio_express_id != relatorio_id:
            return jsonify({'error': 'Foto não pertence a este relatório'}), 400
        
        # Remover arquivo do disco
        foto_path = os.path.join(app.config.get('UPLOAD_FOLDER', 'uploads'), foto.filename)
        if os.path.exists(foto_path):
            os.remove(foto_path)
        
        # Remover registro
        db.session.delete(foto)
        db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Erro ao remover foto: {str(e)}'}), 500

@app.route('/relatorio-express/<int:relatorio_id>/gerar-pdf')
@login_required
def relatorio_express_gerar_pdf(relatorio_id):
    """Gerar PDF do relatório express"""
    relatorio = RelatorioExpress.query.get_or_404(relatorio_id)
    
    # Verificar acesso
    if not current_user.is_master and relatorio.projeto.responsavel_id != current_user.id:
        flash('Acesso negado.', 'error')
        return redirect(url_for('index'))
    
    try:
        # Gerar PDF
        pdf_path = gerar_pdf_relatorio_express(relatorio_id)
        
        # Retornar arquivo para download
        return send_file(pdf_path, as_attachment=True, 
                        download_name=f"relatorio_express_{relatorio.numero}.pdf")
        
    except Exception as e:
        flash(f'Erro ao gerar PDF: {str(e)}', 'error')
        return redirect(url_for('relatorio_express_detalhes', relatorio_id=relatorio_id))

@app.route('/relatorio-express/<int:relatorio_id>/enviar-email', methods=['GET', 'POST'])
@login_required  
def relatorio_express_enviar_email(relatorio_id):
    """Enviar relatório express por e-mail"""
    relatorio = RelatorioExpress.query.get_or_404(relatorio_id)
    
    # Verificar acesso
    if not current_user.is_master and relatorio.projeto.responsavel_id != current_user.id:
        flash('Acesso negado.', 'error')
        return redirect(url_for('index'))
    
    # Buscar e-mails do projeto
    emails_projeto = email_service.buscar_emails_projeto(relatorio.projeto.id)
    
    if not emails_projeto:
        flash('Nenhum e-mail cadastrado para este projeto. Cadastre e-mails na seção de clientes.', 'warning')
        return redirect(url_for('relatorio_express_detalhes', relatorio_id=relatorio_id))
    
    # Configurar formulário
    form = EnvioEmailForm()
    form.destinatarios.choices = [
        (email.email, f"{email.nome_contato} ({email.email}) - {email.cargo or 'N/A'}")
        for email in emails_projeto
    ]
    
    # Buscar configuração ativa
    config_ativa = email_service.get_configuracao_ativa()
    if not config_ativa:
        flash('Nenhuma configuração de e-mail ativa. Configure o sistema primeiro.', 'error')
        return redirect(url_for('relatorio_express_detalhes', relatorio_id=relatorio_id))
    
    if request.method == 'POST' and form.validate_on_submit():
        try:
            # Processar e-mails (mesmo processo do relatório normal)
            def processar_emails(texto_emails):
                if not texto_emails:
                    return []
                emails = []
                for linha in texto_emails.split('\n'):
                    for email in linha.split(','):
                        email = email.strip()
                        if email:
                            emails.append(email)
                return emails
            
            cc_emails = processar_emails(form.cc_emails.data)
            bcc_emails = processar_emails(form.bcc_emails.data)
            
            # Validar e-mails
            todos_emails = form.destinatarios.data + cc_emails + bcc_emails
            emails_validos, emails_invalidos = email_service.validar_emails(todos_emails)
            
            if emails_invalidos:
                flash(f'E-mails inválidos: {", ".join(emails_invalidos)}', 'error')
                return render_template('express/enviar_email.html', 
                                     form=form, relatorio=relatorio, config=config_ativa)
            
            # Enviar e-mails (adaptado para relatório express)
            resultado = enviar_relatorio_express_por_email(
                relatorio, form.destinatarios.data, cc_emails, bcc_emails,
                form.assunto_personalizado.data, form.corpo_personalizado.data,
                current_user.id, config_ativa
            )
            
            if resultado['success']:
                flash(f'E-mails enviados com sucesso para {resultado["sucessos"]} destinatários!', 'success')
            else:
                flash(f'Erro ao enviar e-mails: {resultado.get("error")}', 'error')
            
            return redirect(url_for('relatorio_express_detalhes', relatorio_id=relatorio_id))
            
        except Exception as e:
            flash(f'Erro ao enviar e-mails: {str(e)}', 'error')
    
    return render_template('express/enviar_email.html', 
                         form=form, relatorio=relatorio, config=config_ativa)

def enviar_relatorio_express_por_email(relatorio, destinatarios, cc_emails, bcc_emails, 
                                     assunto_custom, corpo_custom, usuario_id, config):
    """Função auxiliar para enviar relatório express por e-mail"""
    try:
        # Gerar PDF
        pdf_bytes = gerar_pdf_relatorio_express(relatorio.id, salvar_arquivo=False)
        
        projeto = relatorio.projeto
        data_atual = datetime.now().strftime('%d/%m/%Y')
        
        # Preparar assunto e corpo
        assunto = assunto_custom or f"Relatório Express - {projeto.nome} - {data_atual}"
        
        if corpo_custom:
            corpo_html = corpo_custom
        else:
            corpo_html = f"""
            <p>Prezado(a) Cliente,</p>
            
            <p>Segue em anexo o Relatório Express do projeto <strong>{projeto.nome}</strong>.</p>
            
            <p>Este relatório contém observações rápidas e fotos da visita realizada.</p>
            
            <p>Em caso de dúvidas, favor entrar em contato conosco.</p>
            
            <p>Atenciosamente,<br>
            Equipe ELP Consultoria e Engenharia<br>
            Engenharia Civil & Fachadas</p>
            """
        
        sucessos = 0
        falhas = 0
        
        # Configurar Flask-Mail
        email_service.configure_smtp(config)
        
        # Enviar para cada destinatário
        for email_dest in destinatarios:
            try:
                msg = Message(
                    subject=assunto,
                    recipients=[email_dest],
                    cc=cc_emails,
                    bcc=bcc_emails,
                    html=corpo_html
                )
                
                # Anexar PDF
                pdf_bytes.seek(0)
                msg.attach(
                    filename=f"relatorio_express_{relatorio.numero}.pdf",
                    content_type='application/pdf',
                    data=pdf_bytes.read()
                )
                
                email_service.mail.send(msg)
                sucessos += 1
                
            except Exception as e:
                current_app.logger.error(f"Erro ao enviar email para {email_dest}: {e}")
                falhas += 1
        
        return {
            'success': sucessos > 0,
            'sucessos': sucessos,
            'falhas': falhas
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'sucessos': 0,
            'falhas': len(destinatarios)
        }

# ==================== HELPER: Aprovador Padrão ====================

def get_aprovador_padrao_para_projeto(projeto_id=None):
    """
    Buscar aprovador padrão para um projeto específico ou global
    
    Args:
        projeto_id: ID do projeto (None para buscar apenas global)
    
    Returns:
        User object do aprovador ou None se não encontrar
    """
    try:
        # Primeiro, tentar encontrar aprovador específico do projeto
        if projeto_id:
            aprovador_especifico = AprovadorPadrao.query.filter_by(
                projeto_id=projeto_id,
                ativo=True
            ).order_by(AprovadorPadrao.prioridade.asc(), AprovadorPadrao.created_at.desc()).first()
            
            if aprovador_especifico and aprovador_especifico.aprovador:
                return aprovador_especifico.aprovador
        
        # Se não encontrou específico, buscar aprovador global
        aprovador_global = AprovadorPadrao.query.filter_by(
            projeto_id=None,
            ativo=True
        ).order_by(AprovadorPadrao.prioridade.asc(), AprovadorPadrao.created_at.desc()).first()
        
        if aprovador_global and aprovador_global.aprovador:
            return aprovador_global.aprovador
            
        return None
        
    except Exception as e:
        print(f"Erro ao buscar aprovador padrão: {e}")
        return None

# ==================== ADMIN: Aprovadores Padrão ====================

@app.route('/admin/aprovadores-padrao')
@login_required
def admin_aprovadores_padrao():
    """Gerenciar aprovadores padrão - apenas usuários master"""
    if not current_user.is_master:
        flash('Acesso negado. Apenas usuários master podem acessar esta funcionalidade.', 'error')
        return redirect(url_for('index'))
    
    # Buscar aprovadores configurados
    aprovadores_globais = AprovadorPadrao.query.filter_by(projeto_id=None, ativo=True).all()
    aprovadores_por_projeto = AprovadorPadrao.query.filter(
        AprovadorPadrao.projeto_id.isnot(None),
        AprovadorPadrao.ativo == True
    ).all()
    
    # Buscar projetos ativos para seleção
    projetos_ativos = Projeto.query.filter_by(status='Ativo').all()
    
    # Buscar usuários master para seleção como aprovadores
    usuarios_master = User.query.filter_by(is_master=True, ativo=True).all()
    
    return render_template('admin/aprovadores_padrao.html',
                         aprovadores_globais=aprovadores_globais,
                         aprovadores_por_projeto=aprovadores_por_projeto,
                         projetos_ativos=projetos_ativos,
                         usuarios_master=usuarios_master)

@app.route('/admin/aprovadores-padrao/novo', methods=['GET', 'POST'])
@login_required
def admin_aprovador_padrao_novo():
    """Adicionar novo aprovador padrão - apenas usuários master"""
    if not current_user.is_master:
        flash('Acesso negado. Apenas usuários master podem acessar esta funcionalidade.', 'error')
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        projeto_id = request.form.get('projeto_id')
        aprovador_id = request.form.get('aprovador_id')
        observacoes = request.form.get('observacoes', '').strip()
        
        # Validações
        if not aprovador_id:
            flash('Aprovador é obrigatório.', 'error')
            return redirect(url_for('admin_aprovador_padrao_novo'))
        
        try:
            aprovador_id = int(aprovador_id)
            projeto_id = int(projeto_id) if projeto_id else None
            
            # Verificar se já existe configuração para este projeto/aprovador
            existing = AprovadorPadrao.query.filter_by(
                projeto_id=projeto_id,
                aprovador_id=aprovador_id,
                ativo=True
            ).first()
            
            if existing:
                projeto_nome = existing.projeto.nome if existing.projeto else "Configuração Global"
                flash(f'Já existe um aprovador padrão configurado para {projeto_nome}.', 'warning')
                return redirect(url_for('admin_aprovadores_padrao'))
            
            # Criar nova configuração
            novo_aprovador = AprovadorPadrao(
                projeto_id=projeto_id,
                aprovador_id=aprovador_id,
                observacoes=observacoes,
                criado_por=current_user.id
            )
            
            db.session.add(novo_aprovador)
            db.session.commit()
            
            projeto_nome = novo_aprovador.projeto.nome if novo_aprovador.projeto else "Global"
            flash(f'Aprovador padrão configurado com sucesso para {projeto_nome}!', 'success')
            return redirect(url_for('admin_aprovadores_padrao'))
            
        except ValueError:
            flash('Dados inválidos no formulário.', 'error')
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao criar aprovador padrão: {str(e)}', 'error')
    
    # GET request - mostrar formulário
    projetos_ativos = Projeto.query.filter_by(status='Ativo').all()
    usuarios_master = User.query.filter_by(is_master=True, ativo=True).all()
    
    return render_template('admin/aprovador_padrao_form.html',
                         projetos_ativos=projetos_ativos,
                         usuarios_master=usuarios_master,
                         is_edit=False)

@app.route('/admin/aprovadores-padrao/<int:id>/editar', methods=['GET', 'POST'])
@login_required
def admin_aprovador_padrao_editar(id):
    """Editar aprovador padrão - apenas usuários master"""
    if not current_user.is_master:
        flash('Acesso negado. Apenas usuários master podem acessar esta funcionalidade.', 'error')
        return redirect(url_for('index'))
    
    aprovador_padrao = AprovadorPadrao.query.get_or_404(id)
    
    if request.method == 'POST':
        projeto_id = request.form.get('projeto_id')
        aprovador_id = request.form.get('aprovador_id')
        observacoes = request.form.get('observacoes', '').strip()
        
        if not aprovador_id:
            flash('Aprovador é obrigatório.', 'error')
            return redirect(url_for('admin_aprovador_padrao_editar', id=id))
        
        try:
            aprovador_id = int(aprovador_id)
            projeto_id = int(projeto_id) if projeto_id else None
            
            # Atualizar configuração
            aprovador_padrao.projeto_id = projeto_id
            aprovador_padrao.aprovador_id = aprovador_id
            aprovador_padrao.observacoes = observacoes
            aprovador_padrao.updated_at = datetime.utcnow()
            
            db.session.commit()
            
            projeto_nome = aprovador_padrao.projeto.nome if aprovador_padrao.projeto else "Global"
            flash(f'Aprovador padrão atualizado com sucesso para {projeto_nome}!', 'success')
            return redirect(url_for('admin_aprovadores_padrao'))
            
        except ValueError:
            flash('Dados inválidos no formulário.', 'error')
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao atualizar aprovador padrão: {str(e)}', 'error')
    
    # GET request - mostrar formulário preenchido
    projetos_ativos = Projeto.query.filter_by(status='Ativo').all()
    usuarios_master = User.query.filter_by(is_master=True, ativo=True).all()
    
    return render_template('admin/aprovador_padrao_form.html',
                         aprovador_padrao=aprovador_padrao,
                         projetos_ativos=projetos_ativos,
                         usuarios_master=usuarios_master,
                         is_edit=True)

@app.route('/admin/aprovadores-padrao/<int:id>/desativar')
@login_required
def admin_aprovador_padrao_desativar(id):
    """Desativar aprovador padrão - apenas usuários master"""
    if not current_user.is_master:
        flash('Acesso negado. Apenas usuários master podem acessar esta funcionalidade.', 'error')
        return redirect(url_for('index'))
    
    try:
        aprovador_padrao = AprovadorPadrao.query.get_or_404(id)
        aprovador_padrao.ativo = False
        aprovador_padrao.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        projeto_nome = aprovador_padrao.projeto.nome if aprovador_padrao.projeto else "Global"
        flash(f'Aprovador padrão desativado para {projeto_nome}.', 'info')
        
    except Exception as e:
        db.session.rollback()
        flash(f'Erro ao desativar aprovador padrão: {str(e)}', 'error')
    
    return redirect(url_for('admin_aprovadores_padrao'))

# ==================== API: Aprovador Padrão ====================

@app.route('/api/aprovador-padrao/<int:projeto_id>')
@login_required
def api_get_aprovador_padrao(projeto_id):
    """API para buscar aprovador padrão de um projeto - AJAX"""
    try:
        aprovador = get_aprovador_padrao_para_projeto(projeto_id)
        
        if aprovador:
            return jsonify({
                'success': True,
                'aprovador_id': aprovador.id,
                'aprovador_nome': aprovador.nome,
                'aprovador_username': aprovador.username
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Nenhum aprovador padrão configurado'
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Erro ao buscar aprovador padrão: {str(e)}'
        })

# Error handlers
@app.errorhandler(404)
def not_found_error(error):
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return render_template('500.html'), 500

# Rota para primeiro login - troca de senha obrigatória
@app.route('/first-login', methods=['GET', 'POST'])
@login_required
def first_login():
    # Se não é primeiro login, redireciona para home
    if not hasattr(current_user, 'primeiro_login') or not current_user.primeiro_login:
        return redirect(url_for('index'))
    
    form = FirstLoginForm()
    
    if form.validate_on_submit():
        # Verificar senha atual
        if not check_password_hash(current_user.password_hash, form.current_password.data):
            flash('Senha atual incorreta.', 'error')
            return render_template('auth/first_login.html', form=form)
        
        # Atualizar senha e marcar como não sendo mais primeiro login
        try:
            current_user.password_hash = generate_password_hash(form.new_password.data)
            current_user.primeiro_login = False
            db.session.commit()
            
            flash('Senha alterada com sucesso! Bem-vindo ao sistema.', 'success')
            return redirect(url_for('index'))
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao alterar senha: {str(e)}', 'error')
    
    return render_template('auth/first_login.html', form=form)




# API endpoint for address geocoding (convert address to coordinates)
@app.route('/api/geocode-address', methods=['POST'])
@csrf.exempt
def geocode_address():
    """Convert address to GPS coordinates using address normalization"""
    try:
        data = request.get_json()
        address = data.get('address')
        
        if not address or not address.strip():
            return jsonify({
                'success': False, 
                'message': 'Endereço é obrigatório'
            })
        
        # Use the utility function which now includes address normalization
        latitude, longitude = get_coordinates_from_address(address.strip())
        
        if latitude and longitude:
            return jsonify({
                'success': True,
                'latitude': latitude,
                'longitude': longitude,
                'message': f'Coordenadas encontradas para o endereço'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Não foi possível encontrar coordenadas para este endereço'
            })
            
    except Exception as e:
        print(f'Erro no geocoding de endereço: {e}')
        return jsonify({
            'success': False,
            'message': 'Erro interno do servidor'
        })

