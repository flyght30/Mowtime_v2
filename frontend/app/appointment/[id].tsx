/**
 * Appointment Detail Screen
 * Shows full appointment details with actions
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { Card, Button } from '../../components/ui';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';

interface ServiceItem {
  service_id: string;
  service_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Address {
  street: string;
  city: string;
  state: string;
  zip_code: string;
}

interface Appointment {
  appointment_id: string;
  business_id: string;
  client_id: string;
  scheduled_date: string;
  scheduled_time: string;
  end_time: string;
  status: string;
  services: ServiceItem[];
  total_price: number;
  staff_ids: string[];
  notes?: string;
  address?: Address;
  created_at: string;
}

interface Client {
  client_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
}

export default function AppointmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchAppointment();
  }, [id]);

  const fetchAppointment = async () => {
    try {
      const response = await api.get(`/appointments/${id}`);
      if (response.success && response.data) {
        setAppointment(response.data);
        // Fetch client details
        if (response.data.client_id) {
          const clientResponse = await api.get(`/clients/${response.data.client_id}`);
          if (clientResponse.success && clientResponse.data) {
            setClient(clientResponse.data);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch appointment:', error);
      Alert.alert('Error', 'Failed to load appointment details');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
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
      case 'scheduled': return Colors.primary;
      case 'confirmed': return Colors.success;
      case 'in_progress': return Colors.warning;
      case 'completed': return Colors.success;
      case 'canceled': return Colors.error;
      default: return Colors.gray500;
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  };

  const updateStatus = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      const response = await api.patch(`/appointments/${id}/status`, { status: newStatus });
      if (response.success) {
        setAppointment(prev => prev ? { ...prev, status: newStatus } : null);
        Alert.alert('Success', `Appointment ${newStatus}`);
      } else {
        Alert.alert('Error', response.error?.message || 'Failed to update status');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update appointment');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Appointment',
      'Are you sure you want to cancel this appointment?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Cancel', style: 'destructive', onPress: () => updateStatus('canceled') },
      ]
    );
  };

  const handleComplete = () => {
    Alert.alert(
      'Complete Appointment',
      'Mark this appointment as completed?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: () => updateStatus('completed') },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Appointment' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!appointment) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Appointment' }} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={Colors.error} />
          <Text style={styles.errorText}>Appointment not found</Text>
          <Button title="Go Back" onPress={() => router.back()} variant="outline" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Appointment',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/appointment/${id}/edit`)}
              style={styles.headerButton}
            >
              <Ionicons name="pencil" size={22} color={Colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Status Badge */}
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(appointment.status) + '20' },
            ]}
          >
            <View
              style={[styles.statusDot, { backgroundColor: getStatusColor(appointment.status) }]}
            />
            <Text style={[styles.statusText, { color: getStatusColor(appointment.status) }]}>
              {getStatusLabel(appointment.status)}
            </Text>
          </View>
        </View>

        {/* Date & Time Card */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Date & Time</Text>
          </View>
          <Text style={styles.dateText}>{formatDate(appointment.scheduled_date)}</Text>
          <Text style={styles.timeText}>
            {formatTime(appointment.scheduled_time)} - {formatTime(appointment.end_time)}
          </Text>
        </Card>

        {/* Client Card */}
        {client && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="person-outline" size={24} color={Colors.primary} />
              <Text style={styles.cardTitle}>Client</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push(`/client/${client.client_id}`)}
              style={styles.clientRow}
            >
              <View style={styles.clientAvatar}>
                <Text style={styles.clientInitials}>
                  {client.first_name[0]}{client.last_name[0]}
                </Text>
              </View>
              <View style={styles.clientInfo}>
                <Text style={styles.clientName}>
                  {client.first_name} {client.last_name}
                </Text>
                {client.phone && (
                  <Text style={styles.clientContact}>{client.phone}</Text>
                )}
                {client.email && (
                  <Text style={styles.clientContact}>{client.email}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
            </TouchableOpacity>
          </Card>
        )}

        {/* Address Card */}
        {appointment.address && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="location-outline" size={24} color={Colors.primary} />
              <Text style={styles.cardTitle}>Location</Text>
            </View>
            <Text style={styles.addressText}>
              {appointment.address.street}
            </Text>
            <Text style={styles.addressText}>
              {appointment.address.city}, {appointment.address.state} {appointment.address.zip_code}
            </Text>
          </Card>
        )}

        {/* Services Card */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="construct-outline" size={24} color={Colors.primary} />
            <Text style={styles.cardTitle}>Services</Text>
          </View>
          {appointment.services.map((service, index) => (
            <View key={service.service_id || index} style={styles.serviceRow}>
              <View style={styles.serviceInfo}>
                <Text style={styles.serviceName}>{service.service_name}</Text>
                <Text style={styles.serviceQuantity}>Qty: {service.quantity}</Text>
              </View>
              <Text style={styles.servicePrice}>${service.total_price.toFixed(2)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalPrice}>${appointment.total_price.toFixed(2)}</Text>
          </View>
        </Card>

        {/* Notes Card */}
        {appointment.notes && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text-outline" size={24} color={Colors.primary} />
              <Text style={styles.cardTitle}>Notes</Text>
            </View>
            <Text style={styles.notesText}>{appointment.notes}</Text>
          </Card>
        )}

        {/* Spacer for bottom actions */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Actions */}
      {appointment.status !== 'completed' && appointment.status !== 'canceled' && (
        <View style={styles.bottomActions}>
          <Button
            title="Cancel"
            onPress={handleCancel}
            variant="outline"
            style={styles.actionButton}
            loading={isUpdating}
          />
          <Button
            title="Complete"
            onPress={handleComplete}
            variant="primary"
            style={styles.actionButton}
            loading={isUpdating}
          />
        </View>
      )}
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

  statusContainer: {
    alignItems: 'center',
    marginBottom: Spacing.md,
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

  dateText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },

  timeText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },

  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },

  clientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },

  clientInitials: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },

  clientInfo: {
    flex: 1,
  },

  clientName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  clientContact: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  addressText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: 22,
  },

  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },

  serviceInfo: {
    flex: 1,
  },

  serviceName: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },

  serviceQuantity: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  servicePrice: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
  },

  totalLabel: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  totalPrice: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.success,
  },

  notesText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: 22,
  },

  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    gap: Spacing.md,
    ...Shadows.md,
  },

  actionButton: {
    flex: 1,
  },
});
