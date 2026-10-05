from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from app import db
import os
from cryptography.fernet import Fernet
from sqlalchemy.dialects.postgresql import JSONB
import pytz

# Brazil timezone for datetime defaults
BRAZIL_TZ = pytz.timezone('America/Sao_Paulo')

def brazil_now():
    """Return current datetime in Brazil timezone (naive for DB storage)"""
    return datetime.now(BRAZIL_TZ).replace(tzinfo=None)

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    nome_completo = db.Column(db.String(200), nullable=False)
    cargo = db.Column(db.String(100))
    telefone = db.Column(db.String(20))
    is_master = db.Column(db.Boolean, default=False)
    is_developer = db.Column(db.Boolean, default=False)  # Novo tipo de usuário
    is_aprovador_express = db.Column(db.Boolean, default=False)  # Aprovador de Relatório Express
    primeiro_login = db.Column(db.Boolean, default=True)  # Campo para controlar primeiro login
    ativo = db.Column(db.Boolean, default=True)
    cor_agenda = db.Column(db.String(7), default="#0EA5E9")  # Cor HEX para agenda - Item 29
    fcm_token = db.Column(db.Text, nullable=True)  # Token do Firebase Cloud Messaging para push notifications
    reset_token = db.Column(db.String(100), nullable=True, unique=True)  # Token para recuperação de senha
    reset_token_expires = db.Column(db.DateTime, nullable=True)  # Expiração do token de recuperação
    created_at = db.Column(db.DateTime, default=brazil_now)
    
    @property
    def is_aprovador(self):
        """Propriedade para verificar se usuário é aprovador - conforme especificação do documento"""
        try:
            if self.is_master:
                return True
                
            # Importar aqui para evitar circular import
            from routes import current_user_is_aprovador
            return current_user_is_aprovador()
        except Exception:
            return False

class UserEmailConfig(db.Model):
    """Configuração de e-mail por usuário para envio de relatórios"""
    __tablename__ = 'user_email_config'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True)
    smtp_server = db.Column(db.String(255), nullable=False)
    smtp_port = db.Column(db.Integer, nullable=False, default=587)
    email_address = db.Column(db.String(255), nullable=False)
    email_password = db.Column(db.Text, nullable=False)  # Base64 encoded password
    use_tls = db.Column(db.Boolean, nullable=False, default=True)
    use_ssl = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    last_test_status = db.Column(db.String(20), default='pending')  # 'pending', 'success', 'error'
    last_test_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=brazil_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=brazil_now, onupdate=brazil_now)
    
    # Relationship
    user = db.relationship('User', backref='email_config')
    
    def set_password(self, password):
        """Encrypt password using Fernet encryption"""
        key = self._get_encryption_key()
        f = Fernet(key)
        encrypted_password = f.encrypt(password.encode())
        self.email_password = encrypted_password.decode()
    
    def get_password(self):
        """Decrypt password using Fernet encryption"""
        key = self._get_encryption_key()
        f = Fernet(key)
        decrypted_password = f.decrypt(self.email_password.encode())
        return decrypted_password.decode()
    
    def _get_encryption_key(self):
        """Get encryption key for password encryption - REQUIRED environment variable"""
        key = os.environ.get('EMAIL_PASSWORD_ENCRYPTION_KEY')
        if not key:
            raise ValueError(
                "EMAIL_PASSWORD_ENCRYPTION_KEY environment variable is required for user email password encryption. "
                "Generate a key using: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
            )
        return key.encode() if isinstance(key, str) else key
    
    def __repr__(self):
        return f'<UserEmailConfig {self.email_address} for user {self.user_id}>'

class UserDevice(db.Model):
    """Track multiple devices per user for push notifications"""
    __tablename__ = 'user_devices'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    player_id = db.Column(db.String(255), unique=True, nullable=False)
    device_info = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=brazil_now)
    last_active = db.Column(db.DateTime, default=brazil_now, onupdate=brazil_now)
    
    # Relationship
    user = db.relationship('User', backref=db.backref('devices', lazy='dynamic', cascade='all, delete-orphan'))
    
    def __repr__(self):
        return f'<UserDevice {self.player_id[:20]}... for user {self.user_id}>'

class GoogleDriveToken(db.Model):
    """Armazenamento seguro de tokens OAuth do Google Drive"""
    __tablename__ = 'google_drive_tokens'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True)
    encrypted_token = db.Column(db.Text, nullable=False)
    encrypted_refresh_token = db.Column(db.Text, nullable=True)
    token_expiry = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=brazil_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=brazil_now, onupdate=brazil_now)
    
    user = db.relationship('User', backref='google_drive_token')
    
    def _get_encryption_key(self):
        """Get encryption key - uses same key as email config or generates one"""
        key = os.environ.get('EMAIL_PASSWORD_ENCRYPTION_KEY')
        if not key:
            key = os.environ.get('SECRET_KEY', 'default-key-for-development-only')
            import hashlib
            key = hashlib.sha256(key.encode()).digest()
            import base64
            key = base64.urlsafe_b64encode(key)
        return key.encode() if isinstance(key, str) else key
    
    def set_tokens(self, access_token: str, refresh_token: str = None):
        """Encrypt and store tokens"""
        key = self._get_encryption_key()
        f = Fernet(key)
        self.encrypted_token = f.encrypt(access_token.encode()).decode()
        if refresh_token:
            self.encrypted_refresh_token = f.encrypt(refresh_token.encode()).decode()
    
    def get_access_token(self) -> str:
        """Decrypt and return access token"""
        key = self._get_encryption_key()
        f = Fernet(key)
        return f.decrypt(self.encrypted_token.encode()).decode()
    
    def get_refresh_token(self) -> str:
        """Decrypt and return refresh token"""
        if not self.encrypted_refresh_token:
            return None
        key = self._get_encryption_key()
        f = Fernet(key)
        return f.decrypt(self.encrypted_refresh_token.encode()).decode()


