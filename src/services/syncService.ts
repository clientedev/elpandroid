import { AppState, AppStateStatus } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import { apiClient } from './api';
import { readPhotoBase64 } from './imageService';
import { 
  getPendingSyncQueue, updateSyncQueueItem, clearCompletedSyncQueue,
  saveLocalProjeto, saveLocalVisita, saveLocalRelatorio, 
  saveLocalRelatorioExpress, saveLocalLembrete, saveLocalContato, 
  saveLocalReembolso, getLocalFotos, saveLocalFoto, updateLocalRelatorioNumero, getDatabase
} from '../database/db';
import { Projeto, Visita, Relatorio, RelatorioExpress, Lembrete, Contato, Reembolso } from '../types';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

class SyncService {
  private isSyncing: boolean = false;
  private listeners: ((state: SyncState, pendingCount: number) => void)[] = [];
  private autoSyncInterval: any = null;
  private lastSyncTimestamp: number = 0;

  constructor() {
    this.initAutoSync();
  }

  /**
   * Initializes automatic synchronization:
   * 1. Detects internet connection recovery
   * 2. Periodic sync check (heartbeat every 20s)
   * 3. Syncs when app returns from background
   */
  private initAutoSync() {
    // 1. Connection change listener
    NetInfo.addEventListener((state: NetInfoState) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (online) {
        // Debounce connection burst
        const now = Date.now();
        if (now - this.lastSyncTimestamp > 3000) {
          this.syncAll(false);
        }
      } else {
        this.getPendingCount().then(c => this.notify('offline', c));
      }
    });

