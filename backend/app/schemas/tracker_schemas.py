from marshmallow import Schema, fields, validate, ValidationError, post_load
import re

class TrackerSchema(Schema):
    name = fields.Str(required=True)
    data_schema = fields.Dict(required=True)

    @post_load
    def clean_data(self, data, **kwargs):
        """Clean and normalize data after validation"""
        # Strip whitespace
        for key, value in data.items():
            if isinstance(value, str):
                data[key] = value.strip()
        return data


class TrackerUpdateSchema(Schema):
    """Schema for updating tracker data_schema only"""
    data_schema = fields.Dict(required=True)


class TrackerPatchSchema(Schema):
    """Schema for patching specific fields in tracker"""
    field_updates = fields.Dict(required=True)
    
