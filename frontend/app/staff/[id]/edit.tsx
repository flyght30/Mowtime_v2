/**
 * Edit Staff Screen
 * Form for editing team members
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../services/api';
import { Card, Button, Input } from '../../../components/ui';
import { Colors, Typography, Spacing, BorderRadius } from '../../../constants/theme';

const ROLES = [
  { value: 'technician', label: 'Technician', icon: 'construct', color: Colors.gray500 },
  { value: 'crew_lead', label: 'Crew Lead', icon: 'people', color: Colors.success },
  { value: 'supervisor', label: 'Supervisor', icon: 'clipboard', color: Colors.info },
  { value: 'manager', label: 'Manager', icon: 'briefcase', color: Colors.primary },
  { value: 'dispatcher', label: 'Dispatcher', icon: 'radio', color: Colors.warning },
  { value: 'admin', label: 'Admin', icon: 'shield', color: Colors.error },
];

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'seasonal', label: 'Seasonal' },
];

export default function EditStaffScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Loading state
  const [isLoading, setIsLoading] = useState(true);

  // Basic Info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Employment
  const [role, setRole] = useState('technician');
  const [employmentType, setEmploymentType] = useState('full_time');
  const [hourlyRate, setHourlyRate] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  // Settings
  const [isActive, setIsActive] = useState(true);
  const [canLeadCrew, setCanLeadCrew] = useState(false);
  const [maxDailyAppointments, setMaxDailyAppointments] = useState('8');

  // Certifications
  const [certifications, setCertifications] = useState<string[]>([]);
  const [certInput, setCertInput] = useState('');

  // Emergency Contact
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  // Notes
  const [notes, setNotes] = useState('');

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvancedSection, setShowAdvancedSection] = useState(false);
  const [showEmergencySection, setShowEmergencySection] = useState(false);

  useEffect(() => {
    loadStaff();
  }, [id]);

  const loadStaff = async () => {
    try {
      const response = await api.get(`/staff/${id}`);
      if (response.success && response.data) {
        const staff = response.data;

        setFirstName(staff.first_name || '');
        setLastName(staff.last_name || '');
        setEmail(staff.email || '');
        setPhone(formatPhone(staff.phone || ''));
        setRole(staff.role || 'technician');
        setEmploymentType(staff.employment_type || 'full_time');
        setHourlyRate(staff.hourly_rate?.toString() || '');
        setEmployeeId(staff.employee_id || '');
        setIsActive(staff.is_active ?? true);
        setCanLeadCrew(staff.can_lead_crew ?? false);
        setMaxDailyAppointments(staff.max_daily_appointments?.toString() || '8');
        setCertifications(staff.certifications || []);
        setNotes(staff.notes || '');

        if (staff.emergency_contact) {
          setEmergencyName(staff.emergency_contact.name || '');
          setEmergencyRelation(staff.emergency_contact.relationship || '');
          setEmergencyPhone(formatPhone(staff.emergency_contact.phone || ''));
          setShowEmergencySection(true);
        }
      }
    } catch (error) {
      console.error('Failed to load staff:', error);
      Alert.alert('Error', 'Failed to load team member');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const addCertification = () => {
    const trimmed = certInput.trim();
    if (trimmed && !certifications.includes(trimmed)) {
      setCertifications([...certifications, trimmed]);
      setCertInput('');
    }
  };

  const removeCertification = (cert: string) => {
    setCertifications(certifications.filter(c => c !== cert));
  };

  const handleSubmit = async () => {
    if (!firstName.trim()) {
      Alert.alert('Error', 'First name is required');
      return;
    }
    if (!lastName.trim()) {
      Alert.alert('Error', 'Last name is required');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Error', 'Phone number is required');
      return;
    }

    setIsSubmitting(true);

    const staffData: any = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim() || undefined,
      phone: phone.replace(/\D/g, ''),
      role,
      employment_type: employmentType,
      hourly_rate: hourlyRate ? parseFloat(hourlyRate) : undefined,
      employee_id: employeeId.trim() || undefined,
      is_active: isActive,
      can_lead_crew: canLeadCrew,
      max_daily_appointments: parseInt(maxDailyAppointments) || 8,
      certifications,
      notes: notes.trim() || undefined,
    };

    if (emergencyName.trim()) {
      staffData.emergency_contact = {
        name: emergencyName.trim(),
        relationship: emergencyRelation.trim() || 'Not specified',
        phone: emergencyPhone.replace(/\D/g, ''),
      };
    }

    try {
      const response = await api.put(`/staff/${id}`, staffData);
      if (response.success) {
        Alert.alert('Success', 'Team member updated successfully', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Error', response.error?.message || 'Failed to update team member');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update team member');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Edit Team Member' }} />
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
          title: 'Edit Team Member',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Basic Info */}
        <Text style={styles.sectionTitle}>Basic Information</Text>
        <Card style={styles.card}>
          <View style={styles.nameRow}>
            <Input
              label="First Name"
              placeholder="John"
              value={firstName}
              onChangeText={setFirstName}
              containerStyle={styles.halfInput}
            />
            <Input
              label="Last Name"
              placeholder="Doe"
              value={lastName}
              onChangeText={setLastName}
              containerStyle={styles.halfInput}
            />
          </View>
          <Input
            label="Phone"
            placeholder="(555) 123-4567"
            value={phone}
            onChangeText={(v) => setPhone(formatPhone(v))}
            keyboardType="phone-pad"
            leftIcon="call-outline"
          />
          <Input
            label="Email (Optional)"
            placeholder="john@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon="mail-outline"
          />
        </Card>

        {/* Role */}
        <Text style={styles.sectionTitle}>Role</Text>
        <Card style={styles.card}>
          <View style={styles.roleOptions}>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[
                  styles.roleOption,
                  role === r.value && styles.roleOptionSelected,
                  role === r.value && { borderColor: r.color },
                ]}
                onPress={() => setRole(r.value)}
              >
                <Ionicons
                  name={r.icon as any}
                  size={20}
                  color={role === r.value ? r.color : Colors.gray400}
                />
                <Text
                  style={[
                    styles.roleOptionText,
                    role === r.value && { color: r.color },
                  ]}
                >
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Employment Type */}
        <Text style={styles.sectionTitle}>Employment</Text>
        <Card style={styles.card}>
          <View style={styles.employmentTypes}>
            {EMPLOYMENT_TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[
                  styles.employmentType,
                  employmentType === t.value && styles.employmentTypeSelected,
                ]}
                onPress={() => setEmploymentType(t.value)}
              >
                <Text
                  style={[
                    styles.employmentTypeText,
                    employmentType === t.value && styles.employmentTypeTextSelected,
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label="Hourly Rate (Optional)"
            placeholder="0.00"
            value={hourlyRate}
            onChangeText={setHourlyRate}
            keyboardType="decimal-pad"
            leftIcon="cash-outline"
          />
          <Input
            label="Employee ID (Optional)"
            placeholder="EMP-001"
            value={employeeId}
            onChangeText={setEmployeeId}
          />
        </Card>

        {/* Settings */}
        <Text style={styles.sectionTitle}>Settings</Text>
        <Card style={styles.card}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Active</Text>
              <Text style={styles.switchDesc}>Available for scheduling</Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: Colors.gray300, true: Colors.primary + '80' }}
              thumbColor={isActive ? Colors.primary : Colors.gray100}
            />
          </View>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Can Lead Crew</Text>
              <Text style={styles.switchDesc}>Assign as crew leader</Text>
            </View>
            <Switch
              value={canLeadCrew}
              onValueChange={setCanLeadCrew}
              trackColor={{ false: Colors.gray300, true: Colors.warning + '80' }}
              thumbColor={canLeadCrew ? Colors.warning : Colors.gray100}
            />
          </View>
          <Input
            label="Max Daily Appointments"
            placeholder="8"
            value={maxDailyAppointments}
            onChangeText={setMaxDailyAppointments}
            keyboardType="number-pad"
          />
        </Card>

        {/* Certifications */}
        <Text style={styles.sectionTitle}>Certifications</Text>
        <Card style={styles.card}>
          <View style={styles.certInputRow}>
            <Input
              placeholder="Add certification"
              value={certInput}
              onChangeText={setCertInput}
              containerStyle={styles.certInputContainer}
              onSubmitEditing={addCertification}
            />
            <TouchableOpacity style={styles.addButton} onPress={addCertification}>
              <Ionicons name="add" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>
          {certifications.length > 0 && (
            <View style={styles.certsContainer}>
              {certifications.map((cert, index) => (
                <View key={index} style={styles.certChip}>
                  <Ionicons name="ribbon" size={14} color={Colors.success} />
                  <Text style={styles.certChipText}>{cert}</Text>
                  <TouchableOpacity onPress={() => removeCertification(cert)}>
                    <Ionicons name="close" size={16} color={Colors.success} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Emergency Contact (Collapsible) */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setShowEmergencySection(!showEmergencySection)}
        >
          <Text style={styles.sectionTitle}>Emergency Contact</Text>
          <Ionicons
            name={showEmergencySection ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>

        {showEmergencySection && (
          <Card style={styles.card}>
            <Input
              label="Contact Name"
              placeholder="Jane Doe"
              value={emergencyName}
              onChangeText={setEmergencyName}
            />
            <Input
              label="Relationship"
              placeholder="Spouse, Parent, etc."
              value={emergencyRelation}
              onChangeText={setEmergencyRelation}
            />
            <Input
              label="Phone"
              placeholder="(555) 123-4567"
              value={emergencyPhone}
              onChangeText={(v) => setEmergencyPhone(formatPhone(v))}
              keyboardType="phone-pad"
            />
          </Card>
        )}

        {/* Notes (Collapsible) */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setShowAdvancedSection(!showAdvancedSection)}
        >
          <Text style={styles.sectionTitle}>Notes</Text>
          <Ionicons
            name={showAdvancedSection ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>

        {showAdvancedSection && (
          <Card style={styles.card}>
            <Input
              label="Notes (Optional)"
              placeholder="Any additional notes..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
            />
          </Card>
        )}

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

  card: {
    padding: Spacing.md,
  },

  nameRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },

  halfInput: {
    flex: 1,
  },

  roleOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },

  roleOption: {
    flexBasis: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.gray200,
  },

  roleOptionSelected: {
    backgroundColor: Colors.white,
  },

  roleOptionText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },

  employmentTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },

  employmentType: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.gray200,
  },

  employmentTypeSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },

  employmentTypeText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },

  employmentTypeTextSelected: {
    color: Colors.primary,
  },

  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },

  switchLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },

  switchDesc: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  certInputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-end',
  },

  certInputContainer: {
    flex: 1,
    marginBottom: 0,
  },

  addButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  certsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },

  certChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.success + '15',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },

  certChipText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.success,
    fontWeight: Typography.fontWeight.medium,
  },

  bottomBar: {
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
});
