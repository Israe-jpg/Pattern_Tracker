# Health Tracker API - Postman Collection

This collection contains all the API endpoints for the Health Tracker application. It's organized into logical groups to make testing easier.

## Getting Started

1. **Import the collection** into Postman
2. **Start your backend server** (usually runs on `http://localhost:5000`)
3. **Get your auth token** by logging in first
4. **Update the Bearer token** in the collection settings

## API Endpoints Overview

### Authentication

- **Register** - Create a new user account
- **Login** - Get your access token
- **Logout** - End your session
- **Obtain User's Sex** - Set user gender information
- **Obtain Optional User Info** - Add date of birth, height, etc.
- **Get User's Profile** - Retrieve user profile information

### Trackers

#### Schema Endpoints

- **Get Form Schema** - Return data schema for form fetching
- **Get Management Schema** - Get schema for management interface
- **Get Complete Schema** - Get schema with active and inactive fields

#### Tracker Management

- **Setup Default Trackers** - Initialize baseline, period, and workout trackers
- **Get My Trackers** - See all your available trackers
- **Delete Tracker** - Remove a tracker from your list
- **Change Default Tracker** - Set which tracker is your main one
- **Create Custom Tracker** - Build your own tracking category
- **Change Tracker Name** - Update tracker name
- **Get Tracker Details** - Get detailed tracker information

#### Menstruation Routes (Period Tracker Only)

- **Get Tracker Settings** - Get tracker settings
- **Add New Settings** - Update tracker settings
- **Log Period Date** - Log a period start date
- **Get Current Cycle** - Get current cycle information
- **Update Cycle Dates** - Update cycle period dates
- **Recalculate Cycles** - Recalculate cycle data
- **Get Cycle History** - Get cycle history with optional limit

### Tracker Fields

- **Get All Fields** - Get all fields of a specific tracker
- **Create New Field** - Add a custom field to a tracker
- **Delete Field** - Remove a field from a tracker
- **Update Field Display Label** - Change how a field appears
- **Update Field Help Text** - Modify the help description
- **Get Field Details** - Get specific field information with all options
- **Update Field Order** - Change the order of fields
- **Get Ordered Fields** - Get fields in their display order
- **Toggle Field Active Status** - Enable/disable a field

### Field Options

- **Create New Option** - Add input options to a field
- **Delete Option** - Remove an option from a field
- **Update Option Info** - Modify option details
- **Retrieve All Options** - Get all options inside a field
- **Get Option Details** - Get details about a specific option
- **Update Option Order** - Change the order of options
- **Bulk Delete Options** - Delete multiple options at once
- **Toggle Option Active Status** - Enable/disable an option

### Utility Routes

- **Retrieve Option Types Labels** - Get all available option types
- **Export Tracker Config** - Export tracker configuration
- **Get All-Inclusive Data Schema** - Get schema with active and inactive fields/options

### Data Tracking

#### Data Management

- **Get All Tracking Data** - Retrieve all tracking data (paginated)
- **Add New Data Entry** - Add a new data entry to a tracker
- **Save Tracking Data** - Save tracking data for a specific date
- **Update Tracking Data** - Update a data entry on a specific date
- **Get Tracking Data Range** - Get data between date range
- **Get Tracking Data By Date** - Get entry data on a specific date
- **Bulk Delete Data** - Delete data from start to end date
- **Bulk Create Data** - Import data from CSV file
- **Export Tracking Data** - Export data to CSV for specific time range

#### Analytics

##### Insights and Data Sufficiency

- **Get Insights For Field** - Get analytics insights about field eligibility
- **Get All Insights** - Get analytics insights about all fields

##### Practical Analytics

- **Get Unified Analysis** - Get unified analysis for a field
- **Get Time Evolution Analysis** - Get analysis bound by time evolution
- **Get General Tracker Analysis** - Get general analysis for any tracker

##### Cycle Analytics (Period Tracker)

- **Get Cycle Calendar** - Get cycle calendar view
- **Get Calendar Overview** - Get calendar overview (12 months default)

##### Pattern Recognition

- **Pattern Summary** - Get pattern summary for multiple fields
- **Detect Patterns** - Detect patterns in a field
- **Recurring Symptom Patterns** - Get recurring patterns in period tracker fields

##### Cycle-Specific Analysis

- **Analyze Symptom By Phase** - Analyze how a symptom varies across cycle phases
- **General Cycle Analysis** - Get general cycle analysis (regularity, comparisons, correlations)

##### Regular Trackers Calendar

- **Get Tracker Calendar** - Get calendar for tracker with information
- **Get Tracker Calendar Overview** - Get calendar overview (12 months default)

##### Correlations

- **General Correlations** - Get all correlations across tracker
- **Get Field Correlations** - Get correlations for a specific field (dual or triple)
- **Analyze Specific Correlation** - Analyze correlation between given fields

##### Charts

- **Get Unified Chart** - Get unified chart for a field
- **Get Time Evolution Chart** - Get time evolution trend chart
- **Get Comparison Chart** - Get comparison visualization chart
- **Get Correlation Chart** - Get correlation visualization chart
- **Get Pattern Chart** - Get pattern visualization chart

##### Comparisons

- **Compare Fields** - Compare current period vs previous (week/month/general)
- **Compare Custom Date Ranges** - Compare custom date ranges

### Health Check

- **Health Check** - Verify the API is running

## Authentication Flow

1. **Register** with your details
2. **Login** to get your token
3. **Copy the token** from the login response
4. **Update the Bearer token** in all requests (or set it in collection variables)

## Tips for Testing

- **Start with authentication** - Always login first
- **Use realistic data** - The examples show proper field structures
- **Check responses** - Look for success/error messages
- **Update IDs** - Replace placeholder IDs with real ones from responses

## Common Field Types

- **rating** - 1-10 scale inputs
- **single_choice** - Pick one option
- **multiple_choice** - Pick multiple options
- **number_input** - Numeric values
- **text** - Text input
- **yes_no** - Boolean choices

## Example Usage

1. **Register** → Get user account
2. **Login** → Get access token
3. **Setup Default Trackers** → Initialize your tracking setup
4. **Create Custom Tracker** → Add your own tracking categories
5. **Add Fields** → Customize what you want to track
6. **Add Options** → Define how users input data
7. **Save Tracking Data** → Log your daily entries
8. **Get Analytics** → View insights and patterns
9. **Get Charts** → Visualize your data

## Troubleshooting

- **401 Unauthorized** → Check your Bearer token
- **404 Not Found** → Verify the endpoint URL
- **400 Bad Request** → Check your request body format
- **500 Server Error** → Check if the backend is running

---

**Happy Testing!**
