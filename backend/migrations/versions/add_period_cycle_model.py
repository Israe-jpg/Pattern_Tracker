"""Add PeriodCycle model for tracking period cycles

Revision ID: a1b2c3d4e5f6
Revises: 6ebb9e7ab331
Create Date: 2025-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '6ebb9e7ab331'
branch_labels = None
depends_on = None


def upgrade():
    # Create period_cycles table
    op.create_table('period_cycles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tracker_id', sa.Integer(), nullable=False),
        sa.Column('cycle_start_date', sa.Date(), nullable=False),
        sa.Column('cycle_end_date', sa.Date(), nullable=True),
        sa.Column('period_start_date', sa.Date(), nullable=False),
        sa.Column('period_end_date', sa.Date(), nullable=True),
        sa.Column('cycle_length', sa.Integer(), nullable=True),
        sa.Column('period_length', sa.Integer(), nullable=True),
        sa.Column('predicted_ovulation_date', sa.Date(), nullable=True),
        sa.Column('predicted_next_period_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['tracker_id'], ['trackers.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_period_cycles_cycle_start_date', 'period_cycles', ['cycle_start_date'], unique=False)
    op.create_index('ix_period_cycles_tracker_id', 'period_cycles', ['tracker_id'], unique=False)


def downgrade():
    # Drop indexes and table
    op.drop_index('ix_period_cycles_tracker_id', table_name='period_cycles')
    op.drop_index('ix_period_cycles_cycle_start_date', table_name='period_cycles')
    op.drop_table('period_cycles')

