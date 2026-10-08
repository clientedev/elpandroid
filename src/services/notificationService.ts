import { Platform, PermissionsAndroid, Vibration, Linking } from 'react-native';
import { saveLocalNotificacao, getLocalNotificacoes } from '../database/db';
import { apiClient } from './api';

export type NotificationType = 'sistema' | 'relatorio' | 'sincronizacao' | 'aprovacao' | 'lembrete';

export interface ToastPayload {
  titulo: string;
  mensagem: string;
  tipo: NotificationType;
}

class NotificationService {
  private hasPermission: boolean = false;
  private listeners: Array<() => void> = [];
  private toastListeners: Array<(toast: ToastPayload) => void> = [];

  /**
   * Verifica se o aplicativo já tem permissão concedida no Android
   */
  async checkPermission(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const apiLevel = Platform.Version;
        if (typeof apiLevel === 'number' && apiLevel >= 33) {
          const granted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
          this.hasPermission = granted;
          return granted;
        }
        this.hasPermission = true;
        return true;
      } catch (err) {
        console.warn('[NotificationService] Falha ao verificar permissão:', err);
        return false;
      }
    }
    this.hasPermission = true;
    return true;
  }

  /**
   * Solicita a permissão do sistema operacional (Android 13+ / API 33+ requer POST_NOTIFICATIONS)
   */
  async requestPermission(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const apiLevel = Platform.Version;
        // Android 13+ (API 33+) exige permissão em tempo de execução
        if (typeof apiLevel === 'number' && apiLevel >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: 'Notificações do ELP / ObraFlow',
              message: 'Ative as notificações para receber alertas instantâneos de aprovação de relatórios técnicos, vistorias agendadas e status da sincronização.',
              buttonPositive: 'Permitir',
              buttonNegative: 'Depois',
            }
          );
          this.hasPermission = granted === PermissionsAndroid.RESULTS.GRANTED;
          return this.hasPermission;
        } else {
          this.hasPermission = true;
          return true;
        }
      } catch (err) {
        console.warn('[NotificationService] Falha ao solicitar permissão:', err);
        return false;
      }
    }
    this.hasPermission = true;
    return true;
  }

  /**
   * Abre as configurações do sistema do aparelho para o usuário ativar manualmente caso tenha bloqueado
   */
  async openSettings(): Promise<void> {
    try {
      await Linking.openSettings();
    } catch (err) {
      console.warn('[NotificationService] Não foi possível abrir configurações:', err);
    }
  }

  /**
   * Dispara uma notificação interna no aplicativo com vibração e alerta visual
   */
  async notify(opts: {
    titulo: string;
    mensagem: string;
    tipo?: NotificationType;
    userId?: number;
    silent?: boolean;
    showToast?: boolean;
  }): Promise<void> {
    try {
      const { 
        titulo, 
        mensagem, 
        tipo = 'sistema', 
        userId = 1, 
        silent = false,
        showToast = true 
      } = opts;

      // 1. Salvar no banco SQLite local para alimentar a lista de notificações
      await saveLocalNotificacao({
        user_id: userId,
        titulo,
        mensagem,
        tipo,
        lida: false,
        created_at: new Date().toISOString(),
      });

      // 2. Feedback tátil com vibração
      if (!silent) {
        try {
          Vibration.vibrate(150);
        } catch {}
      }

      // 3. Notificar listeners da interface (atualiza o contador do sino no Header)
      this.listeners.forEach(cb => {
        try { cb(); } catch {}
      });

      // 4. Se solicitado, despachar para listeners de Toast visual em tela cheia
      if (showToast) {
        this.toastListeners.forEach(cb => {
          try { cb({ titulo, mensagem, tipo }); } catch {}
        });
      }
    } catch (err) {
      console.warn('[NotificationService] Erro ao registrar notificação:', err);
    }
  }

  /**
   * Envia uma notificação de teste diretamente no celular para validação imediata do usuário
   */
  async sendTestNotification(): Promise<boolean> {
    const hasPerm = await this.checkPermission();
    await this.notify({
      titulo: '🔔 Notificação de Teste Ativa',
      mensagem: hasPerm 
        ? 'Perfeito! As notificações do ELP estão 100% configuradas e ativas no seu celular.'
        : 'Aviso: Notificações locais registradas, mas a permissão do Android ainda requer confirmação nas configurações.',
      tipo: 'sistema',
      showToast: true,
    });
    return hasPerm;
  }

  /**
   * Sincroniza notificações pendentes do servidor Railway para o banco SQLite local
   */
  async syncServerNotifications(userId?: number): Promise<number> {
    try {
      const res = await apiClient.axios.get('/api/notificacoes', { timeout: 8000 });
      if (!res.data || !Array.isArray(res.data.notificacoes)) {
        return 0;
      }

      const serverList = res.data.notificacoes;
      const localList = await getLocalNotificacoes(userId);
      const localTitles = new Set(localList.map(n => `${n.titulo}_${n.created_at}`));

      let newCount = 0;
      for (const item of serverList) {
        const key = `${item.titulo}_${item.created_at}`;
        if (!localTitles.has(key)) {
          await saveLocalNotificacao({
            user_id: userId || 1,
            titulo: item.titulo || 'Novo Aviso do Sistema',
            mensagem: item.mensagem || '',
            tipo: (item.tipo as NotificationType) || 'sistema',
            lida: Boolean(item.lida),
            link: item.link_destino || '',
            created_at: item.created_at || new Date().toISOString(),
          });
          newCount++;
        }
      }

      if (newCount > 0) {
        this.listeners.forEach(cb => {
          try { cb(); } catch {}
        });
      }

      return newCount;
    } catch (err: any) {
      // Falha silenciosa em caso de offline
      return 0;
    }
  }

  /**
   * Permite componentes assinarem para atualizar o sino em tempo real
   */
  subscribe(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Permite componentes assinarem avisos de Toast em tempo real na tela
   */
  subscribeToast(callback: (toast: ToastPayload) => void): () => void {
    this.toastListeners.push(callback);
    return () => {
      this.toastListeners = this.toastListeners.filter(cb => cb !== callback);
    };
  }
}

export const notificationService = new NotificationService();
