/**
 * Services List Screen
 * List and manage service offerings
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { Card } from '../../components/ui';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

interface Service {
  service_id: string;
  name: string;
  description?: string;
  category: string;
  pricing_type: string;
  base_price: number;
  unit_label?: string;
  duration_minutes: number;
  is_active: boolean;
  is_featured: boolean;
  allow_online_booking: boolean;
  times_booked: number;
  total_revenue: number;
}

const CATEGORY_ICONS: Record<string, string> = {
  mowing: 'leaf',
  edging: 'cut',
  trimming: 'cut',
  leaf_removal: 'leaf',
  fertilization: 'water',
  aeration: 'ellipsis-horizontal',
  seeding: 'flower',
  weed_control: 'ban',
  planting: 'flower',
  mulching: 'layers',
  hardscaping: 'cube',
  irrigation: 'water',
  consultation: 'chatbubbles',
  maintenance: 'construct',
  repair: 'hammer',
  installation: 'build',
  inspection: 'search',
  cleanup: 'trash',
  emergency: 'alert-circle',
  other: 'ellipse',
};

export default function ServicesScreen() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const response = await api.get('/services?per_page=100');
      if (response.success && response.data) {
        setServices(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch services:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchServices();
    setRefreshing(false);
  }, []);

  const filteredServices = services.filter(s => {
    if (filter === 'active') return s.is_active;
    if (filter === 'inactive') return !s.is_active;
    return true;
  });

  const formatPrice = (service: Service) => {
    const price = `$${service.base_price.toFixed(2)}`;
    if (service.pricing_type === 'hourly') return `${price}/hr`;
    if (service.pricing_type === 'per_unit' && service.unit_label) {
      return `${price}/${service.unit_label}`;
    }
    if (service.pricing_type === 'quote') return 'Quote';
    return price;
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatCategory = (category: string) => {
    return category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const renderItem = ({ item }: { item: Service }) => (
    <TouchableOpacity onPress={() => router.push(`/services/${item.service_id}`)}>
      <Card style={styles.serviceCard}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconContainer, !item.is_active && styles.iconContainerInactive]}>
            <Ionicons
              name={(CATEGORY_ICONS[item.category] || 'ellipse') as any}
              size={24}
              color={item.is_active ? Colors.primary : Colors.gray400}
            />
          </View>
          <View style={styles.serviceInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.serviceName, !item.is_active && styles.serviceNameInactive]}>
                {item.name}
              </Text>
              {item.is_featured && (
                <View style={styles.featuredBadge}>
                  <Ionicons name="star" size={12} color={Colors.warning} />
                </View>
              )}
            </View>
            <Text style={styles.serviceCategory}>{formatCategory(item.category)}</Text>
          </View>
          <View style={styles.priceContainer}>
            <Text style={styles.priceText}>{formatPrice(item)}</Text>
            <Text style={styles.durationText}>{formatDuration(item.duration_minutes)}</Text>
          </View>
        </View>

        {item.description && (
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View style={styles.cardFooter}>
          <View style={styles.stat}>
            <Ionicons name="calendar-outline" size={14} color={Colors.gray400} />
            <Text style={styles.statText}>{item.times_booked} bookings</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="cash-outline" size={14} color={Colors.gray400} />
            <Text style={styles.statText}>${item.total_revenue.toLocaleString()}</Text>
          </View>
          {!item.is_active && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>Inactive</Text>
            </View>
          )}
          {item.allow_online_booking && item.is_active && (
            <Ionicons name="globe-outline" size={16} color={Colors.success} />
          )}
        </View>
      </Card>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="construct-outline" size={64} color={Colors.gray300} />
      <Text style={styles.emptyTitle}>No services</Text>
      <Text style={styles.emptyText}>
        Add your first service to start booking appointments
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ title: 'Services' }} />

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {(['all', 'active', 'inactive'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredServices}
          renderItem={renderItem}
          keyExtractor={item => item.service_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={renderEmpty}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/services/create')}>
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  filterContainer: {
    flexDirection: 'row',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    gap: Spacing.sm,
  },

  filterTab: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray100,
  },

  filterTabActive: {
    backgroundColor: Colors.primary,
  },

  filterTabText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },

  filterTabTextActive: {
    color: Colors.white,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  listContent: {
    padding: Spacing.md,
    flexGrow: 1,
  },

  serviceCard: {
    marginBottom: Spacing.md,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },

  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },

  iconContainerInactive: {
    backgroundColor: Colors.gray100,
  },

  serviceInfo: {
    flex: 1,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  serviceName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  serviceNameInactive: {
    color: Colors.gray400,
  },

  featuredBadge: {
    padding: 2,
  },

  serviceCategory: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  priceContainer: {
    alignItems: 'flex-end',
  },

  priceText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.success,
  },

  durationText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  description: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },

  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  statText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  inactiveBadge: {
    backgroundColor: Colors.gray200,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginLeft: 'auto',
  },

  inactiveBadgeText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray600,
    fontWeight: Typography.fontWeight.medium,
  },

  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },

  emptyTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginTop: Spacing.md,
  },

  emptyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  fab: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
