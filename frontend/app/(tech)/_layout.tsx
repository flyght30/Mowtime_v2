/**
 * Tech App Tab Layout
 * Bottom tab navigation for technician mobile app
 */

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, Text } from 'react-native';
import { Colors, Typography } from '../../constants/theme';
import { TechProvider, useTech } from '../../contexts/TechContext';
import { STATUS_COLORS } from '../../services/techApi';

// Status indicator badge
function StatusIndicator() {
  const { profile } = useTech();

  if (!profile) return null;

  const statusColor = STATUS_COLORS[profile.status] || Colors.gray400;

  return (
    <View style={[styles.statusBadge, { backgroundColor: statusColor }]} />
  );
}

// Tab content with provider
function TechTabLayout() {
  const { todaysJobs, currentJob } = useTech();

  // Count pending jobs for badge
  const pendingJobs = todaysJobs.filter(j => j.status === 'scheduled').length;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: Colors.white,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        },
        headerTitleStyle: {
          fontSize: Typography.fontSize.lg,
          fontWeight: Typography.fontWeight.semibold,
          color: Colors.text,
        },
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.gray400,
        tabBarLabelStyle: {
          fontSize: Typography.fontSize.xs,
          fontWeight: Typography.fontWeight.medium,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          headerTitle: "Today's Jobs",
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="today" size={size} color={color} />
              {currentJob && (
                <View style={styles.activeDot} />
              )}
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          headerTitle: 'My Jobs',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="briefcase" size={size} color={color} />
              {pendingJobs > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {pendingJobs > 9 ? '9+' : pendingJobs}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="route"
        options={{
          title: 'Route',
          headerTitle: "Today's Route",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: 'My Profile',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="person" size={size} color={color} />
              <StatusIndicator />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

// Wrap with provider
export default function TechLayout() {
  return (
    <TechProvider>
      <TechTabLayout />
    </TechProvider>
  );
}

const styles = StyleSheet.create({
  statusBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  activeDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
});
