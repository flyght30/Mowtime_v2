/**
 * TechForm Component
 * Form for creating/editing technicians
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Switch, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { TechnicianCreate, TechnicianUpdate, TechSkills, TechSchedule } from '../../services/dispatchApi';

interface TechFormProps {
  initialData?: Partial<TechnicianCreate>;
  onSubmit: (data: TechnicianCreate | TechnicianUpdate) => Promise<void>;
  onCancel: () => void;
  isEdit?: boolean;
  loading?: boolean;
}

const CERTIFICATIONS = ['EPA_608', 'NATE', 'OSHA_10', 'OSHA_30'];
const DAYS_OF_WEEK = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4', '#795548', '#607D8B'];

export default function TechForm({ initialData, onSubmit, onCancel, isEdit = false, loading = false }: TechFormProps) {
  const [firstName, setFirstName] = useState(initialData?.first_name || '');
  const [lastName, setLastName] = useState(initialData?.last_name || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [certifications, setCertifications] = useState<string[]>(initialData?.certifications || []);
  const [skills, setSkills] = useState<TechSkills>(initialData?.skills || {
    can_install: true,
    can_service: true,
    can_maintenance: true,
  });
  const [schedule, setSchedule] = useState<TechSchedule>(initialData?.schedule || {
    work_days: [1, 2, 3, 4, 5],
    start_time: '08:00',
    end_time: '17:00',
    lunch_start: '12:00',
    lunch_duration: 60,
  });
  const [color, setColor] = useState(initialData?.color || '#4CAF50');

  const toggleCertification = (cert: string) => {
    if (certifications.includes(cert)) {
      setCertifications(certifications.filter(c => c !== cert));
    } else {
      setCertifications([...certifications, cert]);
    }
  };

  const toggleWorkDay = (day: number) => {
    if (schedule.work_days.includes(day)) {
      setSchedule({ ...schedule, work_days: schedule.work_days.filter(d => d !== day) });
    } else {
      setSchedule({ ...schedule, work_days: [...schedule.work_days, day].sort() });
    }
  };

  const handleSubmit = async () => {
    const data: TechnicianCreate = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      certifications,
      skills,
      schedule,
      color,
    };
    await onSubmit(data);
  };

  const isValid = firstName.trim() && lastName.trim() && phone.trim().length >= 10;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Basic Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Basic Information</Text>

        <View style={styles.row}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>First Name *</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Mike"
              placeholderTextColor={Colors.gray400}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Last Name *</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Johnson"
              placeholderTextColor={Colors.gray400}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone *</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="(555) 123-4567"
              placeholderTextColor={Colors.gray400}
              keyboardType="phone-pad"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="mike@company.com"
              placeholderTextColor={Colors.gray400}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>
      </View>

      {/* Certifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Certifications</Text>
        <View style={styles.chipRow}>
          {CERTIFICATIONS.map(cert => (
            <TouchableOpacity
              key={cert}
              style={[styles.chip, certifications.includes(cert) && styles.chipSelected]}
              onPress={() => toggleCertification(cert)}
            >
              <Text style={[styles.chipText, certifications.includes(cert) && styles.chipTextSelected]}>
                {cert.replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Skills */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Skills</Text>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Can do Installs</Text>
          <Switch
            value={skills.can_install}
            onValueChange={(val) => setSkills({ ...skills, can_install: val })}
            trackColor={{ false: Colors.gray300, true: Colors.primaryLight }}
            thumbColor={skills.can_install ? Colors.primary : Colors.gray400}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Can do Service Calls</Text>
          <Switch
            value={skills.can_service}
            onValueChange={(val) => setSkills({ ...skills, can_service: val })}
            trackColor={{ false: Colors.gray300, true: Colors.primaryLight }}
            thumbColor={skills.can_service ? Colors.primary : Colors.gray400}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Can do Maintenance</Text>
          <Switch
            value={skills.can_maintenance}
            onValueChange={(val) => setSkills({ ...skills, can_maintenance: val })}
            trackColor={{ false: Colors.gray300, true: Colors.primaryLight }}
            thumbColor={skills.can_maintenance ? Colors.primary : Colors.gray400}
          />
        </View>
      </View>

      {/* Work Schedule */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Work Schedule</Text>

        <Text style={styles.label}>Work Days</Text>
        <View style={styles.daysRow}>
          {DAYS_OF_WEEK.map(day => (
            <TouchableOpacity
              key={day.value}
              style={[styles.dayChip, schedule.work_days.includes(day.value) && styles.dayChipSelected]}
              onPress={() => toggleWorkDay(day.value)}
            >
              <Text style={[styles.dayText, schedule.work_days.includes(day.value) && styles.dayTextSelected]}>
                {day.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.row}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Start Time</Text>
            <TextInput
              style={styles.input}
              value={schedule.start_time}
              onChangeText={(val) => setSchedule({ ...schedule, start_time: val })}
              placeholder="08:00"
              placeholderTextColor={Colors.gray400}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>End Time</Text>
            <TextInput
              style={styles.input}
              value={schedule.end_time}
              onChangeText={(val) => setSchedule({ ...schedule, end_time: val })}
              placeholder="17:00"
              placeholderTextColor={Colors.gray400}
            />
          </View>
        </View>
      </View>

      {/* Color */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Map Marker Color</Text>
        <View style={styles.colorRow}>
          {COLORS.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.colorChip, { backgroundColor: c }, color === c && styles.colorChipSelected]}
              onPress={() => setColor(c)}
            >
              {color === c && <Ionicons name="checkmark" size={16} color={Colors.white} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={loading}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitButton, (!isValid || loading) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!isValid || loading}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Saving...' : isEdit ? 'Update Technician' : 'Add Technician'}
          </Text>
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
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  inputGroup: {
    flex: 1,
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.gray50,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  chipTextSelected: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  switchLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  daysRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
  },
  dayChipSelected: {
    backgroundColor: Colors.primary,
  },
  dayText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },
  dayTextSelected: {
    color: Colors.white,
  },
  colorRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  colorChip: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorChipSelected: {
    borderWidth: 3,
    borderColor: Colors.white,
    ...Shadows.md,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },
  submitButton: {
    flex: 2,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: Colors.gray300,
  },
  submitButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.white,
  },
});
