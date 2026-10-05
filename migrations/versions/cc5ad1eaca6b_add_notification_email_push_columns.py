"""add_notification_email_push_columns

Revision ID: cc5ad1eaca6b
Revises: 265f97ab88c1
Create Date: 2025-10-31 19:39:33.701076

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'cc5ad1eaca6b'
down_revision = '265f97ab88c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Adiciona colunas de notificação por email e push se não existirem
    # Esta migration é idempotente - pode ser executada mesmo se as colunas já existirem
    
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('notificacoes')]
    
    # Adicionar coluna email_enviado se não existir
    if 'email_enviado' not in columns:
        op.add_column('notificacoes', sa.Column('email_enviado', sa.Boolean(), nullable=True, server_default='false'))
    
    # Adicionar coluna email_sucesso se não existir
    if 'email_sucesso' not in columns:
        op.add_column('notificacoes', sa.Column('email_sucesso', sa.Boolean(), nullable=True))
    
    # Adicionar coluna email_erro se não existir
    if 'email_erro' not in columns:
        op.add_column('notificacoes', sa.Column('email_erro', sa.Text(), nullable=True))
    
    # Adicionar coluna push_enviado se não existir
    if 'push_enviado' not in columns:
        op.add_column('notificacoes', sa.Column('push_enviado', sa.Boolean(), nullable=True, server_default='false'))
    
    # Adicionar coluna push_sucesso se não existir
    if 'push_sucesso' not in columns:
        op.add_column('notificacoes', sa.Column('push_sucesso', sa.Boolean(), nullable=True))
    
    # Adicionar coluna push_erro se não existir
    if 'push_erro' not in columns:
        op.add_column('notificacoes', sa.Column('push_erro', sa.Text(), nullable=True))


def downgrade() -> None:
    # Remove as colunas adicionadas (ordem reversa)
    op.drop_column('notificacoes', 'push_erro')
    op.drop_column('notificacoes', 'push_sucesso')
    op.drop_column('notificacoes', 'push_enviado')
    op.drop_column('notificacoes', 'email_erro')
    op.drop_column('notificacoes', 'email_sucesso')
    op.drop_column('notificacoes', 'email_enviado')