    // 2. Heartbeat check every 20 seconds (sincronização automática contínua e transparente)
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
    }
    this.autoSyncInterval = setInterval(async () => {
      const online = await this.isOnline();
      if (online) {
        const pending = await this.getPendingCount();
        if (pending > 0 && !this.isSyncing) {
          await this.syncAll(false);
        }
      }
    }, 20000);

    // 3. Foreground resume listener
    AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (state === 'active') {
        const online = await this.isOnline();
        if (online) {
          const now = Date.now();
          if (now - this.lastSyncTimestamp > 5000) {
            this.syncAll(false);
          }
        }
      }
    });
  }


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
    try {
      const net = await NetInfo.fetch();
      return Boolean(net.isConnected && net.isInternetReachable !== false);
    } catch {
      return false;
    }
  }

  async getPendingCount(): Promise<number> {
    try {
      const queue = await getPendingSyncQueue();
      return queue.length;
    } catch {
      return 0;
    }
  }

  /**
   * Main synchronization routine:
   * Works 100% offline first, pushes pending local SQLite items to Railway,
   * and pulls remote records down to SQLite.
   */
  async syncAll(manual: boolean = false): Promise<{ success: boolean; message: string }> {
    if (this.isSyncing) {
      return { success: false, message: 'Sincronização já em andamento...' };
    }

    const online = await this.isOnline();
    if (!online) {
      const pending = await this.getPendingCount();
      this.notify('offline', pending);
      return { 
        success: false, 
        message: 'Dispositivo sem internet. Dados salvos 100% no celular e serão sincronizados automaticamente assim que conectar à rede.' 
      };
    }

    this.isSyncing = true;
    this.lastSyncTimestamp = Date.now();
    let pendingCount = await this.getPendingCount();
    this.notify('syncing', pendingCount);

    let processedCount = 0;
    let failedCount = 0;

    try {
      // 1. Process Outbound Sync Queue (Local SQLite -> Railway Server)
      const queue = await getPendingSyncQueue();
      for (const item of queue) {
        try {
          await updateSyncQueueItem(item.id, 'processing');
          let payload = JSON.parse(item.payload || '{}');

          // Enrich report payload with local photos and convert them to base64 if needed
          if (item.entity_type === 'relatorio') {
            try {
              const fotos = await getLocalFotos(item.entity_id);
              if (fotos && fotos.length > 0) {
                const enrichedFotos = await Promise.all(
                  fotos.map(async (f) => {
                    let base64Data = f.base64;
                    if (!base64Data && f.uri_local) {
                      base64Data = await readPhotoBase64(f.uri_local);
                      if (base64Data) {
                        await saveLocalFoto({ ...f, base64: base64Data }, 'pending').catch(() => null);
                      }
                    }
                    return {
                      ...f,
                      base64: base64Data,
                      imagem_base64: base64Data,
                    };
                  })
                );
                payload.fotos = enrichedFotos;
              }
            } catch (fotoErr) {
              console.warn('[SyncService] Could not attach photos:', fotoErr);
            }
          }

          let response;
          if (item.method === 'POST') {
            response = await apiClient.axios.post(item.endpoint, payload);
          } else if (item.method === 'PUT') {
            response = await apiClient.axios.put(item.endpoint, payload);
          } else if (item.method === 'DELETE') {
            response = await apiClient.axios.delete(item.endpoint);
          } else {
            response = await apiClient.axios.get(item.endpoint);
          }

          // Mark completed
          await updateSyncQueueItem(item.id, 'completed');
          processedCount++;

          // Update local entity sync_status to 'synced'
          const db = await getDatabase();
          if (item.entity_type === 'projeto') {
            await db.runAsync('UPDATE projetos SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
          } else if (item.entity_type === 'visita') {
            await db.runAsync('UPDATE visitas SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
          } else if (item.entity_type === 'relatorio') {
            const officialNumero = response?.data?.numero;
            const syncedAt = response?.data?.data_sincronizacao;
            if (officialNumero) {
              await updateLocalRelatorioNumero(item.entity_id, officialNumero, syncedAt);
            } else {
              await db.runAsync('UPDATE relatorios SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
            }
          } else if (item.entity_type === 'relatorio_express') {
            await db.runAsync('UPDATE relatorios_express SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
          } else if (item.entity_type === 'lembrete') {
            await db.runAsync('UPDATE lembretes SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
          } else if (item.entity_type === 'reembolso') {
            await db.runAsync('UPDATE reembolsos SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
          } else if (item.entity_type === 'contato') {
            await db.runAsync('UPDATE contatos SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
          }
        } catch (itemErr: any) {
          failedCount++;
          console.warn(`[SyncService] Queue item ${item.id} (${item.endpoint}) error:`, itemErr?.message);
          // If offline / network dropped mid-sync, mark pending for next retry
          const isNetErr = !itemErr.response;
          await updateSyncQueueItem(item.id, isNetErr ? 'pending' : 'failed', itemErr?.message);
        }
      }

      await clearCompletedSyncQueue();

      // 2. Process Inbound Sync (Railway Server -> SQLite Local)
      await this.pullFromServer();

      pendingCount = await this.getPendingCount();
      this.notify('idle', pendingCount);

      const msg = processedCount > 0 
        ? `Sincronização concluída! ${processedCount} alteração(ões) enviada(s) com sucesso para o Railway.`
        : 'Sincronização concluída! Todos os dados estão atualizados no servidor.';

      return { success: true, message: msg };
    } catch (err: any) {
      console.error('[SyncService] Global sync error:', err);
      pendingCount = await this.getPendingCount();
      this.notify('error', pendingCount);
      return { success: false, message: `Erro na sincronização: ${err.message}` };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Pulls remote changes from Railway down to the local SQLite database
   */
  private async pullFromServer(): Promise<void> {
    try {
      // 1. Pull Projetos
      const projectsRes = await apiClient.axios.get('/api/projetos', { timeout: 8000 }).catch(() => null);
      if (projectsRes && Array.isArray(projectsRes.data)) {
        for (const p of projectsRes.data) {
          await saveLocalProjeto(p, 'synced');
        }
      }

      // 2. Pull Visitas
      const visitsRes = await apiClient.axios.get('/api/visits', { timeout: 8000 }).catch(() => null);
      if (visitsRes && Array.isArray(visitsRes.data)) {
        for (const v of visitsRes.data) {
          await saveLocalVisita(v, 'synced');
        }
      }

      // 3. Pull Relatorios & Fotos
      const reportsRes = await apiClient.axios.get('/api/relatorios', { timeout: 12000 }).catch(() => null);
      if (reportsRes && Array.isArray(reportsRes.data)) {
        for (const r of reportsRes.data) {
          await saveLocalRelatorio(r, 'synced');
          if (Array.isArray(r.fotos)) {
            for (const f of r.fotos) {
              const fullUrl = f.url?.startsWith('http') 
                ? f.url 
                : `https://elpandroid-production.up.railway.app${f.url?.startsWith('/') ? '' : '/'}${f.url}`;
              await saveLocalFoto({
                id: f.id,
                relatorio_id: r.id,
                url: fullUrl,
                filename: f.filename,
                uri_local: fullUrl,
                titulo: f.titulo || '',
                legenda: f.legenda || '',
                descricao: f.descricao || '',
                tipo_servico: f.tipo_servico || '',
                local: f.local || '',
                ordem: f.ordem || 0,
                anotacoes_dados: typeof f.anotacoes_dados === 'object' ? JSON.stringify(f.anotacoes_dados) : (f.anotacoes_dados || ''),
                sync_status: 'synced',
              }, 'synced');
            }
          }
        }
      }

      // 4. Pull Lembretes
      const remindersRes = await apiClient.axios.get('/api/lembretes', { timeout: 8000 }).catch(() => null);
      if (remindersRes && Array.isArray(remindersRes.data)) {
        for (const l of remindersRes.data) {
          await saveLocalLembrete(l, 'synced');
        }
      }
    } catch (pullErr) {
      console.warn('[SyncService] Inbound pull notice:', pullErr);
    }
  }
}

export const syncService = new SyncService();
