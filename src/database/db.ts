import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES_SQL, SEED_LEGENDAS, SEED_CHECKLIST } from './schema';
import { 
  Projeto, Visita, Relatorio, FotoRelatorio, 
  RelatorioExpress, FotoRelatorioExpress, 
  Contato, Lembrete, Notificacao, LegendaPredefinida, 
  SyncQueueItem, User, ChecklistCustomItem, ChecklistProgressoObra,
  VisitaParticipanteItem, ContatoObraItem
} from '../types';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function sanitizeSqlParams(params?: any): any {
  if (params === undefined || params === null) return [];
  if (Array.isArray(params)) {
    return params.map(p => (p === undefined ? null : p));
  }
  if (typeof params === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) {
      cleaned[k] = v === undefined ? null : v;
    }
    return cleaned;
  }
  return params;
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      try {
        const rawDb = await SQLite.openDatabaseAsync('obraflow.db');
        await rawDb.execAsync('PRAGMA foreign_keys = ON;');

        // Intercepta prepareAsync / runAsync / getAllAsync / getFirstAsync para blindar contra qualquer parâmetro 'undefined' ou query nula
        const origPrepare = rawDb.prepareAsync.bind(rawDb);
        (rawDb as any).prepareAsync = async (source: string) => {
          if (!source || typeof source !== 'string') {
            throw new Error(`[SQLite] Query inválida passada para prepareAsync: ${source}`);
          }
          return await origPrepare(source);
        };

        const origRun = rawDb.runAsync.bind(rawDb);
        (rawDb as any).runAsync = async (sql: string, ...args: any[]) => {
          if (!sql || typeof sql !== 'string') {
            throw new Error(`[SQLite] SQL inválido para runAsync: ${sql}`);
          }
          const sanitized = args.map(a => sanitizeSqlParams(a));
          return await (origRun as any)(sql, ...sanitized);
        };

        const origGetAll = rawDb.getAllAsync.bind(rawDb);
        (rawDb as any).getAllAsync = async (sql: string, ...args: any[]) => {
          if (!sql || typeof sql !== 'string') {
            throw new Error(`[SQLite] SQL inválido para getAllAsync: ${sql}`);
          }
          const sanitized = args.map(a => sanitizeSqlParams(a));
          return await (origGetAll as any)(sql, ...sanitized);
        };

        const origGetFirst = rawDb.getFirstAsync.bind(rawDb);
        (rawDb as any).getFirstAsync = async (sql: string, ...args: any[]) => {
          if (!sql || typeof sql !== 'string') {
            throw new Error(`[SQLite] SQL inválido para getFirstAsync: ${sql}`);
          }
          const sanitized = args.map(a => sanitizeSqlParams(a));
          return await (origGetFirst as any)(sql, ...sanitized);
        };

        await initDatabase(rawDb);
        dbInstance = rawDb;
        return rawDb;
      } catch (err) {
        dbInitPromise = null;
        throw err;
      }
    })();
  }
  return dbInitPromise;
}

async function initDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(CREATE_TABLES_SQL);

  // Migration: ensure can_view_others_drafts and notification_preferences exist in users
  try {
    await db.execAsync('ALTER TABLE users ADD COLUMN can_view_others_drafts INTEGER DEFAULT 0;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE users ADD COLUMN notification_preferences TEXT;');
  } catch {}

  // Migration: ensure base64 column exists in fotos_relatorio
  try {
    await db.execAsync('ALTER TABLE fotos_relatorio ADD COLUMN base64 TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE fotos_relatorio ADD COLUMN relatorio_uuid TEXT;');
  } catch {}

  // Migration: ensure base64, local and anotacoes_dados exist in fotos_relatorio_express
  try {
    await db.execAsync('ALTER TABLE fotos_relatorio_express ADD COLUMN base64 TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE fotos_relatorio_express ADD COLUMN local TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE fotos_relatorio_express ADD COLUMN anotacoes_dados TEXT;');
  } catch {}

  // Migration: ensure uuid and audit columns exist in relatorios
  try {
    await db.execAsync('ALTER TABLE relatorios ADD COLUMN uuid TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios ADD COLUMN data_criacao_local TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios ADD COLUMN data_sincronizacao TEXT;');
  } catch {}

  // Migration: ensure lock columns exist in relatorios para controle de preenchimento concorrente
  try {
    await db.execAsync('ALTER TABLE relatorios ADD COLUMN em_edicao_por_id INTEGER;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios ADD COLUMN em_edicao_por_nome TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios ADD COLUMN em_edicao_em TEXT;');
  } catch {}

  // Ensure deleted_entities table exists for tombstone reconciliation
  try {
    await db.execAsync('CREATE TABLE IF NOT EXISTS deleted_entities (entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, deleted_at TEXT NOT NULL, PRIMARY KEY (entity_type, entity_id));');
  } catch {}

  // Migrations para participantes da visita (cards com nome e função)
  try {
    await db.execAsync('ALTER TABLE visita_participantes ADD COLUMN nome TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE visita_participantes ADD COLUMN funcao TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE visita_participantes ADD COLUMN tipo TEXT;');
  } catch {}

  // Migrations para relatórios express (garantir todas as colunas mesmo em bancos existentes)
  try {
    await db.execAsync('ALTER TABLE relatorios_express ADD COLUMN updated_at TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios_express ADD COLUMN data_criacao_local TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios_express ADD COLUMN informacoes_tecnicas TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios_express ADD COLUMN checklist_data TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios_express ADD COLUMN acompanhantes TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios_express ADD COLUMN obra_construtora TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios_express ADD COLUMN obra_endereco TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios_express ADD COLUMN status TEXT DEFAULT "Em preenchimento";');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios_express ADD COLUMN comentario_aprovacao TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios_express ADD COLUMN aprovador_id INTEGER;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios_express ADD COLUMN aprovador_nome TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios_express ADD COLUMN sync_status TEXT DEFAULT "synced";');
  } catch {}
  
  // Migrations para persistência offline de contatos, checklist e dados técnicos
  try {
    await db.execAsync('ALTER TABLE projetos ADD COLUMN contatos TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE projetos ADD COLUMN checklist_data TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE contatos ADD COLUMN cargo TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE relatorios ADD COLUMN informacoes_tecnicas TEXT;');
  } catch {}
  
  // Seed/Sync legendas predefinidas garantindo todas as 12 categorias tecnicas solicitadas
  for (const leg of SEED_LEGENDAS) {
    try {
      const exists = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM legendas_predefinidas WHERE texto = ? LIMIT 1',
        [leg.texto]
      );
      if (!exists) {
        await db.runAsync(
          'INSERT INTO legendas_predefinidas (categoria, texto, ordem) VALUES (?, ?, ?)',
          [leg.categoria, leg.texto, leg.ordem]
        );
      }
    } catch {}
  }

  // Seed initial checklist template if empty and remove duplicate rows
  try {
    const chkCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM checklist_custom_template');
    if (!chkCount || chkCount.count === 0) {
      for (const it of SEED_CHECKLIST) {
        await db.runAsync(
          'INSERT INTO checklist_custom_template (item, ordem, ativo) VALUES (?, ?, 1)',
          [it.item, it.ordem]
        );
      }
    } else {
      // Limpeza preventiva de itens duplicados no template
      await db.runAsync(`
        DELETE FROM checklist_custom_template 
        WHERE id NOT IN (
          SELECT MIN(id) FROM checklist_custom_template GROUP BY LOWER(TRIM(item))
        )
      `);
    }
  } catch {}

  // Garante que todas as obras no SQLite tenham suas pastas físicas criadas imediatamente
  try {
    const { ensureAllProjectsFolders } = require('../services/appFilesService');
    ensureAllProjectsFolders().catch(() => null);
  } catch {}
}

// ================= USER =================
export async function saveLocalUser(user: User): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO users (
      id, username, email, is_master, is_aprovador_express, cargo, telefone, cor_agenda, ativo, can_view_others_drafts, notification_preferences
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      user.username,
      user.email,
      user.is_master ? 1 : 0,
      user.is_aprovador_express ? 1 : 0,
      user.cargo || '',
      user.telefone || '',
      user.cor_agenda || '#2563EB',
      user.ativo !== false ? 1 : 0,
      user.can_view_others_drafts ? 1 : 0,
      user.notification_preferences || null
    ]
  );
}

export async function getLocalUser(id: number): Promise<User | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>('SELECT * FROM users WHERE id = ?', [id]);
  if (!row) return null;
  return {
    ...row,
    is_master: Boolean(row.is_master),
    is_aprovador_express: Boolean(row.is_aprovador_express),
    ativo: Boolean(row.ativo),
    can_view_others_drafts: Boolean(row.can_view_others_drafts),
    notification_preferences: row.notification_preferences || null
  };
}

