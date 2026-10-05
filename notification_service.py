import os
import logging
from datetime import datetime, timedelta
from flask import current_app
# Import models inside functions to avoid circular imports
# from models import Notificacao, User, Projeto, Relatorio, FuncionarioProjeto
from app import db, now_brt
from onesignal_service import onesignal_service

logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self):
        self.onesignal_service = onesignal_service
        self.base_url = 'https://elpconsultoria.pro'  # Production URL
        logger.info("✅ NotificationService initialized with OneSignal")
    
    def _build_full_url(self, path):
        """
        Convert relative path to absolute HTTPS URL for OneSignal
        
        Args:
            path: Relative path (e.g., '/reports/123')
            
        Returns:
            Full HTTPS URL (e.g., 'https://elpconsultoria.pro/reports/123')
        """
        if not path:
            return self.base_url
        
        # If already absolute URL, return as is
        if path.startswith('http://') or path.startswith('https://'):
            return path
        
        # Ensure path starts with /
        if not path.startswith('/'):
            path = '/' + path
        
        return f"{self.base_url}{path}"
    
    def criar_notificacao(self, user_id, tipo, titulo, mensagem, link_destino=None, enviar_push=True):
        """
        Cria uma notificação genérica no sistema
        
        Args:
            user_id: ID do usuário destinatário
            tipo: Tipo da notificação (obra_criada, relatorio_pendente, relatorio_reprovado)
            titulo: Título da notificação
            mensagem: Mensagem da notificação
            link_destino: URL de destino ao clicar na notificação
            enviar_push: Se deve enviar push notification
        """
        try:
            from models import Notificacao, User
            
            notificacao = Notificacao(
                user_id=user_id,
                tipo=tipo,
                titulo=titulo,
                mensagem=mensagem,
                link_destino=link_destino,
                status='nova'
            )
            
            db.session.add(notificacao)
            db.session.flush()
            
            if enviar_push:
                from models import UserDevice
                
                # Get ALL devices for this user
                devices = UserDevice.query.filter_by(user_id=user_id).all()
                
                if devices:
                    player_ids = [d.player_id for d in devices]
                    device_count = len(player_ids)
                    
                    logger.info(f"📱 Sending push to {device_count} device(s) for user {user_id}")
                    logger.info(f"📱 Player IDs: {[pid[:20]+'...' for pid in player_ids]}")
                    
                    # Convert relative path to absolute URL for OneSignal
                    full_url = self._build_full_url(link_destino)
                    
                    # Send to all devices
                    result = self.onesignal_service.send_notification_to_many(
                        player_ids=player_ids,
                        title=f"Nova Notificação - {current_app.config.get('APP_NAME', 'ObraFlow')}",
                        message=mensagem,
                        url=full_url,
                        data={'tipo': tipo} if tipo else None
                    )
                    
                    # SELF-HEALING: Remove invalid player IDs if reported by OneSignal
                    if result and not result.get('success') and 'response' in result:
                        response_data = result.get('response', {})
                        # Check for invalid_player_ids in errors
                        errors = response_data.get('errors')
                        invalid_ids = []
                        
                        if isinstance(errors, dict) and 'invalid_player_ids' in errors:
                            invalid_ids = errors['invalid_player_ids']
                        elif response_data.get('invalid_player_ids'):
                            invalid_ids = response_data.get('invalid_player_ids')
                            
                        if invalid_ids:
                            current_app.logger.warning(f"🧹 SELF-HEALING: Removing {len(invalid_ids)} invalid device(s) from database")
                            try:
                                # Remove invalid devices to force re-registration
                                db.session.query(UserDevice).filter(UserDevice.player_id.in_(invalid_ids)).delete(synchronize_session=False)
                                db.session.commit()
                                current_app.logger.info("✅ Invalid devices removed successfully. User needs to re-login/refresh to register new ID.")
                            except Exception as e:
                                current_app.logger.error(f"❌ Error removing invalid devices: {e}")
                                db.session.rollback()

                    if result and result.get('success'):
                        current_app.logger.info(f"✅ Push sent! {result.get('recipients')} device(s) received")
                    else:
                        current_app.logger.info(f"⚠️ Push missed: {result.get('error')}")
                else:
                    logger.info(f"📱 User {user_id} has NO registered devices")
                    
                    # Fallback: Try old fcm_token method
                    usuario_destino = User.query.get(user_id)
                    if usuario_destino and usuario_destino.fcm_token:
                        logger.info(f"📱 Trying fallback fcm_token: {usuario_destino.fcm_token[:20]}...")
                        full_url = self._build_full_url(link_destino)
                        
                        self.onesignal_service.send_notification(
                            player_id=usuario_destino.fcm_token,
                            title=titulo,
                            message=mensagem,
                            url=full_url,
                            data={'tipo': tipo} if tipo else None
                        )
            
            db.session.commit()
            logger.info(f"✅ Notificação criada: {titulo} para usuário {user_id}")
            
            return {
                'success': True,
                'notificacao_id': notificacao.id
            }
        
        except Exception as e:
            db.session.rollback()
            logger.error(f"❌ Erro ao criar notificação: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def criar_notificacao_obra_criada(self, projeto_id):
        """
        Cria notificações para todos os responsáveis de uma obra recém-criada
        
        Args:
            projeto_id: ID do projeto/obra criado
        """
        try:
            from models import Projeto, FuncionarioProjeto
            
            projeto = Projeto.query.get(projeto_id)
            if not projeto:
                logger.error(f"❌ Projeto {projeto_id} não encontrado")
                return {'success': False, 'error': 'Projeto não encontrado'}
            
            # Obter todos os responsáveis pela obra
            responsaveis_ids = set()
            
            # Adicionar responsável principal apenas se existir e for válido
            if projeto.responsavel_id is not None:
                responsaveis_ids.add(projeto.responsavel_id)
            
            # Adicionar funcionários responsáveis do projeto
            funcionarios = FuncionarioProjeto.query.filter_by(
                projeto_id=projeto_id,
                ativo=True
            ).all()
            
            for func in funcionarios:
                if func.user_id is not None:
                    responsaveis_ids.add(func.user_id)
            
            # Filtrar IDs inválidos (None, 0, negativos)
            responsaveis_ids = {uid for uid in responsaveis_ids if uid and uid > 0}
            
            # Verificar se há responsáveis válidos
            if not responsaveis_ids:
                logger.warning(f"⚠️ Nenhum responsável válido encontrado para projeto {projeto_id}")
                return {'success': True, 'count': 0, 'message': 'Nenhum responsável para notificar'}
            
            # Criar notificação para cada responsável
            notificacoes_criadas = 0
            for user_id in responsaveis_ids:
                resultado = self.criar_notificacao(
                    user_id=user_id,
                    tipo='obra_criada',
                    titulo='Nova obra criada',
                    mensagem=f'A obra "{projeto.nome}" foi criada e você foi designado como responsável.',
                    link_destino=f'/projects/{projeto_id}'
                )
                
                if resultado['success']:
                    notificacoes_criadas += 1
            
            logger.info(f"✅ {notificacoes_criadas} notificações de obra criada enviadas")
            return {'success': True, 'count': notificacoes_criadas}
            
        except Exception as e:
            logger.error(f"❌ Erro ao criar notificações de obra criada: {e}")
            return {'success': False, 'error': str(e)}
    
    def criar_notificacao_relatorio_pendente(self, relatorio_id):
        """
        Cria notificação para o aprovador de um relatório pendente
        Busca aprovador específico do projeto ou aprovador global
        
        Args:
            relatorio_id: ID do relatório pendente
        """
        try:
            from models import Relatorio, Projeto, AprovadorPadrao
            
            relatorio = Relatorio.query.get(relatorio_id)
            if not relatorio:
                logger.error(f"❌ Relatório {relatorio_id} não encontrado")
                return {'success': False, 'error': 'Relatório não encontrado'}
            
            # Buscar aprovador específico do projeto ou aprovador global
            aprovador_id = None
            
            # 1. Tentar buscar aprovador específico do projeto
            if relatorio.projeto_id:
                aprovador_projeto = AprovadorPadrao.query.filter_by(
                    projeto_id=relatorio.projeto_id,
                    ativo=True
                ).order_by(AprovadorPadrao.prioridade).first()
                
                if aprovador_projeto:
                    aprovador_id = aprovador_projeto.aprovador_id
                    logger.info(f"✅ Aprovador específico encontrado para projeto {relatorio.projeto_id}: user {aprovador_id}")
            
            # 2. Se não encontrou aprovador específico, buscar aprovador global
            if not aprovador_id:
                aprovador_global = AprovadorPadrao.query.filter_by(
                    is_global=True,
                    ativo=True
                ).order_by(AprovadorPadrao.prioridade).first()
                
                if aprovador_global:
                    aprovador_id = aprovador_global.aprovador_id
                    logger.info(f"✅ Aprovador global encontrado: user {aprovador_id}")
            
            # 3. Fallback: usar aprovador_id do relatório se existir
            if not aprovador_id and relatorio.aprovador_id:
                aprovador_id = relatorio.aprovador_id
                logger.info(f"✅ Usando aprovador_id do relatório: user {aprovador_id}")
            
            # Se não encontrou nenhum aprovador, retornar erro
            if not aprovador_id:
                logger.warning(f"⚠️ Relatório {relatorio_id} não tem aprovador designado (nem específico, nem global)")
                return {'success': False, 'error': 'Relatório sem aprovador designado'}
            
            # Buscar informações do projeto para mensagem mais completa
            projeto = Projeto.query.get(relatorio.projeto_id) if relatorio.projeto_id else None
            projeto_nome = projeto.nome if projeto else "Sem projeto"
            numero_rel = relatorio.numero or "S/N"
            titulo_rel = relatorio.titulo or "Sem título"
            
            resultado = self.criar_notificacao(
                user_id=aprovador_id,
                tipo='relatorio_pendente',
                titulo='Você tem um relatório com aprovação pendente',
                mensagem=f'O relatório nº {numero_rel} "{titulo_rel}" da obra "{projeto_nome}" está aguardando sua aprovação.',
                link_destino=f'/reports/{relatorio_id}/review'
            )
            
            return resultado
            
        except Exception as e:
            logger.error(f"❌ Erro ao criar notificação de relatório pendente: {e}")
            return {'success': False, 'error': str(e)}
    
    def criar_notificacao_relatorio_reprovado(self, relatorio_id, motivo_rejeicao=None):
        """
        Cria notificação para o autor de um relatório reprovado
        
        Args:
            relatorio_id: ID do relatório reprovado
            motivo_rejeicao: Motivo/comentário da rejeição (opcional)
        """
        try:
            from models import Relatorio, Projeto
            
            relatorio = Relatorio.query.get(relatorio_id)
            if not relatorio:
                logger.error(f"❌ Relatório {relatorio_id} não encontrado")
                return {'success': False, 'error': 'Relatório não encontrado'}
            
            projeto = Projeto.query.get(relatorio.projeto_id) if relatorio.projeto_id else None
            projeto_nome = projeto.nome if projeto else "Sem projeto"
            numero_rel = relatorio.numero or "S/N"
            
            # Usar motivo passado ou buscar do relatório
            motivo = motivo_rejeicao or getattr(relatorio, 'comentario_aprovacao', None)
            
            if motivo:
                mensagem = f'O relatório nº {numero_rel} da obra "{projeto_nome}" foi reprovado. Motivo: {motivo}'
            else:
                mensagem = f'O relatório nº {numero_rel} da obra "{projeto_nome}" foi reprovado. Verifique as observações e corrija antes de reenviar.'
            
            resultado = self.criar_notificacao(
                user_id=relatorio.autor_id,
                tipo='relatorio_reprovado',
                titulo='Relatório reprovado',
                mensagem=mensagem,
                link_destino=f'/reports/{relatorio_id}/edit'
            )
            
            return resultado
            
        except Exception as e:
            logger.error(f"❌ Erro ao criar notificação de relatório reprovado: {e}")
            return {'success': False, 'error': str(e)}
    
    
    def enviar_push_notification(self, token, titulo, corpo, link=None, tipo=None):
        """
        Envia push notification via OneSignal
        
        Args:
            token: OneSignal player ID (stored in fcm_token field)
            titulo: Notification title
            corpo: Notification body/message
            link: Optional URL to open when clicked
            tipo: Notification type
            
        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            # Prepare notification data
            data = {
                'tipo': tipo or 'geral',
                'timestamp': now_brt().isoformat()
            }
            
            # Send via OneSignal
            result = self.onesignal_service.send_notification(
                player_id=token,
                title=titulo,
                message=corpo,
                data=data,
                url=link
            )
            
            if result.get('success'):
                logger.info(f"✅ Push notification enviada via OneSignal")
                return True
            else:
                logger.warning(f"⚠️ Falha ao enviar via OneSignal: {result.get('error')}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Erro ao enviar push notification via OneSignal: {e}")
            return False
    
    def marcar_como_lida(self, notificacao_id, user_id):
        """
        Marca uma notificação como lida
        
        Args:
            notificacao_id: ID da notificação
            user_id: ID do usuário (para validação de permissão)
        """
        try:
            from models import Notificacao
            
            notificacao = Notificacao.query.filter_by(
                id=notificacao_id,
                user_id=user_id
            ).first()
            
            if not notificacao:
                return {'success': False, 'error': 'Notificação não encontrada'}
            
            notificacao.marcar_como_lida()
            db.session.commit()
            
            return {'success': True}
        
        except Exception as e:
            db.session.rollback()
            logger.error(f"❌ Erro ao marcar notificação como lida: {e}")
            return {'success': False, 'error': str(e)}
    
    def marcar_todas_como_lidas(self, user_id):
        """
        Marca todas as notificações de um usuário como lidas
        
        Args:
            user_id: ID do usuário
        """
        try:
            from models import Notificacao
            
            notificacoes = Notificacao.query.filter_by(
                user_id=user_id,
                status='nova'
            ).all()
            
            count = 0
            for notificacao in notificacoes:
                notificacao.marcar_como_lida()
                count += 1
            
            db.session.commit()
            logger.info(f"✅ {count} notificações marcadas como lidas para usuário {user_id}")
            
            return {'success': True, 'count': count}
        
        except Exception as e:
            db.session.rollback()
            logger.error(f"❌ Erro ao marcar todas como lidas: {e}")
            return {'success': False, 'error': str(e)}
            
    def limpar_todas_notificacoes(self, user_id):
        """
        Remove todas as notificações de um usuário
        
        Args:
            user_id: ID do usuário
        """
        try:
            from models import Notificacao
            
            notificacoes = Notificacao.query.filter_by(user_id=user_id).all()
            
            count = 0
            for notificacao in notificacoes:
                db.session.delete(notificacao)
                count += 1
            
            db.session.commit()
            logger.info(f"🧹 {count} notificações deletadas para usuário {user_id}")
            
            return {'success': True, 'count': count}
        
        except Exception as e:
            db.session.rollback()
            logger.error(f"❌ Erro ao limpar todas as notificações: {e}")
            return {'success': False, 'error': str(e)}
    
    def listar_notificacoes(self, user_id, apenas_nao_lidas=False, limit=50):
        """
        Lista as notificações de um usuário
        
        Args:
            user_id: ID do usuário
            apenas_nao_lidas: Se deve retornar apenas notificações não lidas
            limit: Número máximo de notificações a retornar
        """
        try:
            from models import Notificacao
            
            query = Notificacao.query.filter_by(user_id=user_id)
            
            if apenas_nao_lidas:
                query = query.filter_by(status='nova')
            
            notificacoes = query.order_by(Notificacao.created_at.desc()).limit(limit).all()
            
            return {
                'success': True,
                'notificacoes': [n.to_dict() for n in notificacoes],
                'total': len(notificacoes)
            }
        
        except Exception as e:
            logger.error(f"❌ Erro ao listar notificações: {e}")
            return {'success': False, 'error': str(e)}
    
    def criar_notificacao_relatorio_aprovado(self, relatorio_id, aprovador_id):
        """
        Cria notificação para o autor quando relatório é aprovado
        
        Args:
            relatorio_id: ID do relatório aprovado
            aprovador_id: ID do aprovador que aprovou
        """
        try:
            from models import Relatorio, User, Projeto
            
            relatorio = Relatorio.query.get(relatorio_id)
            if not relatorio:
                logger.error(f"❌ Relatório {relatorio_id} não encontrado")
                return {'success': False, 'error': 'Relatório não encontrado'}
            
            # Notificar o autor do relatório
            aprovador = User.query.get(aprovador_id)
            aprovador_nome = aprovador.nome_completo if aprovador else "Aprovador"
            
            projeto = Projeto.query.get(relatorio.projeto_id) if relatorio.projeto_id else None
            projeto_nome = projeto.nome if projeto else "Sem projeto"
            numero_rel = relatorio.numero or "S/N"
            titulo_rel = relatorio.titulo or "Sem título"
            
            resultado = self.criar_notificacao(
                user_id=relatorio.autor_id,
                tipo='relatorio_aprovado',
                titulo='Relatório aprovado',
                mensagem=f'Seu relatório nº {numero_rel} "{titulo_rel}" da obra "{projeto_nome}" foi aprovado por {aprovador_nome}.',
                link_destino=f'/reports/{relatorio_id}/edit'
            )
            
            return resultado
            
        except Exception as e:
            logger.error(f"❌ Erro ao criar notificação de relatório aprovado: {e}")
            return {'success': False, 'error': str(e)}
    
    def criar_notificacao_relatorio_criado(self, relatorio_id):
        """
        Cria notificação para participantes quando um novo relatório é criado
        
        Args:
            relatorio_id: ID do relatório criado
        """
        try:
            from models import Relatorio, Projeto, FuncionarioProjeto, AprovadorPadrao
            
            relatorio = Relatorio.query.get(relatorio_id)
            if not relatorio:
                logger.error(f"❌ Relatório {relatorio_id} não encontrado")
                return {'success': False, 'error': 'Relatório não encontrado'}
            
            projeto = Projeto.query.get(relatorio.projeto_id) if relatorio.projeto_id else None
            projeto_nome = projeto.nome if projeto else "Sem projeto"
            
            # Coletar IDs de usuários a notificar (excluindo o autor)
            usuarios_a_notificar = set()
            
            # 1. Responsável do projeto
            if projeto and projeto.responsavel_id and projeto.responsavel_id != relatorio.autor_id:
                usuarios_a_notificar.add(projeto.responsavel_id)
            
            # 2. Funcionários do projeto
            if relatorio.projeto_id:
                funcionarios = FuncionarioProjeto.query.filter_by(
                    projeto_id=relatorio.projeto_id,
                    ativo=True
                ).all()
                
                for func in funcionarios:
                    if func.user_id and func.user_id != relatorio.autor_id:
                        usuarios_a_notificar.add(func.user_id)
            
            # Criar notificações
            numero_rel = relatorio.numero or "S/N"
            titulo_rel = relatorio.titulo or "Sem título"
            notificacoes_criadas = 0
            for user_id in usuarios_a_notificar:
                resultado = self.criar_notificacao(
                    user_id=user_id,
                    tipo='relatorio_criado',
                    titulo='Novo relatório criado',
                    mensagem=f'Um novo relatório nº {numero_rel} "{titulo_rel}" foi criado para a obra "{projeto_nome}".',
                    link_destino=f'/reports/{relatorio_id}'
                )
                
                if resultado['success']:
                    notificacoes_criadas += 1
            
            logger.info(f"✅ {notificacoes_criadas} notificações de relatório criado enviadas")
            return {'success': True, 'count': notificacoes_criadas}
            
        except Exception as e:
            logger.error(f"❌ Erro ao criar notificações de relatório criado: {e}")
            return {'success': False, 'error': str(e)}
    
    def criar_notificacao_relatorio_editado(self, relatorio_id, editor_id):
        """
        Cria notificação quando relatório é editado (se estiver aguardando aprovação)
        
        Args:
            relatorio_id: ID do relatório editado
            editor_id: ID do usuário que editou
        """
        try:
            from models import Relatorio, Projeto, AprovadorPadrao, User
            
            relatorio = Relatorio.query.get(relatorio_id)
            if not relatorio:
                logger.error(f"❌ Relatório {relatorio_id} não encontrado")
                return {'success': False, 'error': 'Relatório não encontrado'}
            
            # Só notificar se o relatório está aguardando aprovação
            if relatorio.status != 'Aguardando Aprovação':
                logger.debug(f"ℹ️ Relatório {relatorio_id} não está aguardando aprovação - notificação não criada")
                return {'success': True, 'message': 'Relatório não está aguardando aprovação'}
            
            # Buscar aprovador
            aprovador_id = None
            
            if relatorio.projeto_id:
                aprovador_projeto = AprovadorPadrao.query.filter_by(
                    projeto_id=relatorio.projeto_id,
                    ativo=True
                ).order_by(AprovadorPadrao.prioridade).first()
                
                if aprovador_projeto:
                    aprovador_id = aprovador_projeto.aprovador_id
            
            if not aprovador_id:
                aprovador_global = AprovadorPadrao.query.filter_by(
                    is_global=True,
                    ativo=True
                ).order_by(AprovadorPadrao.prioridade).first()
                
                if aprovador_global:
                    aprovador_id = aprovador_global.aprovador_id
            
            if not aprovador_id:
                logger.warning(f"⚠️ Nenhum aprovador encontrado para relatório {relatorio_id}")
                return {'success': False, 'error': 'Nenhum aprovador encontrado'}
            
            # Não notificar se o editor é o próprio aprovador
            if editor_id == aprovador_id:
                logger.debug(f"ℹ️ Editor é o aprovador - notificação não criada")
                return {'success': True, 'message': 'Editor é o aprovador'}
            
            projeto = Projeto.query.get(relatorio.projeto_id) if relatorio.projeto_id else None
            projeto_nome = projeto.nome if projeto else "Sem projeto"
            numero_rel = relatorio.numero or "S/N"
            titulo_rel = relatorio.titulo or "Sem título"
            
            editor = User.query.get(editor_id)
            editor_nome = editor.nome_completo if editor else "Um usuário"
            
            resultado = self.criar_notificacao(
                user_id=aprovador_id,
                tipo='relatorio_editado',
                titulo='Relatório pendente foi editado',
                mensagem=f'{editor_nome} editou o relatório nº {numero_rel} "{titulo_rel}" da obra "{projeto_nome}" que está aguardando sua aprovação.',
                link_destino=f'/reports/{relatorio_id}/review'
            )
            
            return resultado
            
        except Exception as e:
            logger.error(f"❌ Erro ao criar notificação de relatório editado: {e}")
            return {'success': False, 'error': str(e)}
    
    def limpar_notificacoes_expiradas(self):
        """
        Remove notificações que expiraram (mais de 24 horas)
        """
        try:
            from models import Notificacao
            
            agora = now_brt()
            
            # Buscar notificações expiradas
            notificacoes_expiradas = Notificacao.query.filter(
                Notificacao.expires_at < agora
            ).all()
            
            count = len(notificacoes_expiradas)
            
            if count > 0:
                for notificacao in notificacoes_expiradas:
                    db.session.delete(notificacao)
                
                db.session.commit()
                logger.info(f"🧹 {count} notificações expiradas removidas")
            else:
                logger.debug("ℹ️ Nenhuma notificação expirada encontrada")
            
            return {'success': True, 'removed_count': count}
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"❌ Erro ao limpar notificações expiradas: {e}")
            return {'success': False, 'error': str(e)}
    
    def criar_notificacao_express_pendente(self, relatorio_express_id):
        """
        Cria notificação para o aprovador quando Relatório Express é enviado para aprovação
        Busca aprovador global (Relatório Express não tem projeto vinculado)
        
        Args:
            relatorio_express_id: ID do relatório express pendente
        """
        try:
            from models import RelatorioExpress, AprovadorPadrao
            
            relatorio = RelatorioExpress.query.get(relatorio_express_id)
            if not relatorio:
                logger.error(f"❌ Relatório Express {relatorio_express_id} não encontrado")
                return {'success': False, 'error': 'Relatório Express não encontrado'}
            
            aprovador_id = None
            
            aprovador_global = AprovadorPadrao.query.filter_by(
                is_global=True,
                ativo=True
            ).order_by(AprovadorPadrao.prioridade).first()
            
            if aprovador_global:
                aprovador_id = aprovador_global.aprovador_id
                logger.info(f"✅ Aprovador global encontrado: user {aprovador_id}")
            
            if not aprovador_id:
                aprovador_padrao = AprovadorPadrao.query.filter_by(
                    projeto_id=None,
                    ativo=True
                ).order_by(AprovadorPadrao.prioridade).first()
                
                if aprovador_padrao:
                    aprovador_id = aprovador_padrao.aprovador_id
                    logger.info(f"✅ Aprovador padrão encontrado: user {aprovador_id}")
            
            if not aprovador_id and hasattr(relatorio, 'aprovador_id') and relatorio.aprovador_id:
                aprovador_id = relatorio.aprovador_id
                logger.info(f"✅ Usando aprovador_id do relatório: user {aprovador_id}")
            
            if not aprovador_id:
                logger.warning(f"⚠️ Nenhum aprovador encontrado para Relatório Express {relatorio_express_id}")
                return {'success': False, 'error': 'Nenhum aprovador configurado'}
            
            resultado = self.criar_notificacao(
                user_id=aprovador_id,
                tipo='relatorio_express_pendente',
                titulo='Novo Relatório Express aguardando aprovação',
                mensagem=f'O Relatório Express "{relatorio.numero}" da obra "{relatorio.obra_nome}" está aguardando sua aprovação.',
                link_destino=f'/relatorio-express/{relatorio_express_id}'
            )
            
            return resultado
            
        except Exception as e:
            logger.error(f"❌ Erro ao criar notificação de Relatório Express pendente: {e}")
            return {'success': False, 'error': str(e)}
    
    def criar_notificacao_express_aprovado(self, relatorio_express_id, aprovador_id):
        """
        Cria notificação para o autor quando Relatório Express é aprovado
        
        Args:
            relatorio_express_id: ID do relatório express aprovado
            aprovador_id: ID do aprovador que aprovou
        """
        try:
            from models import RelatorioExpress, User
            
            relatorio = RelatorioExpress.query.get(relatorio_express_id)
            if not relatorio:
                logger.error(f"❌ Relatório Express {relatorio_express_id} não encontrado")
                return {'success': False, 'error': 'Relatório Express não encontrado'}
            
            aprovador = User.query.get(aprovador_id)
            aprovador_nome = aprovador.nome_completo if aprovador else "Aprovador"
            
            resultado = self.criar_notificacao(
                user_id=relatorio.autor_id,
                tipo='relatorio_express_aprovado',
                titulo='Relatório Express aprovado',
                mensagem=f'Seu Relatório Express "{relatorio.numero}" da obra "{relatorio.obra_nome}" foi aprovado por {aprovador_nome}.',
                link_destino=f'/relatorio-express/{relatorio_express_id}'
            )
            
            return resultado
            
        except Exception as e:
            logger.error(f"❌ Erro ao criar notificação de Relatório Express aprovado: {e}")
            return {'success': False, 'error': str(e)}
    
    def criar_notificacao_express_reprovado(self, relatorio_express_id, motivo_rejeicao=None):
        """
        Cria notificação para o autor quando Relatório Express é rejeitado
        
        Args:
            relatorio_express_id: ID do relatório express rejeitado
            motivo_rejeicao: Motivo/comentário da rejeição (opcional)
        """
        try:
            from models import RelatorioExpress
            
            relatorio = RelatorioExpress.query.get(relatorio_express_id)
            if not relatorio:
                logger.error(f"❌ Relatório Express {relatorio_express_id} não encontrado")
                return {'success': False, 'error': 'Relatório Express não encontrado'}
            
            # Usar motivo passado ou buscar do relatório
            motivo = motivo_rejeicao or getattr(relatorio, 'comentario_aprovacao', None)
            
            if motivo:
                mensagem = f'O Relatório Express "{relatorio.numero}" da obra "{relatorio.obra_nome}" foi rejeitado. Motivo: {motivo}'
            else:
                mensagem = f'O Relatório Express "{relatorio.numero}" da obra "{relatorio.obra_nome}" foi rejeitado. Verifique as observações e corrija antes de reenviar.'
            
            resultado = self.criar_notificacao(
                user_id=relatorio.autor_id,
                tipo='relatorio_express_reprovado',
                titulo='Relatório Express rejeitado',
                mensagem=mensagem,
                link_destino=f'/relatorio-express/{relatorio_express_id}/editar'
            )
            
            return resultado
            
        except Exception as e:
            logger.error(f"❌ Erro ao criar notificação de Relatório Express rejeitado: {e}")
            return {'success': False, 'error': str(e)}
    
    def criar_notificacao_express_editado(self, relatorio_express_id, editor_id):
        """
        Cria notificação quando Relatório Express é editado (se estiver aguardando aprovação)
        
        Args:
            relatorio_express_id: ID do relatório express editado
            editor_id: ID do usuário que editou
        """
        try:
            from models import RelatorioExpress, AprovadorPadrao, User
            
            relatorio = RelatorioExpress.query.get(relatorio_express_id)
            if not relatorio:
                logger.error(f"❌ Relatório Express {relatorio_express_id} não encontrado")
                return {'success': False, 'error': 'Relatório Express não encontrado'}
            
            if relatorio.status != 'Aguardando Aprovação':
                logger.debug(f"ℹ️ Relatório Express {relatorio_express_id} não está aguardando aprovação")
                return {'success': True, 'message': 'Relatório não está aguardando aprovação'}
            
            aprovador_id = None
            
            aprovador_global = AprovadorPadrao.query.filter_by(
                is_global=True,
                ativo=True
            ).order_by(AprovadorPadrao.prioridade).first()
            
            if aprovador_global:
                aprovador_id = aprovador_global.aprovador_id
            
            if not aprovador_id:
                aprovador_padrao = AprovadorPadrao.query.filter_by(
                    projeto_id=None,
                    ativo=True
                ).order_by(AprovadorPadrao.prioridade).first()
                
                if aprovador_padrao:
                    aprovador_id = aprovador_padrao.aprovador_id
            
            if not aprovador_id and hasattr(relatorio, 'aprovador_id') and relatorio.aprovador_id:
                aprovador_id = relatorio.aprovador_id
            
            if not aprovador_id:
                logger.warning(f"⚠️ Nenhum aprovador encontrado para Relatório Express {relatorio_express_id}")
                return {'success': False, 'error': 'Nenhum aprovador encontrado'}
            
            if editor_id == aprovador_id:
                logger.debug(f"ℹ️ Editor é o aprovador - notificação não criada")
                return {'success': True, 'message': 'Editor é o aprovador'}
            
            editor = User.query.get(editor_id)
            editor_nome = editor.nome_completo if editor else "Um usuário"
            
            resultado = self.criar_notificacao(
                user_id=aprovador_id,
                tipo='relatorio_express_editado',
                titulo='Relatório Express pendente foi editado',
                mensagem=f'{editor_nome} editou o Relatório Express "{relatorio.numero}" da obra "{relatorio.obra_nome}" que está aguardando sua aprovação.',
                link_destino=f'/relatorio-express/{relatorio_express_id}'
            )
            
            return resultado
            
        except Exception as e:
            logger.error(f"❌ Erro ao criar notificação de Relatório Express editado: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_icone_tipo(self, tipo):
        icones = {
            'obra_criada': '🏗️',
            'relatorio_pendente': '📄',
            'relatorio_aprovado': '✅',
            'relatorio_reprovado': '❌',
            'relatorio_criado': '📝',
            'relatorio_editado': '✏️',
            'aprovado': '✅',
            'rejeitado': '⚠️',
            'enviado_para_aprovacao': '📤',
            'relatorio_express_pendente': '⚡',
            'relatorio_express_aprovado': '✅',
            'relatorio_express_reprovado': '❌',
            'relatorio_express_editado': '✏️'
        }
        return icones.get(tipo, '🔔')

notification_service = NotificationService()
