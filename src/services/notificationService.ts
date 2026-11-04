import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, PermissionsAndroid, Vibration, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
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

const DELETED_NOTIFS_STORAGE_KEY = '@elp_deleted_notif_keys_v2';
const CLEARED_TIMESTAMP_STORAGE_KEY = '@elp_cleared_notifs_timestamp_v2';
const NOTIFIED_NATIVE_STORAGE_KEY = '@elp_notified_native_keys_v3';

// Configura o comportamento padrão para notificações recebidas no aparelho
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

class NotificationService {
  private hasPermission: boolean = false;
  private listeners: Array<() => void> = [];
  private toastListeners: Array<(toast: ToastPayload) => void> = [];
  private channelConfigured: boolean = false;
  private isSyncingServer: boolean = false;
  private lastSyncServerTime: number = 0;
  private notifiedKeys: Set<string> = new Set<string>();

  constructor() {
    this.ensureChannel().catch(() => null);
    this.loadNotifiedKeys().catch(() => null);
  }

  private async loadNotifiedKeys(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(NOTIFIED_NATIVE_STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          this.notifiedKeys = new Set(arr);
        }
      }
    } catch {}
  }

  private async saveNotifiedKeys(): Promise<void> {
    try {
      const arr = Array.from(this.notifiedKeys).slice(-300);
      await AsyncStorage.setItem(NOTIFIED_NATIVE_STORAGE_KEY, JSON.stringify(arr));
    } catch {}
  }

  /**
   * Garante o canal de notificações no Android com alta prioridade e som
   */
  async ensureChannel(): Promise<void> {
    if (Platform.OS === 'android' && !this.channelConfigured) {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Avisos e Relatórios ELP',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2563EB',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });
        this.channelConfigured = true;
      } catch (e) {
        console.warn('[NotificationService] Aviso ao configurar canal Android:', e);
      }
    }
  }

  /**
   * Verifica se o aplicativo já tem permissão concedida no dispositivo
   */
  async checkPermission(): Promise<boolean> {
    try {
      const settings = await Notifications.getPermissionsAsync();
      const granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;
      this.hasPermission = granted;
      return granted;
    } catch {
      if (Platform.OS === 'android') {
        try {
          const apiLevel = Platform.Version;
          if (typeof apiLevel === 'number' && apiLevel >= 33) {
            const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
            this.hasPermission = granted;
            return granted;
          }
        } catch {}
      }
      this.hasPermission = true;
      return true;
    }
  }

  /**
   * Solicita a permissão do sistema operacional para emitir notificações nativas
   */
  async requestPermission(): Promise<boolean> {
    await this.ensureChannel().catch(() => null);
    try {
      const res = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
        android: {},
      });
      const granted = res.granted || res.status === 'granted';
      this.hasPermission = granted;
      return granted;
    } catch (err) {
      if (Platform.OS === 'android') {
        try {
          const apiLevel = Platform.Version;
          if (typeof apiLevel === 'number' && apiLevel >= 33) {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
              {
                title: 'Notificações do ELP',
                message: 'Ative as notificações para receber alertas instantâneos de aprovação de relatórios e visitas.',
                buttonPositive: 'Permitir',
                buttonNegative: 'Depois',
              }
            );
            this.hasPermission = granted === PermissionsAndroid.RESULTS.GRANTED;
            return this.hasPermission;
          }
        } catch {}
      }
      this.hasPermission = true;
      return true;
    }
  }

  /**
   * Abre as configurações do sistema do aparelho
   */
  async openSettings(): Promise<void> {
    try {
      await Linking.openSettings();
    } catch (err) {
      console.warn('[NotificationService] Não foi possível abrir configurações:', err);
    }
  }

  /**
   * Dispara uma notificação nativa no dispositivo e salva no histórico local
   */
  async notify(opts: {
    titulo: string;
    mensagem: string;
    tipo?: NotificationType;
    userId?: number;
    silent?: boolean;
    showToast?: boolean;
    link?: string;
  }): Promise<void> {
    try {
      const { 
        titulo, 
        mensagem, 
        tipo = 'sistema', 
        userId = 1, 
        silent = false,
        showToast = false,
        link = ''
      } = opts;

      // Notificações de sincronização são silenciosas e NÃO poluem a central do usuário
      if (tipo === 'sincronizacao') {
        return;
      }

      // 1. Salvar no banco SQLite local
      await saveLocalNotificacao({
        user_id: userId,
        titulo,
        mensagem,
        tipo,
        link,
        lida: false,
        created_at: new Date().toISOString(),
      });

      // 2. Disparar notificação NATIVA no sistema operacional Android / iOS (Barra de status)
      await this.ensureChannel().catch(() => null);
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: titulo,
            body: mensagem,
            data: { tipo, link },
            sound: !silent,
            vibrate: !silent ? [0, 250, 250, 250] : undefined,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: null, // Imediato
        });
      } catch (notifErr) {
        console.warn('[NotificationService] Falha ao despachar notificação nativa:', notifErr);
        if (!silent) {
          try { Vibration.vibrate(150); } catch {}
        }
      }

      // 3. Notificar listeners da interface (atualiza o contador do sino no Header)
      this.listeners.forEach(cb => {
        try { cb(); } catch {}
      });

      // 4. Se solicitado (apenas para avisos cruciais, nunca para sync)
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
    await this.requestPermission();
    await this.notify({
      titulo: '🔔 Notificação de Teste ELP',
      mensagem: 'As notificações nativas do ELP estão 100% configuradas e ativas no seu celular!',
      tipo: 'sistema',
      showToast: false,
    });
    return true;
  }

  /**
   * Apaga definitivamente uma notificação localmente e na nuvem
   */
  async deleteNotification(id: number, keyIdentifier?: string): Promise<void> {
    try {
      // 1. Deletar do SQLite local
      await deleteLocalNotificacao(id);
      
      // 2. Gravar chave / id em AsyncStorage para nunca mais reimportar do servidor
      try {
        const raw = await AsyncStorage.getItem(DELETED_NOTIFS_STORAGE_KEY);
        const set: string[] = raw ? JSON.parse(raw) : [];
        if (keyIdentifier) set.push(keyIdentifier);
        if (id) set.push(String(id));
        const uniqueSet = Array.from(new Set(set)).slice(-500);
        await AsyncStorage.setItem(DELETED_NOTIFS_STORAGE_KEY, JSON.stringify(uniqueSet));
      } catch {}

      // 3. Deletar no servidor Railway
      if (id > 0) {
        apiClient.axios.delete(`/api/notificacoes/${id}`, { timeout: 4000 }).catch(() => null);
        apiClient.axios.post(`/api/notificacoes/${id}/deletar`, { id, notificacao_id: id }, { timeout: 4000 }).catch(() => null);
      }

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
        await apiClient.axios.delete('/api/notificacoes/limpar', { timeout: 4000 });
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
   * Dispara apenas uma única vez a notificação nativa quando um relatório é submetido para aprovação
   */
  async notifyOnceForReportApproval(opts: {
    reportId: number;
    reportNumber?: string;
    projetoNome?: string;
    userId?: number;
  }): Promise<boolean> {
    const key = `approval_${opts.reportNumber || opts.reportId}`;
    if (this.notifiedKeys.has(key)) {
      return false;
    }
    this.notifiedKeys.add(key);
    this.saveNotifiedKeys().catch(() => null);

    const num = opts.reportNumber || 'Relatório';
    const obra = opts.projetoNome || 'Obra';

    await this.notify({
      titulo: '📋 Relatório Enviado para Aprovação',
      mensagem: `O relatório ${num} da obra "${obra}" foi submetido para aprovação técnica com sucesso.`,
      tipo: 'relatorio',
      userId: opts.userId || 1,
      silent: false,
      showToast: false,
      link: `/reports/${opts.reportId}`,
    });
    return true;
  }

  /**
   * Sincroniza notificações pendentes do servidor Railway para o banco SQLite local
   * Atualiza a central de forma segura e sem criar tempestades de notificações nativas
   */
  async syncServerNotifications(userId?: number): Promise<number> {
    if (this.isSyncingServer) {
      return 0;
    }
    const now = Date.now();
    if (now - this.lastSyncServerTime < 15000) {
      return 0;
    }
    this.isSyncingServer = true;
    this.lastSyncServerTime = now;

    try {
      const res = await apiClient.axios.get('/api/notificacoes', { timeout: 8000 });
      if (!res.data || !Array.isArray(res.data.notificacoes)) {
        return 0;
      }

      const serverList = res.data.notificacoes;
      const localList = await getLocalNotificacoes(userId);
      const localIds = new Set(localList.map(n => n.id));
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
        // Ignora sincronizações e itens deletados
        if (item.tipo === 'sincronizacao') continue;

        const key = `${item.titulo}_${item.created_at}`;
        const itemCreatedTime = item.created_at ? new Date(item.created_at).getTime() : 0;

        if (clearedTimestamp > 0 && itemCreatedTime <= clearedTimestamp) {
          continue;
        }
        if (deletedKeys.has(key) || (item.id && deletedKeys.has(String(item.id)))) {
          continue;
        }

        if (!localIds.has(item.id) && !localTitles.has(key)) {
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
    } catch {
      return 0;
    } finally {
      this.isSyncingServer = false;
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
