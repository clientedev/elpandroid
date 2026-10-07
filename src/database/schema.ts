export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  is_master INTEGER DEFAULT 0,
  is_aprovador_express INTEGER DEFAULT 0,
  cargo TEXT,
  telefone TEXT,
  cor_agenda TEXT,
  ativo INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS projetos (
  id INTEGER PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  endereco TEXT,
  latitude REAL,
  longitude REAL,
  tipo_obra TEXT NOT NULL,
  construtora TEXT NOT NULL,
  nome_funcionario TEXT NOT NULL,
  responsavel_id INTEGER NOT NULL,
  email_principal TEXT NOT NULL,
  data_inicio TEXT,
  data_previsao_fim TEXT,
  status TEXT DEFAULT 'Ativo',
  numeracao_inicial INTEGER DEFAULT 1,
  created_at TEXT,
  elementos_construtivos_base TEXT,
  especificacao_chapisco_colante TEXT,
  especificacao_chapisco_alvenaria TEXT,
  especificacao_argamassa_emboco TEXT,
  forma_aplicacao_argamassa TEXT,
  acabamentos_revestimento TEXT,
  acabamento_peitoris TEXT,
  acabamento_muretas TEXT,
  definicao_frisos_cor TEXT,
  definicao_face_inferior_abas TEXT,
  observacoes_projeto_fachada TEXT,
  outras_observacoes TEXT,
  sync_status TEXT DEFAULT 'synced',
  local_updated_at TEXT
);

CREATE TABLE IF NOT EXISTS categorias_obra (
  id INTEGER PRIMARY KEY,
  projeto_id INTEGER NOT NULL,
  nome_categoria TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'synced'
);

CREATE TABLE IF NOT EXISTS visitas (
  id INTEGER PRIMARY KEY,
  numero TEXT NOT NULL,
  projeto_id INTEGER,
  projeto_nome TEXT,
  projeto_outros TEXT,
  responsavel_id INTEGER NOT NULL,
  responsavel_nome TEXT,
  data_inicio TEXT NOT NULL,
  data_fim TEXT NOT NULL,
  data_realizada TEXT,
  observacoes TEXT,
  atividades_realizadas TEXT,
  status TEXT DEFAULT 'Agendada',
  endereco_gps TEXT,
  latitude REAL,
  longitude REAL,
  is_pessoal INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'synced'
);

CREATE TABLE IF NOT EXISTS visita_participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visita_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  confirmado INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS relatorios (
  id INTEGER PRIMARY KEY,
  numero TEXT NOT NULL,
  numero_projeto INTEGER,
  titulo TEXT NOT NULL,
  projeto_id INTEGER NOT NULL,
  projeto_nome TEXT,
  visita_id INTEGER,
  autor_id INTEGER NOT NULL,
  autor_nome TEXT,
  aprovador_id INTEGER,
  aprovador_nome TEXT,
  data_relatorio TEXT,
  data_aprovacao TEXT,
  conteudo TEXT,
  descricao TEXT,
  checklist_data TEXT,
  categoria TEXT,
  local TEXT,
  lembrete_proxima_visita TEXT,
  observacoes_finais TEXT,
  status TEXT DEFAULT 'em_andamento',
  comentario_aprovacao TEXT,
  acompanhantes TEXT,
  created_at TEXT,
  updated_at TEXT,
  uuid TEXT,
  data_criacao_local TEXT,
  data_sincronizacao TEXT,
  sync_status TEXT DEFAULT 'synced'
);

CREATE TABLE IF NOT EXISTS fotos_relatorio (
  id INTEGER PRIMARY KEY,
  relatorio_id INTEGER NOT NULL,
  relatorio_uuid TEXT,
  url TEXT,
  filename TEXT,
  uri_local TEXT,
  titulo TEXT,
  legenda TEXT,
  descricao TEXT,
  tipo_servico TEXT,
  local TEXT,
  ordem INTEGER DEFAULT 0,
  anotacoes_dados TEXT,
  base64 TEXT,
  sync_status TEXT DEFAULT 'synced'
);

