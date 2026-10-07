import { Platform, PermissionsAndroid, Vibration } from 'react-native';
import { saveLocalNotificacao } from '../database/db';

type NotificationType = 'sistema' | 'relatorio' | 'sincronizacao' | 'aprovacao' | 'lembrete';

class NotificationService {
  private hasPermission: boolean = false;
  private listeners: Array<() => void> = [];

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
              title: 'Permissão para Notificações - ELP',
              message: 'O aplicativo ELP necessita de permissão para alertá-lo sobre o salvamento de relatórios, vistorias agendadas e status da sincronização.',
              buttonPositive: 'Permitir',
              buttonNegative: 'Depois',
            }
          );
          this.hasPermission = granted === PermissionsAndroid.RESULTS.GRANTED;
          return this.hasPermission;
        } else {
          // Versões anteriores do Android concedem automaticamente no momento da instalação
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
   * Dispara uma notificação interna no aplicativo e vibração suave
   */
  async notify(opts: {
    titulo: string;
    mensagem: string;
    tipo?: NotificationType;
    userId?: number;
    silent?: boolean;
  }): Promise<void> {
    try {
      const { titulo, mensagem, tipo = 'sistema', userId = 1, silent = false } = opts;

      // 1. Salvar no banco SQLite local para alimentar o Drawer do Sino no Header
      await saveLocalNotificacao({
        user_id: userId,
        titulo,
        mensagem,
        tipo,
        lida: false,
        created_at: new Date().toISOString(),
      });

      // 2. Feedback tátil sutil se não for silencioso
      if (!silent) {
        try {
          Vibration.vibrate(100);
        } catch {}
      }

      // 3. Notificar listeners da interface (para atualizar o contador do sino em tempo real)
      this.listeners.forEach(cb => {
        try { cb(); } catch {}
      });
    } catch (err) {
      console.warn('[NotificationService] Erro ao registrar notificação:', err);
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
}

export const notificationService = new NotificationService();
