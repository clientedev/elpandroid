"""Add google_event_id to visitas table

Revision ID: 02c09d2c0073
Revises: add_url_to_fotos
Create Date: 2025-11-19 17:54:01.443592

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '02c09d2c0073'
down_revision = 'add_url_to_fotos'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add google_event_id column to visitas table for Google Calendar integration
    # Use raw SQL to check if column already exists (idempotent migration)
    from sqlalchemy import text
    bind = op.get_bind()
    
    # Check if column exists
    result = bind.execute(text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='visitas' AND column_name='google_event_id'
    """))
    
    if not result.fetchone():
        op.add_column('visitas', sa.Column('google_event_id', sa.String(length=255), nullable=True))
    
    # Check if index exists
    result_index = bind.execute(text("""
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename='visitas' AND indexname='idx_visitas_google_event_id'
    """))
    
    if not result_index.fetchone():
        op.create_index('idx_visitas_google_event_id', 'visitas', ['google_event_id'], unique=False)


def downgrade() -> None:
    # Remove index first (if exists)
    from sqlalchemy import text
    bind = op.get_bind()
    
    result_index = bind.execute(text("""
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename='visitas' AND indexname='idx_visitas_google_event_id'
    """))
    
    if result_index.fetchone():
        op.drop_index('idx_visitas_google_event_id', table_name='visitas')
    
    # Remove column (if exists)
    result = bind.execute(text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='visitas' AND column_name='google_event_id'
    """))
    
    if result.fetchone():
        op.drop_column('visitas', 'google_event_id')