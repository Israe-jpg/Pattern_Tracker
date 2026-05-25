require('dotenv').config();

export default {
  expo: {
    name: "Trackt",
    slug: "trackt",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.israe.trackt",
      buildNumber: "1"
    },
    android: {
      package: "com.israe.trackt",
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      }
    },
    web: {
      bundler: "metro"
    },
    scheme: "trackt",
    extra: {
      computerIp: process.env.COMPUTER_IP,
      productionApiUrl: process.env.PRODUCTION_API_URL
    }
  }
};

