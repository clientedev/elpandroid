import json
from datetime import datetime
from app import db
from models import ApkScreenConfig, brazil_now

DEFAULT_CONFIGS = {
    'dashboard': {
        'title': 'Painel Principal (Dashboard)',
        'description': 'Estrutura, textos, métricas e orquestração do painel inicial do APK.',
        'sections': [
            {
                'id': 'hero',
                'type': 'hero',
                'title': 'Logo & Boas-Vindas',
                'subtitle': 'Identidade visual e saudação personalizada do engenheiro',
                'visible': True,
                'allowed_roles': 'all',  # all, master_only, approver_only, surveyor_only
                'custom_text': 'Olá, Engenheiro!',
                'order': 1
            },
            {
                'id': 'badges',
                'type': 'badges',
                'title': 'Crachá de Identificação',
                'subtitle': 'Nome do profissional e empresa cadastrada',
                'visible': True,
                'allowed_roles': 'all',
                'order': 2
            },
            {
                'id': 'approverAlert',
                'type': 'alert',
                'title': 'Aviso de Aprovações Pendentes',
                'subtitle': 'Notifica engenheiros com poder de carimbo sobre laudos aguardando revisão',
                'visible': True,
                'allowed_roles': 'approver_only',
                'custom_text': 'Existem relatórios aguardando sua revisão e carimbo técnico.',
                'order': 3
            },
            {
                'id': 'stats',
                'type': 'stats',
                'title': 'Painel de Indicadores e Métricas',
                'subtitle': '4 cards com contadores em tempo real',
                'visible': True,
                'allowed_roles': 'all',
                'order': 4,
                'items': [
                    {'key': 'obras', 'label': 'OBRAS ATIVAS', 'color': '#10B981', 'action': 'ObrasTab', 'visible': True},
                    {'key': 'visitas', 'label': 'VISITAS AGENDADAS', 'color': '#2563EB', 'action': 'VisitasTab', 'visible': True},
                    {'key': 'rascunhos', 'label': 'EM PREENCHIMENTO', 'color': '#F59E0B', 'action': 'PendentesTab:em_andamento', 'visible': True},
                    {'key': 'aprovados', 'label': 'RELATÓRIOS APROVADOS', 'color': '#06B6D4', 'action': 'PendentesTab:Aprovado', 'visible': True}
                ]
            },
            {
                'id': 'quickActions',
                'type': 'quick_actions',
                'title': 'Ações Rápidas no Canteiro',
                'subtitle': 'Botões de acesso instantâneo para novo relatório, obra e visita',
                'visible': True,
                'allowed_roles': 'all',
                'order': 5,
                'items': [
                    {'key': 'novo_relatorio', 'label': 'Novo Relatório', 'icon': 'document-text', 'action': 'ReportCreate', 'visible': True},
                    {'key': 'nova_obra', 'label': 'Cadastrar Obra', 'icon': 'business', 'action': 'ProjectForm', 'visible': True},
                    {'key': 'agendar_visita', 'label': 'Agendar Visita', 'icon': 'calendar', 'action': 'VisitForm', 'visible': True}
                ]
            },
            {
                'id': 'recentReports',
                'type': 'recent_reports',
                'title': 'Relatórios Recentes',
                'subtitle': 'Últimos relatórios gerados pela equipe com atalho para ver todos',
                'visible': True,
                'allowed_roles': 'all',
                'button_text': 'Ver todos',
                'order': 6
            },
            {
                'id': 'upcomingVisits',
                'type': 'upcoming_visits',
                'title': 'Próximas Visitas Agendadas',
                'subtitle': 'Agenda de vistorias técnicas programadas',
                'visible': True,
                'allowed_roles': 'all',
                'order': 7
            }
        ]
    },
    'reports': {
        'title': 'Aba de Relatórios',
        'description': 'Filtros dinâmicos, cards de status e visualização exclusiva de laudos.',
        'sections': [
            {
                'id': 'filter_cards',
                'type': 'filter_cards',
                'title': 'Cards de Seleção Rápida (Páginas Exclusivas)',
                'subtitle': 'Permite ao engenheiro isolar relatórios por status',
                'visible': True,
                'allowed_roles': 'all',
                'order': 1,
                'items': [
                    {'key': 'Aguardando Aprovação', 'label': 'Pra Aprovação', 'badge': 'Requer Revisão', 'color': '#D97706', 'visible': True},
                    {'key': 'Aprovado', 'label': 'Aprovados', 'badge': 'Finalizados', 'color': '#059669', 'visible': True},
                    {'key': 'em_andamento', 'label': 'Em Preenchimento', 'badge': 'Rascunhos', 'color': '#2563EB', 'visible': True},
                    {'key': 'Todos', 'label': 'Todos os Relatórios', 'badge': 'Geral', 'color': '#475569', 'visible': True}
                ]
            },
            {
                'id': 'exclusive_banner',
                'type': 'exclusive_banner',
                'title': 'Banner de Página Exclusiva',
                'subtitle': 'Exibido no topo quando um filtro exclusivo está ativado',
                'visible': True,
                'allowed_roles': 'all',
                'custom_text': 'PÁGINA EXCLUSIVA',
                'button_text': 'Ver Todos',
                'order': 2
            }
        ]
    },
    'projects': {
        'title': 'Aba de Obras',
        'description': 'Estrutura da listagem de empreendimentos e canteiros.',
        'sections': [
            {
                'id': 'projects_header',
                'type': 'header',
                'title': 'Gestão de Obras',
                'subtitle': 'Empreendimentos cadastrados para vistoria',
                'visible': True,
                'allowed_roles': 'all',
                'order': 1
            },
            {
                'id': 'projects_search',
                'type': 'search',
                'title': 'Busca de Obras',
                'custom_text': 'Buscar por nome, código ou endereço...',
                'visible': True,
                'allowed_roles': 'all',
                'order': 2
            }
        ]
    },
    'visits': {
        'title': 'Aba de Visitas & Agenda',
        'description': 'Lógica de automação de vistorias, regras de negócio e layout da agenda no APK.',
        'auto_baixa_relatorio_mesmo_dia': True,
        'notificar_responsavel_agendamento': True,
        'notificar_participantes_agendamento': True,
        'notificar_reagendamento': True,
        'lembrete_horas_antecedencia': 24,
        'permitir_visitas_sem_obra': True,
        'permitir_compromisso_pessoal': True,
        'exigir_geolocalizacao_gps': False,
        'visualizacao_padrao_agenda': 'minhas',
        'sections': [
            {
                'id': 'visits_header',
                'type': 'header',
                'title': 'Agenda de Visitas',
                'subtitle': 'Cronograma de visitas técnicas em campo',
                'visible': True,
                'allowed_roles': 'all',
                'order': 1
            },
            {
                'id': 'visits_scope_selector',
                'type': 'scope_selector',
                'title': 'Seletor Individual: Minhas Visitas / Toda a Equipe',
                'subtitle': 'Alternador de escopo entre compromissos pessoais e da equipe',
                'visible': True,
                'allowed_roles': 'all',
                'order': 2
            },
            {
                'id': 'visits_search',
                'type': 'search',
                'title': 'Barra de Pesquisa',
                'custom_text': 'Buscar por obra, endereço, responsável...',
                'visible': True,
                'allowed_roles': 'all',
                'order': 3
            },
            {
                'id': 'visits_filters',
                'type': 'filter_chips',
                'title': 'Filtros Rápidos de Status',
                'subtitle': 'Abas para Todas, Agendada, Realizada e Cancelada',
                'visible': True,
                'allowed_roles': 'all',
                'order': 4
            },
            {
                'id': 'visits_calendar_shortcut',
                'type': 'custom_quick_action',
                'title': 'Atalho: Ver Grade no Google Calendar',
                'subtitle': 'Abrir agenda completa na web com visão mensal/semanal',
                'action': 'CalendarWeb',
                'visible': True,
                'allowed_roles': 'all',
                'order': 5
            }
        ]
    },
    'pdf_config': {
        'title': 'Formatação dos Laudos (PDF)',
        'description': 'Identidade visual, regras de diagramação fotográfica e dados institucionais dos laudos técnicos gerados.',
        'empresa_nome': 'ELP Consultoria',
        'empresa_endereco': 'Rua Jaboticabal, 530 apto. 31 - São Paulo - SP - CEP: 03188-000',
        'empresa_telefones': '(11) 98111-5800 / 99201-9258',
        'empresa_email': 'elp@elpconsultoria.com.br',
        'empresa_site': 'www.elpconsultoria.com.br',
        'cor_destaque': '#2563EB',
        'fotos_primeira_pagina': 2,
        'fotos_por_pagina': 4,
        'exibir_logo_cabecalho': True,
        'exibir_logo_rodape': True,
        'exibir_legendas_fotos': True,
        'exibir_carimbo_data': True,
        'exibir_dados_gerais': True,
        'exibir_itens_observados': True,
        'exibir_assinaturas': True,
        'texto_conclusao_padrao': 'Laudo técnico de vistoria emitido em conformidade com as diretrizes e normas técnicas aplicáveis.',
        'sections': []
    }
}

