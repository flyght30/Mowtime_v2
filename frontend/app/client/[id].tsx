/**
 * Client Detail Screen
 * Shows full client details with actions
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { Card, Button } from '../../components/ui';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';

interface Address {
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  zip_code: string;
  is_primary: boolean;
  notes?: string;
}

interface ClientPreferences {
  preferred_contact_method: string;
  reminder_hours_before: number;
  allow_sms: boolean;
  allow_email: boolean;
  allow_marketing: boolean;
  preferred_days: string[];
  preferred_time_start: string;
  preferred_time_end: string;
  notes?: string;
}

interface Client {
  client_id: string;
  business_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone: string;
  secondary_phone?: string;
  addresses: Address[];
  status: string;
  source?: string;
  preferences: ClientPreferences;
  total_appointments: number;
  completed_appointments: number;
  canceled_appointments: number;
  lifetime_value: number;
  last_service_date?: string;
  next_scheduled_date?: string;
  tags: string[];
  created_at: string;
}

interface Appointment {
  appointment_id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  total_price: number;
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [client, setClient] = useState<Client | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchClient();
  }, [id]);

  const fetchClient = async () => {
    try {
      const response = await api.get(`/clients/${id}`);
      if (response.success && response.data) {
        setClient(response.data);
        // Fetch recent appointments for this client
        const apptResponse = await api.get(`/appointments?client_id=${id}&per_page=5`);
        if (apptResponse.success && apptResponse.data) {
          setAppointments(apptResponse.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch client:', error);
      Alert.alert('Error', 'Failed to load client details');
    } finally {
      setIsLoading(false);
    }
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return Colors.success;
      case 'inactive': return Colors.gray500;
      case 'prospect': return Colors.info;
      case 'do_not_service': return Colors.error;
      default: return Colors.gray500;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'do_not_service': return 'Do Not Service';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const getApptStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return Colors.primary;
      case 'confirmed': return Colors.success;
      case 'completed': return Colors.success;
      case 'canceled': return Colors.error;
      default: return Colors.gray500;
    }
  };

  const handleCall = () => {
    if (client?.phone) {
      Linking.openURL(`tel:${client.phone}`);
    }
  };

  const handleMessage = () => {
    if (client?.phone) {
      Linking.openURL(`sms:${client.phone}`);
    }
  };

  const handleEmail = () => {
    if (client?.email) {
      Linking.openURL(`mailto:${client.email}`);
    }
  };

  const handleNewAppointment = () => {
    // Navigate to create appointment with client pre-selected
    router.push(`/appointment/create?client_id=${id}`);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Client' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!client) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Client' }} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={Colors.error} />
          <Text style={styles.errorText}>Client not found</Text>
          <Button title="Go Back" onPress={() => router.back()} variant="outline" />
        </View>
      </SafeAreaView>
    );
  }

  const primaryAddress = client.addresses.find(a => a.is_primary) || client.addresses[0];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Client',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/client/${id}/edit`)}
              style={styles.headerButton}
            >
              <Ionicons name="pencil" size={22} color={Colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Client Header */}
        <View style={styles.header}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>
              {client.first_name[0]}{client.last_name[0]}
            </Text>
          </View>
          <Text style={styles.clientName}>
            {client.first_name} {client.last_name}
          </Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(client.status) + '20' },
            ]}
          >
            <View
              style={[styles.statusDot, { backgroundColor: getStatusColor(client.status) }]}
            />
            <Text style={[styles.statusText, { color: getStatusColor(client.status) }]}>
              {getStatusLabel(client.status)}
            </Text>
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
          {client.email && (
            <TouchableOpacity style={styles.quickAction} onPress={handleEmail}>
              <View style={[styles.quickActionIcon, { backgroundColor: Colors.info + '20' }]}>
                <Ionicons name="mail" size={24} color={Colors.info} />
              </View>
              <Text style={styles.quickActionLabel}>Email</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.quickAction} onPress={handleNewAppointment}>
            <View style={[styles.quickActionIcon, { backgroundColor: Colors.warning + '20' }]}>
              <Ionicons name="calendar" size={24} color={Colors.warning} />
            </View>
            <Text style={styles.quickActionLabel}>Book</Text>
          </TouchableOpacity>
        </View>

        {/* Contact Info */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="call-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Contact Info</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="call" size={18} color={Colors.gray400} />
            <Text style={styles.infoText}>{client.phone}</Text>
          </View>
          {client.secondary_phone && (
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={18} color={Colors.gray400} />
              <Text style={styles.infoText}>{client.secondary_phone} (secondary)</Text>
            </View>
          )}
          {client.email && (
            <View style={styles.infoRow}>
              <Ionicons name="mail" size={18} color={Colors.gray400} />
              <Text style={styles.infoText}>{client.email}</Text>
            </View>
          )}
        </Card>

        {/* Address */}
        {primaryAddress && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="location-outline" size={24} color={Colors.primary} />
              <Text style={styles.cardTitle}>Service Address</Text>
            </View>
            <Text style={styles.addressText}>{primaryAddress.address_line1}</Text>
            {primaryAddress.address_line2 && (
              <Text style={styles.addressText}>{primaryAddress.address_line2}</Text>
            )}
            <Text style={styles.addressText}>
              {primaryAddress.city}, {primaryAddress.state} {primaryAddress.zip_code}
            </Text>
            {primaryAddress.notes && (
              <Text style={styles.addressNote}>Note: {primaryAddress.notes}</Text>
            )}
            {client.addresses.length > 1 && (
              <Text style={styles.moreAddresses}>
                +{client.addresses.length - 1} more address{client.addresses.length > 2 ? 'es' : ''}
              </Text>
            )}
          </Card>
        )}

        {/* Stats */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="stats-chart-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Statistics</Text>
          </View>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{client.total_appointments}</Text>
              <Text style={styles.statLabel}>Total Jobs</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{client.completed_appointments}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: Colors.success }]}>
                ${client.lifetime_value.toLocaleString()}
              </Text>
              <Text style={styles.statLabel}>Lifetime Value</Text>
            </View>
          </View>
          {client.last_service_date && (
            <View style={styles.lastService}>
              <Text style={styles.lastServiceText}>
                Last service: {formatDate(client.last_service_date)}
              </Text>
            </View>
          )}
        </Card>

        {/* Tags */}
        {client.tags.length > 0 && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="pricetags-outline" size={24} color={Colors.primary} />
              <Text style={styles.cardTitle}>Tags</Text>
            </View>
            <View style={styles.tagsContainer}>
              {client.tags.map((tag, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Recent Appointments */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Recent Appointments</Text>
          </View>
          {appointments.length > 0 ? (
            appointments.map((appt) => (
              <TouchableOpacity
                key={appt.appointment_id}
                style={styles.appointmentRow}
                onPress={() => router.push(`/appointment/${appt.appointment_id}`)}
              >
                <View style={styles.appointmentInfo}>
                  <Text style={styles.appointmentDate}>
                    {formatDate(appt.scheduled_date)} at {formatTime(appt.scheduled_time)}
                  </Text>
                  <View style={styles.appointmentStatusRow}>
                    <View
                      style={[
                        styles.appointmentStatusDot,
                        { backgroundColor: getApptStatusColor(appt.status) },
                      ]}
                    />
                    <Text style={styles.appointmentStatus}>
                      {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.appointmentPrice}>${appt.total_price.toFixed(2)}</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyAppointments}>
              <Text style={styles.emptyText}>No appointments yet</Text>
            </View>
          )}
          <TouchableOpacity style={styles.viewAllButton} onPress={handleNewAppointment}>
            <Text style={styles.viewAllText}>Schedule New Appointment</Text>
            <Ionicons name="add" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </Card>

        {/* Preferences */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="settings-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Preferences</Text>
          </View>
          <View style={styles.preferenceRow}>
            <Text style={styles.preferenceLabel}>Preferred Contact</Text>
            <Text style={styles.preferenceValue}>
              {client.preferences.preferred_contact_method.toUpperCase()}
            </Text>
          </View>
          <View style={styles.preferenceRow}>
            <Text style={styles.preferenceLabel}>Reminder</Text>
            <Text style={styles.preferenceValue}>
              {client.preferences.reminder_hours_before}h before
            </Text>
          </View>
          <View style={styles.preferenceRow}>
            <Text style={styles.preferenceLabel}>Notifications</Text>
            <View style={styles.notificationIcons}>
              {client.preferences.allow_sms && (
                <Ionicons name="chatbubble" size={18} color={Colors.success} />
              )}
              {client.preferences.allow_email && (
                <Ionicons name="mail" size={18} color={Colors.success} />
              )}
            </View>
          </View>
          {client.preferences.notes && (
            <View style={styles.preferencesNote}>
              <Text style={styles.preferencesNoteText}>
                Note: {client.preferences.notes}
              </Text>
            </View>
          )}
        </Card>

        {/* Client Since */}
        <View style={styles.clientSince}>
          <Text style={styles.clientSinceText}>
            Client since {formatDate(client.created_at)}
          </Text>
          {client.source && (
            <Text style={styles.clientSourceText}>Source: {client.source}</Text>
          )}
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

  avatarLargeText: {
    fontSize: 28,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },

  clientName: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  statusText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
  },

  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
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

  addressText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: 22,
  },

  addressNote: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: Spacing.sm,
  },

  moreAddresses: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    marginTop: Spacing.sm,
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

  lastService: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },

  lastServiceText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },

  tag: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },

  tagText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
  },

  appointmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },

  appointmentInfo: {
    flex: 1,
  },

  appointmentDate: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },

  appointmentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  appointmentStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  appointmentStatus: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  appointmentPrice: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginRight: Spacing.sm,
  },

  emptyAppointments: {
    padding: Spacing.lg,
    alignItems: 'center',
  },

  emptyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },

  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
  },

  viewAllText: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },

  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },

  preferenceLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },

  preferenceValue: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },

  notificationIcons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },

  preferencesNote: {
    marginTop: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
  },

  preferencesNoteText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },

  clientSince: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },

  clientSinceText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  clientSourceText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
});
