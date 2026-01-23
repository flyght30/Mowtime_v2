import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius, shadows } from '../../constants/theme';
import { smsApi, SMSSettings } from '../../services/smsApi';

export default function SMSSettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<SMSSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await smsApi.getSettings();
      setSettings(data);
    } catch (error) {
      console.error('Failed to load settings:', error);
      Alert.alert('Error', 'Failed to load SMS settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSetting = <K extends keyof SMSSettings>(key: K, value: SMSSettings[K]) => {
    if (settings) {
      setSettings({ ...settings, [key]: value });
      setHasChanges(true);
    }
  };

  const saveSettings = async () => {
    if (!settings || !hasChanges) return;

    setSaving(true);
    try {
      await smsApi.updateSettings(settings);
      setHasChanges(false);
      Alert.alert('Success', 'SMS settings saved');
    } catch (error) {
      console.error('Failed to save settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.textSecondary} />
        <Text style={styles.errorText}>Failed to load settings</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Master Switch */}
        <View style={styles.section}>
          <View style={styles.masterSwitch}>
            <View style={styles.switchContent}>
              <Ionicons name="chatbubbles" size={28} color={colors.primary} />
              <View style={styles.switchText}>
                <Text style={styles.masterLabel}>SMS Notifications</Text>
                <Text style={styles.masterDescription}>
                  Enable automated SMS to customers
                </Text>
              </View>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={(value) => updateSetting('enabled', value)}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={settings.enabled ? colors.primary : colors.textSecondary}
            />
          </View>
        </View>

        {/* Automated Triggers */}
        <View style={[styles.section, !settings.enabled && styles.disabled]}>
          <Text style={styles.sectionTitle}>Automated Messages</Text>
          <Text style={styles.sectionDescription}>
            Choose which events trigger automatic SMS notifications
          </Text>

          <View style={styles.settingsList}>
            <SettingRow
              label="Job Scheduled"
              description="Send when a job is first scheduled"
              value={settings.auto_scheduled}
              onChange={(v) => updateSetting('auto_scheduled', v)}
              disabled={!settings.enabled}
            />
            <SettingRow
              label="Appointment Reminder"
              description={`Send ${settings.reminder_hours}h before appointment`}
              value={settings.auto_reminder}
              onChange={(v) => updateSetting('auto_reminder', v)}
              disabled={!settings.enabled}
            />
            <SettingRow
              label="Technician En Route"
              description="Send when tech starts driving to job"
              value={settings.auto_enroute}
              onChange={(v) => updateSetting('auto_enroute', v)}
              disabled={!settings.enabled}
            />
            <SettingRow
              label="15 Minute ETA"
              description="Send when tech is 15 min away"
              value={settings.auto_15_min}
              onChange={(v) => updateSetting('auto_15_min', v)}
              disabled={!settings.enabled}
            />
            <SettingRow
              label="Technician Arrived"
              description="Send when tech arrives on site"
              value={settings.auto_arrived}
              onChange={(v) => updateSetting('auto_arrived', v)}
              disabled={!settings.enabled}
            />
            <SettingRow
              label="Job Complete"
              description="Send when job is marked complete"
              value={settings.auto_complete}
              onChange={(v) => updateSetting('auto_complete', v)}
              disabled={!settings.enabled}
            />
          </View>
        </View>

        {/* Reminder Timing */}
        <View style={[styles.section, !settings.enabled && styles.disabled]}>
          <Text style={styles.sectionTitle}>Reminder Timing</Text>
          <View style={styles.reminderRow}>
            <Text style={styles.reminderLabel}>Hours before appointment:</Text>
            <View style={styles.reminderInput}>
              <TouchableOpacity
                style={styles.reminderButton}
                onPress={() => {
                  if (settings.reminder_hours > 1) {
                    updateSetting('reminder_hours', settings.reminder_hours - 1);
                  }
                }}
              >
                <Ionicons name="remove" size={20} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.reminderValue}>{settings.reminder_hours}</Text>
              <TouchableOpacity
                style={styles.reminderButton}
                onPress={() => {
                  if (settings.reminder_hours < 72) {
                    updateSetting('reminder_hours', settings.reminder_hours + 1);
                  }
                }}
              >
                <Ionicons name="add" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Opt-Out Message */}
        <View style={[styles.section, !settings.enabled && styles.disabled]}>
          <Text style={styles.sectionTitle}>Opt-Out Confirmation</Text>
          <Text style={styles.sectionDescription}>
            Message sent when customer texts STOP
          </Text>
          <TextInput
            style={styles.optOutInput}
            value={settings.opt_out_message}
            onChangeText={(text) => updateSetting('opt_out_message', text)}
            multiline
            maxLength={160}
            placeholder="You have been unsubscribed..."
            placeholderTextColor={colors.textSecondary}
            editable={settings.enabled}
          />
          <Text style={styles.charCount}>
            {settings.opt_out_message.length}/160 characters
          </Text>
        </View>

        {/* Templates Link */}
        <TouchableOpacity
          style={styles.linkCard}
          onPress={() => router.push('/sms/templates')}
        >
          <View style={styles.linkContent}>
            <Ionicons name="document-text" size={24} color={colors.primary} />
            <View style={styles.linkText}>
              <Text style={styles.linkTitle}>Message Templates</Text>
              <Text style={styles.linkDescription}>
                Customize automated message content
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </ScrollView>

      {/* Save Button */}
      {hasChanges && (
        <View style={styles.saveContainer}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveSettings}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

interface SettingRowProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

function SettingRow({ label, description, value, onChange, disabled }: SettingRowProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, disabled && styles.disabledText]}>{label}</Text>
        <Text style={[styles.settingDescription, disabled && styles.disabledText]}>
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primaryLight }}
        thumbColor={value ? colors.primary : colors.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  disabled: {
    opacity: 0.5,
  },
  masterSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  switchText: {
    marginLeft: spacing.md,
  },
  masterLabel: {
    fontSize: typography.sizes.lg,
    fontWeight: '600',
    color: colors.text,
  },
  masterDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  settingsList: {
    marginTop: spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  settingContent: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingLabel: {
    fontSize: typography.sizes.md,
    fontWeight: '500',
    color: colors.text,
  },
  settingDescription: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  disabledText: {
    color: colors.textSecondary,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reminderLabel: {
    fontSize: typography.sizes.md,
    color: colors.text,
  },
  reminderInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  reminderButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  reminderValue: {
    fontSize: typography.sizes.xl,
    fontWeight: '700',
    color: colors.text,
    minWidth: 40,
    textAlign: 'center',
  },
  optOutInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.sizes.md,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
  },
  charCount: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  linkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  linkText: {
    marginLeft: spacing.md,
  },
  linkTitle: {
    fontSize: typography.sizes.md,
    fontWeight: '600',
    color: colors.text,
  },
  linkDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  saveContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.white,
    fontSize: typography.sizes.md,
    fontWeight: '600',
  },
});
