"""
Sistema de backup automático para Google Drive
Integração com OAuth 2.0 para salvar relatórios em pastas organizadas
"""

import os
import io
import json
import base64
import hashlib
import mimetypes
import tempfile
from datetime import datetime
from typing import Optional, List, Dict, Any

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseUpload

SCOPES = ['https://www.googleapis.com/auth/drive.file']

class GoogleDriveBackupOAuth:
    """Sistema de backup para Google Drive usando OAuth 2.0"""
    
    def __init__(self):
        self.credentials = None
        self.service = None
        
    def get_oauth_flow(self, redirect_uri: str) -> Flow:
        """
        Criar flow de autenticação OAuth 2.0
        
        Args:
            redirect_uri: URL de callback após autenticação
            
        Returns:
            Flow object para autenticação
        """
        client_config = self._get_client_config()
        
        flow = Flow.from_client_config(
            client_config,
            scopes=SCOPES,
            redirect_uri=redirect_uri
        )
        
        return flow
    
    def _get_client_config(self) -> Dict:
        """Obter configuração do cliente OAuth"""
        credentials_json = os.environ.get('GOOGLE_OAUTH_CREDENTIALS_JSON')
        
        if not credentials_json:
            raise Exception("GOOGLE_OAUTH_CREDENTIALS_JSON não configurado")
        
        return json.loads(credentials_json)
    
    def authorize_with_code(self, code: str, redirect_uri: str, code_verifier: str = None) -> Dict[str, Any]:
        """
        Trocar código de autorização por tokens
        
        Args:
            code: Código de autorização do Google
            redirect_uri: URL de callback
            code_verifier: Verificador PKCE (se usado no authorization_url)
            
        Returns:
            Token de acesso e refresh token (sem secrets sensíveis)
        """
        flow = self.get_oauth_flow(redirect_uri)
        
        # Passar o code_verifier se PKCE foi usado no authorization
        fetch_kwargs = {'code': code}
        if code_verifier:
            fetch_kwargs['code_verifier'] = code_verifier
        
        flow.fetch_token(**fetch_kwargs)
        
        credentials = flow.credentials
        
        return {
            'token': credentials.token,
            'refresh_token': credentials.refresh_token,
            'expiry': credentials.expiry.isoformat() if credentials.expiry else None
        }
    
    def set_credentials_from_token(self, token_info: Dict[str, Any]):
        """
        Configurar credenciais a partir de token salvo
        
        Args:
            token_info: Dicionário com informações do token
        """
        client_config = self._get_client_config()
        web_config = client_config.get('web', {})
        
        self.credentials = Credentials(
            token=token_info.get('token'),
            refresh_token=token_info.get('refresh_token'),
            token_uri=web_config.get('token_uri', 'https://oauth2.googleapis.com/token'),
            client_id=web_config.get('client_id'),
            client_secret=web_config.get('client_secret'),
            scopes=SCOPES
        )
        
        self.service = build('drive', 'v3', credentials=self.credentials)
    
    def clear_credentials(self):
        """Limpar credenciais armazenadas"""
        self.credentials = None
        self.service = None
    
    def find_or_create_folder(self, folder_name: str, parent_id: str = None) -> str:
        """
        Encontrar ou criar pasta no Drive
        
        Args:
            folder_name: Nome da pasta
            parent_id: ID da pasta pai (opcional)
            
        Returns:
            ID da pasta
        """
        if not self.service:
            raise Exception("Serviço não inicializado. Faça login primeiro.")
        
        query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        if parent_id:
            query += f" and '{parent_id}' in parents"
        
        results = self.service.files().list(
            q=query,
            spaces='drive',
            fields='files(id, name)'
        ).execute()
        
        files = results.get('files', [])
        
        if files:
            return files[0]['id']
        
        file_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        
        if parent_id:
            file_metadata['parents'] = [parent_id]
        
        folder = self.service.files().create(
            body=file_metadata,
            fields='id'
        ).execute()
        
        return folder.get('id')
    
    def list_files_in_folder(self, folder_id: str) -> List[str]:
        """
        Listar nomes de arquivos em uma pasta
        
        Args:
            folder_id: ID da pasta
            
        Returns:
            Lista de nomes de arquivos
        """
        if not self.service:
            return []
        
        try:
            query = f"'{folder_id}' in parents and trashed=false"
            results = self.service.files().list(
                q=query,
                spaces='drive',
                fields='files(name)',
                pageSize=1000
            ).execute()
            
            files = results.get('files', [])
            return [f['name'] for f in files]
        except Exception as e:
            print(f"Erro ao listar arquivos: {e}")
            return []
    
    def file_exists_in_folder(self, filename: str, folder_id: str) -> bool:
        """
        Verificar se arquivo existe na pasta
        
        Args:
            filename: Nome do arquivo
            folder_id: ID da pasta
            
        Returns:
            True se existe
        """
        if not self.service:
            return False
        
        try:
            query = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
            results = self.service.files().list(
                q=query,
                spaces='drive',
                fields='files(id)'
            ).execute()
            
            return len(results.get('files', [])) > 0
        except Exception as e:
            print(f"Erro ao verificar arquivo: {e}")
            return False
    
    def upload_pdf_bytes(self, pdf_bytes: bytes, filename: str, folder_id: str, mimetype: str = 'application/pdf') -> Dict[str, Any]:
        """
        Upload de bytes (PDF, imagem, etc) para o Drive
        
        Args:
            pdf_bytes: Conteúdo do arquivo em bytes
            filename: Nome do arquivo
            folder_id: ID da pasta de destino
            mimetype: Tipo MIME do arquivo (default: application/pdf)
            
        Returns:
            Informações do arquivo enviado
        """
        if not self.service:
            raise Exception("Serviço não inicializado. Faça login primeiro.")
        
        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }
        
        media = MediaIoBaseUpload(
            io.BytesIO(pdf_bytes),
            mimetype=mimetype,
            resumable=True
        )
        
        file = self.service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, webViewLink'
        ).execute()
        
        return {
            'id': file.get('id'),
            'name': file.get('name'),
            'link': file.get('webViewLink')
        }
    
    def upload_file(self, file_path: str, folder_id: str, filename: str = None) -> Dict[str, Any]:
        """
        Upload de arquivo para o Drive
        
        Args:
            file_path: Caminho do arquivo local
            folder_id: ID da pasta de destino
            filename: Nome do arquivo (opcional)
            
        Returns:
            Informações do arquivo enviado
        """
        if not self.service:
            raise Exception("Serviço não inicializado. Faça login primeiro.")
        
        if not os.path.exists(file_path):
            raise Exception(f"Arquivo não encontrado: {file_path}")
        
        if not filename:
            filename = os.path.basename(file_path)
        
        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }
        
        media = MediaFileUpload(file_path, resumable=True)
        
        file = self.service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, webViewLink'
        ).execute()
        
        return {
            'id': file.get('id'),
            'name': file.get('name'),
            'link': file.get('webViewLink')
        }
    
    def test_connection(self) -> Dict[str, Any]:
        """
        Testar conexão com Google Drive
        
        Returns:
            Status da conexão
        """
        if not self.service:
            return {
                'success': False,
                'message': 'Não autenticado. Faça login primeiro.'
            }
        
        try:
            about = self.service.about().get(fields='user').execute()
            user = about.get('user', {})
            
            return {
                'success': True,
                'message': f"Conectado como: {user.get('displayName', 'Usuário')} ({user.get('emailAddress', '')})",
                'user': user
            }
        except Exception as e:
            return {
                'success': False,
                'message': f'Erro na conexão: {str(e)}'
            }


