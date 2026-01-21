/**
 * Edit Appointment Screen
 * Form for editing existing appointments
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../../../services/api';
import { Card, Button, Input } from '../../../components/ui';
import { Colors, Typography, Spacing, BorderRadius } from '../../../constants/theme';

interface Client {
  client_id: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
}

interface Service {
  service_id: string;
  name: string;
  base_price: number;
  duration_minutes: number;
}

interface Staff {
  staff_id: string;
  first_name: string;
  last_name: string;
}

interface SelectedService {
  service_id: string;
  service_name: string;
  quantity: number;
  unit_price: number;
}

export default function EditAppointmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Loading state
  const [isLoading, setIsLoading] = useState(true);

  // Form state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  // UI state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [clientSearch, setClientSearch] = useState('');

  useEffect(() => {
    loadAppointment();
    fetchData();
  }, [id]);

  const loadAppointment = async () => {
    try {
      const response = await api.get(`/appointments/${id}`);
      if (response.success && response.data) {
        const apt = response.data;

        // Set date and time
        setSelectedDate(new Date(apt.scheduled_date));
        const [hours, minutes] = apt.scheduled_time.split(':');
        const time = new Date();
        time.setHours(parseInt(hours), parseInt(minutes), 0);
        setSelectedTime(time);

        // Set services
        setSelectedServices(apt.services.map((s: any) => ({
          service_id: s.service_id,
          service_name: s.service_name,
          quantity: s.quantity,
          unit_price: s.unit_price,
        })));

        // Set staff
        setSelectedStaff(apt.staff_ids || []);

        // Set notes
        setNotes(apt.notes || '');

        // Fetch client
        if (apt.client_id) {
          const clientResponse = await api.get(`/clients/${apt.client_id}`);
          if (clientResponse.success && clientResponse.data) {
            setSelectedClient(clientResponse.data);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load appointment:', error);
      Alert.alert('Error', 'Failed to load appointment');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const [clientsRes, servicesRes, staffRes] = await Promise.all([
        api.get('/clients?per_page=100'),
        api.get('/services/active'),
        api.get('/staff?per_page=100'),
      ]);

      if (clientsRes.success) setClients(clientsRes.data || []);
      if (servicesRes.success) setServices(servicesRes.data || []);
      if (staffRes.success) setStaff(staffRes.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const calculateTotal = () => {
    return selectedServices.reduce((sum, s) => sum + s.unit_price * s.quantity, 0);
  };

  const calculateEndTime = () => {
    const totalMinutes = selectedServices.reduce((sum, s) => {
      const service = services.find(svc => svc.service_id === s.service_id);
      return sum + (service?.duration_minutes || 30) * s.quantity;
    }, 0);

    const endTime = new Date(selectedTime);
    endTime.setMinutes(endTime.getMinutes() + (totalMinutes || 60));
    return endTime;
  };

  const addService = (service: Service) => {
    const existing = selectedServices.find(s => s.service_id === service.service_id);
    if (existing) {
      setSelectedServices(prev =>
        prev.map(s =>
          s.service_id === service.service_id
            ? { ...s, quantity: s.quantity + 1 }
            : s
        )
      );
    } else {
      setSelectedServices(prev => [
        ...prev,
        {
          service_id: service.service_id,
          service_name: service.name,
          quantity: 1,
          unit_price: service.base_price,
        },
      ]);
    }
    setShowServiceModal(false);
  };

  const removeService = (serviceId: string) => {
    setSelectedServices(prev => prev.filter(s => s.service_id !== serviceId));
  };

  const toggleStaff = (staffId: string) => {
    setSelectedStaff(prev =>
      prev.includes(staffId)
        ? prev.filter(sid => sid !== staffId)
        : [...prev, staffId]
    );
  };

  const handleSubmit = async () => {
    if (!selectedClient) {
      Alert.alert('Error', 'Please select a client');
      return;
    }
    if (selectedServices.length === 0) {
      Alert.alert('Error', 'Please add at least one service');
      return;
    }

    setIsSubmitting(true);

    const endTime = calculateEndTime();

    const appointmentData = {
      client_id: selectedClient.client_id,
      scheduled_date: selectedDate.toISOString().split('T')[0],
      scheduled_time: selectedTime.toTimeString().slice(0, 5),
      end_time: endTime.toTimeString().slice(0, 5),
      services: selectedServices.map(s => ({
        service_id: s.service_id,
        service_name: s.service_name,
        quantity: s.quantity,
        unit_price: s.unit_price,
        total_price: s.unit_price * s.quantity,
      })),
      total_price: calculateTotal(),
      staff_ids: selectedStaff,
      notes: notes || undefined,
    };

    try {
      const response = await api.put(`/appointments/${id}`, appointmentData);
      if (response.success) {
        Alert.alert('Success', 'Appointment updated successfully', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Error', response.error?.message || 'Failed to update appointment');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update appointment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredClients = clients.filter(c => {
    const search = clientSearch.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(search) ||
      c.last_name.toLowerCase().includes(search) ||
      c.phone?.includes(search) ||
      c.email?.toLowerCase().includes(search)
    );
  });

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Edit Appointment' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Edit Appointment',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Client Selector */}
        <Text style={styles.sectionTitle}>Client</Text>
        <TouchableOpacity onPress={() => setShowClientModal(true)}>
          <Card style={styles.selectorCard}>
            {selectedClient ? (
              <View style={styles.selectedItem}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {selectedClient.first_name[0]}{selectedClient.last_name[0]}
                  </Text>
                </View>
                <View style={styles.selectedInfo}>
                  <Text style={styles.selectedName}>
                    {selectedClient.first_name} {selectedClient.last_name}
                  </Text>
                  {selectedClient.phone && (
                    <Text style={styles.selectedSubtext}>{selectedClient.phone}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
              </View>
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name="person-add-outline" size={24} color={Colors.gray400} />
                <Text style={styles.placeholderText}>Select a client</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
              </View>
            )}
          </Card>
        </TouchableOpacity>

        {/* Date & Time */}
        <Text style={styles.sectionTitle}>Date & Time</Text>
        <View style={styles.dateTimeRow}>
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            style={styles.dateTimeButton}
          >
            <Card style={styles.dateTimeCard}>
              <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
              <Text style={styles.dateTimeText}>{formatDate(selectedDate)}</Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowTimePicker(true)}
            style={styles.dateTimeButton}
          >
            <Card style={styles.dateTimeCard}>
              <Ionicons name="time-outline" size={20} color={Colors.primary} />
              <Text style={styles.dateTimeText}>{formatTime(selectedTime)}</Text>
            </Card>
          </TouchableOpacity>
        </View>

        {/* Services */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Services</Text>
          <TouchableOpacity onPress={() => setShowServiceModal(true)}>
            <Text style={styles.addLink}>+ Add Service</Text>
          </TouchableOpacity>
        </View>

        {selectedServices.length > 0 ? (
          <Card style={styles.servicesCard}>
            {selectedServices.map((service, index) => (
              <View key={service.service_id} style={styles.serviceRow}>
                <View style={styles.serviceInfo}>
                  <Text style={styles.serviceName}>{service.service_name}</Text>
                  <Text style={styles.servicePrice}>
                    ${service.unit_price.toFixed(2)} x {service.quantity}
                  </Text>
                </View>
                <Text style={styles.serviceTotal}>
                  ${(service.unit_price * service.quantity).toFixed(2)}
                </Text>
                <TouchableOpacity
                  onPress={() => removeService(service.service_id)}
                  style={styles.removeButton}
                >
                  <Ionicons name="close-circle" size={22} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalAmount}>${calculateTotal().toFixed(2)}</Text>
            </View>
          </Card>
        ) : (
          <TouchableOpacity onPress={() => setShowServiceModal(true)}>
            <Card style={styles.emptyCard}>
              <Ionicons name="construct-outline" size={32} color={Colors.gray300} />
              <Text style={styles.emptyText}>Tap to add services</Text>
            </Card>
          </TouchableOpacity>
        )}

        {/* Staff */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Assigned Staff</Text>
          <TouchableOpacity onPress={() => setShowStaffModal(true)}>
            <Text style={styles.addLink}>+ Add Staff</Text>
          </TouchableOpacity>
        </View>

        {selectedStaff.length > 0 ? (
          <Card style={styles.staffCard}>
            <View style={styles.staffChips}>
              {selectedStaff.map(staffId => {
                const staffMember = staff.find(s => s.staff_id === staffId);
                if (!staffMember) return null;
                return (
                  <View key={staffId} style={styles.staffChip}>
                    <Text style={styles.staffChipText}>
                      {staffMember.first_name} {staffMember.last_name}
                    </Text>
                    <TouchableOpacity onPress={() => toggleStaff(staffId)}>
                      <Ionicons name="close" size={16} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </Card>
        ) : (
          <TouchableOpacity onPress={() => setShowStaffModal(true)}>
            <Card style={styles.emptyCard}>
              <Ionicons name="people-outline" size={32} color={Colors.gray300} />
              <Text style={styles.emptyText}>Tap to assign staff</Text>
            </Card>
          </TouchableOpacity>
        )}

        {/* Notes */}
        <Text style={styles.sectionTitle}>Notes (Optional)</Text>
        <Input
          placeholder="Add any special instructions..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          inputStyle={styles.notesInput}
        />

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.bottomBar}>
        <Button
          title="Save Changes"
          onPress={handleSubmit}
          fullWidth
          loading={isSubmitting}
        />
      </View>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (date) setSelectedDate(date);
          }}
        />
      )}

      {/* Time Picker */}
      {showTimePicker && (
        <DateTimePicker
          value={selectedTime}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            setShowTimePicker(Platform.OS === 'ios');
            if (date) setSelectedTime(date);
          }}
          minuteInterval={15}
        />
      )}

      {/* Client Selection Modal */}
      <Modal visible={showClientModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Client</Text>
            <TouchableOpacity onPress={() => setShowClientModal(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <Input
            placeholder="Search clients..."
            value={clientSearch}
            onChangeText={setClientSearch}
            leftIcon="search-outline"
            containerStyle={styles.searchInput}
          />

          <FlatList
            data={filteredClients}
            keyExtractor={item => item.client_id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  setSelectedClient(item);
                  setShowClientModal(false);
                }}
                style={styles.listItem}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.first_name[0]}{item.last_name[0]}
                  </Text>
                </View>
                <View style={styles.listItemInfo}>
                  <Text style={styles.listItemName}>
                    {item.first_name} {item.last_name}
                  </Text>
                  {item.phone && (
                    <Text style={styles.listItemSubtext}>{item.phone}</Text>
                  )}
                </View>
                {selectedClient?.client_id === item.client_id && (
                  <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
                )}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* Service Selection Modal */}
      <Modal visible={showServiceModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Service</Text>
            <TouchableOpacity onPress={() => setShowServiceModal(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={services}
            keyExtractor={item => item.service_id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => addService(item)}
                style={styles.listItem}
              >
                <View style={styles.listItemInfo}>
                  <Text style={styles.listItemName}>{item.name}</Text>
                  <Text style={styles.listItemSubtext}>
                    {item.duration_minutes} min
                  </Text>
                </View>
                <Text style={styles.listItemPrice}>${item.base_price.toFixed(2)}</Text>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* Staff Selection Modal */}
      <Modal visible={showStaffModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Assign Staff</Text>
            <TouchableOpacity onPress={() => setShowStaffModal(false)}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={staff}
            keyExtractor={item => item.staff_id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => toggleStaff(item.staff_id)}
                style={styles.listItem}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.first_name[0]}{item.last_name[0]}
                  </Text>
                </View>
                <View style={styles.listItemInfo}>
                  <Text style={styles.listItemName}>
                    {item.first_name} {item.last_name}
                  </Text>
                </View>
                {selectedStaff.includes(item.staff_id) ? (
                  <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
                ) : (
                  <Ionicons name="ellipse-outline" size={24} color={Colors.gray300} />
                )}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
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

  headerButton: {
    padding: Spacing.sm,
  },

  cancelText: {
    fontSize: Typography.fontSize.base,
    color: Colors.error,
  },

  scrollView: {
    flex: 1,
  },

  content: {
    padding: Spacing.md,
  },

  sectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },

  addLink: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },

  selectorCard: {
    padding: Spacing.md,
  },

  selectedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },

  avatarText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },

  selectedInfo: {
    flex: 1,
  },

  selectedName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  selectedSubtext: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  placeholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },

  placeholderText: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.gray400,
  },

  dateTimeRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },

  dateTimeButton: {
    flex: 1,
  },

  dateTimeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
  },

  dateTimeText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },

  servicesCard: {
    padding: Spacing.md,
  },

  serviceRow: {
    flexDirection: 'row',
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

  servicePrice: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  serviceTotal: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginRight: Spacing.sm,
  },

  removeButton: {
    padding: Spacing.xs,
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
  },

  totalLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  totalAmount: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.success,
  },

  emptyCard: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },

  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray400,
  },

  staffCard: {
    padding: Spacing.md,
  },

  staffChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },

  staffChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },

  staffChipText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },

  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  bottomBar: {
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },

  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },

  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  doneText: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },

  searchInput: {
    margin: Spacing.md,
    marginBottom: 0,
  },

  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
    gap: Spacing.md,
  },

  listItemInfo: {
    flex: 1,
  },

  listItemName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },

  listItemSubtext: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  listItemPrice: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.success,
  },
});
