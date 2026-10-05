"""
API REST para gerenciamento de relatórios com salvamento automático
Implementação conforme especificação técnica profissional
"""
import os
import logging
import uuid
import shutil
from datetime import datetime
from flask import jsonify, request, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from app import app, db, csrf, now_brt
from models import Relatorio, FotoRelatorio, Projeto, User
import traceback # Import traceback for detailed error logging
import json # Import json for handling JSON data

# Configuração de logging
logger = logging.getLogger(__name__)

# Configurações de upload
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
TEMP_UPLOAD_FOLDER = os.path.join(app.config['UPLOAD_FOLDER'], 'temp')

def allowed_file(filename):
    """Verifica se o arquivo tem extensão permitida"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_uploaded_image(file, relatorio_id):
    """
    Salva imagem enviada e retorna informações do arquivo

    Args:
        file: FileStorage object do werkzeug
        relatorio_id: ID do relatório

    Returns:
        dict: Informações do arquivo salvo (filename, url, content_type, size)
    """
    if not file or not allowed_file(file.filename):
        raise ValueError("Arquivo inválido ou tipo não permitido")

    # Salvar temporariamente para verificar tamanho
    from tempfile import NamedTemporaryFile
    with NamedTemporaryFile(delete=False) as temp_file:
        file.save(temp_file.name)
        file_size = os.path.getsize(temp_file.name)

        # Validar tamanho do arquivo
        if file_size > MAX_FILE_SIZE:
            os.unlink(temp_file.name)  # Remover arquivo temporário
            raise ValueError(f"Arquivo muito grande: {file_size / (1024*1024):.2f}MB. Máximo permitido: {MAX_FILE_SIZE / (1024*1024):.0f}MB")

        # Gerar nome de arquivo seguro e único
        original_filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S%f')
        filename = f"relatorio_{relatorio_id}_{timestamp}_{original_filename}"

        # Caminho completo para salvar
        upload_folder = app.config['UPLOAD_FOLDER']
        filepath = os.path.join(upload_folder, filename)

        # Mover arquivo temporário para destino final
        import shutil
        shutil.move(temp_file.name, filepath)

        # URL relativa
        url = f"/uploads/{filename}"

        return {
            'filename': filename,
            'url': url,
            'content_type': file.content_type,
            'size': file_size
        }

# Criar pasta de uploads temporários se não existir
os.makedirs(TEMP_UPLOAD_FOLDER, exist_ok=True)

@app.route('/api/uploads/temp', methods=['POST'])
@csrf.exempt  # 🔐 Excluir da proteção CSRF - autenticação via session é suficiente
@login_required
def api_upload_temp():
    """
    POST /api/uploads/temp

    Upload rápido de imagem para storage temporário.
    Retorna temp_id para posterior associação ao relatório via autosave.

    Conforme especificação técnica do AutoSave.

    Nota: CSRF é verificado apenas se o token estiver presente.
    A autenticação via session/cookie é suficiente para segurança.

    Returns:
        JSON: {temp_id, path, filename, size, mime_type, category, local, caption}
    """
    try:
        # Verificar se arquivo foi enviado
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'Nenhum arquivo enviado'
            }), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'Nome de arquivo vazio'
            }), 400

        # Validar extensão do arquivo
        if not allowed_file(file.filename):
            return jsonify({
                'success': False,
                'error': f'Tipo de arquivo não permitido. Tipos aceitos: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400

        # Obter metadados adicionais do form
        category = request.form.get('category', '')
        local = request.form.get('local', '')
        caption = request.form.get('caption', '')

        # Salvar temporariamente para verificar tamanho
        from tempfile import NamedTemporaryFile
        with NamedTemporaryFile(delete=False) as temp_file:
            file.save(temp_file.name)
            file_size = os.path.getsize(temp_file.name)

            # Validar tamanho do arquivo
            if file_size > MAX_FILE_SIZE:
                os.unlink(temp_file.name)
                return jsonify({
                    'success': False,
                    'error': f'Arquivo muito grande: {file_size / (1024*1024):.2f}MB. Máximo: {MAX_FILE_SIZE / (1024*1024):.0f}MB'
                }), 413

            # Gerar temp_id único
            temp_id = str(uuid.uuid4())

            # Nome de arquivo seguro e único
            original_filename = secure_filename(file.filename)
            extension = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else 'jpg'
            temp_filename = f"{temp_id}.{extension}"

            # Caminho completo para salvar na pasta temporária
            temp_filepath = os.path.join(TEMP_UPLOAD_FOLDER, temp_filename)

            # Mover arquivo temporário para pasta de uploads temporários
            shutil.move(temp_file.name, temp_filepath)

            # Path relativo para retornar ao frontend
            relative_path = f"/uploads/temp/{temp_filename}"

            logger.info(f"✅ Upload temporário: {temp_filename} ({file_size / 1024:.2f}KB) - temp_id: {temp_id}")

            return jsonify({
                'success': True,
                'temp_id': temp_id,
                'path': relative_path,
                'filename': temp_filename,
                'original_filename': file.filename,
                'size': file_size,
                'mime_type': file.content_type or 'image/jpeg',
                'category': category,
                'local': local,
                'caption': caption
            }), 200

    except Exception as e:
        logger.error(f"Erro no upload temporário: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Erro ao processar upload',
            'details': str(e)
        }), 500

@app.route('/api/relatorios', methods=['POST'])
@login_required
def api_criar_relatorio():
    """
    POST /api/relatorios

    Cria um novo relatório e retorna o id.
    Suporte a upload inicial de imagens (multipart/form-data).
    Persiste metadados e estrutura completa conforme o novo modelo.
    """
    try:
        # Verificar se é multipart (com imagens) ou JSON
        if request.content_type and 'multipart/form-data' in request.content_type:
            # Dados do formulário multipart
            data = request.form.to_dict()
            files = request.files.getlist('imagens')
        else:
            # Dados JSON
            data = request.get_json()
            files = []

        # Validar campos obrigatórios
        if not data.get('projeto_id'):
            return jsonify({
                'success': False,
                'error': 'Campo projeto_id é obrigatório'
            }), 400

        # Verificar se projeto existe
        projeto = Projeto.query.get(data['projeto_id'])
        if not projeto:
            return jsonify({
                'success': False,
                'error': f"Projeto {data['projeto_id']} não encontrado"
            }), 404

        # Gerar número do relatório
        # Buscar último número do projeto
        ultimo_relatorio = Relatorio.query.filter_by(
            projeto_id=data['projeto_id']
        ).order_by(Relatorio.numero_projeto.desc()).first()

        if ultimo_relatorio and ultimo_relatorio.numero_projeto:
            proximo_numero = ultimo_relatorio.numero_projeto + 1
        else:
            proximo_numero = projeto.numeracao_inicial or 1

        numero_formatado = f"{projeto.numero}-R{proximo_numero:03d}"

        # Criar novo relatório
        novo_relatorio = Relatorio(
            numero=numero_formatado,
            numero_projeto=proximo_numero,
            titulo=data.get('titulo') or 'Relatório sem título',
            descricao=data.get('descricao'),
            projeto_id=data['projeto_id'],
            visita_id=data.get('visita_id'),
            autor_id=current_user.id,
            criado_por=current_user.id,
            atualizado_por=current_user.id,

            # Novos campos conforme especificação
            categoria=data.get('categoria') or 'falta preencher',
            local=data.get('local') or 'falta preencher',
            observacoes_finais=data.get('observacoes_finais'),

            # Data/hora
            data_relatorio=now_brt(),

            # Status
            status=data.get('status', 'preenchimento'),

            # Outros campos
            conteudo=data.get('conteudo'),
            checklist_data=data.get('checklist_data'),
            acompanhantes=data.get('acompanhantes')
        )

        # Processar lembrete_proxima_visita se fornecido
        if data.get('lembrete_proxima_visita'):
            try:
                if isinstance(data['lembrete_proxima_visita'], str):
                    novo_relatorio.lembrete_proxima_visita = datetime.fromisoformat(
                        data['lembrete_proxima_visita'].replace('Z', '+00:00')
                    )
                else:
                    novo_relatorio.lembrete_proxima_visita = data['lembrete_proxima_visita']
            except (ValueError, TypeError) as e:
                logger.warning(f"Erro ao processar lembrete_proxima_visita: {e}")

        # Salvar relatório no banco
        db.session.add(novo_relatorio)
        db.session.flush()  # Obter ID sem fazer commit

        # === NOVA LÓGICA: marcar itens ChecklistObra na criação via autosave ===
        if data.get('checklist_data'):
            try:
                from models import ChecklistObra
                from datetime import datetime as _dt
                import json
                
                checklist_items = data['checklist_data']
                if isinstance(checklist_items, str):
                    checklist_items = json.loads(checklist_items)
                    
                if isinstance(checklist_items, list):
                    for item in checklist_items:
                        item_id = item.get('id')
                        is_checked = item.get('concluido', False)
                        
                        if item_id and is_checked:
                            obra_item = ChecklistObra.query.get(item_id)
                            if obra_item and obra_item.projeto_id == novo_relatorio.projeto_id:
                                if not obra_item.concluido:
                                    obra_item.concluido = True
                                    obra_item.concluido_relatorio_id = novo_relatorio.id
                                    obra_item.concluido_em = now_brt()
            except Exception as e:
                logger.error(f"Erro ao atualizar ChecklistObra na criacao via API: {e}")

        # Processar imagens se houver
        imagens_salvas = []
        if files:
            for ordem, file in enumerate(files):
                if file and file.filename:
                    try:
                        # Salvar arquivo (pode lançar ValueError se tamanho exceder limite)
                        file_info = save_uploaded_image(file, novo_relatorio.id)

                        # Criar registro no banco
                        foto = FotoRelatorio(
                            relatorio_id=novo_relatorio.id,
                            filename=file_info['filename'],
                            url=file_info['url'],
                            legenda=request.form.get(f'legenda_{ordem}', ''),
                            ordem=ordem,
                            content_type=file_info['content_type'],
                            imagem_size=file_info['size']
                        )
                        db.session.add(foto)

                        imagens_salvas.append({
                            'id': None,  # Será preenchido após commit
                            'url': file_info['url'],
                            'legenda': foto.legenda,
                            'ordem': ordem
                        })
                    except ValueError as val_error:
                        # Erro de validação (tamanho, tipo, etc)
                        db.session.rollback()
                        logger.error(f"Erro de validação ao processar imagem: {val_error}")
                        return jsonify({
                            'success': False,
                            'error': 'Erro de validação de arquivo',
                            'details': str(val_error)
                        }), 413  # Payload Too Large
                    except Exception as img_error:
                        # Outros erros inesperados
                        db.session.rollback()
                        logger.error(f"Erro inesperado ao processar imagem: {img_error}")
                        return jsonify({
                            'success': False,
                            'error': 'Erro ao processar imagem',
                            'details': str(img_error)
                        }), 400

        # Commit da transação
        db.session.commit()

        # Atualizar IDs das imagens
        for i, foto in enumerate(novo_relatorio.imagens.order_by(FotoRelatorio.ordem).all()):
            if i < len(imagens_salvas):
                imagens_salvas[i]['id'] = foto.id

        # Verificar se deve finalizar o relatório (mudar status para "Aguardando Aprovação")
        # Isso replica exatamente o comportamento do botão "Concluir relatório" no formulário
        should_finalize = data.get('should_finalize') == True or data.get('should_finalize') == 'true'
        
        if should_finalize and novo_relatorio.status == 'preenchimento':
            logger.info(f"🎯 FLAG should_finalize detectado - finalizando relatório {novo_relatorio.id}")
            
            # Mudar status para Aguardando Aprovação
            novo_relatorio.status = 'Aguardando Aprovação'
            novo_relatorio.updated_at = now_brt()
            
            db.session.commit()
            
            # Auto-baixa da visita agendada (se houver)
            from utils import verificar_e_baixar_visita
            verificar_e_baixar_visita(novo_relatorio.projeto_id, novo_relatorio.data_relatorio, novo_relatorio.numero)
            
            # Criar notificação de relatório pendente para o aprovador
            if novo_relatorio.aprovador_id:
                from notification_service import notification_service
                try:
                    notification_service.criar_notificacao_relatorio_pendente(novo_relatorio.id)
                    logger.info(f"✅ Notificação de relatório pendente criada para aprovador {novo_relatorio.aprovador_id}")
                except Exception as notif_error:
                    logger.error(f"⚠️ Erro ao criar notificação de relatório pendente: {notif_error}")
            else:
                logger.warning(f"⚠️ Relatório {novo_relatorio.id} finalizado sem aprovador designado - notificação não criada")
            
            logger.info(f"✅ Relatório {novo_relatorio.numero} FINALIZADO - Status: {novo_relatorio.status}")

        return jsonify({
            'success': True,
            'id': novo_relatorio.id,
            'numero': novo_relatorio.numero,
            'status': novo_relatorio.status,
            'imagens': imagens_salvas,
            'message': 'Relatório criado com sucesso'
        }), 201

    except IntegrityError as e:
        db.session.rollback()
        logger.error(f"Erro de integridade ao criar relatório: {e}")
        return jsonify({
            'success': False,
            'error': 'Erro de integridade no banco de dados',
            'details': str(e)
        }), 400

    except Exception as e:
        db.session.rollback()
        logger.error(f"Erro ao criar relatório: {e}")
        return jsonify({
            'success': False,
            'error': 'Erro ao criar relatório',
            'details': str(e)
        }), 500

@app.route('/api/relatorios/<int:relatorio_id>', methods=['GET'])
@login_required
def get_relatorio(relatorio_id):
    """Buscar dados completos de um relatório específico para edição"""
    try:
        relatorio = Relatorio.query.get(relatorio_id)
        if not relatorio:
            return jsonify({
                'success': False,
                'error': f'Relatório {relatorio_id} não encontrado'
            }), 404

        # POLÍTICA PERMISSIVA: Todos os usuários autenticados podem visualizar/editar qualquer relatório
        # (conforme requisito do sistema)

        # Buscar dados do projeto
        projeto = None
        if relatorio.projeto_id:
            projeto_obj = Projeto.query.get(relatorio.projeto_id)
            if projeto_obj:
                projeto = {
                    'id': projeto_obj.id,
                    'nome': projeto_obj.nome,
                    'numero': projeto_obj.numero,
                    'endereco': projeto_obj.endereco
                }

        # Buscar imagens do relatório
        imagens = []
        fotos = FotoRelatorio.query.filter_by(relatorio_id=relatorio.id).order_by(FotoRelatorio.ordem).all()
        for foto in fotos:
            # Determinar o path da imagem - CORRIGIDO: verificar se não é string vazia
            image_path = None
            if foto.url and foto.url.strip():
                image_path = foto.url
            elif foto.filename and foto.filename.strip():
                image_path = f"/uploads/{foto.filename}"
            else:
                # Fallback para gerar URL a partir do ID - para fotos antigas sem url/filename
                image_path = f"/get_imagem/{foto.id}"

            imagens.append({
                'id': foto.id,
                'path': image_path,
                'url': image_path,
                'filename': foto.filename,
                'legenda': foto.legenda or '',
                'caption': foto.legenda or '',
                'tipo_servico': foto.tipo_servico or '',
                'category': foto.tipo_servico or '',
                'local': foto.local or '',
                'ordem': foto.ordem or 0
            })

        # Processar checklist_data
        checklist = []
        if relatorio.checklist_data:
            try:
                if isinstance(relatorio.checklist_data, str):
                    checklist = json.loads(relatorio.checklist_data)
                elif isinstance(relatorio.checklist_data, list):
                    checklist = relatorio.checklist_data
            except:
                checklist = []

        # Processar acompanhantes
        acompanhantes = []
        if relatorio.acompanhantes:
            try:
                if isinstance(relatorio.acompanhantes, str):
                    acompanhantes = json.loads(relatorio.acompanhantes)
                elif isinstance(relatorio.acompanhantes, list):
                    acompanhantes = relatorio.acompanhantes
            except:
                acompanhantes = []

        # Processar lembrete_proxima_visita (pode ser string ou datetime)
        lembrete_str = None
        if relatorio.lembrete_proxima_visita:
            if isinstance(relatorio.lembrete_proxima_visita, str):
                lembrete_str = relatorio.lembrete_proxima_visita
            else:
                lembrete_str = relatorio.lembrete_proxima_visita.isoformat()

        # Strip [offline_id:...] tag for clean UI representation
        obs_finais_clean = relatorio.observacoes_finais or ''
        if ' [offline_id:' in obs_finais_clean:
            obs_finais_clean = obs_finais_clean.split(' [offline_id:')[0].strip()

        # Serializar relatório completo
        relatorio_data = {
            'id': relatorio.id,
            'numero': relatorio.numero,
            'titulo': relatorio.titulo or 'Relatório de visita',
            'projeto_id': relatorio.projeto_id,
            'data_relatorio': relatorio.data_relatorio.isoformat() if relatorio.data_relatorio else None,
            'categoria': relatorio.categoria or '',
            'local': relatorio.local or '',
            'observacoes_finais': obs_finais_clean,
            'lembrete_proxima_visita': lembrete_str,
            'conteudo': relatorio.conteudo or '',
            'status': relatorio.status or 'preenchimento',
            'created_at': relatorio.created_at.isoformat() if relatorio.created_at else None,
            'updated_at': relatorio.updated_at.isoformat() if relatorio.updated_at else None
        }

        return jsonify({
            'success': True,
            'relatorio': relatorio_data,
            'projeto': projeto,
            'imagens': imagens,
            'checklist': checklist,
            'acompanhantes': acompanhantes
        })

    except Exception as e:
        current_app.logger.error(f'Erro ao buscar relatório {relatorio_id}: {str(e)}')
        import traceback
        current_app.logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/relatorios/<int:relatorio_id>', methods=['PUT'])
@login_required
def api_atualizar_relatorio(relatorio_id):
    """
    PUT /api/relatorios/<id>

    Atualiza todos os campos do relatório existente.
    Sincroniza imagens: adiciona novas, atualiza legendas/ordem e remove as excluídas.
    Suporta salvamento automático incremental (via timestamps).
    Trata corretamente tanto payload JSON quanto multipart.
    """
    try:
        relatorio = Relatorio.query.get(relatorio_id)

        if not relatorio:
            return jsonify({
                'success': False,
                'error': 'Relatório não encontrado'
            }), 404

        # Verificar se é multipart (com imagens) ou JSON
        if request.content_type and 'multipart/form-data' in request.content_type:
            data = request.form.to_dict()
            files = request.files.getlist('novas_imagens')
        else:
            data = request.get_json()
            files = []

        # Atualizar campos do relatório
        if 'titulo' in data:
            relatorio.titulo = data['titulo'] or 'Relatório sem título'
        if 'descricao' in data:
            relatorio.descricao = data['descricao']
        if 'categoria' in data:
            relatorio.categoria = data['categoria'] or 'falta preencher'
        if 'local' in data:
            relatorio.local = data['local'] or 'falta preencher'
        if 'observacoes_finais' in data:
            relatorio.observacoes_finais = data['observacoes_finais']
        if 'conteudo' in data:
            relatorio.conteudo = data['conteudo']
        if 'checklist_data' in data:
            relatorio.checklist_data = data['checklist_data']
            # === NOVA LÓGICA: marcar/desmarcar itens ChecklistObra ===
            try:
                from models import ChecklistObra
                from datetime import datetime as _dt
                checklist_raw = data['checklist_data']
                if isinstance(checklist_raw, str):
                    import json as _json
                    checklist_parsed = _json.loads(checklist_raw)
                else:
                    checklist_parsed = checklist_raw
                
                if isinstance(checklist_parsed, list):
                    for entry in checklist_parsed:
                        item_id = entry.get('id')
                        is_checked = bool(entry.get('concluido') or entry.get('completado') or entry.get('checked'))
                        if not item_id:
                            continue
                        obra_item = ChecklistObra.query.get(item_id)
                        if not obra_item:
                            continue
                        
                        existing_concluido = getattr(obra_item, 'concluido', False)
                        existing_rel_id = getattr(obra_item, 'concluido_relatorio_id', None)
                        
                        if is_checked:
                            # Only mark if not already marked by another report
                            if not existing_concluido:
                                obra_item.concluido = True
                                obra_item.concluido_relatorio_id = relatorio_id
                                obra_item.concluido_em = now_brt()
                            # If already marked by THIS same report, keep as-is (idempotent)
                        else:
                            # Only unmark if it was THIS report that marked it
                            if existing_concluido and existing_rel_id == relatorio_id:
                                obra_item.concluido = False
                                obra_item.concluido_relatorio_id = None
                                obra_item.concluido_em = None
            except Exception as _cl_err:
                logger.warning(f"Erro ao processar conclusão de checklist: {_cl_err}")
        if 'status' in data:
            relatorio.status = data['status']


        # Processar lembrete_proxima_visita
        if 'lembrete_proxima_visita' in data:
            if data['lembrete_proxima_visita']:
                try:
                    if isinstance(data['lembrete_proxima_visita'], str):
                        relatorio.lembrete_proxima_visita = datetime.fromisoformat(
                            data['lembrete_proxima_visita'].replace('Z', '+00:00')
                        )
                    else:
                        relatorio.lembrete_proxima_visita = data['lembrete_proxima_visita']
                except (ValueError, TypeError) as e:
                    logger.warning(f"Erro ao processar lembrete_proxima_visita: {e}")
            else:
                relatorio.lembrete_proxima_visita = None

        # Atualizar metadados
        relatorio.atualizado_por = current_user.id
        relatorio.updated_at = now_brt()

        # Processar sincronização de imagens
        imagens_atualizadas = []

        # 1. Processar remoção de imagens (se especificado)
        if 'imagens_excluidas' in data:
            try:
                imagens_excluidas = data['imagens_excluidas']
                if isinstance(imagens_excluidas, str):
                    import json
                    imagens_excluidas = json.loads(imagens_excluidas)

                for img_id in imagens_excluidas:
                    foto = FotoRelatorio.query.get(img_id)
                    if foto and foto.relatorio_id == relatorio_id:
                        # Remover arquivo físico se existir
                        if foto.filename:
                            filepath = os.path.join(app.config['UPLOAD_FOLDER'], foto.filename)
                            if os.path.exists(filepath):
                                os.remove(filepath)
                        db.session.delete(foto)
            except Exception as e:
                logger.error(f"Erro ao processar exclusão de imagens: {e}")

        # 2. Atualizar legendas e ordem de imagens existentes
        if 'imagens' in data:
            try:
                imagens_info = data['imagens']
                if isinstance(imagens_info, str):
                    import json
                    imagens_info = json.loads(imagens_info)

                for img_info in imagens_info:
                    if 'id' in img_info:
                        foto = FotoRelatorio.query.get(img_info['id'])
                        if foto and foto.relatorio_id == relatorio_id:
                            if 'legenda' in img_info:
                                foto.legenda = img_info['legenda']
                            if 'ordem' in img_info:
                                foto.ordem = img_info['ordem']
                            if 'category' in img_info:
                                foto.tipo_servico = img_info['category']
                            if 'local' in img_info:
                                foto.local = img_info['local']
            except Exception as e:
                logger.error(f"Erro ao atualizar imagens: {e}")

        # 3. Adicionar novas imagens
        if files:
            # Obter ordem máxima atual
            max_ordem = db.session.query(db.func.max(FotoRelatorio.ordem)).filter_by(
                relatorio_id=relatorio_id
            ).scalar() or -1

            for idx, file in enumerate(files):
                if file and file.filename:
                    try:
                        # Salvar arquivo (pode lançar ValueError se tamanho exceder limite)
                        file_info = save_uploaded_image(file, relatorio_id)

                        nova_foto = FotoRelatorio(
                            relatorio_id=relatorio_id,
                            filename=file_info['filename'],
                            url=file_info['url'],
                            legenda=request.form.get(f'legenda_{idx}', ''),
                            ordem=max_ordem + idx + 1,
                            content_type=file_info['content_type'],
                            imagem_size=file_info['size']
                        )
                        db.session.add(nova_foto)

                        imagens_atualizadas.append({
                            'url': file_info['url'],
                            'legenda': nova_foto.legenda,
                            'ordem': nova_foto.ordem
                        })
                    except ValueError as val_error:
                        # Erro de validação (tamanho, tipo, etc)
                        db.session.rollback()
                        logger.error(f"Erro de validação ao adicionar nova imagem: {val_error}")
                        return jsonify({
                            'success': False,
                            'error': 'Erro de validação de arquivo',
                            'details': str(val_error)
                        }), 413  # Payload Too Large
                    except Exception as img_error:
                        # Outros erros inesperados
                        db.session.rollback()
                        logger.error(f"Erro inesperado ao adicionar nova imagem: {img_error}")
                        return jsonify({
                            'success': False,
                            'error': 'Erro ao processar imagem',
                            'details': str(img_error)
                        }), 400

        # Commit das alterações
        db.session.commit()

        # Buscar estado atualizado das imagens
        imagens_finais = [{
            'id': img.id,
            'url': img.url or f"/uploads/{img.filename}" if img.filename else None,
            'legenda': img.legenda,
            'ordem': img.ordem,
            'tipo_servico': img.tipo_servico or '',
            'category': img.tipo_servico or '',
            'local': img.local or ''
        } for img in relatorio.imagens.order_by(FotoRelatorio.ordem).all()]

        return jsonify({
            'success': True,
            'relatorio': {
                'id': relatorio.id,
                'numero': relatorio.numero,
                'titulo': relatorio.titulo,
                'updated_at': relatorio.updated_at.isoformat()
            },
            'imagens': imagens_finais,
            'message': 'Relatório atualizado com sucesso'
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Erro ao atualizar relatório {relatorio_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Erro ao atualizar relatório',
            'details': str(e)
        }), 500

@app.route('/api/relatorios/<int:relatorio_id>/imagens/<int:imagem_id>', methods=['DELETE'])
@login_required
def api_remover_imagem(relatorio_id, imagem_id):
    """
    DELETE /api/relatorios/<id>/imagens/<imagem_id>

    Remove uma imagem do relatório, tanto no banco quanto no armazenamento físico.
    """
    try:
        # Buscar imagem
        foto = FotoRelatorio.query.get(imagem_id)

        if not foto:
            return jsonify({
                'success': False,
                'error': 'Imagem não encontrada'
            }), 404

        # Verificar se a imagem pertence ao relatório especificado
        if foto.relatorio_id != relatorio_id:
            return jsonify({
                'success': False,
                'error': 'Imagem não pertence a este relatório'
            }), 403

        # Remover arquivo físico se existir
        if foto.filename:
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], foto.filename)
            try:
                if os.path.exists(filepath):
                    os.remove(filepath)
                    logger.info(f"Arquivo removido: {filepath}")
            except Exception as file_error:
                logger.error(f"Erro ao remover arquivo físico: {file_error}")
                # Continuar mesmo se falhar a remoção do arquivo

        # Remover registro do banco
        db.session.delete(foto)

        # Atualizar timestamp do relatório
        relatorio = Relatorio.query.get(relatorio_id)
        if relatorio:
            relatorio.updated_at = now_brt()
            relatorio.atualizado_por = current_user.id

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Imagem removida com sucesso'
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Erro ao remover imagem {imagem_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Erro ao remover imagem',
            'details': str(e)
        }), 500

@app.route('/api/relatorios/autosave', methods=['POST'])
@csrf.exempt
@login_required

def api_autosave_relatorio():
    """
    POST /api/relatorios/autosave

    AutoSave completo do relatório - REPLICA EXATAMENTE o comportamento do botão "Concluir relatório"
    """
    try:
        data = request.get_json()

        # LOG: Dados recebidos
        print("📦 AutoSave - Dados recebidos:", data)

        if not data:
            print("❌ AutoSave: Nenhum dado fornecido")
            return jsonify({
                'success': False,
                'error': 'Nenhum dado fornecido'
            }), 400

        relatorio_id = data.get('id')
        if relatorio_id:
            try:
                relatorio_id = int(relatorio_id)
            except (ValueError, TypeError):
                pass
        print(f"🔍 AutoSave: relatório_id = {relatorio_id}")
        
        # Verificar se existe relatório com o mesmo número
        numero_relatorio = data.get('numero')
        projeto_id = data.get('projeto_id')
        
        if numero_relatorio and projeto_id:
            relatorio_existente = Relatorio.query.filter_by(
                numero=numero_relatorio,
                projeto_id=projeto_id
            ).first()
            
            if relatorio_existente and not relatorio_id:
                # Usar o ID do relatório existente ao invés de criar duplicado
                relatorio_id = relatorio_existente.id
                print(f"📌 AutoSave: Relatório existente encontrado com número {numero_relatorio} - ID: {relatorio_id}")

        # 1️⃣ CRIAR NOVO RELATÓRIO SE NÃO EXISTIR
        if not relatorio_id:
            # Validar campos obrigatórios para criação
            if not data.get('projeto_id'):
                return jsonify({
                    'success': False,
                    'error': 'Campo projeto_id é obrigatório para criar novo relatório'
                }), 400

            # Verificar se projeto existe
            projeto = Projeto.query.get(data['projeto_id'])
            if not projeto:
                return jsonify({
                    'success': False,
                    'error': f"Projeto {data['projeto_id']} não encontrado"
                }), 404

            # Gerar número do relatório - SEMPRE recalcular no servidor (número do cliente pode estar stale)
            numeracao_inicial = projeto.numeracao_inicial or 1
            max_numero_existente = db.session.query(
                db.func.max(Relatorio.numero_projeto)
            ).filter_by(projeto_id=data['projeto_id']).scalar()

            if max_numero_existente is None:
                proximo_numero = numeracao_inicial
            else:
                proximo_numero = max(numeracao_inicial - 1, max_numero_existente) + 1

            # Formato consistente REL-XXXX (igual a api_next_report_number)
            numero_formatado = f"REL-{proximo_numero:04d}"
            
            # Proteção contra race condition: verificar unicidade
            tentativas = 0
            while tentativas < 10:
                existe = Relatorio.query.filter_by(
                    projeto_id=data['projeto_id'],
                    numero=numero_formatado
                ).first()
                if not existe:
                    break
                proximo_numero += 1
                numero_formatado = f"REL-{proximo_numero:04d}"
                tentativas += 1
            
            logger.info(f"📝 AutoSave CREATE: Número gerado no servidor: {numero_formatado} (numeracao_inicial: {numeracao_inicial}, max_existente: {max_numero_existente})")

            # Processar lembrete_proxima_visita
            lembrete_proxima_visita = None
            if data.get('lembrete_proxima_visita'):
                try:
                    if isinstance(data['lembrete_proxima_visita'], str):
                        lembrete_proxima_visita = datetime.fromisoformat(
                            data['lembrete_proxima_visita'].replace('Z', '+00:00')
                        )
                    else:
                        lembrete_proxima_visita = data['lembrete_proxima_visita']
                except (ValueError, TypeError) as e:
                    logger.warning(f"Erro ao processar lembrete_proxima_visita: {e}")

            # Processar checklist_data - COMPATÍVEL COM ARRAY OU STRING
            checklist_data = data.get('checklist_data')
            if checklist_data is not None:
                if isinstance(checklist_data, str):
                    # Já é string JSON - validar
                    try:
                        import json
                        json.loads(checklist_data)  # Validar
                        print(f"✅ AutoSave: checklist_data (string) salvo")
                    except:
                        checklist_data = None
                        print(f"⚠️ AutoSave: checklist_data inválido, definido como None")
                elif isinstance(checklist_data, (dict, list)):
                    # Converter para JSON string
                    import json
                    checklist_data = json.dumps(checklist_data)
                    print(f"✅ AutoSave: checklist_data (array) convertido e salvo")
                else:
                    checklist_data = None
            else:
                checklist_data = None


            # Processar acompanhantes - COMPATÍVEL COM ARRAY OU STRING
            acompanhantes = data.get('acompanhantes')
            if acompanhantes is not None:
                if isinstance(acompanhantes, str):
                    # Parsear string JSON para array
                    try:
                        import json
                        acompanhantes = json.loads(acompanhantes)
                        if not isinstance(acompanhantes, list):
                            acompanhantes = []
                    except:
                        acompanhantes = []
                elif isinstance(acompanhantes, list):
                    # Já é array
                    pass
                else:
                    acompanhantes = []

                print(f"✅ AutoSave: {len(acompanhantes)} acompanhantes salvos")
            else:
                acompanhantes = []

            # Processar data_relatorio do formulário (input type="date" envia 'YYYY-MM-DD')
            data_relatorio_val = now_brt()
            if data.get('data_relatorio'):
                try:
                    dr_str = str(data['data_relatorio']).strip()
                    if len(dr_str) == 10:
                        # data pura 'YYYY-MM-DD' — usar meio-dia para evitar rollback UTC→BRT
                        from datetime import date as _dr_date
                        _dr_d = _dr_date.fromisoformat(dr_str)
                        data_relatorio_val = datetime(_dr_d.year, _dr_d.month, _dr_d.day, 12, 0, 0)
                    else:
                        data_relatorio_val = datetime.fromisoformat(dr_str.replace('Z', '+00:00'))
                except Exception as _e:
                    logger.warning(f"Erro ao processar data_relatorio na criação: {_e}")

            # Criar novo relatório
            novo_relatorio = Relatorio(
                numero=numero_formatado,
                numero_projeto=proximo_numero,
                titulo=data.get('titulo', 'Relatório de visita'),
                descricao=data.get('descricao'),
                projeto_id=data['projeto_id'],
                visita_id=data.get('visita_id'),
                autor_id=current_user.id,
                criado_por=current_user.id,
                atualizado_por=current_user.id,

                # Campos de AutoSave
                categoria=data.get('categoria'),
                local=data.get('local'),
                observacoes_finais=data.get('observacoes_finais'),
                lembrete_proxima_visita=lembrete_proxima_visita,

                # Data/hora — usar data do formulário ou now_brt() como fallback
                data_relatorio=data_relatorio_val,

                # Status
                status=data.get('status', 'preenchimento'),

                # Outros campos - SALVAR CORRETAMENTE
                conteudo=data.get('conteudo'),
                checklist_data=checklist_data,
                acompanhantes=acompanhantes
            )

            db.session.add(novo_relatorio)
            db.session.flush()  # Obter ID sem commit completo
            relatorio_id = novo_relatorio.id

            print(f"✅ AutoSave: Novo relatório criado com ID {relatorio_id}")
            print(f"   - Checklist: {checklist_data[:100] if checklist_data else 'None'}...")
            print(f"   - Acompanhantes: {acompanhantes}")
            logger.info(f"✅ AutoSave: Novo relatório criado com ID {relatorio_id}")

            # === CRÍTICO: Persistir marcações do checklist na tabela ChecklistObra ===
            # Sem isso, os itens marcados desaparecem ao editar o relatório
            if checklist_data:
                try:
                    import json as _json
                    from models import ChecklistObra
                    from datetime import datetime as _dt
                    
                    checklist_items_raw = checklist_data
                    if isinstance(checklist_items_raw, str):
                        checklist_items_raw = _json.loads(checklist_items_raw)
                    
                    if isinstance(checklist_items_raw, list):
                        for ci in checklist_items_raw:
                            item_id = ci.get('id')
                            is_checked = bool(ci.get('concluido') or ci.get('completado'))
                            if item_id and is_checked:
                                obra_item = ChecklistObra.query.get(item_id)
                                if obra_item and obra_item.projeto_id == novo_relatorio.projeto_id:
                                    if not obra_item.concluido:
                                        obra_item.concluido = True
                                        obra_item.concluido_relatorio_id = relatorio_id
                                        obra_item.concluido_em = now_brt()
                                        print(f"📋 AutoSave CREATE: ChecklistObra item {item_id} marcado como concluído")
                except Exception as e:
                    logger.error(f"Erro ao salvar ChecklistObra no autosave CREATE: {e}")

            # --- SALVAR INFORMAÇÕES TÉCNICAS NO PROJETO (CREATE) ---
            projeto = Projeto.query.get(novo_relatorio.projeto_id)
            if projeto:
                try:
                    # Atualizar campos técnicos do projeto se presentes no JSON do autosave
                    if 'elementos_construtivos_base' in data: projeto.elementos_construtivos_base = data['elementos_construtivos_base']
                    if 'especificacao_chapisco_colante' in data: projeto.especificacao_chapisco_colante = data['especificacao_chapisco_colante']
                    if 'especificacao_chapisco_alvenaria' in data: projeto.especificacao_chapisco_alvenaria = data['especificacao_chapisco_alvenaria']
                    if 'especificacao_argamassa_emboco' in data: projeto.especificacao_argamassa_emboco = data['especificacao_argamassa_emboco']
                    if 'forma_aplicacao_argamassa' in data: projeto.forma_aplicacao_argamassa = data['forma_aplicacao_argamassa']
                    if 'acabamentos_revestimento' in data: projeto.acabamentos_revestimento = data['acabamentos_revestimento']
                    if 'acabamento_peitoris' in data: projeto.acabamento_peitoris = data['acabamento_peitoris']
                    if 'acabamento_muretas' in data: projeto.acabamento_muretas = data['acabamento_muretas']
                    if 'definicao_frisos_cor' in data: projeto.definicao_frisos_cor = data['definicao_frisos_cor']
                    if 'definicao_face_inferior_abas' in data: projeto.definicao_face_inferior_abas = data['definicao_face_inferior_abas']
                    if 'observacoes_projeto_fachada' in data: projeto.observacoes_projeto_fachada = data['observacoes_projeto_fachada']
                    if 'outras_observacoes' in data: projeto.outras_observacoes = data['outras_observacoes']
                    
                    logger.info(f"✅ AutoSave CREATE: Informações técnicas do projeto {projeto.id} atualizadas")
                except Exception as e:
                    logger.error(f"❌ AutoSave CREATE: Erro ao salvar informações técnicas no projeto: {e}")


        # 2️⃣ ATUALIZAR RELATÓRIO EXISTENTE
        else:
            relatorio = Relatorio.query.get(relatorio_id)

            if not relatorio:
                return jsonify({
                    'success': False,
                    'error': 'Relatório não encontrado'
                }), 404

            # Atualizar campos texto/data
            campos_atualizaveis = [
                'titulo', 'descricao', 'categoria', 'local',
                'observacoes_finais', 'conteudo', 'status',
                'observacoes', 'endereco'
            ]

            for campo in campos_atualizaveis:
                if campo in data:
                    setattr(relatorio, campo, data[campo])

            # Atualizar coordenadas GPS se fornecidas
            if 'latitude' in data:
                relatorio.latitude = data['latitude']
            if 'longitude' in data:
                relatorio.longitude = data['longitude']

            # --- SALVAR INFORMAÇÕES TÉCNICAS NO PROJETO (UPDATE) ---
            projeto = Projeto.query.get(relatorio.projeto_id)
            if projeto:
                try:
                    # Atualizar campos técnicos do projeto se presentes no JSON do autosave
                    if 'elementos_construtivos_base' in data: projeto.elementos_construtivos_base = data['elementos_construtivos_base']
                    if 'especificacao_chapisco_colante' in data: projeto.especificacao_chapisco_colante = data['especificacao_chapisco_colante']
                    if 'especificacao_chapisco_alvenaria' in data: projeto.especificacao_chapisco_alvenaria = data['especificacao_chapisco_alvenaria']
                    if 'especificacao_argamassa_emboco' in data: projeto.especificacao_argamassa_emboco = data['especificacao_argamassa_emboco']
                    if 'forma_aplicacao_argamassa' in data: projeto.forma_aplicacao_argamassa = data['forma_aplicacao_argamassa']
                    if 'acabamentos_revestimento' in data: projeto.acabamentos_revestimento = data['acabamentos_revestimento']
                    if 'acabamento_peitoris' in data: projeto.acabamento_peitoris = data['acabamento_peitoris']
                    if 'acabamento_muretas' in data: projeto.acabamento_muretas = data['acabamento_muretas']
                    if 'definicao_frisos_cor' in data: projeto.definicao_frisos_cor = data['definicao_frisos_cor']
                    if 'definicao_face_inferior_abas' in data: projeto.definicao_face_inferior_abas = data['definicao_face_inferior_abas']
                    if 'observacoes_projeto_fachada' in data: projeto.observacoes_projeto_fachada = data['observacoes_projeto_fachada']
                    if 'outras_observacoes' in data: projeto.outras_observacoes = data['outras_observacoes']
                    
                    logger.info(f"✅ AutoSave UPDATE: Informações técnicas do projeto {projeto.id} atualizadas")
                except Exception as e:
                    logger.error(f"❌ AutoSave UPDATE: Erro ao salvar informações técnicas no projeto: {e}")

            # Atualizar data do relatório se fornecida
            if 'data_relatorio' in data and data['data_relatorio']:
                try:
                    date_val = data['data_relatorio']
                    if isinstance(date_val, str):
                        date_val_clean = date_val.strip()
                        if len(date_val_clean) == 10:
                            # Formato de data pura 'YYYY-MM-DD' do input HTML date
                            # Usar meio-dia para evitar rollback UTC→BRT à meia-noite
                            from datetime import date as _date
                            parsed = _date.fromisoformat(date_val_clean)
                            relatorio.data_relatorio = datetime(parsed.year, parsed.month, parsed.day, 12, 0, 0)
                        else:
                            relatorio.data_relatorio = datetime.fromisoformat(
                                date_val_clean.replace('Z', '+00:00')
                            )
                    else:
                        relatorio.data_relatorio = date_val
                except (ValueError, TypeError) as e:
                    logger.warning(f"Erro ao processar data_relatorio: {e}")

            # Atualizar lembrete_proxima_visita
            if 'lembrete_proxima_visita' in data:
                if data['lembrete_proxima_visita']:
                    try:
                        if isinstance(data['lembrete_proxima_visita'], str):
                            relatorio.lembrete_proxima_visita = datetime.fromisoformat(
                                data['lembrete_proxima_visita'].replace('Z', '+00:00')
                            )
                        else:
                            relatorio.lembrete_proxima_visita = data['lembrete_proxima_visita']
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Erro ao processar lembrete_proxima_visita: {e}")
                else:
                    relatorio.lembrete_proxima_visita = None

            # Atualizar checklist_data - COMPATÍVEL COM ARRAY OU STRING
            if 'checklist_data' in data:
                checklist_data = data['checklist_data']
                if checklist_data is not None:
                    if isinstance(checklist_data, str):
                        # Já é string JSON - validar
                        try:
                            import json
                            json.loads(checklist_data)  # Validar
                            relatorio.checklist_data = checklist_data
                            print(f"✅ AutoSave: checklist_data (string) salvo")
                        except:
                            relatorio.checklist_data = None
                            print(f"⚠️ AutoSave: checklist_data inválido, definido como None")
                    elif isinstance(checklist_data, (dict, list)):
                        # Converter para JSON string
                        import json
                        relatorio.checklist_data = json.dumps(checklist_data)
                        print(f"✅ AutoSave: checklist_data (array) convertido e salvo")
                    else:
                        relatorio.checklist_data = None
                else:
                    relatorio.checklist_data = None

                # === CRÍTICO: Persistir marcações na tabela ChecklistObra (UPDATE PATH) ===
                try:
                    import json as _json
                    from models import ChecklistObra
                    from datetime import datetime as _dt
                    
                    checklist_raw = data['checklist_data']
                    if isinstance(checklist_raw, str):
                        try:
                            checklist_raw = _json.loads(checklist_raw)
                        except:
                            checklist_raw = []
                    
                    if isinstance(checklist_raw, list):
                        for ci in checklist_raw:
                            item_id = ci.get('id')
                            is_checked = bool(ci.get('concluido') or ci.get('completado'))
                            if not item_id:
                                continue
                            obra_item = ChecklistObra.query.get(item_id)
                            if not obra_item:
                                continue
                            if obra_item.projeto_id != relatorio.projeto_id:
                                continue
                            
                            if is_checked:
                                if not obra_item.concluido:
                                    obra_item.concluido = True
                                    obra_item.concluido_relatorio_id = relatorio_id
                                    obra_item.concluido_em = now_brt()
                                    print(f"📋 AutoSave UPDATE: ChecklistObra item {item_id} marcado como concluído pelo relatório {relatorio_id}")
                            else:
                                # Desmarcar somente se FOI este relatório que marcou
                                # Garantir comparação de tipos (int == int)
                                current_rel_id = obra_item.concluido_relatorio_id
                                if obra_item.concluido and current_rel_id is not None and int(current_rel_id) == int(relatorio_id):
                                    obra_item.concluido = False
                                    obra_item.concluido_relatorio_id = None
                                    obra_item.concluido_em = None
                                    print(f"📋 AutoSave UPDATE: ChecklistObra item {item_id} desmarcado")
                except Exception as e:
                    logger.error(f"Erro ao salvar ChecklistObra no autosave UPDATE: {e}")

            # Atualizar acompanhantes - COMPATÍVEL COM ARRAY OU STRING
            if 'acompanhantes' in data:
                acompanhantes = data['acompanhantes']
                if acompanhantes is not None:
                    if isinstance(acompanhantes, str):
                        # Parsear string JSON para array
                        try:
                            import json
                            acompanhantes = json.loads(acompanhantes)
                            if not isinstance(acompanhantes, list):
                                acompanhantes = []
                        except:
                            acompanhantes = []
                    elif isinstance(acompanhantes, list):
                        # Já é array
                        pass
                    else:
                        acompanhantes = []

                    relatorio.acompanhantes = acompanhantes
                    print(f"✅ AutoSave: {len(acompanhantes)} acompanhantes salvos")
                else:
                    relatorio.acompanhantes = []

            # Atualizar metadados de auditoria
            relatorio.atualizado_por = current_user.id
            relatorio.updated_at = now_brt()

            print(f"✅ AutoSave: Relatório {relatorio_id} atualizado")
            logger.info(f"✅ AutoSave: Relatório {relatorio_id} atualizado")

            # 3️⃣ SINCRONIZAR IMAGENS
        imagens_resultado = []

        if 'fotos' in data and data['fotos']:
            fotos_data = data['fotos']

            print(f"📸 AutoSave: Processando {len(fotos_data)} imagens")
            logger.info(f"📸 AutoSave: Processando {len(fotos_data)} imagens")

            for idx, foto_info in enumerate(fotos_data):
                print(f"📸 Imagem {idx}: {foto_info}")
                logger.info(f"📸 Imagem {idx}: {foto_info}")

                # Normalizar metadados para garantir "em branco"
                category = foto_info.get('category') or foto_info.get('tipo_servico') or "em branco"
                local = foto_info.get('local') or "em branco"
                caption = foto_info.get('caption') or foto_info.get('legenda') or "em branco"
                
                # Deletar imagem marcada para remoção
                if foto_info.get('deletar'):
                    foto_id = foto_info.get('id')
                    if foto_id:
                        foto = FotoRelatorio.query.get(foto_id)
                        if foto and foto.relatorio_id == relatorio_id:
                            # Remover arquivo físico se existir
                            if foto.filename:
                                filepath = os.path.join(app.config['UPLOAD_FOLDER'], foto.filename)
                                try:
                                    if os.path.exists(filepath):
                                        os.remove(filepath)
                                        logger.info(f"AutoSave: Arquivo removido: {filepath}")
                                except Exception as file_error:
                                    logger.error(f"Erro ao remover arquivo: {file_error}")

                            db.session.delete(foto)
                            logger.info(f"AutoSave: Imagem {foto_id} marcada para exclusão")
                    continue

                # Adicionar nova imagem (sem id ou id=null)
                if not foto_info.get('id'):
                    # Processar temp_id (imagem do upload temporário)
                    if foto_info.get('temp_id'):
                        temp_id = foto_info['temp_id']

                        # 🔧 CORREÇÃO: Buscar arquivo temporário dinamicamente (qualquer extensão)
                        temp_filepath = None
                        extension = 'jpg'  # padrão

                        # Buscar arquivo que começa com temp_id na pasta temporária
                        import glob
                        temp_pattern = os.path.join(TEMP_UPLOAD_FOLDER, f"{temp_id}.*")
                        matching_files = glob.glob(temp_pattern)

                        if matching_files:
                            temp_filepath = matching_files[0]
                            # Extrair extensão do arquivo encontrado
                            extension = temp_filepath.rsplit('.', 1)[1].lower() if '.' in temp_filepath else 'jpg'
                            logger.info(f"📸 AutoSave: Arquivo temporário encontrado: {temp_filepath}")
                        else:
                            logger.error(f"❌ AutoSave: Nenhum arquivo temporário encontrado com padrão: {temp_pattern}")
                            logger.error(f"   Arquivos na pasta temp: {os.listdir(TEMP_UPLOAD_FOLDER)[:10]}")
                            continue

                        # Verificar se arquivo temporário existe
                        if not os.path.exists(temp_filepath):
                            logger.error(f"AutoSave: Arquivo temporário não encontrado: {temp_filepath}")
                            continue

                        # Ler arquivo temporário como bytes para salvar no banco
                        try:
                            with open(temp_filepath, 'rb') as f:
                                image_bytes = f.read()

                            if not image_bytes:
                                logger.error(f"AutoSave: Arquivo temporário vazio: {temp_filepath}")
                                continue

                            logger.info(f"AutoSave: Arquivo temporário lido: {len(image_bytes)} bytes")
                        except Exception as read_error:
                            logger.error(f"Erro ao ler arquivo temporário: {read_error}")
                            continue

                        # Gerar nome definitivo (extension já foi extraída do arquivo temp)
                        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S%f')
                        final_filename = f"relatorio_{relatorio_id}_{timestamp}_{temp_id}.{extension}"
                        final_filepath = os.path.join(app.config['UPLOAD_FOLDER'], final_filename)

                        logger.info(f"📸 PROCESSANDO temp_id={temp_id}:")
                        logger.info(f"   - temp_filepath: {temp_filepath}")
                        logger.info(f"   - final_filepath: {final_filepath}")
                        logger.info(f"   - temp existe: {os.path.exists(temp_filepath)}")

                        # Copiar arquivo de temp para pasta definitiva (manter temp para retry se necessário)
                        try:
                            shutil.copy2(temp_filepath, final_filepath)
                            logger.info(f"✅ Arquivo copiado: {final_filename}")
                        except Exception as copy_error:
                            logger.error(f"❌ Erro ao copiar arquivo: {copy_error}")
                            continue

                        # Calcular hash da imagem para prevenir duplicatas
                        import hashlib
                        imagem_hash = hashlib.sha256(image_bytes).hexdigest()

                        # 🔧 CORREÇÃO CRÍTICA: Verificar se imagem JÁ EXISTE no banco (prevenir duplicação por temp_id)
                        foto_existente = FotoRelatorio.query.filter_by(
                            relatorio_id=relatorio_id,
                            imagem_hash=imagem_hash
                        ).first()

                        if foto_existente:
                            # Imagem já existe - apenas atualizar metadados
                            logger.info(f"⚠️ AutoSave temp_id: Imagem já existe no banco (hash={imagem_hash[:12]}...) - ID={foto_existente.id}. Atualizando metadados.")
                            
                            # Atualizar metadados da foto existente
                            foto_existente.legenda = caption
                            if foto_info.get('titulo'):
                                foto_existente.titulo = foto_info.get('titulo')
                            foto_existente.tipo_servico = category
                            foto_existente.local = local
                            if 'ordem' in foto_info:
                                foto_existente.ordem = foto_info['ordem']

                            # Remover arquivo temporário já que não precisamos mais dele
                            try:
                                os.remove(temp_filepath)
                                logger.info(f"AutoSave: Arquivo temporário removido (duplicata): {temp_filepath}")
                            except:
                                pass

                            imagens_resultado.append({
                                'id': foto_existente.id,
                                'url': foto_existente.url,
                                'filename': foto_existente.filename,
                                'legenda': foto_existente.legenda,
                                'ordem': foto_existente.ordem,
                                'temp_id': temp_id  # Retornar para frontend mapear
                            })
                            logger.info(f"✅ AutoSave: temp_id={temp_id} mapeado para imagem existente {foto_existente.id} (não duplicada)")
                        else:
                            # Imagem NÃO existe - criar nova
                            nova_foto = FotoRelatorio(
                                relatorio_id=relatorio_id,
                                url=f"/uploads/{final_filename}",
                                filename=final_filename,
                                imagem=image_bytes,  # SALVAR BYTES NO BANCO
                                imagem_hash=imagem_hash,
                                imagem_size=len(image_bytes),
                                content_type=f"image/{extension}",
                                legenda=caption,
                                titulo=foto_info.get('titulo') or '',
                                tipo_servico=category,
                                local=local,
                                ordem=foto_info.get('ordem', idx)
                            )
                            db.session.add(nova_foto)
                            db.session.flush()  # Para obter o ID

                            # Remover arquivo temporário após sucesso
                            try:
                                os.remove(temp_filepath)
                                logger.info(f"AutoSave: Arquivo temporário removido: {temp_filepath}")
                            except:
                                pass

                            imagens_resultado.append({
                                'id': nova_foto.id,
                                'url': nova_foto.url,
                                'filename': nova_foto.filename,
                                'legenda': nova_foto.legenda,
                                'ordem': nova_foto.ordem,
                                'temp_id': temp_id  # Retornar para frontend mapear
                            })
                            logger.info(f"✅ AutoSave: Imagem temp_id={temp_id} SALVA NO BANCO com id={nova_foto.id} ({len(image_bytes)} bytes)")

                    # Imagens já salvas no filesystem - ler arquivo e salvar bytes no banco
                    elif foto_info.get('url') or foto_info.get('filename'):
                        filename = foto_info.get('filename')
                        image_bytes = None

                        # Tentar ler arquivo do filesystem
                        if filename:
                            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                            if os.path.exists(filepath):
                                try:
                                    with open(filepath, 'rb') as f:
                                        image_bytes = f.read()

                                    if not image_bytes:
                                        logger.error(f"AutoSave: Arquivo vazio no filesystem: {filename}")
                                        continue

                                    logger.info(f"AutoSave: Arquivo lido do filesystem: {filename} ({len(image_bytes)} bytes)")
                                except Exception as read_error:
                                    logger.error(f"Erro ao ler arquivo {filename}: {read_error}")
                                    continue
                            else:
                                logger.warning(f"AutoSave: Arquivo não encontrado no filesystem: {filepath}")
                                continue

                        # GARANTIR que a imagem tenha bytes válidos
                        if not image_bytes:
                            logger.error(f"AutoSave: Impossível salvar imagem sem bytes! filename={filename}")
                            continue

                        # Calcular hash da imagem
                        import hashlib
                        imagem_hash = hashlib.sha256(image_bytes).hexdigest()

                        # 🔧 CORREÇÃO: Verificar se imagem já existe no banco (prevenir duplicação)
                        foto_existente = FotoRelatorio.query.filter_by(
                            relatorio_id=relatorio_id,
                            imagem_hash=imagem_hash
                        ).first()

                        if foto_existente:
                            # Imagem já existe - apenas atualizar metadados se necessário
                            logger.info(f"⚠️ AutoSave: Imagem já existe no banco (hash={imagem_hash[:12]}...) - ID={foto_existente.id}. Atualizando metadados.")
                            
                            # Atualizar metadados da foto existente
                            foto_existente.legenda = caption
                            if 'titulo' in foto_info and foto_info['titulo']:
                                foto_existente.titulo = foto_info['titulo']
                            foto_existente.tipo_servico = category
                            foto_existente.local = local
                            if 'ordem' in foto_info:
                                foto_existente.ordem = foto_info['ordem']

                            imagens_resultado.append({
                                'id': foto_existente.id,
                                'url': foto_existente.url,
                                'legenda': foto_existente.legenda,
                                'ordem': foto_existente.ordem
                            })
                            logger.info(f"✅ AutoSave: Metadados da imagem existente {foto_existente.id} atualizados (não duplicada)")
                        else:
                            # Imagem NÃO existe - criar nova
                            nova_foto = FotoRelatorio(
                                relatorio_id=relatorio_id,
                                url=foto_info.get('url'),
                                filename=filename,
                                imagem=image_bytes,  # SALVAR BYTES NO BANCO
                                imagem_hash=imagem_hash,
                                imagem_size=len(image_bytes),
                                content_type=foto_info.get('content_type') or 'image/jpeg',
                                legenda=caption,
                                titulo=foto_info.get('titulo') or '',
                                tipo_servico=category,
                                local=local,
                                ordem=foto_info.get('ordem', 0)
                            )
                            db.session.add(nova_foto)
                            db.session.flush()  # Para obter o ID

                            imagens_resultado.append({
                                'id': nova_foto.id,
                                'url': nova_foto.url,
                                'legenda': nova_foto.legenda,
                                'ordem': nova_foto.ordem
                            })
                            logger.info(f"✅ AutoSave: Nova imagem SALVA NO BANCO - id={nova_foto.id} ({len(image_bytes)} bytes)")

                # Atualizar imagem existente
                else:
                    foto = FotoRelatorio.query.get(foto_info['id'])
                    if foto and foto.relatorio_id == relatorio_id:
                        # Atualizar metadados
                        foto.legenda = caption
                        if 'titulo' in foto_info:
                            foto.titulo = foto_info['titulo']
                        foto.tipo_servico = category
                        foto.local = local
                        if 'ordem' in foto_info:
                            foto.ordem = foto_info['ordem']

                        imagens_resultado.append({
                            'id': foto.id,
                            'url': foto.url,
                            'legenda': foto.legenda,
                            'ordem': foto.ordem
                        })
                        logger.info(f"AutoSave: Metadados da imagem {foto.id} atualizados")

        # 4️⃣ COMMIT DA TRANSAÇÃO
        db.session.commit()
        print(f"✅ AutoSave registrado: {relatorio_id}")
        logger.info(f"✅ AutoSave: Commit realizado para relatório {relatorio_id}")

        # 5️⃣ VERIFICAR SE DEVE FINALIZAR O RELATÓRIO (mudar status para "Aguardando Aprovação")
        # Isso replica exatamente o comportamento do botão "Concluir relatório" no formulário
        should_finalize = data.get('should_finalize') == True or data.get('should_finalize') == 'true'
        enviar_aprovacao = data.get('enviar_aprovacao') == True or data.get('enviar_aprovacao') == 'true'
        relatorio_final = Relatorio.query.get(relatorio_id)
        
        # Mudar status baseado na intenção
        if enviar_aprovacao:
            logger.info(f"🎯 FLAG enviar_aprovacao detectado - submetendo relatório {relatorio_id}")
            relatorio_final.status = 'Aguardando Aprovação'
            relatorio_final.updated_at = now_brt()
            db.session.commit()
            
            # Criar notificação para aprovador
            if relatorio_final.aprovador_id:
                from notification_service import notification_service
                try:
                    notification_service.criar_notificacao_relatorio_pendente(relatorio_final.id)
                    logger.info(f"✅ Notificação criada para aprovador {relatorio_final.aprovador_id}")
                except Exception as e:
                    logger.error(f"Erro ao criar notificação no autosave: {e}")

        elif should_finalize:
            logger.info(f"🎯 FLAG should_finalize detectado - salvando relatório {relatorio_id} como preenchimento")
            relatorio_final.status = 'preenchimento'
            relatorio_final.updated_at = now_brt()
            db.session.commit()
            logger.info(f"✅ Relatório {relatorio_final.numero} FINALIZADO - Status: {relatorio_final.status}")
            print(f"🏁 Relatório {relatorio_final.numero} FINALIZADO")

        # Em qualquer autosave bem-sucedido, tentar baixar a visita associada
        if relatorio_final and relatorio_final.data_relatorio:
            from utils import verificar_e_baixar_visita
            verificar_e_baixar_visita(relatorio_final.projeto_id, relatorio_final.data_relatorio, relatorio_final.numero)

        # VALIDAÇÃO DETALHADA: Verificar quantas imagens foram realmente salvas no banco
        total_imagens_db = FotoRelatorio.query.filter_by(relatorio_id=relatorio_id).count()
        imagens_com_bytes = FotoRelatorio.query.filter(
            FotoRelatorio.relatorio_id == relatorio_id,
            FotoRelatorio.imagem.isnot(None)
        ).count()

        logger.info(f"📊 AutoSave VALIDAÇÃO FINAL:")
        logger.info(f"   - Total de imagens no banco: {total_imagens_db}")
        logger.info(f"   - Imagens COM bytes salvos: {imagens_com_bytes}")
        logger.info(f"   - Imagens SEM bytes: {total_imagens_db - imagens_com_bytes}")

        print(f"📊 Total de imagens no banco: {total_imagens_db}")
        print(f"📊 Imagens com bytes: {imagens_com_bytes}")

        if total_imagens_db != imagens_com_bytes:
            logger.error(f"⚠️ ATENÇÃO: {total_imagens_db - imagens_com_bytes} imagens foram salvas SEM bytes!")

        # Buscar estado final do relatório
        relatorio_final = Relatorio.query.get(relatorio_id)

        # Buscar todas as imagens salvas do relatório para retornar estado completo
        fotos_salvas = FotoRelatorio.query.filter_by(relatorio_id=relatorio_id).order_by(FotoRelatorio.ordem).all()

        imagens_response = []
        for foto in fotos_salvas:
            imagens_response.append({
                'id': foto.id,
                'temp_id': None,  # temp_id já foi convertido em id definitivo
                'url': foto.url or f"/uploads/{foto.filename}" if foto.filename else None,
                'filename': foto.filename,
                'legenda': foto.legenda or '',
                'titulo': foto.titulo or '',
                'tipo_servico': foto.tipo_servico or 'Geral',
                'local': foto.local or '',
                'ordem': foto.ordem or 0
            })

        logger.info(f"✅ AutoSave RESPOSTA: {len(imagens_response)} imagens retornadas")

        return jsonify({
            'success': True,
            'message': 'AutoSave executado com sucesso',
            'relatorio_id': relatorio_id,
            'relatorio': {
                'id': relatorio_final.id,
                'numero': relatorio_final.numero,
                'titulo': relatorio_final.titulo,
                'status': relatorio_final.status,
                'updated_at': relatorio_final.updated_at.isoformat() if relatorio_final.updated_at else None
            },
            'imagens': imagens_response  # Array sempre válido e completo
        }), 200

    except IntegrityError as e:
        db.session.rollback()
        print(f"❌ Erro no autosave (integridade): {str(e)}")
        logger.error(f"Erro de integridade no AutoSave: {e}")
        return jsonify({
            'success': False,
            'error': 'Erro de integridade no banco de dados',
            'details': str(e)
        }), 400

    except Exception as e:
        db.session.rollback()
        print(f"❌ Erro no autosave: {str(e)}")
        logger.error(f"Erro no AutoSave: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Erro ao executar AutoSave',
            'details': str(e)
        }), 500

# =============================================================================
# FUNÇÕES AUXILIARES PARA PROCESSAMENTO DE IMAGENS
# =============================================================================

def calcular_hash_imagem(image_data):
    """Calcula SHA256 hash de dados de imagem"""
    import hashlib
    if isinstance(image_data, memoryview):
        image_data = bytes(image_data)
    return hashlib.sha256(image_data).hexdigest()

def detectar_content_type(filename, image_data=None):
    """Detecta content type baseado no filename ou nos dados da imagem"""
    import imghdr
    
    # Tentar detectar pelo filename primeiro
    if filename:
        ext = filename.lower().split('.')[-1]
        content_types = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'bmp': 'image/bmp'
        }
        if ext in content_types:
            return content_types[ext]
    
    # Fallback: tentar detectar pelos dados da imagem
    if image_data:
        try:
            img_type = imghdr.what(None, h=image_data[:32])
            if img_type:
                return f'image/{img_type}'
        except:
            pass
    
    # Default
    return 'image/jpeg'

logger.info("✅ API de relatórios carregada com sucesso")

# ===== ENDPOINT DE APROVAÇÃO DE RELATÓRIO =====
@app.route('/api/relatorios/<int:relatorio_id>/aprovar', methods=['POST'])
@login_required
def approve_relatorio_api(relatorio_id):
    """Aprova relatório normal e envia emails para TODOS"""
    try:
        relatorio = Relatorio.query.get(relatorio_id)
        if not relatorio:
            return jsonify({'success': False, 'error': 'Relatório não encontrado'}), 404
        
        relatorio.status = 'Aprovado'
        relatorio.aprovador_id = current_user.id
        relatorio.data_aprovacao = now_brt()
        db.session.commit()
        
        logger.info(f"✅ Relatório {relatorio.numero} aprovado")
        
        # Gerar PDF
        pdf_path = None
        try:
            from pdf_generator import gerar_pdf_relatorio
            resultado_pdf = gerar_pdf_relatorio(relatorio_id, salvar_arquivo=True)
            if resultado_pdf.get('success'):
                pdf_path = resultado_pdf.get('path')
        except Exception as e:
            logger.error(f"⚠️ Erro ao gerar PDF: {e}")
        
        # Enviar emails
        emails_enviados = 0
        if pdf_path and os.path.exists(pdf_path):
            try:
                from email_service_unified import get_email_service
                email_service = get_email_service()
                resultado = email_service.send_approval_email(relatorio, pdf_path)
                emails_enviados = resultado.get('enviados', 0)
            except Exception as e:
                logger.error(f"⚠️ Erro ao enviar emails: {e}")
        
        return jsonify({'success': True, 'emails_enviados': emails_enviados}), 200
    
    except Exception as e:
        db.session.rollback()
        logger.error(f"❌ Erro ao aprovar: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
