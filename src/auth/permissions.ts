import { User } from '../types';

/**
 * Perfis do ELP — regra ÚNICA usada por todas as telas.
 * Espelha a classificação do backend (routes.py → api_users_collection / tipo_acesso):
 *
 *  desenvolvedor  is_developer, cargo "desenvolvedor" ou usuário "desenvolvedor"
 *  admin          usuário "admin", ou master com "admin" no cargo
 *  master         is_master
 *  aprovador      is_aprovador_express ou "aprovad" no cargo
 *  visualizador   "visualiza" ou "client" no cargo  → somente leitura
 *  funcionario    técnico de campo (padrão)
 */
export type Perfil = 'desenvolvedor' | 'admin' | 'master' | 'aprovador' | 'funcionario' | 'visualizador';

type AnyUser = (User & Record<string, any>) | null | undefined;

const low = (v?: string | null) => (v || '').toLowerCase().trim();

export function getPerfil(user: AnyUser): Perfil {
  if (!user) return 'visualizador';
  const cargo = low(user.cargo);
  const username = low(user.username);

  if (user.is_developer || cargo === 'desenvolvedor' || username === 'desenvolvedor') return 'desenvolvedor';
  if (username === 'admin' || user.tipo_acesso === 'admin' || (user.is_master && cargo.includes('admin'))) return 'admin';
  if (user.is_master || cargo === 'master' || cargo === 'administrador') return 'master';
  if (user.is_aprovador_express || user.is_aprovador || user.tipo_acesso === 'aprovador' || cargo.includes('aprovad')) return 'aprovador';
  if (user.tipo_acesso === 'visualizador' || cargo.includes('visualiza') || cargo.includes('client')) return 'visualizador';
  return 'funcionario';
}

export const PERFIL_LABEL: Record<Perfil, string> = {
  desenvolvedor: 'Desenvolvedor',
  admin: 'Administrador Geral',
  master: 'Usuário Master',
  aprovador: 'Engenheiro Aprovador',
  funcionario: 'Técnico de Campo',
  visualizador: 'Visualizador / Cliente',
};

/** Acesso total: excluir obras/visitas, gerenciar usuários, ver tudo. */
export function hasFullAccess(user: AnyUser): boolean {
  const p = getPerfil(user);
  return p === 'desenvolvedor' || p === 'admin' || p === 'master';
}

export function isDeveloper(user: AnyUser): boolean {
  return getPerfil(user) === 'desenvolvedor';
}

/** Pode aprovar/rejeitar relatórios (comum e Express) de modo geral. */
export function canApprove(user: AnyUser): boolean {
  return hasFullAccess(user) || getPerfil(user) === 'aprovador';
}

/** Pode aprovar ESTE relatório: aprovador comum nunca aprova o próprio. */
export function canApproveReport(user: AnyUser, autorId?: number | string | null): boolean {
  if (!user || !canApprove(user)) return false;
  if (hasFullAccess(user)) return true;
  return autorId == null || String(autorId) !== String(user.id);
}

/** Pode criar/editar conteúdo (relatórios, express, visitas, obras, lembretes...). */
export function canWrite(user: AnyUser): boolean {
  return !!user && user.ativo !== false && getPerfil(user) !== 'visualizador';
}

/** Vê rascunhos de outros autores. */
export function canViewOthersDrafts(user: AnyUser): boolean {
  return hasFullAccess(user) || Boolean(user?.can_view_others_drafts);
}

export function canManageUsers(user: AnyUser): boolean {
  return hasFullAccess(user);
}

/** Mensagem padrão quando um visualizador tenta alterar algo. */
export const READ_ONLY_MESSAGE = 'Seu perfil é somente leitura. Peça a um administrador para alterar seu acesso.';
