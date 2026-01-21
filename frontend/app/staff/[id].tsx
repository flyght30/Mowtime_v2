/**
 * Staff Detail Screen
 * Shows full staff member details with actions
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { Card, Button } from '../../components/ui';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

interface StaffAvailability {
  monday?: { start: string; end: string };
  tuesday?: { start: string; end: string };
  wednesday?: { start: string; end: string };
  thursday?: { start: string; end: string };
  friday?: { start: string; end: string };
  saturday?: { start: string; end: string };
  sunday?: { start: string; end: string };
}

interface Staff {
  staff_id: string;
  business_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone: string;
  role: string;
  employment_type: string;
  hire_date?: string;
  hourly_rate?: number;
  employee_id?: string;
  is_active: boolean;
  can_lead_crew: boolean;
  max_daily_appointments: number;
  skills: string[];
  certifications: string[];
  equipment_trained: string[];
  default_availability: StaffAvailability;
  emergency_contact?: EmergencyContact;
  total_appointments: number;
  completed_appointments: number;
  average_rating?: number;
  total_hours_worked: number;
  notes?: string;
  created_at: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin: Colors.error,
  manager: Colors.primary,
  supervisor: Colors.info,
  crew_lead: Colors.success,
  dispatcher: Colors.warning,
  technician: Colors.gray500,
};

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function StaffDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchStaff();
  }, [id]);

  const fetchStaff = async () => {
    try {
      const response = await api.get(`/staff/${id}`);
      if (response.success && response.data) {
        setStaff(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch staff:', error);
      Alert.alert('Error', 'Failed to load staff details');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleActive = async () => {
    if (!staff) return;

    setIsUpdating(true);
    try {
      const response = await api.put(`/staff/${id}`, {
        is_active: !staff.is_active,
      });
      if (response.success) {
        setStaff(prev => prev ? { ...prev, is_active: !prev.is_active } : null);
      } else {
        Alert.alert('Error', response.error?.message || 'Failed to update staff');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update staff');
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleLeader = async () => {
    if (!staff) return;

    setIsUpdating(true);
    try {
      const response = await api.put(`/staff/${id}`, {
        can_lead_crew: !staff.can_lead_crew,
      });
      if (response.success) {
        setStaff(prev => prev ? { ...prev, can_lead_crew: !prev.can_lead_crew } : null);
      } else {
        Alert.alert('Error', response.error?.message || 'Failed to update staff');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update staff');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCall = () => {
    if (staff?.phone) {
      Linking.openURL(`tel:${staff.phone}`);
    }
  };

  const handleMessage = () => {
    if (staff?.phone) {
      Linking.openURL(`sms:${staff.phone}`);
    }
  };

  const handleEmail = () => {
    if (staff?.email) {
      Linking.openURL(`mailto:${staff.email}`);
    }
  };

  const formatRole = (role: string) => {
    return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const formatEmploymentType = (type: string) => {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (time: string) => {
    const [hour, minute] = time.split(':');
    const h = parseInt(hour);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minute} ${ampm}`;
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Team Member' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!staff) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Team Member' }} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={Colors.error} />
          <Text style={styles.errorText}>Staff member not found</Text>
          <Button title="Go Back" onPress={() => router.back()} variant="outline" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Team Member',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/staff/${id}/edit`)}
              style={styles.headerButton}
            >
              <Ionicons name="pencil" size={22} color={Colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.avatarLarge, !staff.is_active && styles.avatarLargeInactive]}>
            <Text style={styles.avatarLargeText}>
              {staff.first_name[0]}{staff.last_name[0]}
            </Text>
          </View>
          <Text style={[styles.staffName, !staff.is_active && styles.staffNameInactive]}>
            {staff.first_name} {staff.last_name}
          </Text>
          <View style={styles.badges}>
            <View style={[styles.roleBadge, { backgroundColor: (ROLE_COLORS[staff.role] || Colors.gray500) + '20' }]}>
              <Text style={[styles.roleBadgeText, { color: ROLE_COLORS[staff.role] || Colors.gray500 }]}>
                {formatRole(staff.role)}
              </Text>
            </View>
            {staff.can_lead_crew && (
              <View style={[styles.badge, styles.leaderBadge]}>
                <Ionicons name="star" size={14} color={Colors.warning} />
                <Text style={styles.leaderBadgeText}>Crew Leader</Text>
              </View>
            )}
            {!staff.is_active && (
              <View style={[styles.badge, styles.inactiveBadge]}>
                <Text style={styles.inactiveBadgeText}>Inactive</Text>
              </View>
            )}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickAction} onPress={handleCall}>
            <View style={[styles.quickActionIcon, { backgroundColor: Colors.success + '20' }]}>
              <Ionicons name="call" size={24} color={Colors.success} />
            </View>
            <Text style={styles.quickActionLabel}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={handleMessage}>
            <View style={[styles.quickActionIcon, { backgroundColor: Colors.primary + '20' }]}>
              <Ionicons name="chatbubble" size={24} color={Colors.primary} />
            </View>
            <Text style={styles.quickActionLabel}>Message</Text>
          </TouchableOpacity>
          {staff.email && (
            <TouchableOpacity style={styles.quickAction} onPress={handleEmail}>
              <View style={[styles.quickActionIcon, { backgroundColor: Colors.info + '20' }]}>
                <Ionicons name="mail" size={24} color={Colors.info} />
              </View>
              <Text style={styles.quickActionLabel}>Email</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Contact Info */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="call-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Contact Info</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="call" size={18} color={Colors.gray400} />
            <Text style={styles.infoText}>{staff.phone}</Text>
          </View>
          {staff.email && (
            <View style={styles.infoRow}>
              <Ionicons name="mail" size={18} color={Colors.gray400} />
              <Text style={styles.infoText}>{staff.email}</Text>
            </View>
          )}
        </Card>

        {/* Employment */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="briefcase-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Employment</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type</Text>
            <Text style={styles.detailValue}>{formatEmploymentType(staff.employment_type)}</Text>
          </View>
          {staff.hire_date && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Hire Date</Text>
              <Text style={styles.detailValue}>{formatDate(staff.hire_date)}</Text>
            </View>
          )}
          {staff.hourly_rate && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Hourly Rate</Text>
              <Text style={styles.detailValue}>${staff.hourly_rate.toFixed(2)}/hr</Text>
            </View>
          )}
          {staff.employee_id && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Employee ID</Text>
              <Text style={styles.detailValue}>{staff.employee_id}</Text>
            </View>
          )}
        </Card>

        {/* Stats */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="stats-chart-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Performance</Text>
          </View>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{staff.completed_appointments}</Text>
              <Text style={styles.statLabel}>Jobs Done</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{staff.total_hours_worked.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Hours Worked</Text>
            </View>
            {staff.average_rating && (
              <View style={styles.statItem}>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={20} color={Colors.warning} />
                  <Text style={[styles.statNumber, { color: Colors.warning }]}>
                    {staff.average_rating.toFixed(1)}
                  </Text>
                </View>
                <Text style={styles.statLabel}>Rating</Text>
              </View>
            )}
          </View>
        </Card>

        {/* Skills & Certifications */}
        {(staff.skills.length > 0 || staff.certifications.length > 0) && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="ribbon-outline" size={24} color={Colors.primary} />
              <Text style={styles.cardTitle}>Skills & Certifications</Text>
            </View>
            {staff.certifications.length > 0 && (
              <>
                <Text style={styles.subheading}>Certifications</Text>
                <View style={styles.chipsContainer}>
                  {staff.certifications.map((cert, index) => (
                    <View key={index} style={[styles.chip, styles.certChip]}>
                      <Ionicons name="ribbon" size={14} color={Colors.success} />
                      <Text style={styles.certChipText}>{cert}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
            {staff.skills.length > 0 && (
              <>
                <Text style={styles.subheading}>Skills</Text>
                <View style={styles.chipsContainer}>
                  {staff.skills.map((skill, index) => (
                    <View key={index} style={styles.chip}>
                      <Text style={styles.chipText}>{skill}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </Card>
        )}

        {/* Availability */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Weekly Availability</Text>
          </View>
          <View style={styles.availabilityGrid}>
            {DAY_NAMES.map((day, index) => {
              const dayAvail = staff.default_availability?.[day as keyof StaffAvailability];
              return (
                <View key={day} style={styles.dayRow}>
                  <Text style={styles.dayLabel}>{DAY_LABELS[index]}</Text>
                  {dayAvail ? (
                    <Text style={styles.dayTime}>
                      {formatTime(dayAvail.start)} - {formatTime(dayAvail.end)}
                    </Text>
                  ) : (
                    <Text style={styles.dayOff}>Off</Text>
                  )}
                </View>
              );
            })}
          </View>
        </Card>

        {/* Quick Settings */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="settings-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Quick Settings</Text>
          </View>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Active</Text>
              <Text style={styles.toggleDesc}>Available for scheduling</Text>
            </View>
            <Switch
              value={staff.is_active}
              onValueChange={toggleActive}
              disabled={isUpdating}
              trackColor={{ false: Colors.gray300, true: Colors.primary + '80' }}
              thumbColor={staff.is_active ? Colors.primary : Colors.gray100}
            />
          </View>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Can Lead Crew</Text>
              <Text style={styles.toggleDesc}>Assigned as crew leader</Text>
            </View>
            <Switch
              value={staff.can_lead_crew}
              onValueChange={toggleLeader}
              disabled={isUpdating}
              trackColor={{ false: Colors.gray300, true: Colors.warning + '80' }}
              thumbColor={staff.can_lead_crew ? Colors.warning : Colors.gray100}
            />
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Max Daily Jobs</Text>
            <Text style={styles.detailValue}>{staff.max_daily_appointments}</Text>
          </View>
        </Card>

        {/* Emergency Contact */}
        {staff.emergency_contact && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="warning-outline" size={24} color={Colors.error} />
              <Text style={styles.cardTitle}>Emergency Contact</Text>
            </View>
            <Text style={styles.emergencyName}>{staff.emergency_contact.name}</Text>
            <Text style={styles.emergencyRelation}>{staff.emergency_contact.relationship}</Text>
            <TouchableOpacity
              style={styles.emergencyCall}
              onPress={() => Linking.openURL(`tel:${staff.emergency_contact!.phone}`)}
            >
              <Ionicons name="call" size={18} color={Colors.primary} />
              <Text style={styles.emergencyPhone}>{staff.emergency_contact.phone}</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Notes */}
        {staff.notes && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text-outline" size={24} color={Colors.primary} />
              <Text style={styles.cardTitle}>Notes</Text>
            </View>
            <Text style={styles.notesText}>{staff.notes}</Text>
          </Card>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Added {formatDate(staff.created_at)}
          </Text>
        </View>

        <View style={{ height: 40 }} />
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

  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },

  errorText: {
    fontSize: Typography.fontSize.lg,
    color: Colors.textSecondary,
  },

  headerButton: {
    padding: Spacing.sm,
  },

  scrollView: {
    flex: 1,
  },

  content: {
    padding: Spacing.md,
  },

  header: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },

  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  avatarLargeInactive: {
    backgroundColor: Colors.gray300,
  },

  avatarLargeText: {
    fontSize: 28,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },

  staffName: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },

  staffNameInactive: {
    color: Colors.gray400,
  },

  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },

  roleBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },

  roleBadgeText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
  },

  leaderBadge: {
    backgroundColor: Colors.warning + '20',
  },

  leaderBadgeText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.warning,
    fontWeight: Typography.fontWeight.medium,
  },

  inactiveBadge: {
    backgroundColor: Colors.gray200,
  },

  inactiveBadgeText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray600,
    fontWeight: Typography.fontWeight.medium,
  },

  quickActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    marginBottom: Spacing.lg,
  },

  quickAction: {
    alignItems: 'center',
    gap: Spacing.xs,
  },

  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },

  quickActionLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  card: {
    marginBottom: Spacing.md,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },

  cardTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },

  infoText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },

  detailLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },

  detailValue: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },

  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },

  statItem: {
    alignItems: 'center',
  },

  statNumber: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },

  statLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },

  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  subheading: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },

  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },

  chip: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },

  chipText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
  },

  certChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.success + '15',
  },

  certChipText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.success,
  },

  availabilityGrid: {
    gap: Spacing.sm,
  },

  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },

  dayLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    width: 40,
  },

  dayTime: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },

  dayOff: {
    fontSize: Typography.fontSize.base,
    color: Colors.gray400,
    fontStyle: 'italic',
  },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },

  toggleLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },

  toggleDesc: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  emergencyName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  emergencyRelation: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },

  emergencyCall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },

  emergencyPhone: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
  },

  notesText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: 22,
  },

  footer: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },

  footerText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
});