class TipoObra(db.Model):
    __tablename__ = 'tipos_obra'
    
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    descricao = db.Column(db.Text)
    ativo = db.Column(db.Boolean, default=True)

class Projeto(db.Model):
    __tablename__ = 'projetos'
    
    id = db.Column(db.Integer, primary_key=True)
    numero = db.Column(db.String(20), unique=True, nullable=False)
    nome = db.Column(db.String(200), nullable=False)
    descricao = db.Column(db.Text)
    endereco = db.Column(db.Text)
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    tipo_obra = db.Column(db.String(100), nullable=False)
    construtora = db.Column(db.String(200), nullable=False)  # Nome da construtora
    nome_funcionario = db.Column(db.String(200), nullable=False)  # Nome do funcionário responsável
    responsavel_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    email_principal = db.Column(db.String(255), nullable=False)  # E-mail principal obrigatório
    data_inicio = db.Column(db.Date)
    data_previsao_fim = db.Column(db.Date)
    status = db.Column(db.String(50), default='Ativo')
    numeracao_inicial = db.Column(db.Integer, default=1, nullable=False)
    created_at = db.Column(db.DateTime, default=brazil_now)
    
    # Informações Técnicas (todos opcionais)
    elementos_construtivos_base = db.Column(db.Text, nullable=True)
    especificacao_chapisco_colante = db.Column(db.Text, nullable=True)
    especificacao_chapisco_alvenaria = db.Column(db.Text, nullable=True)
    especificacao_argamassa_emboco = db.Column(db.Text, nullable=True)
    forma_aplicacao_argamassa = db.Column(db.Text, nullable=True)
    acabamentos_revestimento = db.Column(db.Text, nullable=True)
    acabamento_peitoris = db.Column(db.Text, nullable=True)
    acabamento_muretas = db.Column(db.Text, nullable=True)
    definicao_frisos_cor = db.Column(db.Text, nullable=True)
    definicao_face_inferior_abas = db.Column(db.Text, nullable=True)
    observacoes_projeto_fachada = db.Column(db.Text, nullable=True)
    outras_observacoes = db.Column(db.Text, nullable=True)
    
    @property
    def responsavel(self):
        return db.session.get(User, self.responsavel_id)

class CategoriaObra(db.Model):
    """Modelo para categorias customizáveis por obra/projeto - Item 16"""
    __tablename__ = 'categorias_obra'
    
    id = db.Column(db.Integer, primary_key=True)
    projeto_id = db.Column(db.Integer, db.ForeignKey('projetos.id', ondelete='CASCADE'), nullable=False)
    nome_categoria = db.Column(db.String(100), nullable=False)
    ordem = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=brazil_now)
    updated_at = db.Column(db.DateTime, default=brazil_now, onupdate=brazil_now)
    
    # Relacionamento com Projeto
    projeto = db.relationship('Projeto', backref=db.backref('categorias', lazy='dynamic', order_by='CategoriaObra.ordem'))
    
    # Evitar duplicação de nomes dentro da mesma obra
    __table_args__ = (
        db.UniqueConstraint('projeto_id', 'nome_categoria', name='uq_categoria_por_projeto'),
    )
    
    def to_dict(self):
        """Serializa a categoria para dicionário JSON-compatível"""
        return {
            "id": self.id,
            "nome": self.nome_categoria,
            "ordem": self.ordem,
            "status": "Cadastrada",
            "project_id": self.projeto_id
        }
    
    def __repr__(self):
        return f'<CategoriaObra {self.nome_categoria} - Projeto {self.projeto_id}>'

class Contato(db.Model):
    __tablename__ = 'contatos'
    
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(120))
    telefone = db.Column(db.String(20))
    empresa = db.Column(db.String(200))
    cargo = db.Column(db.String(100))
    observacoes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=brazil_now)

class ContatoProjeto(db.Model):
    __tablename__ = 'contatos_projetos'
    
    id = db.Column(db.Integer, primary_key=True)
    projeto_id = db.Column(db.Integer, db.ForeignKey('projetos.id'), nullable=False)
    contato_id = db.Column(db.Integer, db.ForeignKey('contatos.id'), nullable=False)
    tipo_relacionamento = db.Column(db.String(100))
    is_aprovador = db.Column(db.Boolean, default=False)
    receber_relatorios = db.Column(db.Boolean, default=False)

