"""
Setup Period Tracker fields in the database with proper structure.
Creates 'menstruating' and 'not_menstruating' fields with nested options.
"""
from app import create_app, db
from app.models.tracker_field import TrackerField
from app.models.field_option import FieldOption
from app.models.tracker_category import TrackerCategory
from app.services.category_service import CategoryService
import json

def setup_period_tracker_fields():
    """Setup period tracker fields from JSON config."""
    app = create_app()
    with app.app_context():
        print("Setting up Period Tracker fields...\n")
        
        # Find Period Tracker category
        period_category = TrackerCategory.query.filter_by(name='Period Tracker').first()
        if not period_category:
            print("ERROR: Period Tracker category not found!")
            return
        
        print(f"Found Period Tracker category ID: {period_category.id}")
        
        # Load JSON config
        config = CategoryService._load_config()
        period_config = config.get('period_tracker', {})
        
        # Get menstruating and not_menstruating sections
        menstruating_schema = period_config.get('menstruating', {})
        not_menstruating_schema = period_config.get('not_menstruating', {})
        
        # Get starting field order
        last_baseline = TrackerField.query.filter_by(
            category_id=period_category.id,
            field_group='baseline'
        ).order_by(TrackerField.field_order.desc()).first()
        
        next_order = (last_baseline.field_order + 1) if last_baseline else 0
        
        # Setup both contexts: process actual fields (flow, symptoms, discharge, etc.)
        for context_name, schema in [('menstruating', menstruating_schema), ('not_menstruating', not_menstruating_schema)]:
            print(f"\n{'='*60}")
            print(f"Setting up fields for '{context_name}' context")
            print(f"{'='*60}")
            
            # Iterate over actual field names (flow, symptoms, products, discharge, etc.)
            for field_name, field_options in schema.items():
                print(f"\n  Processing field: {field_name}")
                
                # Check if field already exists with this context
                # Use the 'context' column to store context (menstruating/not_menstruating)
                existing_field = TrackerField.query.filter_by(
                    category_id=period_category.id,
                    field_group='period_tracker',
                    field_name=field_name,
                    context=context_name  # Use context column (proper design)
                ).first()
                
                if existing_field:
                    print(f"    Field '{field_name}' ({context_name}) already exists (ID: {existing_field.id})")
                    # Clean up existing options
                    existing_options = FieldOption.query.filter_by(tracker_field_id=existing_field.id).all()
                    for opt in existing_options:
                        db.session.delete(opt)
                    print(f"    Removed {len(existing_options)} existing options")
                    field = existing_field
                else:
                    # Create new field
                    field = TrackerField(
                        category_id=period_category.id,
                        field_name=field_name,
                        context=context_name,  # Use context column (clean and explicit)
                        display_label=field_name.replace('_', ' ').title(),
                        field_group='period_tracker',
                        field_order=next_order,
                        is_active=True
                    )
                    db.session.add(field)
                    db.session.flush()
                    print(f"    Created field '{field_name}' (ID: {field.id}) for context: {context_name}")
                    next_order += 1
                
                # Create options for this field
                option_order = 0
                for option_name, option_schema in field_options.items():
                    # Convert schema to option data
                    option_data = CategoryService._schema_to_option_data(option_name, option_schema)
                    
                    # Create the option
                    option = FieldOption(
                        tracker_field_id=field.id,
                        option_name=option_name,  # Just the option name (level, color, physical, etc.)
                        option_type=option_data['option_type'],
                        display_label=option_data.get('display_label', option_name.replace('_', ' ').title()),
                        is_required=option_data.get('is_required', False),
                        option_order=option_order,
                        min_value=option_data.get('min_value'),
                        max_value=option_data.get('max_value'),
                        max_length=option_data.get('max_length'),
                        step=option_data.get('step'),
                        choices=option_data.get('choices'),
                        choice_labels=option_data.get('choice_labels'),
                        is_active=True
                    )
                    db.session.add(option)
                    print(f"      Created option: {option_name} ({option_data['option_type']})")
                    option_order += 1
        
        print(f"\n{'='*60}")
        print("Committing changes...")
        db.session.commit()
        print("Period Tracker fields setup successfully!")
        
        # Verification
        print(f"\n{'='*60}")
        print("Verification:")
        print(f"{'='*60}")
        for context_name in ['menstruating', 'not_menstruating']:
            print(f"\n  Context: {context_name}")
            fields = TrackerField.query.filter_by(
                category_id=period_category.id,
                field_group='period_tracker',
                context=context_name  # Use context column
            ).order_by(TrackerField.field_order).all()
            
            print(f"    Fields: {len(fields)}")
            for field in fields:
                options_count = FieldOption.query.filter_by(
                    tracker_field_id=field.id,
                    is_active=True
                ).count()
                print(f"      - {field.field_name} (ID: {field.id}, {options_count} options)")
                
                # Show first few options
                options = FieldOption.query.filter_by(
                    tracker_field_id=field.id,
                    is_active=True
                ).order_by(FieldOption.option_order).limit(3).all()
                
                for opt in options:
                    print(f"          * {opt.option_name} ({opt.option_type})")
                
                if options_count > 3:
                    print(f"          ... and {options_count - 3} more")

if __name__ == "__main__":
    setup_period_tracker_fields()

