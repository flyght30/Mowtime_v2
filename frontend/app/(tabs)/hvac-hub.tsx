/**
 * HVAC Hub Tab
 * Quick access point to HVAC features from the main tab bar
 * Shows summary and links to full HVAC dashboard
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../../constants/theme';
import { hvacApi } from '../../services/hvacApi';

interface HVACStats {
  pendingQuotes: number;
  pendingQuotesValue: number;
  maintenanceDue: number;
  lowStockItems: number;
}

export default function HVACHubScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<HVACStats>({
    pendingQuotes: 0,
    pendingQuotesValue: 0,
    maintenanceDue: 0,
    lowStockItems: 0,
  });

  const fetchStats = useCallback(async () => {
    try {
      const [quotesRes, maintenanceRes, inventoryRes] = await Promise.all([
        hvacApi.getQuotes({ status: 'draft' }),
        hvacApi.getMaintenanceDue(30),
        hvacApi.getInventory({ low_stock: true }),
      ]);

      const newStats: HVACStats = {
        pendingQuotes: 0,
        pendingQuotesValue: 0,
        maintenanceDue: 0,
        lowStockItems: 0,
      };

      if (quotesRes.success && quotesRes.data?.quotes) {
        newStats.pendingQuotes = quotesRes.data.quotes.length;
        newStats.pendingQuotesValue = quotesRes.data.quotes.reduce(
          (sum, q) => sum + q.total,
          0
        );
      }

      if (maintenanceRes.success && maintenanceRes.data) {
        newStats.maintenanceDue = maintenanceRes.data.due_count || 0;
      }

      if (inventoryRes.success && inventoryRes.data) {
        newStats.lowStockItems = inventoryRes.data.count || 0;
      }

      setStats(newStats);
    } catch (error) {
      console.error('Failed to fetch HVAC stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStats();
  }, [fetchStats]);

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
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading HVAC...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="thermometer" size={32} color="#2196F3" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>HVAC Services</Text>
            <Text style={styles.headerSubtitle}>
              Heating, Ventilation & Air Conditioning
            </Text>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/hvac/quotes')}
          >
            <Ionicons name="document-text" size={24} color="#2196F3" />
            <Text style={styles.statValue}>{stats.pendingQuotes}</Text>
            <Text style={styles.statLabel}>Pending Quotes</Text>
            <Text style={styles.statSubvalue}>
              {formatCurrency(stats.pendingQuotesValue)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/hvac/maintenance')}
          >
            <Ionicons name="calendar" size={24} color="#FF9800" />
            <Text style={styles.statValue}>{stats.maintenanceDue}</Text>
            <Text style={styles.statLabel}>Maintenance Due</Text>
            <Text style={styles.statSubvalue}>Next 30 days</Text>
          </TouchableOpacity>
        </View>

        {/* Alert Card */}
        {stats.lowStockItems > 0 && (
          <TouchableOpacity
            style={styles.alertCard}
            onPress={() => router.push('/hvac/inventory')}
          >
            <View style={styles.alertIcon}>
              <Ionicons name="alert-circle" size={24} color={Colors.error} />
            </View>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>Low Stock Alert</Text>
              <Text style={styles.alertText}>
                {stats.lowStockItems} items need to be reordered
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
          </TouchableOpacity>
        )}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/hvac/calculate')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="calculator-outline" size={28} color="#2196F3" />
            </View>
            <Text style={styles.actionText}>Load Calculator</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/hvac/quotes')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="document-text-outline" size={28} color="#4CAF50" />
            </View>
            <Text style={styles.actionText}>Quotes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/hvac/equipment')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="construct-outline" size={28} color="#FF9800" />
            </View>
            <Text style={styles.actionText}>Equipment</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/hvac/inventory')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F3E5F5' }]}>
              <Ionicons name="cube-outline" size={28} color="#9C27B0" />
            </View>
            <Text style={styles.actionText}>Inventory</Text>
          </TouchableOpacity>
        </View>

        {/* Full Dashboard Link */}
        <TouchableOpacity
          style={styles.fullDashboardButton}
          onPress={() => router.push('/hvac')}
        >
          <Text style={styles.fullDashboardText}>Open Full HVAC Dashboard</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.primary} />
        </TouchableOpacity>
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
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
  },
  content: {
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadows.sm,
  },
  statValue: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  statLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statSubvalue: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.error,
  },
  alertText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray700,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  actionCard: {
    width: '47%',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadows.sm,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  actionText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    textAlign: 'center',
  },
  fullDashboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  fullDashboardText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
    marginRight: Spacing.sm,
  },
});
