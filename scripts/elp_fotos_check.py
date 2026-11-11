"""Confere o caminho completo das fotos como o app faz: envio em base64 junto do relatório,
reenvio sem duplicar, leitura do binário, aprovação, PDF e Express com foto. Apaga tudo ao final."""
import os, io, base64, hashlib, requests
from PIL import Image, ImageDraw
B = 'https://elpandroid-production.up.railway.app'
s = requests.Session()
s.headers['Authorization'] = 'Bearer ' + s.post(f'{B}/api/login', json={'username': os.environ['ADMIN_USER'], 'password': os.environ['ADMIN_PASS']}, timeout=60).json()['token']
falhas = 0
def ok(nome, cond, extra=''):
    global falhas
    falhas += 0 if cond else 1
    print(('OK  ' if cond else 'ERRO') + ' ' + nome + (' ' + str(extra) if extra else ''))
def foto(cor, txt):
    im = Image.new('RGB', (1600, 1200), cor); ImageDraw.Draw(im).text((50, 50), txt, fill='white')
    b = io.BytesIO(); im.save(b, 'JPEG', quality=85); return b.getvalue()
def body(r):
    try: return r.json()
    except Exception: return {}
def pick(d, *ks):
    for k in ks:
        if isinstance(d, dict) and isinstance(d.get(k), dict): return d[k]
    return d if isinstance(d, dict) else {}
imgs = [foto('navy', 'FOTO 1'), foto('darkgreen', 'FOTO 2'), foto('maroon', 'FOTO 3')]
o = pick(body(s.post(f'{B}/api/projetos', json={'nome': 'VERIFICACAO FOTOS', 'construtora': 'TESTE', 'endereco': 'Rua Teste 1', 'status': 'Ativo'}, timeout=60)), 'projeto', 'data')
pid = o.get('id'); ok('obra criada', bool(pid), o.get('numero'))
fotos = [{'base64': base64.b64encode(imgs[i]).decode(), 'imagem_base64': base64.b64encode(imgs[i]).decode(), 'legenda': f'Legenda {i+1}', 'ordem': i + 1, 'filename': f'f{i+1}.jpg'} for i in range(2)]
r = s.post(f'{B}/api/relatorios', json={'projeto_id': pid, 'titulo': 'VERIFICACAO FOTOS', 'status': 'Rascunho', 'fotos': fotos}, timeout=120)
rel = pick(body(r), 'relatorio', 'data'); rid = rel.get('id'); ok('relatório com 2 fotos enviado', r.status_code in (200, 201) and rid, rel.get('numero'))
lst = body(s.get(f'{B}/api/relatorios/{rid}/fotos', timeout=60))
ok('servidor tem 2 fotos', isinstance(lst, list) and len(lst) == 2, len(lst) if isinstance(lst, list) else lst)
for i, f in enumerate(lst if isinstance(lst, list) else []):
    ok(f'foto {i+1} com binário e legenda', f.get('has_binary') or f.get('filename'), f"{f.get('size')} bytes, legenda={f.get('legenda')!r}")
    g = s.get(f['url'], timeout=60)
    ok(f'foto {i+1} baixa como imagem', g.status_code == 200 and g.headers.get('content-type', '').startswith('image'), f"{g.status_code} {g.headers.get('content-type')} {len(g.content)}B")
    try:
        Image.open(io.BytesIO(g.content)).verify(); ok(f'foto {i+1} abre (não corrompida)', True)
    except Exception as e: ok(f'foto {i+1} abre (não corrompida)', False, e)
