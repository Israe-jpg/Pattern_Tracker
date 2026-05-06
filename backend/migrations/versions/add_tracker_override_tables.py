"""Add tracker_field_overrides and tracker_option_overrides tables

These tables implement the template + per-tracker override pattern.
Shared tracker_fields and field_options rows are now immutable templates;
any per-user customisation (hide, rename, reorder) is stored as a thin
override row keyed by (tracker_id, tracker_field_id / field_option_id).

Revision ID: add_tracker_override_tables
Revises: merge_heads_pre_overrides
Create Date: 2026-05-06 16:05:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_tracker_override_tables'
down_revision = 'merge_heads_pre_overrides'
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------ #
    # tracker_field_overrides                                              #
    # One row per (tracker, shared-field) pair whenever the user wants    #
    # to hide, rename, or reorder a shared TrackerField.                  #
    # ------------------------------------------------------------------ #
    op.create_table(
        'tracker_field_overrides',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'tracker_id',
            sa.Integer(),
            sa.ForeignKey('trackers.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'tracker_field_id',
            sa.Integer(),
            sa.ForeignKey('tracker_fields.id', ondelete='CASCADE'),
            nullable=False,
        ),
        # Nullable patch columns — NULL means "use the template value"
        sa.Column('display_label', sa.String(200), nullable=True),
        sa.Column('field_order', sa.Integer(), nullable=True),
        sa.Column('is_hidden', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            'tracker_id',
            'tracker_field_id',
            name='uq_tracker_field_override_tracker_field',
        ),
    )
    op.create_index(
        'idx_tfo_tracker',
        'tracker_field_overrides',
        ['tracker_id'],
    )

    # ------------------------------------------------------------------ #
    # tracker_option_overrides                                             #
    # One row per (tracker, shared-option) pair whenever the user wants   #
    # to hide, rename, or reorder a shared FieldOption.                   #
    # ------------------------------------------------------------------ #
    op.create_table(
        'tracker_option_overrides',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'tracker_id',
            sa.Integer(),
            sa.ForeignKey('trackers.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'field_option_id',
            sa.Integer(),
            sa.ForeignKey('field_options.id', ondelete='CASCADE'),
            nullable=False,
        ),
        # Nullable patch columns — NULL means "use the template value"
        sa.Column('option_name', sa.String(100), nullable=True),
        sa.Column('option_order', sa.Integer(), nullable=True),
        sa.Column('is_hidden', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            'tracker_id',
            'field_option_id',
            name='uq_tracker_option_override_tracker_option',
        ),
    )
    op.create_index(
        'idx_too_tracker',
        'tracker_option_overrides',
        ['tracker_id'],
    )


def downgrade():
    op.drop_index('idx_too_tracker', table_name='tracker_option_overrides')
    op.drop_table('tracker_option_overrides')
    op.drop_index('idx_tfo_tracker', table_name='tracker_field_overrides')
    op.drop_table('tracker_field_overrides')