def ensure_tables():
    """Garante que a tabela apk_screen_configs exista no banco de dados"""
    try:
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        if not inspector.has_table('apk_screen_configs'):
            ApkScreenConfig.__table__.create(db.engine, checkfirst=True)
            print("[ApkScreenConfig] Tabela apk_screen_configs criada com sucesso.")
    except Exception as e:
        print(f"[ApkScreenConfig] Aviso ao verificar/criar tabela: {e}")

def get_screen_config(screen_key: str) -> dict:
    """Retorna configuração de tela personalizada ou o padrão de fábrica"""
    ensure_tables()
    default_config = DEFAULT_CONFIGS.get(screen_key, {'title': screen_key, 'sections': []})
    try:
        cfg = ApkScreenConfig.query.filter_by(screen_key=screen_key).first()
        if cfg and cfg.config_json:
            parsed = json.loads(cfg.config_json)
            # Garantir campos base
            merged = {**default_config, **parsed}
            return merged
    except Exception as e:
        print(f"[ApkScreenConfig] Erro ao carregar config de {screen_key}: {e}")
    return default_config

def get_all_screen_configs() -> dict:
    """Retorna todas as telas formatadas para o APK e para o editor"""
    ensure_tables()
    result = {}
    for key in DEFAULT_CONFIGS.keys():
        result[key] = get_screen_config(key)
    return result

