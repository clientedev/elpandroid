import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './api';

const SCREEN_CONFIG_CACHE_KEY = '@elp_server_screen_configs_v1';

export interface ScreenSectionConfig {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  custom_text?: string;
  button_text?: string;
  action?: string;
  allowed_roles?: 'all' | 'master_only' | 'approver_only' | 'surveyor_only';
  visible: boolean;
  order: number;
  items?: Array<{
    key: string;
    label: string;
    color?: string;
    icon?: string;
    action?: string;
    badge?: string;
    visible?: boolean;
  }>;
}

export interface ScreenConfig {
  title: string;
  description?: string;
  sections: ScreenSectionConfig[];
}

const DEFAULT_DASHBOARD_SECTIONS: ScreenSectionConfig[] = [
  {
    id: 'hero',
    type: 'hero',
    title: 'Logo & Boas-Vindas',
    subtitle: 'Identidade visual e saudação personalizada do engenheiro',
    visible: true,
    allowed_roles: 'all',
    custom_text: 'Olá, Engenheiro!',
    order: 1,
  },
  {
    id: 'badges',
    type: 'badges',
    title: 'Crachá de Identificação',
    subtitle: 'Nome do profissional e empresa cadastrada',
    visible: true,
    allowed_roles: 'all',
    order: 2,
  },
  {
    id: 'approverAlert',
    type: 'alert',
    title: 'Aviso de Aprovações Pendentes',
    subtitle: 'Notifica engenheiros com poder de carimbo sobre laudos aguardando revisão',
    visible: true,
    allowed_roles: 'approver_only',
    custom_text: 'Existem relatórios aguardando sua revisão e carimbo técnico.',
    order: 3,
  },
  {
    id: 'stats',
    type: 'stats',
    title: 'Painel de Indicadores e Métricas',
    subtitle: '4 cards com contadores em tempo real',
    visible: true,
    allowed_roles: 'all',
    order: 4,
    items: [
      { key: 'obras', label: 'OBRAS ATIVAS', color: '#10B981', action: 'ObrasTab', visible: true },
      { key: 'visitas', label: 'VISITAS AGENDADAS', color: '#2563EB', action: 'VisitasTab', visible: true },
      { key: 'rascunhos', label: 'EM PREENCHIMENTO', color: '#F59E0B', action: 'PendentesTab:em_andamento', visible: true },
      { key: 'aprovados', label: 'RELATÓRIOS APROVADOS', color: '#06B6D4', action: 'PendentesTab:Aprovado', visible: true },
    ],
  },
  {
    id: 'quickActions',
    type: 'quick_actions',
    title: 'Ações Rápidas no Canteiro',
    subtitle: 'Botões de acesso instantâneo para novo relatório, obra e visita',
    visible: true,
    allowed_roles: 'all',
    order: 5,
    items: [
      { key: 'novo_relatorio', label: 'Novo Relatório', icon: 'document-text', action: 'ReportCreate', visible: true },
      { key: 'nova_obra', label: 'Cadastrar Obra', icon: 'business', action: 'ProjectForm', visible: true },
      { key: 'agendar_visita', label: 'Agendar Visita', icon: 'calendar', action: 'VisitForm', visible: true },
    ],
  },
  {
    id: 'recentReports',
    type: 'recent_reports',
    title: 'Relatórios Recentes',
    subtitle: 'Últimos relatórios gerados pela equipe com atalho para ver todos',
    visible: true,
    allowed_roles: 'all',
    button_text: 'Ver todos',
    order: 6,
  },
  {
    id: 'upcomingVisits',
    type: 'upcoming_visits',
    title: 'Próximas Visitas Agendadas',
    subtitle: 'Agenda de vistorias técnicas programadas',
    visible: true,
    allowed_roles: 'all',
    order: 7,
  },
];

class ScreenConfigService {
  private memoryCache: Record<string, ScreenConfig> = {
    dashboard: {
      title: 'Painel Principal (Dashboard)',
      sections: DEFAULT_DASHBOARD_SECTIONS,
    },
  };

  /**
   * Inicializa o serviço carregando o cache do AsyncStorage
   */
  async init(): Promise<void> {
    try {
      const cached = await AsyncStorage.getItem(SCREEN_CONFIG_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        this.memoryCache = { ...this.memoryCache, ...parsed };
      }
    } catch (e) {
      console.warn('[ScreenConfig] Erro ao carregar cache local:', e);
    }
  }

  /**
   * Retorna a configuração de uma tela específica respeitando a ordem das seções
   */
  async getScreenConfig(screenKey: string): Promise<ScreenConfig> {
    if (!this.memoryCache[screenKey]) {
      await this.init();
    }
    const cfg = this.memoryCache[screenKey] || {
      title: screenKey,
      sections: DEFAULT_DASHBOARD_SECTIONS,
    };
    // Garantir ordenação numérica
    cfg.sections = [...cfg.sections].sort((a, b) => (a.order || 0) - (b.order || 0));
    return cfg;
  }

  /**
   * Sincroniza com a API do servidor (/api/apk/screen-configs)
   */
  async syncFromServer(): Promise<boolean> {
    try {
      const response = await apiClient.get('/api/apk/screen-configs');
      if (response.data && response.data.screens) {
        this.memoryCache = response.data.screens;
        await AsyncStorage.setItem(
          SCREEN_CONFIG_CACHE_KEY,
          JSON.stringify(response.data.screens)
        );
        return true;
      }
    } catch (e) {
      // Falha silenciosa offline
    }
    return false;
  }

  /**
   * Verifica se o usuário atual tem permissão para visualizar o bloco
   */
  isSectionAllowedForUser(section: ScreenSectionConfig, user: any): boolean {
    if (!section.visible) return false;
    const roleRule = section.allowed_roles || 'all';
    if (roleRule === 'all') return true;

    const isMaster = !!user?.is_master;
    const isApprover = !!user?.is_aprovador_express || isMaster || (user?.cargo && /aprovad|master|admin/i.test(user.cargo));

    if (roleRule === 'master_only') return isMaster;
    if (roleRule === 'approver_only') return isApprover;
    if (roleRule === 'surveyor_only') return !isMaster;

    return true;
  }
}

export const screenConfigService = new ScreenConfigService();
