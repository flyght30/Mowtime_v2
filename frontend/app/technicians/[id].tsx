/**
 * Technician Detail Page
 * View and manage individual technician
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { techniciansApi, Technician, TechStatus, dispatchApi, RouteStop } from '../../services/dispatchApi';

const STATUS_CONFIG: Record<TechStatus, { color: string; bg: string; label: string; icon: string }> = {
  available: { color: Colors.success, bg: '#D1FAE5', label: 'Available', icon: 'checkmark-circle' },
  assigned: { color: Colors.info, bg: '#DBEAFE', label: 'Assigned', icon: 'clipboard' },
  enroute: { color: Colors.warning, bg: '#FEF3C7', label: 'En Route', icon: 'car' },
  on_site: { color: '#7C3AED', bg: '#EDE9FE', label: 'On Site', icon: 'location' },
  complete: { color: Colors.success, bg: '#D1FAE5', label: 'Complete', icon: 'checkmark-done' },
  off_duty: { color: Colors.gray500, bg: Colors.gray100, label: 'Off Duty', icon: 'moon' },
};

export default function TechnicianDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [technician, setTechnician] = useState<Technician | null>(null);
  const [todayRoute, setTodayRoute] = useState<RouteStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    if (!id) return;

    try {
      setError(null);
      const [techResponse, routeResponse] = await Promise.all([
        techniciansApi.get(id),
        dispatchApi.getRoute(id, new Date().toISOString().split('T')[0]),
      ]);

      if (techResponse.success && techResponse.data) {
        setTechnician(techResponse.data);
      } else {
        setError('Technician not found');
        return;
      }

      if (routeResponse.success && routeResponse.data) {
        setTodayRoute(routeResponse.data.stops);
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: TechStatus) => {
    if (!technician) return;

    try {
      const response = await techniciansApi.updateStatus(technician.tech_id, newStatus);
      if (response.success && response.data) {
        setTechnician(response.data);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const handleToggleActive = async () => {
    if (!technician) return;

    Alert.alert(
      technician.is_active ? 'Deactivate Technician' : 'Activate Technician',
      technician.is_active
        ? 'This will set the technician to off-duty and prevent scheduling.'
        : 'This will allow the technician to be scheduled for jobs.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: technician.is_active ? 'Deactivate' : 'Activate',
          style: technician.is_active ? 'destructive' : 'default',
          onPress: async () => {
            const response = await techniciansApi.toggleActive(technician.tech_id);
            if (response.success && response.data) {
              setTechnician(response.data);
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    if (!technician) return;

    Alert.alert(
      'Delete Technician',
      'This will permanently remove this technician. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const response = await techniciansApi.delete(technician.tech_id);
            if (response.success) {
              router.back();
            } else {
              Alert.alert('Error', response.error?.message || 'Failed to delete');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (error || !technician) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color={Colors.error} />
        <Text style={styles.errorText}>{error || 'Technician not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusConfig = STATUS_CONFIG[technician.status];
  const skills = [];
  if (technician.skills.can_install) skills.push('Install');
  if (technician.skills.can_service) skills.push('Service');
  if (technician.skills.can_maintenance) skills.push('Maintenance');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.avatarSection}>
          <View style={[styles.avatar, { backgroundColor: technician.color }]}>
            <Text style={styles.avatarText}>
              {technician.first_name[0]}{technician.last_name[0]}
            </Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{technician.first_name} {technician.last_name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
              <Ionicons name={statusConfig.icon as any} size={14} color={statusConfig.color} />
              <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
            </View>
          </View>
        </View>

        {/* Quick Status Change */}
        <View style={styles.statusActions}>
          <TouchableOpacity
            style={[styles.statusButton, technician.status === 'available' && styles.statusButtonActive]}
            onPress={() => handleStatusChange('available')}
          >
            <Text style={styles.statusButtonText}>Available</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statusButton, technician.status === 'off_duty' && styles.statusButtonActive]}
            onPress={() => handleStatusChange('off_duty')}
          >
            <Text style={styles.statusButtonText}>Off Duty</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Contact Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact</Text>
        <TouchableOpacity style={styles.contactRow}>
          <Ionicons name="call" size={20} color={Colors.primary} />
          <Text style={styles.contactText}>{technician.phone}</Text>
        </TouchableOpacity>
        {technician.email && (
          <TouchableOpacity style={styles.contactRow}>
            <Ionicons name="mail" size={20} color={Colors.primary} />
            <Text style={styles.contactText}>{technician.email}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Skills & Certs */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Skills & Certifications</Text>
        <View style={styles.chipRow}>
          {skills.map((skill, i) => (
            <View key={i} style={styles.skillChip}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
              <Text style={styles.chipText}>{skill}</Text>
            </View>
          ))}
        </View>
        {technician.certifications.length > 0 && (
          <View style={[styles.chipRow, { marginTop: Spacing.sm }]}>
            {technician.certifications.map((cert, i) => (
              <View key={i} style={styles.certChip}>
                <Ionicons name="ribbon" size={14} color={Colors.warning} />
                <Text style={styles.chipText}>{cert.replace('_', ' ')}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Today's Schedule */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today's Schedule</Text>
        {todayRoute.length === 0 ? (
          <Text style={styles.emptyText}>No jobs scheduled for today</Text>
        ) : (
          todayRoute.map((stop, index) => (
            <View key={stop.entry_id} style={styles.scheduleItem}>
              <View style={styles.scheduleNumber}>
                <Text style={styles.scheduleNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.scheduleInfo}>
                <Text style={styles.scheduleCustomer}>{stop.customer_name}</Text>
                <Text style={styles.scheduleAddress}>{stop.address}</Text>
                <Text style={styles.scheduleTime}>{stop.arrival_time} - {stop.departure_time}</Text>
              </View>
              <View style={[styles.scheduleStatus, { backgroundColor: stop.status === 'complete' ? Colors.success : Colors.info }]}>
                <Text style={styles.scheduleStatusText}>{stop.status}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{technician.stats.jobs_completed}</Text>
            <Text style={styles.statLabel}>Jobs Completed</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{technician.stats.on_time_percentage.toFixed(0)}%</Text>
            <Text style={styles.statLabel}>On Time</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {technician.stats.avg_rating ? technician.stats.avg_rating.toFixed(1) : '-'}
            </Text>
            <Text style={styles.statLabel}>Avg Rating</Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, technician.is_active ? styles.actionButtonWarning : styles.actionButtonSuccess]}
          onPress={handleToggleActive}
        >
          <Ionicons name={technician.is_active ? 'pause-circle' : 'play-circle'} size={20} color={Colors.white} />
          <Text style={styles.actionButtonText}>
            {technician.is_active ? 'Deactivate' : 'Activate'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.actionButtonDanger]} onPress={handleDelete}>
          <Ionicons name="trash" size={20} color={Colors.white} />
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
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
    paddingBottom: Spacing.xl,
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
  },
  errorText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  retryButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
  },
  retryButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
  },
  headerCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.white,
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
  },
  headerInfo: {
    marginLeft: Spacing.md,
  },
  name: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xs,
    gap: 4,
  },
  statusText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
  },
  statusActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  statusButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
  },
  statusButtonActive: {
    backgroundColor: Colors.primary,
  },
  statusButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  section: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  contactText: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  certChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  chipText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
  },
  emptyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  scheduleNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scheduleNumberText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
    fontSize: Typography.fontSize.sm,
  },
  scheduleInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  scheduleCustomer: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  scheduleAddress: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  scheduleTime: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  scheduleStatus: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  scheduleStatusText: {
    color: Colors.white,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    textTransform: 'capitalize',
  },
  statsGrid: {
    flexDirection: 'row',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  statLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  actionButtonWarning: {
    backgroundColor: Colors.warning,
  },
  actionButtonSuccess: {
    backgroundColor: Colors.success,
  },
  actionButtonDanger: {
    backgroundColor: Colors.error,
  },
  actionButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
  },
});
