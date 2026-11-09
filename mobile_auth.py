"""
Autenticação do APK (ELP Android) e trava global das rotas /api.

- O login (/api/login) devolve um token assinado com SESSION_SECRET.
- O app envia "Authorization: Bearer <token>" em toda requisição.
- Toda rota /api/* exige usuário autenticado (sessão web OU token),
  exceto as rotas públicas listadas em PUBLIC_API_PATHS.

Modo de transição (variável MOBILE_AUTH_MODE no Railway):
- "strict" (padrão): só sessão ou token valem.
- "legacy": também aceita o cabeçalho X-User-Id dos APKs antigos (<= 1.0.67),
  apenas para não derrubar quem ainda não atualizou. Cada uso é registrado
  no log como "[auth] legacy-header" para acompanhar quando dá para desligar.
"""
import logging
import os

from flask import jsonify, request, g
from flask_login import current_user
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

logger = logging.getLogger(__name__)

TOKEN_SALT = 'elp-mobile-auth-v1'
TOKEN_MAX_AGE = 60 * 60 * 24 * 60  # 60 dias

PUBLIC_API_PATHS = {
    '/api/login',
    '/api/ping',
    '/api/app-version',
    '/api/forgot-password',
}


def auth_mode() -> str:
    mode = (os.environ.get('MOBILE_AUTH_MODE') or 'strict').strip().lower()
    return 'legacy' if mode == 'legacy' else 'strict'


def _serializer(app):
    return URLSafeTimedSerializer(app.secret_key, salt=TOKEN_SALT)


def _password_fingerprint(user) -> str:
    # Trocar a senha invalida os tokens antigos
    return (user.password_hash or '')[-16:]


def generate_mobile_token(app, user) -> str:
    return _serializer(app).dumps({'uid': user.id, 'pf': _password_fingerprint(user)})


def user_from_token(app, token: str):
    from models import User
    try:
        data = _serializer(app).loads(token, max_age=TOKEN_MAX_AGE)
    except (SignatureExpired, BadSignature):
        return None
    try:
        user = User.query.get(int(data.get('uid')))
    except Exception:
        return None
    if not user or not user.ativo:
        return None
    if data.get('pf') != _password_fingerprint(user):
        return None
    return user


def legacy_header_user():
    """Somente no modo legacy: usuário indicado pelo cabeçalho X-User-Id dos APKs antigos."""
    if auth_mode() != 'legacy':
        return None
    from models import User
    raw = request.headers.get('X-User-Id')
    if not raw:
        return None
    try:
        user = User.query.get(int(raw))
    except Exception:
        return None
    if user and user.ativo:
        return user
    return None


WRITE_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}
# Ações que um visualizador ainda pode fazer (sobre as próprias notificações)
VIEWER_ALLOWED_WRITE_PREFIXES = ('/api/notificacoes',)


def is_read_only_user(user) -> bool:
    """Perfil Visualizador/Cliente: definido pelo cargo, sem flags de master/aprovador."""
    if not user:
        return False
    if getattr(user, 'is_master', False) or getattr(user, 'is_developer', False) \
            or getattr(user, 'is_aprovador_express', False):
        return False
    cargo = (getattr(user, 'cargo', '') or '').lower()
    return 'visualiza' in cargo or 'client' in cargo


def init_mobile_auth(app, login_manager):
    @login_manager.request_loader
    def _load_user_from_bearer(req):
        header = req.headers.get('Authorization', '')
        if header.lower().startswith('bearer '):
            token = header[7:].strip()
            if token:
                user = user_from_token(app, token)
                if user:
                    g.auth_method = 'token'
                return user
        return None

    @app.before_request
    def _guard_api():
        path = request.path or ''
        if not path.startswith('/api/') or request.method == 'OPTIONS':
            return None
        if path in PUBLIC_API_PATHS:
            return None

        user = None
        if current_user and current_user.is_authenticated:
            user = current_user
        else:
            user = legacy_header_user()
            if user:
                logger.warning(f"[auth] legacy-header uid={user.id} {request.method} {path}")

        if user:
            if not getattr(user, 'ativo', True):
                return jsonify({'success': False, 'error': 'Usuário inativo.', 'auth_required': True}), 401
            if request.method in WRITE_METHODS and is_read_only_user(user) \
                    and not path.startswith(VIEWER_ALLOWED_WRITE_PREFIXES):
                return jsonify({'success': False, 'error': 'Perfil somente leitura.'}), 403
            return None

        logger.info(f"[auth] 401 {request.method} {path}")
        return jsonify({
            'success': False,
            'error': 'Sessão expirada. Faça login novamente.',
            'auth_required': True,
        }), 401

    logger.info(f"🔐 Autenticação mobile ativa (modo: {auth_mode()})")
