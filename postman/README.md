# Pattern Tracker APIs Testing

This folder has the Postman collection for testing our Health Tracker API. Right now it covers the basic authentication stuff, but I'll keep adding more endpoints as I build them.

## What's in here

- `pattern_tracker_apis.postman_collection.json` - The main collection with all our API tests
- `README.md` - This file

## Getting started

### Import the collection

1. Open Postman
2. Hit the Import button
3. Choose the JSON file from this folder

### Set up your environment

You'll want to create an environment in Postman with:

- `base_url` set to `http://localhost:5000` (or wherever you're running the API)

### Update the test data

Before running tests, change the dummy data in the requests:

- Put in a real email instead of `demo@example.com`
- Use your actual password instead of `your_password_here`

## How to test the API

### Start with the health check

Hit the `/api/health` endpoint first to make sure everything's running. No auth needed for this one.

### Register a new user

Use the register endpoint to create a test account. You'll need to fill in the username, email, password, and name fields.

### Log in

Once you have an account, use the login endpoint. This gives you back an access token (and refresh token). Copy that access token - you'll need it for the logout test.

### Test logout

For the logout endpoint, you need to be authenticated. Either:

- Set the `access_token` variable in your environment, or
- Manually paste the token into the Authorization tab

## A few notes

- Make sure your Flask server is running before testing
- The logout endpoint expects a valid JWT token
- I've cleaned out all the sensitive stuff from this collection so it's safe to commit
- I'll keep updating this collection as I add more features

## Current endpoints

Right now we have:

- Health check (GET /api/health)
- User registration (POST /api/auth/register)
- User login (POST /api/auth/login)
- User logout (POST /api/auth/logout)

More coming soon as I build out the health tracking features.
