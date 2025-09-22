# Database Migrations

Simple PostgreSQL migrations for the Health Tracker app.

## Setup

1. Make sure your virtual environment is active:

   ```
   .\venv\Scripts\Activate.ps1
   ```

2. Set your DATABASE_URL in `.env` file:

   ```
   DATABASE_URL=postgresql://username:password@localhost:5432/health_tracker
   ```

3. Apply the migration:
   ```
   flask db upgrade
   ```

## Current Migration

- **001_initial_migration_create_users_table.py** - Creates the users table

## Basic Commands

- `flask db upgrade` - Apply migrations
- `flask db current` - Show current migration
- `flask db downgrade` - Rollback last migration