// ================= PROJETOS =================
function formatProjetoRow(p: any): Projeto {
  if (!p) return p;
  let parsedContatos: ContatoObraItem[] = [];
  if (p.contatos) {
    try {
      parsedContatos = typeof p.contatos === 'string' ? JSON.parse(p.contatos) : p.contatos;
    } catch {
      parsedContatos = [];
    }
  }
  return {
    ...p,
    contatos: Array.isArray(parsedContatos) ? parsedContatos : [],
  };
}

export async function getLocalProjetos(status?: string): Promise<Projeto[]> {
  const db = await getDatabase();
  let query = 'SELECT * FROM projetos';
  const params: any[] = [];
  if (status && status !== 'Todos') {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY id DESC';
  const rows = await db.getAllAsync<any>(query, params);
  return rows.map(formatProjetoRow);
}

export async function getNextProjectNumber(): Promise<string> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ numero: string }>('SELECT numero FROM projetos');
  let maxSeq = 0;
  for (const row of rows) {
    if (!row.numero) continue;
    const match = row.numero.match(/OBRA[-_ ]*(\d+)/i);
    if (match) {
      const val = parseInt(match[1], 10);
      if (!isNaN(val) && val > maxSeq) {
        maxSeq = val;
      }
    }
  }
  const nextSeq = maxSeq + 1;
  return `OBRA-${String(nextSeq).padStart(4, '0')}`;
}

export async function getLocalProjetoById(id: number): Promise<Projeto | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>('SELECT * FROM projetos WHERE id = ?', [id]);
  return row ? formatProjetoRow(row) : null;
}

export async function saveLocalProjeto(p: Projeto, syncStatus: 'synced' | 'pending' = 'synced'): Promise<void> {
  const db = await getDatabase();
  const contatosJson = p.contatos ? (typeof p.contatos === 'string' ? p.contatos : JSON.stringify(p.contatos)) : '[]';
  const checklistData = p.checklist_data ? (typeof p.checklist_data === 'string' ? p.checklist_data : JSON.stringify(p.checklist_data)) : '';

  await db.runAsync(
    `INSERT OR REPLACE INTO projetos (
      id, numero, nome, descricao, endereco, latitude, longitude, tipo_obra, 
      construtora, nome_funcionario, responsavel_id, email_principal, data_inicio, 
      data_previsao_fim, status, numeracao_inicial, created_at, elementos_construtivos_base,
      especificacao_chapisco_colante, especificacao_chapisco_alvenaria, especificacao_argamassa_emboco,
      forma_aplicacao_argamassa, acabamentos_revestimento, acabamento_peitoris, acabamento_muretas,
      definicao_frisos_cor, definicao_face_inferior_abas, observacoes_projeto_fachada, 
      outras_observacoes, contatos, checklist_data, sync_status, local_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.id, p.numero, p.nome, p.descricao || '', p.endereco || '', p.latitude || null, p.longitude || null,
      p.tipo_obra, p.construtora, p.nome_funcionario, p.responsavel_id, p.email_principal,
      p.data_inicio || null, p.data_previsao_fim || null, p.status || 'Ativo', p.numeracao_inicial || 1,
      p.created_at || new Date().toISOString(), p.elementos_construtivos_base || '',
      p.especificacao_chapisco_colante || '', p.especificacao_chapisco_alvenaria || '',
      p.especificacao_argamassa_emboco || '', p.forma_aplicacao_argamassa || '',
      p.acabamentos_revestimento || '', p.acabamento_peitoris || '', p.acabamento_muretas || '',
      p.definicao_frisos_cor || '', p.definicao_face_inferior_abas || '',
      p.observacoes_projeto_fachada || '', p.outras_observacoes || '',
      contatosJson, checklistData,
      syncStatus, new Date().toISOString()
    ]
  );

  // Também persiste contatos individuais na tabela 'contatos' para que getLocalContatos(p.id) os encontre
  if (p.contatos && Array.isArray(p.contatos) && p.contatos.length > 0) {
    for (let i = 0; i < p.contatos.length; i++) {
      const c = p.contatos[i];
      const contatoId = c.id || (Number(p.id) * 1000 + (i + 1));
      await db.runAsync(
        `INSERT OR REPLACE INTO contatos (id, nome, email, telefone, empresa, cargo, projeto_id, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [contatoId, c.nome, c.email || '', c.telefone || '', c.empresa || '', c.cargo || '', p.id, syncStatus]
      ).catch(() => null);
    }
  }

  // Garante que a pasta física da obra seja criada imediatamente no aparelho
  try {
    const { ensureProjectFolders } = require('../services/appFilesService');
    ensureProjectFolders(p.nome, p.numero || (p as any).codigo).catch(() => null);
  } catch {}
}

// ================= TOMBSTONES / EXCLUSÕES =================
export async function markEntityDeletedLocally(entityType: string, entityId: number): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      'INSERT OR REPLACE INTO deleted_entities (entity_type, entity_id, deleted_at) VALUES (?, ?, ?)',
      [entityType, entityId, new Date().toISOString()]
    );
  } catch (err) {
    console.warn(`[DB] Erro ao marcar entidade ${entityType}:${entityId} como deletada:`, err);
  }
}

export async function isEntityDeletedLocally(entityType: string, entityId: number): Promise<boolean> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ entity_id: number }>(
      'SELECT entity_id FROM deleted_entities WHERE entity_type = ? AND entity_id = ?',
      [entityType, entityId]
    );
    return Boolean(row);
  } catch {
    return false;
  }
}

export async function getDeletedEntityIds(entityType: string): Promise<Set<number>> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ entity_id: number }>(
      'SELECT entity_id FROM deleted_entities WHERE entity_type = ?',
      [entityType]
    );
    return new Set(rows.map(r => r.entity_id));
  } catch {
    return new Set();
  }
}

export async function clearDeletedEntityLocally(entityType: string, entityId: number): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      'DELETE FROM deleted_entities WHERE entity_type = ? AND entity_id = ?',
      [entityType, entityId]
    );
  } catch (err) {
    console.warn(`[DB] Erro ao limpar tombstone ${entityType}:${entityId}:`, err);
  }
}

export async function deleteLocalProjetoCascade(projetoId: number): Promise<void> {
  const db = await getDatabase();
  
  // Marca tombstone para evitar ressuscitação pelo pullFromServer
  await markEntityDeletedLocally('projeto', projetoId);

  // 1. Fotos dos relatórios vinculados à obra
  await db.runAsync(
    'DELETE FROM fotos_relatorio WHERE relatorio_id IN (SELECT id FROM relatorios WHERE projeto_id = ?);',
    [projetoId]
  );

  // 2. Relatórios da obra
  await db.runAsync('DELETE FROM relatorios WHERE projeto_id = ?;', [projetoId]);

  // 3. Participantes de visitas e visitas da obra
  await db.runAsync(
    'DELETE FROM visita_participantes WHERE visita_id IN (SELECT id FROM visitas WHERE projeto_id = ?);',
    [projetoId]
  );
  await db.runAsync('DELETE FROM visitas WHERE projeto_id = ?;', [projetoId]);

  // 4. Lembretes da obra
  await db.runAsync('DELETE FROM lembretes WHERE projeto_id = ?;', [projetoId]);

  // 5. Contatos vinculados à obra
  await db.runAsync('DELETE FROM contatos WHERE projeto_id = ?;', [projetoId]);

  // 6. Categorias personalizadas da obra
  await db.runAsync('DELETE FROM categorias_obra WHERE projeto_id = ?;', [projetoId]);

  // 7. Fila de sincronização desta obra
  await db.runAsync('DELETE FROM sync_queue WHERE entity_type = "projeto" AND entity_id = ?;', [projetoId]);

  // 8. Checklist de progresso da obra
  try {
    await db.runAsync('DELETE FROM checklist_obra_progresso WHERE projeto_id = ?;', [projetoId]);
  } catch {}

  // 9. Registro da Obra
  await db.runAsync('DELETE FROM projetos WHERE id = ?;', [projetoId]);
}

// ================= VISITAS =================
export async function getNextVisitNumber(): Promise<string> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ numero: string }>('SELECT numero FROM visitas');
  let maxSeq = 0;
  for (const row of rows) {
    if (!row.numero) continue;
    const match = row.numero.match(/VIS(?:IT)?[-_ ]*(\d+)/i);
    if (match) {
      const val = parseInt(match[1], 10);
      if (!isNaN(val) && val > maxSeq) {
        maxSeq = val;
      }
    }
  }
  const nextSeq = maxSeq + 1;
  return `VISIT-${String(nextSeq).padStart(4, '0')}`;
}

export async function getVisitaParticipantes(visitaId: number): Promise<VisitaParticipanteItem[]> {
  const db = await getDatabase();
  try {
    return await db.getAllAsync<VisitaParticipanteItem>(
      'SELECT id, user_id, nome, funcao, tipo FROM visita_participantes WHERE visita_id = ? ORDER BY id ASC',
      [visitaId]
    );
  } catch {
    return [];
  }
}

