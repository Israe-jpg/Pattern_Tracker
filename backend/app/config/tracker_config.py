import json
import os

class TrackerConfig:
    def __init__(self):
        config_path = os.path.join(os.path.dirname(__file__), 'tracker_schemas.json')
        with open(config_path, 'r') as f:
            self.schemas = json.load(f)
    
    def get_schema(self, tracker_type):
        #Get schema for specific tracker type
        return self.schemas.get(tracker_type)
    
    def get_all_schemas(self):
        #Get all tracker schemas
        return self.schemas
    
    def validate_data(self, tracker_type, data):
        #Validate data against schema
        pass

# Global instance
tracker_config = TrackerConfig()