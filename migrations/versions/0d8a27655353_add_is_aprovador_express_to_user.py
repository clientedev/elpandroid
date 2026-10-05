"""Add is_aprovador_express to User

Revision ID: 0d8a27655353
Revises: cc5ad1eaca6b
Create Date: 2026-01-28 19:50:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = '0d8a27655353'
down_revision = '8382464115ad'
branch_labels = None
depends_on = None

def upgrade():
    # Helper to check if column exists
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('users')]
    
    if 'is_aprovador_express' not in columns:
        with op.batch_alter_table('users', schema=None) as batch_op:
            batch_op.add_column(sa.Column('is_aprovador_express', sa.Boolean(), nullable=True, server_default='false'))

def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('is_aprovador_express')
