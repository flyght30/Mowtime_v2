/**
 * Dispatch Map View Component
 * Displays technician locations and job pins on a map
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import ConditionalMapView, { ConditionalMarker as Marker, PROVIDER_GOOGLE } from '../ConditionalMapView';
import type { MapViewProps } from '../ConditionalMapView';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { dispatchApi, MapData, TechMapLocation, JobPin } from '../../services/dispatchApi';

// Define necessary types
type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type Callout = any; // Use any for Callout since it's not used on web

interface DispatchMapViewProps {
  onTechPress?: (techId: string) => void;
  onJobPress?: (jobId: string) => void;
  refreshTrigger?: number;
}

const DEFAULT_REGION: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 20,
  longitudeDelta: 20,
};

export default function DispatchMapView({
  onTechPress,
  onJobPress,
  refreshTrigger,
}: DispatchMapViewProps) {
  const mapRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);

  useEffect(() => {
    loadMapData();
  }, [refreshTrigger]);

  const loadMapData = async () => {
    try {
      setLoading(true);
      const response = await dispatchApi.getMapData();

      if (response.success && response.data) {
        setMapData(response.data);

        // Calculate region to fit all markers
        const allPoints = [
          ...response.data.technicians.map((t) => ({
            lat: t.latitude,
            lng: t.longitude,
          })),
          ...response.data.jobs.map((j) => ({
            lat: j.latitude,
            lng: j.longitude,
          })),
        ].filter((p) => p.lat && p.lng);

        if (allPoints.length > 0) {
          const lats = allPoints.map((p) => p.lat);
          const lngs = allPoints.map((p) => p.lng);

          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);

          const newRegion: Region = {
            latitude: (minLat + maxLat) / 2,
            longitude: (minLng + maxLng) / 2,
            latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.1),
            longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.1),
          };

          setRegion(newRegion);

          // Animate to new region
          mapRef.current?.animateToRegion(newRegion, 500);
        }
      }
    } catch (error) {
      console.error('Failed to load map data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTechMarkerColor = (status: string): string => {
    switch (status) {
      case 'available':
        return Colors.success;
      case 'assigned':
        return Colors.info;
      case 'enroute':
        return Colors.warning;
      case 'on_site':
        return '#7C3AED';
      case 'complete':
        return Colors.success;
      case 'off_duty':
        return Colors.gray400;
      default:
        return Colors.gray500;
    }
  };

  const getJobMarkerColor = (status: string): string => {
    switch (status) {
      case 'pending':
        return Colors.warning;
      case 'assigned':
        return Colors.info;
      case 'in_progress':
        return '#7C3AED';
      case 'completed':
        return Colors.success;
      default:
        return Colors.gray500;
    }
  };

  const renderTechMarker = (tech: TechMapLocation) => {
    if (!tech.latitude || !tech.longitude) return null;

    return (
      <Marker
        key={`tech-${tech.tech_id}`}
        coordinate={{
          latitude: tech.latitude,
          longitude: tech.longitude,
        }}
        anchor={{ x: 0.5, y: 0.5 }}
        onPress={() => onTechPress?.(tech.tech_id)}
      >
        <View style={styles.techMarkerContainer}>
          <View
            style={[
              styles.techMarker,
              { backgroundColor: getTechMarkerColor(tech.status) },
            ]}
          >
            <Ionicons name="person" size={16} color={Colors.white} />
          </View>
          <View style={styles.techMarkerArrow} />
        </View>
        <Callout tooltip>
          <View style={styles.callout}>
            <Text style={styles.calloutTitle}>{tech.tech_name}</Text>
            <Text style={styles.calloutStatus}>
              {tech.status.replace('_', ' ')}
            </Text>
            {tech.current_job && (
              <Text style={styles.calloutJob}>
                On: {tech.current_job}
              </Text>
            )}
          </View>
        </Callout>
      </Marker>
    );
  };

  const renderJobMarker = (job: JobPin) => {
    if (!job.latitude || !job.longitude) return null;

    return (
      <Marker
        key={`job-${job.job_id}`}
        coordinate={{
          latitude: job.latitude,
          longitude: job.longitude,
        }}
        anchor={{ x: 0.5, y: 1 }}
        onPress={() => onJobPress?.(job.job_id)}
      >
        <View style={styles.jobMarkerContainer}>
          <View
            style={[
              styles.jobMarker,
              { backgroundColor: getJobMarkerColor(job.status) },
            ]}
          >
            <Text style={styles.jobMarkerText}>
              {job.job_number?.slice(-4) || 'JOB'}
            </Text>
          </View>
        </View>
        <Callout tooltip>
          <View style={styles.callout}>
            <Text style={styles.calloutTitle}>{job.customer_name}</Text>
            <Text style={styles.calloutAddress} numberOfLines={2}>
              {job.address}
            </Text>
            <Text style={styles.calloutJob}>{job.job_type}</Text>
            {job.tech_name && (
              <Text style={styles.calloutTech}>
                Tech: {job.tech_name}
              </Text>
            )}
          </View>
        </Callout>
      </Marker>
    );
  };

  if (loading && !mapData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ConditionalMapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={true}
      >
        {mapData?.technicians.map(renderTechMarker)}
        {mapData?.jobs.map(renderJobMarker)}
      </ConditionalMapView>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
          <Text style={styles.legendText}>Available</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.warning }]} />
          <Text style={styles.legendText}>En Route</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#7C3AED' }]} />
          <Text style={styles.legendText}>On Site</Text>
        </View>
      </View>

      {/* Refresh indicator */}
      {loading && (
        <View style={styles.refreshing}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
    minHeight: 300,
  },
  loadingContainer: {
    flex: 1,
    minHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.lg,
  },
  loadingText: {
    marginTop: Spacing.sm,
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
  },
  // Tech marker
  techMarkerContainer: {
    alignItems: 'center',
  },
  techMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  techMarkerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.white,
    marginTop: -2,
  },
  // Job marker
  jobMarkerContainer: {
    alignItems: 'center',
  },
  jobMarker: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  jobMarkerText: {
    color: Colors.white,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
  },
  // Callout
  callout: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    minWidth: 150,
    maxWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  calloutTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  calloutStatus: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  calloutAddress: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  calloutJob: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    marginTop: 2,
  },
  calloutTech: {
    fontSize: Typography.fontSize.xs,
    color: Colors.info,
    marginTop: 2,
  },
  // Legend
  legend: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    flexDirection: 'row',
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  // Refreshing
  refreshing: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: BorderRadius.full,
    padding: Spacing.sm,
  },
});
