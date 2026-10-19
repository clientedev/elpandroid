"""
Serviço de Gestão de Políticas e Regras de Notificações
Define dinamicamente o que vai ou não notificar, por quais canais (Push / Sistema) e a quem.
"""

import os
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

POLICIES_STORAGE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'notification_policies.json')

DEFAULT_POLICIES = {
    'relatorio_pendente': {
        'id': 'relatorio_pendente',
        'nome': 'Relatórios Pendentes de Aprovação',
        'descricao': 'Disparado quando um laudo técnico (Comum ou Express) é concluído e aguarda carimbo técnico.',
        'icone': 'fas fa-clipboard-check',
        'cor': '#2563eb',
        'ativo': True,
        'canais': {
            'sistema': True,
            'push': True
        },
        'destinatarios': {
            'aprovador_obra': True,
            'aprovador_global': True,
            'responsavel_obra': True,
            'administradores': True
        }
    },
    'relatorio_aprovado': {
        'id': 'relatorio_aprovado',
        'nome': 'Relatório Aprovado & Carimbado',
        'descricao': 'Disparado quando o laudo técnico recebe parecer de aprovação formal.',
        'icone': 'fas fa-check-double',
        'cor': '#10b981',
        'ativo': True,
        'canais': {
            'sistema': True,
            'push': True
        },
        'destinatarios': {
            'autor': True,
            'responsavel_obra': True,
            'administradores': False
        }
    },
    'relatorio_reprovado': {
        'id': 'relatorio_reprovado',
        'nome': 'Relatório Reprovado / Ajustes Exigidos',
        'descricao': 'Disparado quando o aprovador devolve o laudo solicitando correções ou re-vistoria.',
        'icone': 'fas fa-exclamation-triangle',
        'cor': '#ef4444',
        'ativo': True,
        'canais': {
            'sistema': True,
            'push': True
        },
        'destinatarios': {
            'autor': True,
            'responsavel_obra': True,
            'administradores': True
        }
    },
    'relatorio_editado': {
        'id': 'relatorio_editado',
        'nome': 'Relatório Editado / Retificado',
        'descricao': 'Disparado quando um laudo já submetido recebe alterações pelo vistoriador.',
        'icone': 'fas fa-edit',
        'cor': '#f59e0b',
        'ativo': True,
        'canais': {
            'sistema': True,
            'push': False
        },
        'destinatarios': {
            'aprovadores': True,
            'autor': False,
            'administradores': True
        }
    },
    'obra_criada': {
        'id': 'obra_criada',
        'nome': 'Nova Obra / Canteiro Cadastrado',
        'descricao': 'Disparado no cadastro de novos empreendimentos para vistoria no aplicativo.',
        'icone': 'fas fa-building',
        'cor': '#6366f1',
        'ativo': True,
        'canais': {
            'sistema': True,
            'push': True
        },
        'destinatarios': {
            'responsavel_obra': True,
            'equipe_engenharia': True,
            'administradores': True
        }
    },
    'visita_pendente': {
        'id': 'visita_pendente',
        'nome': 'Alerta de Visita Pendente / Atrasada',
        'descricao': 'Disparado automaticamente pelo agendador às 17h para vistorias agendadas não realizadas.',
        'icone': 'fas fa-calendar-times',
        'cor': '#dc2626',
        'ativo': True,
        'canais': {
            'sistema': True,
            'push': True
        },
        'destinatarios': {
            'responsavel_visita': True,
            'responsavel_obra': True,
            'administradores': False
        }
    },
    'sistema': {
        'id': 'sistema',
        'nome': 'Comunicados Gerais e Alertas do Sistema',
        'descricao': 'Avisos de atualização do instalador APK, manutenções programadas e comunicados técnicos.',
        'icone': 'fas fa-bullhorn',
        'cor': '#06b6d4',
        'ativo': True,
        'canais': {
            'sistema': True,
            'push': True
        },
        'destinatarios': {
            'todos_usuarios': True,
            'administradores': True
        }
    }
}


