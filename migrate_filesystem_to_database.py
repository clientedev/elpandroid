#!/usr/bin/env python3
"""
Script de migração para popular a coluna 'imagem' com dados binários
de fotos que existem no filesystem mas não têm dados no banco.

IMPORTANTE: 
- Este script deve ser executado com cuidado em ambiente de produção
- Sempre faça backup do banco antes de executar
- Execute primeiro em ambiente de teste

Uso:
    python migrate_filesystem_to_database.py [--dry-run] [--limit N]
    
Opções:
    --dry-run: Apenas mostra o que seria feito, sem executar
    --limit N: Limita a N registros por execução (padrão: 100)
"""

import os
import sys
import argparse
from datetime import datetime

# Configuração para importar os modelos
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def migrate_photos_to_database(dry_run=False, limit=100):
    """
    Migra fotos do filesystem para o banco de dados
    
    Args:
        dry_run (bool): Se True, apenas mostra o que seria feito
        limit (int): Máximo de registros a processar
    
    Returns:
        dict: Estatísticas da migração
    """
    try:
        # Importar depois de configurar o path
        from app import app, db
        from models import FotoRelatorio, FotoRelatorioExpress
        
        stats = {
            'fotos_normais_processadas': 0,
            'fotos_normais_migradas': 0,
            'fotos_express_processadas': 0,
            'fotos_express_migradas': 0,
            'arquivos_nao_encontrados': [],
            'erros': []
        }
        
        with app.app_context():
            upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
            
            print(f"🔍 Iniciando migração de fotos do filesystem para banco...")
            print(f"📁 Diretório de upload: {upload_folder}")
            print(f"🏃 Modo: {'DRY-RUN (simulação)' if dry_run else 'EXECUÇÃO REAL'}")
            print(f"📊 Limite por execução: {limit}")
            print("-" * 60)
            
            # Migrar FotoRelatorio
            print("\n📸 PROCESSANDO FOTOS DE RELATÓRIOS NORMAIS...")
            fotos_normais = FotoRelatorio.query.filter(
                FotoRelatorio.imagem == None,
                FotoRelatorio.filename != None
            ).limit(limit).all()
            
            stats['fotos_normais_processadas'] = len(fotos_normais)
            print(f"🔍 Encontradas {len(fotos_normais)} fotos normais sem dados binários")
            
            for i, foto in enumerate(fotos_normais, 1):
                try:
                    file_path = os.path.join(upload_folder, foto.filename)
                    
                    if os.path.exists(file_path):
                        if not dry_run:
                            with open(file_path, 'rb') as f:
                                foto.imagem = f.read()
                            
                            # Validar que os dados foram lidos
                            if foto.imagem and len(foto.imagem) > 0:
                                print(f"  ✅ [{i:3d}] Migrada: {foto.filename} ({len(foto.imagem):,} bytes)")
                                stats['fotos_normais_migradas'] += 1
                            else:
                                print(f"  ❌ [{i:3d}] Erro: arquivo vazio - {foto.filename}")
                                stats['erros'].append(f"FotoRelatorio ID {foto.id}: arquivo vazio")
                        else:
                            file_size = os.path.getsize(file_path)
                            print(f"  🔄 [{i:3d}] Seria migrada: {foto.filename} ({file_size:,} bytes)")
                            stats['fotos_normais_migradas'] += 1
                    else:
                        print(f"  ⚠️  [{i:3d}] Arquivo não encontrado: {foto.filename}")
                        stats['arquivos_nao_encontrados'].append(f"FotoRelatorio ID {foto.id}: {foto.filename}")
                        
                except Exception as e:
                    error_msg = f"FotoRelatorio ID {foto.id}: {str(e)}"
                    print(f"  ❌ [{i:3d}] Erro: {error_msg}")
                    stats['erros'].append(error_msg)
            
            # Migrar FotoRelatorioExpress
            print("\n📸 PROCESSANDO FOTOS DE RELATÓRIOS EXPRESS...")
            fotos_express = FotoRelatorioExpress.query.filter(
                FotoRelatorioExpress.imagem == None,
                FotoRelatorioExpress.filename != None
            ).limit(limit).all()
            
            stats['fotos_express_processadas'] = len(fotos_express)
            print(f"🔍 Encontradas {len(fotos_express)} fotos express sem dados binários")
            
            for i, foto in enumerate(fotos_express, 1):
                try:
                    file_path = os.path.join(upload_folder, foto.filename)
                    
                    if os.path.exists(file_path):
                        if not dry_run:
                            with open(file_path, 'rb') as f:
                                foto.imagem = f.read()
                            
                            # Validar que os dados foram lidos
                            if foto.imagem and len(foto.imagem) > 0:
                                print(f"  ✅ [{i:3d}] Migrada: {foto.filename} ({len(foto.imagem):,} bytes)")
                                stats['fotos_express_migradas'] += 1
                            else:
                                print(f"  ❌ [{i:3d}] Erro: arquivo vazio - {foto.filename}")
                                stats['erros'].append(f"FotoRelatorioExpress ID {foto.id}: arquivo vazio")
                        else:
                            file_size = os.path.getsize(file_path)
                            print(f"  🔄 [{i:3d}] Seria migrada: {foto.filename} ({file_size:,} bytes)")
                            stats['fotos_express_migradas'] += 1
                    else:
                        print(f"  ⚠️  [{i:3d}] Arquivo não encontrado: {foto.filename}")
                        stats['arquivos_nao_encontrados'].append(f"FotoRelatorioExpress ID {foto.id}: {foto.filename}")
                        
                except Exception as e:
                    error_msg = f"FotoRelatorioExpress ID {foto.id}: {str(e)}"
                    print(f"  ❌ [{i:3d}] Erro: {error_msg}")
                    stats['erros'].append(error_msg)
            
            # Commit das alterações
            if not dry_run and (stats['fotos_normais_migradas'] > 0 or stats['fotos_express_migradas'] > 0):
                try:
                    db.session.commit()
                    print(f"\n✅ COMMIT REALIZADO COM SUCESSO!")
                except Exception as e:
                    db.session.rollback()
                    print(f"\n❌ ERRO NO COMMIT: {str(e)}")
                    stats['erros'].append(f"Erro no commit: {str(e)}")
        
        return stats
        
    except Exception as e:
        print(f"❌ ERRO CRÍTICO: {str(e)}")
        return {'error': str(e)}