class EmailCliente(db.Model):
    __tablename__ = 'emails_clientes'
    
    id = db.Column(db.Integer, primary_key=True)
    projeto_id = db.Column(db.Integer, db.ForeignKey('projetos.id'), nullable=False)
    email = db.Column(db.String(255), nullable=True)  # Permite NULL para contatos sem email
    nome_contato = db.Column(db.String(200), nullable=False)
    cargo = db.Column(db.String(100))
    empresa = db.Column(db.String(200))
    telefone = db.Column(db.String(20))  # Campo telefone adicionado
    receber_notificacoes = db.Column(db.Boolean, default=True)
    receber_relatorios = db.Column(db.Boolean, default=True)
    ativo = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=brazil_now)
    updated_at = db.Column(db.DateTime, default=brazil_now, onupdate=brazil_now)
    
    # Relacionamento com Projeto
    projeto = db.relationship('Projeto', backref='emails_clientes')
    
    # Validação única para email + projeto (apenas quando email não é nulo)
    __table_args__ = (db.UniqueConstraint('projeto_id', 'email', name='unique_email_por_projeto'),)

class FuncionarioProjeto(db.Model):
    __tablename__ = 'funcionarios_projetos'
    
    id = db.Column(db.Integer, primary_key=True)
    projeto_id = db.Column(db.Integer, db.ForeignKey('projetos.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    nome_funcionario = db.Column(db.String(200), nullable=False)
    cargo = db.Column(db.String(100))
    empresa = db.Column(db.String(200))
    is_responsavel_principal = db.Column(db.Boolean, default=False)
    ativo = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=brazil_now)
    updated_at = db.Column(db.DateTime, default=brazil_now, onupdate=brazil_now)
    
    # Relacionamentos
    projeto = db.relationship('Projeto', backref='funcionarios_projetos')
    funcionario = db.relationship('User', backref='projetos_funcionario')
    
    # Validação única para funcionário + projeto (somente quando user_id não for nulo)
    __table_args__ = (db.UniqueConstraint('projeto_id', 'user_id', name='unique_funcionario_por_projeto'),)

class Visita(db.Model):
    __tablename__ = 'visitas'
    
    id = db.Column(db.Integer, primary_key=True)
    numero = db.Column(db.String(20), unique=True, nullable=False)
    projeto_id = db.Column(db.Integer, db.ForeignKey('projetos.id'), nullable=True)  # Agora pode ser NULL para 'Outros'
    projeto_outros = db.Column(db.String(300), nullable=True)  # Nome do projeto quando é 'Outros'
    responsavel_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    data_inicio = db.Column(db.DateTime, nullable=False)  # Renomeado de data_agendada
    data_fim = db.Column(db.DateTime, nullable=False)  # Nova: data e hora de fim
    data_realizada = db.Column(db.DateTime, nullable=True)
    observacoes = db.Column(db.Text)  # Renomeado de objetivo, agora opcional
    atividades_realizadas = db.Column(db.Text)
    status = db.Column(db.String(50), default='Agendada')
    endereco_gps = db.Column(db.String(200))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    is_pessoal = db.Column(db.Boolean, default=False)  # Flag para compromissos pessoais - Item 31
    criado_por = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)  # Usuário criador - Item 31
    google_event_id = db.Column(db.String(255), nullable=True)  # ID do evento no Google Calendar para evitar duplicação
    created_at = db.Column(db.DateTime, default=brazil_now)
    
    @property
    def projeto(self):
        if self.projeto_id:
            return db.session.get(Projeto, self.projeto_id)
        return None
    
    @property
    def projeto_nome(self):
        """Retorna o nome do projeto ou o valor de 'outros'"""
        if self.is_pessoal:
            return "Compromisso Pessoal"
        elif self.projeto_id and self.projeto:
            return f"{self.projeto.numero} - {self.projeto.nome}"
        elif self.projeto_outros:
            return self.projeto_outros
        return "Outros"
    
    @property 
    def responsavel(self):
        return db.session.get(User, self.responsavel_id)
    
    @property
    def data_agendada(self):
        """Propriedade para compatibilidade - retorna data_inicio"""
        return self.data_inicio
    
    @property
    def objetivo(self):
        """Propriedade para compatibilidade - retorna observacoes"""
        return self.observacoes

