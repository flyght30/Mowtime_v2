/**
 * Active Job Screen
 * Shows current job progress with navigation and actions
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../../../constants/theme';
import { useTech } from '../../../../contexts/TechContext';
import {
  techApi,
  TechJob,
  STATUS_LABELS,
  STATUS_COLORS,
  formatTime,
  formatAddress,
  formatDuration,
} from '../../../../services/techApi';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ActiveJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const {
    currentJob,
    profile,
    lastLocation,
    arriveAtJob,
    refreshJobs,
  } = useTech();

  const [job, setJob] = useState<TechJob | null>(currentJob);
  const [loading, setLoading] = useState(!currentJob);
  const [actionLoading, setActionLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Load job if not current
  useEffect(() => {
    const loadJob = async () => {
      if (currentJob?.job_id === id) {
        setJob(currentJob);
        setLoading(false);
        return;
      }

      try {
        const data = await techApi.getJob(id);
        setJob(data);
      } catch (error) {
        console.error('Failed to load job:', error);
      } finally {
        setLoading(false);
      }
    };

    loadJob();
  }, [id, currentJob]);

  // Timer for elapsed time
  useEffect(() => {
    if (!job?.started_at) return;

    const startTime = new Date(job.started_at).getTime();

    const updateElapsed = () => {
      const now = Date.now();
      setElapsedTime(Math.floor((now - startTime) / 1000));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [job?.started_at]);

  // Center map on job location
  useEffect(() => {
    if (job?.address.latitude && job?.address.longitude && mapRef.current) {
      const coordinates = [
        { latitude: job.address.latitude, longitude: job.address.longitude },
      ];

      if (lastLocation) {
        coordinates.push(lastLocation);
      }

      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  }, [job, lastLocation]);

  const formatElapsedTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
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

  const handleCall = () => {
    if (!job?.client.phone) return;
    Linking.openURL(`tel:${job.client.phone}`);
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
              const updated = await techApi.getJob(job.job_id);
              setJob(updated);
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

  const handleCancel = () => {
    Alert.alert(
      'Cancel Job',
      'Are you sure you want to cancel this job? This will mark it as cancelled.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            // TODO: Implement job cancellation
            await refreshJobs();
            router.replace('/(tech)');
          },
        },
      ]
    );
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
          onPress={() => router.replace('/(tech)')}
        >
          <Text style={styles.backButtonText}>Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isEnroute = profile?.status === 'enroute';
  const isOnSite = profile?.status === 'on_site';

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={{
          latitude: job.address.latitude || 39.8283,
          longitude: job.address.longitude || -98.5795,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {job.address.latitude && job.address.longitude && (
          <Marker
            coordinate={{
              latitude: job.address.latitude,
              longitude: job.address.longitude,
            }}
            title={job.client.name}
            description={formatAddress(job.address)}
          >
            <View style={styles.marker}>
              <Ionicons name="location" size={24} color={Colors.white} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Status Banner */}
      <View
        style={[
          styles.statusBanner,
          { backgroundColor: STATUS_COLORS[profile?.status || 'available'] },
        ]}
      >
        <View style={styles.statusInfo}>
          <Text style={styles.statusLabel}>
            {isEnroute ? 'EN ROUTE TO' : 'ON SITE AT'}
          </Text>
          <Text style={styles.statusTime}>
            {formatElapsedTime(elapsedTime)}
          </Text>
        </View>
        {isEnroute && (
          <TouchableOpacity
            style={styles.navigateButton}
            onPress={handleNavigate}
          >
            <Ionicons name="navigate" size={24} color={Colors.white} />
          </TouchableOpacity>
        )}
      </View>

      {/* Job Info Panel */}
      <ScrollView style={styles.infoPanel} bounces={false}>
        {/* Customer Info */}
        <View style={styles.customerRow}>
          <View style={styles.customerInfo}>
            <Text style={styles.customerName}>{job.client.name}</Text>
            <Text style={styles.serviceType}>
              {job.service_name || job.service_type}
            </Text>
          </View>
          {job.client.phone && (
            <TouchableOpacity style={styles.callButton} onPress={handleCall}>
              <Ionicons name="call" size={24} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Address */}
        <TouchableOpacity style={styles.addressRow} onPress={handleNavigate}>
          <Ionicons name="location-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.addressText}>{formatAddress(job.address)}</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.gray400} />
        </TouchableOpacity>

        {/* Time Info */}
        <View style={styles.timeRow}>
          <View style={styles.timeItem}>
            <Text style={styles.timeLabel}>Scheduled</Text>
            <Text style={styles.timeValue}>{formatTime(job.scheduled_time)}</Text>
          </View>
          {job.estimated_duration && (
            <View style={styles.timeItem}>
              <Text style={styles.timeLabel}>Est. Duration</Text>
              <Text style={styles.timeValue}>
                {formatDuration(job.estimated_duration)}
              </Text>
            </View>
          )}
          <View style={styles.timeItem}>
            <Text style={styles.timeLabel}>Elapsed</Text>
            <Text style={[styles.timeValue, styles.elapsedValue]}>
              {formatElapsedTime(elapsedTime)}
            </Text>
          </View>
        </View>

        {/* Notes */}
        {(job.special_instructions || job.notes) && (
          <View style={styles.notesSection}>
            <View style={styles.notesHeader}>
              <Ionicons name="information-circle" size={20} color={Colors.warning} />
              <Text style={styles.notesTitle}>Notes</Text>
            </View>
            <Text style={styles.notesText}>
              {job.special_instructions || job.notes}
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {isEnroute && (
            <TouchableOpacity
              style={[styles.actionButton, styles.arrivedButton]}
              onPress={handleArrived}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={24} color={Colors.white} />
                  <Text style={styles.actionButtonText}>I've Arrived</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {isOnSite && (
            <TouchableOpacity
              style={[styles.actionButton, styles.completeButton]}
              onPress={handleComplete}
            >
              <Ionicons name="checkmark-done" size={24} color={Colors.white} />
              <Text style={styles.actionButtonText}>Complete Job</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.cancelLink}
            onPress={handleCancel}
          >
            <Text style={styles.cancelLinkText}>Cancel Job</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  map: {
    height: SCREEN_HEIGHT * 0.35,
  },
  marker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
    ...Shadows.lg,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.white,
    opacity: 0.9,
    letterSpacing: 0.5,
  },
  statusTime: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  navigateButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoPanel: {
    flex: 1,
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    marginTop: -Spacing.md,
    paddingTop: Spacing.lg,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  serviceType: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  callButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  addressText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    marginLeft: Spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  timeItem: {
    flex: 1,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  timeValue: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  elapsedValue: {
    color: Colors.primary,
  },
  notesSection: {
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.warning + '15',
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  notesTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  notesText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  actions: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  arrivedButton: {
    backgroundColor: Colors.warning,
  },
  completeButton: {
    backgroundColor: Colors.success,
  },
  actionButtonText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.white,
  },
  cancelLink: {
    alignItems: 'center',
    padding: Spacing.md,
  },
  cancelLinkText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.error,
  },
});
