"""add_entry_date_and_ai_fields_to_tracking_data

Revision ID: 09dca1b9fa78
Revises: fb880b9f9559
Create Date: 2025-11-06 09:09:30.549801

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '09dca1b9fa78'
down_revision = 'fb880b9f9559'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns (matching the actual model)
    op.add_column('tracking_data', sa.Column('entry_date', sa.Date(), nullable=False, server_default=sa.text('CURRENT_DATE')))
    op.add_column('tracking_data', sa.Column('ai_insights', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    
    # Add indexes
    op.create_index('ix_tracking_data_tracker_id', 'tracking_data', ['tracker_id'])
    op.create_index('ix_tracking_data_entry_date', 'tracking_data', ['entry_date'])
    op.create_index('idx_tracker_entry_date', 'tracking_data', ['tracker_id', 'entry_date'])
    
    # Add unique constraint to prevent duplicate entries for same tracker and date
    op.create_unique_constraint('uq_tracker_date', 'tracking_data', ['tracker_id', 'entry_date'])
    
    # Update existing records to have entry_date = created_at date
    op.execute("""
        UPDATE tracking_data 
        SET entry_date = DATE(created_at)
        WHERE entry_date IS NULL
    """)


def downgrade():
    # Drop unique constraint
    op.drop_constraint('uq_tracker_date', 'tracking_data', type_='unique')
    
    # Drop indexes
    op.drop_index('idx_tracker_entry_date', table_name='tracking_data')
    op.drop_index('ix_tracking_data_entry_date', table_name='tracking_data')
    op.drop_index('ix_tracking_data_tracker_id', table_name='tracking_data')
    
    # Drop columns
    op.drop_column('tracking_data', 'ai_insights')
    op.drop_column('tracking_data', 'entry_date')
