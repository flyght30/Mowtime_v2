/**
 * HVAC Dashboard
 * Main overview screen for HVAC vertical
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../../constants/theme';
import { hvacApi, Quote, MaintenanceContract } from '../../services/hvacApi';

interface DashboardStats {
  pendingQuotes: number;
  pendingQuotesValue: number;
  maintenanceDue: number;
  recentCalcs: number;
  lowStockItems: number;
}

export default function HVACDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    pendingQuotes: 0,
    pendingQuotesValue: 0,
    maintenanceDue: 0,
    recentCalcs: 0,
    lowStockItems: 0,
  });
  const [recentQuotes, setRecentQuotes] = useState<Quote[]>([]);
  const [dueMaintenance, setDueMaintenance] = useState<MaintenanceContract[]>([]);

  const fetchDashboardData = useCallback(async () => {
    try {
      // Fetch all data in parallel
      const [quotesRes, maintenanceRes, inventoryRes, calcsRes] = await Promise.all([
        hvacApi.getQuotes({ status: 'draft' }),
        hvacApi.getMaintenanceDue(30),
        hvacApi.getInventory({ low_stock: true }),
        hvacApi.getLoadCalculations(),
      ]);

      // Process quotes
      if (quotesRes.success && quotesRes.data?.quotes) {
        const pending = quotesRes.data.quotes;
        setRecentQuotes(pending.slice(0, 5));
        setStats(prev => ({
          ...prev,
          pendingQuotes: pending.length,
          pendingQuotesValue: pending.reduce((sum, q) => sum + q.total, 0),
        }));
      }

      // Process maintenance
      if (maintenanceRes.success && maintenanceRes.data) {
        setDueMaintenance(maintenanceRes.data.contracts?.slice(0, 5) || []);
        setStats(prev => ({
          ...prev,
          maintenanceDue: maintenanceRes.data?.due_count || 0,
        }));
      }

      // Process inventory
      if (inventoryRes.success && inventoryRes.data) {
        setStats(prev => ({
          ...prev,
          lowStockItems: inventoryRes.data?.count || 0,
        }));
      }

      // Process calculations
      if (calcsRes.success && calcsRes.data?.calculations) {
        setStats(prev => ({
          ...prev,
          recentCalcs: calcsRes.data?.calculations?.length || 0,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboardData();
  }, [fetchDashboardData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading HVAC Dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => router.push('/hvac/calculate')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#E3F2FD' }]}>
            <Ionicons name="calculator-outline" size={24} color="#2196F3" />
          </View>
          <Text style={styles.quickActionText}>Load Calc</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => router.push('/hvac/quotes')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#E8F5E9' }]}>
            <Ionicons name="document-text-outline" size={24} color="#4CAF50" />
          </View>
          <Text style={styles.quickActionText}>Quotes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => router.push('/hvac/equipment')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#FFF3E0' }]}>
            <Ionicons name="construct-outline" size={24} color="#FF9800" />
          </View>
          <Text style={styles.quickActionText}>Equipment</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => router.push('/hvac/inventory')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#F3E5F5' }]}>
            <Ionicons name="cube-outline" size={24} color="#9C27B0" />
          </View>
          <Text style={styles.quickActionText}>Inventory</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsGrid}>
        <TouchableOpacity
          style={styles.statCard}
          onPress={() => router.push('/hvac/quotes')}
        >
          <View style={styles.statHeader}>
            <Ionicons name="document-text" size={20} color="#2196F3" />
            <Text style={styles.statLabel}>Pending Quotes</Text>
          </View>
          <Text style={styles.statValue}>{stats.pendingQuotes}</Text>
          <Text style={styles.statSubtext}>
            {formatCurrency(stats.pendingQuotesValue)} total
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statCard}
          onPress={() => router.push('/hvac/maintenance')}
        >
          <View style={styles.statHeader}>
            <Ionicons name="calendar" size={20} color="#FF9800" />
            <Text style={styles.statLabel}>Maintenance Due</Text>
          </View>
          <Text style={styles.statValue}>{stats.maintenanceDue}</Text>
          <Text style={styles.statSubtext}>Next 30 days</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statCard}
          onPress={() => router.push('/hvac/inventory')}
        >
          <View style={styles.statHeader}>
            <Ionicons name="alert-circle" size={20} color="#F44336" />
            <Text style={styles.statLabel}>Low Stock</Text>
          </View>
          <Text style={[styles.statValue, stats.lowStockItems > 0 && styles.alertValue]}>
            {stats.lowStockItems}
          </Text>
          <Text style={styles.statSubtext}>Items to reorder</Text>
        </TouchableOpacity>

        <View style={styles.statCard}>
          <View style={styles.statHeader}>
            <Ionicons name="calculator" size={20} color="#4CAF50" />
            <Text style={styles.statLabel}>Load Calcs</Text>
          </View>
          <Text style={styles.statValue}>{stats.recentCalcs}</Text>
          <Text style={styles.statSubtext}>Total calculations</Text>
        </View>
      </View>

      {/* Recent Quotes */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Quotes</Text>
          <TouchableOpacity onPress={() => router.push('/hvac/quotes')}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {recentQuotes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={32} color={Colors.gray400} />
            <Text style={styles.emptyText}>No pending quotes</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/hvac/calculate')}
            >
              <Text style={styles.emptyButtonText}>Create New Quote</Text>
            </TouchableOpacity>
          </View>
        ) : (
          recentQuotes.map((quote) => (
            <TouchableOpacity
              key={quote.quote_id}
              style={styles.listItem}
              onPress={() => router.push(`/hvac/quotes/${quote.quote_id}`)}
            >
              <View style={styles.listItemContent}>
                <Text style={styles.listItemTitle}>Quote #{quote.quote_id.slice(-6)}</Text>
                <Text style={styles.listItemSubtitle}>
                  {quote.job_type.replace(/_/g, ' ')} - {quote.tier.toUpperCase()}
                </Text>
              </View>
              <View style={styles.listItemRight}>
                <Text style={styles.listItemAmount}>{formatCurrency(quote.total)}</Text>
                <View style={[styles.statusBadge, styles[`status_${quote.status}`]]}>
                  <Text style={styles.statusText}>{quote.status}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Maintenance Due */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Maintenance Due Soon</Text>
          <TouchableOpacity onPress={() => router.push('/hvac/maintenance')}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {dueMaintenance.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={32} color={Colors.gray400} />
            <Text style={styles.emptyText}>No maintenance due</Text>
          </View>
        ) : (
          dueMaintenance.map((contract) => (
            <TouchableOpacity
              key={contract.contract_id}
              style={styles.listItem}
              onPress={() => router.push(`/hvac/maintenance/${contract.contract_id}`)}
            >
              <View style={styles.listItemContent}>
                <Text style={styles.listItemTitle}>{contract.plan_name}</Text>
                <Text style={styles.listItemSubtitle}>
                  Due: {contract.next_service_date?.split('T')[0] || 'Not scheduled'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
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
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  quickActionButton: {
    alignItems: 'center',
    flex: 1,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  quickActionText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.xs,
    marginBottom: Spacing.lg,
  },
  statCard: {
    width: '50%',
    padding: Spacing.xs,
  },
  statCardInner: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  statLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginLeft: Spacing.xs,
  },
  statValue: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
    backgroundColor: Colors.surface,
    marginTop: -Spacing.md,
  },
  alertValue: {
    color: '#F44336',
  },
  statSubtext: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  seeAllText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    ...Shadows.sm,
  },
  emptyText: {
    marginTop: Spacing.sm,
    color: Colors.textSecondary,
    fontSize: Typography.fontSize.sm,
  },
  emptyButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
  },
  emptyButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
  },
  listItem: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    ...Shadows.sm,
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  listItemSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  listItemRight: {
    alignItems: 'flex-end',
  },
  listItemAmount: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginTop: 4,
  },
  status_draft: {
    backgroundColor: '#E3F2FD',
  },
  status_sent: {
    backgroundColor: '#FFF3E0',
  },
  status_accepted: {
    backgroundColor: '#E8F5E9',
  },
  status_rejected: {
    backgroundColor: '#FFEBEE',
  },
  statusText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    textTransform: 'capitalize',
  },
});
