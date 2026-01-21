/**
 * Staff List Screen
 * List and manage team members
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

interface Staff {
  staff_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone: string;
  role: string;
  employment_type: string;
  is_active: boolean;
  can_lead_crew: boolean;
  skills: string[];
  certifications: string[];
  total_appointments: number;
  completed_appointments: number;
  average_rating?: number;
}

const ROLE_COLORS: Record<string, string> = {
  admin: Colors.error,
  manager: Colors.primary,
  supervisor: Colors.info,
  crew_lead: Colors.success,
  dispatcher: Colors.warning,
  technician: Colors.gray500,
};

const ROLE_ICONS: Record<string, string> = {
  admin: 'shield',
  manager: 'briefcase',
  supervisor: 'clipboard',
  crew_lead: 'people',
  dispatcher: 'radio',
  technician: 'construct',
};

export default function StaffScreen() {
  const router = useRouter();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    try {
      const response = await api.get('/staff?per_page=100');
      if (response.success && response.data) {
        setStaff(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch staff:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStaff();
    setRefreshing(false);
  }, []);

  const filteredStaff = staff.filter(s => {
    if (filter === 'active') return s.is_active;
    if (filter === 'inactive') return !s.is_active;
    return true;
  });

  const formatRole = (role: string) => {
    return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const formatEmploymentType = (type: string) => {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const renderItem = ({ item }: { item: Staff }) => (
    <TouchableOpacity onPress={() => router.push(`/staff/${item.staff_id}`)}>
      <Card style={styles.staffCard}>
        <View style={styles.cardHeader}>
          <View style={[styles.avatar, !item.is_active && styles.avatarInactive]}>
            <Text style={[styles.avatarText, !item.is_active && styles.avatarTextInactive]}>
              {item.first_name[0]}{item.last_name[0]}
            </Text>
          </View>
          <View style={styles.staffInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.staffName, !item.is_active && styles.staffNameInactive]}>
                {item.first_name} {item.last_name}
              </Text>
              {item.can_lead_crew && (
                <View style={styles.leaderBadge}>
                  <Ionicons name="star" size={12} color={Colors.warning} />
                </View>
              )}
            </View>
            <View style={styles.roleRow}>
              <View style={[styles.roleBadge, { backgroundColor: (ROLE_COLORS[item.role] || Colors.gray500) + '20' }]}>
                <Ionicons
                  name={(ROLE_ICONS[item.role] || 'person') as any}
                  size={12}
                  color={ROLE_COLORS[item.role] || Colors.gray500}
                />
                <Text style={[styles.roleText, { color: ROLE_COLORS[item.role] || Colors.gray500 }]}>
                  {formatRole(item.role)}
                </Text>
              </View>
              <Text style={styles.employmentType}>
                {formatEmploymentType(item.employment_type)}
              </Text>
            </View>
          </View>
          {!item.is_active && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>Inactive</Text>
            </View>
          )}
        </View>

        {item.certifications.length > 0 && (
          <View style={styles.certificationsRow}>
            <Ionicons name="ribbon" size={14} color={Colors.success} />
            <Text style={styles.certificationsText} numberOfLines={1}>
              {item.certifications.join(', ')}
            </Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <View style={styles.stat}>
            <Ionicons name="calendar-outline" size={14} color={Colors.gray400} />
            <Text style={styles.statText}>{item.completed_appointments} jobs</Text>
          </View>
          {item.average_rating && (
            <View style={styles.stat}>
              <Ionicons name="star" size={14} color={Colors.warning} />
              <Text style={styles.statText}>{item.average_rating.toFixed(1)}</Text>
            </View>
          )}
          <View style={styles.stat}>
            <Ionicons name="call-outline" size={14} color={Colors.gray400} />
            <Text style={styles.statText}>{item.phone}</Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="people-outline" size={64} color={Colors.gray300} />
      <Text style={styles.emptyTitle}>No team members</Text>
      <Text style={styles.emptyText}>
        Add your first team member to start scheduling
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ title: 'Team' }} />

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
              {f === 'active' && ` (${staff.filter(s => s.is_active).length})`}
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
          data={filteredStaff}
          renderItem={renderItem}
          keyExtractor={item => item.staff_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={renderEmpty}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/staff/create')}>
        <Ionicons name="person-add" size={24} color={Colors.white} />
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

  staffCard: {
    marginBottom: Spacing.md,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },

  avatarInactive: {
    backgroundColor: Colors.gray300,
  },

  avatarText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },

  avatarTextInactive: {
    color: Colors.gray500,
  },

  staffInfo: {
    flex: 1,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  staffName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  staffNameInactive: {
    color: Colors.gray400,
  },

  leaderBadge: {
    padding: 2,
  },

  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 4,
  },

  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },

  roleText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
  },

  employmentType: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  inactiveBadge: {
    backgroundColor: Colors.gray200,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },

  inactiveBadgeText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray600,
    fontWeight: Typography.fontWeight.medium,
  },

  certificationsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },

  certificationsText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.success,
    flex: 1,
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
