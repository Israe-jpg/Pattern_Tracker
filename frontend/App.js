import "react-native-gesture-handler";
import React, { useRef, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { CommonActions } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import AppNavigator from "./src/navigation/AppNavigator";
import { AuthProvider, useAuth } from "./src/context/AuthContext";

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
        <NavigationWrapper />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
