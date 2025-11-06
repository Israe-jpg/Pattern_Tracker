from datetime import datetime
import marshmallow as ma
from app.models.tracking_data import TrackingData

class TrackingDataSchema(ma.Schema):
    """
    Basic schema validation - only validates structure and types.
    Business logic validation (against tracker schema) is done in TrackingService.
    """
    id = ma.fields.Int(dump_only=True)
    entry_date = ma.fields.Date(required=False, allow_none=True)
    data = ma.fields.Dict(required=False, allow_none=True, keys=ma.fields.Str(), values=ma.fields.Dict())
    ai_insights = ma.fields.Dict(required=False, allow_none=True)
    created_at = ma.fields.DateTime(dump_only=True)

    class Meta:
        model = TrackingData
        fields = ['id', 'entry_date', 'data', 'ai_insights', 'created_at']
    
    @ma.post_load
    def validate_basic_structure(self, data, **kwargs):
        # data is optional, but if provided, must be a dict
        if 'data' in data and data['data'] is not None:
            if not isinstance(data['data'], dict):
                raise ma.ValidationError('data must be a dictionary')
            
            # Ensure data structure is: {field_name: {option_name: value}}
            for field_name, field_data in data['data'].items():
                if not isinstance(field_data, dict):
                    raise ma.ValidationError(f'Field "{field_name}" must contain a dictionary of options')
        else:
            # Default to empty dict if not provided
            data['data'] = {}
        
        return data