export async function saveVisitaParticipantes(visitaId: number, participantes: VisitaParticipanteItem[]): Promise<void> {
  const db = await getDatabase();
  try {
    await db.runAsync('DELETE FROM visita_participantes WHERE visita_id = ?', [visitaId]);
    for (const p of participantes) {
      await db.runAsync(
        'INSERT INTO visita_participantes (visita_id, user_id, nome, funcao, tipo, confirmado) VALUES (?, ?, ?, ?, ?, ?)',
        [visitaId, p.user_id || null, p.nome || '', p.funcao || '', p.tipo || 'usuario', 0]
      );
    }
  } catch (e) {
    console.warn('[DB] Erro ao salvar participantes da visita:', e);
  }
}

export async function getLocalVisitas(projetoId?: number): Promise<Visita[]> {
  const db = await getDatabase();
  let query = 'SELECT * FROM visitas';
  const params: any[] = [];
  if (projetoId) {
    query += ' WHERE projeto_id = ?';
    params.push(projetoId);
  }
  query += ' ORDER BY data_inicio DESC';
  const rows = await db.getAllAsync<any>(query, params);
  
  const visits: Visita[] = [];
  for (const r of rows) {
    const parts = await getVisitaParticipantes(r.id);
    visits.push({
      ...r,
      is_pessoal: Boolean(r.is_pessoal),
      participantes_detalhes: parts
    });
  }
  return visits;
}

export async function getLocalVisitaById(id: number): Promise<Visita | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>('SELECT * FROM visitas WHERE id = ?', [id]);
  if (!row) return null;
  const parts = await getVisitaParticipantes(row.id);
  return { 
    ...row, 
    is_pessoal: Boolean(row.is_pessoal),
    participantes_detalhes: parts
  };
}

export async function saveLocalVisita(v: Visita, syncStatus: 'synced' | 'pending' = 'synced'): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO visitas (
      id, numero, projeto_id, projeto_nome, projeto_outros, responsavel_id,
      responsavel_nome, data_inicio, data_fim, data_realizada, observacoes,
      atividades_realizadas, status, endereco_gps, latitude, longitude, is_pessoal, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      v.id, v.numero, v.projeto_id || null, v.projeto_nome || '', v.projeto_outros || '',
      v.responsavel_id, v.responsavel_nome || '', v.data_inicio, v.data_fim,
      v.data_realizada || null, v.observacoes || '', v.atividades_realizadas || '',
      v.status || 'Agendada', v.endereco_gps || '', v.latitude || null,
      v.longitude || null, v.is_pessoal ? 1 : 0, syncStatus
    ]
  );

  if (v.participantes_detalhes && Array.isArray(v.participantes_detalhes)) {
    await saveVisitaParticipantes(v.id, v.participantes_detalhes);
  }
}

export async function deleteLocalVisita(id: number): Promise<void> {
  const db = await getDatabase();
  await markEntityDeletedLocally('visita', id);
  await db.runAsync('DELETE FROM visita_participantes WHERE visita_id = ?;', [id]);
  await db.runAsync('DELETE FROM visitas WHERE id = ?;', [id]);
  await db.runAsync('DELETE FROM sync_queue WHERE entity_type = "visita" AND entity_id = ? AND action != "delete";', [id]);
}

// ================= RELATORIOS =================
export async function getLocalRelatorios(projetoId?: number, currentUser?: User | null): Promise<Relatorio[]> {
  const db = await getDatabase();
  // IMPORTANTE: GROUP BY r.id (chave primária) para não perder rascunhos com mesmo uuid/numero
  let query = 'SELECT r.*, COUNT(f.id) as fotos_count FROM relatorios r LEFT JOIN fotos_relatorio f ON r.id = f.relatorio_id';
  const conditions: string[] = [];
  const params: any[] = [];
  if (projetoId) {
    conditions.push('r.projeto_id = ?');
    params.push(projetoId);
  }
  const isMasterOrAdmin = Boolean(
    currentUser?.is_master ||
    currentUser?.cargo?.toLowerCase() === 'administrador' ||
    currentUser?.cargo?.toLowerCase() === 'master' ||
    currentUser?.username?.toLowerCase() === 'admin'
  );
  if (currentUser && !isMasterOrAdmin && !currentUser.can_view_others_drafts) {
    conditions.push("(r.status NOT IN ('em_andamento', 'preenchimento', 'Rascunho') OR r.autor_id = ?)");
    params.push(currentUser.id);
  }
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' GROUP BY r.id ORDER BY CASE WHEN r.status = \'em_andamento\' THEN 0 ELSE 1 END ASC, COALESCE(NULLIF(r.data_criacao_local, ""), NULLIF(r.created_at, ""), NULLIF(r.updated_at, ""), NULLIF(r.data_sincronizacao, ""), r.data_relatorio) DESC, r.id DESC';
  return await db.getAllAsync<Relatorio>(query, params);
}

export async function getLocalRelatorioById(id: number): Promise<Relatorio | null> {
  const db = await getDatabase();
  return await db.getFirstAsync<Relatorio>('SELECT * FROM relatorios WHERE id = ?', [id]);
}

export async function getActiveDraft(projetoId: number, autorId: number): Promise<Relatorio | null> {
  const db = await getDatabase();
  // Busca o rascunho mais recente em andamento deste autor nesta obra
  return await db.getFirstAsync<Relatorio>(
    `SELECT * FROM relatorios 
     WHERE projeto_id = ? AND autor_id = ? AND status = 'em_andamento' 
     ORDER BY COALESCE(updated_at, data_criacao_local, data_relatorio) DESC, id DESC 
     LIMIT 1`,
    [projetoId, autorId]
  );
}

export async function saveLocalRelatorio(r: Relatorio, syncStatus: 'synced' | 'pending' = 'synced'): Promise<void> {
  const db = await getDatabase();
  const safeId = Number(r.id) || Date.now();
  const safeUuid = String(r.uuid || r.uuid_local || `rel_uuid_${safeId}`);

  // Deduplicação segura: apenas reconcilia se UUID do registro DIFERENTE do ID atual
  // Evita apagar registros legítimos quando IDs locais temporários coincidem
  try {
    if (safeUuid && safeUuid.length > 0) {
      const byUuid = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM relatorios WHERE uuid = ? AND id != ?', 
        [safeUuid, safeId]
      );
      if (byUuid && byUuid.id) {
        // Migra fotos do registro duplicado para o atual
        await db.runAsync('UPDATE fotos_relatorio SET relatorio_id = ? WHERE relatorio_id = ?', [safeId, byUuid.id]);
        await db.runAsync('DELETE FROM relatorios WHERE id = ?', [byUuid.id]);
        console.log(`[db] Dedup: registro ${byUuid.id} mesclado no ${safeId}`);
      }
    }
  } catch (dedupErr) {
    console.warn('[db] Aviso na deduplicação de relatório:', dedupErr);
  }

  const safeNumero = String(r.numero || `REL-${safeId}`);
  const safeProjetoId = Number(r.projeto_id) || 0;
  const safeTitulo = String(r.titulo || 'Relatório de Obra');
  const now = new Date().toISOString();
  const safeDataRelatorio = String(r.data_relatorio || now.substring(0, 10));
  const safeChecklistData = typeof r.checklist_data === 'string' ? r.checklist_data : JSON.stringify(r.checklist_data || []);
  const safeAcompanhantes = typeof r.acompanhantes === 'string' ? r.acompanhantes : JSON.stringify(r.acompanhantes || []);
  const safeTechInfo = r.informacoes_tecnicas
    ? (typeof r.informacoes_tecnicas === 'string' ? r.informacoes_tecnicas : JSON.stringify(r.informacoes_tecnicas))
    : null;

  await db.runAsync(
    `INSERT OR REPLACE INTO relatorios (
      id, numero, numero_projeto, titulo, projeto_id, projeto_nome, visita_id,
      autor_id, autor_nome, aprovador_id, aprovador_nome, data_relatorio,
      data_aprovacao, conteudo, descricao, checklist_data, categoria, local,
      lembrete_proxima_visita, observacoes_finais, status, comentario_aprovacao,
      acompanhantes, created_at, updated_at, uuid, data_criacao_local, data_sincronizacao,
      informacoes_tecnicas, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      safeId,
      safeNumero,
      r.numero_projeto ? Number(r.numero_projeto) : null,
      safeTitulo,
      safeProjetoId,
      String(r.projeto_nome || 'Obra'),
      r.visita_id ? Number(r.visita_id) : null,
      Number(r.autor_id) || 1,
      String(r.autor_nome || 'Responsável'),
      r.aprovador_id ? Number(r.aprovador_id) : null,
      String(r.aprovador_nome || ''),
      safeDataRelatorio,
      r.data_aprovacao ? String(r.data_aprovacao) : null,
      String(r.conteudo || ''),
      String(r.descricao || ''),
      safeChecklistData,
      String(r.categoria || ''),
      String(r.local || ''),
      r.lembrete_proxima_visita ? String(r.lembrete_proxima_visita) : null,
      String(r.observacoes_finais || ''),
      String(r.status || 'em_andamento'),
      String(r.comentario_aprovacao || ''),
      safeAcompanhantes,
      String(r.created_at || now),
      String(r.updated_at || now),
      safeUuid,
      String(r.data_criacao_local || r.created_at || now),
      r.data_sincronizacao ? String(r.data_sincronizacao) : null,
      safeTechInfo,
      String(syncStatus || r.sync_status || 'pending')
    ]
  );
}

export async function updateLocalRelatorioNumero(
  id: number,
  officialNumero: string,
  syncedAt?: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE relatorios SET numero = ?, sync_status = "synced", data_sincronizacao = ?, updated_at = ? WHERE id = ?`,
    [officialNumero, syncedAt || new Date().toISOString(), new Date().toISOString(), id]
  );
}

