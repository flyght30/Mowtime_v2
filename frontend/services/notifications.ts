/**
 * Push Notifications Service
 * Handles push notification registration and handling
 */

import { useState, useEffect, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { techApi } from './techApi';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Notification types
export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, any>;
}

export interface NotificationState {
  token: string | null;
  permission: 'granted' | 'denied' | 'undetermined';
  lastNotification: PushNotification | null;
}

/**
 * Register for push notifications
 * Returns the Expo push token
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Only works on physical devices
  if (!Device.isDevice) {
    console.warn('Push notifications only work on physical devices');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not determined
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Push notification permission not granted');
      return null;
    }

    // Get Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    // Configure for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
      });

      // Job alerts channel
      await Notifications.setNotificationChannelAsync('jobs', {
        name: 'Job Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#10B981',
      });
    }

    return token.data;
  } catch (error) {
    console.error('Failed to register for push notifications:', error);
    return null;
  }
}

/**
 * Register push token with backend
 */
export async function registerPushTokenWithBackend(token: string): Promise<boolean> {
  try {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    await techApi.registerPushToken(token, platform);
    console.log('Push token registered with backend');
    return true;
  } catch (error) {
    console.error('Failed to register push token with backend:', error);
    return false;
  }
}

/**
 * Schedule a local notification
 */
export async function scheduleLocalNotification(
  notification: PushNotification,
  trigger?: Notifications.NotificationTriggerInput
): Promise<string> {
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: true,
    },
    trigger: trigger || null, // null = immediate
  });

  return id;
}

/**
 * Cancel a scheduled notification
 */
export async function cancelNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Get badge count
 */
export async function getBadgeCount(): Promise<number> {
  return await Notifications.getBadgeCountAsync();
}

/**
 * Set badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Hook for using push notifications in components
 */
export function usePushNotifications() {
  const [state, setState] = useState<NotificationState>({
    token: null,
    permission: 'undetermined',
    lastNotification: null,
  });

  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    // Register for push notifications
    registerForPushNotifications().then((token) => {
      if (token) {
        setState((prev) => ({ ...prev, token, permission: 'granted' }));
        // Register with backend
        registerPushTokenWithBackend(token);
      }
    });

    // Check permission status
    Notifications.getPermissionsAsync().then(({ status }) => {
      setState((prev) => ({ ...prev, permission: status as any }));
    });

    // Listen for notifications while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        const { title, body, data } = notification.request.content;
        setState((prev) => ({
          ...prev,
          lastNotification: {
            title: title || '',
            body: body || '',
            data: data as Record<string, any>,
          },
        }));
      }
    );

    // Listen for notification interactions (tap)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const { data } = response.notification.request.content;
        handleNotificationResponse(data as Record<string, any>);
      }
    );

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return {
    ...state,
    scheduleNotification: scheduleLocalNotification,
    cancelNotification,
    cancelAllNotifications,
    getBadgeCount,
    setBadgeCount,
  };
}

/**
 * Handle notification response (when user taps notification)
 */
function handleNotificationResponse(data: Record<string, any>) {
  // Handle different notification types
  if (data?.type === 'new_job') {
    // Navigate to job detail
    console.log('Navigate to job:', data.jobId);
    // This would be handled by navigation
  } else if (data?.type === 'job_update') {
    // Refresh jobs
    console.log('Refresh jobs');
  } else if (data?.type === 'message') {
    // Navigate to messages
    console.log('Navigate to messages');
  }
}

/**
 * Send test notification (for debugging)
 */
export async function sendTestNotification(): Promise<void> {
  await scheduleLocalNotification({
    title: 'Test Notification',
    body: 'This is a test push notification',
    data: { type: 'test' },
  });
}

export default {
  registerForPushNotifications,
  registerPushTokenWithBackend,
  scheduleLocalNotification,
  cancelNotification,
  cancelAllNotifications,
  getBadgeCount,
  setBadgeCount,
  usePushNotifications,
  sendTestNotification,
};
