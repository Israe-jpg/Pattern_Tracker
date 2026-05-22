import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/authService';

const FIRST_LAUNCH_KEY = '@trackt_has_launched';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);

  // Check authentication status on app start
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // Determine if this is the very first time the app has been opened
      const hasLaunched = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
      if (hasLaunched === null) {
        setIsFirstLaunch(true);
        await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
      }

      const authenticated = await authService.isAuthenticated();
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        try {
          // Refresh access token before profile/trackers run in parallel
          const sessionOk = await authService.ensureValidAccessToken();
          if (!sessionOk) {
            setIsAuthenticated(false);
            setUser(null);
            return;
          }

          const profile = await authService.getProfile();
          setUser(profile);
        } catch (profileError) {
          // If we get here, the API interceptor already tried to refresh
          // and failed (or there was no refresh token)
          
          // Check if refresh token exists
          const { refresh_token } = await authService.getTokens();
          
          if (profileError.response?.status === 401) {
            // Refresh token failed or doesn't exist - user needs to login again
            setIsAuthenticated(false);
            setUser(null);
            
            // Provide helpful error message
            if (!refresh_token) {
              console.warn('Session expired - no refresh token found. Please login again.');
            } else if (profileError.message?.includes("No refresh token available")) {
              console.warn('Session expired - refresh token was cleared. Please login again.');
            } else {
              console.warn('Session expired - refresh token invalid or expired. Please login again.');
            }
          } else {
            // Other errors (network, server) - log for debugging but don't log out
            console.error('Error fetching user profile:', profileError);
            // Don't log out on network errors - keep user logged in
            // They might just have temporary connection issues
          }
        }
      }
    } catch (error) {
      // Only log unexpected errors
      if (error.response?.status !== 401) {
        console.error('Auth check error:', error);
      }
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const submitGender = async (gender) => {
    try {
      // Submit gender to backend
      await authService.submitGender(gender);
      
      // Setup default trackers based on gender
      try {
        await authService.setupDefaultTrackers();
        console.log('Default trackers setup successfully');
      } catch (trackerError) {
        // Log error but don't fail the gender submission
        console.error('Failed to setup trackers:', trackerError);
        // Continue anyway - trackers can be set up later
      }
      
      // Refresh profile to get updated user data with gender
      const profile = await authService.getProfile();
      setUser(profile);
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error 
        || error.response?.data?.message 
        || error.message 
        || 'Failed to save gender information';
      return { 
        success: false, 
        error: errorMessage
      };
    }
  };

  const submitUserInfo = async (userInfo) => {
    try {
      const response = await authService.submitUserInfo(userInfo);
      
      // Refresh profile to get updated user data
      const profile = await authService.getProfile();
      setUser(profile);
      return { success: true };
    } catch (error) {
      console.error("Error submitting user info:", error);
      const errorMessage = error.response?.data?.error 
        || error.response?.data?.message 
        || error.message 
        || 'Failed to save user information';
      return { 
        success: false, 
        error: errorMessage
      };
    }
  };

  const login = async (email, password) => {
    try {
      const response = await authService.login(email, password);
      
      // Verify tokens were stored
      const { access_token, refresh_token } = await authService.getTokens();
      if (!access_token) {
        throw new Error("Access token was not stored after login");
      }
      if (!refresh_token) {
        console.warn("Warning: Refresh token was not stored after login. Session may expire.");
      }
      
      setIsAuthenticated(true);
      const profile = await authService.getProfile();
      setUser(profile);
      return { success: true, data: response };
    } catch (error) {
      // If login failed, clear any partial state
      setIsAuthenticated(false);
      setUser(null);
      
      const errorMessage = error.response?.data?.error 
        || error.response?.data?.message 
        || error.message 
        || 'Login failed';
      return { 
        success: false, 
        error: errorMessage
      };
    }
  };

  const refreshUserProfile = async () => {
    try {
      const profile = await authService.getProfile();
      setUser(profile);
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const register = async (userData) => {
    try {
      const response = await authService.register(userData);
      
      // After successful registration, automatically log the user in
      // to get access and refresh tokens
      if (response && (response.message || response.user)) {
        try {
          // Auto-login after registration
          await authService.login(
            userData.email,
            userData.password
          );
          
          // Set authenticated state
          setIsAuthenticated(true);
          
          // Get the profile to check if gender is set
          const profile = await authService.getProfile();
          setUser(profile);
        } catch (loginError) {
          // If auto-login fails, still return success but user needs to login manually
          console.error('Auto-login after registration failed:', loginError);
          return {
            success: true,
            data: response,
            needsManualLogin: true,
            message: 'Registration successful. Please login to continue.'
          };
        }
        
        return { success: true, data: response };
      }
      
      return { success: true, data: response };
    } catch (error) {
      // Handle network errors (no response from server)
      if (!error.response) {
        return { 
          success: false, 
          error: 'Network error: Could not connect to server. Please check your connection and ensure the backend is running.'
        };
      }
      
      // Handle validation errors (400) - backend returns {error: 'Validation failed', details: {...}}
      if (error.response?.status === 400 && error.response?.data?.details) {
        const details = error.response.data.details;
        // Format validation errors into a readable message
        const validationErrors = Object.entries(details)
          .map(([field, errors]) => {
            const fieldName = field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
            const errorList = Array.isArray(errors) ? errors.join(', ') : errors;
            return `${fieldName}: ${errorList}`;
          })
          .join(' | ');
        
        return { 
          success: false, 
          error: `Validation failed: ${validationErrors}`,
          details: details // Include raw details for field-specific error display
        };
      }
      
      // Handle conflict errors (409) - username or email already exists
      if (error.response?.status === 409) {
        return { 
          success: false, 
          error: error.response?.data?.error || 'Username or email already exists'
        };
      }
      
      // Handle server errors (500+)
      if (error.response?.status >= 500) {
        return { 
          success: false, 
          error: 'Server error: Please try again later'
        };
      }
      
      // Default error handling
      const errorMessage = error.response?.data?.error 
        || error.response?.data?.message 
        || error.message 
        || 'Registration failed. Please try again.';
      
      return { 
        success: false, 
        error: errorMessage
      };
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    isFirstLaunch,
    login,
    logout,
    register,
    checkAuthStatus,
    submitGender,
    submitUserInfo,
    refreshUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
