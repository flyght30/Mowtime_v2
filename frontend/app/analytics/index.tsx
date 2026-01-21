/**
 * Analytics Dashboard Screen
 * Business metrics, charts, and performance insights
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LineChart } from 'react-native-chart-kit';
import { api } from '../../services/api';
import { Card } from '../../components/ui';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

const screenWidth = Dimensions.get('window').width;

type PeriodOption = 'today' | '7d' | '30d' | '90d' | 'this_month';

interface AnalyticsSummary {
  period: { start: string; end: string; label: string };
  today: { completed: number; remaining: number; revenue: number };
  revenue: { total: number; previous: number; change_percent: number };
  appointments: {
    total: number;
    completed: number;
    canceled: number;
    no_shows: number;
    scheduled: number;
    completed_change: number;
    canceled_change: number;
  };
  outstanding: { count: number; total: number };
  weather_rescheduled: number;
  new_clients: number;
}

interface RevenueData {
  period: { start: string; end: string };
  granularity: string;
  total: number;
  average: number;
  data_points: Array<{ date: string; label: string; revenue: number }>;
}

interface TopClient {
  rank: number;
  client_id: string;
  name: string;
  email: string;
  appointment_count: number;
  revenue: number;
  lifetime_value: number;
  status: string;
}

interface ServicePerformance {
  service_id: string;
  name: string;
  bookings: number;
  revenue: number;
  revenue_percent: number;
  avg_duration: number;
  avg_price: number;
}

interface StaffUtilization {
  staff_id: string;
  name: string;
  role: string;
  total_appointments: number;
  completed: number;
  canceled: number;
  no_shows: number;
  completion_rate: number;
  revenue_generated: number;
  hours_worked: number;
}

const PERIOD_OPTIONS: { label: string; value: PeriodOption }[] = [
  { label: 'Today', value: 'today' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
  { label: 'This Month', value: 'this_month' },
];

export default function AnalyticsScreen() {
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>('30d');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [topClients, setTopClients] = useState<TopClient[]>([]);
  const [services, setServices] = useState<ServicePerformance[]>([]);
  const [staff, setStaff] = useState<StaffUtilization[]>([]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const [summaryRes, revenueRes, clientsRes, servicesRes, staffRes] = await Promise.all([
        api.get(`/analytics/summary?period=${selectedPeriod}`),
        api.get(`/analytics/revenue?period=${selectedPeriod}`),
        api.get(`/analytics/clients?period=${selectedPeriod}&limit=5`),
        api.get(`/analytics/services?period=${selectedPeriod}`),
        api.get(`/analytics/staff?period=${selectedPeriod}`),
      ]);

      if (summaryRes.success && summaryRes.data?.data) {
        setSummary(summaryRes.data.data);
      }
      if (revenueRes.success && revenueRes.data?.data) {
        setRevenueData(revenueRes.data.data);
      }
      if (clientsRes.success && clientsRes.data?.data) {
        setTopClients(clientsRes.data.data.top_clients || []);
      }
      if (servicesRes.success && servicesRes.data?.data) {
        setServices(servicesRes.data.data.services || []);
      }
      if (staffRes.success && staffRes.data?.data) {
        setStaff(staffRes.data.data.staff || []);
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
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  const getChangeColor = (value: number) => {
    if (value > 0) return Colors.success;
    if (value < 0) return Colors.error;
    return Colors.textSecondary;
  };

  const chartConfig = {
    backgroundColor: Colors.white,
    backgroundGradientFrom: Colors.white,
    backgroundGradientTo: Colors.white,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
    style: {
      borderRadius: BorderRadius.lg,
    },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
      stroke: Colors.primary,
    },
    propsForBackgroundLines: {
      stroke: Colors.gray200,
      strokeDasharray: '',
    },
  };

  const getChartData = () => {
    if (!revenueData?.data_points?.length) {
      return {
        labels: [''],
        datasets: [{ data: [0] }],
      };
    }

    const data = revenueData.data_points.slice(-7);
    return {
      labels: data.map(d => d.label || ''),
      datasets: [
        {
          data: data.map(d => d.revenue || 0),
          color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
          strokeWidth: 2,
        },
      ],
    };
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
          <Text style={styles.title}>Analytics</Text>
          <View style={{ width: 40 }} />
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

        {/* Key Metrics */}
        <View style={styles.metricsGrid}>
          <Card style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Ionicons name="cash-outline" size={20} color={Colors.success} />
              <Text
                style={[styles.changeText, { color: getChangeColor(summary?.revenue?.change_percent || 0) }]}
              >
                {formatPercent(summary?.revenue?.change_percent || 0)}
              </Text>
            </View>
            <Text style={styles.metricValue}>{formatCurrency(summary?.revenue?.total || 0)}</Text>
            <Text style={styles.metricLabel}>Revenue</Text>
          </Card>

          <Card style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
              <Text
                style={[styles.changeText, { color: getChangeColor(summary?.appointments?.completed_change || 0) }]}
              >
                {formatPercent(summary?.appointments?.completed_change || 0)}
              </Text>
            </View>
            <Text style={styles.metricValue}>{summary?.appointments?.total || 0}</Text>
            <Text style={styles.metricLabel}>Appointments</Text>
          </Card>

          <Card style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Ionicons name="checkmark-circle-outline" size={20} color={Colors.info} />
            </View>
            <Text style={styles.metricValue}>
              {summary?.appointments?.total
                ? Math.round((summary.appointments.completed / summary.appointments.total) * 100)
                : 0}%
            </Text>
            <Text style={styles.metricLabel}>Completion Rate</Text>
          </Card>

          <Card style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Ionicons name="person-add-outline" size={20} color={Colors.warning} />
            </View>
            <Text style={styles.metricValue}>{summary?.new_clients || 0}</Text>
            <Text style={styles.metricLabel}>New Clients</Text>
          </Card>
        </View>

        {/* Revenue Chart */}
        <Card style={styles.chartCard}>
          <Text style={styles.sectionTitle}>Revenue Trend</Text>
          {revenueData?.data_points?.length ? (
            <LineChart
              data={getChartData()}
              width={screenWidth - Spacing.md * 4}
              height={200}
              chartConfig={chartConfig}
              bezier
              style={styles.chart}
              withInnerLines={false}
              withOuterLines={false}
              withVerticalLabels={true}
              withHorizontalLabels={true}
              yAxisLabel="$"
              yAxisSuffix=""
              formatYLabel={(value) => {
                const num = parseFloat(value);
                if (num >= 1000) return `${(num / 1000).toFixed(0)}k`;
                return value;
              }}
            />
          ) : (
            <View style={styles.emptyChart}>
              <Text style={styles.emptyText}>No revenue data available</Text>
            </View>
          )}
        </Card>

        {/* Outstanding Invoices */}
        <Card style={styles.alertCard}>
          <View style={styles.alertContent}>
            <View style={styles.alertIconContainer}>
              <Ionicons name="document-text-outline" size={24} color={Colors.warning} />
            </View>
            <View style={styles.alertInfo}>
              <Text style={styles.alertTitle}>Outstanding Invoices</Text>
              <Text style={styles.alertSubtitle}>
                {summary?.outstanding?.count || 0} invoices pending
              </Text>
            </View>
            <Text style={styles.alertAmount}>
              {formatCurrency(summary?.outstanding?.total || 0)}
            </Text>
          </View>
        </Card>

        {/* Top Clients */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Clients</Text>
          </View>
          {topClients.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No client data available</Text>
            </Card>
          ) : (
            topClients.map((client) => (
              <Card key={client.client_id} style={styles.listCard}>
                <View style={styles.listItem}>
                  <View style={styles.rankContainer}>
                    <Text style={styles.rankText}>{client.rank}</Text>
                  </View>
                  <View style={styles.listItemContent}>
                    <Text style={styles.listItemTitle}>{client.name}</Text>
                    <Text style={styles.listItemSubtitle}>
                      {client.appointment_count} appointments
                    </Text>
                  </View>
                  <Text style={styles.listItemValue}>
                    {formatCurrency(client.revenue)}
                  </Text>
                </View>
              </Card>
            ))
          )}
        </View>

        {/* Top Services */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Service Performance</Text>
          </View>
          {services.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No service data available</Text>
            </Card>
          ) : (
            services.map((service) => (
              <Card key={service.service_id} style={styles.listCard}>
                <View style={styles.serviceItem}>
                  <View style={styles.listItemContent}>
                    <Text style={styles.listItemTitle}>{service.name}</Text>
                    <Text style={styles.listItemSubtitle}>
                      {service.bookings} bookings | {service.revenue_percent.toFixed(0)}% of revenue
                    </Text>
                  </View>
                  <View style={styles.serviceStats}>
                    <Text style={styles.listItemValue}>
                      {formatCurrency(service.revenue)}
                    </Text>
                    <Text style={styles.serviceAvg}>
                      Avg: {formatCurrency(service.avg_price)}
                    </Text>
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>

        {/* Staff Utilization */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Staff Utilization</Text>
          </View>
          {staff.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No staff data available</Text>
            </Card>
          ) : (
            staff.map((member) => (
              <Card key={member.staff_id} style={styles.listCard}>
                <View style={styles.staffItem}>
                  <View style={styles.listItemContent}>
                    <Text style={styles.listItemTitle}>{member.name}</Text>
                    <Text style={styles.listItemSubtitle}>
                      {member.completed}/{member.total_appointments} completed | {member.hours_worked}h
                    </Text>
                  </View>
                  <View style={styles.staffStats}>
                    <View style={styles.utilizationBar}>
                      <View
                        style={[
                          styles.utilizationFill,
                          { width: `${Math.min(member.completion_rate, 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.utilizationText}>
                      {member.completion_rate.toFixed(0)}% completion
                    </Text>
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>

        {/* Average Ticket */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Average Ticket</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(
                  summary?.appointments?.completed
                    ? (summary.revenue.total / summary.appointments.completed)
                    : 0
                )}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Completed Jobs</Text>
              <Text style={styles.summaryValue}>
                {summary?.appointments?.completed || 0}
              </Text>
            </View>
          </View>
        </Card>
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

  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },

  metricCard: {
    width: '47%',
    padding: Spacing.md,
  },

  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },

  changeText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
  },

  metricValue: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },

  metricLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },

  chartCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },

  chart: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.lg,
  },

  emptyChart: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },

  alertCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.warningLight + '20',
    borderWidth: 1,
    borderColor: Colors.warning + '40',
  },

  alertContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  alertIconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.warning + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },

  alertInfo: {
    flex: 1,
  },

  alertTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  alertSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  alertAmount: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.warning,
  },

  section: {
    marginBottom: Spacing.md,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  emptyCard: {
    padding: Spacing.lg,
    alignItems: 'center',
  },

  emptyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },

  listCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },

  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  rankContainer: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },

  rankText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },

  listItemContent: {
    flex: 1,
  },

  listItemTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  listItemSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  listItemValue: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.success,
  },

  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  serviceStats: {
    alignItems: 'flex-end',
  },

  serviceAvg: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  staffItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  staffStats: {
    alignItems: 'flex-end',
    minWidth: 100,
  },

  utilizationBar: {
    width: 80,
    height: 6,
    backgroundColor: Colors.gray200,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },

  utilizationFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
  },

  utilizationText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },

  summaryCard: {
    padding: Spacing.lg,
    marginTop: Spacing.sm,
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },

  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },

  summaryLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },

  summaryValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
});