class NotificationPolicyService:
    def __init__(self):
        self._cached_policies = None
        self._last_loaded = 0

    def get_policies(self, force_reload=False):
        """Retorna as configurações atuais de políticas de notificação"""
        if self._cached_policies and not force_reload:
            return self._cached_policies

        policies = dict(DEFAULT_POLICIES)

        # 1. Tentar ler do banco de dados (ApkScreenConfig com screen_key='notification_policies')
        try:
            from models import ApkScreenConfig
            record = ApkScreenConfig.query.filter_by(screen_key='notification_policies').first()
            if record and record.config_json:
                db_data = json.loads(record.config_json)
                if isinstance(db_data, dict):
                    for k, v in db_data.items():
                        if k in policies and isinstance(v, dict):
                            policies[k].update(v)
                        else:
                            policies[k] = v
                self._cached_policies = policies
                return policies
        except Exception as e:
            logger.debug(f"Aviso ao consultar notification_policies no DB: {e}")

        # 2. Fallback para arquivo JSON local
        if os.path.exists(POLICIES_STORAGE_FILE):
            try:
                with open(POLICIES_STORAGE_FILE, 'r', encoding='utf-8') as f:
                    file_data = json.load(f)
                    if isinstance(file_data, dict):
                        for k, v in file_data.items():
                            if k in policies and isinstance(v, dict):
                                policies[k].update(v)
                            else:
                                policies[k] = v
            except Exception as fe:
                logger.warning(f"Aviso ao carregar policies do arquivo: {fe}")

        self._cached_policies = policies
        return policies

    def save_policies(self, new_policies, user_id=None):
        """Salva as políticas no banco de dados e no arquivo local com persistência total"""
        try:
            # Validar e merge com defaults
            current = self.get_policies(force_reload=True)
            for event_key, data in new_policies.items():
                if event_key in current:
                    if isinstance(data, dict):
                        current[event_key].update(data)
                    else:
                        current[event_key] = data
                else:
                    current[event_key] = data

            # 1. Salvar no Banco de Dados
            try:
                from app import db
                from models import ApkScreenConfig, brazil_now
                record = ApkScreenConfig.query.filter_by(screen_key='notification_policies').first()
                if not record:
                    record = ApkScreenConfig(
                        screen_key='notification_policies',
                        title='Políticas de Notificação',
                        config_json=json.dumps(current, ensure_ascii=False, indent=2),
                        updated_by_id=user_id
                    )
                    db.session.add(record)
                else:
                    record.config_json = json.dumps(current, ensure_ascii=False, indent=2)
                    record.updated_at = brazil_now()
                    record.updated_by_id = user_id
                db.session.commit()
                logger.info("✅ Políticas de notificação salvas no banco de dados com sucesso.")
            except Exception as dbe:
                logger.warning(f"Aviso ao salvar no DB, persistindo em arquivo: {dbe}")

            # 2. Salvar no arquivo JSON local
            try:
                with open(POLICIES_STORAGE_FILE, 'w', encoding='utf-8') as f:
                    json.dump(current, f, ensure_ascii=False, indent=2)
            except Exception as fe:
                logger.warning(f"Aviso ao salvar arquivo JSON: {fe}")

            self._cached_policies = current
            return {'success': True, 'policies': current}

        except Exception as e:
            logger.error(f"❌ Erro ao salvar políticas de notificação: {e}")
            return {'success': False, 'error': str(e)}

    def should_notify(self, event_type, channel='sistema', recipient_role=None):
        """
        Verifica se um determinado evento deve disparar notificação.
        
        Args:
            event_type: tipo do evento (ex: 'relatorio_pendente', 'obra_criada')
            channel: 'sistema' (sino) ou 'push' (OneSignal)
            recipient_role: papel do destinatário (ex: 'autor', 'aprovador', 'master')
        """
        policies = self.get_policies()
        
        # Mapeamento de sinônimos
        key = event_type
        if 'express' in key and 'pendente' in key:
            key = 'relatorio_pendente'
        elif 'express' in key and 'aprovado' in key:
            key = 'relatorio_aprovado'
        elif 'express' in key and 'reprovado' in key:
            key = 'relatorio_reprovado'
        elif 'express' in key and 'editado' in key:
            key = 'relatorio_editado'
        elif 'visita' in key:
            key = 'visita_pendente'

        policy = policies.get(key)
        if not policy:
            return True

        # Verifica se o evento está globalmente ativo
        if not policy.get('ativo', True):
            return False

        # Verifica o canal
        canais = policy.get('canais', {})
        if channel and not canais.get(channel, True):
            return False

        # Verifica papel do destinatário se fornecido
        if recipient_role:
            destinatarios = policy.get('destinatarios', {})
            # Se a role estiver definida nas opções e estiver False, bloqueia
            if recipient_role in destinatarios and not destinatarios[recipient_role]:
                return False

        return True


# Instância Singleton
notification_policy_service = NotificationPolicyService()