class VisitaParticipante(db.Model):
    """Modelo para armazenar múltiplos participantes de uma visita"""
    __tablename__ = 'visita_participantes'
    
    id = db.Column(db.Integer, primary_key=True)
    visita_id = db.Column(db.Integer, db.ForeignKey('visitas.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    confirmado = db.Column(db.Boolean, default=False)  # Se o participante confirmou presença
    created_at = db.Column(db.DateTime, default=brazil_now)
    
    # Relacionamentos
    visita = db.relationship('Visita', backref=db.backref('participantes', lazy='dynamic'))
    user = db.relationship('User', backref='visitas_participante')
    
    # Evitar duplicatas
    __table_args__ = (db.UniqueConstraint('visita_id', 'user_id', name='unique_visita_participante'),)

class Relatorio(db.Model):
    __tablename__ = 'relatorios'
    
    id = db.Column(db.Integer, primary_key=True)
    numero = db.Column(db.String(20), nullable=False)  # Unique per project, not globally
    numero_projeto = db.Column(db.Integer, nullable=True)  # Project-specific sequential numbering
    titulo = db.Column(db.String(300), nullable=False, default='Relatório de visita')
    projeto_id = db.Column(db.Integer, db.ForeignKey('projetos.id'), nullable=False)
    visita_id = db.Column(db.Integer, db.ForeignKey('visitas.id'), nullable=True)
    autor_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    aprovador_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    data_relatorio = db.Column(db.DateTime, default=brazil_now)
    data_aprovacao = db.Column(db.DateTime, nullable=True)
    conteudo = db.Column(db.Text)
    descricao = db.Column(db.Text, nullable=True)  # Descrição detalhada do relatório
    checklist_data = db.Column(db.Text)  # JSON string for checklist data
    
    # Novos campos conforme especificação técnica
    categoria = db.Column(db.String(100), nullable=True)  # Categoria do relatório
    local = db.Column(db.String(255), nullable=True)  # Local do relatório
    lembrete_proxima_visita = db.Column(db.DateTime, nullable=True)  # Lembrete para próxima visita (TIMESTAMP)
    observacoes_finais = db.Column(db.Text, nullable=True)  # Observações finais do relatório
    
    status = db.Column(db.String(50), default='em_andamento')  # em_andamento (legado), preenchimento, Aguardando Aprovação, Aprovado, Rejeitado
    comentario_aprovacao = db.Column(db.Text)
    acompanhantes = db.Column(JSONB, nullable=True)  # JSONB array of visit attendees
    criado_por = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)  # Usuário que criou
    atualizado_por = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)  # Último usuário que atualizou
    created_at = db.Column(db.DateTime, default=brazil_now)
    updated_at = db.Column(db.DateTime, default=brazil_now, onupdate=brazil_now)
    
    # Composite unique constraint: numero must be unique within each project
    __table_args__ = (db.UniqueConstraint('projeto_id', 'numero', name='uq_relatorios_projeto_numero'),)
    
    # Relacionamentos SQLAlchemy otimizados (evitam queries adicionais)
    autor = db.relationship('User', foreign_keys=[autor_id], backref='relatorios_criados', lazy='select')
    aprovador = db.relationship('User', foreign_keys=[aprovador_id], backref='relatorios_aprovados', lazy='select')  
    projeto = db.relationship('Projeto', foreign_keys=[projeto_id], backref='relatorios', lazy='select')
    
    # Manter properties para compatibilidade (caso sejam usadas em outros lugares)
    @property
    def autor_legacy(self):
        return db.session.get(User, self.autor_id)
    
    @property
    def aprovador_legacy(self):
        return db.session.get(User, self.aprovador_id) if self.aprovador_id else None

    @property
    def projeto_legacy(self):
        return db.session.get(Projeto, self.projeto_id)

    @property
    def visita(self):
        return db.session.get(Visita, self.visita_id) if self.visita_id else None
    

class ChecklistTemplate(db.Model):
    __tablename__ = 'checklist_templates'
    
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(200), nullable=False)
    descricao = db.Column(db.Text)
    obrigatorio = db.Column(db.Boolean, default=False)
    ordem = db.Column(db.Integer, default=0)
    ativo = db.Column(db.Boolean, default=True)

class ChecklistItem(db.Model):
    __tablename__ = 'checklist_items'
    
    id = db.Column(db.Integer, primary_key=True)
    visita_id = db.Column(db.Integer, db.ForeignKey('visitas.id'), nullable=False)
    template_id = db.Column(db.Integer, db.ForeignKey('checklist_templates.id'), nullable=True)
    pergunta = db.Column(db.Text, nullable=False)
    resposta = db.Column(db.Text)
    concluido = db.Column(db.Boolean, default=False)
    obrigatorio = db.Column(db.Boolean, default=False)
    ordem = db.Column(db.Integer, default=0)
    
    @property
    def visita(self):
        return db.session.get(Visita, self.visita_id)

class ComunicacaoVisita(db.Model):
    __tablename__ = 'comunicacoes_visitas'
    
    id = db.Column(db.Integer, primary_key=True)
    visita_id = db.Column(db.Integer, db.ForeignKey('visitas.id'), nullable=False)
    usuario_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    mensagem = db.Column(db.Text, nullable=False)
    tipo = db.Column(db.String(50), default='Comunicacao')
    created_at = db.Column(db.DateTime, default=brazil_now)
    
    @property
    def visita(self):
        return db.session.get(Visita, self.visita_id)
    
    @property
    def usuario(self):
        return db.session.get(User, self.usuario_id)
    
    @property
    def fotos(self):
        return FotoRelatorio.query.filter_by(relatorio_id=self.id).order_by(FotoRelatorio.ordem).all()