export async function updateLocalRelatorioStatus(
  id: number, 
  status: string, 
  comentario: string = '', 
  aprovadorId?: number, 
  aprovadorNome?: string,
  syncStatus: 'synced' | 'pending' = 'pending'
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE relatorios SET status = ?, comentario_aprovacao = ?, aprovador_id = COALESCE(?, aprovador_id),
     aprovador_nome = COALESCE(?, aprovador_nome), data_aprovacao = ?, sync_status = ?, updated_at = ?
     WHERE id = ?`,
    [status, comentario, aprovadorId || null, aprovadorNome || null, new Date().toISOString(), syncStatus, new Date().toISOString(), id]
  );
}

export async function deleteLocalRelatorio(id: number): Promise<void> {
  const db = await getDatabase();
  await markEntityDeletedLocally('relatorio', id);
  await db.runAsync('DELETE FROM fotos_relatorio WHERE relatorio_id = ?', [id]);
  await db.runAsync('DELETE FROM relatorios WHERE id = ?', [id]);
  await db.runAsync('DELETE FROM sync_queue WHERE entity_type = "relatorio" AND entity_id = ? AND action != "delete";', [id]);
}

export async function getNextReportNumberForProject(projectId: number): Promise<string> {
  const db = await getDatabase();
  const proj = await db.getFirstAsync<{ numeracao_inicial?: number }>('SELECT numeracao_inicial FROM projetos WHERE id = ?', [projectId]);
  const startNum = proj?.numeracao_inicial && proj.numeracao_inicial > 0 ? proj.numeracao_inicial : 1;
  const rows = await db.getAllAsync<{ numero: string }>('SELECT numero FROM relatorios WHERE projeto_id = ?', [projectId]);
  let maxSeq = startNum - 1;
  for (const row of rows) {
    if (!row.numero) continue;
    const match = row.numero.match(/REL[-_ ]*(\d+)/i);
    if (match) {
      const val = parseInt(match[1], 10);
      if (!isNaN(val) && val > maxSeq) {
        maxSeq = val;
      }
    }
  }
  const nextSeq = maxSeq + 1;
  return `REL-${String(nextSeq).padStart(4, '0')}`;
}

// ================= FOTOS =================

export async function getLocalFotos(relatorioId: number, relatorioUuid?: string): Promise<FotoRelatorio[]> {
  const db = await getDatabase();
  let rows: FotoRelatorio[] = [];
  if (relatorioUuid) {
    rows = await db.getAllAsync<FotoRelatorio>(
      'SELECT * FROM fotos_relatorio WHERE relatorio_id = ? OR (relatorio_uuid IS NOT NULL AND relatorio_uuid = ?) ORDER BY ordem ASC, id ASC',
      [relatorioId, relatorioUuid]
    );
  } else {
    rows = await db.getAllAsync<FotoRelatorio>(
      'SELECT * FROM fotos_relatorio WHERE relatorio_id = ? ORDER BY ordem ASC, id ASC',
      [relatorioId]
    );
  }

  // Deduplicação segura e não-destrutiva: mescla apenas fotos comprovadamente idênticas
  const seenById = new Map<number, FotoRelatorio>();
  const seenByUri = new Map<string, FotoRelatorio>();
  const seenByB64 = new Map<string, FotoRelatorio>();
  const result: FotoRelatorio[] = [];

  for (const f of rows) {
    const uriKey = (f.uri_local && f.uri_local.startsWith('file://')) ? f.uri_local.trim() : '';
    const b64Key = (f.base64 && f.base64.length > 100) ? f.base64.substring(0, 80) : '';

    let existing: FotoRelatorio | undefined;
    if (f.id && seenById.has(f.id)) {
      existing = seenById.get(f.id);
    } else if (uriKey && seenByUri.has(uriKey)) {
      existing = seenByUri.get(uriKey);
    } else if (b64Key && seenByB64.has(b64Key)) {
      existing = seenByB64.get(b64Key);
    }

    if (existing) {
      // Mescla priorizando a foto que tiver uri_local nativo file:// ou base64
      if (f.uri_local && f.uri_local.startsWith('file://')) {
        existing.uri_local = f.uri_local;
      }
      if (!existing.base64 && f.base64) existing.base64 = f.base64;
      if (!existing.legenda && f.legenda) existing.legenda = f.legenda;
      if (!existing.anotacoes_dados && f.anotacoes_dados) existing.anotacoes_dados = f.anotacoes_dados;
      if (f.id && f.id < 2000000000) existing.id = f.id;
      if (f.url) existing.url = f.url;
    } else {
      result.push(f);
      if (f.id) seenById.set(f.id, f);
      if (uriKey) seenByUri.set(uriKey, f);
      if (b64Key) seenByB64.set(b64Key, f);
    }
  }

  return result.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
}

export async function saveLocalFoto(f: FotoRelatorio, syncStatus: 'synced' | 'pending' = 'synced'): Promise<void> {
  const db = await getDatabase();
  let finalBase64 = f.base64 || '';
  if (!finalBase64 && f.id) {
    try {
      const existing = await db.getFirstAsync<{ base64?: string }>('SELECT base64 FROM fotos_relatorio WHERE id = ?', [f.id]);
      if (existing?.base64) {
        finalBase64 = existing.base64;
      }
    } catch {}
  }
  // Se ainda não tiver base64 e tiver arquivo local, lê diretamente do arquivo para salvar no SQLite
  if (!finalBase64 && f.uri_local && !f.uri_local.startsWith('http')) {
    try {
      const { readPhotoBase64 } = require('../services/imageService');
      const b64Read = await readPhotoBase64(f.uri_local);
      if (b64Read) {
        finalBase64 = b64Read;
      }
    } catch {}
  }

  // Deduplicação no SQLite: se já existe foto com mesmo filename ou mesma uri_local no relatório, limpa o ID duplicado
  try {
    if (f.relatorio_id) {
      const fotoId = f.id || 0;
      if (f.filename && f.filename.length > 3) {
        await db.runAsync(
          'DELETE FROM fotos_relatorio WHERE relatorio_id = ? AND id != ? AND filename = ?',
          [f.relatorio_id, fotoId, f.filename]
        );
      }
      if (f.uri_local && f.uri_local.startsWith('file://')) {
        await db.runAsync(
          'DELETE FROM fotos_relatorio WHERE relatorio_id = ? AND id != ? AND uri_local = ?',
          [f.relatorio_id, fotoId, f.uri_local]
        );
      }
      if (fotoId && fotoId < 2000000000) {
        await db.runAsync(
          'DELETE FROM fotos_relatorio WHERE relatorio_id = ? AND id >= 2000000000 AND ordem = ?',
          [f.relatorio_id, f.ordem || 0]
        );
      }
    }
  } catch (cleanErr) {
    console.warn('[db] Aviso de limpeza de duplicatas:', cleanErr);
  }

  const safeId = Number(f.id) || Date.now();
  const safeRelId = Number(f.relatorio_id) || 0;

  await db.runAsync(
    `INSERT OR REPLACE INTO fotos_relatorio (
      id, relatorio_id, relatorio_uuid, url, filename, uri_local, titulo, legenda, descricao,
      tipo_servico, local, ordem, anotacoes_dados, base64, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      safeId,
      safeRelId,
      f.relatorio_uuid ? String(f.relatorio_uuid) : null,
      String(f.url || ''),
      String(f.filename || ''),
      String(f.uri_local || ''),
      String(f.titulo || ''),
      String(f.legenda || ''),
      String(f.descricao || ''),
      String(f.tipo_servico || ''),
      String(f.local || ''),
      Number(f.ordem) || 0,
      String(f.anotacoes_dados || ''),
      String(finalBase64 || ''),
      String(syncStatus || f.sync_status || 'pending')
    ]
  );
}

/** Migra fotos no SQLite quando o ID provisório do relatório muda para o ID definitivo do servidor */
export async function migrateLocalFotosRelatorioId(oldRelatorioId: number, newRelatorioId: number, uuid?: string): Promise<void> {
  if (!oldRelatorioId || !newRelatorioId) return;
  const db = await getDatabase();
  try {
    if (uuid) {
      await db.runAsync(
        'UPDATE fotos_relatorio SET relatorio_id = ?, relatorio_uuid = ? WHERE relatorio_id = ? OR relatorio_uuid = ?',
        [newRelatorioId, uuid, oldRelatorioId, uuid]
      );
    } else {
      await db.runAsync('UPDATE fotos_relatorio SET relatorio_id = ? WHERE relatorio_id = ?', [newRelatorioId, oldRelatorioId]);
    }
    console.log(`[db] Fotos migradas no SQLite de ${oldRelatorioId} para ${newRelatorioId} (uuid: ${uuid || 'none'})`);
  } catch (err) {
    console.warn('[db] Erro ao migrar fotos entre relatórios:', err);
  }
}

