/**
 * Route Optimization Screen
 * Shows daily route with map view and list of stops
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import ConditionalMapView, { ConditionalMarker as Marker, ConditionalPolyline as Polyline, PROVIDER_GOOGLE } from '../../components/ConditionalMapView';
import { api } from '../../services/api';
import { Card } from '../../components/ui';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

interface Stop {
  appointment_id: string;
  order: number;
  scheduled_time: string;
  client_name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  travel_time_minutes: number;
  travel_distance_miles: number;
  eta: string;
  duration_minutes: number;
  services: Array<{ service_name: string }>;
}

interface RouteData {
  date: string;
  staff_id: string | null;
  stops: Stop[];
  total_travel_minutes: number;
  total_distance_miles: number;
  optimized: boolean;
}

interface StaffMember {
  staff_id: string;
  first_name: string;
  last_name: string;
}

export default function RoutesScreen() {
  const router = useRouter();
  const mapRef = useRef<any>(null);

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [optimizing, setOptimizing] = useState(false);

  const fetchStaff = useCallback(async () => {
    try {
      const response = await api.get('/staff');
      if (response.success && response.data?.data) {
        setStaffList(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch staff:', error);
    }
  }, []);

  const fetchRoute = useCallback(async () => {
    try {
      const staffParam = selectedStaff ? `&staff_id=${selectedStaff}` : '';
      const response = await api.get(`/routes/daily?date=${selectedDate}${staffParam}`);
      if (response.success && response.data?.data) {
        setRouteData(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch route:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, selectedStaff]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  useEffect(() => {
    setIsLoading(true);
    fetchRoute();
  }, [fetchRoute]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRoute();
    setRefreshing(false);
  };

  const handleOptimize = async () => {
    if (!routeData?.stops?.length) return;

    setOptimizing(true);
    try {
      const appointmentIds = routeData.stops.map(s => s.appointment_id);
      const response = await api.post('/routes/optimize', {
        appointment_ids: appointmentIds
      });
      if (response.success && response.data?.data) {
        setRouteData(prev => prev ? {
          ...prev,
          ...response.data.data,
          date: prev.date,
          staff_id: prev.staff_id
        } : null);
      }
    } catch (error) {
      console.error('Failed to optimize route:', error);
    } finally {
      setOptimizing(false);
    }
  };

  const openNavigation = async (stop: Stop) => {
    const { lat, lng } = stop.location;
    const label = encodeURIComponent(stop.client_name);

    // Get navigation links from API
    try {
      const response = await api.get(`/routes/navigation-links?lat=${lat}&lng=${lng}&label=${label}`);
      if (response.success && response.data?.data) {
        const links = response.data.data;

        // Try Google Maps first, then Apple Maps
        if (Platform.OS === 'ios') {
          Linking.openURL(links.apple_maps);
        } else {
          Linking.openURL(links.google_maps);
        }
      }
    } catch (error) {
      // Fallback to basic URL
      const url = Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${lat},${lng}`
        : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      Linking.openURL(url);
    }
  };

  const fitMapToMarkers = () => {
    if (mapRef.current && routeData?.stops?.length) {
      const coordinates = routeData.stops
        .filter(s => s.location?.lat && s.location?.lng)
        .map(s => ({
          latitude: s.location.lat,
          longitude: s.location.lng
        }));

      if (coordinates.length) {
        mapRef.current.fitToCoordinates(coordinates, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true
        });
      }
    }
  };

  const changeDate = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === today.getTime()) return 'Today';
    if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading route...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Daily Route</Text>
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'list' && styles.toggleButtonActive]}
            onPress={() => setViewMode('list')}
          >
            <Ionicons name="list" size={20} color={viewMode === 'list' ? Colors.white : Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'map' && styles.toggleButtonActive]}
            onPress={() => {
              setViewMode('map');
              setTimeout(fitMapToMarkers, 100);
            }}
          >
            <Ionicons name="map" size={20} color={viewMode === 'map' ? Colors.white : Colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Selector */}
      <View style={styles.dateSelector}>
        <TouchableOpacity onPress={() => changeDate(-1)} style={styles.dateArrow}>
          <Ionicons name="chevron-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
        <TouchableOpacity onPress={() => changeDate(1)} style={styles.dateArrow}>
          <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Staff Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.staffSelector}
        contentContainerStyle={styles.staffSelectorContent}
      >
        <TouchableOpacity
          style={[styles.staffChip, !selectedStaff && styles.staffChipActive]}
          onPress={() => setSelectedStaff(null)}
        >
          <Text style={[styles.staffChipText, !selectedStaff && styles.staffChipTextActive]}>
            All Staff
          </Text>
        </TouchableOpacity>
        {staffList.map(staff => (
          <TouchableOpacity
            key={staff.staff_id}
            style={[styles.staffChip, selectedStaff === staff.staff_id && styles.staffChipActive]}
            onPress={() => setSelectedStaff(staff.staff_id)}
          >
            <Text style={[styles.staffChipText, selectedStaff === staff.staff_id && styles.staffChipTextActive]}>
              {staff.first_name} {staff.last_name?.[0]}.
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Route Summary */}
      {routeData?.stops?.length ? (
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Ionicons name="location" size={16} color={Colors.primary} />
            <Text style={styles.summaryText}>{routeData.stops.length} stops</Text>
          </View>
          <View style={styles.summaryItem}>
            <Ionicons name="time" size={16} color={Colors.info} />
            <Text style={styles.summaryText}>{routeData.total_travel_minutes || 0} min travel</Text>
          </View>
          <View style={styles.summaryItem}>
            <Ionicons name="car" size={16} color={Colors.success} />
            <Text style={styles.summaryText}>{routeData.total_distance_miles || 0} mi</Text>
          </View>
          <TouchableOpacity
            style={[styles.optimizeButton, optimizing && styles.optimizeButtonDisabled]}
            onPress={handleOptimize}
            disabled={optimizing}
          >
            {optimizing ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Ionicons name="flash" size={14} color={Colors.white} />
                <Text style={styles.optimizeButtonText}>Optimize</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Map View */}
      {viewMode === 'map' && (
        <View style={styles.mapContainer}>
          <ConditionalMapView
            ref={mapRef}
            style={styles.map}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            showsUserLocation
            showsMyLocationButton
            onMapReady={fitMapToMarkers}
          >
            {routeData?.stops?.map((stop, index) => (
              stop.location?.lat && stop.location?.lng ? (
                <Marker
                  key={stop.appointment_id}
                  coordinate={{
                    latitude: stop.location.lat,
                    longitude: stop.location.lng
                  }}
                  title={`${stop.order}. ${stop.client_name}`}
                  description={`ETA: ${stop.eta}`}
                >
                  <View style={styles.markerContainer}>
                    <View style={styles.marker}>
                      <Text style={styles.markerText}>{stop.order}</Text>
                    </View>
                  </View>
                </Marker>
              ) : null
            ))}
            {routeData?.stops && routeData.stops.length > 1 && (
              <Polyline
                coordinates={routeData.stops
                  .filter(s => s.location?.lat && s.location?.lng)
                  .map(s => ({
                    latitude: s.location.lat,
                    longitude: s.location.lng
                  }))}
                strokeColor={Colors.primary}
                strokeWidth={3}
              />
            )}
          </ConditionalMapView>
        </View>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <ScrollView
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {!routeData?.stops?.length ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="car-outline" size={48} color={Colors.gray300} />
              <Text style={styles.emptyTitle}>No Appointments</Text>
              <Text style={styles.emptySubtitle}>No appointments scheduled for this date</Text>
            </Card>
          ) : (
            routeData.stops.map((stop, index) => (
              <Card key={stop.appointment_id} style={styles.stopCard}>
                <View style={styles.stopHeader}>
                  <View style={styles.stopNumber}>
                    <Text style={styles.stopNumberText}>{stop.order}</Text>
                  </View>
                  <View style={styles.stopInfo}>
                    <Text style={styles.stopName}>{stop.client_name}</Text>
                    <Text style={styles.stopAddress} numberOfLines={1}>{stop.address}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.navigateButton}
                    onPress={() => openNavigation(stop)}
                    disabled={!stop.location?.lat}
                  >
                    <Ionicons name="navigate" size={20} color={Colors.white} />
                  </TouchableOpacity>
                </View>

                <View style={styles.stopDetails}>
                  <View style={styles.stopDetailItem}>
                    <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                    <Text style={styles.stopDetailText}>
                      Scheduled: {stop.scheduled_time}
                    </Text>
                  </View>
                  <View style={styles.stopDetailItem}>
                    <Ionicons name="flag-outline" size={14} color={Colors.primary} />
                    <Text style={[styles.stopDetailText, { color: Colors.primary }]}>
                      ETA: {stop.eta}
                    </Text>
                  </View>
                </View>

                {index > 0 && (
                  <View style={styles.travelInfo}>
                    <Ionicons name="car-outline" size={12} color={Colors.textSecondary} />
                    <Text style={styles.travelText}>
                      {stop.travel_time_minutes} min • {stop.travel_distance_miles} mi from previous
                    </Text>
                  </View>
                )}

                {stop.services?.length > 0 && (
                  <View style={styles.servicesRow}>
                    {stop.services.slice(0, 2).map((service, idx) => (
                      <View key={idx} style={styles.serviceTag}>
                        <Text style={styles.serviceTagText}>{service.service_name}</Text>
                      </View>
                    ))}
                    {stop.services.length > 2 && (
                      <Text style={styles.moreServices}>+{stop.services.length - 2} more</Text>
                    )}
                  </View>
                )}
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
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
    paddingVertical: Spacing.sm,
  },

  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  title: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },

  viewToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    padding: 2,
  },

  toggleButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },

  toggleButtonActive: {
    backgroundColor: Colors.primary,
  },

  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },

  dateArrow: {
    padding: Spacing.sm,
  },

  dateText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    paddingHorizontal: Spacing.lg,
  },

  staffSelector: {
    maxHeight: 44,
    marginBottom: Spacing.sm,
  },

  staffSelectorContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },

  staffChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  staffChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },

  staffChipText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },

  staffChipTextActive: {
    color: Colors.white,
  },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },

  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  summaryText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  optimizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
    marginLeft: 'auto',
  },

  optimizeButtonDisabled: {
    opacity: 0.6,
  },

  optimizeButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.white,
  },

  mapContainer: {
    flex: 1,
  },

  map: {
    flex: 1,
  },

  markerContainer: {
    alignItems: 'center',
  },

  marker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },

  markerText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
  },

  listContainer: {
    flex: 1,
  },

  listContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },

  emptyCard: {
    alignItems: 'center',
    padding: Spacing.xl,
  },

  emptyTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginTop: Spacing.md,
  },

  emptySubtitle: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },

  stopCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },

  stopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  stopNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },

  stopNumberText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
  },

  stopInfo: {
    flex: 1,
  },

  stopName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  stopAddress: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  navigateButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },

  stopDetails: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    gap: Spacing.lg,
  },

  stopDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  stopDetailText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  travelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.xs,
  },

  travelText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },

  servicesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },

  serviceTag: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },

  serviceTagText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },

  moreServices: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
});