class FotoRelatorio(db.Model):
    __tablename__ = 'fotos_relatorio'
    
    id = db.Column(db.Integer, primary_key=True)
    relatorio_id = db.Column(db.Integer, db.ForeignKey('relatorios.id', ondelete='CASCADE'), nullable=False)
    
    # Campos de URL e filesystem (nova estrutura)
    url = db.Column(db.Text, nullable=True)  # URL da imagem (path relativo ou absoluto)
    filename = db.Column(db.String(255), nullable=True)  # Nome do arquivo
    filename_original = db.Column(db.String(255))
    filename_anotada = db.Column(db.String(255))
    
    # Metadados da foto
    titulo = db.Column(db.String(500))
    legenda = db.Column(db.Text, nullable=True)  # Legenda da imagem
    descricao = db.Column(db.Text)
    tipo_servico = db.Column(db.String(100))
    local = db.Column(db.String(300))
    anotacoes_dados = db.Column(db.JSON)
    ordem = db.Column(db.Integer, default=0)  # Ordem de exibição (começando em 0)
    coordenadas_anotacao = db.Column(db.JSON)
    
    # Armazenamento binário (legacy - manter compatibilidade)
    imagem = db.Column(db.LargeBinary, nullable=True)
    imagem_hash = db.Column(db.String(64), nullable=True)
    content_type = db.Column(db.String(100), nullable=True)
    imagem_size = db.Column(db.Integer, nullable=True)
    
    created_at = db.Column(db.DateTime, default=brazil_now)
    
    # Relacionamento
    relatorio = db.relationship('Relatorio', backref=db.backref('imagens', lazy='dynamic', order_by='FotoRelatorio.ordem', cascade='all, delete-orphan'))

class EnvioRelatorio(db.Model):
    __tablename__ = 'envios_relatorios'
    
    id = db.Column(db.Integer, primary_key=True)
    relatorio_id = db.Column(db.Integer, db.ForeignKey('relatorios.id'), nullable=False)
    email_destinatario = db.Column(db.String(120), nullable=False)
    nome_destinatario = db.Column(db.String(200))
    data_envio = db.Column(db.DateTime, default=brazil_now)
    status_entrega = db.Column(db.String(50), default='Enviado')
    tentativas = db.Column(db.Integer, default=1)
    erro_envio = db.Column(db.Text)

class Reembolso(db.Model):
    __tablename__ = 'reembolsos'
    
    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    projeto_id = db.Column(db.Integer, db.ForeignKey('projetos.id'))
    periodo_inicio = db.Column(db.Date, nullable=False)
    periodo_fim = db.Column(db.Date, nullable=False)
    quilometragem = db.Column(db.Float, default=0)
    valor_km = db.Column(db.Float, default=0)
    alimentacao = db.Column(db.Float, default=0)
    hospedagem = db.Column(db.Float, default=0)
    outros_gastos = db.Column(db.Float, default=0)
    descricao_outros = db.Column(db.Text)
    observacoes = db.Column(db.Text)
    total = db.Column(db.Float, default=0)
    status = db.Column(db.String(50), default='Pendente')
    aprovado_por = db.Column(db.Integer, db.ForeignKey('users.id'))
    data_aprovacao = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=brazil_now)

class LegendaPredefinida(db.Model):
    __tablename__ = 'legendas_predefinidas'
    
    id = db.Column(db.Integer, primary_key=True)
    texto = db.Column(db.String(500), nullable=False)
    categoria = db.Column(db.String(100), nullable=False, default='Geral')
    ativo = db.Column(db.Boolean, default=True)
    criado_por = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=brazil_now)
    updated_at = db.Column(db.DateTime, default=brazil_now, onupdate=brazil_now)
    
    # Relacionamento
    criador = db.relationship('User', backref='legendas_criadas')

class AprovadorPadrao(db.Model):
    """Configuração de aprovador - Global (único) ou Temporário por projeto"""
    __tablename__ = 'aprovadores_padrao'
    
    id = db.Column(db.Integer, primary_key=True)
    is_global = db.Column(db.Boolean, default=False, nullable=False)  # True = Aprovador Global único
    projeto_id = db.Column(db.Integer, db.ForeignKey('projetos.id'), nullable=True)  # NULL se is_global=True
    aprovador_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    ativo = db.Column(db.Boolean, default=True)
    prioridade = db.Column(db.Integer, default=1)  # 1 = mais alta prioridade
    observacoes = db.Column(db.Text)
    criado_por = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=brazil_now)
    updated_at = db.Column(db.DateTime, default=brazil_now, onupdate=brazil_now)
    
    # Relacionamentos
    projeto = db.relationship('Projeto', backref='aprovadores_padrao')
    aprovador = db.relationship('User', foreign_keys=[aprovador_id], backref='aprovacoes_padrao')
    criador = db.relationship('User', foreign_keys=[criado_por], backref='configuracoes_aprovador_criadas')
    
    # Validação única: um aprovador por projeto para temporários
    __table_args__ = (db.UniqueConstraint('projeto_id', 'aprovador_id', name='unique_aprovador_projeto'),)
    
    @property
    def tipo_aprovador(self):
        """Retorna o tipo do aprovador: 'Global' ou 'Temporário'"""
        return "Global" if self.is_global else "Temporário"
    
    def __repr__(self):
        if self.is_global:
            return f'<AprovadorGlobal: {self.aprovador.nome_completo if self.aprovador else "N/A"}>'
        projeto_nome = self.projeto.nome if self.projeto else "Sem Projeto"
        aprovador_nome = self.aprovador.nome_completo if self.aprovador else "N/A"
        return f'<AprovadorTemporário {projeto_nome} -> {aprovador_nome}>'

