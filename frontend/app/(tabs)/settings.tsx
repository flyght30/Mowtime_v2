/**
 * Settings Screen
 * User profile and app settings
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../../components/ui';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { APP_VERSION } from '../../constants/config';

interface SettingItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  danger?: boolean;
}

function SettingItem({
  icon,
  iconColor = Colors.gray600,
  title,
  subtitle,
  onPress,
  rightElement,
  danger,
}: SettingItemProps) {
  return (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, danger && styles.dangerText]}>
          {title}
        </Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      {rightElement || (
        onPress && <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: logout },
      ]
    );
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'owner': return 'Business Owner';
      case 'admin': return 'Administrator';
      case 'staff': return 'Staff Member';
      case 'customer': return 'Customer';
      default: return 'User';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Section */}
        <Card style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.first_name?.[0]}{user?.last_name?.[0]}
            </Text>
          </View>
          <Text style={styles.userName}>
            {user?.first_name} {user?.last_name}
          </Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{getRoleLabel(user?.role)}</Text>
          </View>
        </Card>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Card noPadding>
            <SettingItem
              icon="person-outline"
              iconColor={Colors.primary}
              title="Edit Profile"
              onPress={() => {}}
            />
            <View style={styles.divider} />
            <SettingItem
              icon="lock-closed-outline"
              iconColor={Colors.warning}
              title="Change Password"
              onPress={() => {}}
            />
            <View style={styles.divider} />
            <SettingItem
              icon="notifications-outline"
              iconColor={Colors.info}
              title="Notifications"
              subtitle="Manage notification preferences"
              onPress={() => {}}
            />
          </Card>
        </View>

        {/* Business Section */}
        {(user?.role === 'owner' || user?.role === 'admin') && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Business</Text>
            <Card noPadding>
              <SettingItem
                icon="business-outline"
                iconColor={Colors.success}
                title="Business Profile"
                subtitle="Edit business information"
                onPress={() => {}}
              />
              <View style={styles.divider} />
              <SettingItem
                icon="people-outline"
                iconColor={Colors.primary}
                title="Team Members"
                subtitle="Manage staff and permissions"
                onPress={() => {}}
              />
              <View style={styles.divider} />
              <SettingItem
                icon="construct-outline"
                iconColor={Colors.warning}
                title="Services"
                subtitle="Manage service offerings"
                onPress={() => {}}
              />
              <View style={styles.divider} />
              <SettingItem
                icon="time-outline"
                iconColor={Colors.info}
                title="Business Hours"
                subtitle="Set your operating hours"
                onPress={() => {}}
              />
            </Card>
          </View>
        )}

        {/* App Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>
          <Card noPadding>
            <SettingItem
              icon="color-palette-outline"
              iconColor={Colors.secondary}
              title="Appearance"
              subtitle="Light mode"
              onPress={() => {}}
            />
            <View style={styles.divider} />
            <SettingItem
              icon="help-circle-outline"
              iconColor={Colors.info}
              title="Help & Support"
              onPress={() => {}}
            />
            <View style={styles.divider} />
            <SettingItem
              icon="document-text-outline"
              iconColor={Colors.gray600}
              title="Terms of Service"
              onPress={() => {}}
            />
            <View style={styles.divider} />
            <SettingItem
              icon="shield-outline"
              iconColor={Colors.gray600}
              title="Privacy Policy"
              onPress={() => {}}
            />
          </Card>
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <Card noPadding>
            <SettingItem
              icon="log-out-outline"
              iconColor={Colors.error}
              title="Logout"
              onPress={handleLogout}
              danger
            />
          </Card>
        </View>

        {/* Version */}
        <Text style={styles.versionText}>
          ServicePro v{APP_VERSION}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  scrollContent: {
    padding: Spacing.md,
  },

  profileCard: {
    alignItems: 'center',
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },

  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  avatarText: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },

  userName: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  userEmail: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },

  roleBadge: {
    backgroundColor: Colors.primary + '20',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },

  roleText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
  },

  section: {
    marginBottom: Spacing.lg,
  },

  sectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
  },

  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },

  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },

  settingContent: {
    flex: 1,
  },

  settingTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },

  settingSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  dangerText: {
    color: Colors.error,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: Spacing.md + 36 + Spacing.md,
  },

  versionText: {
    textAlign: 'center',
    fontSize: Typography.fontSize.sm,
    color: Colors.gray400,
    marginVertical: Spacing.lg,
  },
});
