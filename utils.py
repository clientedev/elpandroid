import requests
import re
import json

def get_address_from_coordinates(latitude, longitude):
    """Convert GPS coordinates to readable address using OpenStreetMap Nominatim API"""
    import time
    
    try:
        if not latitude or not longitude:
            return None
        
        # Railway-compatible headers
        headers = {
            'User-Agent': 'ELP-ConstructionTracker/1.0 (elp.contato@gmail.com)',
            'Accept': 'application/json',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
        }
        
        # Rate limiting
        time.sleep(1.2)
        
        # Use OpenStreetMap Nominatim API (free, no API key required)
        url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            'format': 'json',
            'lat': float(latitude),
            'lon': float(longitude),
            'addressdetails': 1,
            'language': 'pt-BR'
        }
        
        try:
            response = requests.get(url, params=params, headers=headers, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                
                if 'display_name' in data:
                    # Extract key address components
                    address_parts = []
                    
                    if 'address' in data:
                        addr = data['address']
                        
                        # Street number and name
                        street_parts = []
                        if 'house_number' in addr:
                            street_parts.append(addr['house_number'])
                        if 'road' in addr:
                            street_parts.append(addr['road'])
                        elif 'pedestrian' in addr:
                            street_parts.append(addr['pedestrian'])
                        
                        if street_parts:
                            address_parts.append(' '.join(street_parts))
                        
                        # Neighborhood
                        if 'neighbourhood' in addr:
                            address_parts.append(addr['neighbourhood'])
                        elif 'suburb' in addr:
                            address_parts.append(addr['suburb'])
                        
                        # City
                        if 'city' in addr:
                            address_parts.append(addr['city'])
                        elif 'town' in addr:
                            address_parts.append(addr['town'])
                        elif 'municipality' in addr:
                            address_parts.append(addr['municipality'])
                        
                        # State
                        if 'state' in addr:
                            address_parts.append(addr['state'])
                        
                        # Country
                        if 'country' in addr:
                            address_parts.append(addr['country'])
                    
                    if address_parts:
                        return ', '.join(address_parts)
                    else:
                        return data['display_name']
            
            elif response.status_code == 429:
                print(f"⚠️  REVERSE GEOCODING: Rate limited")
            elif response.status_code == 403:
                print(f"❌ REVERSE GEOCODING: Blocked by Nominatim")
            else:
                print(f"⚠️  REVERSE GEOCODING: HTTP {response.status_code}")
                
        except requests.exceptions.Timeout:
            print(f"⚠️  REVERSE GEOCODING: Timeout")
        except requests.exceptions.ConnectionError:
            print(f"⚠️  REVERSE GEOCODING: Connection error")
        
        return None
        
    except Exception as e:
        print(f"❌ REVERSE GEOCODING: Erro: {e}")
        return None

def normalize_address(address):
    """Normalize address by expanding common abbreviations"""
    if not address or not isinstance(address, str):
        return address

    # Dictionary of common Brazilian address abbreviations
    rules = {
        # Street types
        r'\bR\s+': 'Rua ',
        r'\bR\.': 'Rua',
        r'\bAv\s+': 'Avenida ',
        r'\bAv\.': 'Avenida',
        r'\bPç\s+': 'Praça ',
        r'\bPça\s+': 'Praça ',
        r'\bPç\.': 'Praça',
        r'\bPça\.': 'Praça',
        r'\bRod\.': 'Rodovia',
        r'\bEstr\.': 'Estrada',
        r'\bAl\.': 'Alameda',
        r'\bTv\.': 'Travessa',
        r'\bVl\.': 'Vila',
        r'\bJd\.': 'Jardim',
        r'\bPq\.': 'Parque',
        r'\bCj\.': 'Conjunto',
        r'\bRes\.': 'Residencial',
        r'\bBl\.': 'Bloco',
        r'\bQt\.': 'Quadra',
        r'\bLt\.': 'Lote',
    }

    normalized = address.strip()
    original = normalized

    # Apply normalization rules
    for pattern, replacement in rules.items():
        normalized = re.sub(pattern, replacement, normalized, flags=re.IGNORECASE)

    # Clean up multiple spaces
    normalized = re.sub(r'\s+', ' ', normalized).strip()

    # Log transformation if there was a change
    if original != normalized:
        print(f"📍 ENDEREÇO NORMALIZADO: '{original}' → '{normalized}'")

    return normalized


def get_coordinates_from_address(address):
    """Convert address to GPS coordinates using OpenStreetMap Nominatim API"""
    import time
    import os
    
    try:
        if not address or not address.strip():
            return None, None
        
        # Railway-compatible headers and rate limiting
        headers = {
            'User-Agent': 'ELP-ConstructionTracker/1.0 (elp.contato@gmail.com)',
            'Accept': 'application/json',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
        }
        
        # Rate limiting: Nominatim requires 1 second between requests
        time.sleep(1.2)
        
        # Use OpenStreetMap Nominatim API for forward geocoding
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            'q': normalize_address(address),
            'format': 'json',
            'addressdetails': 1,
            'language': 'pt-BR',
            'countrycodes': 'br',  # Limit to Brazil for better accuracy
            'limit': 1,
            'dedupe': 1  # Remove duplicates
        }
        
        # Retry logic for Railway deployment
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = requests.get(
                    url, 
                    params=params, 
                    headers=headers, 
                    timeout=15  # Increased timeout for Railway
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if data and len(data) > 0:
                        result = data[0]
                        latitude = float(result['lat'])
                        longitude = float(result['lon'])
                        
                        print(f"✅ GEOCODING: {normalize_address(address)} → {latitude}, {longitude}")
                        return latitude, longitude
                        
                elif response.status_code == 429:
                    # Rate limited - wait longer
                    print(f"⚠️  GEOCODING: Rate limited, waiting...")
                    time.sleep(5)
                    continue
                    
                elif response.status_code == 403:
                    # Forbidden - likely blocked
                    print(f"❌ GEOCODING: Blocked by Nominatim (403)")
                    break
                    
                else:
                    print(f"⚠️  GEOCODING: HTTP {response.status_code}")
                    
            except requests.exceptions.Timeout:
                print(f"⚠️  GEOCODING: Timeout, tentativa {attempt + 1}/{max_retries}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff
                    
            except requests.exceptions.ConnectionError:
                print(f"⚠️  GEOCODING: Connection error, tentativa {attempt + 1}/{max_retries}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    
            except Exception as e:
                print(f"❌ GEOCODING: Erro inesperado: {e}")
                break
        
        print(f"❌ GEOCODING: Falhou para '{address}' após {max_retries} tentativas")
        return None, None
        
    except Exception as e:
        print(f"❌ GEOCODING: Erro crítico: {e}")
        return None, None

def format_coordinates_display(latitude, longitude):
    """Format coordinates for display with address lookup"""
    try:
        if not latitude or not longitude:
            return "Localização não capturada"
        
        # Try to get readable address
        address = get_address_from_coordinates(latitude, longitude)
        
        if address:
            return f"{address}\n(Coordenadas: {latitude}, {longitude})"
        else:
            return f"Latitude: {latitude}, Longitude: {longitude}"
            
    except Exception as e:
        print(f"Error formatting coordinates: {e}")
        return f"Latitude: {latitude}, Longitude: {longitude}"

# Utility functions for number generation
def generate_project_number():
    """Generate sequential project number"""
    from models import Projeto
    from app import db
    
    try:
        last_project = Projeto.query.order_by(Projeto.id.desc()).first()
        if last_project:
            # Extract number from existing format like "OBRA-0001" or legacy "PROJ-0001"
            if last_project.numero:
                if 'OBRA-' in last_project.numero:
                    try:
                        last_num = int(last_project.numero.split('-')[1])
                        return f"OBRA-{last_num + 1:04d}"
                    except:
                        pass
                elif 'PROJ-' in last_project.numero:
                    try:
                        last_num = int(last_project.numero.split('-')[1])
                        return f"OBRA-{last_num + 1:04d}"
                    except:
                        pass
        
        # Default start
        return "OBRA-0001"
    except:
        return "OBRA-0001"

def generate_report_number(projeto_id=None):
    """Generate sequential report number based on project's numeracao_inicial
    
    Args:
        projeto_id: ID do projeto para gerar numeração específica
        
    Returns:
        str: Número do relatório no formato REL-XXXX
    """
    from models import Relatorio, Projeto
    from app import db
    
    try:
        if projeto_id:
            # Buscar o projeto para obter numeracao_inicial
            projeto = Projeto.query.get(projeto_id)
            if projeto:
                # Contar quantos relatórios já existem para este projeto
                relatorios_count = Relatorio.query.filter_by(projeto_id=projeto_id).count()
                
                # Calcular próximo número baseado na numeração inicial
                proximo_numero = projeto.numeracao_inicial + relatorios_count
                
                return f"REL-{proximo_numero:04d}"
        
        # Fallback: numeração global antiga
        relatorios = Relatorio.query.filter(Relatorio.numero.like('REL-%')).all()
        
        max_num = 0
        for relatorio in relatorios:
            if relatorio.numero and 'REL-' in relatorio.numero:
                try:
                    num = int(relatorio.numero.split('-')[1])
                    if num > max_num:
                        max_num = num
                except:
                    continue
        
        return f"REL-{max_num + 1:04d}"
        
    except Exception as e:
        print(f"Error generating report number: {e}")
        return "REL-0001"

def generate_visit_number():
    """Generate sequential visit number"""
    from models import Visita
    from app import db
    
    try:
        last_visit = Visita.query.order_by(Visita.id.desc()).first()
        if last_visit:
            # Extract number from existing format like "VIS-0001"
            if last_visit.numero and 'VIS-' in last_visit.numero:
                try:
                    last_num = int(last_visit.numero.split('-')[1])
                    return f"VIS-{last_num + 1:04d}"
                except:
                    pass
        
        # Default start
        return "VIS-0001"
    except:
        return "VIS-0001"

def send_report_email(report, email, name):
    """Send report via email"""
    from flask import current_app
    from flask_mail import Message, Mail
    
    try:
        mail = Mail(current_app)
        
        msg = Message(
            subject=f'Relatório {report.numero} - {report.projeto.nome if report.projeto else "Projeto"}',
            recipients=[email],
            body=f"""
Olá {name},

Segue em anexo o relatório {report.numero}.

Projeto: {report.projeto.nome if report.projeto else "Não informado"}
Data: {report.data_relatorio.strftime('%d/%m/%Y') if report.data_relatorio else "Não informada"}

Atenciosamente,
Sistema de Relatórios
"""
        )
        
        mail.send(msg)
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False

def calculate_reimbursement_total(reembolso):
    """Calculate total reimbursement amount"""
    try:
        total = 0
        
        # Kilometragem
        if reembolso.quilometragem and reembolso.valor_km:
            total += reembolso.quilometragem * reembolso.valor_km
        
        # Other expenses
        if reembolso.alimentacao:
            total += reembolso.alimentacao
        if reembolso.hospedagem:
            total += reembolso.hospedagem
        if reembolso.outros_gastos:
            total += reembolso.outros_gastos
        
        return total
    except:
        return 0


def generate_placeholder_image(filename=None):
    """Gerar placeholder dinâmico se não existir arquivo estático"""
    try:
        from PIL import Image, ImageDraw, ImageFont
        import io

        # Criar imagem placeholder
        width, height = 200, 150
        img = Image.new('RGB', (width, height), color='#f8f9fa')
        draw = ImageDraw.Draw(img)

        # Texto principal
        main_text = "Imagem não encontrada"

        # Texto do arquivo
        if filename:
            file_text = filename[:30] + "..." if len(filename) > 30 else filename
        else:
            file_text = "Arquivo não localizado"

        # Desenhar textos
        try:
            # Tentar usar fonte padrão
            font_main = ImageFont.load_default()
            font_small = ImageFont.load_default()
        except:
            font_main = font_small = None

        # Calcular posições centralizadas
        if font_main:
            bbox_main = draw.textbbox((0, 0), main_text, font=font_main)
            text_width_main = bbox_main[2] - bbox_main[0]
            text_height_main = bbox_main[3] - bbox_main[1]

            bbox_small = draw.textbbox((0, 0), file_text, font=font_small)
            text_width_small = bbox_small[2] - bbox_small[0]
            text_height_small = bbox_small[3] - bbox_small[1]
        else:
            text_width_main = len(main_text) * 6
            text_height_main = 12
            text_width_small = len(file_text) * 5
            text_height_small = 10

        x_main = (width - text_width_main) // 2
        y_main = (height - text_height_main) // 2 - 10

        x_small = (width - text_width_small) // 2
        y_small = y_main + text_height_main + 5

        # Desenhar textos
        draw.text((x_main, y_main), main_text, fill='#6c757d', font=font_main)
        draw.text((x_small, y_small), file_text, fill='#6c757d', font=font_small)

        # Salvar em bytes
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)

        return img_bytes.getvalue()

    except Exception as e:
        # Fallback para SVG se PIL não estiver disponível
        file_info = filename[:30] + "..." if filename and len(filename) > 30 else filename if filename else "Arquivo não localizado"

        svg_placeholder = f'''<svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#f8f9fa"/>
            <text x="50%" y="40%" font-family="Arial, sans-serif" font-size="12" 
                  fill="#6c757d" text-anchor="middle" dy=".3em">Imagem não encontrada</text>
            <text x="50%" y="60%" font-family="Arial, sans-serif" font-size="10" 
                  fill="#6c757d" text-anchor="middle" dy=".3em">{file_info}</text>
        </svg>'''
        return svg_placeholder.encode('utf-8')

def verificar_e_baixar_visita(projeto_id, data_relatorio, relatorio_numero):
    """
    Verifica se há uma visita agendada para a mesma obra e data.
    Se houver, dá baixa automática (marca como Realizada) e envia notificação.
    """
    from models import Visita
    from app import db
    from datetime import datetime
    import pytz
    from notification_service import notification_service
    from flask import current_app
    
    try:
        if not projeto_id or not data_relatorio:
            return False
            
        brazil_tz = pytz.timezone('America/Sao_Paulo')
        now_brt = datetime.now(brazil_tz)
        
        # Converter para date object se for datetime
        data_rel = data_relatorio.date() if hasattr(data_relatorio, 'date') else data_relatorio
        if isinstance(data_rel, str):
            try:
                data_rel = datetime.strptime(data_rel, '%Y-%m-%d').date()
            except:
                pass
                
        visitas_pendentes = Visita.query.filter(
            Visita.projeto_id == projeto_id,
            Visita.status != 'Realizada',
            Visita.status != 'Cancelada'
        ).all()
        
        baixas = 0
        for visita in visitas_pendentes:
            if visita.data_inicio:
                visita_data = visita.data_inicio.date()
                # Verifica se é a mesma data
                if visita_data == data_rel:
                    visita.status = 'Realizada'
                    visita.data_realizada = now_brt
                    
                    # Enviar notificação de sucesso
                    notification_service.criar_notificacao(
                        user_id=visita.responsavel_id,
                        titulo="Visita Concluída",
                        mensagem=f"Sua visita {visita.numero} foi marcada como Realizada automaticamente devido à criação do relatório {relatorio_numero}.",
                        tipo="success",
                        link=f"/visits/{visita.id}"
                    )
                    
                    current_app.logger.info(f"✅ Baixa automática na visita {visita.numero} pelo relatório {relatorio_numero}")
                    baixas += 1
                    
        if baixas > 0:
            db.session.commit()
            return True
            
        return False
    except Exception as e:
        from flask import current_app
        current_app.logger.error(f"❌ Erro ao auto-baixar visita: {e}")
        db.session.rollback()
        return False