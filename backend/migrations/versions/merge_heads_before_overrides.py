"""Merge dual heads before adding override tables

Revision ID: merge_heads_pre_overrides
Revises: a1b2c3d4e5f6, add_context_column
Create Date: 2026-05-06 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'merge_heads_pre_overrides'
down_revision = ('a1b2c3d4e5f6', 'add_context_column')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
