/**
 * Settings Screen
 * User profile and app settings
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import { Card, Button } from '../../components/ui';
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

interface QuickBooksStatus {
  connected: boolean;
  last_sync_clients?: string;
  last_sync_invoices?: string;
  total_clients_synced?: number;
  total_invoices_synced?: number;
}

interface ReminderSettings {
  enabled: boolean;
  reminder_24h_enabled: boolean;
  reminder_2h_enabled: boolean;
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [qbStatus, setQbStatus] = useState<QuickBooksStatus | null>(null);
  const [qbLoading, setQbLoading] = useState(false);
  const [syncingClients, setSyncingClients] = useState(false);
  const [syncingInvoices, setSyncingInvoices] = useState(false);

  // Reminder settings state
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>({
    enabled: true,
    reminder_24h_enabled: true,
    reminder_2h_enabled: true,
  });
  const [reminderLoading, setReminderLoading] = useState(false);

  const fetchQuickBooksStatus = useCallback(async () => {
    try {
      const response = await api.get('/quickbooks/status');
      if (response.success && response.data?.data) {
        setQbStatus(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch QB status:', error);
    }
  }, []);

  const fetchReminderSettings = useCallback(async () => {
    try {
      const response = await api.get('/reminders/settings');
      if (response.success && response.data?.data) {
        setReminderSettings(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch reminder settings:', error);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'owner' || user?.role === 'admin') {
      fetchQuickBooksStatus();
      fetchReminderSettings();
    }
  }, [user, fetchQuickBooksStatus, fetchReminderSettings]);

  const updateReminderSetting = async (key: keyof ReminderSettings, value: boolean) => {
    setReminderLoading(true);
    try {
      const newSettings = { ...reminderSettings, [key]: value };
      setReminderSettings(newSettings);

      await api.put('/reminders/settings', { [key]: value });
    } catch (error) {
      console.error('Failed to update reminder setting:', error);
      // Revert on error
      fetchReminderSettings();
      Alert.alert('Error', 'Failed to update setting');
    } finally {
      setReminderLoading(false);
    }
  };

  const handleConnectQuickBooks = async () => {
    setQbLoading(true);
    try {
      const response = await api.get('/quickbooks/auth');
      if (response.success && response.data?.data?.auth_url) {
        await Linking.openURL(response.data.data.auth_url);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to initiate QuickBooks connection');
    } finally {
      setQbLoading(false);
    }
  };

  const handleDisconnectQuickBooks = () => {
    Alert.alert(
      'Disconnect QuickBooks',
      'Are you sure you want to disconnect QuickBooks? This will not delete any synced data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/quickbooks/disconnect');
              setQbStatus({ connected: false });
              Alert.alert('Success', 'QuickBooks disconnected');
            } catch (error) {
              Alert.alert('Error', 'Failed to disconnect QuickBooks');
            }
          },
        },
      ]
    );
  };

  const handleSyncClients = async () => {
    setSyncingClients(true);
    try {
      const response = await api.post('/quickbooks/sync/clients');
      if (response.success && response.data?.data) {
        const { imported, updated } = response.data.data;
        Alert.alert('Sync Complete', `Imported: ${imported}, Updated: ${updated}`);
        fetchQuickBooksStatus();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to sync clients from QuickBooks');
    } finally {
      setSyncingClients(false);
    }
  };

  const handleSyncInvoices = async () => {
    setSyncingInvoices(true);
    try {
      const response = await api.post('/quickbooks/sync/invoices', {});
      if (response.success && response.data?.data) {
        const { synced, failed } = response.data.data;
        Alert.alert('Sync Complete', `Synced: ${synced}, Failed: ${failed}`);
        fetchQuickBooksStatus();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to sync invoices to QuickBooks');
    } finally {
      setSyncingInvoices(false);
    }
  };

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

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

        {/* Integrations Section */}
        {(user?.role === 'owner' || user?.role === 'admin') && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Integrations</Text>
            <Card style={styles.integrationCard}>
              <View style={styles.integrationHeader}>
                <View style={styles.integrationLogo}>
                  <Text style={styles.qbLogoText}>QB</Text>
                </View>
                <View style={styles.integrationInfo}>
                  <Text style={styles.integrationTitle}>QuickBooks Online</Text>
                  <Text style={styles.integrationSubtitle}>
                    {qbStatus?.connected ? 'Connected' : 'Not connected'}
                  </Text>
                </View>
                {qbStatus?.connected ? (
                  <View style={styles.connectedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  </View>
                ) : null}
              </View>

              {qbStatus?.connected ? (
                <>
                  <View style={styles.syncStats}>
                    <View style={styles.syncStatItem}>
                      <Text style={styles.syncStatLabel}>Clients Synced</Text>
                      <Text style={styles.syncStatValue}>{qbStatus.total_clients_synced || 0}</Text>
                    </View>
                    <View style={styles.syncStatItem}>
                      <Text style={styles.syncStatLabel}>Invoices Synced</Text>
                      <Text style={styles.syncStatValue}>{qbStatus.total_invoices_synced || 0}</Text>
                    </View>
                  </View>
                  <View style={styles.syncTimestamps}>
                    <Text style={styles.syncTimestamp}>
                      Last client sync: {formatDate(qbStatus.last_sync_clients)}
                    </Text>
                    <Text style={styles.syncTimestamp}>
                      Last invoice sync: {formatDate(qbStatus.last_sync_invoices)}
                    </Text>
                  </View>
                  <View style={styles.syncButtons}>
                    <TouchableOpacity
                      style={[styles.syncButton, syncingClients && styles.syncButtonDisabled]}
                      onPress={handleSyncClients}
                      disabled={syncingClients}
                    >
                      {syncingClients ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <>
                          <Ionicons name="download-outline" size={16} color={Colors.primary} />
                          <Text style={styles.syncButtonText}>Import Clients</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.syncButton, syncingInvoices && styles.syncButtonDisabled]}
                      onPress={handleSyncInvoices}
                      disabled={syncingInvoices}
                    >
                      {syncingInvoices ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <>
                          <Ionicons name="push-outline" size={16} color={Colors.primary} />
                          <Text style={styles.syncButtonText}>Push Invoices</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.disconnectButton}
                    onPress={handleDisconnectQuickBooks}
                  >
                    <Text style={styles.disconnectButtonText}>Disconnect</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.connectButton}
                  onPress={handleConnectQuickBooks}
                  disabled={qbLoading}
                >
                  {qbLoading ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Text style={styles.connectButtonText}>Connect QuickBooks</Text>
                  )}
                </TouchableOpacity>
              )}
            </Card>
          </View>
        )}

        {/* SMS Reminders Section */}
        {(user?.role === 'owner' || user?.role === 'admin') && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SMS Reminders</Text>
            <Card style={styles.reminderCard}>
              <View style={styles.reminderHeader}>
                <View style={styles.reminderIconContainer}>
                  <Ionicons name="chatbubble-ellipses" size={24} color={Colors.primary} />
                </View>
                <View style={styles.reminderInfo}>
                  <Text style={styles.reminderTitle}>Appointment Reminders</Text>
                  <Text style={styles.reminderSubtitle}>
                    Automatically notify clients via SMS
                  </Text>
                </View>
              </View>

              <View style={styles.reminderToggleRow}>
                <View style={styles.reminderToggleInfo}>
                  <Text style={styles.reminderToggleTitle}>Enable Reminders</Text>
                  <Text style={styles.reminderToggleSubtitle}>Master switch for all reminders</Text>
                </View>
                <Switch
                  value={reminderSettings.enabled}
                  onValueChange={(value) => updateReminderSetting('enabled', value)}
                  trackColor={{ false: Colors.gray300, true: Colors.primary + '60' }}
                  thumbColor={reminderSettings.enabled ? Colors.primary : Colors.gray400}
                  disabled={reminderLoading}
                />
              </View>

              {reminderSettings.enabled && (
                <>
                  <View style={styles.reminderDivider} />
                  <View style={styles.reminderToggleRow}>
                    <View style={styles.reminderToggleInfo}>
                      <Text style={styles.reminderToggleTitle}>24-Hour Reminder</Text>
                      <Text style={styles.reminderToggleSubtitle}>Send reminder day before</Text>
                    </View>
                    <Switch
                      value={reminderSettings.reminder_24h_enabled}
                      onValueChange={(value) => updateReminderSetting('reminder_24h_enabled', value)}
                      trackColor={{ false: Colors.gray300, true: Colors.success + '60' }}
                      thumbColor={reminderSettings.reminder_24h_enabled ? Colors.success : Colors.gray400}
                      disabled={reminderLoading}
                    />
                  </View>

                  <View style={styles.reminderDivider} />
                  <View style={styles.reminderToggleRow}>
                    <View style={styles.reminderToggleInfo}>
                      <Text style={styles.reminderToggleTitle}>2-Hour Reminder</Text>
                      <Text style={styles.reminderToggleSubtitle}>Send "on the way" notification</Text>
                    </View>
                    <Switch
                      value={reminderSettings.reminder_2h_enabled}
                      onValueChange={(value) => updateReminderSetting('reminder_2h_enabled', value)}
                      trackColor={{ false: Colors.gray300, true: Colors.success + '60' }}
                      thumbColor={reminderSettings.reminder_2h_enabled ? Colors.success : Colors.gray400}
                      disabled={reminderLoading}
                    />
                  </View>
                </>
              )}

              <View style={styles.reminderFooter}>
                <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.reminderFooterText}>
                  Clients can reply CONFIRM or RESCHEDULE
                </Text>
              </View>
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

  // QuickBooks Integration Styles
  integrationCard: {
    padding: Spacing.md,
  },

  integrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  integrationLogo: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: '#2CA01C',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },

  qbLogoText: {
    color: Colors.white,
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
  },

  integrationInfo: {
    flex: 1,
  },

  integrationTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  integrationSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  connectedBadge: {
    marginLeft: Spacing.sm,
  },

  syncStats: {
    flexDirection: 'row',
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },

  syncStatItem: {
    flex: 1,
    alignItems: 'center',
  },

  syncStatLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },

  syncStatValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },

  syncTimestamps: {
    marginBottom: Spacing.md,
  },

  syncTimestamp: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
  },

  syncButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },

  syncButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    gap: Spacing.xs,
  },

  syncButtonDisabled: {
    opacity: 0.6,
  },

  syncButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
  },

  connectButton: {
    backgroundColor: '#2CA01C',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },

  connectButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
  },

  disconnectButton: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },

  disconnectButtonText: {
    color: Colors.error,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
  },

  // SMS Reminders Styles
  reminderCard: {
    padding: Spacing.md,
  },

  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  reminderIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },

  reminderInfo: {
    flex: 1,
  },

  reminderTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  reminderSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  reminderToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },

  reminderToggleInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },

  reminderToggleTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },

  reminderToggleSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  reminderDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },

  reminderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.xs,
  },

  reminderFooterText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
});
