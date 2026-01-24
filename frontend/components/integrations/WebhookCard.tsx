/**
 * WebhookCard Component
 * Display webhook subscription status and actions
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import api from '../../services/api';
import * as Clipboard from 'expo-clipboard';

interface Webhook {
  subscription_id: string;
  name?: string;
  url: string;
  events: string[];
  secret: string;
  is_active: boolean;
  last_triggered?: string;
  failure_count: number;
  consecutive_failures: number;
  auto_disabled: boolean;
}

interface Props {
  webhook: Webhook;
  onRefresh?: () => void;
}

const EVENT_LABELS: Record<string, string> = {
  'job.created': 'Job Created',
  'job.updated': 'Job Updated',
  'job.status_changed': 'Job Status Changed',
  'job.completed': 'Job Completed',
  'job.cancelled': 'Job Cancelled',
  'customer.created': 'Customer Created',
  'customer.updated': 'Customer Updated',
  'appointment.scheduled': 'Appointment Scheduled',
  'appointment.rescheduled': 'Appointment Rescheduled',
  'appointment.cancelled': 'Appointment Cancelled',
  'invoice.created': 'Invoice Created',
  'invoice.sent': 'Invoice Sent',
  'invoice.paid': 'Invoice Paid',
  'payment.received': 'Payment Received',
};

export default function WebhookCard({ webhook, onRefresh }: Props) {
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const response = await api.post(`/api/v1/webhooks/${webhook.subscription_id}/test`);
      const result = response.data?.data;

      if (result?.delivered) {
        Alert.alert(
          'Test Successful',
          `Response: ${result.response_status}\nTime: ${result.response_time_ms}ms`
        );
      } else {
        Alert.alert('Test Failed', result?.error || 'Unknown error');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to test webhook');
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleActive = async () => {
    setIsUpdating(true);
    try {
      await api.put(`/api/v1/webhooks/${webhook.subscription_id}`, {
        is_active: !webhook.is_active,
      });
      onRefresh?.();
    } catch (err) {
      Alert.alert('Error', 'Failed to update webhook');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReEnable = async () => {
    setIsUpdating(true);
    try {
      await api.post(`/api/v1/webhooks/${webhook.subscription_id}/re-enable`);
      onRefresh?.();
      Alert.alert('Success', 'Webhook re-enabled');
    } catch (err) {
      Alert.alert('Error', 'Failed to re-enable webhook');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Webhook',
      'Are you sure you want to delete this webhook? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await api.delete(`/api/v1/webhooks/${webhook.subscription_id}`);
              onRefresh?.();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete webhook');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleCopySecret = async () => {
    await Clipboard.setStringAsync(webhook.secret);
    Alert.alert('Copied', 'Signing secret copied to clipboard');
  };

  const handleRegenerateSecret = () => {
    Alert.alert(
      'Regenerate Secret',
      'Are you sure? You will need to update the secret in your receiving application.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          onPress: async () => {
            try {
              const response = await api.post(
                `/api/v1/webhooks/${webhook.subscription_id}/regenerate-secret`
              );
              const newSecret = response.data?.data?.secret;
              if (newSecret) {
                Alert.alert('New Secret', newSecret, [
                  { text: 'Copy', onPress: () => Clipboard.setStringAsync(newSecret) },
                  { text: 'OK' },
                ]);
              }
              onRefresh?.();
            } catch (err) {
              Alert.alert('Error', 'Failed to regenerate secret');
            }
          },
        },
      ]
    );
  };

  const formatLastTriggered = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getStatusColor = () => {
    if (webhook.auto_disabled) return Colors.error;
    if (!webhook.is_active) return Colors.gray400;
    if (webhook.consecutive_failures > 0) return Colors.warning;
    return Colors.success;
  };

  const getStatusText = () => {
    if (webhook.auto_disabled) return 'Auto-disabled';
    if (!webhook.is_active) return 'Inactive';
    if (webhook.consecutive_failures > 0) return 'Failing';
    return 'Active';
  };

  const truncateUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname + (parsed.pathname.length > 20 ? '...' : parsed.pathname);
    } catch {
      return url.substring(0, 40) + (url.length > 40 ? '...' : '');
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.card} onPress={() => setShowDetails(true)}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
            <View>
              <Text style={styles.name}>{webhook.name || 'Webhook'}</Text>
              <Text style={styles.url}>{truncateUrl(webhook.url)}</Text>
            </View>
          </View>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>
        </View>

        <View style={styles.eventsRow}>
          <Ionicons name="flash-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.eventsText}>
            {webhook.events.length} event{webhook.events.length !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.separator}>|</Text>
          <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.eventsText}>
            Last: {formatLastTriggered(webhook.last_triggered)}
          </Text>
        </View>

        {webhook.auto_disabled && (
          <View style={styles.disabledBanner}>
            <Ionicons name="warning" size={16} color={Colors.error} />
            <Text style={styles.disabledText}>
              Auto-disabled after {webhook.consecutive_failures} consecutive failures
            </Text>
            <TouchableOpacity onPress={handleReEnable} disabled={isUpdating}>
              <Text style={styles.reEnableText}>Re-enable</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleTest}
            disabled={isTesting || !webhook.is_active}
          >
            {isTesting ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <>
                <Ionicons name="paper-plane-outline" size={16} color={Colors.primary} />
                <Text style={styles.actionText}>Test</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleCopySecret}>
            <Ionicons name="key-outline" size={16} color={Colors.textSecondary} />
            <Text style={[styles.actionText, { color: Colors.textSecondary }]}>Secret</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color={Colors.error} />
                <Text style={[styles.actionText, { color: Colors.error }]}>Delete</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Details Modal */}
      <Modal visible={showDetails} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Webhook Details</Text>
              <TouchableOpacity onPress={() => setShowDetails(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>URL</Text>
                <Text style={styles.detailValue} selectable>
                  {webhook.url}
                </Text>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Events</Text>
                <View style={styles.eventTags}>
                  {webhook.events.map((event) => (
                    <View key={event} style={styles.eventTag}>
                      <Text style={styles.eventTagText}>
                        {EVENT_LABELS[event] || event}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Signing Secret</Text>
                <View style={styles.secretRow}>
                  <Text style={styles.secretText} numberOfLines={1}>
                    {webhook.secret.substring(0, 20)}...
                  </Text>
                  <TouchableOpacity onPress={handleCopySecret}>
                    <Ionicons name="copy-outline" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleRegenerateSecret}>
                    <Ionicons name="refresh-outline" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.detailSection}>
                <View style={styles.switchRow}>
                  <Text style={styles.detailLabel}>Active</Text>
                  <Switch
                    value={webhook.is_active}
                    onValueChange={handleToggleActive}
                    disabled={isUpdating || webhook.auto_disabled}
                    trackColor={{ true: Colors.primary }}
                  />
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Statistics</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{webhook.failure_count}</Text>
                    <Text style={styles.statLabel}>Total Failures</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text
                      style={[
                        styles.statValue,
                        webhook.consecutive_failures > 0 && { color: Colors.warning },
                      ]}
                    >
                      {webhook.consecutive_failures}
                    </Text>
                    <Text style={styles.statLabel}>Consecutive</Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowDetails(false)}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    gap: Spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  name: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  url: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
  },
  eventsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: 4,
  },
  eventsText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  separator: {
    color: Colors.gray300,
    marginHorizontal: Spacing.xs,
  },
  disabledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.error + '15',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  disabledText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.error,
  },
  reEnableText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.bold,
  },
  actions: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.xs,
  },
  actionText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '80%',
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
  },
  detailSection: {
    marginBottom: Spacing.lg,
  },
  detailLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    backgroundColor: Colors.background,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  eventTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  eventTag: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  eventTagText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
  },
  secretRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  secretText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    fontFamily: 'monospace',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  statLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  modalFooter: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  closeButton: {
    backgroundColor: Colors.background,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
});