class ChecklistPadrao(db.Model):
    __tablename__ = 'checklist_padrao'
    
    id = db.Column(db.Integer, primary_key=True)
    texto = db.Column(db.String(500), nullable=False)
    ordem = db.Column(db.Integer, default=0)
    ativo = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=brazil_now)
    updated_at = db.Column(db.DateTime, default=brazil_now, onupdate=brazil_now)
    
    def __repr__(self):
        return f'<ChecklistPadrao {self.texto}>'

class LogEnvioEmail(db.Model):
    __tablename__ = 'log_envio_emails'
    
    id = db.Column(db.Integer, primary_key=True)
    projeto_id = db.Column(db.Integer, db.ForeignKey('projetos.id'), nullable=False)
    relatorio_id = db.Column(db.Integer, db.ForeignKey('relatorios.id'), nullable=False)
    usuario_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    destinatarios = db.Column(db.Text, nullable=False)  # JSON com lista de emails
    cc = db.Column(db.Text)  # JSON com lista de emails CC
    bcc = db.Column(db.Text)  # JSON com lista de emails BCC
    assunto = db.Column(db.String(500), nullable=False)
    status = db.Column(db.String(50), nullable=False)  # 'enviado', 'falhou', 'pendente'
    erro_detalhes = db.Column(db.Text)  # Detalhes do erro se houver
    data_envio = db.Column(db.DateTime, default=brazil_now)
    
    # Relacionamentos
    projeto = db.relationship('Projeto', backref='logs_envio_email')
    relatorio = db.relationship('Relatorio', backref='logs_envio_email')
    usuario = db.relationship('User', backref='logs_envio_email')



class ConfiguracaoEmail(db.Model):
    __tablename__ = 'configuracao_email'
    
    id = db.Column(db.Integer, primary_key=True)
    nome_configuracao = db.Column(db.String(100), nullable=False, unique=True)
    servidor_smtp = db.Column(db.String(255), nullable=False)
    porta_smtp = db.Column(db.Integer, nullable=False)
    use_tls = db.Column(db.Boolean, default=True)
    use_ssl = db.Column(db.Boolean, default=False)
    email_remetente = db.Column(db.String(255), nullable=False)
    nome_remetente = db.Column(db.String(200), nullable=False)
    ativo = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=brazil_now)
    
    # Template padrão para e-mails
    template_assunto = db.Column(db.String(500), default="Relatório do Projeto {projeto_nome} - {data}")
    template_corpo = db.Column(db.Text, default="""<p>Prezado(a) {nome_cliente},</p>

<p>Segue em anexo o relatório da obra/projeto conforme visita realizada em {data_visita}.</p>

<p>Em caso de dúvidas, favor entrar em contato conosco.</p>

<p>Atenciosamente,<br>
Equipe ELP Consultoria e Engenharia<br>
Engenharia Civil & Fachadas</p>""")

class ChecklistObra(db.Model):
    """Checklist personalizado por projeto/obra"""
    __tablename__ = "checklist_obra"

    id = db.Column(db.Integer, primary_key=True)
    projeto_id = db.Column(db.Integer, db.ForeignKey("projetos.id"), nullable=False)
    texto = db.Column(db.String(500), nullable=False)
    ordem = db.Column(db.Integer, default=0)
    ativo = db.Column(db.Boolean, default=True)
    criado_por = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=brazil_now)
    updated_at = db.Column(db.DateTime, default=brazil_now, onupdate=brazil_now)

    # Completion tracking — per project stage
    concluido = db.Column(db.Boolean, default=False, nullable=False)
    concluido_relatorio_id = db.Column(db.Integer, db.ForeignKey("relatorios.id"), nullable=True)
    concluido_em = db.Column(db.DateTime, nullable=True)

    # Relacionamentos
    projeto = db.relationship("Projeto", backref="checklist_personalizado")
    criador = db.relationship("User", backref="checklists_criados")
    concluido_relatorio = db.relationship("Relatorio", foreign_keys=[concluido_relatorio_id], backref="checklist_items_concluidos")

    # Validação única para ordem dentro do projeto
    __table_args__ = (db.UniqueConstraint("projeto_id", "ordem", name="unique_ordem_por_projeto"),)

    def __repr__(self):
        return f"<ChecklistObra {self.projeto.nome}: {self.texto}>"