# reenvio como o app faz depois de sincronizar: fotos já no servidor vão sem base64 + 1 nova
ja = [{'id': f['id'], 'url': f['url'], 'filename': f.get('filename'), 'legenda': f.get('legenda'), 'ordem': f.get('ordem')} for f in lst]
nova = {'base64': base64.b64encode(imgs[2]).decode(), 'imagem_base64': base64.b64encode(imgs[2]).decode(), 'legenda': 'Legenda 3', 'ordem': 3, 'filename': 'f3.jpg'}
r = s.put(f'{B}/api/relatorios/{rid}', json={'projeto_id': pid, 'titulo': 'VERIFICACAO FOTOS', 'status': 'Rascunho', 'fotos': ja + [nova]}, timeout=120)
ok('reenvio com 1 foto nova', r.status_code in (200, 201), r.status_code)
lst2 = body(s.get(f'{B}/api/relatorios/{rid}/fotos', timeout=60))
ok('agora 3 fotos, sem duplicar', isinstance(lst2, list) and len(lst2) == 3, [x.get('legenda') for x in lst2] if isinstance(lst2, list) else lst2)
ok('fotos antigas mantidas (mesmos ids)', isinstance(lst2, list) and {f['id'] for f in lst} <= {f['id'] for f in lst2})
# mudança de legenda
ja2 = [{'id': f['id'], 'url': f['url'], 'legenda': (f['legenda'] + ' editada') if f.get('ordem') == 1 else f.get('legenda'), 'ordem': f.get('ordem')} for f in lst2]
s.put(f'{B}/api/relatorios/{rid}', json={'projeto_id': pid, 'titulo': 'VERIFICACAO FOTOS', 'status': 'Rascunho', 'fotos': ja2}, timeout=120)
lst3 = body(s.get(f'{B}/api/relatorios/{rid}/fotos', timeout=60))
ok('legenda editada salva', any('editada' in (f.get('legenda') or '') for f in lst3), len(lst3))
# fluxo de aprovação
ok('enviar para aprovação', s.post(f'{B}/api/relatorios/{rid}/status', json={'status': 'Aguardando Aprovação'}, timeout=60).ok)
ok('aprovar', s.post(f'{B}/api/relatorios/{rid}/status', json={'status': 'Aprovado'}, timeout=120).ok)
g = s.get(f'{B}/api/relatorios/{rid}', timeout=60); st = pick(body(g), 'relatorio', 'data').get('status')
ok('status Aprovado no servidor', st == 'Aprovado', st)
p = s.get(f'{B}/reports/{rid}/pdf', timeout=180)
ok('PDF do relatório gerado', p.status_code == 200 and p.content[:4] == b'%PDF', f"{p.status_code} {p.headers.get('content-type')} {len(p.content)}B")
if p.content[:4] == b'%PDF':
    open('relatorio_teste.pdf', 'wb').write(p.content)
    import subprocess
    try:
        n = subprocess.run(['pdfimages', '-list', 'relatorio_teste.pdf'], capture_output=True, text=True).stdout.count('\n') - 2
        ok('PDF contém as imagens', n >= 3, f'{n} imagens')
    except Exception as e: print('pdfimages indisponível', e)
# Express com foto
fx = [{'base64': base64.b64encode(imgs[0]).decode(), 'imagem_base64': base64.b64encode(imgs[0]).decode(), 'legenda': 'Foto Express', 'ordem': 1}]
r = s.post(f'{B}/api/relatorios-express/sync', json={'titulo': 'VERIFICACAO EXPRESS', 'obra_nome': 'VERIFICACAO FOTOS', 'status': 'rascunho', 'fotos': fx}, timeout=120)
e = pick(body(r), 'relatorio', 'data', 'report'); eid = e.get('id'); ok('Express com foto enviado', r.ok and eid, r.status_code)
lx = body(s.get(f'{B}/api/relatorios-express', timeout=60))
lx = lx if isinstance(lx, list) else lx.get('data', [])
me = next((x for x in lx if x.get('id') == eid), {})
fe = me.get('fotos') or []
ok('Express tem 1 foto no servidor', len(fe) == 1, [(x.get('legenda'), x.get('url', '')[-30:]) for x in fe])
if fe and fe[0].get('url'):
    g = s.get(fe[0]['url'], timeout=60); ok('foto do Express baixa', g.ok and g.headers.get('content-type', '').startswith('image'), f'{len(g.content)}B')
# limpeza
if eid: ok('apagar Express', s.delete(f'{B}/api/relatorios-express/{eid}', timeout=60).ok)
if rid: ok('apagar relatório', s.delete(f'{B}/api/relatorios/{rid}', timeout=60).ok)
if pid: ok('apagar obra', s.delete(f'{B}/api/projetos/{pid}', timeout=60).ok)
print('FALHAS', falhas)
