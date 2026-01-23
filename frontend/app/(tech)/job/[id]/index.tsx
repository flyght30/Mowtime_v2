/**
 * Job Detail Screen
 * Shows full job details with actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../../../constants/theme';
import { useTech } from '../../../../contexts/TechContext';
import {
  techApi,
  TechJob,
  JOB_STATUS_COLORS,
  PRIORITY_COLORS,
  formatTime,
  formatAddress,
  formatDuration,
} from '../../../../services/techApi';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { currentJob, startJob, arriveAtJob, profile } = useTech();

  const [job, setJob] = useState<TechJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadJob = useCallback(async () => {
    try {
      const data = await techApi.getJob(id);
      setJob(data);
    } catch (error) {
      console.error('Failed to load job:', error);
      Alert.alert('Error', 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadJob();
    setRefreshing(false);
  }, [loadJob]);

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleSMS = (phone: string) => {
    Linking.openURL(`sms:${phone}`);
  };

  const handleNavigate = () => {
    if (!job) return;

    if (job.address.latitude && job.address.longitude) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${job.address.latitude},${job.address.longitude}`;
      Linking.openURL(url);
    } else {
      const address = encodeURIComponent(formatAddress(job.address));
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${address}`);
    }
  };

  const handleStartJob = async () => {
    if (!job) return;

    Alert.alert(
      'Start Job',
      `Start heading to ${job.client.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            setActionLoading(true);
            try {
              await startJob(job.job_id);
              router.replace(`/(tech)/job/${job.job_id}/active`);
            } catch (error) {
              Alert.alert('Error', 'Failed to start job');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleArrived = async () => {
    if (!job) return;

    Alert.alert(
      'Arrived',
      'Mark yourself as arrived at the job site?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setActionLoading(true);
            try {
              await arriveAtJob(job.job_id);
              await loadJob();
            } catch (error) {
              Alert.alert('Error', 'Failed to update status');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleComplete = () => {
    if (!job) return;
    router.push(`/(tech)/job/${job.job_id}/complete`);
  };

  const handleViewActive = () => {
    if (!job) return;
    router.push(`/(tech)/job/${job.job_id}/active`);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color={Colors.error} />
        <Text style={styles.errorText}>Job not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCurrentJob = currentJob?.job_id === job.job_id;
  const canStart = job.status === 'scheduled' && !currentJob;
  const canArrive = isCurrentJob && profile?.status === 'enroute';
  const canComplete = isCurrentJob && profile?.status === 'on_site';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Status Banner */}
      <View
        style={[
          styles.statusBanner,
          { backgroundColor: JOB_STATUS_COLORS[job.status] },
        ]}
      >
        <Ionicons
          name={
            job.status === 'completed'
              ? 'checkmark-circle'
              : job.status === 'in_progress'
              ? 'time'
              : 'calendar'
          }
          size={20}
          color={Colors.white}
        />
        <Text style={styles.statusBannerText}>
          {job.status === 'completed'
            ? 'Completed'
            : job.status === 'in_progress'
            ? isCurrentJob
              ? profile?.status === 'enroute'
                ? 'En Route'
                : 'On Site'
              : 'In Progress'
            : 'Scheduled'}
        </Text>
      </View>

      {/* Time & Service Info */}
      <View style={styles.card}>
        <View style={styles.timeRow}>
          <View style={styles.timeInfo}>
            <Ionicons name="time-outline" size={24} color={Colors.primary} />
            <View>
              <Text style={styles.timeLabel}>Scheduled Time</Text>
              <Text style={styles.timeValue}>
                {formatTime(job.scheduled_time)}
                {job.end_time && ` - ${formatTime(job.end_time)}`}
              </Text>
            </View>
          </View>
          {job.estimated_duration && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>
                {formatDuration(job.estimated_duration)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.serviceRow}>
          <Text style={styles.serviceName}>
            {job.service_name || job.service_type}
          </Text>
          {job.priority && job.priority !== 'normal' && (
            <View
              style={[
                styles.priorityBadge,
                { backgroundColor: PRIORITY_COLORS[job.priority] + '20' },
              ]}
            >
              <Text
                style={[
                  styles.priorityText,
                  { color: PRIORITY_COLORS[job.priority] },
                ]}
              >
                {job.priority.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {job.description && (
          <Text style={styles.description}>{job.description}</Text>
        )}

        {job.estimated_price && (
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Estimated Price:</Text>
            <Text style={styles.priceValue}>
              ${job.estimated_price.toFixed(2)}
            </Text>
          </View>
        )}
      </View>

      {/* Customer Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Customer</Text>
        <Text style={styles.customerName}>{job.client.name}</Text>

        {/* Contact Actions */}
        <View style={styles.contactActions}>
          {job.client.phone && (
            <>
              <TouchableOpacity
                style={styles.contactButton}
                onPress={() => handleCall(job.client.phone!)}
              >
                <Ionicons name="call" size={20} color={Colors.primary} />
                <Text style={styles.contactButtonText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.contactButton}
                onPress={() => handleSMS(job.client.phone!)}
              >
                <Ionicons name="chatbubble" size={20} color={Colors.primary} />
                <Text style={styles.contactButtonText}>Text</Text>
              </TouchableOpacity>
            </>
          )}
          {job.client.email && (
            <TouchableOpacity
              style={styles.contactButton}
              onPress={() => Linking.openURL(`mailto:${job.client.email}`)}
            >
              <Ionicons name="mail" size={20} color={Colors.primary} />
              <Text style={styles.contactButtonText}>Email</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Address */}
      <TouchableOpacity style={styles.card} onPress={handleNavigate}>
        <View style={styles.addressHeader}>
          <Text style={styles.cardTitle}>Address</Text>
          <View style={styles.navigateButton}>
            <Ionicons name="navigate" size={16} color={Colors.primary} />
            <Text style={styles.navigateText}>Navigate</Text>
          </View>
        </View>
        <Text style={styles.addressText}>{job.address.street}</Text>
        <Text style={styles.addressText}>
          {job.address.city}, {job.address.state} {job.address.zip}
        </Text>
      </TouchableOpacity>

      {/* Special Instructions */}
      {(job.special_instructions || job.notes) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notes & Instructions</Text>
          {job.special_instructions && (
            <View style={styles.instructionsBox}>
              <Ionicons
                name="alert-circle"
                size={20}
                color={Colors.warning}
                style={styles.instructionsIcon}
              />
              <Text style={styles.instructionsText}>
                {job.special_instructions}
              </Text>
            </View>
          )}
          {job.notes && <Text style={styles.notesText}>{job.notes}</Text>}
        </View>
      )}

      {/* Equipment Needed */}
      {job.equipment_needed && job.equipment_needed.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Equipment Needed</Text>
          <View style={styles.equipmentList}>
            {job.equipment_needed.map((item, index) => (
              <View key={index} style={styles.equipmentItem}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={Colors.success}
                />
                <Text style={styles.equipmentText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {isCurrentJob && (
          <TouchableOpacity
            style={styles.viewActiveButton}
            onPress={handleViewActive}
          >
            <Ionicons name="play-circle" size={20} color={Colors.primary} />
            <Text style={styles.viewActiveText}>View Active Job</Text>
          </TouchableOpacity>
        )}

        {canStart && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleStartJob}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Ionicons name="play" size={20} color={Colors.white} />
                <Text style={styles.primaryButtonText}>Start Job</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {canArrive && (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: Colors.warning }]}
            onPress={handleArrived}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Ionicons name="location" size={20} color={Colors.white} />
                <Text style={styles.primaryButtonText}>I've Arrived</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {canComplete && (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: Colors.success }]}
            onPress={handleComplete}
          >
            <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
            <Text style={styles.primaryButtonText}>Complete Job</Text>
          </TouchableOpacity>
        )}
      </View>
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
    padding: Spacing.xl,
  },
  errorText: {
    fontSize: Typography.fontSize.lg,
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  backButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
  },
  backButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  statusBannerText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  cardTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  timeLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  timeValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  durationBadge: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  durationText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serviceName: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  priorityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  priorityText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
  },
  description: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  priceLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  priceValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.success,
  },
  customerName: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  contactActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary + '15',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  contactButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navigateText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
  },
  addressText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: 24,
  },
  instructionsBox: {
    flexDirection: 'row',
    backgroundColor: Colors.warning + '15',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  instructionsIcon: {
    marginRight: Spacing.sm,
  },
  instructionsText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
  },
  notesText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: 22,
  },
  equipmentList: {
    gap: Spacing.sm,
  },
  equipmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  equipmentText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  actions: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  viewActiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary + '15',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  viewActiveText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  primaryButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.white,
  },
});
