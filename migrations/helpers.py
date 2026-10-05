"""
Helper functions for Alembic migrations to ensure idempotent operations
"""
from sqlalchemy import inspect


def column_exists(bind, table_name, column_name):
    """Check if a column exists in a table"""
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def table_exists(bind, table_name):
    """Check if a table exists"""
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def add_column_if_absent(op, table_name, column):
    """Add a column to a table only if it doesn't already exist"""
    bind = op.get_bind()
    if not column_exists(bind, table_name, column.name):
        op.add_column(table_name, column)


def drop_column_if_present(op, table_name, column_name):
    """Drop a column from a table only if it exists"""
    bind = op.get_bind()
    if column_exists(bind, table_name, column_name):
        op.drop_column(table_name, column_name)
