/**
 * Settings Stack Layout
 */

import { Stack } from 'expo-router';
import { Colors } from '../../constants/theme';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="pricing" />
    </Stack>
  );
}