def save_screen_config(screen_key: str, config_data: dict, user_id=None) -> bool:
    """Salva a nova configuração da tela customizada pelo Master"""
    ensure_tables()
    try:
        cfg = ApkScreenConfig.query.filter_by(screen_key=screen_key).first()
        if not cfg:
            cfg = ApkScreenConfig(
                screen_key=screen_key,
                title=config_data.get('title', DEFAULT_CONFIGS.get(screen_key, {}).get('title', screen_key))
            )
            db.session.add(cfg)
        
        cfg.config_json = json.dumps(config_data, ensure_ascii=False)
        cfg.updated_at = brazil_now()
        if user_id:
            cfg.updated_by_id = user_id
            
        db.session.commit()
        return True
    except Exception as e:
        db.session.rollback()
        print(f"[ApkScreenConfig] Erro ao salvar config de {screen_key}: {e}")
        return False

def reset_screen_config(screen_key: str) -> bool:
    """Restaura a configuração de uma tela para o padrão original"""
    ensure_tables()
    try:
        cfg = ApkScreenConfig.query.filter_by(screen_key=screen_key).first()
        if cfg:
            db.session.delete(cfg)
            db.session.commit()
        return True
    except Exception as e:
        db.session.rollback()
        print(f"[ApkScreenConfig] Erro ao resetar config de {screen_key}: {e}")
        return False
