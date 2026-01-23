/**
 * AI Tools Layout
 * Stack navigator for AI-powered technician tools
 */

import { Stack } from 'expo-router';
import { Colors } from '../../../constants/theme';

export default function AILayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="photo-analyze" />
      <Stack.Screen name="equipment-scan" />
      <Stack.Screen name="troubleshoot" />
    </Stack>
  );
}
