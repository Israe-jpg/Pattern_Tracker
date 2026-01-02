import api from "./api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_ENDPOINTS } from "../constants/config";

// Storage keys
const ACCESS_TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "refresh_token";

export const authService = {
  // Register new user 
  register: async (userData) => {
    const response = await api.post(API_ENDPOINTS.REGISTER, userData);
    return response.data;
  },

  // Login user and store both access and refresh tokens
  login: async (email, password) => {
    const response = await api.post(API_ENDPOINTS.LOGIN, { email, password });
    const { access_token, refresh_token } = response.data;

    // Store both tokens
    if (access_token) {
      await AsyncStorage.setItem(ACCESS_TOKEN_KEY, access_token);
    }
    if (refresh_token) {
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
    }

    return response.data;
  },

  // Refresh access token using refresh token
  refreshToken: async () => {
    const refresh_token = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);

    if (!refresh_token) {
      throw new Error("No refresh token available");
    }

    // Create a temporary axios instance without interceptors to avoid infinite loop
    const axios = require("axios");
    const { API_BASE_URL } = require("../constants/config");

    const response = await axios.post(
      `${API_BASE_URL}${API_ENDPOINTS.REFRESH}`,
      {},
      {
        headers: {
          Authorization: `Bearer ${refresh_token}`,
        },
      }
    );

    const { access_token } = response.data;

    if (access_token) {
      await AsyncStorage.setItem(ACCESS_TOKEN_KEY, access_token);
      return access_token;
    }

    throw new Error("Failed to refresh token");
  },

  // Logout user and clear all tokens
  logout: async () => {
    try {
      await api.post(API_ENDPOINTS.LOGOUT);
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Always clear tokens even if API call fails
      await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
    }
  },

  // Get current user profile
  getProfile: async () => {
    const response = await api.get(API_ENDPOINTS.PROFILE);
    return response.data;
  },

  // Check if user is authenticated (has valid token)
  isAuthenticated: async () => {
    const token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    return !!token;
  },

  // Get stored tokens (for debugging/testing)
  getTokens: async () => {
    const access_token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    const refresh_token = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    return { access_token, refresh_token };
  },
};
