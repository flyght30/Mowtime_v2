/**
 * HVAC Maintenance Contract Detail
 * View contract details and record service visits
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../../../constants/theme';
import { hvacApi, MaintenanceContract } from '../../../services/hvacApi';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: '#E8F5E9', text: '#388E3C' },
  expired: { bg: '#ECEFF1', text: '#546E7A' },
  cancelled: { bg: '#FFEBEE', text: '#D32F2F' },
};

const SERVICE_OPTIONS = [
  'System inspection',
  'Filter replacement',
  'Coil cleaning',
  'Refrigerant check',
  'Thermostat calibration',
  'Ductwork inspection',
  'Safety inspection',
  'Performance test',
];

export default function MaintenanceContractDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<MaintenanceContract | null>(null);
  const [recordServiceModalVisible, setRecordServiceModalVisible] = useState(false);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [serviceNotes, setServiceNotes] = useState('');
  const [recording, setRecording] = useState(false);

  const fetchContract = useCallback(async () => {
    if (!id) return;

    try {
      const res = await hvacApi.getMaintenanceContract(id);
      if (res.success && res.data) {
        setContract(res.data.contract);
      }
    } catch (error) {
      console.error('Failed to fetch contract:', error);
      Alert.alert('Error', 'Failed to load contract details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchContract();
  }, [fetchContract]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Not scheduled';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const toggleService = (service: string) => {
    setSelectedServices((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service)
        : [...prev, service]
    );
  };

  const handleRecordService = async () => {
    if (!contract || selectedServices.length === 0) {
      Alert.alert('Error', 'Please select at least one service performed');
      return;
    }

    setRecording(true);
    try {
      const res = await hvacApi.recordMaintenanceService(contract.contract_id, {
        service_date: new Date().toISOString(),
        technician_id: 'current-user', // In real app, get from auth context
        services_performed: selectedServices,
        notes: serviceNotes || undefined,
      });

      if (res.success) {
        Alert.alert('Success', 'Service visit recorded');
        setRecordServiceModalVisible(false);
        setSelectedServices([]);
        setServiceNotes('');
        fetchContract();
      } else {
        Alert.alert('Error', res.error || 'Failed to record service');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to record service');
    } finally {
      setRecording(false);
    }
  };

  const handleCancelContract = () => {
    if (!contract) return;

    Alert.alert(
      'Cancel Contract',
      'Are you sure you want to cancel this maintenance contract?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await hvacApi.cancelMaintenanceContract(
                contract.contract_id,
                'Customer requested cancellation'
              );
              if (res.success) {
                Alert.alert('Cancelled', 'Contract has been cancelled');
                fetchContract();
              } else {
                Alert.alert('Error', res.error || 'Failed to cancel contract');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to cancel contract');
            }
          },
        },
      ]
    );
  };

  const renderRecordServiceModal = () => (
    <Modal
      visible={recordServiceModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setRecordServiceModalVisible(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setRecordServiceModalVisible(false)}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Record Service Visit</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.modalContent}>
          <Text style={styles.sectionLabel}>Services Performed</Text>
          <View style={styles.servicesGrid}>
            {SERVICE_OPTIONS.map((service) => (
              <TouchableOpacity
                key={service}
                style={[
                  styles.serviceChip,
                  selectedServices.includes(service) && styles.serviceChipSelected,
                ]}
                onPress={() => toggleService(service)}
              >
                <Ionicons
                  name={
                    selectedServices.includes(service)
                      ? 'checkmark-circle'
                      : 'ellipse-outline'
                  }
                  size={18}
                  color={
                    selectedServices.includes(service)
                      ? Colors.primary
                      : Colors.gray400
                  }
                />
                <Text
                  style={[
                    styles.serviceChipText,
                    selectedServices.includes(service) &&
                      styles.serviceChipTextSelected,
                  ]}
                >
                  {service}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>
            Notes (Optional)
          </Text>
          <TextInput
            style={styles.notesInput}
            multiline
            numberOfLines={4}
            placeholder="Add any notes about the service visit..."
            value={serviceNotes}
            onChangeText={setServiceNotes}
            textAlignVertical="top"
          />
        </ScrollView>

        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={[
              styles.recordButton,
              selectedServices.length === 0 && styles.recordButtonDisabled,
            ]}
            onPress={handleRecordService}
            disabled={recording || selectedServices.length === 0}
          >
            {recording ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color={Colors.white} />
                <Text style={styles.recordButtonText}>Record Service</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading contract...</Text>
      </View>
    );
  }

  if (!contract) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
        <Text style={styles.errorText}>Contract not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[contract.status] || STATUS_COLORS.active;
  const visitsRemaining = contract.visits_per_year - contract.visits_completed;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.planInfo}>
              <Text style={styles.planName}>{contract.plan_name}</Text>
              <Text style={styles.planType}>{contract.plan_type}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
              <Text style={[styles.statusText, { color: statusColor.text }]}>
                {contract.status}
              </Text>
            </View>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.priceValue}>{formatCurrency(contract.price)}</Text>
            <Text style={styles.priceLabel}>/year</Text>
          </View>
        </View>

        {/* Service Progress */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service Progress</Text>
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>
                {contract.visits_completed} of {contract.visits_per_year} visits completed
              </Text>
              <Text style={styles.progressRemaining}>
                {visitsRemaining} remaining
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${
                      (contract.visits_completed / contract.visits_per_year) * 100
                    }%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* Service Dates */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <View style={styles.datesCard}>
            <View style={styles.dateRow}>
              <View style={styles.dateItem}>
                <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
                <Text style={styles.dateLabel}>Contract Start</Text>
                <Text style={styles.dateValue}>{formatDate(contract.start_date)}</Text>
              </View>
              <View style={styles.dateItem}>
                <Ionicons name="calendar" size={20} color={Colors.error} />
                <Text style={styles.dateLabel}>Contract End</Text>
                <Text style={styles.dateValue}>{formatDate(contract.end_date)}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.dateRow}>
              <View style={styles.dateItem}>
                <Ionicons name="time-outline" size={20} color={Colors.warning} />
                <Text style={styles.dateLabel}>Next Service</Text>
                <Text style={[styles.dateValue, { color: Colors.warning }]}>
                  {formatDate(contract.next_service_date)}
                </Text>
              </View>
              <View style={styles.dateItem}>
                <Ionicons name="checkmark-circle-outline" size={20} color={Colors.success} />
                <Text style={styles.dateLabel}>Last Service</Text>
                <Text style={styles.dateValue}>
                  {formatDate(contract.last_service_date)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Plan Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Plan Features</Text>
          <View style={styles.featuresCard}>
            <View style={styles.featureRow}>
              <Ionicons
                name={contract.includes_parts ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={contract.includes_parts ? Colors.success : Colors.gray400}
              />
              <Text
                style={[
                  styles.featureText,
                  !contract.includes_parts && styles.featureTextDisabled,
                ]}
              >
                Parts Included
              </Text>
            </View>
            <View style={styles.featureRow}>
              <Ionicons
                name={
                  contract.includes_refrigerant ? 'checkmark-circle' : 'close-circle'
                }
                size={20}
                color={contract.includes_refrigerant ? Colors.success : Colors.gray400}
              />
              <Text
                style={[
                  styles.featureText,
                  !contract.includes_refrigerant && styles.featureTextDisabled,
                ]}
              >
                Refrigerant Included
              </Text>
            </View>
            <View style={styles.featureRow}>
              <Ionicons
                name={contract.priority_service ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={contract.priority_service ? Colors.success : Colors.gray400}
              />
              <Text
                style={[
                  styles.featureText,
                  !contract.priority_service && styles.featureTextDisabled,
                ]}
              >
                Priority Service
              </Text>
            </View>
            {contract.discount_percent > 0 && (
              <View style={styles.featureRow}>
                <Ionicons name="pricetag" size={20} color={Colors.primary} />
                <Text style={styles.featureText}>
                  {contract.discount_percent}% Discount on Repairs
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Service History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service History</Text>
          {contract.service_history && contract.service_history.length > 0 ? (
            contract.service_history.map((service: any, index: number) => (
              <View key={index} style={styles.historyItem}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyDate}>
                    {formatDate(service.service_date)}
                  </Text>
                </View>
                <View style={styles.historyServices}>
                  {service.services_performed?.map((s: string, i: number) => (
                    <View key={i} style={styles.historyServiceChip}>
                      <Text style={styles.historyServiceText}>{s}</Text>
                    </View>
                  ))}
                </View>
                {service.notes && (
                  <Text style={styles.historyNotes}>{service.notes}</Text>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyHistory}>
              <Ionicons name="document-text-outline" size={32} color={Colors.gray400} />
              <Text style={styles.emptyHistoryText}>No service visits recorded</Text>
            </View>
          )}
        </View>

        {/* Notes */}
        {contract.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{contract.notes}</Text>
            </View>
          </View>
        )}

        {/* Actions */}
        {contract.status === 'active' && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setRecordServiceModalVisible(true)}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color={Colors.white} />
              <Text style={styles.primaryButtonText}>Record Service Visit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dangerButton}
              onPress={handleCancelContract}
            >
              <Ionicons name="close-circle-outline" size={20} color={Colors.error} />
              <Text style={styles.dangerButtonText}>Cancel Contract</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {renderRecordServiceModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  errorText: {
    fontSize: Typography.fontSize.lg,
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  backButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
  },
  backButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
  },
  headerCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  planType: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    textTransform: 'capitalize',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceValue: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  priceLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginLeft: Spacing.xs,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  progressCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  progressLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
  },
  progressRemaining: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.gray200,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.success,
    borderRadius: 4,
  },
  datesCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  dateRow: {
    flexDirection: 'row',
  },
  dateItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  dateLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  dateValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginTop: 2,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  featuresCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  featureText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    marginLeft: Spacing.sm,
  },
  featureTextDisabled: {
    color: Colors.gray400,
  },
  historyItem: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  historyHeader: {
    marginBottom: Spacing.sm,
  },
  historyDate: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  historyServices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  historyServiceChip: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  historyServiceText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  historyNotes: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    fontStyle: 'italic',
  },
  emptyHistory: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    ...Shadows.sm,
  },
  emptyHistoryText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  notesCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  notesText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    marginLeft: Spacing.sm,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.error,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  dangerButtonText: {
    color: Colors.error,
    fontWeight: Typography.fontWeight.semibold,
    marginLeft: Spacing.sm,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  modalContent: {
    flex: 1,
    padding: Spacing.md,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  serviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  serviceChipSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: Colors.primary,
  },
  serviceChipText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginLeft: Spacing.xs,
  },
  serviceChipTextSelected: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  notesInput: {
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    minHeight: 100,
  },
  modalFooter: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  recordButtonDisabled: {
    opacity: 0.5,
  },
  recordButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    marginLeft: Spacing.sm,
  },
});
