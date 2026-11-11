import { AppState, AppStateStatus } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { apiClient } from './api';
import { readPhotoBase64 } from './imageService';
import {
  getPendingSyncQueue, updateSyncQueueItem, clearCompletedSyncQueue, getPendingSyncCount, addToSyncQueue,
  saveLocalProjeto, saveLocalVisita, saveLocalRelatorio,
  saveLocalRelatorioExpress, saveLocalLembrete, saveLocalContato,
  getLocalFotos, saveLocalFoto,
  getLocalFotosExpress, saveLocalFotoExpress, getLocalRelatorioExpressById, updateLocalRelatorioExpressStatus,
  updateLocalRelatorioNumero, migrateLocalFotosRelatorioId, migrateLocalFotosRelatorioExpressId, getDatabase,
  getLocalProjetos, getLocalRelatorios, getLocalRelatorioById, getLocalVisitas, deleteLocalProjetoCascade,
  getDeletedEntityIds, clearDeletedEntityLocally, migrateLocalProjetoId, migrateLocalVisitaId, saveLocalVisitante, saveLocalUsers
} from '../database/db';
import { Projeto, Visita, Relatorio, RelatorioExpress, FotoRelatorioExpress, Lembrete, Contato, Visitante } from '../types';
import { notificationService } from './notificationService';
import { screenConfigService } from './screenConfigService';
import { ensureProjectFolders } from './appFilesService';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

class SyncService {
  private isSyncing: boolean = false;
  private pendingResync: boolean = false;
  private pendingManualResync: boolean = false;
  private listeners: ((state: SyncState, pendingCount: number) => void)[] = [];
  private autoSyncInterval: any = null;
  private lastSyncTimestamp: number = 0;
  private lastPullTimestamp: number = 0;
  private wasOffline: boolean = false;
  private hasNotifiedOfflineSyncDone: boolean = false;

  constructor() {
    this.initAutoSync();
  }

  /**
   * Inicializa sincronização inteligente e eficiente:
   * 1. Detecta recuperação de conexão com debounce
   * 2. Heartbeat a cada 45s apenas para itens pendentes ou pull periódico
   * 3. Sincroniza ao retornar ao primeiro plano (se decorrido mais de 60s)
   */
  private initAutoSync() {
    // 1. Connection change listener
    NetInfo.addEventListener((state: NetInfoState) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (online) {
        const now = Date.now();
        if (now - this.lastSyncTimestamp > 5000) {
          this.syncAll(false);
        }
      } else {
        this.wasOffline = true;
        this.hasNotifiedOfflineSyncDone = false;
        this.getPendingCount().then(c => this.notify('offline', c));
      }
    });

