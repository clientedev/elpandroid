import os
from dotenv import load_dotenv
load_dotenv()
import logging
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect
from flask_cors import CORS
from flask_migrate import Migrate
import time
from sqlalchemy.orm import DeclarativeBase
from werkzeug.middleware.proxy_fix import ProxyFix
from sqlalchemy import text

# Configure logging
logging.basicConfig(level=logging.INFO)

# Declarative Base - Instância única para todo o projeto
class Base(DeclarativeBase):
    pass

# SQLAlchemy database instance - Instância única compartilhada
db = SQLAlchemy(model_class=Base)
migrate = Migrate()
login_manager = LoginManager()
csrf = CSRFProtect()

# create the app
app = Flask(__name__)
# Configure session secret - Railway/Production compatible
session_secret = os.environ.get("SESSION_SECRET")
if not session_secret:
    # Generate fallback for Railway if not set
    import secrets
    session_secret = secrets.token_hex(32)
    logging.warning("⚠️ SESSION_SECRET não configurado, usando chave temporária")
    logging.info("🔑 Para produção, configure: SESSION_SECRET no Railway")
app.secret_key = session_secret
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)  # needed for url_for to generate with https

# configure the database, relative to the app instance folder
database_url = os.environ.get("DATABASE_URL", "sqlite:///construction_tracker.db")

# Handle Railway/Replit PostgreSQL environment 
# Railway and Replit provide DATABASE_URL for PostgreSQL when database is provisioned
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)
    logging.info(f"✅ Using PostgreSQL database (Railway/Replit)")
elif database_url.startswith("postgresql://"):
    logging.info(f"✅ Using PostgreSQL database (Railway/Replit)")
else:
    # Fallback to SQLite for development or when PostgreSQL not available
    database_url = "sqlite:///construction_tracker.db"
    logging.info(f"📝 Using SQLite database: {database_url}")

app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_recycle": 300,
    "pool_pre_ping": True,
}
app.config["UPLOAD_FOLDER"] = "uploads"
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB max file size
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# File upload configuration - SEMPRE usar uploads/
UPLOAD_FOLDER = 'uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

# ELP Backup folder configuration
ELP_BACKUP_FOLDER = 'uploads/ELP'
app.config['ELP_BACKUP_FOLDER'] = ELP_BACKUP_FOLDER

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(ELP_BACKUP_FOLDER, exist_ok=True)
os.makedirs('static/reports', exist_ok=True)

# Log da configuração
logging.info(f"📁 UPLOAD_FOLDER configurado: {UPLOAD_FOLDER}")
logging.info(f"📁 ELP_BACKUP_FOLDER configurado: {ELP_BACKUP_FOLDER}")

# CSRF Configuration - Enable for security
app.config['WTF_CSRF_ENABLED'] = True
app.config['WTF_CSRF_CHECK_DEFAULT'] = True  # Check CSRF by default for security
app.config['WTF_CSRF_METHODS'] = ['POST', 'PUT', 'PATCH', 'DELETE']

# OneSignal Push Notifications Configuration
app.config['ONESIGNAL_APP_ID'] = os.environ.get('ONESIGNAL_APP_ID')
app.config['ONESIGNAL_REST_API_KEY'] = os.environ.get('ONESIGNAL_REST_API_KEY')

# initialize the app with the extension, flask-sqlalchemy >= 3.0.x
try:
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    csrf.init_app(app)

    # Configure CORS for geolocation and API calls
    # Restringir origins para segurança - permitir apenas domínios conhecidos
    import re
    allowed_origins = [
        "https://elpconsultoria.pro",
        re.compile(r"https://.*\.elpconsultoria\.pro"),  # Subdomínios
        "http://localhost:5000",
        "http://127.0.0.1:5000"
    ]

    # Se estiver no ambiente Replit, adicionar domínio Replit
    if os.environ.get("REPL_SLUG") and os.environ.get("REPL_OWNER"):
        replit_domain = f"https://{os.environ['REPL_SLUG']}.{os.environ['REPL_OWNER']}.repl.co"
        allowed_origins.append(replit_domain)

    CORS(app, 
         supports_credentials=True, 
         resources={
             r"/api/*": {"origins": allowed_origins},
             r"/save_location": {"origins": allowed_origins}
         })

    logging.info("✅ Flask extensions initialized successfully")
