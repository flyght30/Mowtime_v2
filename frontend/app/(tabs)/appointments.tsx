/**
 * Appointments Screen
 * List and manage appointments
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
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { Card } from '../../components/ui';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

interface Appointment {
  appointment_id: string;
  client_id: string;
  scheduled_date: string;
  scheduled_time: string;
  end_time: string;
  status: string;
  services: Array<{ service_name: string; total_price: number }>;
  total_price: number;
  staff_ids: string[];
}

type FilterStatus = 'all' | 'scheduled' | 'confirmed' | 'completed' | 'canceled';

export default function AppointmentsScreen() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    fetchAppointments(true);
  }, [filter]);

  const fetchAppointments = async (reset = false) => {
    if (!reset && !hasMore) return;

    const currentPage = reset ? 1 : page;

    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        per_page: '20',
      });

      if (filter !== 'all') {
        params.append('status', filter);
      }

      const response = await api.get(`/appointments?${params}`);

      if (response.success && response.data) {
        if (reset) {
          setAppointments(response.data);
        } else {
          setAppointments(prev => [...prev, ...response.data]);
        }
        setHasMore(response.meta?.has_next || false);
        setPage(currentPage + 1);
      }
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAppointments(true);
    setRefreshing(false);
  }, [filter]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (time: string) => {
    const [hour, minute] = time.split(':');
    const h = parseInt(hour);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minute} ${ampm}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return Colors.primary;
      case 'confirmed': return Colors.success;
      case 'in_progress': return Colors.warning;
      case 'completed': return Colors.success;
      case 'canceled': return Colors.error;
      default: return Colors.gray500;
    }
  };

  const filters: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'completed', label: 'Completed' },
  ];

  const renderItem = ({ item }: { item: Appointment }) => (
    <Card style={styles.appointmentCard}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.dateText}>{formatDate(item.scheduled_date)}</Text>
          <Text style={styles.timeText}>
            {formatTime(item.scheduled_time)} - {formatTime(item.end_time)}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) + '20' },
          ]}
        >
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1).replace('_', ' ')}
          </Text>
        </View>
      </View>

      <Text style={styles.servicesText}>
        {item.services.map(s => s.service_name).join(', ')}
      </Text>

      <View style={styles.cardFooter}>
        <Text style={styles.priceText}>${item.total_price.toFixed(2)}</Text>
        <View style={styles.staffBadge}>
          <Ionicons name="people-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.staffCount}>{item.staff_ids.length}</Text>
        </View>
      </View>
    </Card>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="calendar-outline" size={64} color={Colors.gray300} />
      <Text style={styles.emptyTitle}>No appointments</Text>
      <Text style={styles.emptyText}>
        {filter === 'all'
          ? 'Schedule your first appointment to get started'
          : `No ${filter} appointments found`}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text
              style={[
                styles.filterText,
                filter === f.key && styles.filterTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Appointments List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={appointments}
          renderItem={renderItem}
          keyExtractor={item => item.appointment_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={renderEmpty}
          onEndReached={() => fetchAppointments(false)}
          onEndReachedThreshold={0.3}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab}>
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    gap: Spacing.sm,
  },

  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray100,
  },

  filterTabActive: {
    backgroundColor: Colors.primary,
  },

  filterText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },

  filterTextActive: {
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

  appointmentCard: {
    marginBottom: Spacing.md,
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },

  dateText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  timeText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },

  statusText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
  },

  servicesText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  priceText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.success,
  },

  staffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  staffCount: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
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
