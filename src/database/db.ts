import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES_SQL, SEED_LEGENDAS } from './schema';
import { 
  Projeto, Visita, Relatorio, FotoRelatorio, 
  RelatorioExpress, FotoRelatorioExpress, Reembolso, 
  Contato, Lembrete, Notificacao, LegendaPredefinida, 
  SyncQueueItem, User 
} from '../types';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('obraflow.db');
    await dbInstance.execAsync('PRAGMA foreign_keys = ON;');
    await initDatabase(dbInstance);
  }
  return dbInstance;
}

async function initDatabase(db: SQLite.SQLiteDatabase) {
  await db.execAsync(CREATE_TABLES_SQL);

  // Migration: ensure base64 column exists in fotos_relatorio
  try {
    await db.execAsync('ALTER TABLE fotos_relatorio ADD COLUMN base64 TEXT;');
  } catch {}

  // Migration: ensure base64 and local exist in fotos_relatorio_express
  try {
    await db.execAsync('ALTER TABLE fotos_relatorio_express ADD COLUMN base64 TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE fotos_relatorio_express ADD COLUMN local TEXT;');
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

  // Migration: ensure comprovante and approval fields exist in reembolsos
  try {
    await db.execAsync('ALTER TABLE reembolsos ADD COLUMN comprovante_uri TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE reembolsos ADD COLUMN comprovante_base64 TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE reembolsos ADD COLUMN aprovado_por_nome TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE reembolsos ADD COLUMN aprovado_em TEXT;');
  } catch {}
  
  // Seed initial legendas if empty
  const countRes = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM legendas_predefinidas');
  if (!countRes || countRes.count === 0) {
    for (const leg of SEED_LEGENDAS) {
      await db.runAsync(
        'INSERT INTO legendas_predefinidas (categoria, texto, ordem) VALUES (?, ?, ?)',
        [leg.categoria, leg.texto, leg.ordem]
      );
    }
  }
}

// ================= USER =================
export async function saveLocalUser(user: User): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO users (id, username, email, is_master, is_aprovador_express, cargo, telefone, cor_agenda, ativo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      user.username,
      user.email,
      user.is_master ? 1 : 0,
      user.is_aprovador_express ? 1 : 0,
      user.cargo || '',
      user.telefone || '',
      user.cor_agenda || '#2563EB',
      user.ativo !== false ? 1 : 0
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
    ativo: Boolean(row.ativo)
  };
}

// ================= PROJETOS =================
export async function getLocalProjetos(status?: string): Promise<Projeto[]> {
  const db = await getDatabase();
  let query = 'SELECT * FROM projetos';
  const params: any[] = [];
  if (status && status !== 'Todos') {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY id DESC';
  return await db.getAllAsync<Projeto>(query, params);
}

export async function getLocalProjetoById(id: number): Promise<Projeto | null> {
  const db = await getDatabase();
  return await db.getFirstAsync<Projeto>('SELECT * FROM projetos WHERE id = ?', [id]);
}

export async function saveLocalProjeto(p: Projeto, syncStatus: 'synced' | 'pending' = 'synced'): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO projetos (
      id, numero, nome, descricao, endereco, latitude, longitude, tipo_obra, 
      construtora, nome_funcionario, responsavel_id, email_principal, data_inicio, 
      data_previsao_fim, status, numeracao_inicial, created_at, elementos_construtivos_base,
      especificacao_chapisco_colante, especificacao_chapisco_alvenaria, especificacao_argamassa_emboco,
      forma_aplicacao_argamassa, acabamentos_revestimento, acabamento_peitoris, acabamento_muretas,
      definicao_frisos_cor, definicao_face_inferior_abas, observacoes_projeto_fachada, 
      outras_observacoes, sync_status, local_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      syncStatus, new Date().toISOString()
    ]
  );
}

// ================= VISITAS =================
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
  return rows.map(r => ({
    ...r,
    is_pessoal: Boolean(r.is_pessoal)
  }));
}

export async function getLocalVisitaById(id: number): Promise<Visita | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>('SELECT * FROM visitas WHERE id = ?', [id]);
  if (!row) return null;
  return { ...row, is_pessoal: Boolean(row.is_pessoal) };
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
}

// ================= RELATORIOS =================
export async function getLocalRelatorios(projetoId?: number): Promise<Relatorio[]> {
  const db = await getDatabase();
  let query = 'SELECT r.*, COUNT(f.id) as fotos_count FROM relatorios r LEFT JOIN fotos_relatorio f ON r.id = f.relatorio_id';
  const params: any[] = [];
  if (projetoId) {
    query += ' WHERE r.projeto_id = ?';
    params.push(projetoId);
  }
  query += ' GROUP BY COALESCE(NULLIF(r.uuid, ""), NULLIF(r.numero, ""), r.id) ORDER BY COALESCE(r.updated_at, r.data_criacao_local, r.data_relatorio) DESC, r.id DESC';
  return await db.getAllAsync<Relatorio>(query, params);
}

