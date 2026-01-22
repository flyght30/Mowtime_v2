/**
 * HVAC Pro - Expo App Configuration
 *
 * Complete HVAC Business Management
 * Single-vertical deployment for HVAC contractors
 */

export default {
  name: "HVAC Pro",
  slug: "hvac-pro",
  version: "1.0.0",
  orientation: "portrait",

  // App icon and splash
  icon: "./assets/hvac-icon.png",
  splash: {
    image: "./assets/hvac-splash.png",
    resizeMode: "contain",
    backgroundColor: "#2196F3"
  },

  // iOS configuration
  ios: {
    bundleIdentifier: "com.servicepro.hvac",
    buildNumber: "1",
    supportsTablet: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: "HVAC Pro needs your location to navigate to job sites.",
      NSLocationAlwaysUsageDescription: "HVAC Pro uses background location for route tracking.",
      NSCameraUsageDescription: "HVAC Pro needs camera access to document equipment and work completed.",
      NSPhotoLibraryUsageDescription: "HVAC Pro needs photo access to attach images to service calls.",
    },
    config: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_IOS,
    },
  },

  // Android configuration
  android: {
    package: "com.servicepro.hvac",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/hvac-adaptive-icon.png",
      backgroundColor: "#2196F3"
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
        locationAlwaysAndWhenInUsePermission: "Allow HVAC Pro to use your location for navigation.",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission: "Allow HVAC Pro to take photos of equipment and completed work.",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#2196F3",
      },
    ],
    [
      "expo-document-picker",
      {
        iCloudContainerEnvironment: "Production",
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
    appBranding: "hvac_pro",
    appName: "HVAC Pro",
    primaryColor: "#2196F3",
    secondaryColor: "#03A9F4",

    // API
    apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://api.hvacpro.app/api/v1",

    // Features
    enabledVerticals: ["hvac"],
    showVerticalSwitcher: false,

    // HVAC-specific features
    enableLoadCalculator: true,
    enableEquipmentCatalog: true,
    enableQuoteBuilder: true,
    enablePdfProposals: true,

    // EAS
    eas: {
      projectId: "your-eas-project-id",
    },
  },

  // Web configuration
  web: {
    favicon: "./assets/favicon.png",
    bundler: "metro",
  },

  // Scheme for deep linking
  scheme: "hvacpro",

  // Owner
  owner: "your-expo-username",
};