/** Migra fotos express no SQLite quando o ID provisório do relatório muda para o ID do servidor */
export async function migrateLocalFotosRelatorioExpressId(oldRelatorioId: number, newRelatorioId: number): Promise<void> {
  if (!oldRelatorioId || !newRelatorioId || oldRelatorioId === newRelatorioId) return;
  const db = await getDatabase();
  try {
    await db.runAsync('UPDATE fotos_relatorio_express SET relatorio_express_id = ? WHERE relatorio_express_id = ?', [newRelatorioId, oldRelatorioId]);
    console.log(`[db] Fotos express migradas no SQLite de ${oldRelatorioId} para ${newRelatorioId}`);
  } catch (err) {
    console.warn('[db] Erro ao migrar fotos express:', err);
  }
}

/** Atualiza especificações técnicas de uma obra no banco local SQLite */
export async function updateLocalProjetoInfoTecnica(
  projetoId: number,
  info: {
    elementos_construtivos_base?: string;
    especificacao_chapisco_colante?: string;
    especificacao_chapisco_alvenaria?: string;
    especificacao_argamassa_emboco?: string;
    forma_aplicacao_argamassa?: string;
    acabamentos_revestimento?: string;
    acabamento_peitoris?: string;
    acabamento_muretas?: string;
    definicao_frisos_cor?: string;
    definicao_face_inferior_abas?: string;
    observacoes_projeto_fachada?: string;
    outras_observacoes?: string;
  }
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE projetos SET
      elementos_construtivos_base = ?,
      especificacao_chapisco_colante = ?,
      especificacao_chapisco_alvenaria = ?,
      especificacao_argamassa_emboco = ?,
      forma_aplicacao_argamassa = ?,
      acabamentos_revestimento = ?,
      acabamento_peitoris = ?,
      acabamento_muretas = ?,
      definicao_frisos_cor = ?,
      definicao_face_inferior_abas = ?,
      observacoes_projeto_fachada = ?,
      outras_observacoes = ?,
      local_updated_at = ?
    WHERE id = ?`,
    [
      info.elementos_construtivos_base || null,
      info.especificacao_chapisco_colante || null,
      info.especificacao_chapisco_alvenaria || null,
      info.especificacao_argamassa_emboco || null,
      info.forma_aplicacao_argamassa || null,
      info.acabamentos_revestimento || null,
      info.acabamento_peitoris || null,
      info.acabamento_muretas || null,
      info.definicao_frisos_cor || null,
      info.definicao_face_inferior_abas || null,
      info.observacoes_projeto_fachada || null,
      info.outras_observacoes || null,
      new Date().toISOString(),
      Number(projetoId)
    ]
  );
}

export async function getLocalUsers(): Promise<User[]> {
  const db = await getDatabase();
  try {
    const rows = await db.getAllAsync<any>('SELECT * FROM users ORDER BY username ASC');
    return rows.map(r => ({
      ...r,
      is_master: Boolean(r.is_master),
      is_aprovador_express: Boolean(r.is_aprovador_express),
      ativo: Boolean(r.ativo),
      can_view_others_drafts: Boolean(r.can_view_others_drafts),
      notification_preferences: r.notification_preferences || null
    }));
  } catch {
    return [];
  }
}

export async function saveLocalUsers(users: User[]): Promise<void> {
  const db = await getDatabase();
  for (const u of users) {
    await db.runAsync(
      `INSERT OR REPLACE INTO users (
        id, username, email, nome_completo, is_master, is_aprovador_express,
        cargo, telefone, cor_agenda, ativo, primeiro_login, tipo_acesso, created_at,
        can_view_others_drafts, notification_preferences
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(u.id) || Date.now(),
        String(u.username || ''),
        String(u.email || ''),
        String(u.nome_completo || u.username || ''),
        u.is_master ? 1 : 0,
        u.is_aprovador_express ? 1 : 0,
        String(u.cargo || ''),
        String(u.telefone || ''),
        String(u.cor_agenda || ''),
        u.ativo !== false ? 1 : 0,
        u.primeiro_login ? 1 : 0,
        String(u.tipo_acesso || 'funcionario'),
        String(u.created_at || new Date().toISOString()),
        u.can_view_others_drafts ? 1 : 0,
        u.notification_preferences || null
      ]
    );
  }
}

export async function deleteLocalFoto(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM fotos_relatorio WHERE id = ?', [id]);
}

// ================= RELATORIOS EXPRESS =================
export async function getNextExpressReportNumber(): Promise<string> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ numero: string; titulo?: string }>('SELECT numero, titulo FROM relatorios_express');
  if (!rows || rows.length === 0) {
    return 'EXP-0000';
  }

  let maxSeq = -1;
  for (const row of rows) {
    const candidateStrings = [row.numero, row.titulo].filter(Boolean) as string[];
    for (const raw of candidateStrings) {
      if (!raw) continue;
      const trimmed = raw.trim();
      // Legacy format EXP-YYYY-NNNN
      const matchLegacyYear = trimmed.match(/EXP-\d{4}-(\d+)/i);
      if (matchLegacyYear) {
        const val = parseInt(matchLegacyYear[1], 10);
        if (!isNaN(val) && val > maxSeq) {
          maxSeq = val;
        }
        continue;
      }
      // Standard format EXP-NNNN
      const matchStandard = trimmed.match(/EXP-(\d+)/i);
      if (matchStandard) {
        const val = parseInt(matchStandard[1], 10);
        if (!isNaN(val)) {
          // Discard year bug sequences (e.g. 2026, 2027)
          if (val >= 1900 && val <= 2099) {
            continue;
          }
          if (val > maxSeq) {
            maxSeq = val;
          }
        }
        continue;
      }
      // General fallback: trailing digits if contains EXP
      const matchEnd = trimmed.match(/EXP.*?(\d+)$/i);
      if (matchEnd) {
        const val = parseInt(matchEnd[1], 10);
        if (!isNaN(val) && val < 1900 && val > maxSeq) {
          maxSeq = val;
        }
      }
    }
  }

  if (maxSeq < 0) {
    return 'EXP-0000';
  }

  const nextSeq = maxSeq + 1;
  return `EXP-${String(nextSeq).padStart(4, '0')}`;
}

export async function getLocalRelatoriosExpress(currentUser?: User | null): Promise<RelatorioExpress[]> {
  try {
    const db = await getDatabase();
    let query = `
      SELECT r.*, COUNT(f.id) as fotos_count 
      FROM relatorios_express r 
      LEFT JOIN fotos_relatorio_express f ON r.id = f.relatorio_express_id 
    `;
    const params: any[] = [];
    const isMasterOrAdmin = Boolean(
      currentUser?.is_master ||
      currentUser?.cargo?.toLowerCase() === 'administrador' ||
      currentUser?.cargo?.toLowerCase() === 'master' ||
      currentUser?.username?.toLowerCase() === 'admin'
    );
    if (currentUser && !isMasterOrAdmin && !currentUser.can_view_others_drafts) {
      query += ` WHERE (r.status NOT IN ('Rascunho', 'Em preenchimento', 'em_andamento') OR r.autor_id = ? OR r.autor_id = ? OR r.sync_status = 'pending') `;
      params.push(Number(currentUser.id) || 0, String(currentUser.id));
    }
    query += ` GROUP BY r.id ORDER BY r.id DESC`;
    return await db.getAllAsync<RelatorioExpress>(query, params);
  } catch (err) {
    console.warn('Erro ao buscar relatórios express:', err);
    return [];
  }
}

export async function getLocalRelatorioExpressById(id: number | string): Promise<RelatorioExpress | null> {
  const db = await getDatabase();
  const numId = Number(id);
  return await db.getFirstAsync<RelatorioExpress>(
    'SELECT * FROM relatorios_express WHERE id = ? OR id = ? LIMIT 1',
    [numId, String(id)]
  );
}

