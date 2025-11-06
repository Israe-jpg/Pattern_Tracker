import marshmallow as ma
from app.models.tracking_data import TrackingData

class TrackingDataSchema(ma.Schema):
    id = ma.fields.Int(dump_only=True)
    tracker_id = ma.fields.Int(required=True)
    entry_date = ma.fields.Date(required=True)
    data = ma.fields.Dict(required=True)
    ai_insights = ma.fields.Dict(required=False)
    created_at = ma.fields.DateTime(dump_only=True)

    class Meta:
        model = TrackingData
        fields = ['id', 'tracker_id', 'entry_date', 'data', 'ai_insights', 'created_at']
    
    @ma.post_load
    def validate_entry_date(self, data, **kwargs):
        # Validate entry date is in the past
        if data['entry_date'] > datetime.now().date():
            raise ma.ValidationError('Entry date cannot be in the future')
        return data

    @ma.post_load
    def validate_field_exists(self, data, **kwargs):
        # Validate field exists in tracker schema
        tracker = Tracker.query.get(data['tracker_id'])
        if not tracker:
            raise ma.ValidationError('Tracker not found')
        if data['field_name'] not in tracker.data_schema.fields:
            raise ma.ValidationError('Field not found in tracker schema')
        return data
    
    @ma.post_load
    def validate_option_exists(self, data, **kwargs):
        # Validate option exists in tracker schema
        tracker = Tracker.query.get(data['tracker_id'])
        if not tracker:
            raise ma.ValidationError('Tracker not found')
        if data['option_name'] not in tracker.data_schema[data['field_name']]:
            raise ma.ValidationError('Option not found in field schema')
        return data

    @ma.post_load
    def validate_data(self, data, **kwargs):
        # Validate data is a dictionary
        if not isinstance(data, dict):
            raise ma.ValidationError('Data must be a dictionary')
        return data
    
    @ma.post_load
    def validate_ai_insights(self, data, **kwargs):
        # Validate ai_insights is a dictionary
        if not isinstance(data, dict):
            raise ma.ValidationError('AI insights must be a dictionary')
        return data