export async function getLocalRelatorioById(id: number): Promise<Relatorio | null> {
  const db = await getDatabase();
  return await db.getFirstAsync<Relatorio>('SELECT * FROM relatorios WHERE id = ?', [id]);
}

export async function getActiveDraft(projetoId: number, autorId: number): Promise<Relatorio | null> {
  const db = await getDatabase();
  return await db.getFirstAsync<Relatorio>(
    `SELECT * FROM relatorios WHERE projeto_id = ? AND autor_id = ? AND status = 'em_andamento' ORDER BY COALESCE(updated_at, data_criacao_local, data_relatorio) DESC, id DESC LIMIT 1`,
    [projetoId, autorId]
  );
}

export async function saveLocalRelatorio(r: Relatorio, syncStatus: 'synced' | 'pending' = 'synced'): Promise<void> {
  const db = await getDatabase();

  // Deduplicação Atômica: Se já existir rascunho com o mesmo UUID ou Número oficial
  try {
    let existing: { id: number } | null = null;
    if (r.uuid) {
      existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM relatorios WHERE uuid = ?', [r.uuid]);
    }
    if (!existing && r.numero && !r.numero.includes('Pendente')) {
      existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM relatorios WHERE numero = ?', [r.numero]);
    }
    if (existing && existing.id !== r.id) {
      // Reconcilia fotos vinculadas do ID temporário para o novo ID
      await db.runAsync('UPDATE fotos_relatorio SET relatorio_id = ? WHERE relatorio_id = ?', [r.id, existing.id]);
      // Remove o registro duplicado antigo
      await db.runAsync('DELETE FROM relatorios WHERE id = ?', [existing.id]);
    }
  } catch (dedupErr) {
    console.warn('[db] Aviso na deduplicação de relatório:', dedupErr);
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO relatorios (
      id, numero, numero_projeto, titulo, projeto_id, projeto_nome, visita_id,
      autor_id, autor_nome, aprovador_id, aprovador_nome, data_relatorio,
      data_aprovacao, conteudo, descricao, checklist_data, categoria, local,
      lembrete_proxima_visita, observacoes_finais, status, comentario_aprovacao,
      acompanhantes, created_at, updated_at, uuid, data_criacao_local, data_sincronizacao, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.id, r.numero, r.numero_projeto || null, r.titulo, r.projeto_id,
      r.projeto_nome || '', r.visita_id || null, r.autor_id, r.autor_nome || '',
      r.aprovador_id || null, r.aprovador_nome || '', r.data_relatorio || new Date().toISOString(),
      r.data_aprovacao || null, r.conteudo || '', r.descricao || '', r.checklist_data || '[]',
      r.categoria || '', r.local || '', r.lembrete_proxima_visita || null,
      r.observacoes_finais || '', r.status || 'em_andamento', r.comentario_aprovacao || '',
      r.acompanhantes || '[]', r.created_at || new Date().toISOString(),
      new Date().toISOString(), r.uuid || r.uuid_local || '',
      r.data_criacao_local || r.created_at || new Date().toISOString(),
      r.data_sincronizacao || null, syncStatus
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
  await db.runAsync('DELETE FROM fotos_relatorio WHERE relatorio_id = ?', [id]);
  await db.runAsync('DELETE FROM relatorios WHERE id = ?', [id]);
}

// ================= FOTOS =================

export async function getLocalFotos(relatorioId: number): Promise<FotoRelatorio[]> {
  const db = await getDatabase();
  return await db.getAllAsync<FotoRelatorio>(
    'SELECT * FROM fotos_relatorio WHERE relatorio_id = ? ORDER BY ordem ASC',
    [relatorioId]
  );
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

  await db.runAsync(
    `INSERT OR REPLACE INTO fotos_relatorio (
      id, relatorio_id, url, filename, uri_local, titulo, legenda, descricao,
      tipo_servico, local, ordem, anotacoes_dados, base64, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      f.id, f.relatorio_id, f.url || '', f.filename || '', f.uri_local || '',
      f.titulo || '', f.legenda || '', f.descricao || '', f.tipo_servico || '',
      f.local || '', f.ordem || 0, f.anotacoes_dados || '', finalBase64, syncStatus
    ]
  );
}

export async function deleteLocalFoto(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM fotos_relatorio WHERE id = ?', [id]);
}

// ================= RELATORIOS EXPRESS =================
export async function getLocalRelatoriosExpress(): Promise<RelatorioExpress[]> {
  const db = await getDatabase();
  return await db.getAllAsync<RelatorioExpress>(`
    SELECT r.*, COUNT(f.id) as fotos_count 
    FROM relatorios_express r 
    LEFT JOIN fotos_relatorio_express f ON r.id = f.relatorio_express_id 
    GROUP BY COALESCE(NULLIF(r.numero, ""), r.id) 
    ORDER BY COALESCE(r.updated_at, r.data_criacao_local, r.data_relatorio) DESC, r.id DESC
  `);
}

export async function getLocalRelatorioExpressById(id: number): Promise<RelatorioExpress | null> {
  const db = await getDatabase();
  return await db.getFirstAsync<RelatorioExpress>('SELECT * FROM relatorios_express WHERE id = ?', [id]);
}

export async function saveLocalRelatorioExpress(r: RelatorioExpress, syncStatus: 'synced' | 'pending' = 'synced'): Promise<void> {
  const db = await getDatabase();

  // Deduplicação por número
  try {
    if (r.numero && !r.numero.includes('Pendente')) {
      const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM relatorios_express WHERE numero = ?', [r.numero]);
      if (existing && existing.id !== r.id) {
        await db.runAsync('UPDATE fotos_relatorio_express SET relatorio_express_id = ? WHERE relatorio_express_id = ?', [r.id, existing.id]);
        await db.runAsync('DELETE FROM relatorios_express WHERE id = ?', [existing.id]);
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

export async function getLocalFotosExpress(relatorioExpressId: number): Promise<FotoRelatorioExpress[]> {
  const db = await getDatabase();
  return await db.getAllAsync<FotoRelatorioExpress>(
    'SELECT * FROM fotos_relatorio_express WHERE relatorio_express_id = ? ORDER BY ordem ASC, id ASC',
    [relatorioExpressId]
  );
}

export async function saveLocalFotoExpress(f: FotoRelatorioExpress, syncStatus: 'synced' | 'pending' = 'synced'): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO fotos_relatorio_express (
      id, relatorio_express_id, url, filename, uri_local, titulo, legenda, descricao, local, base64, ordem, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      f.id, f.relatorio_express_id, f.url || '', f.filename || '', f.uri_local || '',
      f.titulo || '', f.legenda || '', f.descricao || '', f.local || '', f.base64 || '',
      f.ordem || 0, syncStatus
    ]
  );
}

export async function deleteLocalFotoExpress(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM fotos_relatorio_express WHERE id = ?', [id]);
}

export async function deleteLocalRelatorioExpress(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM fotos_relatorio_express WHERE relatorio_express_id = ?', [id]);
  await db.runAsync('DELETE FROM relatorios_express WHERE id = ?', [id]);
}

// ================= REEMBOLSOS =================
export async function getLocalReembolsos(): Promise<Reembolso[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Reembolso>('SELECT * FROM reembolsos ORDER BY periodo_inicio DESC');
}

export async function saveLocalReembolso(rem: Reembolso, syncStatus: 'synced' | 'pending' = 'synced'): Promise<void> {
  const db = await getDatabase();
  const total = (rem.quilometragem * rem.valor_km) + rem.alimentacao + rem.hospedagem + rem.outros_gastos;
  await db.runAsync(
    `INSERT OR REPLACE INTO reembolsos (
      id, usuario_id, usuario_nome, projeto_id, projeto_nome, periodo_inicio,
      periodo_fim, quilometragem, valor_km, alimentacao, hospedagem, outros_gastos,
      total, status, observacoes, comprovante_uri, comprovante_base64,
      aprovado_por_nome, aprovado_em, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rem.id, rem.usuario_id, rem.usuario_nome || '', rem.projeto_id || null,
      rem.projeto_nome || '', rem.periodo_inicio, rem.periodo_fim,
      rem.quilometragem || 0, rem.valor_km || 0, rem.alimentacao || 0,
      rem.hospedagem || 0, rem.outros_gastos || 0, total,
      rem.status || 'Pendente', rem.observacoes || '',
      rem.comprovante_uri || null, rem.comprovante_base64 || null,
      rem.aprovado_por_nome || null, rem.aprovado_em || null, syncStatus
    ]
  );
}

export async function updateLocalReembolsoStatus(id: number, status: string, aprovadoPorNome?: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE reembolsos SET status = ?, aprovado_por_nome = ?, aprovado_em = ?, sync_status = 'pending' WHERE id = ?`,
    [status, aprovadoPorNome || 'Gestor Master', new Date().toISOString(), id]
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
    `INSERT OR REPLACE INTO contatos (id, nome, email, telefone, empresa, projeto_id, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [c.id, c.nome, c.email || '', c.telefone || '', c.empresa || '', c.projeto_id || null, syncStatus]
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
    "SELECT * FROM sync_queue WHERE status = 'pending' OR status = 'failed' ORDER BY id ASC"
  );
}

export async function updateSyncQueueItem(id: number, status: 'pending' | 'processing' | 'failed' | 'completed', errorMessage?: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE sync_queue SET status = ?, retries = retries + 1, error_message = ? WHERE id = ?',
    [status, errorMessage || null, id]
  );
}

export async function clearCompletedSyncQueue(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM sync_queue WHERE status = 'completed'");
}