except Exception as e:
    logging.error(f"❌ Error initializing Flask extensions: {e}")
    raise

# Login manager configuration
login_manager.login_view = 'login'  # type: ignore
login_manager.login_message = 'Por favor, faça login para acessar esta página.'
login_manager.login_message_category = 'info'

# Timezone filter for templates - Convert UTC to Brazil timezone
import pytz
from datetime import datetime

BRAZIL_TZ = pytz.timezone('America/Sao_Paulo')

def now_brt():
    """
    Retorna o datetime atual no fuso horário do Brasil (America/Sao_Paulo / BRT = UTC-3).
    Substitui datetime.utcnow() em todo o sistema para garantir timestamps corretos.
    """
    return datetime.now(BRAZIL_TZ).replace(tzinfo=None)

# Exportar como builtin para que todos os módulos possam usar sem import adicional
import builtins
builtins.now_brt = now_brt

@app.template_filter('to_brazil_tz')
def to_brazil_tz(dt):
    """Convert a datetime to Brazil timezone (America/Sao_Paulo).
    
    Naive datetimes são tratadas como já estando em BRT (salvas via now_brt()).
    Datetimes com timezone são convertidas para BRT.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        # Naive datetime: já está em BRT, apenas localizar sem converter
        return BRAZIL_TZ.localize(dt)
    return dt.astimezone(BRAZIL_TZ)

@app.template_filter('format_datetime_br')
def format_datetime_br(dt, format='%d/%m/%Y às %H:%M'):
    """Format datetime in Brazil timezone.
    
    Naive datetimes (sem tzinfo) são tratadas como já estando em BRT,
    pois o sistema salva via now_brt() e datas do usuário já são locais.
    Datetimes com timezone são convertidas para BRT antes de formatar.
    """
    if dt is None:
        return 'N/A'
    if dt.tzinfo is None:
        # Naive datetime: já está em BRT (salvo via now_brt() ou input do usuário)
        return dt.strftime(format)
    # Timezone-aware datetime: converter para BRT
    dt_brazil = dt.astimezone(BRAZIL_TZ)
    return dt_brazil.strftime(format)

@app.template_filter('nl2br')
def nl2br(value):
    """Convert newlines to HTML <br> tags"""
    if value is None:
        return ''
    import re
    return re.sub(r'\n', '<br>\n', str(value))

@app.template_filter('from_json')
def from_json(value):
    """Parse JSON string to Python object"""
    import json
    if value is None:
        return []
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except:
        return []

# Context processor to provide Brazil timezone date to all templates
@app.context_processor
def inject_brazil_date():
    """Inject current date in Brazil timezone for templates"""
    from datetime import datetime
    # Get current time in Brazil timezone
    now_brazil = datetime.now(BRAZIL_TZ)
    return {
        'today_br': now_brazil.strftime('%Y-%m-%d'),  # For HTML date inputs
        'now_brazil': now_brazil,
        'hasattr': hasattr,
        'getattr': getattr
    }

@login_manager.user_loader
def load_user(user_id):
    from models import User
    try:
        return db.session.get(User, int(user_id))
    except Exception as e:
        app.logger.error(f"Error loading user {user_id}: {e}")
        return None

# HTTPS enforcement for production (Railway)
@app.before_request
def enforce_https():
    """Redirecionar para HTTPS em produção (Railway)"""
    from flask import request, redirect

    # Apenas em produção (Railway)
    if os.environ.get("RAILWAY_ENVIRONMENT"):
        # Verificar se a requisição não é HTTPS
        if not request.is_secure:
            # Permitir health checks sem HTTPS
            if request.path in ['/health', '/health/']:
                return None

            # Redirecionar para HTTPS
            url = request.url.replace('http://', 'https://', 1)
            logging.info(f"🔒 Redirecionando para HTTPS: {url}")
            return redirect(url, code=301)

    return None

# Create upload directory
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def create_admin_user_safe():
    from models import User
    from werkzeug.security import generate_password_hash
    MAX_RETRIES = 5
    RETRY_DELAY = 5 # seconds

    for attempt in range(MAX_RETRIES):
        try:
            # Force rollback any pending transactions
            db.session.rollback()

            # Attempt to create admin user
            existing_admin = User.query.filter_by(is_master=True).first()
            if not existing_admin:
                admin_user = User(
                    username='admin',
                    email='admin@exemplo.com',
                    password_hash=generate_password_hash('admin123'),
                    nome_completo='Administrador do Sistema',
                    cargo='Administrador',
                    is_master=True,
                    ativo=True
                )
                db.session.add(admin_user)
                db.session.commit()
                logging.info("Admin user created successfully")
            else:
                logging.info("Admin user already exists.")
            break # Exit loop if successful
        except Exception as e:
            db.session.rollback()
            # Check for missing column error to avoid pointless retries providing a path for migrations to run
            if "UndefinedColumn" in str(e) or "no such column" in str(e):
                logging.warning(f"⚠️ Schema mismatch detected (pending migrations): {e}")
                logging.info("⚠️ Skipping admin creation to allow migrations to run.")
                break
                
            logging.error(f"Attempt {attempt + 1} failed to create admin user: {e}")
            if attempt < MAX_RETRIES - 1:
                logging.info(f"Retrying in {RETRY_DELAY} seconds...")
                time.sleep(RETRY_DELAY)
            else:
                logging.error("Max retries reached. Could not create admin user.")

def create_default_checklists():
    from models import ChecklistPadrao, User

    # Definir os 6 itens de checklist padrão
    checklist_padrao = [
        ("Verificar condições de segurança no local", 1),
        ("Conferir progresso da obra conforme cronograma", 2),
        ("Inspecionar qualidade dos materiais utilizados", 3),
        ("Avaliar execução conforme projeto técnico", 4),
        ("Registrar problemas ou não conformidades encontradas", 5),
        ("Verificar limpeza e organização do canteiro", 6)
    ]

    try:
        # Force rollback any pending transactions
        db.session.rollback()

        # Verificar se já existem itens
        count = ChecklistPadrao.query.filter_by(ativo=True).count()
        if count >= 6:
            logging.info(f"✅ Checklist padrão já existe: {count} itens encontrados")
            return

        # Buscar usuário admin para ser o criador
        admin_user = User.query.filter_by(is_master=True).first()
        if not admin_user:
            logging.error("❌ Admin user não encontrado - não é possível criar checklist")
            return

        # Criar itens que não existem
        itens_criados = 0
        for texto, ordem in checklist_padrao:
            # Verificar se já existe
            existe = ChecklistPadrao.query.filter_by(texto=texto, ordem=ordem).first()
            if not existe:
                novo_item = ChecklistPadrao(
                    texto=texto,
                    ordem=ordem,
                    ativo=True
                )
                db.session.add(novo_item)
                itens_criados += 1

        if itens_criados > 0:
            db.session.commit()
            total_final = ChecklistPadrao.query.filter_by(ativo=True).count()
            logging.info(f"✅ CHECKLIST CRIADO: {itens_criados} novos itens | Total: {total_final}")
        else:
            logging.info("✅ Todos os itens de checklist já existem")

    except Exception as e:
        db.session.rollback()
        logging.error(f"❌ Erro ao criar checklist padrão: {e}")

def create_default_legendas():
    """Criar legendas padrão no Railway PostgreSQL - VERSÃO DEFINITIVA"""
    try:
        from models import LegendaPredefinida, User

        # Forçar rollback de transações pendentes
        try:
            db.session.rollback()
        except Exception:
            pass

        # Verificar se já existem legendas (query mais simples)
        try:
            count = LegendaPredefinida.query.count()
            if count >= 20:
                logging.info(f"✅ Legendas já existem: {count} encontradas")
                return
        except Exception as count_error:
            logging.warning(f"⚠️ Erro ao contar legendas: {count_error}")

        # Buscar usuário admin de forma mais robusta
        try:
            admin_user = User.query.filter_by(is_master=True).first()
        except Exception:
            admin_user = None

        if not admin_user:
            logging.error("❌ Admin user não encontrado - usando ID 1")
            admin_user_id = 1  # Usar ID direto
        else:
            admin_user_id = admin_user.id

        # Definir legendas padrão
        legendas_padrao = [
            # Acabamentos (16 legendas)
            ("Emboço bem-acabado", "Acabamentos"),
            ("Emboço mal-acabado", "Acabamentos"),
            ("Friso com profundidade irregular", "Acabamentos"),
            ("Friso torto", "Acabamentos"),
            ("Lixamento com falhas, necessário correção", "Acabamentos"),
            ("Lixamento corretamente executado", "Acabamentos"),
            ("Lixamento executado sem preenchimento de chupetas", "Acabamentos"),
            ("Lixamento executado sem preenchimento do encunhamento", "Acabamentos"),
            ("Necessário preenchimento das juntas dos blocos", "Acabamentos"),
            ("Necessário retirada de etiquetas", "Acabamentos"),
            ("Necessário retirada de madeiras encrustadas no concreto", "Acabamentos"),
            ("Necessário retirada de pregos", "Acabamentos"),
            ("Necessário retirada de pó de serra incrustado no concreto", "Acabamentos"),
            ("Necessário retirada do excesso de massa da junta dos blocos", "Acabamentos"),
            ("Pendente lixamento das requadrações superiores dos caixilhos", "Acabamentos"),
            ("Pingadeira mal-acabada", "Acabamentos"),

            # Estrutural (18 legendas)
            ("Caída invertida", "Estrutural"),
            ("Chupeta na laje", "Estrutural"),
            ("Chupeta no pilar", "Estrutural"),
            ("Chupeta na viga", "Estrutural"),
            ("Encunhamento mal-acabado", "Estrutural"),
            ("Encunhamento mal-executado", "Estrutural"),
            ("Estrutura bem-acabada", "Estrutural"),
            ("Estrutura executada conforme projeto", "Estrutural"),
            ("Falha de concretagem", "Estrutural"),
            ("Formação de ninho de concretagem", "Estrutural"),
            ("Grampo de ligação não executado conforme projeto", "Estrutural"),
            ("Laje executada conforme projeto", "Estrutural"),
            ("Necessário retirada de pontas de ferro", "Estrutural"),
            ("Pilar executado conforme projeto", "Estrutural"),
            ("Presença de madeira encrustada no concreto", "Estrutural"),
            ("Segregação de agregados", "Estrutural"),
            ("Viga executada conforme projeto", "Estrutural"),
            ("Viga executada fora dos padrões", "Estrutural"),

            # Geral (6 legendas)
            ("Executado conforme projeto", "Geral"),
            ("Estrutura com bom acabamento", "Geral"),
            ("Não evidenciado chapisco colante antes do emboço sobre aba", "Geral"),
            ("Não evidenciado chapisco colante antes do emboço sobre mureta", "Geral"),
            ("Uso de talisca de madeira - necessário retirada", "Geral"),
            ("Uso incorreto de chapisco colante em pó", "Geral"),

            # Segurança (2 legendas)
            ("Pendente corte dos ganchos", "Segurança"),
            ("Pendente tratamento dos ganchos com tinta anti-corrosiva", "Segurança")
        ]

        # Criar legendas em lotes
        legendas_criadas = 0
        batch_size = 10

        for i in range(0, len(legendas_padrao), batch_size):
            batch = legendas_padrao[i:i + batch_size]

            for ordem, (texto, categoria) in enumerate(batch, start=i+1):
                try:
                    # Verificar se já existe (busca por texto exato)
                    existe = LegendaPredefinida.query.filter(
                        LegendaPredefinida.texto == texto,
                        LegendaPredefinida.categoria == categoria,
                        LegendaPredefinida.ativo == True
                    ).first()

                    if not existe:
                        nova_legenda = LegendaPredefinida(
                            texto=texto,
                            categoria=categoria,
                            ativo=True,
                            criado_por=admin_user_id
                        )
                        db.session.add(nova_legenda)
                        legendas_criadas += 1

                except Exception as create_error:
                    logging.warning(f"⚠️ Erro ao criar legenda '{texto}': {create_error}")
                    continue

            # Commit em lotes
            try:
                db.session.commit()
                logging.info(f"✅ Batch {i//batch_size + 1}: {len(batch)} legendas processadas")
            except Exception as commit_error:
                logging.error(f"❌ Erro ao salvar batch: {commit_error}")
                db.session.rollback()
                continue

        # Verificação final
        try:
            total_final = LegendaPredefinida.query.filter_by(ativo=True).count()
            logging.info(f"✅ LEGENDAS FINALIZADAS: {legendas_criadas} criadas | Total: {total_final}")
        except Exception as final_count_error:
            logging.warning(f"⚠️ Erro na contagem final: {final_count_error}")

    except Exception as e:
        logging.exception(f"❌ Erro crítico ao criar legendas padrão: {str(e)}")
        try:
            db.session.rollback()
        except Exception:
            pass


def sync_imported_legacy_users():
    """Sincroniza os usuários legados importados do banco Railway para garantir que estejam presentes em produção."""
    try:
        from models import User

        legacy_users = [
            {
                "username": "leopoldo",
                "email": "leopoldo@elpconsultoria.eng.br",
                "nome_completo": "José Leopoldo Pugliese",
                "cargo": "Engenheiro",
                "is_master": True,
                "is_aprovador_express": False,
                "cor_agenda": "#0000FF",
                "password_hash": "scrypt:32768:8:1$1Vifukw5GNaI6r81$9c49e179a0a0de74b2c8cfe2af45115eff07f4cc9d6df1e6a2fcbceb2170d285812eaf226232dc1e569122715081ec585b18d666d170122a428e03e54e82b2c0",
                "ativo": True,
                "primeiro_login": False
            },
            {
                "username": "isadora",
                "email": "isadora@elpconsultoria.eng.br",
                "nome_completo": "Isadora Tedesco",
                "cargo": "Engenheira",
                "is_master": True,
                "is_aprovador_express": False,
                "cor_agenda": "#D4AC0D",
                "password_hash": "scrypt:32768:8:1$IvzsN8eVRZgioten$36569517773c305e77b0d6e172d54db49277822795132fc6db1e31f599ae9b94a7980b73ebeeb45fa2fb0d2b45372fecbc5f6dd167e968eeacf6016ca993604d",
                "ativo": True,
                "primeiro_login": False
            },
            {
                "username": "luciana",
                "email": "luciana@elpconsultoria.eng.br",
                "nome_completo": "Luciana Varella",
                "cargo": "Arquiteta",
                "is_master": True,
                "is_aprovador_express": False,
                "cor_agenda": "#FFA500",
                "password_hash": "scrypt:32768:8:1$UqICx9J5YsVfR1nT$361bb48093132c5da1e50f82e822f9a4abbbda9685f6be4b6cc43e3cb268ec2ef6805beaa7d9532e55232f38f099289c3b13a0e897df9666c90920d712cd059d",
                "ativo": True,
                "primeiro_login": False
            },
            {
                "username": "Desenvolvedor",
                "email": "carloseduardodorth123@gmail.com",
                "nome_completo": "carlos eduardo",
                "cargo": "Desenvolvedor",
                "is_master": True,
                "is_aprovador_express": True,
                "is_developer": True,
                "cor_agenda": "#0EA5E9",
                "password_hash": "scrypt:32768:8:1$CUML6aF1h3e10fv9$61691720e2d713798850cb4c62efb083d89188687490384dd91830b7354cf56f4ba8ca481a6f4d148bb559d622f17d09b0b45797db50e0abb37228f2a1a5c51b",
                "ativo": True,
                "primeiro_login": False
            },
            {
                "username": "mateus",
                "email": "mateus@elpconsultoria.eng.br",
                "nome_completo": "Mateus Almeida",
                "cargo": "Engenheiro",
                "is_master": False,
                "is_aprovador_express": False,
                "cor_agenda": "#008000",
                "password_hash": "scrypt:32768:8:1$MBIRrAfe8jlmMHlf$b4250d32260b09773aeb224c1ecb9bc6749c9bda744cd14cfac450bdde3127908aa4c0d187df00e9b6d3ba80b2ca53d89e0cf799cd888529961f924fbfbeac39",
                "ativo": True,
                "primeiro_login": False
            },
            {
                "username": "teste33",
                "email": "admin@teste.com",
                "nome_completo": "teste",
                "cargo": "Desenvolvedor",
                "is_master": False,
                "is_aprovador_express": False,
                "cor_agenda": "#0EA5E9",
                "password_hash": "scrypt:32768:8:1$I9v94CBoYpAF2ioL$6608b15e71e58eed7bf964b5a3903838a45974d19529761fd01fa3446a4ad1905c01873fd4c47606253ac5acf7006dee282b8aa0f69e32ae774de44b196eb1ad",
                "ativo": True,
                "primeiro_login": False
            },
            {
                "username": "Teste Isa",
                "email": "isa.tedesco@gmail.com",
                "nome_completo": "Isadora Teste",
                "cargo": "Engenheira",
                "is_master": False,
                "is_aprovador_express": False,
                "cor_agenda": "#0EA5E9",
                "password_hash": "scrypt:32768:8:1$x53OWZHe072L683x$de2d069376b339b8778e5ff87f08b2530186cb336f7036e6fcb128fb843c805a420a21ac292b5b52ac5a168c910f6cfa61e0bc75febb20a777159246eab2de02",
                "ativo": True,
                "primeiro_login": False
            }
        ]

        try:
            db.session.rollback()
        except Exception:
            pass

        synced_count = 0
        for udata in legacy_users:
            user = User.query.filter(
                (User.username == udata["username"]) | (User.email == udata["email"])
            ).first()

            if not user:
                new_u = User(
                    username=udata["username"],
                    email=udata["email"],
                    password_hash=udata["password_hash"],
                    nome_completo=udata["nome_completo"],
                    cargo=udata["cargo"],
                    is_master=udata["is_master"],
                    is_aprovador_express=udata["is_aprovador_express"],
                    is_developer=udata.get("is_developer", False),
                    cor_agenda=udata["cor_agenda"],
                    ativo=udata["ativo"],
                    primeiro_login=udata.get("primeiro_login", False)
                )
                db.session.add(new_u)
                synced_count += 1
                logging.info(f"✅ Usuário importado criado: {udata['username']} ({udata['email']})")
            else:
                updated = False
                if not user.cargo:
                    user.cargo = udata["cargo"]
                    updated = True
                if not user.cor_agenda:
                    user.cor_agenda = udata["cor_agenda"]
                    updated = True
                if udata["is_master"] and not user.is_master:
                    user.is_master = True
                    updated = True
                if udata["is_aprovador_express"] and not user.is_aprovador_express:
                    user.is_aprovador_express = True
                    updated = True
                if updated:
                    synced_count += 1
                    logging.info(f"✅ Usuário atualizado: {user.username}")

        db.session.commit()
        logging.info(f"🎉 Sincronização de usuários legados finalizada: {synced_count} alterações.")
        return synced_count
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        logging.error(f"❌ Erro ao sincronizar usuários legados: {e}")
        return 0


# Initialize database in a separate function for Railway optimization
def init_database():
    """Initialize database tables and default data"""
    try:
        with app.app_context():
            # Models will be imported by routes.py
            import models  # noqa: F401

            # Quick database setup for Railway
            db.create_all()
            logging.info("Database tables created successfully.")

            # Create default admin user if none exists
            create_admin_user_safe()

            # Create default checklists if they don't exist
            create_default_checklists()

            # Create default legendas if they don't exist
            create_default_legendas()

            # Ensure uuid and audit columns exist in relatorios table
            ensure_relatorios_uuid_columns()

            # Ensure imported legacy users exist
            sync_imported_legacy_users()
    except Exception as e:
        logging.error(f"Database initialization error: {e}")

def ensure_relatorios_uuid_columns():
    """Garante a existência das colunas uuid, data_criacao_local e data_sincronizacao na tabela relatorios"""
    try:
        with db.engine.connect() as conn:
            dialect = db.engine.dialect.name
            if dialect == 'postgresql':
                conn.execute(text("ALTER TABLE relatorios ADD COLUMN IF NOT EXISTS uuid VARCHAR(64);"))
                conn.execute(text("ALTER TABLE relatorios ADD COLUMN IF NOT EXISTS data_criacao_local TIMESTAMP;"))
                conn.execute(text("ALTER TABLE relatorios ADD COLUMN IF NOT EXISTS data_sincronizacao TIMESTAMP;"))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_relatorios_uuid ON relatorios (uuid) WHERE uuid IS NOT NULL;"))
                conn.commit()
                logging.info("✅ Colunas uuid e auditoria verificadas/adicionadas no PostgreSQL")
            elif dialect == 'sqlite':
                res = conn.execute(text("PRAGMA table_info(relatorios)")).fetchall()
                col_names = [r[1] for r in res]
                if 'uuid' not in col_names:
                    conn.execute(text("ALTER TABLE relatorios ADD COLUMN uuid VARCHAR(64);"))
                if 'data_criacao_local' not in col_names:
                    conn.execute(text("ALTER TABLE relatorios ADD COLUMN data_criacao_local TIMESTAMP;"))
                if 'data_sincronizacao' not in col_names:
                    conn.execute(text("ALTER TABLE relatorios ADD COLUMN data_sincronizacao TIMESTAMP;"))
                conn.commit()
                logging.info("✅ Colunas uuid e auditoria verificadas/adicionadas no SQLite")
    except Exception as e:
        logging.warning(f"⚠️ Erro ao verificar/adicionar colunas de uuid em relatorios: {e}")


# Initialize database for Railway deployment - ROBUST VERSION
if os.environ.get("RAILWAY_ENVIRONMENT") or (os.environ.get("DATABASE_URL") and "railway" in os.environ.get("DATABASE_URL", "")):
    # Railway-specific initialization with enhanced error handling
    logging.info("🚂 Railway environment detected - initializing database")
    try:
        with app.app_context():
            # Models will be imported by routes.py
            import models  # noqa: F401

            # Test database connection first
            try:
                
                with db.engine.connect() as connection:
                    connection.execute(text("SELECT 1"))
                logging.info("✅ Database connection successful")
            except Exception as conn_error:
                logging.warning(f"⚠️ Database connection not ready yet: {conn_error}")
                # Don't raise here - allow the web server to start so healthchecks pass

            # Create tables with retries
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    db.create_all()
                    logging.info("✅ Database tables created successfully")
                    break
                except Exception as create_error:
                    if attempt < max_retries - 1:
                        logging.warning(f"⚠️ Table creation attempt {attempt + 1} failed: {create_error}")
                        time.sleep(2)
                    else:
                        logging.warning(f"⚠️ Table creation skipped: {create_error}")

            # Create admin user
            create_admin_user_safe()
            create_default_checklists()
            create_default_legendas()
            ensure_relatorios_uuid_columns()
            sync_imported_legacy_users()

            # Test reports route functionality
            logging.info("🧪 Testing reports functionality...")
            try:
                from models import Relatorio
                test_count = Relatorio.query.count()
                logging.info(f"✅ Reports table accessible: {test_count} reports found")
            except Exception as test_error:
                logging.warning(f"⚠️ Reports test failed: {test_error}")

            # Fix migration state issues
            logging.info("🔧 Checking and fixing migration state...")
            try:
                import sqlalchemy as sa

                inspector = sa.inspect(db.engine)
                table_names = inspector.get_table_names()

                if 'user_email_config' in table_names:
                    logging.info("🔧 Found existing user_email_config table, ensuring migration state is correct")

                    # Ensure alembic_version table exists and is up to date
                    if 'alembic_version' in table_names:
                        # Verificar versão atual (sem forçar mudança)
                        with db.engine.connect() as connection:
                            result = connection.execute(text("SELECT version_num FROM alembic_version")).fetchone()
                            if result:
                                logging.info(f"✅ Alembic version atual: {result[0]}")
                    else:
                        # Tabela alembic_version não existe - será criada pelo Alembic
                        logging.info("ℹ️ Alembic version table will be created by migration system")

            except Exception as migration_fix_error:
                logging.warning(f"⚠️ Migration fix attempt failed: {migration_fix_error}")

            logging.info("✅ RAILWAY DATABASE INITIALIZATION COMPLETE")

    except Exception as e:
        logging.error(f"❌ Railway database initialization error: {e}")
        logging.info("🔄 Continuing with limited functionality...")
elif os.environ.get("DATABASE_URL"):
    # Other cloud environments (Replit, etc.)
    logging.info("☁️ Cloud environment detected - database initialization will be done after routes import")
    # Database initialization moved to after routes import to avoid circular dependency
    # try:
    #     with app.app_context():
    #         db.create_all()
    #         logging.info("Database tables created successfully.")
    #         create_admin_user_safe()
    #         create_default_checklists()
    #         logging.info("✅ CLOUD DATABASE INITIALIZATION COMPLETE")
    # except Exception as e:
    #     logging.error(f"Database initialization error: {e}")
else:
    # Local development initialization
    logging.info("💻 Local environment detected - initializing database")
    init_database()

# Initialize Scheduler for background tasks
logging.info("📅 Initializing Scheduler for background tasks...")
try:
    from scheduler_tasks import init_scheduler
    scheduler = init_scheduler(app)
    if scheduler:
        logging.info("✅ Scheduler inicializado - tarefas periódicas ativas")
    else:
        logging.warning("⚠️ Scheduler não inicializado - tarefas periódicas desabilitadas")
except Exception as e:
    logging.warning(f"⚠️ Scheduler initialization skipped: {e}")