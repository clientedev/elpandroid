import NetInfo from '@react-native-community/netinfo';
import { apiClient } from './api';
import { 
  getPendingSyncQueue, updateSyncQueueItem, clearCompletedSyncQueue,
  saveLocalProjeto, saveLocalVisita, saveLocalRelatorio, 
  saveLocalRelatorioExpress, saveLocalLembrete, saveLocalContato, 
  saveLocalReembolso, getDatabase
} from '../database/db';
import { Projeto, Visita, Relatorio, RelatorioExpress, Lembrete, Contato, Reembolso } from '../types';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

class SyncService {
  private isSyncing: boolean = false;
  private listeners: ((state: SyncState, pendingCount: number) => void)[] = [];

  subscribe(listener: (state: SyncState, pendingCount: number) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(state: SyncState, count: number) {
    this.listeners.forEach(l => l(state, count));
  }

  async isOnline(): Promise<boolean> {
    const net = await NetInfo.fetch();
    return Boolean(net.isConnected && net.isInternetReachable !== false);
  }

  async getPendingCount(): Promise<number> {
    try {
      const queue = await getPendingSyncQueue();
      return queue.length;
    } catch {
      return 0;
    }
  }

  async syncAll(): Promise<{ success: boolean; message: string }> {
    if (this.isSyncing) {
      return { success: false, message: 'Sincronização já em andamento' };
    }

    const online = await this.isOnline();
    if (!online) {
      const pending = await this.getPendingCount();
      this.notify('offline', pending);
      return { success: false, message: 'Dispositivo offline. Os dados estão salvos localmente.' };
    }

    this.isSyncing = true;
    let pendingCount = await this.getPendingCount();
    this.notify('syncing', pendingCount);

    try {
      // 1. Process Outbound Sync Queue (Device -> Server)
      const queue = await getPendingSyncQueue();
      for (const item of queue) {
        try {
          await updateSyncQueueItem(item.id, 'processing');
          const payload = JSON.parse(item.payload);

          if (item.method === 'POST') {
            await apiClient.axios.post(item.endpoint, payload);
          } else if (item.method === 'PUT') {
            await apiClient.axios.put(item.endpoint, payload);
          } else if (item.method === 'DELETE') {
            await apiClient.axios.delete(item.endpoint);
          }

          await updateSyncQueueItem(item.id, 'completed');

          // Update local entity sync_status
          const db = await getDatabase();
          if (item.entity_type === 'projeto') {
            await db.runAsync('UPDATE projetos SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
          } else if (item.entity_type === 'visita') {
            await db.runAsync('UPDATE visitas SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
          } else if (item.entity_type === 'relatorio') {
            await db.runAsync('UPDATE relatorios SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
          } else if (item.entity_type === 'relatorio_express') {
            await db.runAsync('UPDATE relatorios_express SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
          } else if (item.entity_type === 'lembrete') {
            await db.runAsync('UPDATE lembretes SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
          } else if (item.entity_type === 'reembolso') {
            await db.runAsync('UPDATE reembolsos SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
          }
        } catch (itemErr: any) {
          console.warn(`Sync queue item ${item.id} failed:`, itemErr.message);
          await updateSyncQueueItem(item.id, 'failed', itemErr.message);
        }
      }

      await clearCompletedSyncQueue();

      // 2. Process Inbound Sync (Server -> SQLite Local)
      await this.pullFromServer();

      pendingCount = await this.getPendingCount();
      this.notify('idle', pendingCount);
      return { success: true, message: 'Sincronização concluída com sucesso' };
    } catch (err: any) {
      console.error('Error during full sync:', err);
      pendingCount = await this.getPendingCount();
      this.notify('error', pendingCount);
      return { success: false, message: `Erro na sincronização: ${err.message}` };
    } finally {
      this.isSyncing = false;
    }
  }

  private async pullFromServer(): Promise<void> {
    try {
      // Pull Projetos
      const projRes = await apiClient.axios.get('/api/dashboard-stats').catch(() => null);
      // Try to fetch projects list
      const projectsRes = await apiClient.axios.get('/api/projetos').catch(() => null);
      if (projectsRes && Array.isArray(projectsRes.data)) {
        for (const p of projectsRes.data) {
          await saveLocalProjeto(p, 'synced');
        }
      }

      // Pull Visitas
      const visitsRes = await apiClient.axios.get('/api/visits').catch(() => null);
      if (visitsRes && Array.isArray(visitsRes.data)) {
        for (const v of visitsRes.data) {
          await saveLocalVisita(v, 'synced');
        }
      }

      // Pull Relatorios
      const reportsRes = await apiClient.axios.get('/api/relatorios').catch(() => null);
      if (reportsRes && Array.isArray(reportsRes.data)) {
        for (const r of reportsRes.data) {
          await saveLocalRelatorio(r, 'synced');
        }
      }
    } catch (pullErr) {
      console.warn('Inbound pull partially completed or backend offline:', pullErr);
    }
  }
}

export const syncService = new SyncService();
