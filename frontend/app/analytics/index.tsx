/**
 * Analytics Dashboard Screen
 * Business metrics, charts, and performance insights
 * Phase 9 - Comprehensive reporting and analytics
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import KPICard from '../../components/analytics/KPICard';
import RevenueChart from '../../components/analytics/RevenueChart';
import TechTable from '../../components/analytics/TechTable';
import JobTypeChart from '../../components/analytics/JobTypeChart';

type PeriodOption = 'day' | 'week' | 'month' | 'quarter';

interface DashboardMetrics {
  period: string;
  jobs: {
    today: number;
    period_total: number;
    completed: number;
    scheduled: number;
    in_progress: number;
  };
  revenue: {
    today: number;
    period_total: number;
    outstanding: number;
    average_job: number;
  };
  pipeline: {
    scheduled_value: number;
    pending_quotes: number;
    pending_value: number;
  };
  performance: {
    completion_rate: number;
    on_time_rate: number;
    avg_rating: number;
    repeat_customer_rate: number;
  };
  trends: {
    revenue_change: number;
    jobs_change: number;
  };
}

interface RevenueDataPoint {
  date: string;
  label: string;
  value: number;
  jobs: number;
}

interface TechPerformance {
  technician_id: string;
  name: string;
  jobs_completed: number;
  revenue: number;
  on_time_percent: number;
  avg_rating: number;
  efficiency_score: number;
  hours_worked: number;
}

interface JobTypeData {
  type: string;
  count: number;
  revenue: number;
  avg_value: number;
  avg_margin: number;
}

const PERIOD_OPTIONS: { label: string; value: PeriodOption }[] = [
  { label: 'Today', value: 'day' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Quarter', value: 'quarter' },
];

export default function AnalyticsScreen() {
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>('week');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([]);
  const [techData, setTechData] = useState<TechPerformance[]>([]);
  const [jobTypeData, setJobTypeData] = useState<Record<string, JobTypeData>>({});

  const fetchAnalytics = useCallback(async () => {
    try {
      const [dashboardRes, revenueRes, techRes, jobTypeRes] = await Promise.all([
        api.get(`/analytics/dashboard?period=${selectedPeriod}`),
        api.get(`/analytics/revenue/trend?period=${selectedPeriod}&granularity=${selectedPeriod === 'day' ? 'hour' : 'day'}`),
        api.get(`/analytics/technicians?period=${selectedPeriod}`),
        api.get(`/analytics/jobs/by-type?period=${selectedPeriod}`),
      ]);

      if (dashboardRes.success && dashboardRes.data?.data) {
        setDashboard(dashboardRes.data.data);
      }
      if (revenueRes.success && revenueRes.data?.data) {
        setRevenueData(revenueRes.data.data.data_points || []);
      }
      if (techRes.success && techRes.data?.data) {
        setTechData(techRes.data.data.technicians || []);
      }
      if (jobTypeRes.success && jobTypeRes.data?.data) {
        setJobTypeData(jobTypeRes.data.data.by_type || {});
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    setIsLoading(true);
    fetchAnalytics();
  }, [fetchAnalytics]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`;
    }
    return `$${amount.toFixed(0)}`;
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Analytics Dashboard</Text>
          <TouchableOpacity
            style={styles.reportsButton}
            onPress={() => router.push('/reports')}
          >
            <Ionicons name="document-text" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Period Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.periodContainer}
          contentContainerStyle={styles.periodContent}
        >
          {PERIOD_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.periodButton,
                selectedPeriod === option.value && styles.periodButtonActive,
              ]}
              onPress={() => setSelectedPeriod(option.value)}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === option.value && styles.periodButtonTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* KPI Cards Grid */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiRow}>
            <KPICard
              title="Today's Jobs"
              value={dashboard?.jobs?.today || 0}
              subtitle={`${dashboard?.jobs?.completed || 0} completed`}
              icon="briefcase"
              variant="primary"
            />
            <KPICard
              title="This Week"
              value={dashboard?.jobs?.period_total || 0}
              subtitle={`${dashboard?.jobs?.scheduled || 0} scheduled`}
              trend={
                dashboard?.trends?.jobs_change !== undefined
                  ? {
                      value: dashboard.trends.jobs_change,
                      direction: dashboard.trends.jobs_change > 0 ? 'up' : dashboard.trends.jobs_change < 0 ? 'down' : 'neutral',
                    }
                  : undefined
              }
              icon="calendar"
            />
          </View>
          <View style={styles.kpiRow}>
            <KPICard
              title="Pipeline"
              value={formatCurrency(dashboard?.pipeline?.scheduled_value || 0)}
              subtitle={`${dashboard?.pipeline?.pending_quotes || 0} pending quotes`}
              icon="trending-up"
              variant="warning"
            />
            <KPICard
              title="Revenue"
              value={formatCurrency(dashboard?.revenue?.period_total || 0)}
              subtitle={`Avg ${formatCurrency(dashboard?.revenue?.average_job || 0)}/job`}
              trend={
                dashboard?.trends?.revenue_change !== undefined
                  ? {
                      value: dashboard.trends.revenue_change,
                      direction: dashboard.trends.revenue_change > 0 ? 'up' : dashboard.trends.revenue_change < 0 ? 'down' : 'neutral',
                    }
                  : undefined
              }
              icon="cash"
              variant="success"
            />
          </View>
        </View>

        {/* Performance Metrics */}
        <View style={styles.performanceRow}>
          <View style={styles.performanceCard}>
            <Text style={styles.performanceValue}>
              {(dashboard?.performance?.completion_rate || 0).toFixed(0)}%
            </Text>
            <Text style={styles.performanceLabel}>Completion</Text>
          </View>
          <View style={styles.performanceDivider} />
          <View style={styles.performanceCard}>
            <Text style={styles.performanceValue}>
              {(dashboard?.performance?.on_time_rate || 0).toFixed(0)}%
            </Text>
            <Text style={styles.performanceLabel}>On-Time</Text>
          </View>
          <View style={styles.performanceDivider} />
          <View style={styles.performanceCard}>
            <Text style={styles.performanceValue}>
              {(dashboard?.performance?.avg_rating || 0).toFixed(1)}
            </Text>
            <Text style={styles.performanceLabel}>Avg Rating</Text>
          </View>
          <View style={styles.performanceDivider} />
          <View style={styles.performanceCard}>
            <Text style={styles.performanceValue}>
              {(dashboard?.performance?.repeat_customer_rate || 0).toFixed(0)}%
            </Text>
            <Text style={styles.performanceLabel}>Repeat</Text>
          </View>
        </View>

        {/* Revenue Trend Chart */}
        <RevenueChart
          data={revenueData}
          title="Revenue Trend"
          showLabels={selectedPeriod !== 'quarter'}
        />

        {/* Technician Performance Table */}
        <TechTable
          data={techData}
          title="Technician Performance"
        />

        {/* Job Type Breakdown */}
        <JobTypeChart
          data={jobTypeData}
          title="Jobs by Type"
          showRevenue={true}
        />

        {/* Quick Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/reports')}
          >
            <Ionicons name="download-outline" size={20} color={Colors.white} />
            <Text style={styles.actionButtonText}>Export Reports</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() => router.push('/reports?tab=scheduled')}
          >
            <Ionicons name="time-outline" size={20} color={Colors.primary} />
            <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>
              Scheduled Reports
            </Text>
          </TouchableOpacity>
        </View>
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

  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },

  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
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

  reportsButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },

  periodContainer: {
    marginBottom: Spacing.md,
  },

  periodContent: {
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },

  periodButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  periodButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },

  periodButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },

  periodButtonTextActive: {
    color: Colors.white,
  },

  kpiGrid: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },

  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },

  performanceRow: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },

  performanceCard: {
    flex: 1,
    alignItems: 'center',
  },

  performanceDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.sm,
  },

  performanceValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },

  performanceLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  actionsContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },

  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },

  actionButtonSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary,
  },

  actionButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.white,
  },

  actionButtonTextSecondary: {
    color: Colors.primary,
  },
});
