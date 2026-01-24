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
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../../constants/theme';
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
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={Colors.textSecondary} />
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
              <Ionicons name="chatbubbles" size={28} color={Colors.primary} />
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
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={settings.enabled ? Colors.primary : Colors.textSecondary}
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
                <Ionicons name="remove" size={20} color={Colors.text} />
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
                <Ionicons name="add" size={20} color={Colors.text} />
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
            placeholderTextColor={Colors.textSecondary}
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
            <Ionicons name="document-text" size={24} color={Colors.primary} />
            <View style={styles.linkText}>
              <Text style={styles.linkTitle}>Message Templates</Text>
              <Text style={styles.linkDescription}>
                Customize automated message content
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
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
              <ActivityIndicator color={Colors.white} />
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
        trackColor={{ false: Colors.border, true: Colors.primaryLight }}
        thumbColor={value ? Colors.primary : Colors.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  errorText: {
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
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
    marginLeft: Spacing.md,
  },
  masterLabel: {
    fontSize: Typography.fontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  masterDescription: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.md,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  settingsList: {
    marginTop: Spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  settingContent: {
    flex: 1,
    marginRight: Spacing.md,
  },
  settingLabel: {
    fontSize: Typography.fontSize.md,
    fontWeight: '500',
    color: Colors.text,
  },
  settingDescription: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  disabledText: {
    color: Colors.textSecondary,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reminderLabel: {
    fontSize: Typography.fontSize.md,
    color: Colors.text,
  },
  reminderInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  reminderButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reminderValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    minWidth: 40,
    textAlign: 'center',
  },
  optOutInput: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSize.md,
    color: Colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  charCount: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    textAlign: 'right',
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  linkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  linkText: {
    marginLeft: Spacing.md,
  },
  linkTitle: {
    fontSize: Typography.fontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  linkDescription: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  saveContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.md,
    fontWeight: '600',
  },
});
