"""Teste rápido da API do ELP após a limpeza da base: cria e apaga uma obra, visita, relatório e Express."""
import os, sys, requests
B = 'https://elpandroid-production.up.railway.app'
s = requests.Session()
tok = s.post(f'{B}/api/login', json={'username': os.environ['ADMIN_USER'], 'password': os.environ['ADMIN_PASS']}, timeout=60).json().get('token')
s.headers['Authorization'] = 'Bearer ' + tok
falhas = 0
def chk(nome, r, ok=(200, 201)):
    global falhas
    bom = r.status_code in ok
    falhas += 0 if bom else 1
    det = '' if bom else r.text[:250].replace('\n', ' ')
    print(f"{'OK ' if bom else 'ERRO'} {nome}: {r.status_code} {det}")
    try: return r.json()
    except Exception: return {}
for ep in ['/api/ping', '/api/projetos', '/api/visits', '/api/relatorios', '/api/relatorios-express', '/api/lembretes', '/api/notificacoes', '/api/visitantes', '/api/app-version']:
    d = chk('GET ' + ep, s.get(B + ep, timeout=60))
    if isinstance(d, list): print('   itens:', len(d))
    elif isinstance(d, dict):
        for k in ('data', 'items', 'relatorios', 'projetos'):
            if isinstance(d.get(k), list): print(f'   {k}:', len(d[k]))
o = chk('POST obra', s.post(f'{B}/api/projetos', json={'nome': 'SMOKE TESTE', 'construtora': 'SMOKE', 'endereco': 'Rua Teste 1', 'status': 'Ativo', 'tipo_obra': 'Residencial'}, timeout=60))
pid = (o.get('projeto') or o.get('data') or o).get('id') if isinstance(o, dict) else None
print('   obra:', pid, (o.get('projeto') or o.get('data') or o).get('numero') if isinstance(o, dict) else '')
v = chk('POST visita', s.post(f'{B}/api/visits', json={'projeto_id': pid, 'data_inicio': '2026-11-20T09:00:00', 'objetivo': 'SMOKE'}, timeout=60))
vid = (v.get('visit') or v.get('visita') or v.get('data') or v).get('id') if isinstance(v, dict) else None
r = chk('POST relatorio', s.post(f'{B}/api/relatorios', json={'projeto_id': pid, 'titulo': 'SMOKE', 'status': 'Rascunho', 'conteudo': 'teste'}, timeout=60))
rid = (r.get('relatorio') or r.get('data') or r).get('id') if isinstance(r, dict) else None
print('   relatorio:', rid, (r.get('relatorio') or r.get('data') or r).get('numero') if isinstance(r, dict) else '')
e = chk('POST express', s.post(f'{B}/api/relatorios-express', json={'titulo': 'SMOKE', 'obra_nome': 'SMOKE TESTE', 'status': 'rascunho'}, timeout=60))
eid = (e.get('relatorio') or e.get('data') or e).get('id') if isinstance(e, dict) else None
print('   express:', eid)
if eid: chk('DELETE express', s.delete(f'{B}/api/relatorios-express/{eid}', timeout=60))
if rid: chk('DELETE relatorio', s.delete(f'{B}/api/relatorios/{rid}', timeout=60))
if vid: chk('DELETE visita', s.delete(f'{B}/api/visits/{vid}', timeout=60))
if pid: chk('DELETE obra', s.delete(f'{B}/api/projetos/{pid}', timeout=60))
for ep in ['/api/projetos', '/api/visits', '/api/relatorios', '/api/relatorios-express']:
    d = s.get(B + ep, timeout=60).json()
    n = len(d) if isinstance(d, list) else len(d.get('data', d.get('items', [])) or [])
    print('FIM', ep, n)
print('FALHAS', falhas)