class ProjetoChecklistConfig(db.Model):
    """Configuração de checklist por projeto - usar padrão ou personalizado"""
    __tablename__ = "projeto_checklist_config"

    id = db.Column(db.Integer, primary_key=True)
    projeto_id = db.Column(db.Integer, db.ForeignKey("projetos.id"), nullable=False, unique=True)
    tipo_checklist = db.Column(db.String(20), nullable=False, default="padrao")  # "padrao" ou "personalizado"
    criado_por = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=brazil_now)
    updated_at = db.Column(db.DateTime, default=brazil_now, onupdate=brazil_now)

    # Relacionamentos
    projeto = db.relationship("Projeto", backref=db.backref("checklist_config", uselist=False))
    criador = db.relationship("User", backref="configs_checklist_criadas")

    def __repr__(self):
        return f"<ProjetoChecklistConfig {self.projeto.nome}: {self.tipo_checklist}>"

class Notificacao(db.Model):
    """Modelo para notificações automáticas do sistema"""
    __tablename__ = 'notificacoes'
    __table_args__ = {'extend_existing': True}
    
    id = db.Column(db.Integer, primary_key=True)
    relatorio_id = db.Column(db.Integer, db.ForeignKey('relatorios.id'), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    usuario_origem_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    usuario_destino_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    tipo = db.Column(db.String(50), nullable=False)  # obra_criada, relatorio_pendente, relatorio_reprovado, aprovado, rejeitado
    titulo = db.Column(db.String(300), nullable=False)
    mensagem = db.Column(db.Text, nullable=False)
    link_destino = db.Column(db.String(500), nullable=True)
    status = db.Column(db.String(50), default='nao_lida')  # nova, lida, nao_lida
    lida_em = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=brazil_now, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=True)
    email_enviado = db.Column(db.Boolean, default=False)
    email_sucesso = db.Column(db.Boolean, nullable=True)
    email_erro = db.Column(db.Text, nullable=True)
    push_enviado = db.Column(db.Boolean, default=False)
    push_sucesso = db.Column(db.Boolean, nullable=True)
    push_erro = db.Column(db.Text, nullable=True)
    
    # Relacionamentos
    relatorio = db.relationship('Relatorio', backref='notificacoes', foreign_keys=[relatorio_id])
    usuario = db.relationship('User', foreign_keys=[user_id], backref=db.backref('notificacoes', lazy='dynamic', order_by='Notificacao.created_at.desc()'))
    usuario_origem = db.relationship('User', foreign_keys=[usuario_origem_id], backref='notificacoes_enviadas')
    usuario_destino = db.relationship('User', foreign_keys=[usuario_destino_id], backref='notificacoes_recebidas')
    
    def __init__(self, **kwargs):
        super(Notificacao, self).__init__(**kwargs)
        if self.created_at and not self.expires_at:
            from datetime import timedelta
            self.expires_at = self.created_at + timedelta(hours=24)
    
    def to_dict(self):
        """Serializa a notificação para dicionário JSON-compatível"""
        return {
            'id': self.id,
            'tipo': self.tipo,
            'titulo': self.titulo,
            'mensagem': self.mensagem,
            'link_destino': self.link_destino,
            'status': self.status,
            'lida_em': self.lida_em.isoformat() if self.lida_em else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def marcar_como_lida(self):
        """Marca a notificação como lida"""
        self.status = 'lida'
        self.lida_em = now_brt()
    
    def __repr__(self):
        return f'<Notificacao {self.tipo} - ID {self.id}>'


class RelatorioExpress(db.Model):
    """
    Relatório Express - Relatório independente criado junto com os dados da obra
    Clone completo do Relatório Comum, porém sem dependência de Projeto existente
    """
    __tablename__ = 'relatorios_express'
    
    id = db.Column(db.Integer, primary_key=True)
    numero = db.Column(db.String(20), nullable=False, unique=True)
    
    # Campos legados (mantidos para compatibilidade com DB existente)
    empresa_nome = db.Column(db.String(200), nullable=False)
    empresa_endereco = db.Column(db.Text, nullable=True)
    empresa_telefone = db.Column(db.String(50), nullable=True)
    empresa_email = db.Column(db.String(255), nullable=True)
    empresa_responsavel = db.Column(db.String(200), nullable=True)
    data_visita = db.Column(db.Date, nullable=False, default=brazil_now)
    
    # Dados da Obra (inline - não depende de projeto existente)
    obra_nome = db.Column(db.String(200), nullable=True)
    obra_endereco = db.Column(db.Text, nullable=True)
    obra_tipo = db.Column(db.String(100), nullable=True)
    obra_construtora = db.Column(db.String(200), nullable=True)
    obra_responsavel = db.Column(db.String(200), nullable=True)
    obra_email = db.Column(db.String(255), nullable=True)
    obra_telefone = db.Column(db.String(50), nullable=True)
    
    # Dados do Relatório (idênticos ao Relatório Comum)
    titulo = db.Column(db.String(300), nullable=False, default='Relatório Express de Visita')
    autor_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    aprovador_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    data_relatorio = db.Column(db.DateTime, default=lambda: now_brt())
    data_aprovacao = db.Column(db.DateTime, nullable=True)
    conteudo = db.Column(db.Text)
    descricao = db.Column(db.Text, nullable=True)
    checklist_data = db.Column(db.Text)  # JSON string for checklist data
    informacoes_tecnicas = db.Column(db.Text, nullable=True)  # JSON string com dados técnicos
    
    # Campos de metadados (idênticos ao Relatório Comum)
    categoria = db.Column(db.String(100), nullable=True)
    local = db.Column(db.String(255), nullable=True)
    lembrete_proxima_visita = db.Column(db.DateTime, nullable=True)
    observacoes_finais = db.Column(db.Text, nullable=True)
    
    # Status - EXATAMENTE iguais ao Relatório Comum
    # Em preenchimento → Aguardando Aprovação → Aprovado / Rejeitado
    status = db.Column(db.String(50), default='Em preenchimento')
    comentario_aprovacao = db.Column(db.Text)
    
    # Funcionários/Acompanhantes
    acompanhantes = db.Column(JSONB, nullable=True)
    
    # Auditoria
    criado_por = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    atualizado_por = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=brazil_now)
    updated_at = db.Column(db.DateTime, default=brazil_now, onupdate=brazil_now)
    
    # Relacionamentos
    autor = db.relationship('User', foreign_keys=[autor_id], backref='relatorios_express_criados', lazy='select')
    aprovador = db.relationship('User', foreign_keys=[aprovador_id], backref='relatorios_express_aprovados', lazy='select')
    
    def __repr__(self):
        return f'<RelatorioExpress {self.numero}>'


