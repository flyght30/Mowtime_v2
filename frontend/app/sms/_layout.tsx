import { Stack } from 'expo-router';
import { colors } from '../../constants/theme';

export default function SMSLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Messages',
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="conversation/[id]"
        options={{
          title: 'Conversation',
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: 'SMS Settings',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="templates"
        options={{
          title: 'Message Templates',
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
