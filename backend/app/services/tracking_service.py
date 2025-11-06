from typing import Dict, Any
from datetime import date
from app.models.tracking_data import TrackingData
from app.models.tracker import Tracker
from app.models.tracker_category import TrackerCategory
from app.services.category_service import CategoryService
from app import db


class TrackingService:
    
    @staticmethod
    def add_tracking_data(tracker: Tracker, data: Dict[str, Any] = None, 
                          entry_date: date = None, ai_insights: Dict[str, Any] = None) -> TrackingData:
        """
        Create a new tracking data entry.
        
        Args:
            tracker: The tracker instance
            data: Tracking data (optional - can be empty dict)
            entry_date: Entry date (optional - defaults to today)
            ai_insights: AI-generated insights (optional)
            
        Returns:
            TrackingData instance
        """
        try:
            # Default values
            if data is None:
                data = {}
            if entry_date is None:
                entry_date = date.today()
            
            # Get tracker schema
            category = TrackerCategory.query.filter_by(id=tracker.category_id).first()
            if not category:
                raise ValueError("Tracker category not found")
            
            # Rebuild schema to ensure it's up-to-date
            schema = CategoryService.rebuild_category_schema(category.id)
            db.session.refresh(category)
            
            # Validate data against tracker schema (only if data is provided)
            if data:
                TrackingService._validate_data_against_schema(
                    data,
                    category.data_schema
                )
            
            # Check for duplicate entry (same tracker + date)
            existing_entry = TrackingData.query.filter_by(
                tracker_id=tracker.id,
                entry_date=entry_date
            ).first()
            
            if existing_entry:
                raise ValueError("Entry already exists for this tracker and date")
            
            # Create tracking data entry
            tracking_data = TrackingData(
                tracker_id=tracker.id,
                entry_date=entry_date,
                data=data,
                ai_insights=ai_insights
            )
            
            db.session.add(tracking_data)
            db.session.commit()
            return tracking_data
            
        except Exception as e:
            db.session.rollback()
            raise
    
    @staticmethod
    def _validate_data_against_schema(data: Dict[str, Any], schema: Dict[str, Any]) -> None:
        """
        Validate tracking data against tracker schema.
        
        Validates:
        - Field names exist in schema (baseline or custom)
        - Option names exist for each field
        - Value types match option types
        - Values are within ranges (for ratings/numbers)
        - Required fields are present (if any)
        
        """
        if not schema:
            raise ValueError("Tracker schema is empty")
        
        # Combine baseline and custom schemas
        all_fields = {}
        if 'baseline' in schema:
            all_fields.update(schema['baseline'])
        if 'custom' in schema:
            all_fields.update(schema['custom'])
        
        # Validate each field in the data
        for field_name, field_data in data.items():
            # Check if field exists in schema
            if field_name not in all_fields:
                raise ValueError(f"Field '{field_name}' does not exist in tracker schema")
            
            field_schema = all_fields[field_name]
            
            # Validate each option in the field
            for option_name, option_value in field_data.items():
                # Check if option exists in field schema
                if option_name not in field_schema:
                    raise ValueError(
                        f"Option '{option_name}' does not exist in field '{field_name}'"
                    )
                
                option_schema = field_schema[option_name]
                
                # Validate value type
                TrackingService._validate_option_value(
                    option_name, option_value, option_schema
                )
    
    @staticmethod
    def _validate_option_value(option_name: str, value: Any, option_schema: Dict[str, Any]) -> None:
        """
        Validate a single option value against its schema.
        
        Args:
            option_name: Name of the option
            value: The value to validate
            option_schema: The option's schema definition
        """
        schema_type = option_schema.get('type')
        is_optional = option_schema.get('optional', False)
        
        # Handle None/null values
        if value is None:
            if not is_optional:
                raise ValueError(f"Option '{option_name}' is required but value is None")
            return
        
        # Validate type
        if schema_type == 'integer':
            if not isinstance(value, int):
                raise ValueError(f"Option '{option_name}' must be an integer, got {type(value).__name__}")
            
            # Validate range if specified
            if 'range' in option_schema:
                min_val, max_val = option_schema['range']
                if not (min_val <= value <= max_val):
                    raise ValueError(
                        f"Option '{option_name}' value {value} is out of range [{min_val}, {max_val}]"
                    )
        
        elif schema_type == 'string':
            if not isinstance(value, str):
                raise ValueError(f"Option '{option_name}' must be a string, got {type(value).__name__}")
            
            # Validate max_length if specified
            if 'max_length' in option_schema:
                max_len = option_schema['max_length']
                if len(value) > max_len:
                    raise ValueError(
                        f"Option '{option_name}' exceeds max length of {max_len}"
                    )
            
            # Validate enum if specified
            if 'enum' in option_schema:
                valid_values = option_schema['enum']
                if value not in valid_values:
                    raise ValueError(
                        f"Option '{option_name}' value '{value}' is not in valid choices: {valid_values}"
                    )
        
        elif schema_type == 'array':
            if not isinstance(value, list):
                raise ValueError(f"Option '{option_name}' must be an array, got {type(value).__name__}")
            
            # Validate enum if specified (for multiple_choice)
            if 'enum' in option_schema:
                valid_values = option_schema['enum']
                for item in value:
                    if item not in valid_values:
                        raise ValueError(
                            f"Option '{option_name}' contains invalid value '{item}'. Valid choices: {valid_values}"
                        )
        
        elif schema_type == 'boolean':
            if not isinstance(value, bool):
                raise ValueError(f"Option '{option_name}' must be a boolean, got {type(value).__name__}")
        
        elif schema_type == 'float':
            if not isinstance(value, (int, float)):
                raise ValueError(f"Option '{option_name}' must be a number, got {type(value).__name__}")
            
            # Validate range if specified
            if 'range' in option_schema:
                min_val, max_val = option_schema['range']
                if not (min_val <= value <= max_val):
                    raise ValueError(
                        f"Option '{option_name}' value {value} is out of range [{min_val}, {max_val}]"
                    )