class FotoRelatorioExpress(db.Model):
    """
    Fotos do Relatório Express - Idêntico ao FotoRelatorio
    """
    __tablename__ = 'fotos_relatorio_express'
    
    id = db.Column(db.Integer, primary_key=True)
    relatorio_express_id = db.Column(db.Integer, db.ForeignKey('relatorios_express.id', ondelete='CASCADE'), nullable=False)
    
    # Campos de URL e filesystem
    url = db.Column(db.Text, nullable=True)
    filename = db.Column(db.String(255), nullable=True)
    filename_original = db.Column(db.String(255))
    filename_anotada = db.Column(db.String(255))
    
    # Metadados da foto
    titulo = db.Column(db.String(500))
    legenda = db.Column(db.Text, nullable=True)
    descricao = db.Column(db.Text)
    tipo_servico = db.Column(db.String(100))
    local = db.Column(db.String(300))
    anotacoes_dados = db.Column(db.JSON)
    ordem = db.Column(db.Integer, default=0)
    coordenadas_anotacao = db.Column(db.JSON)
    
    # Armazenamento binário (legacy)
    imagem = db.Column(db.LargeBinary, nullable=True)
    imagem_hash = db.Column(db.String(64), nullable=True)
    content_type = db.Column(db.String(100), nullable=True)
    imagem_size = db.Column(db.Integer, nullable=True)
    
    created_at = db.Column(db.DateTime, default=brazil_now)
    
    # Relacionamento
    relatorio_express = db.relationship('RelatorioExpress', backref=db.backref('imagens', lazy='dynamic', order_by='FotoRelatorioExpress.ordem', cascade='all, delete-orphan'))
    
    def __repr__(self):
        return f'<FotoRelatorioExpress {self.id} - Relatório {self.relatorio_express_id}>'

class Lembrete(db.Model):
    """
    Modelo para lembretes persistentes de projetos
    
    Lembretes ficam ativos até serem explicitamente fechados.
    Múltiplos lembretes podem estar ativos simultaneamente.
    """
    __tablename__ = 'lembretes'
    
    id = db.Column(db.Integer, primary_key=True)
    projeto_id = db.Column(db.Integer, db.ForeignKey('projetos.id', ondelete='CASCADE'), nullable=False)
    texto = db.Column(db.Text, nullable=False)
    
    # Controle de fechamento
    fechado = db.Column(db.Boolean, default=False, nullable=False)
    fechado_em = db.Column(db.DateTime, nullable=True)
    fechado_por_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    
    # Auditoria
    criado_em = db.Column(db.DateTime, default=brazil_now, nullable=False)
    criado_por_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    # Relacionamentos
    projeto = db.relationship('Projeto', backref=db.backref('lembretes', lazy='dynamic', cascade='all, delete-orphan'))
    criado_por = db.relationship('User', foreign_keys=[criado_por_id], backref='lembretes_criados')
    fechado_por = db.relationship('User', foreign_keys=[fechado_por_id], backref='lembretes_fechados')
    
    def __repr__(self):
        status = "Fechado" if self.fechado else "Ativo"
        return f'<Lembrete {self.id} - Projeto {self.projeto_id} - {status}>'
    
    def to_dict(self):
        """Serializa o lembrete para JSON"""
        return {
            'id': self.id,
            'projeto_id': self.projeto_id,
            'texto': self.texto,
            'fechado': self.fechado,
            'fechado_em': self.fechado_em.isoformat() if self.fechado_em else None,
            'fechado_por': self.fechado_por.username if self.fechado_por else None,
            'criado_em': self.criado_em.isoformat() if self.criado_em else None,
            'criado_por': self.criado_por.username if self.criado_por else None
        }