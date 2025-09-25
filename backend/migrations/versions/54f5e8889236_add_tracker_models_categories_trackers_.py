"""Add tracker models - categories, trackers, and tracking data

Revision ID: 54f5e8889236
Revises: 72f47fd6b74a
Create Date: 2025-09-25 10:13:09.847572

"""
from alembic import op
import sqlalchemy as sa
from app.config import tracker_config


# revision identifiers, used by Alembic.
revision = '54f5e8889236'
down_revision = '72f47fd6b74a'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('tracker_categories',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('data_schema', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_table('trackers',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('category_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('is_default', sa.Boolean(), nullable=True),
    sa.ForeignKeyConstraint(['category_id'], ['tracker_categories.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('tracking_data',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('tracker_id', sa.Integer(), nullable=False),
    sa.Column('data', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['tracker_id'], ['trackers.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    # add default tracker categories
    from sqlalchemy.sql import table, column
    from sqlalchemy import String, Integer, JSON, DateTime, Boolean
    from datetime import datetime

    tracker_categories = table('tracker_categories',
        column('id', Integer),
        column('name', String),
        column('data_schema', JSON),
        column('created_at', DateTime),
        column('is_active', Boolean)
    )
    # baseline schema
    baseline_schema = tracker_config.get_schema('baseline')

    # period tracker
    op.execute(tracker_categories.insert().values(
        name='Period Tracker',
        data_schema={
            'baseline': baseline_schema,
            'period_tracker': tracker_config.get_schema('period_tracker')
        },
        created_at=datetime.now(),
        is_active=True
    ))
    #workout tracker
    op.execute(tracker_categories.insert().values(
        name='Workout Tracker',
        data_schema={
            'baseline': baseline_schema,
            'workout_tracker': tracker_config.get_schema('workout_tracker')
        },
        created_at=datetime.now(),
        is_active=True
    ))
    #symptom tracker
    op.execute(tracker_categories.insert().values(
        name='Symptom Tracker',
        data_schema={
            'baseline': baseline_schema,
            'symptom_tracker': tracker_config.get_schema('symptom_tracker')
        },
        created_at=datetime.now(),
        is_active=True
    ))


def downgrade():
    op.drop_table('tracking_data')
    op.drop_table('trackers')
    op.drop_table('tracker_categories')
        
