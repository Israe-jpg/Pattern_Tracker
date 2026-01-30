import "react-native-gesture-handler";
import React, { useRef, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { CommonActions } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LogBox } from "react-native";
import AppNavigator from "./src/navigation/AppNavigator";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { TrackerProvider } from "./src/context/TrackerContext";

// Suppress known harmless warning from react-native-draggable-flatlist
// This warning occurs when the library tries to measure layout on Animated.View components
// It's a known issue with the library and doesn't affect functionality
if (__DEV__) {
  // Suppress using LogBox
  LogBox.ignoreLogs([
    /ref\.measureLayout must be called with a ref to a native component/,
    "ref.measureLayout must be called with a ref to a native component",
    "Warning: ref.measureLayout must be called with a ref to a native component",
  ]);
  
  // Also intercept console.warn to catch warnings that bypass LogBox
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.warn = (...args) => {
    const message = args[0]?.toString() || "";
    if (message.includes("measureLayout") && message.includes("native component")) {
      return; // Suppress this specific warning
    }
    originalWarn.apply(console, args);
  };
  
  console.error = (...args) => {
    const message = args[0]?.toString() || "";
    if (message.includes("measureLayout") && message.includes("native component")) {
      return; // Suppress this specific error
    }
    originalError.apply(console, args);
  };
}

// Handles navigation reset when user authenticates
function NavigationWrapper() {
  const navigationRef = useRef(null);
  const { isAuthenticated } = useAuth();
  const prevAuthState = useRef(isAuthenticated);

  useEffect(() => {
    // Reset navigation stack to Home when transitioning from unauthenticated to authenticated
    if (!prevAuthState.current && isAuthenticated && navigationRef.current?.isReady()) {
      navigationRef.current.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Home' }],
        })
      );
    }
    prevAuthState.current = isAuthenticated;
  }, [isAuthenticated]);

  return (
    <NavigationContainer ref={navigationRef}>
      <AppNavigator />
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <TrackerProvider>
          <NavigationWrapper />
        </TrackerProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
