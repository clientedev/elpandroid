import { AppState, AppStateStatus } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import { apiClient } from './api';
import { readPhotoBase64 } from './imageService';
import { 
  getPendingSyncQueue, updateSyncQueueItem, clearCompletedSyncQueue,
  saveLocalProjeto, saveLocalVisita, saveLocalRelatorio, 
  saveLocalRelatorioExpress, saveLocalLembrete, saveLocalContato, 
  saveLocalReembolso, getLocalFotos, saveLocalFoto, 
  getLocalFotosExpress, saveLocalFotoExpress,
  updateLocalRelatorioNumero, migrateLocalFotosRelatorioId, getDatabase,
  getLocalProjetos, getLocalRelatorios, getLocalRelatorioById, getLocalVisitas, deleteLocalProjetoCascade
} from '../database/db';
import { Projeto, Visita, Relatorio, RelatorioExpress, Lembrete, Contato, Reembolso } from '../types';
import { notificationService } from './notificationService';

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
   * 2. Periodic sync check (heartbeat a cada 10s para tempo real)
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

    // 2. Heartbeat check every 10 seconds (sincronização contínua e em tempo real entre todos os dispositivos)
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
    }
    this.autoSyncInterval = setInterval(async () => {
      const online = await this.isOnline();
      if (online && !this.isSyncing) {
        await this.syncAll(false);
      }
    }, 10000);

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
      const syncedEntitiesInBatch = new Set<string>();

      for (const item of queue) {
        try {
          let payload = JSON.parse(item.payload || '{}');
          const entityKey = `${item.entity_type}_${item.entity_id}`;
          const uuidKey = payload.uuid ? `${item.entity_type}_uuid_${payload.uuid}` : '';

          // Deduplicação: se a mesma entidade já foi processada neste lote, conclui o item redundante
          if (syncedEntitiesInBatch.has(entityKey) || (uuidKey && syncedEntitiesInBatch.has(uuidKey))) {
            console.log(`[SyncService] Pulando item redundante na fila já processado: ${entityKey}`);
            await updateSyncQueueItem(item.id, 'completed');
            continue;
          }

          await updateSyncQueueItem(item.id, 'processing');

          // Verificação inteligente para relatórios criados offline: se já foi sincronizado, evita duplicar POST
          if (item.entity_type === 'relatorio' && item.method === 'POST') {
            const localRel = await getLocalRelatorioById(item.entity_id);
            if (localRel && localRel.id < 2000000000 && localRel.sync_status === 'synced') {
              item.method = 'PUT';
              item.endpoint = `/api/relatorios/${localRel.id}`;
            }
          }

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

          if (item.entity_type === 'relatorio_express') {
            try {
              const fotosExp = await getLocalFotosExpress(item.entity_id);
              if (fotosExp && fotosExp.length > 0) {
                const enrichedFotos = await Promise.all(
                  fotosExp.map(async (f) => {
                    let base64Data = f.base64;
                    if (!base64Data && f.uri_local) {
                      base64Data = await readPhotoBase64(f.uri_local);
                      if (base64Data) {
                        await saveLocalFotoExpress({ ...f, base64: base64Data }, 'pending').catch(() => null);
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
            } catch (expFotoErr) {
              console.warn('[SyncService] Could not attach express photos:', expFotoErr);
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
          syncedEntitiesInBatch.add(entityKey);
          if (uuidKey) syncedEntitiesInBatch.add(uuidKey);

          // Update local entity sync_status to 'synced'
          const db = await getDatabase();
          if (item.entity_type === 'projeto') {
            await db.runAsync('UPDATE projetos SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
          } else if (item.entity_type === 'visita') {
            await db.runAsync('UPDATE visitas SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
          } else if (item.entity_type === 'relatorio') {
            const officialNumero = response?.data?.numero;
            const syncedAt = response?.data?.data_sincronizacao || new Date().toISOString();
            const serverId = response?.data?.id;
            const serverUuid = response?.data?.uuid || payload.uuid;
            if (serverId) syncedEntitiesInBatch.add(`relatorio_${serverId}`);
            if (serverUuid) syncedEntitiesInBatch.add(`relatorio_uuid_${serverUuid}`);

            if (officialNumero) {
              await updateLocalRelatorioNumero(item.entity_id, officialNumero, syncedAt);
            }
            if (serverId && serverId !== item.entity_id) {
              await migrateLocalFotosRelatorioId(item.entity_id, serverId, serverUuid);
              const db = await getDatabase();
              await db.runAsync(
                'UPDATE relatorios SET id = ?, numero = COALESCE(?, numero), sync_status = "synced", data_sincronizacao = ? WHERE id = ?',
                [serverId, officialNumero || null, syncedAt, item.entity_id]
              );
              console.log(`[SyncService] Relatório local ${item.entity_id} migrado para ID servidor ${serverId}`);
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
        ? `Sincronização concluída! ${processedCount} alteração(ões) enviada(s) com sucesso para o servidor.`
        : 'Sincronização concluída! Todos os dados estão atualizados no servidor.';

      if (processedCount > 0) {
        notificationService.notify({
          titulo: 'Sincronização Concluída',
          mensagem: msg,
          tipo: 'sincronizacao',
          silent: true,
        }).catch(() => null);
      }

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
   * Puxa alterações remotas da nuvem (Railway) para o SQLite local
   * com reconciliação bidirecional de exclusões (se uma obra ou laudo foi excluído
   * no servidor pelo Master, ele é automaticamente expurgado em cascata de todos os celulares)
   */
  private async pullFromServer(): Promise<void> {
    try {
      const db = await getDatabase();

      // 1. Pull Projetos com Reconciliação de Exclusão
      const projectsRes = await apiClient.axios.get('/api/projetos', { timeout: 8000 }).catch(() => null);
      if (projectsRes && Array.isArray(projectsRes.data)) {
        const serverProjects = projectsRes.data;
        const serverProjectIds = new Set(serverProjects.map((p: any) => p.id));

        // Reconciliação: se a obra estava sincronizada no aparelho mas não existe mais no servidor, apaga em cascata!
        const localProjetos = await getLocalProjetos('Todos');
        for (const lp of localProjetos) {
          if (lp.sync_status === 'synced' && !serverProjectIds.has(lp.id)) {
            console.log(`[SyncService] Obra ${lp.id} (${lp.nome}) excluída na nuvem. Apagando em cascata do aparelho.`);
            await deleteLocalProjetoCascade(lp.id);
          }
        }

        // Salvar/atualizar obras ativas do servidor
        for (const p of serverProjects) {
          await saveLocalProjeto(p, 'synced');
        }
      }

      // 2. Pull Visitas com Reconciliação
      const visitsRes = await apiClient.axios.get('/api/visits', { timeout: 8000 }).catch(() => null);
      if (visitsRes && Array.isArray(visitsRes.data)) {
        const serverVisits = visitsRes.data;
        const serverVisitIds = new Set(serverVisits.map((v: any) => v.id));

        const localVisits = await getLocalVisitas();
        for (const lv of localVisits) {
          if (lv.sync_status === 'synced' && !serverVisitIds.has(lv.id)) {
            console.log(`[SyncService] Visita ${lv.id} excluída na nuvem. Removendo do dispositivo.`);
            await db.runAsync('DELETE FROM visita_participantes WHERE visita_id = ?;', [lv.id]);
            await db.runAsync('DELETE FROM visitas WHERE id = ?;', [lv.id]);
          }
        }

        for (const v of serverVisits) {
          await saveLocalVisita(v, 'synced');
        }
      }

      // 3. Pull Relatorios & Fotos com Reconciliação
      const reportsRes = await apiClient.axios.get('/api/relatorios', { timeout: 12000 }).catch(() => null);
      if (reportsRes && Array.isArray(reportsRes.data)) {
        const serverReports = reportsRes.data;
        const serverReportIds = new Set(serverReports.map((r: any) => r.id));

        const localReports = await getLocalRelatorios();
        for (const lr of localReports) {
          if (lr.sync_status === 'synced' && !serverReportIds.has(lr.id)) {
            console.log(`[SyncService] Relatório ${lr.id} (${lr.numero}) excluído na nuvem. Removendo do dispositivo.`);
            await db.runAsync('DELETE FROM fotos_relatorio WHERE relatorio_id = ?;', [lr.id]);
            await db.runAsync('DELETE FROM relatorios WHERE id = ?;', [lr.id]);
          }
        }

        for (const r of serverReports) {
          await saveLocalRelatorio(r, 'synced');
          if (Array.isArray(r.fotos)) {
            for (const f of r.fotos) {
              const fullUrl = f.url?.startsWith('http') 
                ? f.url 
                : `https://elpandroid-production.up.railway.app${f.url?.startsWith('/') ? '' : '/'}${f.url}`;
              await saveLocalFoto({
                id: f.id,
                relatorio_id: r.id,
                relatorio_uuid: r.uuid,
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

      // 4. Pull Lembretes com Reconciliação
      const remindersRes = await apiClient.axios.get('/api/lembretes', { timeout: 8000 }).catch(() => null);
      if (remindersRes && Array.isArray(remindersRes.data)) {
        const serverReminders = remindersRes.data;
        const serverReminderIds = new Set(serverReminders.map((l: any) => l.id));

        const localReminders = await db.getAllAsync<{ id: number; sync_status: string }>('SELECT id, sync_status FROM lembretes');
        for (const lr of localReminders) {
          if (lr.sync_status === 'synced' && !serverReminderIds.has(lr.id)) {
            await db.runAsync('DELETE FROM lembretes WHERE id = ?;', [lr.id]);
          }
        }

        for (const l of serverReminders) {
          await saveLocalLembrete(l, 'synced');
        }
      }

      // 5. Pull Relatórios Express & Fotos com Reconciliação
      const expressRes = await apiClient.axios.get('/api/relatorios-express', { timeout: 10000 }).catch(() => null);
      if (expressRes && Array.isArray(expressRes.data)) {
        const serverExpress = expressRes.data;
        const serverExpressIds = new Set(serverExpress.map((exp: any) => exp.id));

        const localExpress = await db.getAllAsync<{ id: number; sync_status: string }>('SELECT id, sync_status FROM relatorios_express');
        for (const le of localExpress) {
          if (le.sync_status === 'synced' && !serverExpressIds.has(le.id)) {
            await db.runAsync('DELETE FROM fotos_relatorio_express WHERE relatorio_express_id = ?;', [le.id]);
            await db.runAsync('DELETE FROM relatorios_express WHERE id = ?;', [le.id]);
          }
        }

        for (const exp of serverExpress) {
          await saveLocalRelatorioExpress(exp, 'synced');
          if (Array.isArray(exp.fotos)) {
            for (const f of exp.fotos) {
              const fullUrl = f.url?.startsWith('http')
                ? f.url
                : `https://elpandroid-production.up.railway.app${f.url?.startsWith('/') ? '' : '/'}${f.url}`;
              await saveLocalFotoExpress({
                id: f.id,
                relatorio_express_id: exp.id,
                url: fullUrl,
                filename: f.filename,
                uri_local: fullUrl,
                titulo: f.titulo || '',
                legenda: f.legenda || '',
                descricao: f.descricao || '',
                local: f.local || '',
                ordem: f.ordem || 0,
                sync_status: 'synced',
              }, 'synced');
            }
          }
        }
      }

      // 6. Limpeza de integridade referencial: garantir que nenhum registro órfão permaneça
      await db.runAsync('DELETE FROM fotos_relatorio WHERE relatorio_id IN (SELECT id FROM relatorios WHERE projeto_id NOT IN (SELECT id FROM projetos));');
      await db.runAsync('DELETE FROM relatorios WHERE projeto_id NOT IN (SELECT id FROM projetos);');
      await db.runAsync('DELETE FROM visita_participantes WHERE visita_id IN (SELECT id FROM visitas WHERE projeto_id IS NOT NULL AND projeto_id NOT IN (SELECT id FROM projetos));');
      await db.runAsync('DELETE FROM visitas WHERE projeto_id IS NOT NULL AND projeto_id NOT IN (SELECT id FROM projetos);');
      await db.runAsync('DELETE FROM lembretes WHERE projeto_id NOT IN (SELECT id FROM projetos);');
      await db.runAsync('DELETE FROM contatos WHERE projeto_id IS NOT NULL AND projeto_id NOT IN (SELECT id FROM projetos);');
    } catch (pullErr) {
      console.warn('[SyncService] Inbound pull notice:', pullErr);
    }
  }
}

export const syncService = new SyncService();
