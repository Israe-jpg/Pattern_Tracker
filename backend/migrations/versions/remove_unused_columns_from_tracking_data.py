"""remove_unused_columns_from_tracking_data

Revision ID: 1a2b3c4d5e6f
Revises: 09dca1b9fa78
Create Date: 2025-11-06 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '1a2b3c4d5e6f'
down_revision = '09dca1b9fa78'
branch_labels = None
depends_on = None


def upgrade():
    # Drop columns that don't exist in the model
    op.drop_column('tracking_data', 'user_notes')
    op.drop_column('tracking_data', 'ai_insights_updated_at')
    op.drop_column('tracking_data', 'updated_at')


def downgrade():
    # Re-add columns if needed to rollback
    op.add_column('tracking_data', sa.Column('updated_at', sa.DateTime(), nullable=True))
    op.add_column('tracking_data', sa.Column('ai_insights_updated_at', sa.DateTime(), nullable=True))
    op.add_column('tracking_data', sa.Column('user_notes', sa.Text(), nullable=True))

