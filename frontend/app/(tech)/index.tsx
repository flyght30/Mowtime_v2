/**
 * Tech Home Screen - Today's Jobs
 * Shows today's scheduled jobs with quick actions
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { useTech } from '../../contexts/TechContext';
import {
  TechJob,
  STATUS_LABELS,
  STATUS_COLORS,
  JOB_STATUS_COLORS,
  formatTime,
  formatAddress,
  formatDuration,
} from '../../services/techApi';

export default function TechHomeScreen() {
  const router = useRouter();
  const {
    profile,
    todaysJobs,
    currentJob,
    isLoading,
    refreshJobs,
    refreshProfile,
    startJob,
    updateStatus,
  } = useTech();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshJobs(), refreshProfile()]);
    setRefreshing(false);
  }, [refreshJobs, refreshProfile]);

  const handleJobPress = (job: TechJob) => {
    router.push(`/(tech)/job/${job.job_id}`);
  };

  const handleStartJob = async (job: TechJob) => {
    Alert.alert(
      'Start Job',
      `Start heading to ${job.client.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            try {
              await startJob(job.job_id);
              router.push(`/(tech)/job/${job.job_id}/active`);
            } catch (error) {
              Alert.alert('Error', 'Failed to start job');
            }
          },
        },
      ]
    );
  };

  const handleNavigate = (job: TechJob) => {
    if (job.address.latitude && job.address.longitude) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${job.address.latitude},${job.address.longitude}`;
      Linking.openURL(url);
    } else {
      const address = encodeURIComponent(formatAddress(job.address));
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${address}`);
    }
  };

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  // Sort jobs: current first, then by scheduled time
  const sortedJobs = [...todaysJobs].sort((a, b) => {
    if (a.job_id === currentJob?.job_id) return -1;
    if (b.job_id === currentJob?.job_id) return 1;
    if (a.status === 'in_progress') return -1;
    if (b.status === 'in_progress') return 1;
    return a.scheduled_time.localeCompare(b.scheduled_time);
  });

  const completedCount = todaysJobs.filter(j => j.status === 'completed').length;
  const totalCount = todaysJobs.length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Status Header */}
      <View style={styles.statusHeader}>
        <View style={styles.statusInfo}>
          <Text style={styles.greeting}>
            Hello, {profile?.first_name || 'Tech'}
          </Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: STATUS_COLORS[profile?.status || 'off_duty'] },
              ]}
            />
            <Text style={styles.statusText}>
              {STATUS_LABELS[profile?.status || 'off_duty']}
            </Text>
          </View>
        </View>
        <View style={styles.progressCircle}>
          <Text style={styles.progressText}>
            {completedCount}/{totalCount}
          </Text>
          <Text style={styles.progressLabel}>Done</Text>
        </View>
      </View>

      {/* Quick Actions */}
      {profile?.status === 'off_duty' && (
        <TouchableOpacity
          style={styles.clockInButton}
          onPress={() => updateStatus('available')}
        >
          <Ionicons name="time" size={20} color={Colors.white} />
          <Text style={styles.clockInText}>Clock In</Text>
        </TouchableOpacity>
      )}

      {/* Current Job Banner */}
      {currentJob && (
        <TouchableOpacity
          style={styles.currentJobBanner}
          onPress={() => router.push(`/(tech)/job/${currentJob.job_id}/active`)}
        >
          <View style={styles.currentJobInfo}>
            <View style={styles.currentJobHeader}>
              <Ionicons name="navigate" size={20} color={Colors.white} />
              <Text style={styles.currentJobLabel}>
                {profile?.status === 'enroute' ? 'En Route To' : 'Currently At'}
              </Text>
            </View>
            <Text style={styles.currentJobName}>{currentJob.client.name}</Text>
            <Text style={styles.currentJobAddress}>
              {formatAddress(currentJob.address)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={Colors.white} />
        </TouchableOpacity>
      )}

      {/* Jobs List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Today's Schedule ({todaysJobs.length} jobs)
        </Text>

        {sortedJobs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={Colors.gray300} />
            <Text style={styles.emptyText}>No jobs scheduled for today</Text>
          </View>
        ) : (
          sortedJobs.map((job, index) => (
            <TouchableOpacity
              key={job.job_id}
              style={[
                styles.jobCard,
                job.job_id === currentJob?.job_id && styles.currentJobCard,
                job.status === 'completed' && styles.completedJobCard,
              ]}
              onPress={() => handleJobPress(job)}
              activeOpacity={0.7}
            >
              {/* Time Column */}
              <View style={styles.timeColumn}>
                <Text style={styles.jobTime}>{formatTime(job.scheduled_time)}</Text>
                {job.estimated_duration && (
                  <Text style={styles.jobDuration}>
                    {formatDuration(job.estimated_duration)}
                  </Text>
                )}
              </View>

              {/* Job Info */}
              <View style={styles.jobInfo}>
                <View style={styles.jobHeader}>
                  <Text
                    style={[
                      styles.jobClientName,
                      job.status === 'completed' && styles.completedText,
                    ]}
                    numberOfLines={1}
                  >
                    {job.client.name}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: JOB_STATUS_COLORS[job.status] + '20' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: JOB_STATUS_COLORS[job.status] },
                      ]}
                    >
                      {job.status.replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                <Text style={styles.jobService}>{job.service_name || job.service_type}</Text>
                <Text style={styles.jobAddress} numberOfLines={1}>
                  {formatAddress(job.address)}
                </Text>

                {/* Quick Actions */}
                {job.status !== 'completed' && (
                  <View style={styles.quickActions}>
                    {job.client.phone && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleCall(job.client.phone!)}
                      >
                        <Ionicons name="call" size={16} color={Colors.primary} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleNavigate(job)}
                    >
                      <Ionicons name="navigate" size={16} color={Colors.primary} />
                    </TouchableOpacity>
                    {job.status === 'scheduled' && !currentJob && (
                      <TouchableOpacity
                        style={styles.startButton}
                        onPress={() => handleStartJob(job)}
                      >
                        <Ionicons name="play" size={14} color={Colors.white} />
                        <Text style={styles.startButtonText}>Start</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {/* Chevron */}
              <Ionicons
                name="chevron-forward"
                size={20}
                color={Colors.gray400}
                style={styles.chevron}
              />
            </TouchableOpacity>
          ))
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
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  statusInfo: {
    flex: 1,
  },
  greeting: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  progressCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  progressLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
  },
  clockInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.success,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  clockInText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
  },
  currentJobBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  currentJobInfo: {
    flex: 1,
  },
  currentJobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  currentJobLabel: {
    color: Colors.white,
    fontSize: Typography.fontSize.xs,
    opacity: 0.9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  currentJobName: {
    color: Colors.white,
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
  },
  currentJobAddress: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    opacity: 0.9,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    ...Shadows.sm,
  },
  emptyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  jobCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  currentJobCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  completedJobCard: {
    opacity: 0.7,
  },
  timeColumn: {
    width: 70,
    marginRight: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    paddingRight: Spacing.md,
  },
  jobTime: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  jobDuration: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  jobInfo: {
    flex: 1,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  jobClientName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    flex: 1,
    marginRight: Spacing.sm,
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: Colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  statusBadgeText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    textTransform: 'capitalize',
  },
  jobService: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  jobAddress: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  quickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    marginLeft: 'auto',
  },
  startButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
  },
  chevron: {
    alignSelf: 'center',
    marginLeft: Spacing.sm,
  },
});
