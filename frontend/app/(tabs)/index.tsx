/**
 * Dashboard Screen
 * Main overview with today's appointments and quick stats
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import { Card } from '../../components/ui';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

interface Stats {
  clients: number;
  staff: number;
  services: number;
  appointments: {
    scheduled: number;
    completed: number;
  };
}

interface Appointment {
  appointment_id: string;
  client_id: string;
  scheduled_date: string;
  scheduled_time: string;
  end_time: string;
  status: string;
  services: Array<{ service_name: string }>;
  total_price: number;
}

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<Stats | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch stats and today's appointments in parallel
      const [statsRes, appointmentsRes] = await Promise.all([
        api.get('/businesses/me/stats'),
        api.get('/appointments/today'),
      ]);

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }

      if (appointmentsRes.success && appointmentsRes.data) {
        setTodayAppointments(appointmentsRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
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
      case 'scheduled':
        return Colors.primary;
      case 'confirmed':
        return Colors.success;
      case 'in_progress':
        return Colors.warning;
      case 'completed':
        return Colors.success;
      case 'canceled':
        return Colors.error;
      default:
        return Colors.gray500;
    }
  };

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
          <View>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.userName}>{user?.first_name || 'User'}</Text>
          </View>
          <TouchableOpacity style={styles.notificationBtn}>
            <Ionicons name="notifications-outline" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          <Card style={styles.statCard} onPress={() => router.push('/(tabs)/clients')}>
            <Ionicons name="people" size={24} color={Colors.primary} />
            <Text style={styles.statValue}>{stats?.clients || 0}</Text>
            <Text style={styles.statLabel}>Clients</Text>
          </Card>

          <Card style={styles.statCard} onPress={() => router.push('/(tabs)/appointments')}>
            <Ionicons name="calendar" size={24} color={Colors.success} />
            <Text style={styles.statValue}>{stats?.appointments?.scheduled || 0}</Text>
            <Text style={styles.statLabel}>Scheduled</Text>
          </Card>

          <Card style={styles.statCard}>
            <Ionicons name="construct" size={24} color={Colors.warning} />
            <Text style={styles.statValue}>{stats?.services || 0}</Text>
            <Text style={styles.statLabel}>Services</Text>
          </Card>

          <Card style={styles.statCard}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.info} />
            <Text style={styles.statValue}>{stats?.appointments?.completed || 0}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </Card>
        </View>

        {/* Today's Appointments */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today's Appointments</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/appointments')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          {todayAppointments.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={48} color={Colors.gray300} />
              <Text style={styles.emptyText}>No appointments today</Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push('/(tabs)/appointments')}
              >
                <Text style={styles.emptyButtonText}>Schedule one</Text>
              </TouchableOpacity>
            </Card>
          ) : (
            todayAppointments.map((apt) => (
              <Card key={apt.appointment_id} style={styles.appointmentCard}>
                <View style={styles.appointmentHeader}>
                  <View style={styles.appointmentTime}>
                    <Text style={styles.timeText}>
                      {formatTime(apt.scheduled_time)}
                    </Text>
                    <Text style={styles.timeDivider}>-</Text>
                    <Text style={styles.timeText}>
                      {formatTime(apt.end_time)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(apt.status) + '20' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: getStatusColor(apt.status) },
                      ]}
                    >
                      {apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.serviceName}>
                  {apt.services.map((s) => s.service_name).join(', ')}
                </Text>

                <View style={styles.appointmentFooter}>
                  <Text style={styles.priceText}>${apt.total_price.toFixed(2)}</Text>
                </View>
              </Card>
            ))
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/appointment/create')}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.primary + '20' }]}>
                <Ionicons name="add" size={24} color={Colors.primary} />
              </View>
              <Text style={styles.actionText}>New Appointment</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/client/create')}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.success + '20' }]}>
                <Ionicons name="person-add" size={24} color={Colors.success} />
              </View>
              <Text style={styles.actionText}>Add Client</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/routes')}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.warning + '20' }]}>
                <Ionicons name="navigate" size={24} color={Colors.warning} />
              </View>
              <Text style={styles.actionText}>Daily Route</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/analytics')}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.info + '20' }]}>
                <Ionicons name="bar-chart" size={24} color={Colors.info} />
              </View>
              <Text style={styles.actionText}>View Reports</Text>
            </TouchableOpacity>
          </View>
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

  scrollContent: {
    padding: Spacing.md,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },

  greeting: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },

  userName: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },

  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },

  statCard: {
    width: '47%',
    alignItems: 'center',
    padding: Spacing.md,
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
    marginTop: Spacing.xs,
  },

  section: {
    marginBottom: Spacing.lg,
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

  seeAll: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },

  emptyCard: {
    alignItems: 'center',
    padding: Spacing.xl,
  },

  emptyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },

  emptyButton: {
    marginTop: Spacing.md,
  },

  emptyButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },

  appointmentCard: {
    marginBottom: Spacing.md,
  },

  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },

  appointmentTime: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  timeText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  timeDivider: {
    marginHorizontal: Spacing.xs,
    color: Colors.textSecondary,
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

  serviceName: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },

  appointmentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  priceText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.success,
  },

  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },

  actionButton: {
    width: '47%',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },

  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },

  actionText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
    textAlign: 'center',
  },
});