export async function saveLocalRelatorioExpress(r: RelatorioExpress, syncStatus: 'synced' | 'pending' = 'synced'): Promise<void> {
  const db = await getDatabase();

  // Reconciliação se existir registro local provisório para o mesmo número
  try {
    if (r.numero && !r.numero.includes('Pendente')) {
      const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM relatorios_express WHERE numero = ? AND id != ? LIMIT 1', [r.numero, r.id]);
      if (existing) {
        const numIncoming = Number(r.id);
        const numExisting = Number(existing.id);
        if (numIncoming < 2000000000 && numExisting >= 2000000000) {
          // Relatório oficial do servidor substitui o temporário do mobile
          await migrateLocalFotosRelatorioExpressId(numExisting, numIncoming);
          await db.runAsync('DELETE FROM relatorios_express WHERE id = ?', [numExisting]);
        } else if (numIncoming >= 2000000000 && numExisting < 2000000000) {
          // O dispositivo já conhece o ID oficial do servidor para este relatório
          r.id = numExisting;
        }
      }
    }
  } catch (e) {}

  await db.runAsync(
    `INSERT OR REPLACE INTO relatorios_express (
      id, numero, titulo, autor_id, autor_nome, aprovador_id, aprovador_nome,
      data_relatorio, obra_nome, obra_endereco, obra_construtora, checklist_data,
      informacoes_tecnicas, categoria, local, lembrete_proxima_visita, observacoes_finais,
      status, comentario_aprovacao, acompanhantes, created_at, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.id, r.numero, r.titulo, r.autor_id, r.autor_nome || '', r.aprovador_id || null,
      r.aprovador_nome || '', r.data_relatorio || new Date().toISOString(), r.obra_nome,
      r.obra_endereco || '', r.obra_construtora || '', r.checklist_data || '[]',
      r.informacoes_tecnicas || '{}', r.categoria || '', r.local || '',
      r.lembrete_proxima_visita || null, r.observacoes_finais || '',
      r.status || 'Em preenchimento', r.comentario_aprovacao || '',
      r.acompanhantes || '[]', r.created_at || new Date().toISOString(), syncStatus
    ]
  );
}

export async function getLocalFotosExpress(relatorioExpressId: number | string): Promise<FotoRelatorioExpress[]> {
  if (!relatorioExpressId) return [];
  const numId = Number(relatorioExpressId);
  if (isNaN(numId) && typeof relatorioExpressId !== 'string') return [];
  if (numId === 0 && (relatorioExpressId === 0 || relatorioExpressId === '0')) return [];

  const db = await getDatabase();
  const rows = await db.getAllAsync<FotoRelatorioExpress>(
    'SELECT * FROM fotos_relatorio_express WHERE (relatorio_express_id = ? OR relatorio_express_id = ?) AND relatorio_express_id IS NOT NULL AND relatorio_express_id != 0 AND relatorio_express_id != "" ORDER BY ordem ASC, id ASC',
    [numId, String(relatorioExpressId)]
  );

  // Deduplicação não-destrutiva de fotos express: consolida fotos comprovadamente idênticas
  const seenById = new Map<number, FotoRelatorioExpress>();
  const seenByFilename = new Map<string, FotoRelatorioExpress>();
  const seenByUri = new Map<string, FotoRelatorioExpress>();
  const seenByB64 = new Map<string, FotoRelatorioExpress>();
  const result: FotoRelatorioExpress[] = [];

  for (const f of rows) {
    // Ignora fotos fantasmas totalmente vazias (sem arquivo local, sem URL válida e sem base64)
    const hasLocalUri = Boolean(f.uri_local && (f.uri_local.startsWith('file://') || f.uri_local.startsWith('/') || f.uri_local.startsWith('content://')));
    const hasValidUrl = Boolean(f.url && f.url.length > 5 && !f.url.endsWith('null') && !f.url.endsWith('undefined'));
    const hasBase64 = Boolean(f.base64 && f.base64.length > 50);

    if (!hasLocalUri && !hasValidUrl && !hasBase64) {
      continue;
    }

    const filenameKey = (f.filename && f.filename.trim()) || '';
    const uriKey = hasLocalUri ? f.uri_local!.trim() : '';
    const b64Key = hasBase64 ? f.base64!.substring(0, 80) : '';

    let existing: FotoRelatorioExpress | undefined;
    if (f.id && seenById.has(f.id)) {
      existing = seenById.get(f.id);
    } else if (filenameKey && seenByFilename.has(filenameKey)) {
      existing = seenByFilename.get(filenameKey);
    } else if (uriKey && seenByUri.has(uriKey)) {
      existing = seenByUri.get(uriKey);
    } else if (b64Key && seenByB64.has(b64Key)) {
      existing = seenByB64.get(b64Key);
    }

    if (existing) {
      if (hasLocalUri) {
        existing.uri_local = f.uri_local;
      }
      if (!existing.base64 && hasBase64) existing.base64 = f.base64;
      if (!existing.legenda && f.legenda) existing.legenda = f.legenda;
      if (!existing.anotacoes_dados && f.anotacoes_dados) existing.anotacoes_dados = f.anotacoes_dados;
      if (f.id && f.id < 1000000000) existing.id = f.id;
      if (f.url && hasValidUrl) existing.url = f.url;
      if (f.filename) existing.filename = f.filename;
    } else {
      result.push(f);
      if (f.id) seenById.set(f.id, f);
      if (filenameKey) seenByFilename.set(filenameKey, f);
      if (uriKey) seenByUri.set(uriKey, f);
      if (b64Key) seenByB64.set(b64Key, f);
    }
  }

  return result.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
}

export async function saveLocalFotoExpress(f: FotoRelatorioExpress, syncStatus: 'synced' | 'pending' = 'synced'): Promise<void> {
  const db = await getDatabase();

  // Reconciliação inteligente: se já existe foto local provisória (id >= 1000000000) para esta mesma ordem ou filename,
  // preserva o arquivo local file:// e base64 e substitui o registro temporário pelo oficial
  try {
    const numRelId = Number(f.relatorio_express_id) || 0;
    const strRelId = String(f.relatorio_express_id);

    let matchLocal: { id: number; uri_local?: string; base64?: string; anotacoes_dados?: string } | null = null;

    if (f.id && f.id < 1000000000) {
      // É foto oficial do servidor: procura foto temporária correspondente pela ordem
      matchLocal = await db.getFirstAsync<{ id: number; uri_local?: string; base64?: string; anotacoes_dados?: string }>(
        'SELECT id, uri_local, base64, anotacoes_dados FROM fotos_relatorio_express WHERE (relatorio_express_id = ? OR relatorio_express_id = ?) AND ordem = ? AND id >= 1000000000 LIMIT 1',
        [numRelId, strRelId, f.ordem || 0]
      );
    }

    if (!matchLocal && f.filename && f.filename.length > 8 && !f.filename.startsWith('photo_') && f.filename !== 'photo.jpg') {
      matchLocal = await db.getFirstAsync<{ id: number; uri_local?: string; base64?: string; anotacoes_dados?: string }>(
        'SELECT id, uri_local, base64, anotacoes_dados FROM fotos_relatorio_express WHERE (relatorio_express_id = ? OR relatorio_express_id = ?) AND filename = ? AND id != ? LIMIT 1',
        [numRelId, strRelId, f.filename, f.id || 0]
      );
    }

    if (matchLocal) {
      // Preserva URI local file:// e base64 para nunca ficar card vazio
      if (matchLocal.uri_local && matchLocal.uri_local.startsWith('file://')) {
        f.uri_local = matchLocal.uri_local;
      }
      if (matchLocal.base64 && !f.base64) {
        f.base64 = matchLocal.base64;
      }
      if (matchLocal.anotacoes_dados && !f.anotacoes_dados) {
        f.anotacoes_dados = matchLocal.anotacoes_dados;
      }
      await db.runAsync('DELETE FROM fotos_relatorio_express WHERE id = ?', [matchLocal.id]);
    }
  } catch (reconcileErr) {
    console.warn('[saveLocalFotoExpress] Erro na reconciliação de foto express:', reconcileErr);
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO fotos_relatorio_express (
      id, relatorio_express_id, url, filename, uri_local, titulo, legenda, descricao, local, base64, anotacoes_dados, ordem, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      f.id, f.relatorio_express_id, f.url || '', f.filename || '', f.uri_local || '',
      f.titulo || '', f.legenda || '', f.descricao || '', f.local || '', f.base64 || '',
      f.anotacoes_dados || '', f.ordem || 0, syncStatus
    ]
  );
}

export async function deleteLocalFotoExpress(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM fotos_relatorio_express WHERE id = ?', [id]);
}

export async function deleteLocalRelatorioExpress(id: number | string): Promise<void> {
  const db = await getDatabase();
  const numId = Number(id);
  await db.runAsync('DELETE FROM fotos_relatorio_express WHERE relatorio_express_id = ? OR relatorio_express_id = ?;', [numId, String(id)]);
  await db.runAsync('DELETE FROM relatorios_express WHERE id = ? OR id = ?;', [numId, String(id)]);
  await db.runAsync('DELETE FROM sync_queue WHERE entity_type = "relatorio_express" AND (entity_id = ? OR entity_id = ?);', [numId, String(id)]);
}

export async function updateLocalRelatorioExpressStatus(
  id: number,
  status: string,
  comentario: string = '',
  aprovadorId?: number,
  aprovadorNome?: string,
  syncStatus: 'synced' | 'pending' = 'pending'
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE relatorios_express SET status = ?, comentario_aprovacao = ?, aprovador_id = COALESCE(?, aprovador_id),
     aprovador_nome = COALESCE(?, aprovador_nome), sync_status = ?, updated_at = ?
     WHERE id = ?`,
    [status, comentario, aprovadorId || null, aprovadorNome || null, syncStatus, new Date().toISOString(), id]
  );
}

