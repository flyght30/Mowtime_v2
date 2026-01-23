/**
 * Tech Profile Screen
 * Shows technician profile, status controls, and settings
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useTech } from '../../contexts/TechContext';
import { TechStatus, STATUS_LABELS, STATUS_COLORS } from '../../services/techApi';

// Status options for quick selection
const STATUS_OPTIONS: TechStatus[] = [
  'available',
  'busy',
  'break',
  'off_duty',
];

export default function TechProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const {
    profile,
    isLocationEnabled,
    todaysJobs,
    updateStatus,
    clockIn,
    clockOut,
    startLocationTracking,
    stopLocationTracking,
  } = useTech();

  const [isUpdating, setIsUpdating] = useState(false);

  const handleStatusChange = async (newStatus: TechStatus) => {
    if (newStatus === profile?.status) return;

    setIsUpdating(true);
    try {
      await updateStatus(newStatus);
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClockInOut = async () => {
    const isClocked = profile?.status !== 'off_duty';

    Alert.alert(
      isClocked ? 'Clock Out' : 'Clock In',
      isClocked
        ? 'Are you sure you want to clock out?'
        : 'Ready to start your shift?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isClocked ? 'Clock Out' : 'Clock In',
          onPress: async () => {
            setIsUpdating(true);
            try {
              if (isClocked) {
                await clockOut();
              } else {
                await clockIn();
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to update clock status');
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleLocationToggle = async (enabled: boolean) => {
    if (enabled) {
      const success = await startLocationTracking();
      if (!success) {
        Alert.alert(
          'Location Permission',
          'Please enable location permissions in your device settings to use this feature.'
        );
      }
    } else {
      stopLocationTracking();
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            stopLocationTracking();
            await logout();
          },
        },
      ]
    );
  };

  // Calculate stats
  const completedToday = todaysJobs.filter(j => j.status === 'completed').length;
  const totalToday = todaysJobs.length;
  const isClocked = profile?.status !== 'off_duty';

  // Get initials
  const initials = profile
    ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
    : 'TT';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View
            style={[
              styles.statusIndicator,
              { backgroundColor: STATUS_COLORS[profile?.status || 'off_duty'] },
            ]}
          />
        </View>
        <Text style={styles.profileName}>
          {profile?.first_name} {profile?.last_name}
        </Text>
        <Text style={styles.profileEmail}>{user?.email}</Text>
        <View style={styles.profileStats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{completedToday}</Text>
            <Text style={styles.statLabel}>Done Today</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalToday - completedToday}</Text>
            <Text style={styles.statLabel}>Remaining</Text>
          </View>
        </View>
      </View>

      {/* Clock In/Out */}
      <TouchableOpacity
        style={[
          styles.clockButton,
          isClocked ? styles.clockOutButton : styles.clockInButton,
        ]}
        onPress={handleClockInOut}
        disabled={isUpdating}
      >
        {isUpdating ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <>
            <Ionicons
              name={isClocked ? 'log-out' : 'log-in'}
              size={24}
              color={Colors.white}
            />
            <Text style={styles.clockButtonText}>
              {isClocked ? 'Clock Out' : 'Clock In'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Status Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Status</Text>
        <View style={styles.statusGrid}>
          {STATUS_OPTIONS.map(status => {
            const isActive = profile?.status === status;
            const isDisabled = !isClocked && status !== 'off_duty';

            return (
              <TouchableOpacity
                key={status}
                style={[
                  styles.statusOption,
                  isActive && styles.statusOptionActive,
                  isDisabled && styles.statusOptionDisabled,
                ]}
                onPress={() => handleStatusChange(status)}
                disabled={isDisabled || isUpdating}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: STATUS_COLORS[status] },
                  ]}
                />
                <Text
                  style={[
                    styles.statusOptionText,
                    isActive && styles.statusOptionTextActive,
                    isDisabled && styles.statusOptionTextDisabled,
                  ]}
                >
                  {STATUS_LABELS[status]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="location" size={24} color={Colors.primary} />
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Location Sharing</Text>
                <Text style={styles.settingDescription}>
                  Share your location with dispatch
                </Text>
              </View>
            </View>
            <Switch
              value={isLocationEnabled}
              onValueChange={handleLocationToggle}
              trackColor={{ false: Colors.gray300, true: Colors.primary + '50' }}
              thumbColor={isLocationEnabled ? Colors.primary : Colors.gray100}
            />
          </View>

          <View style={styles.settingDivider} />

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="notifications" size={24} color={Colors.primary} />
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Notifications</Text>
                <Text style={styles.settingDescription}>
                  Manage push notifications
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
          </TouchableOpacity>

          <View style={styles.settingDivider} />

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="time" size={24} color={Colors.primary} />
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Timesheet</Text>
                <Text style={styles.settingDescription}>
                  View your work hours
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Help & Support */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Help & Support</Text>
        <View style={styles.settingsCard}>
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="help-circle" size={24} color={Colors.primary} />
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Help Center</Text>
                <Text style={styles.settingDescription}>
                  Get help and support
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
          </TouchableOpacity>

          <View style={styles.settingDivider} />

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="call" size={24} color={Colors.primary} />
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Contact Office</Text>
                <Text style={styles.settingDescription}>
                  Call dispatch or manager
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={Colors.error} />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Version 1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  profileHeader: {
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: Colors.white,
  },
  profileName: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  profileEmail: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  profileStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  statLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
  },
  clockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  clockInButton: {
    backgroundColor: Colors.success,
  },
  clockOutButton: {
    backgroundColor: Colors.error,
  },
  clockButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
  },
  section: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: Spacing.sm,
    minWidth: '48%',
    flex: 1,
  },
  statusOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  statusOptionDisabled: {
    opacity: 0.5,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusOptionText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  statusOptionTextActive: {
    color: Colors.primary,
  },
  statusOptionTextDisabled: {
    color: Colors.textSecondary,
  },
  settingsCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    ...Shadows.sm,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  settingDescription: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  settingDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 56,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
    ...Shadows.sm,
  },
  logoutText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.error,
  },
  version: {
    textAlign: 'center',
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
  },
});
