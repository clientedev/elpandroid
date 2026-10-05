import os

routes_path = os.path.join(os.path.dirname(__file__), "..", "routes.py")

endpoints = """

# ==========================================================================================
# ELP Mobile App Updates & APK Download
# ==========================================================================================
@app.route('/api/app-version', methods=['GET'])
def get_app_version_info():
    \"\"\"Retorna versao mais recente do aplicativo ELP e link do APK\"\"\"
    return jsonify({
        'version': '1.0.0',
        'appName': 'ELP',
        'notes': 'Versao de producao com sincronizacao Railway.',
        'downloadUrl': '/download/ELP.apk'
    }), 200

@app.route('/download/ELP.apk', methods=['GET'])
def download_official_apk():
    \"\"\"Permite download direto do executavel ELP.apk\"\"\"
    from flask import send_file
    apk_file = os.path.join(os.getcwd(), 'ELP.apk')
    if os.path.exists(apk_file):
        return send_file(
            apk_file,
            as_attachment=True,
            download_name='ELP.apk',
            mimetype='application/vnd.android.package-archive'
        )
    return jsonify({'error': 'Arquivo ELP.apk nao encontrado no servidor'}), 404
"""

with open(routes_path, "a", encoding="utf-8") as f:
    f.write(endpoints)

print("Endpoints appended to routes.py successfully!")