def print_final_report(stats):
    """Imprime relatório final da migração"""
    print("\n" + "="*60)
    print("📊 RELATÓRIO FINAL DA MIGRAÇÃO")
    print("="*60)
    
    if 'error' in stats:
        print(f"❌ ERRO CRÍTICO: {stats['error']}")
        return
    
    print(f"📸 Fotos Relatórios Normais:")
    print(f"   - Processadas: {stats['fotos_normais_processadas']}")
    print(f"   - Migradas: {stats['fotos_normais_migradas']}")
    
    print(f"📸 Fotos Relatórios Express:")
    print(f"   - Processadas: {stats['fotos_express_processadas']}")
    print(f"   - Migradas: {stats['fotos_express_migradas']}")
    
    total_migradas = stats['fotos_normais_migradas'] + stats['fotos_express_migradas']
    total_processadas = stats['fotos_normais_processadas'] + stats['fotos_express_processadas']
    
    print(f"\n📊 TOTAIS:")
    print(f"   - Total processadas: {total_processadas}")
    print(f"   - Total migradas: {total_migradas}")
    print(f"   - Arquivos não encontrados: {len(stats['arquivos_nao_encontrados'])}")
    print(f"   - Erros: {len(stats['erros'])}")
    
    if stats['arquivos_nao_encontrados']:
        print(f"\n⚠️  ARQUIVOS NÃO ENCONTRADOS:")
        for arquivo in stats['arquivos_nao_encontrados']:
            print(f"   - {arquivo}")
    
    if stats['erros']:
        print(f"\n❌ ERROS ENCONTRADOS:")
        for erro in stats['erros']:
            print(f"   - {erro}")
    
    success_rate = (total_migradas / total_processadas * 100) if total_processadas > 0 else 0
    print(f"\n✅ TAXA DE SUCESSO: {success_rate:.1f}%")

def main():
    """Função principal do script"""
    parser = argparse.ArgumentParser(
        description='Migra fotos do filesystem para o banco de dados PostgreSQL'
    )
    parser.add_argument(
        '--dry-run', 
        action='store_true',
        help='Executa em modo simulação (não faz alterações reais)'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=100,
        help='Limite de registros a processar (padrão: 100)'
    )
    
    args = parser.parse_args()
    
    print("🚀 SCRIPT DE MIGRAÇÃO DE FOTOS - FILESYSTEM → BANCO")
    print(f"⏰ Iniciado em: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    if args.dry_run:
        print("🔄 MODO DRY-RUN: Nenhuma alteração será feita no banco")
    else:
        print("⚠️  MODO PRODUÇÃO: Alterações serão feitas no banco!")
        response = input("Continuar? (s/N): ").strip().lower()
        if response not in ['s', 'sim', 'y', 'yes']:
            print("❌ Operação cancelada pelo usuário")
            sys.exit(0)
    
    # Executar migração
    stats = migrate_photos_to_database(dry_run=args.dry_run, limit=args.limit)
    
    # Mostrar relatório final
    print_final_report(stats)
    
    print(f"\n⏰ Finalizado em: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == '__main__':
    main()