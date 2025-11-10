"""add_tracker_user_field_table

Revision ID: 3c4d5e6f7a8b
Revises: 2b3c4d5e6f7a
Create Date: 2025-11-06 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '3c4d5e6f7a8b'
down_revision = '2b3c4d5e6f7a'
branch_labels = None
depends_on = None


def upgrade():
    # Create tracker_user_fields table
    op.create_table('tracker_user_fields',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tracker_id', sa.Integer(), nullable=False),
        sa.Column('field_name', sa.String(length=100), nullable=False),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('field_full_path', sa.String(length=200), nullable=True),
        sa.Column('display_label', sa.String(length=200), nullable=True),
        sa.Column('help_text', sa.Text(), nullable=True),
        sa.Column('field_order', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(['tracker_id'], ['trackers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_id'], ['tracker_user_fields.id']),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Add tracker_user_field_id to field_options table
    op.add_column('field_options', sa.Column('tracker_user_field_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_field_options_tracker_user_field', 'field_options', 'tracker_user_fields', ['tracker_user_field_id'], ['id'], ondelete='CASCADE')
    
    # Make tracker_field_id nullable (since now we can have either tracker_field_id OR tracker_user_field_id)
    op.alter_column('field_options', 'tracker_field_id', nullable=True)
    
    # Add check constraint to ensure at least one field reference exists
    op.create_check_constraint(
        'check_field_reference',
        'field_options',
        '(tracker_field_id IS NOT NULL) OR (tracker_user_field_id IS NOT NULL)'
    )


def downgrade():
    # Remove check constraint
    op.drop_constraint('check_field_reference', 'field_options', type_='check')
    
    # Make tracker_field_id NOT NULL again
    op.alter_column('field_options', 'tracker_field_id', nullable=False)
    
    # Remove foreign key and column
    op.drop_constraint('fk_field_options_tracker_user_field', 'field_options', type_='foreignkey')
    op.drop_column('field_options', 'tracker_user_field_id')
    
    # Drop tracker_user_fields table
    op.drop_table('tracker_user_fields')

