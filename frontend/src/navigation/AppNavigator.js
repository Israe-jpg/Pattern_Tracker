import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import LoadingScreen from "../components/LoadingScreen";

// Screens
import LoginScreen from "../screens/auth/LoginScreen";
import RegisterScreen from "../screens/auth/RegisterScreen";
import GenderScreen from "../screens/auth/GenderScreen";
import UserInfoScreen from "../screens/auth/UserInfoScreen";
import HomeScreen from "../screens/HomeScreen";
import CalendarScreen from "../screens/CalendarScreen";
import TrackerDetailScreen from "../screens/TrackerDetailScreen";
import LogSymptomsScreen from "../screens/LogSymptomsScreen";
import ConfigurePeriodTrackerScreen from "../screens/ConfigurePeriodTrackerScreen";

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  // Check if user needs to set gender
  const needsGender = isAuthenticated && user && !user.gender;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      ) : needsGender ? (
        <>
          <Stack.Screen name="Gender" component={GenderScreen} />
          <Stack.Screen name="UserInfo" component={UserInfoScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="UserInfo" component={UserInfoScreen} />
          <Stack.Screen name="Calendar" component={CalendarScreen} />
          <Stack.Screen name="TrackerDetail" component={TrackerDetailScreen} />
          <Stack.Screen name="LogSymptoms" component={LogSymptomsScreen} />
          <Stack.Screen
            name="ConfigurePeriodTracker"
            component={ConfigurePeriodTrackerScreen}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
