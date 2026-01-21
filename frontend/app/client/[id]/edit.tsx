/**
 * Edit Client Screen
 * Form for editing existing clients
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

interface Address {
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  is_primary: boolean;
  notes: string;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: Colors.success },
  { value: 'prospect', label: 'Prospect', color: Colors.info },
  { value: 'inactive', label: 'Inactive', color: Colors.gray500 },
  { value: 'do_not_service', label: 'Do Not Service', color: Colors.error },
];

const CONTACT_METHODS = [
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
];

export default function EditClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Loading state
  const [isLoading, setIsLoading] = useState(true);

  // Basic Info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [status, setStatus] = useState('active');
  const [source, setSource] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Address
  const [address, setAddress] = useState<Address>({
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip_code: '',
    is_primary: true,
    notes: '',
  });

  // Preferences
  const [preferredContact, setPreferredContact] = useState('sms');
  const [allowSms, setAllowSms] = useState(true);
  const [allowEmail, setAllowEmail] = useState(true);
  const [allowMarketing, setAllowMarketing] = useState(false);
  const [preferencesNotes, setPreferencesNotes] = useState('');

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddressSection, setShowAddressSection] = useState(false);
  const [showPreferencesSection, setShowPreferencesSection] = useState(false);

  useEffect(() => {
    loadClient();
  }, [id]);

  const loadClient = async () => {
    try {
      const response = await api.get(`/clients/${id}`);
      if (response.success && response.data) {
        const client = response.data;

        // Basic info
        setFirstName(client.first_name || '');
        setLastName(client.last_name || '');
        setEmail(client.email || '');
        setPhone(formatPhone(client.phone || ''));
        setSecondaryPhone(client.secondary_phone ? formatPhone(client.secondary_phone) : '');
        setStatus(client.status || 'active');
        setSource(client.source || '');
        setTags(client.tags || []);

        // Address
        const primaryAddr = client.addresses?.find((a: Address) => a.is_primary) || client.addresses?.[0];
        if (primaryAddr) {
          setAddress({
            address_line1: primaryAddr.address_line1 || '',
            address_line2: primaryAddr.address_line2 || '',
            city: primaryAddr.city || '',
            state: primaryAddr.state || '',
            zip_code: primaryAddr.zip_code || '',
            is_primary: true,
            notes: primaryAddr.notes || '',
          });
          setShowAddressSection(true);
        }

        // Preferences
        if (client.preferences) {
          setPreferredContact(client.preferences.preferred_contact_method || 'sms');
          setAllowSms(client.preferences.allow_sms ?? true);
          setAllowEmail(client.preferences.allow_email ?? true);
          setAllowMarketing(client.preferences.allow_marketing ?? false);
          setPreferencesNotes(client.preferences.notes || '');
          if (client.preferences.notes) {
            setShowPreferencesSection(true);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load client:', error);
      Alert.alert('Error', 'Failed to load client');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handleSubmit = async () => {
    // Validation
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

    const addresses = [];
    if (address.address_line1.trim()) {
      addresses.push({
        address_line1: address.address_line1.trim(),
        address_line2: address.address_line2.trim() || undefined,
        city: address.city.trim(),
        state: address.state.trim().toUpperCase(),
        zip_code: address.zip_code.trim(),
        is_primary: true,
        notes: address.notes.trim() || undefined,
      });
    }

    const clientData = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim() || undefined,
      phone: phone.replace(/\D/g, ''),
      secondary_phone: secondaryPhone ? secondaryPhone.replace(/\D/g, '') : undefined,
      status,
      source: source.trim() || undefined,
      tags,
      addresses,
      preferences: {
        preferred_contact_method: preferredContact,
        allow_sms: allowSms,
        allow_email: allowEmail,
        allow_marketing: allowMarketing,
        notes: preferencesNotes.trim() || undefined,
      },
    };

    try {
      const response = await api.put(`/clients/${id}`, clientData);
      if (response.success) {
        Alert.alert('Success', 'Client updated successfully', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Error', response.error?.message || 'Failed to update client');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update client');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Edit Client' }} />
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
          title: 'Edit Client',
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
            label="Secondary Phone (Optional)"
            placeholder="(555) 987-6543"
            value={secondaryPhone}
            onChangeText={(v) => setSecondaryPhone(formatPhone(v))}
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

        {/* Status */}
        <Text style={styles.sectionTitle}>Status</Text>
        <Card style={styles.card}>
          <View style={styles.statusOptions}>
            {STATUS_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.statusOption,
                  status === option.value && styles.statusOptionSelected,
                  status === option.value && { borderColor: option.color },
                ]}
                onPress={() => setStatus(option.value)}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: option.color },
                  ]}
                />
                <Text
                  style={[
                    styles.statusOptionText,
                    status === option.value && { color: option.color },
                  ]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Source & Tags */}
        <Text style={styles.sectionTitle}>Additional Info</Text>
        <Card style={styles.card}>
          <Input
            label="Source (Optional)"
            placeholder="How did they find you?"
            value={source}
            onChangeText={setSource}
            leftIcon="megaphone-outline"
          />

          <Text style={styles.inputLabel}>Tags</Text>
          <View style={styles.tagInputRow}>
            <Input
              placeholder="Add a tag"
              value={tagInput}
              onChangeText={setTagInput}
              containerStyle={styles.tagInputContainer}
              onSubmitEditing={addTag}
            />
            <TouchableOpacity style={styles.addTagButton} onPress={addTag}>
              <Ionicons name="add" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>
          {tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {tags.map((tag, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                  <TouchableOpacity onPress={() => removeTag(tag)}>
                    <Ionicons name="close" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Address Section (Collapsible) */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setShowAddressSection(!showAddressSection)}
        >
          <Text style={styles.sectionTitle}>Service Address</Text>
          <Ionicons
            name={showAddressSection ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>

        {showAddressSection && (
          <Card style={styles.card}>
            <Input
              label="Street Address"
              placeholder="123 Main St"
              value={address.address_line1}
              onChangeText={(v) => setAddress({ ...address, address_line1: v })}
              leftIcon="location-outline"
            />
            <Input
              label="Apt/Suite (Optional)"
              placeholder="Apt 4B"
              value={address.address_line2}
              onChangeText={(v) => setAddress({ ...address, address_line2: v })}
            />
            <View style={styles.cityStateRow}>
              <Input
                label="City"
                placeholder="City"
                value={address.city}
                onChangeText={(v) => setAddress({ ...address, city: v })}
                containerStyle={styles.cityInput}
              />
              <Input
                label="State"
                placeholder="TX"
                value={address.state}
                onChangeText={(v) => setAddress({ ...address, state: v })}
                containerStyle={styles.stateInput}
                maxLength={2}
                autoCapitalize="characters"
              />
              <Input
                label="ZIP"
                placeholder="12345"
                value={address.zip_code}
                onChangeText={(v) => setAddress({ ...address, zip_code: v })}
                containerStyle={styles.zipInput}
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>
            <Input
              label="Access Notes (Optional)"
              placeholder="Gate code, parking instructions..."
              value={address.notes}
              onChangeText={(v) => setAddress({ ...address, notes: v })}
              multiline
            />
          </Card>
        )}

        {/* Preferences Section (Collapsible) */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setShowPreferencesSection(!showPreferencesSection)}
        >
          <Text style={styles.sectionTitle}>Preferences</Text>
          <Ionicons
            name={showPreferencesSection ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>

        {showPreferencesSection && (
          <Card style={styles.card}>
            <Text style={styles.inputLabel}>Preferred Contact Method</Text>
            <View style={styles.contactMethods}>
              {CONTACT_METHODS.map((method) => (
                <TouchableOpacity
                  key={method.value}
                  style={[
                    styles.contactMethod,
                    preferredContact === method.value && styles.contactMethodSelected,
                  ]}
                  onPress={() => setPreferredContact(method.value)}
                >
                  <Text
                    style={[
                      styles.contactMethodText,
                      preferredContact === method.value && styles.contactMethodTextSelected,
                    ]}
                  >
                    {method.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Allow SMS notifications</Text>
              <Switch
                value={allowSms}
                onValueChange={setAllowSms}
                trackColor={{ false: Colors.gray300, true: Colors.primary + '80' }}
                thumbColor={allowSms ? Colors.primary : Colors.gray100}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Allow Email notifications</Text>
              <Switch
                value={allowEmail}
                onValueChange={setAllowEmail}
                trackColor={{ false: Colors.gray300, true: Colors.primary + '80' }}
                thumbColor={allowEmail ? Colors.primary : Colors.gray100}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Allow Marketing messages</Text>
              <Switch
                value={allowMarketing}
                onValueChange={setAllowMarketing}
                trackColor={{ false: Colors.gray300, true: Colors.primary + '80' }}
                thumbColor={allowMarketing ? Colors.primary : Colors.gray100}
              />
            </View>

            <Input
              label="Special Instructions (Optional)"
              placeholder="Any special notes about this client..."
              value={preferencesNotes}
              onChangeText={setPreferencesNotes}
              multiline
              numberOfLines={3}
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

  inputLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },

  statusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },

  statusOption: {
    flexBasis: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.gray200,
  },

  statusOptionSelected: {
    backgroundColor: Colors.white,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  statusOptionText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },

  tagInputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-end',
  },

  tagInputContainer: {
    flex: 1,
    marginBottom: 0,
  },

  addTagButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },

  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },

  tagText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },

  cityStateRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },

  cityInput: {
    flex: 3,
  },

  stateInput: {
    flex: 1,
  },

  zipInput: {
    flex: 2,
  },

  contactMethods: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },

  contactMethod: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.gray200,
    alignItems: 'center',
  },

  contactMethodSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },

  contactMethodText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },

  contactMethodTextSelected: {
    color: Colors.primary,
  },

  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },

  switchLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },

  bottomBar: {
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
});