drive_backup = GoogleDriveBackupOAuth()


def get_authorization_url(redirect_uri: str):
    """
    Obter URL de autorização do Google com PKCE gerado manualmente.
    
    Returns:
        Tupla (authorization_url, state, code_verifier)
    """
    flow = drive_backup.get_oauth_flow(redirect_uri)
    
    # Gerar PKCE manualmente para ter controle total do code_verifier
    code_verifier = base64.urlsafe_b64encode(os.urandom(32)).decode('utf-8').rstrip('=')
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode('ascii')).digest()
    ).decode('utf-8').rstrip('=')
    
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent',
        code_challenge=code_challenge,
        code_challenge_method='S256'
    )
    
    return authorization_url, state, code_verifier


def exchange_code_for_token(code: str, redirect_uri: str, code_verifier: str = None) -> Dict[str, Any]:
    """
    Trocar código por token
    
    Args:
        code: Código de autorização
        redirect_uri: URL de callback
        code_verifier: Verificador PKCE capturado no start (se houver)
        
    Returns:
        Informações do token
    """
    return drive_backup.authorize_with_code(code, redirect_uri, code_verifier=code_verifier)


def backup_all_reports_to_drive(token_info: Dict[str, Any], db_session, Relatorio, FotoRelatorio, RelatorioExpress, FotoRelatorioExpress, WeasyPrintReportGenerator) -> Dict[str, Any]:
    """
    Fazer backup de todos os relatórios para o Google Drive
    
    Args:
        token_info: Token de autenticação
        db_session: Sessão do banco de dados
        Relatorio: Model de relatório
        FotoRelatorio: Model de fotos
        RelatorioExpress: Model de relatório express
        FotoRelatorioExpress: Model de fotos express
        WeasyPrintReportGenerator: Gerador de PDF
        
    Returns:
        Resultado do backup
    """
    backup_instance = GoogleDriveBackupOAuth()
    backup_instance.set_credentials_from_token(token_info)
    
    relatorio_folder_id = backup_instance.find_or_create_folder('Relatorio')
    express_folder_id = backup_instance.find_or_create_folder('Relatorio Express')
    
    results = {
        'relatorios': {'total': 0, 'success': 0, 'failed': 0, 'files': []},
        'express': {'total': 0, 'success': 0, 'failed': 0, 'files': []}
    }
    
    generator = WeasyPrintReportGenerator()
    
    # Usar case-insensitive para capturar todas as variações de status
    from sqlalchemy import func
    relatorios = Relatorio.query.filter(
        func.lower(Relatorio.status).in_(['aprovado', 'finalizado', 'aprovado final'])
    ).all()
    results['relatorios']['total'] = len(relatorios)
    
    # Obter lista de arquivos existentes na pasta para verificar duplicados
    existing_files_relatorio = backup_instance.list_files_in_folder(relatorio_folder_id)
    
    # Adicionar contadores de duplicados
    results['relatorios']['skipped'] = 0
    results['express']['skipped'] = 0
    
    for relatorio in relatorios:
        try:
            projeto_nome = relatorio.projeto.nome if relatorio.projeto else 'Sem_Projeto'
            projeto_nome = ''.join(c for c in projeto_nome if c.isalnum() or c in (' ', '-', '_'))[:50]
            
            # Usar nome base para verificar duplicados (sem data)
            filename_base = f"Relatorio_{relatorio.numero.replace('/', '_')}_{projeto_nome}"
            
            # Verificar se já existe um arquivo com este nome base
            duplicado = any(f.startswith(filename_base) for f in existing_files_relatorio)
            
            if duplicado:
                print(f"⏭️ Relatório {relatorio.numero} já existe no Drive - pulando")
                results['relatorios']['skipped'] += 1
                continue
            
            fotos = FotoRelatorio.query.filter_by(relatorio_id=relatorio.id).order_by(FotoRelatorio.ordem).all()
            
            pdf_bytes = generator.generate_report_pdf(relatorio, fotos)
            
            filename = f"{filename_base}_{datetime.now().strftime('%Y%m%d')}.pdf"
            
            file_info = backup_instance.upload_pdf_bytes(pdf_bytes, filename, relatorio_folder_id)
            
            results['relatorios']['success'] += 1
            results['relatorios']['files'].append({
                'numero': relatorio.numero,
                'filename': filename,
                'link': file_info.get('link')
            })
            
        except Exception as e:
            results['relatorios']['failed'] += 1
            print(f"Erro ao fazer backup do relatório {relatorio.id}: {str(e)}")
    
    # Usar case-insensitive para capturar todas as variações de status
    relatorios_express = RelatorioExpress.query.filter(
        func.lower(RelatorioExpress.status).in_(['aprovado', 'finalizado', 'aprovado final'])
    ).all()
    results['express']['total'] = len(relatorios_express)
    
    # Obter lista de arquivos existentes na pasta para verificar duplicados
    existing_files_express = backup_instance.list_files_in_folder(express_folder_id)
    
    # Importar função de geração de PDF Express (mesma usada no botão "Baixar PDF")
    from pdf_generator_express import gerar_pdf_relatorio_express
    
    for express in relatorios_express:
        try:
            obra_nome = express.obra_nome or 'Express'
            obra_nome = ''.join(c for c in obra_nome if c.isalnum() or c in (' ', '-', '_'))[:50]
            
            # Usar nome base para verificar duplicados (sem data)
            filename_base = f"Express_{express.numero.replace('/', '_')}_{obra_nome}"
            
            # Verificar se já existe um arquivo com este nome base
            duplicado = any(f.startswith(filename_base) for f in existing_files_express)
            
            if duplicado:
                print(f"⏭️ Relatório Express {express.numero} já existe no Drive - pulando")
                results['express']['skipped'] += 1
                continue
            
            # Usar a mesma função de geração de PDF do botão "Baixar PDF"
            pdf_result = gerar_pdf_relatorio_express(express.id, salvar_arquivo=False)
            
            # Verificar se retornou bytes ou BytesIO
            if hasattr(pdf_result, 'read'):
                pdf_bytes = pdf_result.read()
            elif isinstance(pdf_result, bytes):
                pdf_bytes = pdf_result
            else:
                raise Exception(f"Formato de PDF inesperado: {type(pdf_result)}")
            
            filename = f"{filename_base}_{datetime.now().strftime('%Y%m%d')}.pdf"
            
            file_info = backup_instance.upload_pdf_bytes(pdf_bytes, filename, express_folder_id)
            
            results['express']['success'] += 1
            results['express']['files'].append({
                'numero': express.numero,
                'filename': filename,
                'link': file_info.get('link')
            })
            
            print(f"✅ Relatório Express {express.numero} salvo no Drive")
            
        except Exception as e:
            results['express']['failed'] += 1
            import traceback
            print(f"❌ Erro ao fazer backup do relatório express {express.id} ({express.numero}): {str(e)}")
            print(f"   Traceback: {traceback.format_exc()}")
    
    return {
        'success': True,
        'message': f"Backup concluído! Relatórios: {results['relatorios']['success']}/{results['relatorios']['total']}, Express: {results['express']['success']}/{results['express']['total']}",
        'results': results,
        'detalhes': f"Relatórios salvos: {results['relatorios']['success']}, pulados: {results['relatorios']['skipped']}, erros: {results['relatorios']['failed']}. Express salvos: {results['express']['success']}, pulados: {results['express']['skipped']}, erros: {results['express']['failed']}"
    }


