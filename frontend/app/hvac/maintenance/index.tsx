/**
 * HVAC Maintenance Contracts List
 * View and manage maintenance contracts
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../../../constants/theme';
import { hvacApi, MaintenanceContract } from '../../../services/hvacApi';

type StatusFilter = 'all' | 'active' | 'expired' | 'cancelled';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: '#E8F5E9', text: '#388E3C' },
  expired: { bg: '#ECEFF1', text: '#546E7A' },
  cancelled: { bg: '#FFEBEE', text: '#D32F2F' },
};

export default function MaintenanceContractsList() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [contracts, setContracts] = useState<MaintenanceContract[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    dueThisMonth: 0,
    revenue: 0,
  });

  const fetchContracts = useCallback(async () => {
    try {
      const status = statusFilter !== 'all' ? statusFilter : undefined;
      const res = await hvacApi.getMaintenanceContracts(status);
      if (res.success && res.data) {
        setContracts(res.data.contracts);

        // Calculate stats
        const allContracts = res.data.contracts;
        const now = new Date();
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        setStats({
          total: allContracts.length,
          active: allContracts.filter((c) => c.status === 'active').length,
          dueThisMonth: allContracts.filter((c) => {
            if (!c.next_service_date) return false;
            const serviceDate = new Date(c.next_service_date);
            return serviceDate >= now && serviceDate <= thirtyDaysFromNow;
          }).length,
          revenue: allContracts
            .filter((c) => c.status === 'active')
            .reduce((sum, c) => sum + c.price, 0),
        });
      }
    } catch (error) {
      console.error('Failed to fetch contracts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchContracts();
  }, [fetchContracts]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Not scheduled';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysUntilService = (dateString: string | undefined) => {
    if (!dateString) return null;
    const serviceDate = new Date(dateString);
    const now = new Date();
    const diffTime = serviceDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const renderContractItem = ({ item }: { item: MaintenanceContract }) => {
    const statusColor = STATUS_COLORS[item.status] || STATUS_COLORS.active;
    const daysUntil = getDaysUntilService(item.next_service_date);
    const isOverdue = daysUntil !== null && daysUntil < 0;
    const isDueSoon = daysUntil !== null && daysUntil >= 0 && daysUntil <= 7;

    return (
      <TouchableOpacity
        style={styles.contractCard}
        onPress={() => router.push(`/hvac/maintenance/${item.contract_id}`)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.planInfo}>
            <Text style={styles.planName}>{item.plan_name}</Text>
            <Text style={styles.planType}>{item.plan_type}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.statusText, { color: statusColor.text }]}>
              {item.status}
            </Text>
          </View>
        </View>

        <View style={styles.serviceInfo}>
          <View style={styles.serviceRow}>
            <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.serviceLabel}>Next Service:</Text>
            <Text
              style={[
                styles.serviceDate,
                isOverdue && styles.overdue,
                isDueSoon && styles.dueSoon,
              ]}
            >
              {formatDate(item.next_service_date)}
              {daysUntil !== null && (
                <Text>
                  {isOverdue
                    ? ` (${Math.abs(daysUntil)} days overdue)`
                    : daysUntil === 0
                    ? ' (Today)'
                    : ` (${daysUntil} days)`}
                </Text>
              )}
            </Text>
          </View>

          <View style={styles.serviceRow}>
            <Ionicons name="repeat-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.serviceLabel}>Visits:</Text>
            <Text style={styles.serviceValue}>
              {item.visits_completed} / {item.visits_per_year} per year
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.priceSection}>
            <Text style={styles.priceLabel}>Annual</Text>
            <Text style={styles.priceValue}>{formatCurrency(item.price)}</Text>
          </View>

          <View style={styles.featuresSection}>
            {item.includes_parts && (
              <View style={styles.featureBadge}>
                <Ionicons name="construct" size={12} color={Colors.primary} />
                <Text style={styles.featureText}>Parts</Text>
              </View>
            )}
            {item.includes_refrigerant && (
              <View style={styles.featureBadge}>
                <Ionicons name="snow" size={12} color={Colors.info} />
                <Text style={styles.featureText}>Refrigerant</Text>
              </View>
            )}
            {item.priority_service && (
              <View style={styles.featureBadge}>
                <Ionicons name="flash" size={12} color={Colors.warning} />
                <Text style={styles.featureText}>Priority</Text>
              </View>
            )}
          </View>

          <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading contracts...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Summary */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.active}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, stats.dueThisMonth > 0 && { color: Colors.warning }]}>
            {stats.dueThisMonth}
          </Text>
          <Text style={styles.statLabel}>Due Soon</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: Colors.success }]}>
            {formatCurrency(stats.revenue)}
          </Text>
          <Text style={styles.statLabel}>Annual Rev</Text>
        </View>
      </View>

      {/* Status Filter */}
      <View style={styles.filterContainer}>
        {STATUS_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.value}
            style={[
              styles.filterChip,
              statusFilter === filter.value && styles.filterChipActive,
            ]}
            onPress={() => setStatusFilter(filter.value)}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === filter.value && styles.filterChipTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Contract List */}
      <FlatList
        data={contracts}
        keyExtractor={(item) => item.contract_id}
        renderItem={renderContractItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={Colors.gray400} />
            <Text style={styles.emptyText}>No maintenance contracts</Text>
            <Text style={styles.emptySubtext}>
              Create contracts to manage recurring service
            </Text>
          </View>
        }
      />
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
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  statLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  filterContainer: {
    flexDirection: 'row',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.full,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
  },
  filterChipText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray600,
  },
  filterChipTextActive: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
  },
  listContent: {
    padding: Spacing.md,
  },
  contractCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  planType: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    textTransform: 'capitalize',
  },
  serviceInfo: {
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  serviceLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginLeft: Spacing.xs,
    marginRight: Spacing.xs,
  },
  serviceDate: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  serviceValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  overdue: {
    color: Colors.error,
  },
  dueSoon: {
    color: Colors.warning,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  priceSection: {
    marginRight: Spacing.lg,
  },
  priceLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  priceValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  featuresSection: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  featureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  featureText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginLeft: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
  },
  emptyText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
});
