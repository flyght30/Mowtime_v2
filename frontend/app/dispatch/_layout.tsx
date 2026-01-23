import { Stack } from 'expo-router';
import { Colors } from '../../constants/theme';

export default function DispatchLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.white },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Dispatch Board' }} />
    </Stack>
  );
}
