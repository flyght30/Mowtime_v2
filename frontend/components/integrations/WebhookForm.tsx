/**
 * WebhookForm Component
 * Modal form for creating/editing webhook subscriptions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import api from '../../services/api';
import * as Clipboard from 'expo-clipboard';

interface Webhook {
  subscription_id?: string;
  name?: string;
  url: string;
  events: string[];
  secret?: string;
  is_active?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave?: () => void;
  webhook?: Webhook | null;
}

const AVAILABLE_EVENTS = [
  { id: 'job.created', label: 'Job Created', category: 'Jobs' },
  { id: 'job.updated', label: 'Job Updated', category: 'Jobs' },
  { id: 'job.status_changed', label: 'Job Status Changed', category: 'Jobs' },
  { id: 'job.completed', label: 'Job Completed', category: 'Jobs' },
  { id: 'job.cancelled', label: 'Job Cancelled', category: 'Jobs' },
  { id: 'customer.created', label: 'Customer Created', category: 'Customers' },
  { id: 'customer.updated', label: 'Customer Updated', category: 'Customers' },
  { id: 'appointment.scheduled', label: 'Appointment Scheduled', category: 'Appointments' },
  { id: 'appointment.rescheduled', label: 'Appointment Rescheduled', category: 'Appointments' },
  { id: 'appointment.cancelled', label: 'Appointment Cancelled', category: 'Appointments' },
  { id: 'invoice.created', label: 'Invoice Created', category: 'Invoices' },
  { id: 'invoice.sent', label: 'Invoice Sent', category: 'Invoices' },
  { id: 'invoice.paid', label: 'Invoice Paid', category: 'Invoices' },
  { id: 'payment.received', label: 'Payment Received', category: 'Payments' },
];

const CATEGORIES = ['Jobs', 'Customers', 'Appointments', 'Invoices', 'Payments'];

export default function WebhookForm({ visible, onClose, onSave, webhook }: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const isEditing = !!webhook?.subscription_id;

  useEffect(() => {
    if (visible) {
      if (webhook) {
        setName(webhook.name || '');
        setUrl(webhook.url);
        setSelectedEvents(webhook.events);
        setSecret(webhook.secret || null);
      } else {
        setName('');
        setUrl('');
        setSelectedEvents(['job.created', 'job.completed']);
        setSecret(null);
      }
      setUrlError(null);
    }
  }, [visible, webhook]);

  const validateUrl = (value: string): boolean => {
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setUrlError('URL must use HTTP or HTTPS');
        return false;
      }
      setUrlError(null);
      return true;
    } catch {
      setUrlError('Please enter a valid URL');
      return false;
    }
  };

  const toggleEvent = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId]
    );
  };

  const toggleCategory = (category: string) => {
    const categoryEvents = AVAILABLE_EVENTS.filter((e) => e.category === category).map(
      (e) => e.id
    );
    const allSelected = categoryEvents.every((e) => selectedEvents.includes(e));

    if (allSelected) {
      setSelectedEvents((prev) => prev.filter((e) => !categoryEvents.includes(e)));
    } else {
      setSelectedEvents((prev) => [...new Set([...prev, ...categoryEvents])]);
    }
  };

  const handleSave = async () => {
    if (!validateUrl(url)) return;

    if (selectedEvents.length === 0) {
      Alert.alert('Error', 'Please select at least one event');
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing) {
        await api.put(`/api/v1/webhooks/${webhook!.subscription_id}`, {
          name: name.trim() || undefined,
          url: url.trim(),
          events: selectedEvents,
        });
        Alert.alert('Success', 'Webhook updated');
      } else {
        const response = await api.post('/api/v1/webhooks', {
          name: name.trim() || undefined,
          url: url.trim(),
          events: selectedEvents,
        });
        const newSecret = response.data?.data?.secret;
        if (newSecret) {
          setSecret(newSecret);
          Alert.alert(
            'Webhook Created',
            'Your signing secret has been generated. Copy it now - it will not be shown again.',
            [
              {
                text: 'Copy Secret',
                onPress: () => {
                  Clipboard.setStringAsync(newSecret);
                  onSave?.();
                  onClose();
                },
              },
              {
                text: 'OK',
                onPress: () => {
                  onSave?.();
                  onClose();
                },
              },
            ]
          );
          return;
        }
      }
      onSave?.();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to save webhook');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!webhook?.subscription_id) return;

    setIsTesting(true);
    try {
      const response = await api.post(`/api/v1/webhooks/${webhook.subscription_id}/test`);
      const result = response.data?.data;

      if (result?.delivered) {
        Alert.alert(
          'Test Successful',
          `Response status: ${result.response_status}\nResponse time: ${result.response_time_ms}ms`
        );
      } else {
        Alert.alert('Test Failed', result?.error || 'No response from endpoint');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to test webhook');
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopySecret = async () => {
    if (secret) {
      await Clipboard.setStringAsync(secret);
      Alert.alert('Copied', 'Signing secret copied to clipboard');
    }
  };

  const getCategorySelectionState = (category: string): 'all' | 'some' | 'none' => {
    const categoryEvents = AVAILABLE_EVENTS.filter((e) => e.category === category).map(
      (e) => e.id
    );
    const selectedInCategory = categoryEvents.filter((e) => selectedEvents.includes(e));

    if (selectedInCategory.length === 0) return 'none';
    if (selectedInCategory.length === categoryEvents.length) return 'all';
    return 'some';
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isEditing ? 'Edit Webhook' : 'Add Webhook'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Name (optional)</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g., Zapier Notifications"
                placeholderTextColor={Colors.gray400}
              />
            </View>

            {/* URL */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Endpoint URL</Text>
              <TextInput
                style={[styles.input, urlError && styles.inputError]}
                value={url}
                onChangeText={(v) => {
                  setUrl(v);
                  if (urlError) validateUrl(v);
                }}
                onBlur={() => url && validateUrl(url)}
                placeholder="https://hooks.zapier.com/..."
                placeholderTextColor={Colors.gray400}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {urlError && <Text style={styles.errorText}>{urlError}</Text>}
            </View>

            {/* Events */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Events to Send</Text>
              <Text style={styles.fieldHint}>
                Select which events trigger this webhook
              </Text>

              {CATEGORIES.map((category) => {
                const selectionState = getCategorySelectionState(category);
                const categoryEvents = AVAILABLE_EVENTS.filter((e) => e.category === category);

                return (
                  <View key={category} style={styles.categorySection}>
                    <TouchableOpacity
                      style={styles.categoryHeader}
                      onPress={() => toggleCategory(category)}
                    >
                      <View style={styles.checkbox}>
                        {selectionState === 'all' && (
                          <Ionicons name="checkmark" size={14} color={Colors.white} />
                        )}
                        {selectionState === 'some' && (
                          <View style={styles.checkboxPartial} />
                        )}
                      </View>
                      <Text style={styles.categoryTitle}>{category}</Text>
                    </TouchableOpacity>

                    <View style={styles.eventList}>
                      {categoryEvents.map((event) => (
                        <TouchableOpacity
                          key={event.id}
                          style={styles.eventRow}
                          onPress={() => toggleEvent(event.id)}
                        >
                          <View
                            style={[
                              styles.checkbox,
                              selectedEvents.includes(event.id) && styles.checkboxSelected,
                            ]}
                          >
                            {selectedEvents.includes(event.id) && (
                              <Ionicons name="checkmark" size={14} color={Colors.white} />
                            )}
                          </View>
                          <Text style={styles.eventLabel}>{event.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Secret */}
            {(isEditing || secret) && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Signing Secret</Text>
                <Text style={styles.fieldHint}>
                  Use this to verify webhook signatures
                </Text>
                <View style={styles.secretContainer}>
                  <Text style={styles.secretText} numberOfLines={1}>
                    {secret
                      ? `${secret.substring(0, 20)}...`
                      : 'whsec_•••••••••••••••'}
                  </Text>
                  <TouchableOpacity onPress={handleCopySecret} disabled={!secret}>
                    <Ionicons
                      name="copy-outline"
                      size={20}
                      color={secret ? Colors.primary : Colors.gray400}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Test Button */}
            {isEditing && (
              <TouchableOpacity
                style={styles.testButton}
                onPress={handleTest}
                disabled={isTesting}
              >
                {isTesting ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <>
                    <Ionicons name="paper-plane-outline" size={18} color={Colors.primary} />
                    <Text style={styles.testButtonText}>Test Webhook</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
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
                <Text style={styles.saveButtonText}>
                  {isEditing ? 'Save Changes' : 'Create Webhook'}
                </Text>
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
  field: {
    marginBottom: Spacing.lg,
  },
  fieldLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  fieldHint: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputError: {
    borderColor: Colors.error,
  },
  errorText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
  categorySection: {
    marginBottom: Spacing.sm,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  categoryTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  eventList: {
    paddingLeft: Spacing.lg,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.gray300,
    marginRight: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxPartial: {
    width: 10,
    height: 3,
    backgroundColor: Colors.primary,
  },
  eventLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  secretContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  secretText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontFamily: 'monospace',
    color: Colors.text,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  testButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
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
