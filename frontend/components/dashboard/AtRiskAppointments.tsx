/**
 * At-Risk Appointments Widget
 * Displays appointments with high no-show risk on the dashboard
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { api } from '../../services/api';

interface RiskFactor {
  factor: string;
  impact: number;
  description: string;
}

interface AtRiskAppointment {
  appointment_id: string;
  customer_name: string;
  phone?: string;
  address?: string;
  scheduled_date: string;
  scheduled_time?: string;
  service_type: string;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  recommendation: string;
  suggested_action: string;
}

interface AtRiskAppointmentsProps {
  onViewAll?: () => void;
  onAppointmentPress?: (appointmentId: string) => void;
  maxItems?: number;
}

export default function AtRiskAppointments({
  onViewAll,
  onAppointmentPress,
  maxItems = 5,
}: AtRiskAppointmentsProps) {
  const [appointments, setAppointments] = useState<AtRiskAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const fetchAtRiskAppointments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get('/predictions/at-risk', {
        params: {
          date_range: 7,
          threshold: 0.25,
          per_page: maxItems,
        },
      });

      setAppointments(response.data.data.appointments);
    } catch (err: any) {
      console.error('Failed to fetch at-risk appointments:', err);
      setError(err.message || 'Failed to load at-risk appointments');
    } finally {
      setLoading(false);
    }
  }, [maxItems]);

  useEffect(() => {
    fetchAtRiskAppointments();
  }, [fetchAtRiskAppointments]);

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical':
        return Colors.error;
      case 'high':
        return '#F97316'; // Orange
      case 'medium':
        return Colors.warning;
      default:
        return Colors.success;
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'critical':
        return 'alert-circle';
      case 'high':
        return 'warning';
      case 'medium':
        return 'information-circle';
      default:
        return 'checkmark-circle';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
  };

  const handleCall = (phone?: string) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const handleSMS = (phone?: string) => {
    if (phone) {
      Linking.openURL(`sms:${phone}`);
    }
  };

  const handleConfirm = async (appointmentId: string) => {
    setConfirmingId(appointmentId);
    try {
      await api.post(`/predictions/appointments/${appointmentId}/mark-confirmed`);
      // Remove from list or update
      setAppointments(prev => prev.filter(a => a.appointment_id !== appointmentId));
    } catch (err) {
      console.error('Failed to confirm appointment:', err);
    } finally {
      setConfirmingId(null);
    }
  };

  const renderAppointment = ({ item }: { item: AtRiskAppointment }) => {
    const riskColor = getRiskColor(item.risk_level);
    const riskIcon = getRiskIcon(item.risk_level);

    return (
      <TouchableOpacity
        style={styles.appointmentCard}
        onPress={() => onAppointmentPress?.(item.appointment_id)}
        activeOpacity={0.7}
      >
        {/* Risk Badge */}
        <View style={[styles.riskBadge, { backgroundColor: riskColor + '15' }]}>
          <Ionicons name={riskIcon} size={16} color={riskColor} />
          <Text style={[styles.riskScore, { color: riskColor }]}>
            {Math.round(item.risk_score * 100)}%
          </Text>
        </View>

        {/* Customer Info */}
        <View style={styles.customerInfo}>
          <Text style={styles.customerName} numberOfLines={1}>
            {item.customer_name}
          </Text>
          <View style={styles.appointmentDetails}>
            <Text style={styles.dateTime}>
              {formatDate(item.scheduled_date)}
              {item.scheduled_time && ` at ${item.scheduled_time}`}
            </Text>
            <Text style={styles.serviceType}>{item.service_type}</Text>
          </View>
        </View>

        {/* Top Risk Factor */}
        {item.factors.length > 0 && (
          <View style={styles.factorContainer}>
            <Text style={styles.factorText} numberOfLines={1}>
              {item.factors[0].description}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {item.phone && (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleCall(item.phone)}
              >
                <Ionicons name="call" size={18} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleSMS(item.phone)}
              >
                <Ionicons name="chatbubble" size={18} color={Colors.primary} />
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={[styles.actionButton, styles.confirmButton]}
            onPress={() => handleConfirm(item.appointment_id)}
            disabled={confirmingId === item.appointment_id}
          >
            {confirmingId === item.appointment_id ? (
              <ActivityIndicator size="small" color={Colors.success} />
            ) : (
              <Ionicons name="checkmark" size={18} color={Colors.success} />
            )}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="warning" size={20} color={Colors.warning} />
          <Text style={styles.title}>At-Risk Appointments</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="warning" size={20} color={Colors.warning} />
          <Text style={styles.title}>At-Risk Appointments</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchAtRiskAppointments}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (appointments.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
          <Text style={styles.title}>No High-Risk Appointments</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            All upcoming appointments have low no-show risk.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="warning" size={20} color={Colors.warning} />
          <Text style={styles.title}>At-Risk Appointments</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{appointments.length}</Text>
          </View>
        </View>
        {onViewAll && (
          <TouchableOpacity onPress={onViewAll}>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={appointments}
        renderItem={renderAppointment}
        keyExtractor={(item) => item.appointment_id}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  countBadge: {
    backgroundColor: Colors.warning + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  countText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.warning,
  },
  viewAllText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  loadingContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  errorContainer: {
    padding: Spacing.md,
    alignItems: 'center',
  },
  errorText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.error,
    marginBottom: Spacing.sm,
  },
  retryText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  emptyContainer: {
    padding: Spacing.md,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  appointmentCard: {
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.xs,
  },
  riskScore: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
  },
  customerInfo: {
    marginBottom: Spacing.xs,
  },
  customerName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  appointmentDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  dateTime: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  serviceType: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  factorContainer: {
    backgroundColor: Colors.warning + '10',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  factorText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.warning,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: Spacing.xs,
    justifyContent: 'flex-end',
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  confirmButton: {
    borderColor: Colors.success + '50',
  },
  separator: {
    height: Spacing.sm,
  },
});
