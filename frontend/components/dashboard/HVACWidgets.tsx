/**
 * HVAC Dashboard Widgets
 * Widgets specific to the HVAC vertical
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../../constants/theme';
import { hvacApi } from '../../services/hvacApi';

interface HVACStats {
  pendingQuotes: number;
  pendingQuotesValue: number;
  maintenanceDue: number;
  loadCalcsToday: number;
  lowStockItems: number;
}

export function HVACQuickStats() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<HVACStats>({
    pendingQuotes: 0,
    pendingQuotesValue: 0,
    maintenanceDue: 0,
    loadCalcsToday: 0,
    lowStockItems: 0,
  });

  const fetchStats = useCallback(async () => {
    try {
      const [quotesRes, maintenanceRes, calcsRes, inventoryRes] = await Promise.all([
        hvacApi.getQuotes({ status: 'draft' }),
        hvacApi.getMaintenanceDue(7),
        hvacApi.getLoadCalculations(),
        hvacApi.getInventory({ low_stock: true }),
      ]);

      setStats({
        pendingQuotes: quotesRes.data?.quotes?.length || 0,
        pendingQuotesValue: quotesRes.data?.quotes?.reduce((sum, q) => sum + q.total, 0) || 0,
        maintenanceDue: maintenanceRes.data?.due_count || 0,
        loadCalcsToday: calcsRes.data?.calculations?.length || 0,
        lowStockItems: inventoryRes.data?.count || 0,
      });
    } catch (error) {
      console.error('Failed to fetch HVAC stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="thermometer" size={20} color="#2196F3" />
        </View>
        <Text style={styles.headerTitle}>HVAC Overview</Text>
        <TouchableOpacity onPress={() => router.push('/hvac')}>
          <Text style={styles.seeAllText}>See all</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        <TouchableOpacity
          style={styles.statItem}
          onPress={() => router.push('/hvac/quotes')}
        >
          <Ionicons name="document-text" size={20} color="#2196F3" />
          <Text style={styles.statValue}>{stats.pendingQuotes}</Text>
          <Text style={styles.statLabel}>Pending Quotes</Text>
          {stats.pendingQuotesValue > 0 && (
            <Text style={styles.statSubvalue}>
              {formatCurrency(stats.pendingQuotesValue)}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statItem}
          onPress={() => router.push('/hvac/maintenance')}
        >
          <Ionicons name="calendar" size={20} color="#FF9800" />
          <Text style={[styles.statValue, stats.maintenanceDue > 0 && styles.alertValue]}>
            {stats.maintenanceDue}
          </Text>
          <Text style={styles.statLabel}>Due This Week</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statItem}
          onPress={() => router.push('/hvac/calculate')}
        >
          <Ionicons name="calculator" size={20} color="#4CAF50" />
          <Text style={styles.statValue}>{stats.loadCalcsToday}</Text>
          <Text style={styles.statLabel}>Load Calcs</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statItem}
          onPress={() => router.push('/hvac/inventory')}
        >
          <Ionicons name="cube" size={20} color={stats.lowStockItems > 0 ? '#F44336' : '#9C27B0'} />
          <Text style={[styles.statValue, stats.lowStockItems > 0 && styles.alertValue]}>
            {stats.lowStockItems}
          </Text>
          <Text style={styles.statLabel}>Low Stock</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function HVACServiceCallsWidget() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [serviceCalls, setServiceCalls] = useState<any[]>([]);

  useEffect(() => {
    // Fetch today's HVAC service calls
    const fetchServiceCalls = async () => {
      try {
        // This would be a real API call
        // For now, simulate empty data
        setServiceCalls([]);
      } catch (error) {
        console.error('Failed to fetch service calls:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchServiceCalls();
  }, []);

  if (loading) {
    return (
      <View style={styles.widgetContainer}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.widgetContainer}>
      <View style={styles.widgetHeader}>
        <Ionicons name="today" size={18} color={Colors.primary} />
        <Text style={styles.widgetTitle}>Today's Service Calls</Text>
      </View>

      {serviceCalls.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={32} color={Colors.gray300} />
          <Text style={styles.emptyText}>No service calls scheduled</Text>
        </View>
      ) : (
        serviceCalls.map((call, index) => (
          <TouchableOpacity key={index} style={styles.serviceCallItem}>
            <Text style={styles.serviceCallTime}>{call.time}</Text>
            <Text style={styles.serviceCallClient}>{call.clientName}</Text>
            <Text style={styles.serviceCallType}>{call.type}</Text>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  loadingContainer: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  seeAllText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statItem: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  statValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  alertValue: {
    color: Colors.error,
  },
  statLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  statSubvalue: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  widgetContainer: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  widgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  widgetTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginLeft: Spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  serviceCallItem: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  serviceCallTime: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  serviceCallClient: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  serviceCallType: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
});
