"""remove_unique_constraint_tracker_date

Revision ID: 2b3c4d5e6f7a
Revises: 1a2b3c4d5e6f
Create Date: 2025-11-06 12:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '2b3c4d5e6f7a'
down_revision = '1a2b3c4d5e6f'
branch_labels = None
depends_on = None


def upgrade():
    # Drop unique constraint to allow multiple entries per day
    op.drop_constraint('uq_tracker_date', 'tracking_data', type_='unique')


def downgrade():
    # Re-add unique constraint
    op.create_unique_constraint('uq_tracker_date', 'tracking_data', ['tracker_id', 'entry_date'])

