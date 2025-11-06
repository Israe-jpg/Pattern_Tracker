from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from marshmallow import ValidationError
from typing import Tuple, Dict, Any

from app import db
from app.models.user import User
from app.models.tracker import Tracker
from app.models.tracking_data import TrackingData
from app.schemas.tracking_data_schema import TrackingDataSchema

data_tracking_bp = Blueprint('data_tracking', __name__)

# HELPER FUNCTIONS


#ROUTES

# ------------------------------
#BASIC CRUD ROUTES

#get all tracking data for a specific tracker


#create a new tracking data entry for a specific tracker


#update a tracking data entry for a specific tracker


#delete a tracking data entry for a specific tracker


# -------------------------------------
# TIME RELATED ROUTES
