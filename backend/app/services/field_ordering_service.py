from typing import List, Union
from sqlalchemy.orm.attributes import flag_modified

from app import db
from app.models.tracker_field import TrackerField
from app.models.tracker_user_field import TrackerUserField
from app.models.tracker_category import TrackerCategory
from app.models.tracker import Tracker
from app.models.field_option import FieldOption
from app.services.tracker_constants import (
    is_prebuilt_category,
    get_category_config_key
)


class FieldOrderingService:
    """
    Professional field ordering service with proper offset calculation and reordering logic.
    
    Field hierarchy:
    1. Baseline fields (fixed position, cannot reorder)
    2. Category-specific fields (e.g., period_tracker, workout_tracker - fixed position)
    3. Custom category fields (TrackerField with field_group='custom' - user can reorder)
    4. User fields (TrackerUserField - user can reorder within their own tracker)
    """

    @staticmethod
    def update_tracker_field_order(field_id: int, new_relative_order: int) -> None:
        """
        Reorder a TrackerField (custom category field).
        
        Args:
            field_id: ID of TrackerField to reorder
            new_relative_order: New position within custom fields (0-based)
        """
        try:
            # Expire cache to ensure fresh data
            db.session.expire_all()
            
            field = TrackerField.query.filter_by(id=field_id).first()
            if not field:
                raise ValueError("Field not found")
            
            if field.field_group == 'baseline':
                raise ValueError("Cannot reorder baseline fields")
            
            if field.field_group != 'custom':
                raise ValueError("Can only reorder custom fields")
            
            # Get all ACTIVE custom fields for this category (sorted by current order)
            custom_fields = TrackerField.query.filter_by(
                category_id=field.category_id,
                field_group='custom',
                is_active=True
            ).order_by(TrackerField.field_order.asc()).all()
            
            if not custom_fields:
                return  # No fields to reorder
            
            # Validate new order
            if new_relative_order < 0 or new_relative_order >= len(custom_fields):
                raise ValueError(
                    f"Invalid order. Must be between 0 and {len(custom_fields) - 1}"
                )
            
            # Calculate offset (baseline + category-specific fields)
            offset = FieldOrderingService._get_category_offset(field.category_id)
            
            # Perform reordering
            FieldOrderingService._reorder_fields(
                fields=custom_fields,
                field_to_move=field,
                new_relative_order=new_relative_order,
                offset=offset
            )
            
            # Commit changes
            db.session.commit()
            
            # Expire again to ensure next read gets fresh data
            db.session.expire_all()
            
        except Exception as e:
            db.session.rollback()
            raise
    
    @staticmethod
    def update_user_field_order(field_id: int, new_relative_order: int) -> None:
        """
        Reorder a TrackerUserField.
        
        Args:
            field_id: ID of TrackerUserField to reorder
            new_relative_order: New position within user fields (0-based)
        """
        try:
            # Expire cache to ensure fresh data
            db.session.expire_all()
            
            field = TrackerUserField.query.filter_by(id=field_id).first()
            if not field:
                raise ValueError("Field not found")
            
            # Get all ACTIVE user fields for this tracker (sorted by current order)
            user_fields = TrackerUserField.query.filter_by(
                tracker_id=field.tracker_id,
                is_active=True
            ).order_by(TrackerUserField.field_order.asc()).all()
            
            if not user_fields:
                return  # No fields to reorder
            
            # Validate new order
            if new_relative_order < 0 or new_relative_order >= len(user_fields):
                raise ValueError(
                    f"Invalid order. Must be between 0 and {len(user_fields) - 1}"
                )
            
            # Get tracker to calculate offset
            tracker = Tracker.query.filter_by(id=field.tracker_id).first()
            if not tracker:
                raise ValueError("Tracker not found")
            
            # Calculate offset (baseline + category-specific + custom category fields)
            offset = FieldOrderingService._get_tracker_offset(tracker.category_id)
            
            # Perform reordering
            FieldOrderingService._reorder_fields(
                fields=user_fields,
                field_to_move=field,
                new_relative_order=new_relative_order,
                offset=offset
            )
            
            # Commit changes
            db.session.commit()
            
            # Expire again to ensure next read gets fresh data
            db.session.expire_all()
            
        except Exception as e:
            db.session.rollback()
            raise
    
    @staticmethod
    def _get_category_offset(category_id: int) -> int:
        """
        Calculate the starting offset for custom category fields.
        Offset = baseline fields + category-specific fields
        """
        # Count ACTIVE baseline fields
        baseline_count = TrackerField.query.filter_by(
            category_id=category_id,
            field_group='baseline',
            is_active=True
        ).count()
        
        # Count ACTIVE category-specific fields (for prebuilt categories only)
        category = TrackerCategory.query.filter_by(id=category_id).first()
        category_specific_count = 0
        
        if category and is_prebuilt_category(category.name):
            config_key = get_category_config_key(category.name)
            
            if config_key:
                category_specific_count = TrackerField.query.filter_by(
                    category_id=category_id,
                    field_group=config_key,
                    is_active=True
                ).count()
        
        return baseline_count + category_specific_count
    
    @staticmethod
    def _get_tracker_offset(category_id: int) -> int:
        """
        Calculate the starting offset for user fields.
        Offset = baseline + category-specific + custom category fields
        """
        base_offset = FieldOrderingService._get_category_offset(category_id)
        
        # Add ACTIVE custom category fields
        custom_count = TrackerField.query.filter_by(
            category_id=category_id,
            field_group='custom',
            is_active=True
        ).count()
        
        return base_offset + custom_count
    
    @staticmethod
    def _reorder_fields(fields: List[Union[TrackerField, TrackerUserField]],
                       field_to_move: Union[TrackerField, TrackerUserField],
                       new_relative_order: int,
                       offset: int) -> None:
        """
        Core reordering logic using list manipulation.
        
        Algorithm:
        1. Find current position of field to move
        2. Remove field from list
        3. Insert field at new position
        4. Reassign all field_order values sequentially with offset
        """
        # Find current relative position
        current_relative_order = None
        for i, f in enumerate(fields):
            if f.id == field_to_move.id:
                current_relative_order = i
                break
        
        if current_relative_order is None:
            raise ValueError("Field not found in fields list")
        
        # No change needed
        if current_relative_order == new_relative_order:
            return
        
        # Create new ordered list by removing and inserting
        reordered_fields = fields.copy()
        reordered_fields.pop(current_relative_order)
        reordered_fields.insert(new_relative_order, field_to_move)
        
        # Reassign ALL field_order values sequentially
        for index, field in enumerate(reordered_fields):
            new_order_value = offset + index
            field.field_order = new_order_value
            # Explicitly add to session to track changes
            db.session.add(field)
        
        # Flush to ensure changes are written
        db.session.flush()
    
    @staticmethod
    def get_all_ordered_fields(category_id: int, tracker_id: int = None) -> dict:
        """
        Get all fields in proper display order.
        
        Returns:
            Dictionary with field groups in display order
        """
        result = {
            'baseline': [],
            'category_specific': [],
            'custom': [],
            'user': []
        }
        
        # 1. Baseline fields
        result['baseline'] = TrackerField.query.filter_by(
            category_id=category_id,
            field_group='baseline',
            is_active=True
        ).order_by(TrackerField.field_order.asc()).all()
        
        # 2. Category-specific fields (for prebuilt categories)
        category = TrackerCategory.query.filter_by(id=category_id).first()
        if category and is_prebuilt_category(category.name):
            config_key = get_category_config_key(category.name)
            
            if config_key:
                result['category_specific'] = TrackerField.query.filter_by(
                    category_id=category_id,
                    field_group=config_key,
                    is_active=True
                ).order_by(TrackerField.field_order.asc()).all()
        
        # 3. Custom category fields
        result['custom'] = TrackerField.query.filter_by(
            category_id=category_id,
            field_group='custom',
            is_active=True
        ).order_by(TrackerField.field_order.asc()).all()
        
        # 4. User fields (if tracker_id provided)
        if tracker_id:
            result['user'] = TrackerUserField.query.filter_by(
                tracker_id=tracker_id,
                is_active=True
            ).order_by(TrackerUserField.field_order.asc()).all()
        
        return result
    
    # ========================================================================
    # OPTION ORDERING
    # ========================================================================
    
    @staticmethod
    def update_option_order(option_id: int, new_relative_order: int) -> None:
        """
        Reorder a FieldOption within its parent field.
        Uses the same robust list insertion approach as field reordering.
        """
        try:
            # Expire cache to ensure fresh data
            db.session.expire_all()
            
            option = FieldOption.query.filter_by(id=option_id).first()
            if not option:
                raise ValueError("Option not found")
            
            # Validate that option has a valid parent field reference
            if not option.tracker_user_field_id and not option.tracker_field_id:
                raise ValueError("Option has no valid parent field reference")
            
            # Get all ACTIVE options for this field (sorted by current order)
            # Check user field first to avoid ID collision (same as verify_field_ownership)
            if option.tracker_user_field_id:
                options = FieldOption.query.filter_by(
                    tracker_user_field_id=option.tracker_user_field_id,
                    is_active=True
                ).order_by(FieldOption.option_order.asc()).all()
            elif option.tracker_field_id:
                options = FieldOption.query.filter_by(
                    tracker_field_id=option.tracker_field_id,
                    is_active=True
                ).order_by(FieldOption.option_order.asc()).all()
            else:
                raise ValueError("Option has no valid field reference")
            
            if not options:
                return  # No options to reorder
            
            # Validate new order
            if new_relative_order < 0 or new_relative_order >= len(options):
                raise ValueError(
                    f"Invalid order. Must be between 0 and {len(options) - 1}"
                )
            
            # Find current position
            current_relative_order = next(
                (i for i, opt in enumerate(options) if opt.id == option.id),
                None
            )
            
            if current_relative_order is None:
                raise ValueError("Option not found in options list")
            
            # No change needed
            if current_relative_order == new_relative_order:
                return
            
            # Create new ordered list using list insertion
            new_order = options.copy()
            new_order.pop(current_relative_order)
            new_order.insert(new_relative_order, option)
            
            # Update ALL option orders (no offset needed - options start at 0)
            for index, opt in enumerate(new_order):
                opt.option_order = index
                db.session.add(opt)
                flag_modified(opt, 'option_order')
            
            # Commit changes
            db.session.commit()
            db.session.expire_all()
            
        except Exception as e:
            db.session.rollback()
            raise
    
    # ========================================================================
    # FIELD ORDER NORMALIZATION
    # ========================================================================
    
    @staticmethod
    def normalize_field_orders(category_id: int, tracker_id: int = None) -> None:
        """
        Normalize all field orders to ensure they're sequential with proper offsets.
        Use this to fix corrupted ordering or after bulk operations.
        """
        try:
            offset = 0
            
            # 1. Normalize baseline fields (order 0, 1, 2, ...)
            baseline_fields = TrackerField.query.filter_by(
                category_id=category_id,
                field_group='baseline',
                is_active=True
            ).order_by(TrackerField.field_order.asc()).all()
            
            for i, field in enumerate(baseline_fields):
                field.field_order = i
                db.session.add(field)
            
            offset += len(baseline_fields)
            
            # 2. Normalize category-specific fields
            category = TrackerCategory.query.filter_by(id=category_id).first()
            if category and is_prebuilt_category(category.name):
                config_key = get_category_config_key(category.name)
                
                if config_key:
                    category_fields = TrackerField.query.filter_by(
                        category_id=category_id,
                        field_group=config_key,
                        is_active=True
                    ).order_by(TrackerField.field_order.asc()).all()
                    
                    for i, field in enumerate(category_fields):
                        field.field_order = offset + i
                        db.session.add(field)
                    
                    offset += len(category_fields)
            
            # 3. Normalize custom category fields
            custom_fields = TrackerField.query.filter_by(
                category_id=category_id,
                field_group='custom',
                is_active=True
            ).order_by(TrackerField.field_order.asc()).all()
            
            for i, field in enumerate(custom_fields):
                field.field_order = offset + i
                db.session.add(field)
            
            offset += len(custom_fields)
            
            # 4. Normalize user fields (if tracker provided)
            if tracker_id:
                user_fields = TrackerUserField.query.filter_by(
                    tracker_id=tracker_id,
                    is_active=True
                ).order_by(TrackerUserField.field_order.asc()).all()
                
                for i, field in enumerate(user_fields):
                    field.field_order = offset + i
                    db.session.add(field)
            
            db.session.commit()
            
        except Exception as e:
            db.session.rollback()
            raise