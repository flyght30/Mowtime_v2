/**
 * HCPSettings Component
 * Configuration modal for Housecall Pro integration settings
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import api from '../../services/api';

interface IntegrationSettings {
  auto_sync_enabled: boolean;
  sync_interval_minutes: number;
  sync_customers: boolean;
  customer_sync_direction: 'push' | 'pull' | 'bidirectional';
  sync_jobs: boolean;
  push_jobs_on_schedule: boolean;
  sync_job_status: boolean;
  pull_jobs_from_remote: boolean;
  job_type_mapping: Record<string, string>;
  status_mapping: Record<string, string>;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave?: () => void;
}

const DEFAULT_SETTINGS: IntegrationSettings = {
  auto_sync_enabled: true,
  sync_interval_minutes: 60,
  sync_customers: true,
  customer_sync_direction: 'bidirectional',
  sync_jobs: true,
  push_jobs_on_schedule: true,
  sync_job_status: true,
  pull_jobs_from_remote: false,
  job_type_mapping: {},
  status_mapping: {},
};

const JOB_TYPES = ['install', 'service', 'maintenance', 'repair', 'inspection'];
const HCP_JOB_TYPES = ['Installation', 'Service Call', 'Maintenance', 'Repair', 'Inspection', 'Estimate'];
const SYNC_INTERVALS = [
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '4 hours', value: 240 },
  { label: '12 hours', value: 720 },
  { label: '24 hours', value: 1440 },
];

export default function HCPSettings({ visible, onClose, onSave }: Props) {
  const [settings, setSettings] = useState<IntegrationSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      loadSettings();
    }
  }, [visible]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/api/v1/integrations/housecall_pro');
      const integrationSettings = response.data?.data?.settings || DEFAULT_SETTINGS;
      setSettings({ ...DEFAULT_SETTINGS, ...integrationSettings });
    } catch (err) {
      console.error('Failed to load HCP settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put('/api/v1/integrations/housecall_pro/settings', {
        settings,
      });
      Alert.alert('Success', 'Settings saved successfully');
      onSave?.();
      onClose();
    } catch (err) {
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = <K extends keyof IntegrationSettings>(
    key: K,
    value: IntegrationSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateJobTypeMapping = (localType: string, hcpType: string) => {
    setSettings((prev) => ({
      ...prev,
      job_type_mapping: { ...prev.job_type_mapping, [localType]: hcpType },
    }));
  };

  if (isLoading) {
    return (
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading settings...</Text>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Housecall Pro Settings</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Customer Sync Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Customer Sync</Text>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Sync Customers</Text>
                  <Text style={styles.settingDescription}>
                    Enable customer synchronization
                  </Text>
                </View>
                <Switch
                  value={settings.sync_customers}
                  onValueChange={(v) => updateSetting('sync_customers', v)}
                  trackColor={{ true: Colors.primary }}
                />
              </View>

              {settings.sync_customers && (
                <View style={styles.subsetting}>
                  <Text style={styles.settingLabel}>Sync Direction</Text>
                  <View style={styles.radioGroup}>
                    {[
                      { value: 'bidirectional', label: 'Bidirectional' },
                      { value: 'push', label: 'Push to HCP only' },
                      { value: 'pull', label: 'Pull from HCP only' },
                    ].map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.radioOption,
                          settings.customer_sync_direction === option.value &&
                            styles.radioOptionActive,
                        ]}
                        onPress={() =>
                          updateSetting(
                            'customer_sync_direction',
                            option.value as 'push' | 'pull' | 'bidirectional'
                          )
                        }
                      >
                        <View style={styles.radio}>
                          {settings.customer_sync_direction === option.value && (
                            <View style={styles.radioInner} />
                          )}
                        </View>
                        <Text style={styles.radioLabel}>{option.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Job Sync Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Job Sync</Text>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Sync Jobs</Text>
                  <Text style={styles.settingDescription}>
                    Enable job synchronization
                  </Text>
                </View>
                <Switch
                  value={settings.sync_jobs}
                  onValueChange={(v) => updateSetting('sync_jobs', v)}
                  trackColor={{ true: Colors.primary }}
                />
              </View>

              {settings.sync_jobs && (
                <>
                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingLabel}>Push jobs when scheduled</Text>
                      <Text style={styles.settingDescription}>
                        Auto-push jobs to HCP when scheduled
                      </Text>
                    </View>
                    <Switch
                      value={settings.push_jobs_on_schedule}
                      onValueChange={(v) => updateSetting('push_jobs_on_schedule', v)}
                      trackColor={{ true: Colors.primary }}
                    />
                  </View>

                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingLabel}>Sync status changes</Text>
                      <Text style={styles.settingDescription}>
                        Mirror job status between systems
                      </Text>
                    </View>
                    <Switch
                      value={settings.sync_job_status}
                      onValueChange={(v) => updateSetting('sync_job_status', v)}
                      trackColor={{ true: Colors.primary }}
                    />
                  </View>

                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingLabel}>Pull jobs from HCP</Text>
                      <Text style={styles.settingDescription}>
                        Import jobs from Housecall Pro (migration)
                      </Text>
                    </View>
                    <Switch
                      value={settings.pull_jobs_from_remote}
                      onValueChange={(v) => updateSetting('pull_jobs_from_remote', v)}
                      trackColor={{ true: Colors.primary }}
                    />
                  </View>
                </>
              )}
            </View>

            {/* Field Mapping Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Job Type Mapping</Text>
              <Text style={styles.sectionDescription}>
                Map your job types to Housecall Pro job types
              </Text>

              {JOB_TYPES.map((localType) => (
                <View key={localType} style={styles.mappingRow}>
                  <Text style={styles.mappingLabel}>
                    {localType.charAt(0).toUpperCase() + localType.slice(1)}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color={Colors.gray400} />
                  <View style={styles.pickerContainer}>
                    <Picker
                      selectedValue={settings.job_type_mapping[localType] || 'Service Call'}
                      onValueChange={(value) => updateJobTypeMapping(localType, value)}
                      style={styles.picker}
                    >
                      {HCP_JOB_TYPES.map((hcpType) => (
                        <Picker.Item key={hcpType} label={hcpType} value={hcpType} />
                      ))}
                    </Picker>
                  </View>
                </View>
              ))}
            </View>

            {/* Auto-Sync Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Auto-Sync</Text>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Enable automatic sync</Text>
                  <Text style={styles.settingDescription}>
                    Periodically sync data in the background
                  </Text>
                </View>
                <Switch
                  value={settings.auto_sync_enabled}
                  onValueChange={(v) => updateSetting('auto_sync_enabled', v)}
                  trackColor={{ true: Colors.primary }}
                />
              </View>

              {settings.auto_sync_enabled && (
                <View style={styles.subsetting}>
                  <Text style={styles.settingLabel}>Sync Interval</Text>
                  <View style={styles.pickerContainer}>
                    <Picker
                      selectedValue={settings.sync_interval_minutes}
                      onValueChange={(value) => updateSetting('sync_interval_minutes', value)}
                      style={styles.picker}
                    >
                      {SYNC_INTERVALS.map((interval) => (
                        <Picker.Item
                          key={interval.value}
                          label={interval.label}
                          value={interval.value}
                        />
                      ))}
                    </Picker>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save Settings</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '90%',
  },
  loadingContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.sm,
    color: Colors.textSecondary,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  modalBody: {
    padding: Spacing.md,
    maxHeight: 500,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  sectionDescription: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  settingInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  settingLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  settingDescription: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  subsetting: {
    paddingLeft: Spacing.md,
    paddingTop: Spacing.sm,
  },
  radioGroup: {
    marginTop: Spacing.sm,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  radioOptionActive: {},
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  radioLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  mappingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  mappingLabel: {
    width: 100,
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
  },
  pickerContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  picker: {
    height: 44,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cancelButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  cancelButtonText: {
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  saveButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
  },
});
