/**
 * Tech Route Screen
 * Shows today's route on a map with navigation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ConditionalMapView, { ConditionalMarker as Marker, ConditionalPolyline as Polyline, PROVIDER_GOOGLE } from '../../components/ConditionalMapView';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { useTech } from '../../contexts/TechContext';
import {
  TechJob,
  JOB_STATUS_COLORS,
  formatTime,
  formatAddress,
  formatDuration,
} from '../../services/techApi';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Marker colors
const MARKER_COLORS = {
  scheduled: Colors.primary,
  in_progress: Colors.warning,
  completed: Colors.success,
  cancelled: Colors.error,
};

export default function TechRouteScreen() {
  const router = useRouter();
  const { todaysJobs, currentJob, lastLocation, profile, startJob } = useTech();
  const mapRef = useRef<any>(null);
  const [selectedJob, setSelectedJob] = useState<TechJob | null>(null);

  // Filter jobs that have coordinates
  const mappableJobs = todaysJobs.filter(
    job => job.address.latitude && job.address.longitude
  );

  // Sort by route order or time
  const sortedJobs = [...mappableJobs].sort((a, b) => {
    if (a.route_order !== undefined && b.route_order !== undefined) {
      return a.route_order - b.route_order;
    }
    return a.scheduled_time.localeCompare(b.scheduled_time);
  });

  // Calculate region to fit all markers
  useEffect(() => {
    if (sortedJobs.length > 0 && mapRef.current) {
      const coordinates = sortedJobs.map(job => ({
        latitude: job.address.latitude!,
        longitude: job.address.longitude!,
      }));

      if (lastLocation) {
        coordinates.push(lastLocation);
      }

      if (coordinates.length > 0) {
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(coordinates, {
            edgePadding: { top: 50, right: 50, bottom: 150, left: 50 },
            animated: true,
          });
        }, 500);
      }
    }
  }, [sortedJobs.length, lastLocation]);

  const handleMarkerPress = (job: TechJob) => {
    setSelectedJob(job);
  };

  const handleJobPress = (job: TechJob) => {
    router.push(`/(tech)/job/${job.job_id}`);
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

  const focusOnJob = (job: TechJob) => {
    if (job.address.latitude && job.address.longitude && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: job.address.latitude,
        longitude: job.address.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      setSelectedJob(job);
    }
  };

  // Get route polyline coordinates
  const routeCoordinates = sortedJobs
    .filter(job => job.address.latitude && job.address.longitude)
    .map(job => ({
      latitude: job.address.latitude!,
      longitude: job.address.longitude!,
    }));

  // Add current location to start of route
  if (lastLocation && routeCoordinates.length > 0) {
    routeCoordinates.unshift(lastLocation);
  }

  // Calculate totals
  const pendingJobs = sortedJobs.filter(j => j.status === 'scheduled').length;
  const completedJobs = sortedJobs.filter(j => j.status === 'completed').length;
  const totalDuration = sortedJobs.reduce((sum, j) => sum + (j.estimated_duration || 0), 0);

  return (
    <View style={styles.container}>
      {/* Map */}
      <ConditionalMapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation
        showsMyLocationButton
        initialRegion={{
          latitude: lastLocation?.latitude || 39.8283,
          longitude: lastLocation?.longitude || -98.5795,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
      >
        {/* Route line */}
        {routeCoordinates.length > 1 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={Colors.primary}
            strokeWidth={3}
            lineDashPattern={[10, 5]}
          />
        )}

        {/* Job markers */}
        {sortedJobs.map((job, index) => (
          <Marker
            key={job.job_id}
            coordinate={{
              latitude: job.address.latitude!,
              longitude: job.address.longitude!,
            }}
            onPress={() => handleMarkerPress(job)}
          >
            <View
              style={[
                styles.marker,
                { backgroundColor: MARKER_COLORS[job.status] || Colors.gray500 },
                selectedJob?.job_id === job.job_id && styles.markerSelected,
              ]}
            >
              <Text style={styles.markerText}>{index + 1}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{sortedJobs.length}</Text>
          <Text style={styles.summaryLabel}>Stops</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{completedJobs}</Text>
          <Text style={styles.summaryLabel}>Done</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{pendingJobs}</Text>
          <Text style={styles.summaryLabel}>Left</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{formatDuration(totalDuration)}</Text>
          <Text style={styles.summaryLabel}>Est. Time</Text>
        </View>
      </View>

      {/* Selected Job Card */}
      {selectedJob && (
        <View style={styles.selectedJobCard}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setSelectedJob(null)}
          >
            <Ionicons name="close" size={20} color={Colors.gray500} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.selectedJobContent}
            onPress={() => handleJobPress(selectedJob)}
          >
            <View style={styles.selectedJobHeader}>
              <View
                style={[
                  styles.stopNumber,
                  { backgroundColor: MARKER_COLORS[selectedJob.status] },
                ]}
              >
                <Text style={styles.stopNumberText}>
                  {sortedJobs.findIndex(j => j.job_id === selectedJob.job_id) + 1}
                </Text>
              </View>
              <View style={styles.selectedJobInfo}>
                <Text style={styles.selectedJobName}>{selectedJob.client.name}</Text>
                <Text style={styles.selectedJobTime}>
                  {formatTime(selectedJob.scheduled_time)}
                  {selectedJob.estimated_duration &&
                    ` - ${formatDuration(selectedJob.estimated_duration)}`}
                </Text>
              </View>
            </View>

            <Text style={styles.selectedJobService}>
              {selectedJob.service_name || selectedJob.service_type}
            </Text>
            <Text style={styles.selectedJobAddress}>
              {formatAddress(selectedJob.address)}
            </Text>
          </TouchableOpacity>

          <View style={styles.selectedJobActions}>
            {selectedJob.status === 'scheduled' && !currentJob && (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => handleStartJob(selectedJob)}
              >
                <Ionicons name="play" size={16} color={Colors.white} />
                <Text style={styles.primaryButtonText}>Start</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => handleNavigate(selectedJob)}
            >
              <Ionicons name="navigate" size={16} color={Colors.primary} />
              <Text style={styles.secondaryButtonText}>Navigate</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Route List */}
      <ScrollView
        style={styles.routeList}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.routeListContent}
      >
        {sortedJobs.map((job, index) => (
          <TouchableOpacity
            key={job.job_id}
            style={[
              styles.routeItem,
              selectedJob?.job_id === job.job_id && styles.routeItemSelected,
              job.status === 'completed' && styles.routeItemCompleted,
            ]}
            onPress={() => focusOnJob(job)}
          >
            <View
              style={[
                styles.routeItemNumber,
                { backgroundColor: MARKER_COLORS[job.status] },
              ]}
            >
              {job.status === 'completed' ? (
                <Ionicons name="checkmark" size={14} color={Colors.white} />
              ) : (
                <Text style={styles.routeItemNumberText}>{index + 1}</Text>
              )}
            </View>
            <Text style={styles.routeItemName} numberOfLines={1}>
              {job.client.name}
            </Text>
            <Text style={styles.routeItemTime}>
              {formatTime(job.scheduled_time)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
    ...Shadows.md,
  },
  markerSelected: {
    transform: [{ scale: 1.2 }],
  },
  markerText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
  },
  summaryBar: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.md,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  summaryValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  summaryLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  selectedJobCard: {
    position: 'absolute',
    bottom: 90,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.lg,
  },
  closeButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    zIndex: 1,
  },
  selectedJobContent: {
    marginRight: Spacing.xl,
  },
  selectedJobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  stopNumberText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
  },
  selectedJobInfo: {
    flex: 1,
  },
  selectedJobName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  selectedJobTime: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  selectedJobService: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginLeft: 36,
  },
  selectedJobAddress: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginLeft: 36,
    marginTop: 2,
  },
  selectedJobActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.success,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary + '15',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
  },
  routeList: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    maxHeight: 80,
  },
  routeListContent: {
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    minWidth: 140,
    gap: Spacing.xs,
  },
  routeItemSelected: {
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  routeItemCompleted: {
    opacity: 0.6,
  },
  routeItemNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeItemNumberText: {
    color: Colors.white,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
  },
  routeItemName: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  routeItemTime: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
});
