"""Adicionar coluna url à tabela fotos_relatorio

Revision ID: add_url_to_fotos
Revises: fe8e8e8ec755
Create Date: 2025-11-02 03:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'add_url_to_fotos'
down_revision = 'fe8e8e8ec755'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Adicionar coluna url à tabela fotos_relatorio de forma idempotente
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('fotos_relatorio')]
    
    if 'url' not in columns:
        with op.batch_alter_table('fotos_relatorio', schema=None) as batch_op:
            batch_op.add_column(sa.Column('url', sa.Text(), nullable=True))


def downgrade() -> None:
    # Remover coluna url da tabela fotos_relatorio
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('fotos_relatorio')]
    
    if 'url' in columns:
        with op.batch_alter_table('fotos_relatorio', schema=None) as batch_op:
            batch_op.drop_column('url')
