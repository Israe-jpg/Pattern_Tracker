require('dotenv').config();

export default {
  expo: {
    name: "Health Tracker",
    slug: "health-tracker",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    splash: {
      backgroundColor: "#ffffff"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.israe.healthtracker",
      buildNumber: "1"
    },
    android: {
      package: "com.israe.healthtracker",
      versionCode: 1,
      adaptiveIcon: {
        backgroundColor: "#ffffff"
      }
    },
    web: {
      bundler: "metro"
    },
    scheme: "health-tracker",
    extra: {
      computerIp: process.env.COMPUTER_IP,
      productionApiUrl: process.env.PRODUCTION_API_URL
    }
  }
};

