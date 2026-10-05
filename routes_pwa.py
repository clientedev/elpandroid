# Rotas específicas para PWA
from flask import send_from_directory, jsonify, request, make_response
from flask_login import current_user, login_required
from app import app, db
from models import Projeto
import math

@app.route('/manifest.json')
def manifest():
    """Servir manifest.json do PWA"""
    return send_from_directory('static', 'manifest.json', mimetype='application/json')

@app.route('/browserconfig.xml')
def browserconfig():
    """Servir browserconfig.xml para Windows/IE"""
    return send_from_directory('static', 'browserconfig.xml', mimetype='application/xml')

@app.route('/sw.js')
def service_worker():
    """Servir Service Worker com headers corretos para update via cache:none"""
    response = make_response(
        send_from_directory('static/js', 'sw.js', mimetype='application/javascript')
    )
    # CRÍTICO: SW nunca deve ser cacheado pelo browser
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    response.headers['Service-Worker-Allowed'] = '/'
    return response

@app.route('/offline')
def offline():
    """Página offline para PWA"""
    return '''
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Offline - ELP Relatórios</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
        <style>
            body { background-color: #f8f9fa; }
            .offline-container {
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
        </style>
    </head>
    <body>
        <div class="offline-container">
            <div class="text-center">
                <div class="mb-4">
                    <i class="fas fa-wifi-slash text-warning" style="font-size: 4rem;"></i>
                </div>
                <h1 class="mb-3">Você está offline</h1>
                <p class="text-muted mb-4">Verifique sua conexão com a internet e tente novamente.</p>
                <div class="d-grid gap-2 d-md-block">
                    <button class="btn btn-primary" onclick="window.location.reload()">
                        <i class="fas fa-sync me-2"></i>Tentar Novamente
                    </button>
                    <a href="/" class="btn btn-outline-secondary">
                        <i class="fas fa-home me-2"></i>Página Inicial
                    </a>
                </div>
                
                <div class="mt-5">
                    <img src="/static/icons/icon-128x128.png" alt="ELP Logo" class="mb-3">
                    <h5>ELP Consultoria e Engenharia</h5>
                    <p class="text-muted small">Sistema de Relatórios de Obra</p>
                </div>
            </div>
        </div>
        
        <script>
            // Recarregar quando voltar online
            window.addEventListener('online', () => {
                window.location.reload();
            });
        </script>
    </body>
    </html>
    '''

@app.route('/api/pwa/install-info')
def pwa_install_info():
    """Informações sobre instalação do PWA"""
    return jsonify({
        'name': 'ELP Consultoria - Sistema de Relatórios',
        'short_name': 'ELP Relatórios',
        'installable': True,
        'features': [
            'Trabalha offline',
            'Acesso rápido da tela inicial',
            'Notificações de proximidade',
            'Interface nativa',
            'Atualizações automáticas'
        ],
        'requirements': [
            'Navegador compatível (Chrome, Firefox, Safari)',
            'Conexão HTTPS',
            'Suporte a Service Workers'
        ]
    })

@app.route('/api/notifications/subscribe', methods=['POST'])
@login_required
def subscribe_notifications():
    """Inscrever usuário para notificações push"""
    try:
        data = request.get_json()
        subscription = data.get('subscription')
        user_agent = data.get('user_agent', '')
        location = data.get('location')
        
        # Validar que a subscription foi fornecida
        if not subscription:
            return jsonify({
                'success': False,
                'error': 'Subscription de notificação é obrigatória'
            }), 400
        
        # Validar que a localização foi fornecida (obrigatória para notificações de proximidade)
        if not location:
            return jsonify({
                'success': False,
                'error': 'Localização é obrigatória para ativar notificações de proximidade'
            }), 400
        
        # Validar coordenadas de localização
        latitude = location.get('latitude')
        longitude = location.get('longitude')
        
        if latitude is None or longitude is None:
            return jsonify({
                'success': False,
                'error': 'Coordenadas de localização inválidas'
            }), 400
        
        # Validar range de coordenadas
        try:
            lat = float(latitude)
            lon = float(longitude)
            
            if not (-90 <= lat <= 90):
                return jsonify({
                    'success': False,
                    'error': 'Latitude deve estar entre -90 e 90'
                }), 400
            
            if not (-180 <= lon <= 180):
                return jsonify({
                    'success': False,
                    'error': 'Longitude deve estar entre -180 e 180'
                }), 400
        except (ValueError, TypeError):
            return jsonify({
                'success': False,
                'error': 'Coordenadas de localização devem ser números válidos'
            }), 400
        
        # Salvar subscription no banco (adicionar modelo posteriormente)
        # Por enquanto, apenas confirmar recebimento
        # TODO: Salvar no banco: subscription, location, user_id, timestamp
        
        app.logger.info(f'✅ Notificações ativadas para usuário {current_user.username} '
                       f'em lat: {lat}, lon: {lon}')
        
        return jsonify({
            'success': True,
            'message': 'Notificações ativadas com sucesso',
            'location_confirmed': True,
            'latitude': lat,
            'longitude': lon
        })
    except Exception as e:
        app.logger.error(f'❌ Erro ao ativar notificações: {str(e)}')
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

@app.route('/api/notifications/unsubscribe', methods=['POST'])
@login_required
def unsubscribe_notifications():
    """Cancelar inscrição de notificações"""
    try:
        # Remover subscription do banco
        return jsonify({
            'success': True,
            'message': 'Notificações desativadas'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

@app.route('/api/notifications/check-updates')
@login_required
def check_updates():
    """Verificar se há atualizações no app"""
    try:
        # Implementar lógica de verificação de updates
        # Por exemplo: novos relatórios aprovados, novas visitas agendadas, etc.
        
        updates = []
        
        # Verificar relatórios pendentes de aprovação para masters
        if current_user.is_master:
            from models import Relatorio
            pending_count = Relatorio.query.filter_by(status='pendente').count()
            if pending_count > 0:
                updates.append({
                    'id': 'pending_reports',
                    'title': 'Relatórios Pendentes',
                    'message': f'Você tem {pending_count} relatório(s) aguardando aprovação',
                    'url': '/pending-reports'
                })
        
        return jsonify({
            'has_updates': len(updates) > 0,
            'updates': updates
        })
    except Exception as e:
        return jsonify({
            'has_updates': False,
            'error': str(e)
        }), 400

def calculate_distance(lat1, lon1, lat2, lon2):
    """Calcular distância entre duas coordenadas em metros"""
    R = 6371000  # Raio da Terra em metros
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = (math.sin(delta_lat / 2) * math.sin(delta_lat / 2) +
         math.cos(lat1_rad) * math.cos(lat2_rad) *
         math.sin(delta_lon / 2) * math.sin(delta_lon / 2))
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

