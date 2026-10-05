"""Add RelatorioExpress and FotoRelatorioExpress tables

Revision ID: 8382464115ad
Revises: 02c09d2c0073
Create Date: 2025-12-16 21:35:58.308839

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '8382464115ad'
down_revision = '02c09d2c0073'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the fotos_relatorio_express table (new name with underscore)
    op.create_table('fotos_relatorio_express',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('relatorio_express_id', sa.Integer(), nullable=False),
        sa.Column('url', sa.Text(), nullable=True),
        sa.Column('filename', sa.String(length=255), nullable=True),
        sa.Column('filename_original', sa.String(length=255), nullable=True),
        sa.Column('filename_anotada', sa.String(length=255), nullable=True),
        sa.Column('titulo', sa.String(length=500), nullable=True),
        sa.Column('legenda', sa.Text(), nullable=True),
        sa.Column('descricao', sa.Text(), nullable=True),
        sa.Column('tipo_servico', sa.String(length=100), nullable=True),
        sa.Column('local', sa.String(length=300), nullable=True),
        sa.Column('anotacoes_dados', sa.JSON(), nullable=True),
        sa.Column('ordem', sa.Integer(), nullable=True),
        sa.Column('coordenadas_anotacao', sa.JSON(), nullable=True),
        sa.Column('imagem', sa.LargeBinary(), nullable=True),
        sa.Column('imagem_hash', sa.String(length=64), nullable=True),
        sa.Column('content_type', sa.String(length=100), nullable=True),
        sa.Column('imagem_size', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['relatorio_express_id'], ['relatorios_express.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Add new columns to relatorios_express using batch mode for safety
    conn = op.get_bind()
    
    # Check and add columns if they don't exist
    columns_to_add = [
        ('obra_nome', 'VARCHAR(200)', "'Obra Express'"),
        ('obra_endereco', 'TEXT', None),
        ('obra_tipo', 'VARCHAR(100)', None),
        ('obra_construtora', 'VARCHAR(200)', None),
        ('obra_responsavel', 'VARCHAR(200)', None),
        ('obra_email', 'VARCHAR(255)', None),
        ('obra_telefone', 'VARCHAR(50)', None),
        ('titulo', 'VARCHAR(300)', "'Relatório Express'"),
        ('data_relatorio', 'TIMESTAMP', None),
        ('descricao', 'TEXT', None),
        ('checklist_data', 'TEXT', None),
        ('categoria', 'VARCHAR(100)', None),
        ('local', 'VARCHAR(255)', None),
        ('observacoes_finais', 'TEXT', None),
        ('criado_por', 'INTEGER', None),
        ('atualizado_por', 'INTEGER', None),
    ]
    
    for col_name, col_type, default in columns_to_add:
        try:
            if default:
                op.execute(f"ALTER TABLE relatorios_express ADD COLUMN IF NOT EXISTS {col_name} {col_type} DEFAULT {default}")
            else:
                op.execute(f"ALTER TABLE relatorios_express ADD COLUMN IF NOT EXISTS {col_name} {col_type}")
        except Exception as e:
            print(f"Column {col_name} might already exist: {e}")
    
    # Update obra_nome to not be nullable (set default for existing rows)
    op.execute("UPDATE relatorios_express SET obra_nome = COALESCE(empresa_nome, 'Obra Express') WHERE obra_nome IS NULL")
    op.execute("UPDATE relatorios_express SET titulo = 'Relatório Express' WHERE titulo IS NULL")


def downgrade() -> None:
    # Drop the new photos table
    op.drop_table('fotos_relatorio_express')
    
    # Drop added columns from relatorios_express
    columns_to_drop = [
        'obra_nome', 'obra_endereco', 'obra_tipo', 'obra_construtora',
        'obra_responsavel', 'obra_email', 'obra_telefone', 'titulo',
        'data_relatorio', 'descricao', 'checklist_data', 'categoria',
        'local', 'observacoes_finais', 'criado_por', 'atualizado_por'
    ]
    
    for col_name in columns_to_drop:
        try:
            op.drop_column('relatorios_express', col_name)
        except Exception as e:
            print(f"Column {col_name} might not exist: {e}")
