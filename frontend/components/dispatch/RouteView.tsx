/**
 * Route View Component
 * Shows technician's daily route with numbered stops on a map
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { dispatchApi, scheduleApi } from '../../services/dispatchApi';

interface RouteStop {
  order: number;
  entry_id: string;
  job_id: string;
  job_number: string;
  customer_name: string;
  address: string;
  location: { lat: number; lng: number } | null;
  arrival_time: string;
  departure_time: string;
  travel_from_previous: number;
  status: string;
  job_type: string;
}

interface RouteData {
  tech_id: string;
  tech_name: string;
  date: string;
  stops: RouteStop[];
  total_drive_time: number;
  total_job_time: number;
  stop_count: number;
}

interface OptimizeResult {
  original_order: string[];
  optimized_order: string[];
  time_saved_minutes: number;
  total_drive_time_minutes: number;
  stops: RouteStop[];
}

interface RouteViewProps {
  visible: boolean;
  techId: string;
  techName: string;
  date: string;
  onClose: () => void;
  onRefresh?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: Colors.info,
  in_progress: '#7C3AED',
  complete: Colors.success,
  cancelled: Colors.gray400,
};

export default function RouteView({
  visible,
  techId,
  techName,
  date,
  onClose,
  onRefresh,
}: RouteViewProps) {
  const mapRef = useRef<MapView>(null);
  const [loading, setLoading] = useState(true);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [showOptimized, setShowOptimized] = useState(false);

  useEffect(() => {
    if (visible && techId) {
      loadRoute();
    }
  }, [visible, techId, date]);

  const loadRoute = async () => {
    try {
      setLoading(true);
      setOptimizeResult(null);
      setShowOptimized(false);

      const response = await dispatchApi.getRoute(techId, date);
      if (response.success && response.data) {
        setRouteData(response.data);

        // Fit map to show all stops
        if (response.data.stops.length > 0) {
          const points = response.data.stops
            .filter((s: RouteStop) => s.location)
            .map((s: RouteStop) => ({
              latitude: s.location!.lat,
              longitude: s.location!.lng,
            }));

          if (points.length > 0) {
            setTimeout(() => {
              mapRef.current?.fitToCoordinates(points, {
                edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
                animated: true,
              });
            }, 500);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load route:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    if (!routeData || routeData.stops.length < 2) return;

    try {
      setOptimizing(true);
      const response = await scheduleApi.optimize({
        tech_id: techId,
        date: date,
      });

      if (response.success && response.data) {
        setOptimizeResult(response.data);
        setShowOptimized(true);
      }
    } catch (error) {
      console.error('Failed to optimize route:', error);
    } finally {
      setOptimizing(false);
    }
  };

  const handleApplyOptimization = async () => {
    if (!optimizeResult) return;

    try {
      setApplying(true);
      const response = await scheduleApi.applyOptimization({
        tech_id: techId,
        date: date,
        optimized_order: optimizeResult.optimized_order,
      });

      if (response.success) {
        await loadRoute();
        setOptimizeResult(null);
        setShowOptimized(false);
        onRefresh?.();
      }
    } catch (error) {
      console.error('Failed to apply optimization:', error);
    } finally {
      setApplying(false);
    }
  };

  const getDisplayStops = (): RouteStop[] => {
    if (showOptimized && optimizeResult) {
      return optimizeResult.stops;
    }
    return routeData?.stops || [];
  };

  const renderStopMarker = (stop: RouteStop, index: number) => {
    if (!stop.location) return null;

    return (
      <Marker
        key={`stop-${stop.job_id}`}
        coordinate={{
          latitude: stop.location.lat,
          longitude: stop.location.lng,
        }}
        anchor={{ x: 0.5, y: 0.5 }}
      >
        <View style={[styles.stopMarker, { backgroundColor: STATUS_COLORS[stop.status] || Colors.info }]}>
          <Text style={styles.stopMarkerText}>{stop.order}</Text>
        </View>
      </Marker>
    );
  };

  const renderRoutePolyline = () => {
    const stops = getDisplayStops();
    const coordinates = stops
      .filter(s => s.location)
      .map(s => ({
        latitude: s.location!.lat,
        longitude: s.location!.lng,
      }));

    if (coordinates.length < 2) return null;

    return (
      <Polyline
        coordinates={coordinates}
        strokeColor={showOptimized ? Colors.success : Colors.primary}
        strokeWidth={3}
        lineDashPattern={showOptimized ? [10, 5] : undefined}
      />
    );
  };

  const renderStopList = () => {
    const stops = getDisplayStops();

    return stops.map((stop, index) => (
      <View key={stop.job_id} style={styles.stopItem}>
        <View style={[styles.stopNumber, { backgroundColor: STATUS_COLORS[stop.status] || Colors.info }]}>
          <Text style={styles.stopNumberText}>{stop.order}</Text>
        </View>
        <View style={styles.stopInfo}>
          <Text style={styles.stopTime}>{stop.arrival_time} - {stop.departure_time}</Text>
          <Text style={styles.stopCustomer}>{stop.customer_name}</Text>
          <Text style={styles.stopAddress} numberOfLines={1}>{stop.address}</Text>
          <View style={styles.stopMeta}>
            <Text style={styles.stopType}>{stop.job_type}</Text>
            {stop.travel_from_previous > 0 && (
              <Text style={styles.stopTravel}>
                <Ionicons name="car" size={12} color={Colors.textSecondary} /> {stop.travel_from_previous} min
              </Text>
            )}
          </View>
        </View>
        <View style={[styles.stopStatus, { backgroundColor: STATUS_COLORS[stop.status] || Colors.gray200 }]}>
          <Text style={styles.stopStatusText}>{stop.status.replace('_', ' ')}</Text>
        </View>
      </View>
    ));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Text style={styles.techName}>{techName}</Text>
            <Text style={styles.dateText}>{new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading route...</Text>
          </View>
        ) : (
          <>
            {/* Map */}
            <View style={styles.mapContainer}>
              <MapView
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_GOOGLE}
                initialRegion={{
                  latitude: 39.8283,
                  longitude: -98.5795,
                  latitudeDelta: 20,
                  longitudeDelta: 20,
                }}
              >
                {getDisplayStops().map(renderStopMarker)}
                {renderRoutePolyline()}
              </MapView>

              {/* Map Legend */}
              <View style={styles.legend}>
                <Text style={styles.legendTitle}>{getDisplayStops().length} Stops</Text>
                {routeData && (
                  <>
                    <Text style={styles.legendItem}>
                      <Ionicons name="car" size={12} /> {routeData.total_drive_time} min driving
                    </Text>
                    <Text style={styles.legendItem}>
                      <Ionicons name="time" size={12} /> {Math.round(routeData.total_job_time / 60)}h jobs
                    </Text>
                  </>
                )}
              </View>
            </View>

            {/* Optimization Banner */}
            {optimizeResult && (
              <View style={styles.optimizeBanner}>
                <View style={styles.optimizeInfo}>
                  {optimizeResult.time_saved_minutes > 0 ? (
                    <>
                      <Ionicons name="flash" size={20} color={Colors.success} />
                      <Text style={styles.optimizeSaved}>
                        Save {optimizeResult.time_saved_minutes} minutes!
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                      <Text style={styles.optimizeSaved}>Route is already optimal</Text>
                    </>
                  )}
                </View>
                {optimizeResult.time_saved_minutes > 0 && (
                  <TouchableOpacity
                    style={styles.applyButton}
                    onPress={handleApplyOptimization}
                    disabled={applying}
                  >
                    {applying ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.applyButtonText}>Apply</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Stop List */}
            <ScrollView style={styles.stopList}>
              <View style={styles.stopListHeader}>
                <Text style={styles.stopListTitle}>Route Stops</Text>
                {routeData && routeData.stops.length >= 2 && !showOptimized && (
                  <TouchableOpacity
                    style={styles.optimizeButton}
                    onPress={handleOptimize}
                    disabled={optimizing}
                  >
                    {optimizing ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="flash" size={16} color={Colors.primary} />
                        <Text style={styles.optimizeButtonText}>Optimize</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
              {renderStopList()}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingTop: 50, // Safe area
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    alignItems: 'center',
  },
  techName: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  dateText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.sm,
    color: Colors.textSecondary,
  },
  mapContainer: {
    height: 250,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  legend: {
    position: 'absolute',
    bottom: Spacing.sm,
    left: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    ...Shadows.sm,
  },
  legendTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  legendItem: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  stopMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    ...Shadows.sm,
  },
  stopMarkerText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
  },
  optimizeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.success + '15',
    padding: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.success + '30',
  },
  optimizeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  optimizeSaved: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.success,
  },
  applyButton: {
    backgroundColor: Colors.success,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  applyButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
  },
  stopList: {
    flex: 1,
    padding: Spacing.md,
  },
  stopListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  stopListTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  optimizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
  },
  optimizeButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  stopNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  stopNumberText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
  },
  stopInfo: {
    flex: 1,
  },
  stopTime: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  stopCustomer: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  stopAddress: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  stopMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  stopType: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  stopTravel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  stopStatus: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginLeft: Spacing.sm,
  },
  stopStatusText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
    textTransform: 'capitalize',
  },
});
