"""Cascade deletes from users to trackers and trackers to period_cycles

Revision ID: cascade_user_tracker_deletes
Revises: 5d761ae1f696
Create Date: 2026-05-22

"""
from alembic import op


revision = 'cascade_user_tracker_deletes'
down_revision = '5d761ae1f696'
branch_labels = None
depends_on = None


def _replace_fk(table, constraint_name, referent_table, local_cols, remote_cols, ondelete):
    op.drop_constraint(constraint_name, table, type_='foreignkey')
    op.create_foreign_key(
        constraint_name,
        table,
        referent_table,
        local_cols,
        remote_cols,
        ondelete=ondelete,
    )


def upgrade():
    _replace_fk(
        'trackers',
        'trackers_user_id_fkey',
        'users',
        ['user_id'],
        ['id'],
        'CASCADE',
    )
    _replace_fk(
        'period_cycles',
        'period_cycles_tracker_id_fkey',
        'trackers',
        ['tracker_id'],
        ['id'],
        'CASCADE',
    )


def downgrade():
    _replace_fk(
        'period_cycles',
        'period_cycles_tracker_id_fkey',
        'trackers',
        ['tracker_id'],
        ['id'],
        None,
    )
    _replace_fk(
        'trackers',
        'trackers_user_id_fkey',
        'users',
        ['user_id'],
        ['id'],
        None,
    )