// ================= LOCK COLABORATIVO DE RELATÓRIOS =================
export async function setLocalRelatorioLock(reportId: number, userId: number, userName: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE relatorios SET em_edicao_por_id = ?, em_edicao_por_nome = ?, em_edicao_em = ? WHERE id = ?',
    [userId, userName, new Date().toISOString(), reportId]
  );
}

export async function clearLocalRelatorioLock(reportId: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE relatorios SET em_edicao_por_id = NULL, em_edicao_por_nome = NULL, em_edicao_em = NULL WHERE id = ?',
    [reportId]
  );
}

// ================= CONTATOS =================
export async function getLocalContatos(projetoId?: number): Promise<Contato[]> {
  const db = await getDatabase();
  let query = 'SELECT * FROM contatos';
  const params: any[] = [];
  if (projetoId) {
    query += ' WHERE projeto_id = ?';
    params.push(projetoId);
  }
  query += ' ORDER BY nome ASC';
  return await db.getAllAsync<Contato>(query, params);
}

export async function saveLocalContato(c: Contato, syncStatus: 'synced' | 'pending' = 'synced'): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO contatos (id, nome, email, telefone, empresa, cargo, projeto_id, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [c.id, c.nome, c.email || '', c.telefone || '', c.empresa || '', c.cargo || '', c.projeto_id || null, syncStatus]
  );
}

// ================= LEMBRETES =================
export async function getLocalLembretes(projetoId?: number, onlyActive: boolean = true): Promise<Lembrete[]> {
  const db = await getDatabase();
  let query = 'SELECT * FROM lembretes';
  const conditions: string[] = [];
  const params: any[] = [];
  if (projetoId) {
    conditions.push('projeto_id = ?');
    params.push(projetoId);
  }
  if (onlyActive) {
    conditions.push('fechado = 0');
  }
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY criado_em DESC';
  const rows = await db.getAllAsync<any>(query, params);
  return rows.map(r => ({ ...r, fechado: Boolean(r.fechado) }));
}

export async function saveLocalLembrete(l: Lembrete, syncStatus: 'synced' | 'pending' = 'synced'): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO lembretes (
      id, projeto_id, projeto_nome, texto, fechado, fechado_em,
      fechado_por_nome, criado_em, criado_por_nome, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      l.id, l.projeto_id, l.projeto_nome || '', l.texto,
      l.fechado ? 1 : 0, l.fechado_em || null, l.fechado_por_nome || null,
      l.criado_em || new Date().toISOString(), l.criado_por_nome || '', syncStatus
    ]
  );
}

export async function closeLocalLembrete(id: number, userName: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE lembretes SET fechado = 1, fechado_em = ?, fechado_por_nome = ?, sync_status = 'pending' WHERE id = ?`,
    [new Date().toISOString(), userName, id]
  );
}

// ================= NOTIFICAÇÕES =================
export async function getLocalNotificacoes(userId?: number): Promise<Notificacao[]> {
  const db = await getDatabase();
  let query = 'SELECT * FROM notificacoes';
  const params: any[] = [];
  if (userId) {
    query += ' WHERE user_id = ? OR user_id = 0';
    params.push(userId);
  }
  query += ' ORDER BY created_at DESC LIMIT 50';
  const rows = await db.getAllAsync<any>(query, params);
  return rows.map(r => ({ ...r, lida: Boolean(r.lida) }));
}

export async function saveLocalNotificacao(n: Partial<Notificacao>): Promise<number> {
  const db = await getDatabase();
  const id = n.id || Date.now();
  await db.runAsync(
    `INSERT OR REPLACE INTO notificacoes (id, user_id, titulo, mensagem, tipo, lida, link, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      n.user_id || 1,
      n.titulo || 'Notificação',
      n.mensagem || '',
      n.tipo || 'info',
      n.lida ? 1 : 0,
      n.link || '',
      n.created_at || new Date().toISOString()
    ]
  );
  return id;
}

export async function markNotificacaoAsRead(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE notificacoes SET lida = 1 WHERE id = ?', [id]);
}

export async function markAllNotificacoesAsRead(userId?: number): Promise<void> {
  const db = await getDatabase();
  if (userId) {
    await db.runAsync('UPDATE notificacoes SET lida = 1 WHERE user_id = ? OR user_id = 0', [userId]);
  } else {
    await db.runAsync('UPDATE notificacoes SET lida = 1');
  }
}

export async function clearLocalNotificacoes(userId?: number): Promise<void> {
  const db = await getDatabase();
  if (userId) {
    await db.runAsync('DELETE FROM notificacoes WHERE user_id = ? OR user_id = 0', [userId]);
  } else {
    await db.runAsync('DELETE FROM notificacoes');
  }
}

export async function deleteLocalNotificacao(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM notificacoes WHERE id = ?', [id]);
}

// ================= LEGENDAS =================
export async function getLocalLegendas(categoria?: string): Promise<LegendaPredefinida[]> {
  const db = await getDatabase();
  let query = 'SELECT * FROM legendas_predefinidas';
  const params: any[] = [];
  if (categoria && categoria !== 'Todas') {
    query += ' WHERE categoria = ?';
    params.push(categoria);
  }
  query += ' ORDER BY ordem ASC, id ASC';
  return await db.getAllAsync<LegendaPredefinida>(query, params);
}

export async function saveLocalLegenda(legenda: { id?: number; categoria: string; texto: string; ordem?: number }): Promise<number> {
  const db = await getDatabase();
  const id = legenda.id || Date.now();
  await db.runAsync(
    'INSERT OR REPLACE INTO legendas_predefinidas (id, categoria, texto, ordem) VALUES (?, ?, ?, ?)',
    [id, legenda.categoria, legenda.texto, legenda.ordem || 0]
  );
  return id;
}

export async function deleteLocalLegenda(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM legendas_predefinidas WHERE id = ?', [id]);
}

export async function updateLocalLegenda(id: number, texto: string, categoria: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE legendas_predefinidas SET texto = ?, categoria = ? WHERE id = ?',
    [texto, categoria, id]
  );
}

export async function reorderLocalLegendas(items: { id: number; ordem: number }[]): Promise<void> {
  const db = await getDatabase();
  for (const it of items) {
    await db.runAsync('UPDATE legendas_predefinidas SET ordem = ? WHERE id = ?', [it.ordem, it.id]);
  }
}

// ================= CHECKLIST CUSTOM TEMPLATE =================
export async function getLocalChecklistTemplate(): Promise<ChecklistCustomItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM checklist_custom_template WHERE ativo = 1 ORDER BY ordem ASC, id ASC'
  );
  return rows.map(r => ({
    id: r.id,
    item: r.item,
    ordem: r.ordem,
    ativo: Boolean(r.ativo)
  }));
}

export async function addLocalChecklistItem(item: string, ordem?: number): Promise<number> {
  const db = await getDatabase();
  let nextOrdem = ordem;
  if (nextOrdem === undefined) {
    const maxRow = await db.getFirstAsync<{ max_ordem: number }>(
      'SELECT MAX(ordem) as max_ordem FROM checklist_custom_template'
    );
    nextOrdem = (maxRow?.max_ordem || 0) + 1;
  }
  const res = await db.runAsync(
    'INSERT INTO checklist_custom_template (item, ordem, ativo) VALUES (?, ?, 1)',
    [item.trim(), nextOrdem]
  );
  return res.lastInsertRowId;
}

export async function updateLocalChecklistItem(id: number, item: string, ordem?: number): Promise<void> {
  const db = await getDatabase();
  if (ordem !== undefined) {
    await db.runAsync(
      'UPDATE checklist_custom_template SET item = ?, ordem = ? WHERE id = ?',
      [item.trim(), ordem, id]
    );
  } else {
    await db.runAsync(
      'UPDATE checklist_custom_template SET item = ? WHERE id = ?',
      [item.trim(), id]
    );
  }
}

export async function deleteLocalChecklistItem(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM checklist_custom_template WHERE id = ?', [id]);
}

export async function reorderLocalChecklistItems(items: { id: number; ordem: number }[]): Promise<void> {
  const db = await getDatabase();
  for (const it of items) {
    await db.runAsync('UPDATE checklist_custom_template SET ordem = ? WHERE id = ?', [it.ordem, it.id]);
  }
}

export async function resetLocalChecklistTemplateToDefault(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM checklist_custom_template');
  for (const it of SEED_CHECKLIST) {
    await db.runAsync(
      'INSERT INTO checklist_custom_template (item, ordem, ativo) VALUES (?, ?, 1)',
      [it.item, it.ordem]
    );
  }
}

