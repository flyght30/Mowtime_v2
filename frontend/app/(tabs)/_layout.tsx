/**
 * Tabs Layout
 * Bottom tab navigation for main app screens
 * Dynamically shows/hides vertical-specific tabs
 */

import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Colors, BorderRadius, Spacing, Typography } from '../../constants/theme';
import { useVerticalContext } from '../../contexts/VerticalContext';
import { useBranding } from '../../contexts/BrandingContext';

export default function TabsLayout() {
  const router = useRouter();
  const { activeVertical, activeVerticalInfo, enabledVerticals, businessVerticals } = useVerticalContext();
  const { branding } = useBranding();

  // Check if HVAC is enabled for this business
  const hvacEnabled = enabledVerticals.includes('hvac');
  const showVerticalSwitcher = branding?.show_vertical_switcher && enabledVerticals.length > 1;

  // Get vertical icon based on active vertical
  const getVerticalIcon = () => {
    switch (activeVertical) {
      case 'hvac':
        return 'thermometer-outline';
      case 'lawn_care':
        return 'leaf-outline';
      default:
        return 'briefcase-outline';
    }
  };

  // Custom header with vertical indicator
  const renderHeaderRight = () => {
    if (!showVerticalSwitcher) return null;

    return (
      <TouchableOpacity
        style={styles.verticalBadge}
        onPress={() => router.push('/(tabs)/settings')}
      >
        <Ionicons
          name={getVerticalIcon() as any}
          size={16}
          color={activeVerticalInfo.color}
        />
        <Text style={[styles.verticalBadgeText, { color: activeVerticalInfo.color }]}>
          {activeVerticalInfo.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.gray400,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.border,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerStyle: {
          backgroundColor: Colors.white,
        },
        headerTitleStyle: {
          fontWeight: '600',
          color: Colors.text,
        },
        headerRight: renderHeaderRight,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: branding?.text_overrides?.appointments || 'Appointments',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: branding?.text_overrides?.clients || 'Clients',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Voice Calls Tab - AI Receptionist call log */}
      <Tabs.Screen
        name="voice-calls"
        options={{
          title: 'Calls',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="call-outline" size={size} color={color} />
          ),
        }}
      />

      {/* HVAC Tab - only shown when HVAC is enabled */}
      <Tabs.Screen
        name="hvac-hub"
        options={{
          title: 'HVAC',
          href: hvacEnabled ? '/(tabs)/hvac-hub' : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="thermometer-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  verticalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.md,
  },
  verticalBadgeText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    marginLeft: 4,
  },
});
