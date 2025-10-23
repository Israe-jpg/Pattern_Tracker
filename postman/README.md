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

### Trackers (Main Categories)

- **Setup Default Trackers** - Initialize baseline, period, and workout trackers
- **Get My Trackers** - See all your available trackers
- **Delete Tracker** - Remove a tracker from your list
- **Change Default Tracker** - Set which tracker is your main one
- **Create Custom Tracker** - Build your own tracking category

### Tracker Fields

- **Get Field Schema** - See all fields in a specific tracker
- **Create New Field** - Add a custom field to a tracker
- **Delete Field** - Remove a field from a tracker
- **Update Field Label** - Change how a field appears
- **Update Field Help Text** - Modify the help description

### Field Options

- **Create New Option** - Add input options to a field
- **Delete Option** - Remove an option from a field
- **Update Option Info** - Modify option details

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

## Troubleshooting

- **401 Unauthorized** → Check your Bearer token
- **404 Not Found** → Verify the endpoint URL
- **400 Bad Request** → Check your request body format
- **500 Server Error** → Check if the backend is running

---

**Happy Testing!**
