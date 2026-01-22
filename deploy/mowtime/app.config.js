/**
 * MowTime - Expo App Configuration
 *
 * Professional Lawn Care Made Simple
 * Single-vertical deployment for lawn care businesses
 */

export default {
  name: "MowTime",
  slug: "mowtime",
  version: "1.0.0",
  orientation: "portrait",

  // App icon and splash
  icon: "./assets/mowtime-icon.png",
  splash: {
    image: "./assets/mowtime-splash.png",
    resizeMode: "contain",
    backgroundColor: "#4CAF50"
  },

  // iOS configuration
  ios: {
    bundleIdentifier: "com.mowtime.app",
    buildNumber: "1",
    supportsTablet: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: "MowTime needs your location to optimize routes and show nearby jobs.",
      NSLocationAlwaysUsageDescription: "MowTime uses background location to track job completion.",
      NSCameraUsageDescription: "MowTime needs camera access to take photos of completed work.",
      NSPhotoLibraryUsageDescription: "MowTime needs photo access to attach images to jobs.",
    },
    config: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_IOS,
    },
  },

  // Android configuration
  android: {
    package: "com.mowtime.app",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/mowtime-adaptive-icon.png",
      backgroundColor: "#4CAF50"
    },
    permissions: [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "CAMERA",
      "READ_EXTERNAL_STORAGE",
      "WRITE_EXTERNAL_STORAGE",
      "RECEIVE_BOOT_COMPLETED",
      "VIBRATE",
    ],
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID,
      },
    },
  },

  // Expo plugins
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission: "Allow MowTime to use your location for route optimization.",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission: "Allow MowTime to take photos of completed work.",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#4CAF50",
      },
    ],
  ],

  // Expo updates (OTA)
  updates: {
    fallbackToCacheTimeout: 0,
    url: "https://u.expo.dev/your-project-id",
  },

  // Extra config passed to app
  extra: {
    // Branding
    appBranding: "mowtime",
    appName: "MowTime",
    primaryColor: "#4CAF50",
    secondaryColor: "#8BC34A",

    // API
    apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://api.mowtime.app/api/v1",

    // Features
    enabledVerticals: ["lawn_care"],
    showVerticalSwitcher: false,

    // EAS
    eas: {
      projectId: "your-eas-project-id",
    },
  },

  // Web configuration (if using Expo web)
  web: {
    favicon: "./assets/favicon.png",
    bundler: "metro",
  },

  // Scheme for deep linking
  scheme: "mowtime",

  // Owner
  owner: "your-expo-username",
};
