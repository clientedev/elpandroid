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
  em_edicao_por_id INTEGER,
  em_edicao_por_nome TEXT,
  em_edicao_em TEXT,
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

CREATE TABLE IF NOT EXISTS checklist_obra_progresso (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL,
  checklist_item_id INTEGER,
  item_texto TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  aprovado INTEGER DEFAULT 1,
  aprovado_em_relatorio_id INTEGER,
  aprovado_em_relatorio_numero TEXT,
  data_aprovacao TEXT,
  observacao TEXT
);

CREATE TABLE IF NOT EXISTS checklist_custom_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  ativo INTEGER DEFAULT 1
);
`;

export const SEED_CHECKLIST = [
  { ordem: 1, item: 'Chapisco colante e regularização da base estrutural' },
  { ordem: 2, item: 'Aplicação de tela metálica / fibra de reforço e ancoragem' },
  { ordem: 3, item: 'Aplicação e tempo de cura da argamassa de emboço' },
  { ordem: 4, item: 'Assentamento de revestimentos cerâmicos / pastilhas de fachada' },
  { ordem: 5, item: 'Selamento de juntas de dilatação, frisos e caimentos' },
  { ordem: 6, item: 'Verificação de peitoris, pingadeiras, muretas e impermeabilização' },
  { ordem: 7, item: 'Limpeza e desincrustação final da fachada' },
];

export const SEED_LEGENDAS = [
  { categoria: 'Informações Técnicas', texto: 'Elementos construtivos da base', ordem: 1 },
  { categoria: 'Informações Técnicas', texto: 'Especificação chapisco colante', ordem: 2 },
  { categoria: 'Informações Técnicas', texto: 'Especificação chapisco da alvenaria', ordem: 3 },
  { categoria: 'Informações Técnicas', texto: 'Especificação da argamassa de emboço', ordem: 4 },
  { categoria: 'Informações Técnicas', texto: 'Forma da aplicação da argamassa de emboço', ordem: 5 },
  { categoria: 'Informações Técnicas', texto: 'Acabamentos do revestimento', ordem: 6 },
  { categoria: 'Informações Técnicas', texto: 'Acabamento em peitoris de janela', ordem: 7 },
  { categoria: 'Informações Técnicas', texto: 'Acabamento em muretas de terraços', ordem: 8 },
  { categoria: 'Informações Técnicas', texto: 'Definição sobre frisos de mudança de cor de textura', ordem: 9 },
  { categoria: 'Informações Técnicas', texto: 'Definição sobre face inferior das abas (friso pingadeira ou caimento invertido)', ordem: 10 },
  { categoria: 'Informações Técnicas', texto: 'Caso haja projeto de fachada, especificar o projetista e fazer observações sobre procedimentos específicos ou divergências de orientações', ordem: 11 },
  { categoria: 'Informações Técnicas', texto: 'Outras observações', ordem: 12 },
  { categoria: 'Acabamentos', texto: 'Fissura superficial no revestimento de argamassa', ordem: 13 },
  { categoria: 'Acabamentos', texto: 'Descolamento cerâmico observado na fachada', ordem: 14 },
  { categoria: 'Acabamentos', texto: 'Falha de rejuntamento em pastilhas', ordem: 15 },
  { categoria: 'Estrutural', texto: 'Trinca estrutural com abertura superior a 1mm', ordem: 16 },
  { categoria: 'Estrutural', texto: 'Armadura exposta com sinais de corrosão', ordem: 17 },
  { categoria: 'Estrutural', texto: 'Desaprumo aparente em viga / pilar', ordem: 18 },
  { categoria: 'Geral', texto: 'Limpeza e organização do canteiro adequadas', ordem: 19 },
  { categoria: 'Geral', texto: 'Impermeabilização em conformidade com projeto', ordem: 20 },
  { categoria: 'Segurança', texto: 'Guarda-corpo provisório instalado corretamente', ordem: 21 },
  { categoria: 'Segurança', texto: 'EPIs em uso obrigatório por todos colaboradores', ordem: 22 }
];
