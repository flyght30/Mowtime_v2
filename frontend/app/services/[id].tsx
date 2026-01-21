/**
 * Service Detail Screen
 * Shows full service details with stats and actions
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { Card, Button } from '../../components/ui';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';

interface Service {
  service_id: string;
  business_id: string;
  name: string;
  description?: string;
  category: string;
  pricing_type: string;
  base_price: number;
  unit_label?: string;
  min_price?: number;
  max_price?: number;
  duration_minutes: number;
  min_duration_minutes?: number;
  max_duration_minutes?: number;
  is_active: boolean;
  is_featured: boolean;
  allow_online_booking: boolean;
  booking_buffer_hours: number;
  min_staff_required: number;
  max_staff_allowed: number;
  times_booked: number;
  total_revenue: number;
  created_at: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  mowing: 'leaf',
  edging: 'cut',
  trimming: 'cut',
  leaf_removal: 'leaf',
  fertilization: 'water',
  consultation: 'chatbubbles',
  maintenance: 'construct',
  repair: 'hammer',
  installation: 'build',
  cleanup: 'trash',
  emergency: 'alert-circle',
  other: 'ellipse',
};

export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [service, setService] = useState<Service | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchService();
  }, [id]);

  const fetchService = async () => {
    try {
      const response = await api.get(`/services/${id}`);
      if (response.success && response.data) {
        setService(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch service:', error);
      Alert.alert('Error', 'Failed to load service details');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleActive = async () => {
    if (!service) return;

    setIsUpdating(true);
    try {
      const response = await api.put(`/services/${id}`, {
        is_active: !service.is_active,
      });
      if (response.success) {
        setService(prev => prev ? { ...prev, is_active: !prev.is_active } : null);
      } else {
        Alert.alert('Error', response.error?.message || 'Failed to update service');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update service');
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleFeatured = async () => {
    if (!service) return;

    setIsUpdating(true);
    try {
      const response = await api.put(`/services/${id}`, {
        is_featured: !service.is_featured,
      });
      if (response.success) {
        setService(prev => prev ? { ...prev, is_featured: !prev.is_featured } : null);
      } else {
        Alert.alert('Error', response.error?.message || 'Failed to update service');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update service');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Service',
      'Are you sure you want to delete this service? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await api.delete(`/services/${id}`);
              if (response.success) {
                router.back();
              } else {
                Alert.alert('Error', response.error?.message || 'Failed to delete service');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete service');
            }
          },
        },
      ]
    );
  };

  const formatPrice = (svc: Service) => {
    const price = `$${svc.base_price.toFixed(2)}`;
    if (svc.pricing_type === 'hourly') return `${price}/hr`;
    if (svc.pricing_type === 'per_unit' && svc.unit_label) {
      return `${price}/${svc.unit_label}`;
    }
    if (svc.pricing_type === 'quote') return 'Custom Quote';
    return price;
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
  };

  const formatCategory = (category: string) => {
    return category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const formatPricingType = (type: string) => {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Service' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!service) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Service' }} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={Colors.error} />
          <Text style={styles.errorText}>Service not found</Text>
          <Button title="Go Back" onPress={() => router.back()} variant="outline" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Service',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/services/${id}/edit`)}
              style={styles.headerButton}
            >
              <Ionicons name="pencil" size={22} color={Colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconLarge, !service.is_active && styles.iconLargeInactive]}>
            <Ionicons
              name={(CATEGORY_ICONS[service.category] || 'ellipse') as any}
              size={40}
              color={service.is_active ? Colors.primary : Colors.gray400}
            />
          </View>
          <Text style={[styles.serviceName, !service.is_active && styles.serviceNameInactive]}>
            {service.name}
          </Text>
          <Text style={styles.serviceCategory}>{formatCategory(service.category)}</Text>

          <View style={styles.badges}>
            {!service.is_active && (
              <View style={[styles.badge, styles.badgeInactive]}>
                <Text style={styles.badgeInactiveText}>Inactive</Text>
              </View>
            )}
            {service.is_featured && (
              <View style={[styles.badge, styles.badgeFeatured]}>
                <Ionicons name="star" size={14} color={Colors.warning} />
                <Text style={styles.badgeFeaturedText}>Featured</Text>
              </View>
            )}
            {service.allow_online_booking && (
              <View style={[styles.badge, styles.badgeOnline]}>
                <Ionicons name="globe" size={14} color={Colors.success} />
                <Text style={styles.badgeOnlineText}>Online Booking</Text>
              </View>
            )}
          </View>
        </View>

        {/* Pricing Card */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cash-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Pricing</Text>
          </View>
          <View style={styles.priceDisplay}>
            <Text style={styles.priceAmount}>{formatPrice(service)}</Text>
            <Text style={styles.pricingType}>{formatPricingType(service.pricing_type)}</Text>
          </View>
          {(service.min_price || service.max_price) && (
            <Text style={styles.priceRange}>
              Range: ${service.min_price?.toFixed(2) || '0'} - ${service.max_price?.toFixed(2) || service.base_price.toFixed(2)}
            </Text>
          )}
        </Card>

        {/* Duration Card */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="time-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Duration</Text>
          </View>
          <Text style={styles.durationText}>{formatDuration(service.duration_minutes)}</Text>
          {(service.min_duration_minutes || service.max_duration_minutes) && (
            <Text style={styles.durationRange}>
              Range: {formatDuration(service.min_duration_minutes || service.duration_minutes)} - {formatDuration(service.max_duration_minutes || service.duration_minutes)}
            </Text>
          )}
        </Card>

        {/* Description */}
        {service.description && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text-outline" size={24} color={Colors.primary} />
              <Text style={styles.cardTitle}>Description</Text>
            </View>
            <Text style={styles.descriptionText}>{service.description}</Text>
          </Card>
        )}

        {/* Stats Card */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="stats-chart-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Performance</Text>
          </View>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{service.times_booked}</Text>
              <Text style={styles.statLabel}>Total Bookings</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: Colors.success }]}>
                ${service.total_revenue.toLocaleString()}
              </Text>
              <Text style={styles.statLabel}>Total Revenue</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                ${service.times_booked > 0 ? (service.total_revenue / service.times_booked).toFixed(0) : '0'}
              </Text>
              <Text style={styles.statLabel}>Avg. Booking</Text>
            </View>
          </View>
        </Card>

        {/* Settings Card */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="settings-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Settings</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Staff Required</Text>
            <Text style={styles.settingValue}>
              {service.min_staff_required} - {service.max_staff_allowed}
            </Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Booking Buffer</Text>
            <Text style={styles.settingValue}>{service.booking_buffer_hours} hours</Text>
          </View>
        </Card>

        {/* Toggle Controls */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="toggle-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Quick Settings</Text>
          </View>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Active</Text>
              <Text style={styles.toggleDesc}>Service is available for booking</Text>
            </View>
            <Switch
              value={service.is_active}
              onValueChange={toggleActive}
              disabled={isUpdating}
              trackColor={{ false: Colors.gray300, true: Colors.primary + '80' }}
              thumbColor={service.is_active ? Colors.primary : Colors.gray100}
            />
          </View>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Featured</Text>
              <Text style={styles.toggleDesc}>Highlight in service listings</Text>
            </View>
            <Switch
              value={service.is_featured}
              onValueChange={toggleFeatured}
              disabled={isUpdating}
              trackColor={{ false: Colors.gray300, true: Colors.warning + '80' }}
              thumbColor={service.is_featured ? Colors.warning : Colors.gray100}
            />
          </View>
        </Card>

        {/* Delete Button */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={20} color={Colors.error} />
          <Text style={styles.deleteButtonText}>Delete Service</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
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

  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },

  errorText: {
    fontSize: Typography.fontSize.lg,
    color: Colors.textSecondary,
  },

  headerButton: {
    padding: Spacing.sm,
  },

  scrollView: {
    flex: 1,
  },

  content: {
    padding: Spacing.md,
  },

  header: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },

  iconLarge: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  iconLargeInactive: {
    backgroundColor: Colors.gray100,
  },

  serviceName: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },

  serviceNameInactive: {
    color: Colors.gray400,
  },

  serviceCategory: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },

  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },

  badgeInactive: {
    backgroundColor: Colors.gray200,
  },

  badgeInactiveText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray600,
    fontWeight: Typography.fontWeight.medium,
  },

  badgeFeatured: {
    backgroundColor: Colors.warning + '20',
  },

  badgeFeaturedText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.warning,
    fontWeight: Typography.fontWeight.medium,
  },

  badgeOnline: {
    backgroundColor: Colors.success + '20',
  },

  badgeOnlineText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.success,
    fontWeight: Typography.fontWeight.medium,
  },

  card: {
    marginBottom: Spacing.md,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },

  cardTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  priceDisplay: {
    alignItems: 'center',
  },

  priceAmount: {
    fontSize: 36,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.success,
  },

  pricingType: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },

  priceRange: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.md,
  },

  durationText: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    textAlign: 'center',
  },

  durationRange: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  descriptionText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: 24,
  },

  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },

  statItem: {
    alignItems: 'center',
  },

  statNumber: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },

  statLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },

  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },

  settingLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },

  settingValue: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },

  toggleLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },

  toggleDesc: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },

  deleteButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.error,
    fontWeight: Typography.fontWeight.medium,
  },
});
