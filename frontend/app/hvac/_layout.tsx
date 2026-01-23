/**
 * HVAC Section Layout
 * Stack navigation for HVAC vertical screens
 */

import { Stack } from 'expo-router';
import { Colors } from '../../constants/theme';

export default function HVACLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.white,
        },
        headerTitleStyle: {
          fontWeight: '600',
          color: Colors.text,
        },
        headerTintColor: Colors.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'HVAC Dashboard',
        }}
      />
      <Stack.Screen
        name="calculate"
        options={{
          title: 'Load Calculator',
          presentation: 'card',
        }}
      />
      <Stack.Screen
        name="quotes/index"
        options={{
          title: 'Quotes',
        }}
      />
      <Stack.Screen
        name="quotes/[id]"
        options={{
          title: 'Quote Details',
        }}
      />
      <Stack.Screen
        name="equipment"
        options={{
          title: 'Equipment Catalog',
        }}
      />
      <Stack.Screen
        name="maintenance/index"
        options={{
          title: 'Maintenance Contracts',
        }}
      />
      <Stack.Screen
        name="maintenance/[id]"
        options={{
          title: 'Contract Details',
        }}
      />
      <Stack.Screen
        name="inventory"
        options={{
          title: 'Inventory',
        }}
      />
    </Stack>
  );
}
