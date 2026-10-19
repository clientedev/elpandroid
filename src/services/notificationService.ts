import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, PermissionsAndroid, Vibration, Linking } from 'react-native';
import { 
  saveLocalNotificacao, getLocalNotificacoes, deleteLocalNotificacao, 
  clearLocalNotificacoes, markAllNotificacoesAsRead, markNotificacaoAsRead 
} from '../database/db';
import { apiClient } from './api';

export type NotificationType = 'sistema' | 'relatorio' | 'sincronizacao' | 'aprovacao' | 'lembrete';

export interface ToastPayload {
  titulo: string;
  mensagem: string;
  tipo: NotificationType;
}

const DELETED_NOTIFS_STORAGE_KEY = '@elp_deleted_notif_keys_v1';
const CLEARED_TIMESTAMP_STORAGE_KEY = '@elp_cleared_notifs_timestamp_v1';

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
   * Apaga definitivamente uma notificação localmente e no servidor
   */
  async deleteNotification(id: number, keyIdentifier?: string): Promise<void> {
    try {
      await deleteLocalNotificacao(id);
      
      // Registrar no conjunto de notificações apagadas para não re-baixar do servidor
      try {
        const raw = await AsyncStorage.getItem(DELETED_NOTIFS_STORAGE_KEY);
        const set: string[] = raw ? JSON.parse(raw) : [];
        if (keyIdentifier) set.push(keyIdentifier);
        if (id) set.push(String(id));
        // Manter histórico dos últimos 500 apagados sem duplicatas
        const uniqueSet = Array.from(new Set(set)).slice(-500);
        await AsyncStorage.setItem(DELETED_NOTIFS_STORAGE_KEY, JSON.stringify(uniqueSet));
      } catch {}

      // Notificar o servidor
      try {
        await apiClient.axios.post(`/api/notificacoes/${id}/deletar`, { id, notificacao_id: id }, { timeout: 4000 });
      } catch {}

      this.listeners.forEach(cb => { try { cb(); } catch {} });
    } catch (e) {
      console.warn('[NotificationService] Erro ao apagar notificação:', e);
    }
  }

  /**
   * Apaga todas as notificações do usuário tanto local quanto no servidor
   */
  async clearAllNotifications(userId?: number): Promise<void> {
    try {
      await clearLocalNotificacoes(userId);
      await AsyncStorage.setItem(CLEARED_TIMESTAMP_STORAGE_KEY, Date.now().toString());

      try {
        await apiClient.axios.post('/api/notificacoes/limpar', { user_id: userId }, { timeout: 4000 });
      } catch {}

      this.listeners.forEach(cb => { try { cb(); } catch {} });
    } catch (e) {
      console.warn('[NotificationService] Erro ao limpar todas notificações:', e);
    }
  }

  /**
   * Marca todas as notificações como lidas local e no servidor
   */
  async markAllAsRead(userId?: number): Promise<void> {
    try {
      await markAllNotificacoesAsRead(userId);
      try {
        await apiClient.axios.post('/api/notificacoes/marcar-todas-lidas', {}, { timeout: 4000 });
      } catch {}

      this.listeners.forEach(cb => { try { cb(); } catch {} });
    } catch (e) {
      console.warn('[NotificationService] Erro ao marcar todas como lidas:', e);
    }
  }

  /**
   * Marca notificação individual como lida
   */
  async markAsRead(id: number): Promise<void> {
    try {
      await markNotificacaoAsRead(id);
      try {
        await apiClient.axios.post('/api/notificacoes/marcar-lida', { notificacao_id: id }, { timeout: 4000 });
      } catch {}

      this.listeners.forEach(cb => { try { cb(); } catch {} });
    } catch (e) {
      console.warn('[NotificationService] Erro ao marcar como lida:', e);
    }
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

      // Verificar timestamp de limpeza completa
      let clearedTimestamp = 0;
      try {
        const rawTime = await AsyncStorage.getItem(CLEARED_TIMESTAMP_STORAGE_KEY);
        if (rawTime) clearedTimestamp = parseInt(rawTime, 10);
      } catch {}

      // Carregar chaves de notificações deletadas individualmente
      let deletedKeys = new Set<string>();
      try {
        const rawKeys = await AsyncStorage.getItem(DELETED_NOTIFS_STORAGE_KEY);
        if (rawKeys) deletedKeys = new Set(JSON.parse(rawKeys));
      } catch {}

      let newCount = 0;
      for (const item of serverList) {
        const key = `${item.titulo}_${item.created_at}`;
        const itemCreatedTime = item.created_at ? new Date(item.created_at).getTime() : 0;

        // Se foi criada antes do momento que o usuário mandou limpar tudo, ou foi deletada individualmente, ignora!
        if (clearedTimestamp > 0 && itemCreatedTime <= clearedTimestamp) {
          continue;
        }
        if (deletedKeys.has(key) || (item.id && deletedKeys.has(String(item.id)))) {
          continue;
        }

        if (!localTitles.has(key)) {
          await saveLocalNotificacao({
            id: item.id || Date.now() + Math.floor(Math.random() * 1000),
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
