"""add checklist obra completion tracking

Revision ID: 20260221_checklist_completion
Revises: add_user_devices
Create Date: 2026-02-21 20:30:00

Adds concluido, concluido_relatorio_id, concluido_em to checklist_obra
so each project-stage checklist item can track which report marked it done.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text


# revision identifiers, used by Alembic.
revision = '20260221_checklist_completion'
down_revision = 'add_user_devices'
branch_labels = None
depends_on = None


def _column_exists(table_name, column_name, bind):
    """Return True if the column already exists in the given table."""
    result = bind.execute(text(
        """
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_name = :table AND column_name = :col
        """
    ), {"table": table_name, "col": column_name})
    return result.scalar() > 0


def upgrade():
    bind = op.get_bind()

    # Only add columns that do not already exist (idempotent for existing deployments)
    if not _column_exists('checklist_obra', 'concluido', bind):
        op.execute(text(
            "ALTER TABLE checklist_obra ADD COLUMN concluido BOOLEAN NOT NULL DEFAULT FALSE"
        ))

    if not _column_exists('checklist_obra', 'concluido_relatorio_id', bind):
        op.execute(text(
            "ALTER TABLE checklist_obra ADD COLUMN concluido_relatorio_id INTEGER"
        ))
        # Add FK separately (only if column was just created)
        op.execute(text(
            """
            ALTER TABLE checklist_obra
            ADD CONSTRAINT fk_checklist_obra_relatorio
            FOREIGN KEY (concluido_relatorio_id)
            REFERENCES relatorios(id)
            ON DELETE SET NULL
            """
        ))

    if not _column_exists('checklist_obra', 'concluido_em', bind):
        op.execute(text(
            "ALTER TABLE checklist_obra ADD COLUMN concluido_em TIMESTAMP"
        ))


def downgrade():
    bind = op.get_bind()

    # Drop FK constraint if it exists
    bind.execute(text(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'fk_checklist_obra_relatorio'
            ) THEN
                ALTER TABLE checklist_obra
                DROP CONSTRAINT fk_checklist_obra_relatorio;
            END IF;
        END $$;
        """
    ))

    if _column_exists('checklist_obra', 'concluido_em', bind):
        op.execute(text("ALTER TABLE checklist_obra DROP COLUMN concluido_em"))

    if _column_exists('checklist_obra', 'concluido_relatorio_id', bind):
        op.execute(text("ALTER TABLE checklist_obra DROP COLUMN concluido_relatorio_id"))

    if _column_exists('checklist_obra', 'concluido', bind):
        op.execute(text("ALTER TABLE checklist_obra DROP COLUMN concluido"))