    // 2. Heartbeat otimizado: verifica pendências a cada 120s sem travar CPU/banco
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
    }
    this.autoSyncInterval = setInterval(async () => {
      const online = await this.isOnline();
      if (online && !this.isSyncing) {
        const pending = await this.getPendingCount();
        const shouldPeriodicPull = Date.now() - this.lastPullTimestamp > 300000;
        if (pending > 0 || shouldPeriodicPull) {
          await this.syncAll(false);
        }
      }
    }, 120000);

    // 3. Foreground resume listener (debouncado para pelo menos 120s)
    AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (state === 'active') {
        const online = await this.isOnline();
        if (online && !this.isSyncing) {
          const now = Date.now();
          if (now - this.lastSyncTimestamp > 120000) {
            const pending = await this.getPendingCount();
            if (pending > 0 || now - this.lastPullTimestamp > 300000) {
              this.syncAll(false);
            }
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
      if (net.isConnected) return true;
      // Resilient fallback: tenta ping direto no servidor backend Railway
      const res = await apiClient.axios.get('/api/ping', { timeout: 3000 });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async getPendingCount(): Promise<number> {
    try {
      return await getPendingSyncCount();
    } catch {
      return 0;
    }
  }

  /**
   * Atualiza o status (Aprovado/Rejeitado) de um Relatório Express localmente
   * e tenta sincronizar imediatamente com a nuvem se online, caindo para a fila offline apenas se necessário.
   */
  async syncExpressReportApprovalNow(
    id: number,
    numero: string | undefined,
    status: string,
    comentario: string,
    aprovadorId?: number,
    aprovadorNome?: string
  ): Promise<boolean> {
    const updatedRow = await updateLocalRelatorioExpressStatus(
      id,
      status,
      comentario,
      aprovadorId,
      aprovadorNome,
      'pending',
      numero
    );

    const effectiveId = updatedRow?.id || id;
    const effectiveNumero = updatedRow?.numero || numero || '';
    const fullPayload: any = {
      ...(updatedRow || {}),
      id: effectiveId,
      numero: effectiveNumero,
      status,
      comentario,
      comentario_aprovacao: comentario,
      aprovador_id: aprovadorId,
      aprovador_nome: aprovadorNome,
    };

    try {
      const online = await this.isOnline();
      if (online) {
        // Se o relatório ainda tinha ID provisório ou fotos pendentes, anexa fotos não sincronizadas
        const fotosExp = await getLocalFotosExpress(effectiveId);
        if (fotosExp && fotosExp.length > 0) {
          fullPayload.fotos = await Promise.all(
            fotosExp.map(async (f: any) => {
              const alreadyOnServer = f.sync_status === 'synced' && f.id < 2000000000 && f.url && f.url.length > 4;
              if (alreadyOnServer) {
                return {
                  id: f.id,
                  relatorio_express_id: f.relatorio_express_id,
                  filename: f.filename,
                  url: f.url,
                  titulo: f.titulo,
                  legenda: f.legenda,
                  descricao: f.descricao,
                  local: f.local,
                  ordem: f.ordem,
                  anotacoes_dados: f.anotacoes_dados,
                };
              }
              let base64Data = f.base64 || f.imagem_base64;
              if (!base64Data && f.uri_local && !f.uri_local.startsWith('http')) {
                base64Data = await readPhotoBase64(f.uri_local).catch(() => undefined);
              }
              return {
                ...f,
                base64: base64Data,
                imagem_base64: base64Data,
              };
            })
          );
        }

        const res = await apiClient.axios.post('/api/relatorios-express/sync', fullPayload, { timeout: 12000 });
        if (res && (res.status === 200 || res.status === 201)) {
          const serverId = Number(res.data?.id) || effectiveId;
          const officialNumero = res.data?.numero || effectiveNumero;
          const db = await getDatabase();

          if (serverId && serverId !== effectiveId) {
            await migrateLocalFotosRelatorioExpressId(effectiveId, serverId);
            const existingTempRow = await db.getFirstAsync<{ id: number }>(
              'SELECT id FROM relatorios_express WHERE id = ?',
              [effectiveId]
            );
            if (existingTempRow) {
              await db.runAsync('DELETE FROM relatorios_express WHERE id = ?;', [serverId]);
              await db.runAsync(
                'UPDATE relatorios_express SET id = ?, numero = COALESCE(?, numero), status = ?, comentario_aprovacao = ?, sync_status = "synced", updated_at = ? WHERE id = ?',
                [serverId, officialNumero || null, status, comentario, new Date().toISOString(), effectiveId]
              );
            } else {
              await db.runAsync(
                'UPDATE relatorios_express SET numero = COALESCE(?, numero), status = ?, comentario_aprovacao = ?, sync_status = "synced", updated_at = ? WHERE id = ?',
                [officialNumero || null, status, comentario, new Date().toISOString(), serverId]
              );
            }
          } else {
            await db.runAsync(
              'UPDATE relatorios_express SET status = ?, comentario_aprovacao = ?, sync_status = "synced", updated_at = ? WHERE id = ? OR (numero IS NOT NULL AND numero != "" AND numero = ?)',
              [status, comentario, new Date().toISOString(), serverId, officialNumero]
            );
          }

          await db.runAsync(
            "UPDATE fotos_relatorio_express SET sync_status = 'synced', base64 = '' WHERE relatorio_express_id = ? AND ((uri_local IS NOT NULL AND uri_local != '') OR (url IS NOT NULL AND url != ''))",
            [serverId]
          ).catch(() => null);

          await db.runAsync(
            "UPDATE sync_queue SET status = 'completed' WHERE entity_type = 'relatorio_express' AND (entity_id = ? OR entity_id = ?)",
            [effectiveId, serverId]
          ).catch(() => null);

          const pending = await this.getPendingCount();
          this.notify('idle', pending);
          return true;
        }
      }
    } catch (directErr: any) {
      console.warn('[SyncService] Envio direto da aprovação express falhou, enfileirando:', directErr?.message);
    }

    await addToSyncQueue(
      'relatorio_express',
      effectiveId,
      status === 'Aprovado' ? 'approve' : 'reject',
      '/api/relatorios-express/sync',
      'POST',
      fullPayload
    );

    const pending = await this.getPendingCount();
    this.notify('idle', pending);
    this.syncAll(false).catch(() => null);
    return false;
  }

  /**
   * Main synchronization routine:
   * Works 100% offline first, pushes pending local SQLite items to Railway,
   * and pulls remote records down to SQLite.
   */
  async syncAll(manual: boolean = false): Promise<{ success: boolean; message: string }> {
    if (this.isSyncing) {
      this.pendingResync = true;
      if (manual) this.pendingManualResync = true;
      return { success: true, message: 'Sincronização agendada em sequência...' };
    }

    // Reativa qualquer item na fila que tenha ficado em 'processing' ou falhado temporariamente
    try {
      const db = await getDatabase();
      await db.runAsync("UPDATE sync_queue SET status = 'pending' WHERE status IN ('processing', 'failed');");
    } catch { }

    let online = await this.isOnline();
    if (!online && manual) {
      try {
        const ping = await apiClient.axios.get('/api/ping', { timeout: 4000 });
        if (ping.status === 200) online = true;
      } catch { }
    }

    if (!online) {
      this.wasOffline = true;
      this.hasNotifiedOfflineSyncDone = false;
      const pending = await this.getPendingCount();
      this.notify('offline', pending);
      return {
        success: false,
        message: 'Dispositivo sem internet. Dados salvos 100% no celular e serão sincronizados automaticamente assim que conectar à rede.'
      };
    }

    let pendingCount = await this.getPendingCount();
    const shouldPeriodicPull = manual || this.lastPullTimestamp === 0 || (Date.now() - this.lastPullTimestamp > 300000);
    if (!manual && pendingCount === 0 && !shouldPeriodicPull) {
      return { success: true, message: 'Tudo sincronizado.' };
    }

    this.isSyncing = true;
    this.lastSyncTimestamp = Date.now();
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

          // Deduplicação: nunca pular ações críticas de aprovação/rejeição/status ou exclusão
          const isStatusOrDeleteAction =
            item.action === 'approve' ||
            item.action === 'reject' ||
            item.action === 'update_status' ||
            item.action === 'delete' ||
            item.method === 'DELETE';

          if (!isStatusOrDeleteAction && (syncedEntitiesInBatch.has(entityKey) || (uuidKey && syncedEntitiesInBatch.has(uuidKey)))) {
            console.log(`[SyncService] Pulando item redundante na fila já processado: ${entityKey}`);
            await updateSyncQueueItem(item.id, 'completed');
            continue;
          }

          await updateSyncQueueItem(item.id, 'processing');

          // Verificação inteligente para relatórios criados offline: se já foi sincronizado, evita duplicar POST
          if (item.entity_type === 'relatorio') {
            let localRel = await getLocalRelatorioById(item.entity_id);
            if (!localRel && (payload.uuid || payload.uuid_local)) {
              const db = await getDatabase();
              localRel = await db.getFirstAsync<Relatorio>(
                'SELECT * FROM relatorios WHERE uuid = ? OR uuid_local = ?',
                [payload.uuid || payload.uuid_local, payload.uuid || payload.uuid_local]
              );
            }
            if (localRel) {
              payload.projeto_id = localRel.projeto_id;
              if (localRel.id < 2000000000 && localRel.sync_status === 'synced' && item.method === 'POST' && item.endpoint === '/api/relatorios') {
                item.method = 'PUT';
                item.endpoint = `/api/relatorios/${localRel.id}`;
              }
            }
          }

          // Enrich report payload with local photos (only encoding base64 for photos not yet synced)
          if (item.entity_type === 'relatorio' && item.method !== 'DELETE') {
            try {
              const fotos = await getLocalFotos(item.entity_id, payload.uuid || payload.uuid_local);
              if (fotos && fotos.length > 0) {
                const enrichedFotos = await Promise.all(
                  fotos.map(async (f) => {
                    const alreadyOnServer = f.sync_status === 'synced' && f.id < 2000000000 && f.url && f.url.length > 4;
                    if (alreadyOnServer) {
                      return {
                        id: f.id,
                        relatorio_id: f.relatorio_id,
                        filename: f.filename,
                        url: f.url,
                        titulo: f.titulo,
                        legenda: f.legenda,
                        descricao: f.descricao,
                        local: f.local,
                        ordem: f.ordem,
                        anotacoes_dados: f.anotacoes_dados,
                      };
                    }
                    let base64Data = f.base64;
                    if (!base64Data && f.uri_local && !f.uri_local.startsWith('http')) {
                      base64Data = await readPhotoBase64(f.uri_local).catch(() => undefined);
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

          if (item.entity_type === 'relatorio_express' && item.method !== 'DELETE') {
            try {
              const localExp = await getLocalRelatorioExpressById(item.entity_id, payload.numero);
              if (localExp) {
                const effectiveStatus =
                  (localExp.status === 'Aprovado' || localExp.status === 'Rejeitado')
                    ? localExp.status
                    : (payload.status || localExp.status);
                const effectiveComment =
                  payload.comentario_aprovacao || payload.comentario || localExp.comentario_aprovacao || '';
                const effectiveAprovadorId =
                  payload.aprovador_id || localExp.aprovador_id || undefined;
                const effectiveAprovadorNome =
                  payload.aprovador_nome || localExp.aprovador_nome || undefined;

                payload = {
                  ...localExp,
                  ...payload,
                  id: localExp.id,
                  numero: localExp.numero || payload.numero,
                  status: effectiveStatus,
                  comentario: effectiveComment,
                  comentario_aprovacao: effectiveComment,
                  aprovador_id: effectiveAprovadorId,
                  aprovador_nome: effectiveAprovadorNome,
                };
                item.entity_id = localExp.id;
              }

              let fotosExp = await getLocalFotosExpress(item.entity_id);
              if (!fotosExp || fotosExp.length === 0) {
                fotosExp = payload.fotos || [];
              }
              if (fotosExp && fotosExp.length > 0) {
                const enrichedFotos = await Promise.all(
                  fotosExp.map(async (f: any) => {
                    const alreadyOnServer = f.sync_status === 'synced' && f.id < 2000000000 && f.url && f.url.length > 4;
                    if (alreadyOnServer) {
                      return {
                        id: f.id,
                        relatorio_express_id: f.relatorio_express_id,
                        filename: f.filename,
                        url: f.url,
                        titulo: f.titulo,
                        legenda: f.legenda,
                        descricao: f.descricao,
                        local: f.local,
                        ordem: f.ordem,
                        anotacoes_dados: f.anotacoes_dados,
                      };
                    }
                    let base64Data = f.base64 || f.imagem_base64;
                    if (!base64Data && f.uri_local && !f.uri_local.startsWith('http')) {
                      base64Data = await readPhotoBase64(f.uri_local).catch(() => undefined);
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
          try {
            if (item.method === 'POST') {
              response = await apiClient.axios.post(item.endpoint, payload, { timeout: 25000 });
            } else if (item.method === 'PUT') {
              response = await apiClient.axios.put(item.endpoint, payload, { timeout: 25000 });
            } else if (item.method === 'DELETE') {
              response = await apiClient.axios.delete(item.endpoint, { data: payload, timeout: 15000 });
            } else {
              response = await apiClient.axios.get(item.endpoint, { timeout: 15000 });
            }
          } catch (reqErr: any) {
            // Se falhou no PUT para projeto (ex: não existia no servidor), tenta criar via POST
            if (item.entity_type === 'projeto' && item.method === 'PUT') {
              response = await apiClient.axios.post('/api/projetos', payload, { timeout: 15000 });
            } else {
              throw reqErr;
            }
          }

          // Mark completed
          await updateSyncQueueItem(item.id, 'completed');
          if (item.method === 'DELETE') {
            await clearDeletedEntityLocally(item.entity_type, item.entity_id);
          }
          processedCount++;
          syncedEntitiesInBatch.add(entityKey);
          if (uuidKey) syncedEntitiesInBatch.add(uuidKey);

          // Update local entity sync_status to 'synced'
          const db = await getDatabase();
          if (item.entity_type === 'projeto') {
            const serverId = Number(response?.data?.id);
            const serverNumero = response?.data?.numero;
            if (serverId && serverId !== item.entity_id) {
              await migrateLocalProjetoId(item.entity_id, serverId, serverNumero);
              console.log(`[SyncService] Obra local ${item.entity_id} migrada para ID servidor ${serverId} (${serverNumero})`);
            } else {
              await db.runAsync('UPDATE projetos SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
            }
          } else if (item.entity_type === 'visita') {
            const serverId = Number(response?.data?.id);
            const serverNumero = response?.data?.numero;
            if (serverId && serverId !== item.entity_id) {
              await migrateLocalVisitaId(item.entity_id, serverId, serverNumero);
            } else {
              await db.runAsync('UPDATE visitas SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
            }
          } else if (item.entity_type === 'relatorio') {
            const officialNumero = response?.data?.numero;
            const syncedAt = response?.data?.data_sincronizacao || new Date().toISOString();
            const serverId = Number(response?.data?.id);
            const serverUuid = response?.data?.uuid || payload.uuid;
            if (serverId) syncedEntitiesInBatch.add(`relatorio_${serverId}`);
            if (serverUuid) syncedEntitiesInBatch.add(`relatorio_uuid_${serverUuid}`);

            if (officialNumero) {
              await updateLocalRelatorioNumero(item.entity_id, officialNumero, syncedAt);
            }
            const targetRelId = serverId || item.entity_id;
            if (serverId && serverId !== item.entity_id) {
              await migrateLocalFotosRelatorioId(item.entity_id, serverId, serverUuid);
              await db.runAsync(
                'UPDATE relatorios SET id = ?, numero = COALESCE(?, numero), sync_status = "synced", data_sincronizacao = ? WHERE id = ?',
                [serverId, officialNumero || null, syncedAt, item.entity_id]
              );
              console.log(`[SyncService] Relatório local ${item.entity_id} migrado para ID servidor ${serverId}`);
            } else {
              await db.runAsync('UPDATE relatorios SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
            }
            await db.runAsync(
              "UPDATE fotos_relatorio SET sync_status = 'synced', base64 = '' WHERE relatorio_id = ? AND ((uri_local IS NOT NULL AND uri_local != '') OR (url IS NOT NULL AND url != ''))",
              [targetRelId]
            ).catch(() => null);
          } else if (item.entity_type === 'relatorio_express') {
            const serverId = Number(response?.data?.id);
            const officialNumero = response?.data?.numero;
            if (serverId) syncedEntitiesInBatch.add(`relatorio_express_${serverId}`);
            const targetExpId = serverId || item.entity_id;

            if (serverId && serverId !== item.entity_id) {
              await migrateLocalFotosRelatorioExpressId(item.entity_id, serverId);
              const existingTempRow = await db.getFirstAsync<{ id: number }>(
                'SELECT id FROM relatorios_express WHERE id = ?',
                [item.entity_id]
              );
              if (existingTempRow) {
                await db.runAsync('DELETE FROM relatorios_express WHERE id = ?;', [serverId]);
                await db.runAsync(
                  'UPDATE relatorios_express SET id = ?, numero = COALESCE(?, numero), sync_status = "synced", updated_at = ? WHERE id = ?',
                  [serverId, officialNumero || null, new Date().toISOString(), item.entity_id]
                );
              } else {
                await db.runAsync(
                  'UPDATE relatorios_express SET numero = COALESCE(?, numero), sync_status = "synced", updated_at = ? WHERE id = ?',
                  [officialNumero || null, new Date().toISOString(), serverId]
                );
              }
              await db.runAsync(
                "UPDATE sync_queue SET entity_id = ? WHERE entity_type = 'relatorio_express' AND entity_id = ? AND status = 'pending'",
                [serverId, item.entity_id]
              ).catch(() => null);
              console.log(`[SyncService] Relatório Express local ${item.entity_id} migrado para ID servidor ${serverId}`);
            } else {
              await db.runAsync(
                'UPDATE relatorios_express SET sync_status = "synced", updated_at = ? WHERE id = ? OR (numero IS NOT NULL AND numero != "" AND numero = ?)',
                [new Date().toISOString(), targetExpId, officialNumero || payload.numero || '']
              );
            }
            await db.runAsync(
              "UPDATE fotos_relatorio_express SET sync_status = 'synced', base64 = '' WHERE relatorio_express_id = ? AND ((uri_local IS NOT NULL AND uri_local != '') OR (url IS NOT NULL AND url != ''))",
              [targetExpId]
            ).catch(() => null);
          } else if (item.entity_type === 'lembrete') {
            const serverId = Number(response?.data?.id);
            if (serverId && serverId !== item.entity_id) {
              await db.runAsync('DELETE FROM lembretes WHERE id = ?', [serverId]).catch(() => null);
              await db.runAsync('UPDATE lembretes SET id = ?, sync_status = "synced" WHERE id = ?', [serverId, item.entity_id]);
            } else {
              await db.runAsync('UPDATE lembretes SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
            }
          } else if (item.entity_type === 'contato') {
            const serverId = Number(response?.data?.id);
            if (serverId && serverId !== item.entity_id) {
              await db.runAsync('DELETE FROM contatos WHERE id = ?', [serverId]).catch(() => null);
              await db.runAsync('UPDATE contatos SET id = ?, sync_status = "synced" WHERE id = ?', [serverId, item.entity_id]);
            } else {
              await db.runAsync('UPDATE contatos SET sync_status = "synced" WHERE id = ?', [item.entity_id]);
            }
          }
        } catch (itemErr: any) {
          failedCount++;
          console.warn(`[SyncService] Queue item ${item.id} (${item.endpoint}) error:`, itemErr?.message);
          const status = itemErr?.response?.status;
          // Se o servidor retornou 409 (conflito/já cadastrado) ou 404 em exclusão, conclui o item para não travar a fila
          if (status === 409 || (status === 404 && item.method === 'DELETE')) {
            console.log(`[SyncService] Item ${item.id} já resolvido no servidor (HTTP ${status}), concluindo fila.`);
            await updateSyncQueueItem(item.id, 'completed');
          } else {
            const isNetErr = !itemErr.response;
            // Se já tentou mais de 3 vezes com erro irrecuperável do servidor, não fica como pendente
            const nextStatus = isNetErr ? 'pending' : (item.retries >= 3 ? 'failed' : 'pending');
            await updateSyncQueueItem(item.id, nextStatus, itemErr?.message);
          }
        }
      }

      await clearCompletedSyncQueue();

      // 1.5 Proactive Sync for Local Projects that are pending or have temporary local IDs
      try {
        const db = await getDatabase();
        const pendingProjs = await db.getAllAsync<any>(
          'SELECT * FROM projetos WHERE sync_status = "pending" OR id >= 2000000000'
        );
        for (const lp of pendingProjs) {
          try {
            const pEntityKey = `projeto_${lp.id}`;
            if (syncedEntitiesInBatch.has(pEntityKey)) {
              continue;
            }

            const isTemp = lp.id >= 2000000000;
            const endpoint = isTemp ? '/api/projetos' : `/api/projetos/${lp.id}`;

            let contatosArr = [];
            if (typeof lp.contatos === 'string') {
              try { contatosArr = JSON.parse(lp.contatos); } catch { }
            } else if (Array.isArray(lp.contatos)) {
              contatosArr = lp.contatos;
            }
            const projPayload = {
              ...lp,
              contatos: contatosArr,
            };

            let pRes: any;
            try {
              pRes = isTemp
                ? await apiClient.axios.post(endpoint, projPayload, { timeout: 12000 })
                : await apiClient.axios.put(endpoint, projPayload, { timeout: 12000 });
            } catch (firstErr: any) {
              if (!isTemp) {
                // Se falhou no PUT (ex: obra ainda não existe no Postgres na nuvem), tenta cadastrar via POST
                pRes = await apiClient.axios.post('/api/projetos', projPayload, { timeout: 12000 });
              } else {
                throw firstErr;
              }
            }

            if (pRes?.data?.id) {
              const serverId = Number(pRes.data.id);
              const serverNumero = pRes.data.numero || lp.numero;
              if (lp.id !== serverId) {
                await migrateLocalProjetoId(lp.id, serverId, serverNumero);
              }
              await db.runAsync(
                'UPDATE projetos SET sync_status = "synced", numero = COALESCE(?, numero) WHERE id = ?',
                [serverNumero || null, serverId]
              );
              await db.runAsync(
                "UPDATE sync_queue SET status = 'completed' WHERE entity_type = 'projeto' AND (entity_id = ? OR entity_id = ?)",
                [lp.id, serverId]
              ).catch(() => null);
              console.log(`[SyncService] Proativo: Obra local ${lp.id} sincronizada no servidor com ID ${serverId} (${serverNumero})`);
            } else {
              await db.runAsync(
                'UPDATE projetos SET sync_status = "synced" WHERE id = ?',
                [lp.id]
              );
            }
            syncedEntitiesInBatch.add(pEntityKey);
            processedCount++;
          } catch (projSyncErr: any) {
            console.warn(`[SyncService] Proativo falhou para obra ${lp.id}:`, projSyncErr?.message);
          }
        }
      } catch (err) {
        console.warn('[SyncService] Erro na varredura proativa de projetos:', err);
      }

      // 1.55 Proactive Sync for Local Visits (if any pending visit is not yet synced)
      try {
        const db = await getDatabase();
        const pendingVisits = await db.getAllAsync<any>(
          'SELECT * FROM visitas WHERE sync_status = "pending" OR id >= 2000000000'
        );
        for (const lv of pendingVisits) {
          try {
            const vKey = `visita_${lv.id}`;
            if (syncedEntitiesInBatch.has(vKey)) continue;

            const isTemp = lv.id >= 2000000000;
            const endpoint = isTemp ? '/api/visits' : `/api/visits/${lv.id}`;
            const parts = await db.getAllAsync<any>(
              'SELECT * FROM visita_participantes WHERE visita_id = ?',
              [lv.id]
            );
            const vPayload = { ...lv, participantes: parts || [] };
            const vRes = isTemp
              ? await apiClient.axios.post(endpoint, vPayload)
              : await apiClient.axios.put(endpoint, vPayload);
            const serverId = vRes?.data?.id;
            const officialNum = vRes?.data?.numero;
            if (isTemp && serverId && serverId !== lv.id) {
              syncedEntitiesInBatch.add(`visita_${serverId}`);
              await migrateLocalVisitaId(lv.id, serverId, officialNum);
              await db.runAsync(
                "UPDATE sync_queue SET status = 'completed' WHERE entity_type = 'visita' AND (entity_id = ? OR entity_id = ?)",
                [lv.id, serverId]
              ).catch(() => null);
            } else {
              await db.runAsync(
                'UPDATE visitas SET sync_status = "synced", numero = COALESCE(?, numero) WHERE id = ?',
                [officialNum || null, lv.id]
              );
            }
            syncedEntitiesInBatch.add(vKey);
            processedCount++;
          } catch (vSyncErr: any) {
            console.warn(`[SyncService] Proativo falhou para visita ${lv.id}:`, vSyncErr?.message);
          }
        }
      } catch (err) {
        console.warn('[SyncService] Erro na varredura proativa de visitas:', err);
      }

      // 1.6 Proactive Sync for Local Reports (including drafts / rascunhos em andamento)
      try {
        const db = await getDatabase();
        const pendingRels = await db.getAllAsync<any>(
          'SELECT * FROM relatorios WHERE sync_status = "pending" OR id >= 2000000000'
        );
        for (const lr of pendingRels) {
          try {
            const entityKey = `relatorio_${lr.id}`;
            const uuidKey = lr.uuid ? `relatorio_uuid_${lr.uuid}` : '';
            if (syncedEntitiesInBatch.has(entityKey) || (uuidKey && syncedEntitiesInBatch.has(uuidKey))) {
              continue;
            }

            const isTemp = lr.id >= 2000000000;
            const endpoint = isTemp ? '/api/relatorios' : `/api/relatorios/${lr.id}`;

            // Enrich with photos (skip base64 for photos already synced on server)
            const fotos = await getLocalFotos(lr.id, lr.uuid || lr.uuid_local);
            let enrichedFotos: any[] = [];
            if (fotos && fotos.length > 0) {
              enrichedFotos = await Promise.all(
                fotos.map(async (f) => {
                  const alreadyOnServer = f.sync_status === 'synced' && f.id < 2000000000 && f.url && (f.url.includes('/uploads/') || f.url.startsWith('http'));
                  if (alreadyOnServer) {
                    return {
                      ...f,
                      base64: undefined,
                      imagem_base64: undefined,
                    };
                  }
                  let base64Data = f.base64;
                  if (!base64Data && f.uri_local && !f.uri_local.startsWith('http')) {
                    base64Data = await readPhotoBase64(f.uri_local).catch(() => undefined);
                  }
                  return {
                    ...f,
                    base64: base64Data,
                    imagem_base64: base64Data,
                  };
                })
              );
            }

            const relPayload = {
              ...lr,
              fotos: enrichedFotos,
            };

            const rRes = isTemp
              ? await apiClient.axios.post(endpoint, relPayload)
              : await apiClient.axios.put(endpoint, relPayload);

            const serverId = rRes?.data?.id || lr.id;
            const officialNumero = rRes?.data?.numero;
            const serverUuid = rRes?.data?.uuid || lr.uuid;

            if (isTemp && serverId && serverId !== lr.id) {
              syncedEntitiesInBatch.add(`relatorio_${serverId}`);
              if (serverUuid) syncedEntitiesInBatch.add(`relatorio_uuid_${serverUuid}`);
              await migrateLocalFotosRelatorioId(lr.id, serverId, serverUuid);
              await db.runAsync('DELETE FROM relatorios WHERE id = ?;', [serverId]);
              await db.runAsync(
                'UPDATE relatorios SET id = ?, numero = COALESCE(?, numero), sync_status = "synced", data_sincronizacao = ? WHERE id = ?',
                [serverId, officialNumero || null, new Date().toISOString(), lr.id]
              );
              await db.runAsync(
                "UPDATE sync_queue SET status = 'completed' WHERE entity_type = 'relatorio' AND (entity_id = ? OR entity_id = ?)",
                [lr.id, serverId]
              ).catch(() => null);
              console.log(`[SyncService] Proativo: Relatório local ${lr.id} migrado para ID servidor ${serverId} (${officialNumero})`);
            } else {
              await db.runAsync(
                'UPDATE relatorios SET sync_status = "synced", data_sincronizacao = ? WHERE id = ?',
                [new Date().toISOString(), lr.id]
              );
            }
            if (serverId) {
              await db.runAsync(
                "UPDATE fotos_relatorio SET sync_status = 'synced', base64 = '' WHERE relatorio_id = ? AND uri_local IS NOT NULL AND uri_local != ''",
                [serverId]
              ).catch(() => null);
            }
            syncedEntitiesInBatch.add(entityKey);
            if (uuidKey) syncedEntitiesInBatch.add(uuidKey);
            processedCount++;
          } catch (relSyncErr: any) {
            console.warn(`[SyncService] Proativo falhou para relatório ${lr.id}:`, relSyncErr?.message);
          }
        }
      } catch (err) {
        console.warn('[SyncService] Erro na varredura proativa de relatórios:', err);
      }

      // 1.7 Proactive Sync for Local Express Reports (including drafts / rascunhos)
      try {
        const db = await getDatabase();
        const pendingExp = await db.getAllAsync<any>(
          'SELECT * FROM relatorios_express WHERE sync_status = "pending" OR id >= 2000000000'
        );
        for (const exp of pendingExp) {
          try {
            const expEntityKey = `relatorio_express_${exp.id}`;
            if (syncedEntitiesInBatch.has(expEntityKey)) {
              continue;
            }

            const isTemp = exp.id >= 2000000000;
            const endpoint = '/api/relatorios-express/sync';

            const fotosExp = await getLocalFotosExpress(exp.id);
            let enrichedFotosExp: any[] = [];
            if (fotosExp && fotosExp.length > 0) {
              enrichedFotosExp = await Promise.all(
                fotosExp.map(async (f: any) => {
                  const alreadyOnServer = f.sync_status === 'synced' && f.id < 2000000000 && f.url && (f.url.includes('/uploads/') || f.url.startsWith('http'));
                  if (alreadyOnServer) {
                    return {
                      ...f,
                      base64: undefined,
                      imagem_base64: undefined,
                    };
                  }
                  let base64Data = f.base64 || f.imagem_base64;
                  if (!base64Data && f.uri_local && !f.uri_local.startsWith('http')) {
                    base64Data = await readPhotoBase64(f.uri_local).catch(() => undefined);
                  }
                  return {
                    ...f,
                    base64: base64Data,
                    imagem_base64: base64Data,
                  };
                })
              );
            }

            const expPayload = {
              ...exp,
              fotos: enrichedFotosExp,
            };

            const expRes = await apiClient.axios.post(endpoint, expPayload);
            const serverId = expRes?.data?.id || exp.id;
            const officialNumero = expRes?.data?.numero;

            // Verifica se o status mudou localmente (ex: aprovado pelo Admin enquanto o upload ocorria)
            const latestLocal = await db.getFirstAsync<{ status: string }>(
              'SELECT status FROM relatorios_express WHERE id = ? OR id = ?',
              [exp.id, serverId]
            );
            const statusChangedDuringSync = Boolean(latestLocal && latestLocal.status !== exp.status);
            const nextSyncStatus = statusChangedDuringSync ? 'pending' : 'synced';
            if (statusChangedDuringSync) {
              this.pendingResync = true;
            }

            if (isTemp && serverId && serverId !== exp.id) {
              syncedEntitiesInBatch.add(`relatorio_express_${serverId}`);
              await migrateLocalFotosRelatorioExpressId(exp.id, serverId);
              const existingTempRow = await db.getFirstAsync<{ id: number }>(
                'SELECT id FROM relatorios_express WHERE id = ?',
                [exp.id]
              );
              if (existingTempRow) {
                await db.runAsync('DELETE FROM relatorios_express WHERE id = ?;', [serverId]);
                await db.runAsync(
                  'UPDATE relatorios_express SET id = ?, numero = COALESCE(?, numero), sync_status = ?, updated_at = ? WHERE id = ?',
                  [serverId, officialNumero || null, nextSyncStatus, new Date().toISOString(), exp.id]
                );
              } else {
                await db.runAsync(
                  'UPDATE relatorios_express SET numero = COALESCE(?, numero), sync_status = ?, updated_at = ? WHERE id = ?',
                  [officialNumero || null, nextSyncStatus, new Date().toISOString(), serverId]
                );
              }
              // Atualiza o entity_id de itens pendentes de aprovação/rejeição sem descartá-los
              await db.runAsync(
                "UPDATE sync_queue SET entity_id = ? WHERE entity_type = 'relatorio_express' AND entity_id = ? AND status = 'pending'",
                [serverId, exp.id]
              ).catch(() => null);
              if (!statusChangedDuringSync) {
                await db.runAsync(
                  "UPDATE sync_queue SET status = 'completed' WHERE entity_type = 'relatorio_express' AND (entity_id = ? OR entity_id = ?) AND action NOT IN ('approve', 'reject', 'update_status')",
                  [exp.id, serverId]
                ).catch(() => null);
              }
              console.log(`[SyncService] Proativo: Relatório Express local ${exp.id} migrado para ID servidor ${serverId}`);
            } else {
              await db.runAsync(
                'UPDATE relatorios_express SET sync_status = ?, updated_at = ? WHERE id = ?',
                [nextSyncStatus, new Date().toISOString(), exp.id]
              );
            }
            if (serverId) {
              await db.runAsync(
                "UPDATE fotos_relatorio_express SET sync_status = 'synced', base64 = '' WHERE relatorio_express_id = ? AND uri_local IS NOT NULL AND uri_local != ''",
                [serverId]
              ).catch(() => null);
            }
            syncedEntitiesInBatch.add(expEntityKey);
            processedCount++;
          } catch (expSyncErr: any) {
            console.warn(`[SyncService] Proativo falhou para relatório express ${exp.id}:`, expSyncErr?.message);
          }
        }
      } catch (err) {
        console.warn('[SyncService] Erro na varredura proativa de relatórios express:', err);
      }

      // 2. Process Inbound Sync (Railway Server -> SQLite Local)
      // Pull only when explicitly requested (manual), on initial launch, or every 5 minutes (not after every single push)
      const shouldPull = manual || this.lastPullTimestamp === 0 || (Date.now() - this.lastPullTimestamp > 300000);
      if (shouldPull) {
        this.lastPullTimestamp = Date.now();
        await this.pullFromServer();
      }

      pendingCount = await this.getPendingCount();
      this.notify('idle', pendingCount);

      const msg = processedCount > 0
        ? `Sincronização concluída! ${processedCount} alteração(ões) enviada(s) com sucesso para o servidor.`
        : 'Sincronização concluída! Todos os dados estão atualizados no servidor.';

      if (this.wasOffline) {
        this.wasOffline = false;
        this.hasNotifiedOfflineSyncDone = true;
      }

      return { success: true, message: msg };
    } catch (err: any) {
      console.error('[SyncService] Global sync error:', err);
      pendingCount = await this.getPendingCount();
      this.notify('error', pendingCount);
      return { success: false, message: `Erro na sincronização: ${err.message}` };
    } finally {
      this.isSyncing = false;
      if (this.pendingResync) {
        const nextManual = this.pendingManualResync;
        this.pendingResync = false;
        this.pendingManualResync = false;
        setTimeout(() => {
          this.syncAll(nextManual).catch(() => null);
        }, 150);
      }
    }
  }

  /**
   * Puxa alterações remotas da nuvem (Railway) para o SQLite local em paralelo
   * com reconciliação bidirecional de exclusões.
   */
  private async pullFromServer(): Promise<void> {
    try {
      const db = await getDatabase();

      // Carrega IDs excluídos localmente (tombstones) e itens pendentes de exclusão na fila
      const [deletedProjects, deletedVisits, deletedReports, queueDeletes] = await Promise.all([
        getDeletedEntityIds('projeto'),
        getDeletedEntityIds('visita'),
        getDeletedEntityIds('relatorio'),
        db.getAllAsync<{ entity_type: string; entity_id: number }>(
          "SELECT entity_type, entity_id FROM sync_queue WHERE action = 'delete' OR method = 'DELETE'"
        ).catch(() => []),
      ]);
      for (const q of queueDeletes) {
        if (q.entity_type === 'projeto') deletedProjects.add(q.entity_id);
        if (q.entity_type === 'visita') deletedVisits.add(q.entity_id);
        if (q.entity_type === 'relatorio') deletedReports.add(q.entity_id);
      }

      // Dispara as requisições HTTP GET em paralelo para reduzir latência de rede em 70%
      const [
        projectsRes,
        visitsRes,
        reportsRes,
        remindersRes,
        expressRes,
        usersRes,
        visitantesRes,
      ] = await Promise.all([
        apiClient.axios.get('/api/projetos', { timeout: 8000 }).catch(() => null),
        apiClient.axios.get('/api/visits', { timeout: 8000 }).catch(() => null),
        apiClient.axios.get('/api/relatorios', { timeout: 12000 }).catch(() => null),
        apiClient.axios.get('/api/lembretes', { timeout: 8000 }).catch(() => null),
        apiClient.axios.get('/api/relatorios-express', { timeout: 10000 }).catch(() => null),
        apiClient.axios.get('/api/users', { timeout: 8000 }).catch(() => null),
        apiClient.axios.get('/api/visitantes', { timeout: 8000 }).catch(() => null),
      ]);

      // 1. Pull Projetos com Reconciliação de Exclusão
      if (projectsRes && Array.isArray(projectsRes.data)) {
        const serverProjects = projectsRes.data;
        const serverProjectIds = new Set(serverProjects.map((p: any) => p.id));

        {
          // A lista do servidor é a fonte da verdade: uma obra já sincronizada que não vem mais
          // (excluída por outro aparelho, pelo site ou numa limpeza da base) sai do aparelho,
          // desde que não haja relatório/visita local dessa obra aguardando envio.
          const localProjetos = await getLocalProjetos('Todos');
          for (const lp of localProjetos) {
            if (lp.id <= 0 || lp.id >= 2000000000 || lp.sync_status !== 'synced' || serverProjectIds.has(lp.id)) continue;
            let pendentes = 0;
            try {
              const r1 = await db.getFirstAsync<any>(
                "SELECT COUNT(*) AS n FROM relatorios WHERE projeto_id = ? AND (sync_status IS NULL OR sync_status != 'synced')", [lp.id]);
              const r2 = await db.getFirstAsync<any>(
                "SELECT COUNT(*) AS n FROM visitas WHERE projeto_id = ? AND (sync_status IS NULL OR sync_status != 'synced')", [lp.id]);
              pendentes = Number(r1?.n || 0) + Number(r2?.n || 0);
            } catch { pendentes = 1; }
            if (pendentes === 0 || deletedProjects.has(lp.id)) {
              console.log(`[SyncService] Obra ${lp.id} (${lp.nome}) não existe mais na nuvem. Apagando em cascata do aparelho.`);
              await deleteLocalProjetoCascade(lp.id);
            }
          }
        }

        for (const delId of deletedProjects) {
          if (!serverProjectIds.has(delId)) {
            await clearDeletedEntityLocally('projeto', delId);
          }
        }

        for (const p of serverProjects) {
          if (deletedProjects.has(p.id)) {
            continue;
          }
          try {
            const matchingPending = await db.getFirstAsync<any>(
              // Só reconcilia obras PROVISÓRIAS (criadas offline, ID temporário e ainda não sincronizadas).
              // Antes, qualquer obra local com o mesmo nome era fundida, fazendo obras homônimas sumirem do aparelho.
              `SELECT id FROM projetos WHERE id != ? AND (id <= 0 OR id >= 2000000000)
                AND (sync_status IS NULL OR sync_status != 'synced') AND (
                (numero IS NOT NULL AND numero != '' AND numero = ?) OR 
                (nome IS NOT NULL AND nome != '' AND LOWER(TRIM(nome)) = LOWER(TRIM(?)))
              ) LIMIT 1`,
              [p.id, p.numero, p.nome]
            );
            if (matchingPending) {
              console.log(`[SyncService] Reconciliando obra local ${matchingPending.id} com obra oficial ${p.id} (${p.numero})`);
              await migrateLocalProjetoId(matchingPending.id, p.id, p.numero);
            }
          } catch (recErr) {
            console.warn('[SyncService] Aviso de reconciliação de obra:', recErr);
          }
          await saveLocalProjeto(p, 'synced');
          ensureProjectFolders(p.nome, p.numero || p.codigo).catch(() => null);
        }
      }

      // 2. Pull Visitas com Reconciliação
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

        for (const delId of deletedVisits) {
          if (!serverVisitIds.has(delId)) {
            await clearDeletedEntityLocally('visita', delId);
          }
        }

        for (const v of serverVisits) {
          if (deletedVisits.has(v.id)) {
            continue;
          }
          await saveLocalVisita(v, 'synced');
        }
      }

      // 3. Pull Relatorios & Fotos com Reconciliação
      if (reportsRes && Array.isArray(reportsRes.data)) {
        const serverReports = reportsRes.data;
        const serverReportIds = new Set(serverReports.map((r: any) => r.id));

        const localReports = await getLocalRelatorios();
        const pendingLocalIds = new Set<number>();
        const pendingLocalUuids = new Set<string>();
        for (const lr of localReports) {
          if (lr.sync_status === 'pending') {
            pendingLocalIds.add(lr.id);
            if (lr.uuid) pendingLocalUuids.add(lr.uuid);
          }
          const isDraftLocal = ['em_andamento', 'preenchimento', 'Rascunho'].includes(String(lr.status)) || !lr.status;
          if (serverReports.length < 200 && !isDraftLocal && lr.sync_status === 'synced' && lr.id < 2000000000 && !serverReportIds.has(lr.id)) {
            console.log(`[SyncService] Relatório ${lr.id} (${lr.numero}) excluído na nuvem. Removendo do dispositivo.`);
            await db.runAsync('DELETE FROM fotos_relatorio WHERE relatorio_id = ?;', [lr.id]);
            await db.runAsync('DELETE FROM relatorios WHERE id = ?;', [lr.id]);
          }
        }

        for (const delId of deletedReports) {
          if (!serverReportIds.has(delId)) {
            await clearDeletedEntityLocally('relatorio', delId);
          }
        }

        for (const r of serverReports) {
          if (deletedReports.has(r.id)) {
            continue;
          }
          // Nunca sobrescreve alterações locais ainda não enviadas
          if (pendingLocalIds.has(r.id) || (r.uuid && pendingLocalUuids.has(r.uuid))) {
            continue;
          }
          await saveLocalRelatorio(r, 'synced');
          if (Array.isArray(r.fotos)) {
            const serverFotoIds = new Set(r.fotos.map((f: any) => f.id));
            const localFotos = await db.getAllAsync<{ id: number; filename?: string; uri_local?: string; sync_status: string }>(
              'SELECT id, filename, uri_local, sync_status FROM fotos_relatorio WHERE relatorio_id = ?',
              [r.id]
            );
            const localFotoById = new Map<number, { uri_local?: string }>();
            const localFotoByFilename = new Map<string, { uri_local?: string }>();
            for (const lf of localFotos) {
              if (lf.sync_status === 'synced' && lf.id < 2000000000 && !serverFotoIds.has(lf.id)) {
                await db.runAsync('DELETE FROM fotos_relatorio WHERE id = ?', [lf.id]);
              } else {
                localFotoById.set(lf.id, lf);
                if (lf.filename) localFotoByFilename.set(lf.filename, lf);
              }
            }

            for (const f of r.fotos) {
              const fullUrl = f.url?.startsWith('http')
                ? f.url
                : `https://elpandroid-production.up.railway.app${f.url?.startsWith('/') ? '' : '/'}${f.url}`;
              let targetUri = fullUrl;
              const existingFoto = localFotoById.get(f.id) || (f.filename ? localFotoByFilename.get(f.filename) : undefined);
              if (existingFoto?.uri_local && existingFoto.uri_local.startsWith('file://')) {
                targetUri = existingFoto.uri_local;
              }

              await saveLocalFoto({
                id: f.id,
                relatorio_id: r.id,
                relatorio_uuid: r.uuid,
                url: fullUrl,
                filename: f.filename,
                uri_local: targetUri,
                titulo: f.titulo || '',
                legenda: f.legenda || '',
                descricao: f.descricao || '',
                tipo_servico: f.tipo_servico || '',
                local: f.local || '',
                ordem: f.ordem || 0,
                base64: '',
                anotacoes_dados: typeof f.anotacoes_dados === 'object' ? JSON.stringify(f.anotacoes_dados) : (f.anotacoes_dados || ''),
                sync_status: 'synced',
              }, 'synced');
            }
          }
        }
      }

      // 4. Pull Lembretes com Reconciliação
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
      if (expressRes && Array.isArray(expressRes.data)) {
        const serverExpress = expressRes.data;
        const serverExpressIds = new Set(serverExpress.map((exp: any) => exp.id));

        const localExpress = await db.getAllAsync<{ id: number; numero?: string; sync_status: string }>(
          'SELECT id, numero, sync_status FROM relatorios_express'
        );
        const pendingExpressQueue = await db.getAllAsync<{ entity_id: number; payload: string }>(
          "SELECT entity_id, payload FROM sync_queue WHERE entity_type = 'relatorio_express' AND status IN ('pending', 'processing')"
        ).catch(() => []);

        const pendingExpressIds = new Set<number>();
        const pendingExpressNumeros = new Set<string>();

        for (const le of localExpress) {
          if (le.sync_status === 'pending') {
            pendingExpressIds.add(le.id);
            if (le.numero) pendingExpressNumeros.add(le.numero.trim().toUpperCase());
          }
          if (le.sync_status === 'synced' && le.id < 2000000000 && !serverExpressIds.has(le.id)) {
            await db.runAsync('DELETE FROM fotos_relatorio_express WHERE relatorio_express_id = ?;', [le.id]);
            await db.runAsync('DELETE FROM relatorios_express WHERE id = ?;', [le.id]);
          }
        }
        for (const pq of pendingExpressQueue) {
          if (pq.entity_id) pendingExpressIds.add(Number(pq.entity_id));
          try {
            const parsed = JSON.parse(pq.payload || '{}');
            if (parsed.id) pendingExpressIds.add(Number(parsed.id));
            if (parsed.numero) pendingExpressNumeros.add(String(parsed.numero).trim().toUpperCase());
          } catch {}
        }

        for (const exp of serverExpress) {
          const expNumNorm = exp.numero ? String(exp.numero).trim().toUpperCase() : '';
          if (pendingExpressIds.has(exp.id) || (expNumNorm && pendingExpressNumeros.has(expNumNorm))) {
            continue;
          }
          await saveLocalRelatorioExpress(exp, 'synced');
          if (Array.isArray(exp.fotos)) {
            const existingExpFotos = await db.getAllAsync<{ id: number; filename?: string; ordem?: number; uri_local?: string; anotacoes_dados?: string }>(
              'SELECT id, filename, ordem, uri_local, anotacoes_dados FROM fotos_relatorio_express WHERE relatorio_express_id = ?',
              [exp.id]
            );
            for (const f of exp.fotos) {
              const fullUrl = f.url?.startsWith('http')
                ? f.url
                : `https://elpandroid-production.up.railway.app${f.url?.startsWith('/') ? '' : '/'}${f.url}`;

              let targetUri = fullUrl;
              let preservedAnot = typeof f.anotacoes_dados === 'object' ? JSON.stringify(f.anotacoes_dados) : (f.anotacoes_dados || '');

              const existingFoto = existingExpFotos.find(
                (ef) => ef.id === f.id || (f.filename && ef.filename === f.filename) || (f.ordem !== undefined && ef.ordem === f.ordem)
              );
              if (existingFoto?.uri_local && existingFoto.uri_local.startsWith('file://')) {
                targetUri = existingFoto.uri_local;
              }
              if (existingFoto?.anotacoes_dados && !preservedAnot) {
                preservedAnot = existingFoto.anotacoes_dados;
              }
              if (existingFoto && existingFoto.id !== f.id && existingFoto.id >= 1000000000) {
                await db.runAsync('DELETE FROM fotos_relatorio_express WHERE id = ?', [existingFoto.id]);
              }

              await saveLocalFotoExpress({
                id: f.id,
                relatorio_express_id: exp.id,
                url: fullUrl,
                filename: f.filename,
                uri_local: targetUri,
                titulo: f.titulo || '',
                legenda: f.legenda || '',
                descricao: f.descricao || '',
                local: f.local || '',
                base64: '',
                anotacoes_dados: preservedAnot,
                ordem: f.ordem || 0,
                sync_status: 'synced',
              }, 'synced');
            }
          }
        }
      }

      // 6. Sincronizar usuários e equipe do servidor para o celular
      if (usersRes && Array.isArray(usersRes.data)) {
        await saveLocalUsers(usersRes.data).catch(() => null);
      }

      // 7. Sincronizar visitantes cadastrados para o celular
      if (visitantesRes && Array.isArray(visitantesRes.data)) {
        for (const vis of visitantesRes.data) {
          await saveLocalVisitante(vis, 'synced');
        }
      }

      // 8 & 9. Sincronizar notificações e configurações dinâmicas em paralelo
      await Promise.all([
        notificationService.syncServerNotifications().catch(() => null),
        screenConfigService.syncFromServer().catch(() => null),
      ]);
    } catch (pullErr) {
      console.warn('[SyncService] Inbound pull notice:', pullErr);
    }
  }
}

export const syncService = new SyncService();
