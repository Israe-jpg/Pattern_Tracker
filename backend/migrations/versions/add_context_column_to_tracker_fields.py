"""add context column to tracker_fields

Revision ID: add_context_column
Revises: fb880b9f9559
Create Date: 2026-01-14 16:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_context_column'
down_revision = 'fb880b9f9559'
branch_labels = None
depends_on = None


def upgrade():
    # Add context column to tracker_fields table
    op.add_column('tracker_fields', sa.Column('context', sa.String(100), nullable=True))
    
    # Migrate existing data: copy field_parent to context for period tracker fields
    # This preserves the data where field_parent was being used as context
    op.execute("""
        UPDATE tracker_fields 
        SET context = field_parent 
        WHERE field_group = 'period_tracker' 
        AND field_parent IN ('menstruating', 'not_menstruating')
    """)
    
    # Clear field_parent for period tracker fields (since it was being misused as context)
    op.execute("""
        UPDATE tracker_fields 
        SET field_parent = NULL 
        WHERE field_group = 'period_tracker' 
        AND context IN ('menstruating', 'not_menstruating')
    """)


def downgrade():
    # Reverse migration: copy context back to field_parent for period tracker
    op.execute("""
        UPDATE tracker_fields 
        SET field_parent = context 
        WHERE field_group = 'period_tracker' 
        AND context IS NOT NULL
    """)
    
    # Drop context column
    op.drop_column('tracker_fields', 'context')

