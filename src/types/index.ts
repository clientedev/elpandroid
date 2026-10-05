export interface User {
  id: number;
  username: string;
  email: string;
  nome_completo?: string;
  is_master?: boolean;
  is_aprovador_express?: boolean;
  cargo?: string;
  telefone?: string;
  cor_agenda?: string;
  ativo?: boolean;
  tipo_acesso?: 'admin' | 'master' | 'aprovador' | 'funcionario' | 'visualizador';
  created_at?: string;
  token?: string;
}

export interface Projeto {
  id: number;
  numero: string;
  nome: string;
  descricao?: string;
  endereco?: string;
  latitude?: number;
  longitude?: number;
  tipo_obra: string;
  construtora: string;
  nome_funcionario: string;
  responsavel_id: number;
  email_principal: string;
  data_inicio?: string;
  data_previsao_fim?: string;
  status: 'Ativo' | 'Concluído' | 'Cancelado' | string;
  numeracao_inicial?: number;
  created_at?: string;
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
  sync_status?: 'synced' | 'pending' | 'error';
  local_updated_at?: string;
}

export interface CategoriaObra {
  id: number;
  projeto_id: number;
  nome_categoria: string;
  ordem?: number;
  sync_status?: 'synced' | 'pending' | 'error';
}

export interface Visita {
  id: number;
  numero: string;
  projeto_id?: number | null;
  projeto_nome?: string;
  projeto_outros?: string;
  responsavel_id: number;
  responsavel_nome?: string;
  data_inicio: string;
  data_fim: string;
  data_realizada?: string;
  observacoes?: string;
  atividades_realizadas?: string;
  status: 'Agendada' | 'Em Andamento' | 'Realizada' | 'Cancelada' | string;
  endereco_gps?: string;
  latitude?: number;
  longitude?: number;
  is_pessoal?: boolean;
  sync_status?: 'synced' | 'pending' | 'error';
  participantes?: number[];
}

export interface Relatorio {
  id: number;
  numero: string;
  numero_projeto?: number;
  titulo: string;
  projeto_id: number;
  projeto_nome?: string;
  visita_id?: number | null;
  autor_id: number;
  autor_nome?: string;
  aprovador_id?: number | null;
  aprovador_nome?: string;
  data_relatorio: string;
  data_aprovacao?: string;
  conteudo?: string;
  descricao?: string;
  checklist_data?: string;
  categoria?: string;
  local?: string;
  lembrete_proxima_visita?: string;
  observacoes_finais?: string;
  status: 'em_andamento' | 'preenchimento' | 'Aguardando Aprovação' | 'Aprovado' | 'Rejeitado' | string;
  comentario_aprovacao?: string;
  acompanhantes?: string;
  created_at?: string;
  updated_at?: string;
  uuid?: string;
  uuid_local?: string;
  data_criacao_local?: string;
  data_sincronizacao?: string;
  sync_status?: 'synced' | 'pending' | 'error';
  fotos_count?: number;
}

export interface FotoRelatorio {
  id: number;
  relatorio_id: number;
  url?: string;
  filename?: string;
  uri_local?: string;
  titulo?: string;
  legenda?: string;
  descricao?: string;
  tipo_servico?: string;
  local?: string;
  ordem: number;
  anotacoes_dados?: string;
  base64?: string;
  sync_status?: 'synced' | 'pending' | 'error';
}

export interface RelatorioExpress {
  id: number;
  numero: string;
  titulo: string;
  autor_id: number;
  autor_nome?: string;
  aprovador_id?: number | null;
  aprovador_nome?: string;
  data_relatorio: string;
  obra_nome: string;
  obra_endereco?: string;
  obra_construtora?: string;
  checklist_data?: string;
  informacoes_tecnicas?: string;
  categoria?: string;
  local?: string;
  descricao?: string;
  lembrete_proxima_visita?: string;
  observacoes_finais?: string;
  status: 'Em preenchimento' | 'Aguardando Aprovação' | 'Aprovado' | 'Rejeitado' | string;
  comentario_aprovacao?: string;
  acompanhantes?: string;
  created_at?: string;
  sync_status?: 'synced' | 'pending' | 'error';
  fotos_count?: number;
  fotos?: FotoRelatorioExpress[];
}

export interface FotoRelatorioExpress {
  id: number;
  relatorio_express_id: number;
  url?: string;
  filename?: string;
  uri_local?: string;
  titulo?: string;
  legenda?: string;
  descricao?: string;
  local?: string;
  base64?: string;
  ordem: number;
  sync_status?: 'synced' | 'pending' | 'error';
}

export interface Reembolso {
  id: number;
  usuario_id: number;
  usuario_nome?: string;
  projeto_id?: number;
  projeto_nome?: string;
  periodo_inicio: string;
  periodo_fim: string;
  quilometragem: number;
  valor_km: number;
  alimentacao: number;
  hospedagem: number;
  outros_gastos: number;
  total?: number;
  status: 'Pendente' | 'Aprovado' | 'Rejeitado' | string;
  observacoes?: string;
  sync_status?: 'synced' | 'pending' | 'error';
}

export interface Contato {
  id: number;
  nome: string;
  cargo?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  projeto_id?: number;
  sync_status?: 'synced' | 'pending' | 'error';
}

export interface Lembrete {
  id: number;
  projeto_id: number;
  projeto_nome?: string;
  texto: string;
  fechado: boolean;
  fechado_em?: string;
  fechado_por_nome?: string;
  criado_em: string;
  criado_por_nome?: string;
  sync_status?: 'synced' | 'pending' | 'error';
}

export interface Notificacao {
  id: number;
  user_id: number;
  titulo: string;
  mensagem: string;
  tipo: string;
  lida: boolean;
  link?: string;
  created_at: string;
}

export interface LegendaPredefinida {
  id: number;
  categoria: 'Acabamentos' | 'Estrutural' | 'Geral' | 'Segurança' | string;
  texto: string;
  ordem?: number;
}

export interface ChecklistItemTemplate {
  id: number;
  categoria: string;
  item: string;
  ordem: number;
}

export interface SyncQueueItem {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  payload: string; // JSON
  created_at: string;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  retries: number;
  error_message?: string;
}
