import { Stack } from 'expo-router';
import { Colors } from '../../constants/theme';

export default function TechniciansLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.white },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Technicians' }} />
      <Stack.Screen name="[id]" options={{ title: 'Technician Details' }} />
      <Stack.Screen name="add" options={{ title: 'Add Technician', presentation: 'modal' }} />
    </Stack>
  );
}
