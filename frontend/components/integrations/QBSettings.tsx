/**
 * QBSettings Component
 * Configuration modal for QuickBooks Online integration settings
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

interface QBAccount {
  id: string;
  name: string;
  type: string;
}

interface QBSettings {
  auto_sync_enabled: boolean;
  sync_interval_minutes: number;
  sync_customers: boolean;
  auto_create_invoice: boolean;
  default_income_account: string | null;
  default_expense_account: string | null;
  sync_payments: boolean;
  sync_items: boolean;
  item_sync_direction: 'push' | 'pull' | 'bidirectional';
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave?: () => void;
}

const DEFAULT_SETTINGS: QBSettings = {
  auto_sync_enabled: true,
  sync_interval_minutes: 60,
  sync_customers: true,
  auto_create_invoice: false,
  default_income_account: null,
  default_expense_account: null,
  sync_payments: true,
  sync_items: true,
  item_sync_direction: 'push',
};

const SYNC_INTERVALS = [
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '4 hours', value: 240 },
  { label: '12 hours', value: 720 },
  { label: '24 hours', value: 1440 },
];

export default function QBSettings({ visible, onClose, onSave }: Props) {
  const [settings, setSettings] = useState<QBSettings>(DEFAULT_SETTINGS);
  const [incomeAccounts, setIncomeAccounts] = useState<QBAccount[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<QBAccount[]>([]);
  const [syncSummary, setSyncSummary] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [integrationRes, accountsRes, summaryRes] = await Promise.all([
        api.get('/api/v1/integrations/quickbooks'),
        api.get('/api/v1/integrations/quickbooks/accounts'),
        api.get('/api/v1/integrations/quickbooks/summary'),
      ]);

      const integrationSettings = integrationRes.data?.data?.settings || DEFAULT_SETTINGS;
      setSettings({ ...DEFAULT_SETTINGS, ...integrationSettings });

      const accountsData = accountsRes.data?.data || {};
      setIncomeAccounts(accountsData.income_accounts || []);
      setExpenseAccounts(accountsData.expense_accounts || []);

      setSyncSummary(summaryRes.data?.data || {});
    } catch (err) {
      console.error('Failed to load QB settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put('/api/v1/integrations/quickbooks/settings', {
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

  const updateSetting = <K extends keyof QBSettings>(key: K, value: QBSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
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
            <Text style={styles.modalTitle}>QuickBooks Settings</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Sync Summary */}
            <View style={styles.summarySection}>
              <Text style={styles.sectionTitle}>Sync Summary</Text>
              <View style={styles.summaryCards}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>
                    {syncSummary.customers_synced || 0}
                  </Text>
                  <Text style={styles.summaryLabel}>Customers</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>
                    {syncSummary.invoices_synced || 0}
                  </Text>
                  <Text style={styles.summaryLabel}>Invoices</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>
                    {syncSummary.payments_synced || 0}
                  </Text>
                  <Text style={styles.summaryLabel}>Payments</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>
                    {syncSummary.items_synced || 0}
                  </Text>
                  <Text style={styles.summaryLabel}>Items</Text>
                </View>
              </View>
            </View>

            {/* Customer Sync Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Customer Sync</Text>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Sync Customers</Text>
                  <Text style={styles.settingDescription}>
                    Push customers to QuickBooks
                  </Text>
                </View>
                <Switch
                  value={settings.sync_customers}
                  onValueChange={(v) => updateSetting('sync_customers', v)}
                  trackColor={{ true: Colors.primary }}
                />
              </View>
            </View>

            {/* Invoice Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Invoicing</Text>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Auto-create invoices</Text>
                  <Text style={styles.settingDescription}>
                    Create invoice in QB when job is completed
                  </Text>
                </View>
                <Switch
                  value={settings.auto_create_invoice}
                  onValueChange={(v) => updateSetting('auto_create_invoice', v)}
                  trackColor={{ true: Colors.primary }}
                />
              </View>

              <View style={styles.subsetting}>
                <Text style={styles.settingLabel}>Default Income Account</Text>
                <Text style={styles.settingDescription}>
                  Account to use for invoice line items
                </Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={settings.default_income_account || ''}
                    onValueChange={(value) =>
                      updateSetting('default_income_account', value || null)
                    }
                    style={styles.picker}
                  >
                    <Picker.Item label="-- Select Account --" value="" />
                    {incomeAccounts.map((account) => (
                      <Picker.Item
                        key={account.id}
                        label={account.name}
                        value={account.id}
                      />
                    ))}
                  </Picker>
                </View>
              </View>
            </View>

            {/* Payments Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payments</Text>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Sync Payments</Text>
                  <Text style={styles.settingDescription}>
                    Record payments in QuickBooks
                  </Text>
                </View>
                <Switch
                  value={settings.sync_payments}
                  onValueChange={(v) => updateSetting('sync_payments', v)}
                  trackColor={{ true: Colors.primary }}
                />
              </View>
            </View>

            {/* Items Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Service Items</Text>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Sync Service Items</Text>
                  <Text style={styles.settingDescription}>
                    Sync service items with QuickBooks products
                  </Text>
                </View>
                <Switch
                  value={settings.sync_items}
                  onValueChange={(v) => updateSetting('sync_items', v)}
                  trackColor={{ true: Colors.primary }}
                />
              </View>

              {settings.sync_items && (
                <View style={styles.subsetting}>
                  <Text style={styles.settingLabel}>Sync Direction</Text>
                  <View style={styles.radioGroup}>
                    {[
                      { value: 'push', label: 'Push to QB only' },
                      { value: 'pull', label: 'Pull from QB only' },
                      { value: 'bidirectional', label: 'Bidirectional' },
                    ].map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={styles.radioOption}
                        onPress={() =>
                          updateSetting(
                            'item_sync_direction',
                            option.value as 'push' | 'pull' | 'bidirectional'
                          )
                        }
                      >
                        <View style={styles.radio}>
                          {settings.item_sync_direction === option.value && (
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
                      onValueChange={(value) =>
                        updateSetting('sync_interval_minutes', value)
                      }
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

            {/* Expense Account (for cost tracking) */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Expense Tracking</Text>

              <View style={styles.subsetting}>
                <Text style={styles.settingLabel}>Default Expense Account</Text>
                <Text style={styles.settingDescription}>
                  Account for job expenses and costs
                </Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={settings.default_expense_account || ''}
                    onValueChange={(value) =>
                      updateSetting('default_expense_account', value || null)
                    }
                    style={styles.picker}
                  >
                    <Picker.Item label="-- Select Account --" value="" />
                    {expenseAccounts.map((account) => (
                      <Picker.Item
                        key={account.id}
                        label={account.name}
                        value={account.id}
                      />
                    ))}
                  </Picker>
                </View>
              </View>
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
  summarySection: {
    marginBottom: Spacing.lg,
  },
  summaryCards: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  summaryLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
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
  pickerContainer: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xs,
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