// ================= CHECKLIST PROGRESSO DA OBRA =================
export async function getChecklistProgressoObra(projetoId: number): Promise<ChecklistProgressoObra[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM checklist_obra_progresso WHERE projeto_id = ? ORDER BY ordem ASC, id ASC',
    [projetoId]
  );
  return rows.map(r => ({
    id: r.id,
    projeto_id: r.projeto_id,
    checklist_item_id: r.checklist_item_id,
    item_texto: r.item_texto,
    ordem: r.ordem,
    aprovado: Boolean(r.aprovado),
    aprovado_em_relatorio_id: r.aprovado_em_relatorio_id,
    aprovado_em_relatorio_numero: r.aprovado_em_relatorio_numero,
    data_aprovacao: r.data_aprovacao,
    observacao: r.observacao
  }));
}

export async function saveChecklistProgressoObra(progresso: ChecklistProgressoObra): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<any>(
    'SELECT id FROM checklist_obra_progresso WHERE projeto_id = ? AND item_texto = ? LIMIT 1',
    [progresso.projeto_id, progresso.item_texto]
  );

  const agora = progresso.data_aprovacao || new Date().toISOString();

  if (existing) {
    await db.runAsync(
      `UPDATE checklist_obra_progresso SET 
        aprovado = ?, 
        aprovado_em_relatorio_id = ?, 
        aprovado_em_relatorio_numero = ?, 
        data_aprovacao = ?, 
        ordem = ?, 
        observacao = ? 
       WHERE id = ?`,
      [
        progresso.aprovado ? 1 : 0,
        progresso.aprovado_em_relatorio_id || null,
        progresso.aprovado_em_relatorio_numero || null,
        agora,
        progresso.ordem || 0,
        progresso.observacao || null,
        existing.id
      ]
    );
  } else {
    await db.runAsync(
      `INSERT INTO checklist_obra_progresso (
        projeto_id, checklist_item_id, item_texto, ordem, aprovado, 
        aprovado_em_relatorio_id, aprovado_em_relatorio_numero, data_aprovacao, observacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        progresso.projeto_id,
        progresso.checklist_item_id || null,
        progresso.item_texto,
        progresso.ordem || 0,
        progresso.aprovado ? 1 : 0,
        progresso.aprovado_em_relatorio_id || null,
        progresso.aprovado_em_relatorio_numero || null,
        agora,
        progresso.observacao || null
      ]
    );
  }
}

export async function saveBatchChecklistProgressoObra(
  projetoId: number,
  itens: Array<{
    item_texto: string;
    ordem?: number;
    aprovado_em_relatorio_id?: number;
    aprovado_em_relatorio_numero?: string;
    data_aprovacao?: string;
    observacao?: string;
  }>
): Promise<void> {
  for (const it of itens) {
    await saveChecklistProgressoObra({
      projeto_id: projetoId,
      item_texto: it.item_texto,
      ordem: it.ordem,
      aprovado: true,
      aprovado_em_relatorio_id: it.aprovado_em_relatorio_id,
      aprovado_em_relatorio_numero: it.aprovado_em_relatorio_numero,
      data_aprovacao: it.data_aprovacao,
      observacao: it.observacao
    });
  }
}

// ================= SYNC QUEUE =================
export async function addToSyncQueue(
  entityType: string,
  entityId: number,
  action: string,
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  payload: any
): Promise<number> {
  const db = await getDatabase();
  
  // Verifica se já existe um item pendente para a mesma entidade
  const existing = await db.getFirstAsync<{ id: number; action: string; method: string }>(
    "SELECT id, action, method FROM sync_queue WHERE entity_type = ? AND entity_id = ? AND status = 'pending' LIMIT 1",
    [entityType, entityId]
  );

  if (existing) {
    // Se nova ação é delete, prevalece o delete
    if (action === 'delete') {
      await db.runAsync(
        "UPDATE sync_queue SET action = 'delete', endpoint = ?, method = 'DELETE', payload = ?, created_at = ? WHERE id = ?",
        [endpoint, JSON.stringify(payload), new Date().toISOString(), existing.id]
      );
      return existing.id;
    }
    // Se o item existente era 'create' e o novo é 'update', mantém 'create' para cadastrar no servidor com o payload mais recente
    const finalAction = existing.action === 'create' ? 'create' : action;
    const finalMethod = existing.action === 'create' ? existing.method : method;
    const finalEndpoint = existing.action === 'create' ? endpoint : endpoint;
    
    await db.runAsync(
      "UPDATE sync_queue SET action = ?, endpoint = ?, method = ?, payload = ?, created_at = ? WHERE id = ?",
      [finalAction, finalEndpoint, finalMethod, JSON.stringify(payload), new Date().toISOString(), existing.id]
    );
    return existing.id;
  }

  const res = await db.runAsync(
    `INSERT INTO sync_queue (entity_type, entity_id, action, endpoint, method, payload, created_at, status, retries)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
    [entityType, entityId, action, endpoint, method, JSON.stringify(payload), new Date().toISOString()]
  );
  return res.lastInsertRowId;
}

export async function getPendingSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDatabase();
  return await db.getAllAsync<SyncQueueItem>(
    "SELECT * FROM sync_queue WHERE status = 'pending' OR (status = 'failed' AND retries < 3) ORDER BY id ASC"
  );
}

export async function updateSyncQueueItem(id: number, status: 'pending' | 'processing' | 'failed' | 'completed', errorMessage?: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE sync_queue SET status = ?, retries = retries + 1, error_message = ? WHERE id = ?',
    [status, errorMessage || null, id]
  );
}

export async function getPendingSyncCount(): Promise<number> {
  const db = await getDatabase();
  try {
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'"
    );
    return row?.count || 0;
  } catch {
    return 0;
  }
}

export async function clearFailedSyncQueue(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM sync_queue WHERE status = 'failed' OR retries >= 3");
}

export async function clearCompletedSyncQueue(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM sync_queue WHERE status = 'completed' OR (status = 'failed' AND retries >= 5)");
}

/**
 * Migra o ID temporário de uma Obra criada offline para o ID real retornado pelo servidor,
 * atualizando em cascata todas as tabelas relacionadas e os itens pendentes na fila de sincronização.
 */
export async function migrateLocalProjetoId(oldId: number, newId: number, newNumero?: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE projetos SET id = ?, numero = COALESCE(?, numero), sync_status = "synced" WHERE id = ?',
    [newId, newNumero || null, oldId]
  );
  await db.runAsync('UPDATE relatorios SET projeto_id = ? WHERE projeto_id = ?', [newId, oldId]);
  await db.runAsync('UPDATE visitas SET projeto_id = ? WHERE projeto_id = ?', [newId, oldId]);
  await db.runAsync('UPDATE contatos SET projeto_id = ? WHERE projeto_id = ?', [newId, oldId]);
  await db.runAsync('UPDATE lembretes SET projeto_id = ? WHERE projeto_id = ?', [newId, oldId]);

  // Atualiza payloads na fila de sincronização
  const pendingQueue = await db.getAllAsync<{ id: number; payload: string }>(
    "SELECT id, payload FROM sync_queue WHERE status = 'pending' OR status = 'failed'"
  );
  for (const item of pendingQueue) {
    if (item.payload && item.payload.includes(String(oldId))) {
      try {
        const p = JSON.parse(item.payload);
        let changed = false;
        if (p.projeto_id === oldId) {
          p.projeto_id = newId;
          changed = true;
        }
        if (newNumero && p.projeto_numero === oldId) {
          p.projeto_numero = newNumero;
          changed = true;
        }
        if (changed) {
          await db.runAsync('UPDATE sync_queue SET payload = ? WHERE id = ?', [JSON.stringify(p), item.id]);
        }
      } catch {}
    }
  }
}

// ==================== VISITANTES (ACOMPANHANTES FREQUENTES) ====================
export async function getLocalVisitantes(): Promise<import('../types').Visitante[]> {
  const db = await getDatabase();
  return await db.getAllAsync<import('../types').Visitante>(
    'SELECT * FROM visitantes WHERE ativo = 1 ORDER BY nome ASC'
  );
}

export async function saveLocalVisitante(
  v: import('../types').Visitante, 
  syncStatus: 'synced' | 'pending' = 'synced'
): Promise<number> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM visitantes WHERE id = ?', [v.id]);
  if (existing) {
    await db.runAsync(
      `UPDATE visitantes SET nome = ?, cargo = ?, empresa = ?, telefone = ?, email = ?, ativo = ?, sync_status = ?
       WHERE id = ?`,
      [v.nome, v.cargo || '', v.empresa || '', v.telefone || '', v.email || '', v.ativo !== false ? 1 : 0, syncStatus, v.id]
    );
    return v.id;
  }
  const res = await db.runAsync(
    `INSERT INTO visitantes (id, nome, cargo, empresa, telefone, email, ativo, sync_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      v.id || Date.now(), 
      v.nome, 
      v.cargo || '', 
      v.empresa || '', 
      v.telefone || '', 
      v.email || '', 
      v.ativo !== false ? 1 : 0, 
      syncStatus, 
      v.created_at || new Date().toISOString()
    ]
  );
  return res.lastInsertRowId;
}

export async function deleteLocalVisitante(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM visitantes WHERE id = ?', [id]);
}