CREATE TABLE IF NOT EXISTS relatorios_express (
  id INTEGER PRIMARY KEY,
  numero TEXT NOT NULL,
  titulo TEXT NOT NULL,
  autor_id INTEGER NOT NULL,
  autor_nome TEXT,
  aprovador_id INTEGER,
  aprovador_nome TEXT,
  data_relatorio TEXT,
  obra_nome TEXT NOT NULL,
  obra_endereco TEXT,
  obra_construtora TEXT,
  checklist_data TEXT,
  informacoes_tecnicas TEXT,
  categoria TEXT,
  local TEXT,
  lembrete_proxima_visita TEXT,
  observacoes_finais TEXT,
  status TEXT DEFAULT 'Em preenchimento',
  comentario_aprovacao TEXT,
  acompanhantes TEXT,
  created_at TEXT,
  sync_status TEXT DEFAULT 'synced'
);

CREATE TABLE IF NOT EXISTS fotos_relatorio_express (
  id INTEGER PRIMARY KEY,
  relatorio_express_id INTEGER NOT NULL,
  url TEXT,
  filename TEXT,
  uri_local TEXT,
  titulo TEXT,
  legenda TEXT,
  descricao TEXT,
  ordem INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'synced'
);

CREATE TABLE IF NOT EXISTS reembolsos (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  usuario_nome TEXT,
  projeto_id INTEGER,
  projeto_nome TEXT,
  periodo_inicio TEXT NOT NULL,
  periodo_fim TEXT NOT NULL,
  quilometragem REAL DEFAULT 0,
  valor_km REAL DEFAULT 0,
  alimentacao REAL DEFAULT 0,
  hospedagem REAL DEFAULT 0,
  outros_gastos REAL DEFAULT 0,
  total REAL DEFAULT 0,
  status TEXT DEFAULT 'Pendente',
  observacoes TEXT,
  comprovante_uri TEXT,
  comprovante_base64 TEXT,
  aprovado_por_nome TEXT,
  aprovado_em TEXT,
  sync_status TEXT DEFAULT 'synced'
);

CREATE TABLE IF NOT EXISTS contatos (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  empresa TEXT,
  projeto_id INTEGER,
  sync_status TEXT DEFAULT 'synced'
);

CREATE TABLE IF NOT EXISTS lembretes (
  id INTEGER PRIMARY KEY,
  projeto_id INTEGER NOT NULL,
  projeto_nome TEXT,
  texto TEXT NOT NULL,
  fechado INTEGER DEFAULT 0,
  fechado_em TEXT,
  fechado_por_nome TEXT,
  criado_em TEXT,
  criado_por_nome TEXT,
  sync_status TEXT DEFAULT 'synced'
);

CREATE TABLE IF NOT EXISTS notificacoes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  tipo TEXT,
  lida INTEGER DEFAULT 0,
  link TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS legendas_predefinidas (
  id INTEGER PRIMARY KEY,
  categoria TEXT NOT NULL,
  texto TEXT NOT NULL,
  ordem INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  retries INTEGER DEFAULT 0,
  error_message TEXT
);
`;

export const SEED_LEGENDAS = [
  { categoria: 'Acabamentos', texto: 'Fissura superficial no revestimento de argamassa', ordem: 1 },
  { categoria: 'Acabamentos', texto: 'Descolamento cerâmico observado na fachada', ordem: 2 },
  { categoria: 'Acabamentos', texto: 'Falha de rejuntamento em pastilhas', ordem: 3 },
  { categoria: 'Estrutural', texto: 'Trinca estrutural com abertura superior a 1mm', ordem: 1 },
  { categoria: 'Estrutural', texto: 'Armadura exposta com sinais de corrosão', ordem: 2 },
  { categoria: 'Estrutural', texto: 'Desaprumo aparente em viga / pilar', ordem: 3 },
  { categoria: 'Geral', texto: 'Limpeza e organização do canteiro adequadas', ordem: 1 },
  { categoria: 'Geral', texto: 'Impermeabilização em conformidade com projeto', ordem: 2 },
  { categoria: 'Segurança', texto: 'Guarda-corpo provisório instalado corretamente', ordem: 1 },
  { categoria: 'Segurança', texto: 'EPIs em uso obrigatório por todos colaboradores', ordem: 2 }
];
