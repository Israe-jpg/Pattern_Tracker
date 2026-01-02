# Health Tracker Mobile App

React Native mobile application for the Health Tracker system.

## Project Structure

```
frontend/
├── App.js                 # Main app entry point
├── app.json              # Expo configuration
├── package.json          # Dependencies
├── babel.config.js       # Babel configuration
│
└── src/
    ├── constants/        # App constants and configuration
    │   ├── config.js    # API endpoints and base URL
    │   └── colors.js    # Color palette
    │
    ├── context/         # React Context for state management
    │   └── AuthContext.js
    │
    ├── navigation/      # Navigation setup
    │   └── AppNavigator.js
    │
    ├── screens/         # App screens
    │   ├── auth/
    │   │   ├── LoginScreen.js
    │   │   └── RegisterScreen.js
    │   ├── HomeScreen.js
    │   ├── CalendarScreen.js
    │   └── TrackerDetailScreen.js
    │
    ├── services/        # API service functions
    │   ├── api.js       # Axios instance with interceptors
    │   ├── authService.js
    │   ├── trackerService.js
    │   └── dataTrackingService.js
    │
    ├── components/      # Reusable UI components
    │   └── (add your components here)
    │
    ├── utils/          # Helper functions
    │   └── (add utility functions here)
    │
    └── hooks/          # Custom React hooks
        └── (add custom hooks here)
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- For iOS: Xcode (Mac only)
- For Android: Android Studio

### Installation

1. Navigate to the frontend directory:
```bash
cd health_tracker/frontend
```

2. Install dependencies:
```bash
npm install
```

3. **Set up environment variables** (Required):
   
   Create a `.env` file in the `frontend` directory:
   ```bash
   # .env file
   COMPUTER_IP=your_computer_ip_address
   PRODUCTION_API_URL=https://your-production-api-url.com/api
   ```
   
   **To find your computer's IP address:**
   - **Windows**: Run `ipconfig` in Command Prompt, look for "IPv4 Address"
   - **Mac/Linux**: Run `ifconfig` or `ip addr`, look for "inet" under your network interface
   
   **Note**: The `.env` file is already in `.gitignore` and won't be committed to GitHub.

4. Start the development server:
```bash
npm start
```

5. Run on your device:
   - Scan the QR code with Expo Go app (iOS/Android)
   - Or press `i` for iOS simulator
   - Or press `a` for Android emulator

## Key Features

### Authentication
- User registration and login
- Token-based authentication
- Automatic token storage and retrieval

### State Management
- React Context API for global state
- AuthContext for authentication state

### API Integration
- Centralized API service with axios
- Automatic token injection
- Error handling interceptors

### Navigation
- React Navigation v6
- Stack navigation for auth and main app
- Conditional navigation based on auth state

## Development Guidelines

### Adding New Screens

1. Create screen file in `src/screens/`
2. Add route in `src/navigation/AppNavigator.js`
3. Import and use navigation hook: `navigation.navigate('ScreenName')`

### Adding New Services

1. Create service file in `src/services/`
2. Import `api` from `./api.js`
3. Use `API_ENDPOINTS` from `../constants/config.js`
4. Export service functions

### Adding New Components

1. Create component file in `src/components/`
2. Use `colors` from `../constants/colors.js`
3. Export component for reuse

### Styling

- Use StyleSheet.create() for styles
- Import colors from `constants/colors.js`
- Keep styles close to components

## Environment Configuration

The app uses environment variables for configuration. Create a `.env` file in the `frontend` directory:

```env
# Required for mobile development (iOS/Android)
COMPUTER_IP=192.168.1.100

# Required for production builds
PRODUCTION_API_URL=https://your-production-api-url.com/api
```

**Important:**
- The `.env` file is gitignored and won't be committed
- Each developer needs to create their own `.env` file with their computer's IP
- For web development, `localhost` is used automatically
- For production builds, `PRODUCTION_API_URL` must be set

## Troubleshooting

### Common Issues

1. **Metro bundler errors**: Clear cache with `expo start -c`
2. **Module not found**: Run `npm install` again
3. **Network errors**: 
   - Check that `.env` file exists with `COMPUTER_IP` set
   - Verify your computer's IP address is correct
   - Ensure backend server is running on port 5000
   - For mobile: Make sure phone and computer are on same WiFi network
4. **Token issues**: Clear AsyncStorage and login again

## Next Steps

- [ ] Implement calendar view
- [ ] Add data entry forms
- [ ] Implement charts visualization
- [ ] Add analytics screens
- [ ] Implement comparison views
- [ ] Add pattern recognition UI