def test_drive_connection() -> Dict[str, Any]:
    """
    Testar conexão com Google Drive (função de compatibilidade)
    
    Returns:
        Status da conexão
    """
    return drive_backup.test_connection()


def backup_to_drive(report_data: Dict[str, Any], project_name: str) -> Dict[str, Any]:
    """
    Função de compatibilidade para backup individual
    
    Args:
        report_data: Dados do relatório
        project_name: Nome do projeto
        
    Returns:
        Resultado do backup
    """
    return {
        'success': False,
        'message': 'Use a funcionalidade de Salvar Backup na área de administração'
    }


def backup_photos_to_drive(token_info: Dict[str, Any], db_session, Relatorio, FotoRelatorio, RelatorioExpress, FotoRelatorioExpress, upload_folder: str = 'uploads') -> Dict[str, Any]:
    """
    Fazer backup de TODAS as fotos para o Google Drive
    Organização:
    - Backup Fotos
      - [Nome da Obra]
        - [Data (YYYY-MM-DD)] - [Tipo: Relatorio ou Express] - [Numero]
          - Fotos...
    
    Args:
        token_info: Token de autenticação
        db_session: Sessão do banco de dados
        Relatorio: Model de relatório
        FotoRelatorio: Model de fotos
        RelatorioExpress: Model de relatório express
        FotoRelatorioExpress: Model de fotos express
        
    Returns:
        Resultado do backup
    """
    backup_instance = GoogleDriveBackupOAuth()
    backup_instance.set_credentials_from_token(token_info)
    
    # Pasta Raiz
    root_folder_id = backup_instance.find_or_create_folder('Backup Fotos')
    
    results = {
        'photos': {'total': 0, 'success': 0, 'failed': 0, 'skipped': 0, 'bytes': 0},
        'errors': []
    }
    
    # 1. Processar Relatórios Comuns (Aprovados)
    from sqlalchemy import func
    relatorios = Relatorio.query.filter(
        func.lower(Relatorio.status).in_(['aprovado', 'finalizado', 'aprovado final'])
    ).all()
    
    # Cache de pastas de obra para evitar chamadas repetidas à API
    # Chave: Nome da Obra, Valor: ID da Pasta
    obra_folders_cache = {}
    
    for relatorio in relatorios:
        fotos = FotoRelatorio.query.filter_by(relatorio_id=relatorio.id).all()
        if not fotos:
            continue
            
        try:
            # Determinar Nome da Obra
            if relatorio.projeto:
                obra_nome = relatorio.projeto.nome
            elif relatorio.acompanhantes and isinstance(relatorio.acompanhantes, dict) and relatorio.acompanhantes.get('obra_nome'):
                 # Tentar pegar de metadados se houver
                 obra_nome = relatorio.acompanhantes.get('obra_nome')
            else:
                obra_nome = "Obras Diversas"
                
            obra_nome_clean = ''.join(c for c in obra_nome if c.isalnum() or c in (' ', '-', '_'))[:50].strip() or "Sem_Nome"
            
            # Encontrar/Criar pasta da Obra
            if obra_nome_clean not in obra_folders_cache:
                obra_folders_cache[obra_nome_clean] = backup_instance.find_or_create_folder(obra_nome_clean, root_folder_id)
            
            obra_folder_id = obra_folders_cache[obra_nome_clean]
            
            # Criar pasta específica do relatório: [Data] - Relatorio - [Numero]
            data_str = relatorio.created_at.strftime('%Y-%m-%d')
            numero_clean = relatorio.numero.replace('/', '_')
            relatorio_folder_name = f"{data_str} - Relatorio - {numero_clean}"
            
            # Verificar se pasta do relatório já existe dentro da pasta da obra
            # NOTA: Isso pode ser lento se tiver muitas subpastas. Otimização ideal seria cachear também.
            # Por enquanto, find_or_create_folder faz a verificação.
            relatorio_folder_id = backup_instance.find_or_create_folder(relatorio_folder_name, obra_folder_id)
            
            # Listar arquivos existentes para skip
            existing_files = backup_instance.list_files_in_folder(relatorio_folder_id)
            
            for foto in fotos:
                results['photos']['total'] += 1
                
                # PRIORIDADE 1: Ler foto do campo BYTEA do PostgreSQL
                photo_bytes = None
                photo_filename = None
                
                if hasattr(foto, 'imagem') and foto.imagem:
                    # Foto armazenada no banco como BYTEA
                    photo_bytes = bytes(foto.imagem)
                    # Usar filename do banco ou gerar nome
                    photo_filename = foto.filename or foto.filename_original or foto.filename_anotada or f"foto_{foto.id}.jpg"
                else:
                    # Fallback: Tentar ler do disco (caso fotos antigas)
                    local_filename = foto.filename or foto.filename_original or foto.filename_anotada
                    
                    if not local_filename:
                        # Foto sem arquivo e sem imagem no banco
                        results['photos']['failed'] += 1
                        results['errors'].append(f"Foto {foto.id} sem dados (Rel {relatorio.numero})")
                        continue
                    
                    file_path = os.path.join(upload_folder, local_filename)
                    
                    if not os.path.exists(file_path):
                        # Tentar procurar apenas pelo basename
                        file_path = os.path.join(upload_folder, os.path.basename(local_filename))
                    
                    if not os.path.exists(file_path):
                        # Arquivo físico não encontrado e não tem no banco
                        results['errors'].append(f"Arquivo não encontrado: {local_filename} (Rel {relatorio.numero})")
                        results['photos']['failed'] += 1
                        continue
                    
                    # Ler arquivo do disco
                    try:
                        with open(file_path, 'rb') as f:
                            photo_bytes = f.read()
                        photo_filename = local_filename
                    except Exception as e:
                        results['errors'].append(f"Erro lendo arquivo {local_filename}: {str(e)}")
                        results['photos']['failed'] += 1
                        continue
                
                # Nome para salvar no Drive
                # Formato: [ID]_[Categoria]_[Legenda].jpg
                categoria_clean = ''.join(c for c in (foto.tipo_servico or 'Geral') if c.isalnum())
                legenda_clean = ''.join(c for c in (foto.legenda or 'foto') if c.isalnum() or c in (' ', '-', '_'))[:30]
                ext = os.path.splitext(photo_filename)[1] or '.jpg'
                
                drive_filename = f"{foto.id}_{categoria_clean}_{legenda_clean}{ext}"
                
                # Verificar duplicidade
                if drive_filename in existing_files:
                    results['photos']['skipped'] += 1
                    continue
                    
                # Upload usando bytes em memória
                try:
                    file_size = len(photo_bytes)
                    
                    # Detectar mimetype
                    mime_type, _ = mimetypes.guess_type(drive_filename)
                    if not mime_type:
                        mime_type = 'image/jpeg' if ext.lower() in ['.jpg', '.jpeg'] else 'application/octet-stream'

                    # Upload de bytes para o Drive (usar upload_pdf_bytes que aceita bytes)
                    # NOTA: upload_pdf_bytes funciona para qualquer arquivo binário
                    backup_instance.upload_pdf_bytes(photo_bytes, drive_filename, relatorio_folder_id, mimetype=mime_type)
                    
                    results['photos']['success'] += 1
                    results['photos']['bytes'] += file_size
                    print(f"✅ Foto {foto.id} enviada: {drive_filename} ({file_size} bytes)")
                    
                except Exception as e:
                    print(f"❌ Erro upload foto {foto.id}: {e}")
                    results['photos']['failed'] += 1
                    results['errors'].append(f"Erro upload foto {foto.id}: {str(e)}")
                    
        except Exception as e:
            print(f"Erro processando relatório {relatorio.numero}: {e}")
            results['errors'].append(f"Erro Rel {relatorio.numero}: {str(e)}")

    # 2. Processar Relatórios Express (Aprovados)
    relatorios_express = RelatorioExpress.query.filter(
        func.lower(RelatorioExpress.status).in_(['aprovado', 'finalizado', 'aprovado final'])
    ).all()
    
    for express in relatorios_express:
        fotos = FotoRelatorioExpress.query.filter_by(relatorio_express_id=express.id).all()
        if not fotos:
            continue
            
        try:
            # Determinar Nome da Obra (Express tem campo obra_nome)
            obra_nome = express.obra_nome or "Express Diversos"
            obra_nome_clean = ''.join(c for c in obra_nome if c.isalnum() or c in (' ', '-', '_'))[:50].strip() or "Sem_Nome"
            
            # Encontrar/Criar pasta da Obra
            if obra_nome_clean not in obra_folders_cache:
                obra_folders_cache[obra_nome_clean] = backup_instance.find_or_create_folder(obra_nome_clean, root_folder_id)
            
            obra_folder_id = obra_folders_cache[obra_nome_clean]
            
            # Criar pasta específica do relatório: [Data] - Express - [Numero]
            data_str = express.created_at.strftime('%Y-%m-%d')
            numero_clean = express.numero.replace('/', '_')
            relatorio_folder_name = f"{data_str} - Express - {numero_clean}"
            
            relatorio_folder_id = backup_instance.find_or_create_folder(relatorio_folder_name, obra_folder_id)
            
            # Listar arquivos existentes para skip
            existing_files = backup_instance.list_files_in_folder(relatorio_folder_id)
            
            for foto in fotos:
                results['photos']['total'] += 1
                
                # PRIORIDADE 1: Ler foto do campo BYTEA
                photo_bytes = None
                photo_filename = None
                
                if hasattr(foto, 'imagem') and foto.imagem:
                    photo_bytes = bytes(foto.imagem)
                    photo_filename = foto.filename or foto.filename_original or foto.filename_anotada or f"express_{foto.id}.jpg"
                else:
                    # Fallback: disco
                    local_filename = foto.filename or foto.filename_original or foto.filename_anotada
                    
                    if not local_filename:
                        results['photos']['failed'] += 1
                        continue
                        
                    file_path = os.path.join(upload_folder, local_filename)
                    
                    if not os.path.exists(file_path):
                        file_path = os.path.join(upload_folder, os.path.basename(local_filename))
                        
                    if not os.path.exists(file_path):
                        results['errors'].append(f"Arquivo não encontrado: {local_filename} (Express {express.numero})")
                        results['photos']['failed'] += 1
                        continue
                    
                    try:
                        with open(file_path, 'rb') as f:
                            photo_bytes = f.read()
                        photo_filename = local_filename
                    except Exception as e:
                        results['errors'].append(f"Erro lendo arquivo express {local_filename}: {str(e)}")
                        results['photos']['failed'] += 1
                        continue
                
                # Nome para salvar
                categoria_clean = ''.join(c for c in (foto.tipo_servico or 'Geral') if c.isalnum())
                legenda_clean = ''.join(c for c in (foto.legenda or 'foto') if c.isalnum() or c in (' ', '-', '_'))[:30]
                ext = os.path.splitext(photo_filename)[1] or '.jpg'
                
                drive_filename = f"EXP_{foto.id}_{categoria_clean}_{legenda_clean}{ext}"
                
                if drive_filename in existing_files:
                    results['photos']['skipped'] += 1
                    continue
                    
                try:
                    file_size = len(photo_bytes)
                    
                    # Detectar mimetype
                    mime_type, _ = mimetypes.guess_type(drive_filename)
                    if not mime_type:
                        mime_type = 'image/jpeg' if ext.lower() in ['.jpg', '.jpeg'] else 'application/octet-stream'
                        
                    backup_instance.upload_pdf_bytes(photo_bytes, drive_filename, relatorio_folder_id, mimetype=mime_type)
                    
                    results['photos']['success'] += 1
                    results['photos']['bytes'] += file_size
                    print(f"✅ Foto Express {foto.id} enviada: {drive_filename}")
                    
                except Exception as e:
                    print(f"❌ Erro upload foto express {foto.id}: {e}")
                    results['photos']['failed'] += 1
                    results['errors'].append(f"Erro upload express {foto.id}: {str(e)}")
                    
        except Exception as e:
            print(f"Erro processando express {express.numero}: {e}")
            results['errors'].append(f"Erro Express {express.numero}: {str(e)}")
            
    return {
        'success': True,
        'message': f"Backup de fotos concluído! Sucesso: {results['photos']['success']}, Pulados: {results['photos']['skipped']}, Falhas: {results['photos']['failed']}",
        'results': results
    }
