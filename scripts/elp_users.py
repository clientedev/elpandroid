"""Reorganiza os usuários do ELP via API (executado pelo workflow elp-users).

- Desativa (exclusão do app) todos os usuários, exceto o "admin" e os de teste abaixo.
- Cria ou atualiza os usuários de teste com senhas aleatórias.
- As senhas só saem num arquivo que o workflow criptografa com a chave pública
  scripts/elp_users_pub.pem; nada sensível é impresso no log (repositório público).
"""
import json, os, secrets, string, sys
import requests

BASE = 'https://elpandroid-production.up.railway.app'
OUT = sys.argv[1]

USERS = [
    # username, nome, cargo, tipo_acesso, perfil exibido no app
    ('leopoldo', 'Leopoldo', 'Administrador Geral', 'admin', 'Administrador Geral'),
    ('luciana', 'Luciana', 'Master', 'master', 'Usuário Master'),
    ('isadora', 'Isadora', 'Engenheira Aprovadora', 'aprovador', 'Engenheiro Aprovador'),
    ('matheus', 'Matheus', 'Técnico de Campo - Estagiário', 'funcionario', 'Técnico de Campo'),
    ('teste.visualizador', 'Teste Visualizador', 'Visualizador / Cliente', 'visualizador', 'Visualizador / Cliente'),
    ('teste.desenvolvedor', 'Teste Desenvolvedor', 'Desenvolvedor', 'funcionario', 'Desenvolvedor'),
]


def pw():
    alfa = string.ascii_letters + string.digits
    while True:
        s = ''.join(secrets.choice(alfa) for _ in range(8))
        if any(c.isdigit() for c in s) and any(c.isupper() for c in s) and any(c.islower() for c in s):
            return 'Elp@' + s


s = requests.Session()
r = s.post(f'{BASE}/api/login', json={'username': os.environ['ADMIN_USER'], 'password': os.environ['ADMIN_PASS']}, timeout=60)
tok = r.json().get('token')
if not tok:
    sys.exit('login do admin falhou (%s)' % r.status_code)
s.headers['Authorization'] = 'Bearer ' + tok


def listar():
    d = s.get(f'{BASE}/api/users', timeout=60).json()
    return d.get('users', d) if isinstance(d, dict) else d


atuais = listar()
alvo = {u[0] for u in USERS}
desat = falhas = 0
for u in atuais:
    nome = (u.get('username') or '').lower()
    if nome == 'admin' or nome in alvo or u.get('ativo') is False:
        continue
    r = s.delete(f"{BASE}/api/users/{u['id']}", timeout=60)
    if r.ok:
        desat += 1
    else:
        falhas += 1
print(f'usuarios existentes: {len(atuais)}; desativados agora: {desat}; falhas: {falhas}')

por_nome = {(u.get('username') or '').lower(): u for u in atuais}
creds = []
for username, nome, cargo, tipo, perfil in USERS:
    senha = pw()
    body = {'username': username, 'nome_completo': nome, 'email': f'{username}@exemplo.com',
            'cargo': cargo, 'tipo_acesso': tipo, 'password': senha, 'ativo': True}
    if username in por_nome:
        r = s.put(f"{BASE}/api/users/{por_nome[username]['id']}", json=body, timeout=60)
        acao = 'atualizado'
    else:
        r = s.post(f'{BASE}/api/users', json=body, timeout=60)
        acao = 'criado'
    ok = r.ok and r.json().get('success', True)
    # confere o login de verdade
    lg = requests.post(f'{BASE}/api/login', json={'username': username, 'password': senha}, timeout=60)
    login_ok = lg.ok and bool(lg.json().get('token'))
    print(f'{username}: {acao}={ok} login={login_ok}')
    creds.append({'perfil': perfil, 'nome': nome, 'login': username, 'senha': senha, 'cargo': cargo,
                  'acao': acao, 'api_ok': ok, 'login_ok': login_ok,
                  'erro': None if ok else r.text[:300]})

ativos = [u for u in listar() if u.get('ativo') is not False]
print('ativos no fim:', len(ativos))
json.dump({'creds': creds, 'ativos': [{'username': u.get('username'), 'cargo': u.get('cargo'),
           'is_master': u.get('is_master'), 'aprovador': u.get('is_aprovador_express')} for u in ativos],
           'desativados': desat, 'falhas': falhas}, open(OUT, 'w'), ensure_ascii=False, indent=1)
