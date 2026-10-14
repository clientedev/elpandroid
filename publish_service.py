import os
import json
import re
import subprocess
import logging

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_current_version_info():
    """Retorna a versão atual e versionCode lidos de version.json ou app.json"""
    version = "1.0.34"
    version_code = 34

    version_json_path = os.path.join(BASE_DIR, 'version.json')
    if os.path.exists(version_json_path):
        try:
            with open(version_json_path, 'r', encoding='utf-8') as f:
                vdata = json.load(f)
                if 'version' in vdata:
                    version = str(vdata['version'])
                if 'versionCode' in vdata:
                    version_code = int(vdata['versionCode'])
            return {
                'version': version,
                'version_code': version_code
            }
        except Exception as e:
            logger.error(f"Erro ao ler version.json: {e}")

    app_json_path = os.path.join(BASE_DIR, 'app.json')
    if os.path.exists(app_json_path):
        try:
            with open(app_json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                expo = data.get('expo', {})
                version = expo.get('version', version)
                if 'android' in expo and 'versionCode' in expo['android']:
                    version_code = int(expo['android']['versionCode'])
        except Exception as e:
            logger.error(f"Erro ao ler app.json: {e}")
            
    return {
        'version': version,
        'version_code': version_code
    }

def increment_version(version_str: str, version_code: int):
    """Incrementa a versão semântica (ex: 1.0.28 -> 1.0.29) e o versionCode (28 -> 29)"""
    parts = version_str.split('.')
    if len(parts) == 3:
        try:
            major = int(parts[0])
            minor = int(parts[1])
            patch = int(parts[2]) + 1
            new_version = f"{major}.{minor}.{patch}"
        except ValueError:
            new_version = f"{version_str}.1"
    else:
        new_version = f"{version_str}.1"
        
    new_version_code = version_code + 1
    return new_version, new_version_code

def update_version_files(new_version: str, new_version_code: int, notes: str = None):
    """Atualiza app.json, package.json, build.gradle e routes.py com a nova versão"""
    # 1. app.json
    app_json_path = os.path.join(BASE_DIR, 'app.json')
    if os.path.exists(app_json_path):
        with open(app_json_path, 'r', encoding='utf-8') as f:
            app_data = json.load(f)
        if 'expo' in app_data:
            app_data['expo']['version'] = new_version
            if 'android' in app_data['expo']:
                app_data['expo']['android']['versionCode'] = new_version_code
        with open(app_json_path, 'w', encoding='utf-8') as f:
            json.dump(app_data, f, indent=2, ensure_ascii=False)
            f.write('\n')
            
    # 2. package.json
    pkg_json_path = os.path.join(BASE_DIR, 'package.json')
    if os.path.exists(pkg_json_path):
        with open(pkg_json_path, 'r', encoding='utf-8') as f:
            pkg_data = json.load(f)
        pkg_data['version'] = new_version
        with open(pkg_json_path, 'w', encoding='utf-8') as f:
            json.dump(pkg_data, f, indent=2, ensure_ascii=False)
            f.write('\n')

    # 3. android/app/build.gradle
    build_gradle_path = os.path.join(BASE_DIR, 'android', 'app', 'build.gradle')
    if os.path.exists(build_gradle_path):
        with open(build_gradle_path, 'r', encoding='utf-8') as f:
            content = f.read()
        content = re.sub(r'versionCode\s+\d+', f'versionCode {new_version_code}', content)
        content = re.sub(r'versionName\s+"[^"]+"', f'versionName "{new_version}"', content)
        with open(build_gradle_path, 'w', encoding='utf-8') as f:
            f.write(content)

    # 4. routes.py
    routes_path = os.path.join(BASE_DIR, 'routes.py')
    if os.path.exists(routes_path):
        with open(routes_path, 'r', encoding='utf-8') as f:
            content = f.read()
        content = re.sub(r'app_version\s*=\s*"[^"]+"', f'app_version = "{new_version}"', content)
        content = re.sub(r'version_code\s*=\s*\d+', f'version_code = {new_version_code}', content)
        content = re.sub(r"current_v\s*=\s*'[^']+'", f"current_v = '{new_version}'", content)
        content = re.sub(r'current_vc\s*=\s*\d+', f'current_vc = {new_version_code}', content)
        if notes:
            clean_notes = notes.replace("'", "\\'")
            content = re.sub(r"'notes':\s*f?'[^']+'", f"'notes': '{clean_notes}'", content)
        with open(routes_path, 'w', encoding='utf-8') as f:
            f.write(content)

    # 5. version.json (fonte centralizada para Web e APK)
    version_json_path = os.path.join(BASE_DIR, 'version.json')
    try:
        from datetime import datetime
        version_data = {
            "version": new_version,
            "versionCode": new_version_code,
            "updatedAt": datetime.now().isoformat(),
            "notes": notes or f"Atualização oficial v{new_version} (Build {new_version_code})"
        }
        with open(version_json_path, 'w', encoding='utf-8') as f:
            json.dump(version_data, f, indent=2, ensure_ascii=False)
            f.write('\n')
    except Exception as v_err:
        logger.error(f"Erro ao salvar version.json: {v_err}")

    return True

def compile_and_copy_apk():
    """Executa a compilação do APK nativo e cópia para as pastas do projeto"""
    android_dir = os.path.join(BASE_DIR, 'android')
    gradlew = os.path.join(android_dir, 'gradlew.bat')
    
    # 1. Executa gradlew assembleRelease
    cmd = [gradlew, 'assembleRelease']
    res = subprocess.run(cmd, cwd=android_dir, capture_output=True, text=True, timeout=600)
    if res.returncode != 0:
        logger.error(f"Erro no Gradle: {res.stderr}")
        return False, f"Falha na compilação Gradle (code {res.returncode}): {res.stderr[:300]}"
        
    # 2. Executa node scripts/copy-apk.js
    copy_script = os.path.join(BASE_DIR, 'scripts', 'copy-apk.js')
    if os.path.exists(copy_script):
        subprocess.run(['node', copy_script], cwd=BASE_DIR, capture_output=True, text=True, timeout=60)
        
    return True, "APK compilado e copiado com sucesso"

def git_commit_and_push(new_version: str, new_version_code: int, notes: str = None):
    """Executa git add, commit e push para lançar em produção no Railway"""
    try:
        # git add .
        subprocess.run(['git', 'add', '.'], cwd=BASE_DIR, check=True, capture_output=True, text=True)
        
        # git commit
        msg = f"chore(release): publicar nova atualizacao v{new_version} build {new_version_code}"
        if notes:
            msg += f" - {notes}"
        subprocess.run(['git', 'commit', '-m', msg], cwd=BASE_DIR, check=True, capture_output=True, text=True)
        
        # git push
        push_res = subprocess.run(['git', 'push', 'origin', 'main'], cwd=BASE_DIR, capture_output=True, text=True, timeout=120)
        if push_res.returncode != 0:
            return False, f"Erro no push: {push_res.stderr}"
            
        return True, "Push realizado com sucesso"
    except subprocess.CalledProcessError as e:
        return False, f"Erro no Git: {e.stderr or str(e)}"
    except Exception as e:
        return False, str(e)

def execute_publish_pipeline(custom_notes: str = None):
    """
    Pipeline completa de publicação:
    1. Calcula próxima versão
    2. Atualiza arquivos de versão
    3. Compila APK oficial
    4. Faz Git commit e push
    """
    info = get_current_version_info()
    old_version = info['version']
    old_code = info['version_code']
    
    new_version, new_code = increment_version(old_version, old_code)
    notes = custom_notes or f"Atualização oficial v{new_version}: Melhorias no layout, regras do APK e laudos PDF."
    
    # Atualizar arquivos
    update_version_files(new_version, new_code, notes)
    
    # Compilar APK
    compile_ok, compile_msg = compile_and_copy_apk()
    if not compile_ok:
        return {
            'success': False,
            'error': compile_msg,
            'step': 'compile'
        }
        
    # Git push
    git_ok, git_msg = git_commit_and_push(new_version, new_code, notes)
    if not git_ok:
        return {
            'success': False,
            'error': git_msg,
            'step': 'git',
            'version': new_version,
            'version_code': new_code
        }
        
    return {
        'success': True,
        'old_version': old_version,
        'new_version': new_version,
        'new_version_code': new_code,
        'notes': notes,
        'message': f"Versão v{new_version} (Build {new_code}) publicada com sucesso!"
    }
