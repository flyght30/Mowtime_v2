/**
 * Edit Service Screen
 * Form for editing existing services
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

const CATEGORIES = [
  { value: 'mowing', label: 'Mowing', icon: 'leaf' },
  { value: 'trimming', label: 'Trimming', icon: 'cut' },
  { value: 'leaf_removal', label: 'Leaf Removal', icon: 'leaf' },
  { value: 'fertilization', label: 'Fertilization', icon: 'water' },
  { value: 'weed_control', label: 'Weed Control', icon: 'ban' },
  { value: 'planting', label: 'Planting', icon: 'flower' },
  { value: 'mulching', label: 'Mulching', icon: 'layers' },
  { value: 'irrigation', label: 'Irrigation', icon: 'water' },
  { value: 'maintenance', label: 'Maintenance', icon: 'construct' },
  { value: 'cleanup', label: 'Cleanup', icon: 'trash' },
  { value: 'consultation', label: 'Consultation', icon: 'chatbubbles' },
  { value: 'other', label: 'Other', icon: 'ellipse' },
];

const PRICING_TYPES = [
  { value: 'fixed', label: 'Fixed Price', desc: 'Single price per service' },
  { value: 'hourly', label: 'Hourly', desc: 'Price per hour' },
  { value: 'per_unit', label: 'Per Unit', desc: 'Price per sq ft, room, etc.' },
  { value: 'quote', label: 'Quote', desc: 'Custom quote required' },
];

const DURATION_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
  { value: 180, label: '3 hours' },
  { value: 240, label: '4 hours' },
];

export default function EditServiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Loading state
  const [isLoading, setIsLoading] = useState(true);

  // Basic Info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');

  // Pricing
  const [pricingType, setPricingType] = useState('fixed');
  const [basePrice, setBasePrice] = useState('');
  const [unitLabel, setUnitLabel] = useState('');

  // Duration
  const [duration, setDuration] = useState(60);

  // Settings
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [allowOnlineBooking, setAllowOnlineBooking] = useState(true);
  const [minStaff, setMinStaff] = useState('1');
  const [maxStaff, setMaxStaff] = useState('4');
  const [bufferHours, setBufferHours] = useState('24');

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSettingsSection, setShowSettingsSection] = useState(false);

  useEffect(() => {
    loadService();
  }, [id]);

  const loadService = async () => {
    try {
      const response = await api.get(`/services/${id}`);
      if (response.success && response.data) {
        const service = response.data;

        setName(service.name || '');
        setDescription(service.description || '');
        setCategory(service.category || 'other');
        setPricingType(service.pricing_type || 'fixed');
        setBasePrice(service.base_price?.toString() || '');
        setUnitLabel(service.unit_label || '');
        setDuration(service.duration_minutes || 60);
        setIsActive(service.is_active ?? true);
        setIsFeatured(service.is_featured ?? false);
        setAllowOnlineBooking(service.allow_online_booking ?? true);
        setMinStaff(service.min_staff_required?.toString() || '1');
        setMaxStaff(service.max_staff_allowed?.toString() || '4');
        setBufferHours(service.booking_buffer_hours?.toString() || '24');
      }
    } catch (error) {
      console.error('Failed to load service:', error);
      Alert.alert('Error', 'Failed to load service');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Service name is required');
      return;
    }
    if (!basePrice && pricingType !== 'quote') {
      Alert.alert('Error', 'Base price is required');
      return;
    }
    if (pricingType === 'per_unit' && !unitLabel.trim()) {
      Alert.alert('Error', 'Unit label is required for per-unit pricing');
      return;
    }

    setIsSubmitting(true);

    const serviceData = {
      name: name.trim(),
      description: description.trim() || undefined,
      category,
      pricing_type: pricingType,
      base_price: parseFloat(basePrice) || 0,
      unit_label: unitLabel.trim() || undefined,
      duration_minutes: duration,
      is_active: isActive,
      is_featured: isFeatured,
      allow_online_booking: allowOnlineBooking,
      min_staff_required: parseInt(minStaff) || 1,
      max_staff_allowed: parseInt(maxStaff) || 4,
      booking_buffer_hours: parseInt(bufferHours) || 24,
    };

    try {
      const response = await api.put(`/services/${id}`, serviceData);
      if (response.success) {
        Alert.alert('Success', 'Service updated successfully', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Error', response.error?.message || 'Failed to update service');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update service');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCategory = CATEGORIES.find(c => c.value === category);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Edit Service' }} />
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
          title: 'Edit Service',
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
          <Input
            label="Service Name"
            placeholder="e.g., Standard Lawn Mowing"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.inputLabel}>Category</Text>
          <TouchableOpacity
            style={styles.categorySelector}
            onPress={() => setShowCategoryModal(!showCategoryModal)}
          >
            <View style={styles.categoryIcon}>
              <Ionicons
                name={(selectedCategory?.icon || 'ellipse') as any}
                size={20}
                color={Colors.primary}
              />
            </View>
            <Text style={styles.categorySelectorText}>
              {selectedCategory?.label || 'Select Category'}
            </Text>
            <Ionicons
              name={showCategoryModal ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={Colors.gray400}
            />
          </TouchableOpacity>

          {showCategoryModal && (
            <View style={styles.categoryOptions}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[
                    styles.categoryOption,
                    category === cat.value && styles.categoryOptionSelected,
                  ]}
                  onPress={() => {
                    setCategory(cat.value);
                    setShowCategoryModal(false);
                  }}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={18}
                    color={category === cat.value ? Colors.primary : Colors.gray400}
                  />
                  <Text
                    style={[
                      styles.categoryOptionText,
                      category === cat.value && styles.categoryOptionTextSelected,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Input
            label="Description (Optional)"
            placeholder="Brief description of this service..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
        </Card>

        {/* Pricing */}
        <Text style={styles.sectionTitle}>Pricing</Text>
        <Card style={styles.card}>
          <Text style={styles.inputLabel}>Pricing Type</Text>
          <View style={styles.pricingTypes}>
            {PRICING_TYPES.map((type) => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.pricingType,
                  pricingType === type.value && styles.pricingTypeSelected,
                ]}
                onPress={() => setPricingType(type.value)}
              >
                <Text
                  style={[
                    styles.pricingTypeLabel,
                    pricingType === type.value && styles.pricingTypeLabelSelected,
                  ]}
                >
                  {type.label}
                </Text>
                <Text style={styles.pricingTypeDesc}>{type.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {pricingType !== 'quote' && (
            <Input
              label="Base Price"
              placeholder="0.00"
              value={basePrice}
              onChangeText={setBasePrice}
              keyboardType="decimal-pad"
              leftIcon="cash-outline"
            />
          )}

          {pricingType === 'per_unit' && (
            <Input
              label="Unit Label"
              placeholder="e.g., sq ft, room, tree"
              value={unitLabel}
              onChangeText={setUnitLabel}
            />
          )}
        </Card>

        {/* Duration */}
        <Text style={styles.sectionTitle}>Duration</Text>
        <Card style={styles.card}>
          <Text style={styles.inputLabel}>Estimated Duration</Text>
          <View style={styles.durationOptions}>
            {DURATION_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.durationOption,
                  duration === opt.value && styles.durationOptionSelected,
                ]}
                onPress={() => setDuration(opt.value)}
              >
                <Text
                  style={[
                    styles.durationOptionText,
                    duration === opt.value && styles.durationOptionTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Quick Settings */}
        <Text style={styles.sectionTitle}>Visibility</Text>
        <Card style={styles.card}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Active</Text>
              <Text style={styles.switchDesc}>Service is available for booking</Text>
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
              <Text style={styles.switchLabel}>Featured</Text>
              <Text style={styles.switchDesc}>Highlight in listings</Text>
            </View>
            <Switch
              value={isFeatured}
              onValueChange={setIsFeatured}
              trackColor={{ false: Colors.gray300, true: Colors.warning + '80' }}
              thumbColor={isFeatured ? Colors.warning : Colors.gray100}
            />
          </View>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Allow Online Booking</Text>
              <Text style={styles.switchDesc}>Clients can book this online</Text>
            </View>
            <Switch
              value={allowOnlineBooking}
              onValueChange={setAllowOnlineBooking}
              trackColor={{ false: Colors.gray300, true: Colors.success + '80' }}
              thumbColor={allowOnlineBooking ? Colors.success : Colors.gray100}
            />
          </View>
        </Card>

        {/* Advanced Settings (Collapsible) */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setShowSettingsSection(!showSettingsSection)}
        >
          <Text style={styles.sectionTitle}>Advanced Settings</Text>
          <Ionicons
            name={showSettingsSection ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>

        {showSettingsSection && (
          <Card style={styles.card}>
            <View style={styles.staffRow}>
              <Input
                label="Min Staff"
                value={minStaff}
                onChangeText={setMinStaff}
                keyboardType="number-pad"
                containerStyle={styles.staffInput}
              />
              <Input
                label="Max Staff"
                value={maxStaff}
                onChangeText={setMaxStaff}
                keyboardType="number-pad"
                containerStyle={styles.staffInput}
              />
            </View>
            <Input
              label="Booking Buffer (hours)"
              placeholder="24"
              value={bufferHours}
              onChangeText={setBufferHours}
              keyboardType="number-pad"
            />
            <Text style={styles.helperText}>
              Minimum hours notice required to book this service
            </Text>
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

  inputLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },

  categorySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
    gap: Spacing.md,
  },

  categoryIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },

  categorySelectorText: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },

  categoryOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
  },

  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },

  categoryOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },

  categoryOptionText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  categoryOptionTextSelected: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },

  pricingTypes: {
    gap: Spacing.sm,
  },

  pricingType: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.gray200,
  },

  pricingTypeSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },

  pricingTypeLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },

  pricingTypeLabelSelected: {
    color: Colors.primary,
  },

  pricingTypeDesc: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  durationOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },

  durationOption: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.gray200,
  },

  durationOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },

  durationOptionText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },

  durationOptionTextSelected: {
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

  staffRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },

  staffInput: {
    flex: 1,
  },

  helperText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },

  bottomBar: {
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
});
