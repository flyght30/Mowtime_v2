/**
 * Job Stack Layout
 * Handles navigation between job detail, active job, and completion screens
 */

import { Stack } from 'expo-router';
import { Colors, Typography } from '../../../constants/theme';

export default function JobLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.white,
        },
        headerTitleStyle: {
          fontSize: Typography.fontSize.lg,
          fontWeight: Typography.fontWeight.semibold,
          color: Colors.text,
        },
        headerTintColor: Colors.primary,
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen
        name="[id]/index"
        options={{
          title: 'Job Details',
        }}
      />
      <Stack.Screen
        name="[id]/active"
        options={{
          title: 'Active Job',
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="[id]/complete"
        options={{
          title: 'Complete Job',
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
