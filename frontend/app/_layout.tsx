/**
 * Root Layout
 * Wraps the app with providers and handles auth routing
 */

import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { BrandingProvider } from '../contexts/BrandingContext';
import { VerticalProvider } from '../contexts/VerticalContext';
import { DemoProvider } from '../contexts/DemoContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Colors } from '../constants/theme';

// Auth routing guard
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTechGroup = segments[0] === '(tech)';
    const inTabsGroup = segments[0] === '(tabs)';

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect based on user role
      if (user?.role === 'staff') {
        // Technicians go to tech app
        router.replace('/(tech)');
      } else {
        // Office users (owner, admin, customer) go to main app
        router.replace('/(tabs)');
      }
    } else if (isAuthenticated && user?.role === 'staff' && inTabsGroup) {
      // Technicians should not access the office app
      router.replace('/(tech)');
    } else if (isAuthenticated && user?.role !== 'staff' && inTechGroup) {
      // Non-technicians should not access the tech app
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments, user]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

// Root layout with providers
export default function RootLayout() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrandingProvider>
          <VerticalProvider>
            <DemoProvider>
              <StatusBar style="auto" />
              <AuthGuard>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="(tech)" options={{ headerShown: false }} />
                  <Stack.Screen name="hvac" options={{ headerShown: false }} />
                </Stack>
              </AuthGuard>
            </DemoProvider>
          </VerticalProvider>
        </BrandingProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
