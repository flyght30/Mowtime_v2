/**
 * Pricing Settings Screen
 * Configure labor rates, overhead, and profit margins for HVAC jobs
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import { Card } from '../../components/ui';

interface PricingSettings {
  labor_rate_install: number;
  labor_rate_helper: number;
  overhead_percentage: number;
  profit_percentage: number;
  tax_rate: number;
  default_job_duration_hours: number;
}

const DEFAULT_SETTINGS: PricingSettings = {
  labor_rate_install: 85.00,
  labor_rate_helper: 45.00,
  overhead_percentage: 15,
  profit_percentage: 20,
  tax_rate: 8.25,
  default_job_duration_hours: 6,
};

export default function PricingSettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PricingSettings>(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);

  // Load current settings
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/businesses/me');
      if (response.data.success && response.data.business) {
        const business = response.data.business;
        const hvacConfig = business.config?.vertical_configs?.hvac || {};

        setSettings({
          labor_rate_install: hvacConfig.labor_rate_install ?? DEFAULT_SETTINGS.labor_rate_install,
          labor_rate_helper: hvacConfig.labor_rate_helper ?? DEFAULT_SETTINGS.labor_rate_helper,
          overhead_percentage: hvacConfig.overhead_percentage ?? DEFAULT_SETTINGS.overhead_percentage,
          profit_percentage: hvacConfig.profit_percentage ?? DEFAULT_SETTINGS.profit_percentage,
          tax_rate: hvacConfig.tax_rate ?? DEFAULT_SETTINGS.tax_rate,
          default_job_duration_hours: hvacConfig.default_job_duration_hours ?? DEFAULT_SETTINGS.default_job_duration_hours,
        });
      }
    } catch (error) {
      console.error('Failed to load pricing settings:', error);
      Alert.alert('Error', 'Failed to load pricing settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = useCallback((key: keyof PricingSettings, value: string) => {
    const numValue = parseFloat(value) || 0;
    setSettings(prev => ({ ...prev, [key]: numValue }));
    setHasChanges(true);
  }, []);

  const saveSettings = async () => {
    try {
      setSaving(true);

      // Update business config with HVAC pricing settings
      await api.patch('/businesses/me', {
        config: {
          vertical_configs: {
            hvac: {
              labor_rate_install: settings.labor_rate_install,
              labor_rate_helper: settings.labor_rate_helper,
              overhead_percentage: settings.overhead_percentage,
              profit_percentage: settings.profit_percentage,
              tax_rate: settings.tax_rate,
              default_job_duration_hours: settings.default_job_duration_hours,
            }
          }
        }
      });

      setHasChanges(false);
      Alert.alert('Success', 'Pricing settings saved successfully');
    } catch (error) {
      console.error('Failed to save pricing settings:', error);
      Alert.alert('Error', 'Failed to save pricing settings');
    } finally {
      setSaving(false);
    }
  };

  const calculateSamplePricing = () => {
    // Sample calculation for a $5,000 equipment job
    const equipmentCost = 5000;
    const laborHours = settings.default_job_duration_hours;
    const laborCost = laborHours * settings.labor_rate_install + laborHours * settings.labor_rate_helper;
    const materialsCost = 500; // Sample materials

    const subtotal = equipmentCost + laborCost + materialsCost;
    const overhead = subtotal * (settings.overhead_percentage / 100);
    const profit = subtotal * (settings.profit_percentage / 100);
    const preTaxTotal = subtotal + overhead + profit;
    const tax = (equipmentCost + materialsCost) * (settings.tax_rate / 100); // Tax on materials only
    const total = preTaxTotal + tax;

    return {
      equipmentCost,
      laborCost: Math.round(laborCost),
      materialsCost,
      subtotal: Math.round(subtotal),
      overhead: Math.round(overhead),
      profit: Math.round(profit),
      tax: Math.round(tax),
      total: Math.round(total),
      marginPercent: ((profit / total) * 100).toFixed(1),
    };
  };

  const sample = calculateSamplePricing();

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pricing Settings</Text>
          <TouchableOpacity
            onPress={saveSettings}
            disabled={!hasChanges || saving}
            style={[styles.saveButton, (!hasChanges || saving) && styles.saveButtonDisabled]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Labor Rates Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Labor Rates</Text>
            <Card style={styles.card}>
              <View style={styles.inputRow}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Install Technician Rate</Text>
                  <View style={styles.currencyInput}>
                    <Text style={styles.currencySymbol}>$</Text>
                    <TextInput
                      style={styles.input}
                      value={settings.labor_rate_install.toString()}
                      onChangeText={(v) => updateSetting('labor_rate_install', v)}
                      keyboardType="decimal-pad"
                      placeholder="85.00"
                    />
                    <Text style={styles.inputSuffix}>/hr</Text>
                  </View>
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Helper Rate</Text>
                  <View style={styles.currencyInput}>
                    <Text style={styles.currencySymbol}>$</Text>
                    <TextInput
                      style={styles.input}
                      value={settings.labor_rate_helper.toString()}
                      onChangeText={(v) => updateSetting('labor_rate_helper', v)}
                      keyboardType="decimal-pad"
                      placeholder="45.00"
                    />
                    <Text style={styles.inputSuffix}>/hr</Text>
                  </View>
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Default Job Duration</Text>
                  <View style={styles.currencyInput}>
                    <TextInput
                      style={styles.input}
                      value={settings.default_job_duration_hours.toString()}
                      onChangeText={(v) => updateSetting('default_job_duration_hours', v)}
                      keyboardType="decimal-pad"
                      placeholder="6"
                    />
                    <Text style={styles.inputSuffix}>hours</Text>
                  </View>
                </View>
              </View>
            </Card>
          </View>

          {/* Margins Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Margins</Text>
            <Card style={styles.card}>
              <View style={styles.inputRow}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Overhead Percentage</Text>
                  <Text style={styles.inputDescription}>
                    Covers fixed costs (rent, insurance, vehicles, etc.)
                  </Text>
                  <View style={styles.currencyInput}>
                    <TextInput
                      style={styles.input}
                      value={settings.overhead_percentage.toString()}
                      onChangeText={(v) => updateSetting('overhead_percentage', v)}
                      keyboardType="decimal-pad"
                      placeholder="15"
                    />
                    <Text style={styles.inputSuffix}>%</Text>
                  </View>
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Profit Margin</Text>
                  <Text style={styles.inputDescription}>
                    Target profit on each job
                  </Text>
                  <View style={styles.currencyInput}>
                    <TextInput
                      style={styles.input}
                      value={settings.profit_percentage.toString()}
                      onChangeText={(v) => updateSetting('profit_percentage', v)}
                      keyboardType="decimal-pad"
                      placeholder="20"
                    />
                    <Text style={styles.inputSuffix}>%</Text>
                  </View>
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Sales Tax Rate</Text>
                  <Text style={styles.inputDescription}>
                    Applied to equipment and materials
                  </Text>
                  <View style={styles.currencyInput}>
                    <TextInput
                      style={styles.input}
                      value={settings.tax_rate.toString()}
                      onChangeText={(v) => updateSetting('tax_rate', v)}
                      keyboardType="decimal-pad"
                      placeholder="8.25"
                    />
                    <Text style={styles.inputSuffix}>%</Text>
                  </View>
                </View>
              </View>
            </Card>
          </View>

          {/* Sample Calculation */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sample Job Calculation</Text>
            <Card style={styles.sampleCard}>
              <Text style={styles.sampleDescription}>
                Based on a $5,000 equipment install with $500 materials
              </Text>

              <View style={styles.sampleDivider} />

              <View style={styles.sampleRow}>
                <Text style={styles.sampleLabel}>Equipment</Text>
                <Text style={styles.sampleValue}>${sample.equipmentCost.toLocaleString()}</Text>
              </View>
              <View style={styles.sampleRow}>
                <Text style={styles.sampleLabel}>Labor ({settings.default_job_duration_hours}hrs)</Text>
                <Text style={styles.sampleValue}>${sample.laborCost.toLocaleString()}</Text>
              </View>
              <View style={styles.sampleRow}>
                <Text style={styles.sampleLabel}>Materials</Text>
                <Text style={styles.sampleValue}>${sample.materialsCost.toLocaleString()}</Text>
              </View>

              <View style={styles.sampleSubtotalRow}>
                <Text style={styles.sampleSubtotalLabel}>Subtotal</Text>
                <Text style={styles.sampleSubtotalValue}>${sample.subtotal.toLocaleString()}</Text>
              </View>

              <View style={styles.sampleRow}>
                <Text style={styles.sampleLabel}>Overhead ({settings.overhead_percentage}%)</Text>
                <Text style={styles.sampleValue}>${sample.overhead.toLocaleString()}</Text>
              </View>
              <View style={styles.sampleRow}>
                <Text style={styles.sampleLabel}>Profit ({settings.profit_percentage}%)</Text>
                <Text style={styles.sampleValue}>${sample.profit.toLocaleString()}</Text>
              </View>
              <View style={styles.sampleRow}>
                <Text style={styles.sampleLabel}>Tax ({settings.tax_rate}%)</Text>
                <Text style={styles.sampleValue}>${sample.tax.toLocaleString()}</Text>
              </View>

              <View style={styles.sampleTotalRow}>
                <Text style={styles.sampleTotalLabel}>Total Price</Text>
                <Text style={styles.sampleTotalValue}>${sample.total.toLocaleString()}</Text>
              </View>

              <View style={styles.marginIndicator}>
                <Text style={styles.marginLabel}>Effective Margin</Text>
                <Text style={[
                  styles.marginValue,
                  parseFloat(sample.marginPercent) >= 15 ? styles.marginGood : styles.marginLow
                ]}>
                  {sample.marginPercent}%
                </Text>
              </View>
            </Card>
          </View>

          <View style={styles.bottomPadding} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    minWidth: 70,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: Colors.gray300,
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
  },
  content: {
    flex: 1,
    padding: Spacing.md,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  card: {
    padding: Spacing.md,
  },
  inputRow: {
    marginBottom: Spacing.md,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  inputDescription: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  currencyInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  currencySymbol: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginRight: Spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    paddingVertical: Spacing.md,
  },
  inputSuffix: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginLeft: Spacing.xs,
  },
  sampleCard: {
    padding: Spacing.md,
    backgroundColor: Colors.gray50,
  },
  sampleDescription: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  sampleDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  sampleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  sampleLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  sampleValue: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
  },
  sampleSubtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Spacing.sm,
  },
  sampleSubtotalLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  sampleSubtotalValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  sampleTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderTopWidth: 2,
    borderTopColor: Colors.primary,
    marginTop: Spacing.sm,
  },
  sampleTotalLabel: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  sampleTotalValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  marginIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  marginLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginRight: Spacing.sm,
  },
  marginValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
  },
  marginGood: {
    color: Colors.success,
  },
  marginLow: {
    color: Colors.warning,
  },
  bottomPadding: {
    height: 40,
  },
});
