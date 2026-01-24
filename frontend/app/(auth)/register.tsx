/**
 * Register Screen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, RegisterData } from '../../contexts/AuthContext';
import { Button, Input } from '../../components/ui';
import { Colors, Typography, Spacing } from '../../constants/theme';
import { APP_NAME, MIN_PASSWORD_LENGTH } from '../../constants/config';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();

  const [formData, setFormData] = useState<RegisterData>({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone: '',
    business_name: '',
    business_phone: '',
    business_city: '',
    business_state: '',
    business_zip: '',
    vertical: 'hvac', // Default to HVAC vertical
  });

  const [confirmPassword, setConfirmPassword] = useState('');
  const [isBusinessOwner, setIsBusinessOwner] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const updateField = (field: keyof RegisterData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Required fields
    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }

    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < MIN_PASSWORD_LENGTH) {
      newErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    if (formData.password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    // Business fields (if registering as business owner)
    if (isBusinessOwner) {
      if (!formData.business_name?.trim()) {
        newErrors.business_name = 'Business name is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;

    setIsLoading(true);
    try {
      const data: RegisterData = {
        ...formData,
        // Only include business fields if registering as owner
        ...(isBusinessOwner ? {} : {
          business_name: undefined,
          business_phone: undefined,
          business_city: undefined,
          business_state: undefined,
          business_zip: undefined,
        }),
      };

      const result = await register(data);

      if (!result.success) {
        Alert.alert('Registration Failed', result.error || 'Could not create account');
      }
      // Navigation handled by AuthGuard
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>{APP_NAME}</Text>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Start managing your business today</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Personal Info */}
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Input
                  label="First Name"
                  placeholder="John"
                  value={formData.first_name}
                  onChangeText={(v) => updateField('first_name', v)}
                  error={errors.first_name}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.halfInput}>
                <Input
                  label="Last Name"
                  placeholder="Doe"
                  value={formData.last_name}
                  onChangeText={(v) => updateField('last_name', v)}
                  error={errors.last_name}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <Input
              label="Email"
              placeholder="john@example.com"
              value={formData.email}
              onChangeText={(v) => updateField('email', v)}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              leftIcon="mail-outline"
            />

            <Input
              label="Phone (optional)"
              placeholder="(555) 123-4567"
              value={formData.phone}
              onChangeText={(v) => updateField('phone', v)}
              keyboardType="phone-pad"
              leftIcon="call-outline"
            />

            <Input
              label="Password"
              placeholder="Create a password"
              value={formData.password}
              onChangeText={(v) => updateField('password', v)}
              error={errors.password}
              secureTextEntry
              leftIcon="lock-closed-outline"
              hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
            />

            <Input
              label="Confirm Password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              error={errors.confirmPassword}
              secureTextEntry
              leftIcon="lock-closed-outline"
            />

            {/* Business Toggle */}
            <View style={styles.toggleContainer}>
              <View>
                <Text style={styles.toggleLabel}>I'm a business owner</Text>
                <Text style={styles.toggleHint}>Create a business account</Text>
              </View>
              <Switch
                value={isBusinessOwner}
                onValueChange={setIsBusinessOwner}
                trackColor={{ false: Colors.gray300, true: Colors.primaryLight }}
                thumbColor={isBusinessOwner ? Colors.primary : Colors.gray100}
              />
            </View>

            {/* Business Fields */}
            {isBusinessOwner && (
              <View style={styles.businessSection}>
                <Text style={styles.sectionTitle}>Business Information</Text>

                <Input
                  label="Business Name"
                  placeholder="Acme Lawn Care"
                  value={formData.business_name}
                  onChangeText={(v) => updateField('business_name', v)}
                  error={errors.business_name}
                  leftIcon="business-outline"
                />

                <Input
                  label="Business Phone"
                  placeholder="(555) 987-6543"
                  value={formData.business_phone}
                  onChangeText={(v) => updateField('business_phone', v)}
                  keyboardType="phone-pad"
                  leftIcon="call-outline"
                />

                <View style={styles.row}>
                  <View style={styles.halfInput}>
                    <Input
                      label="City"
                      placeholder="Austin"
                      value={formData.business_city}
                      onChangeText={(v) => updateField('business_city', v)}
                    />
                  </View>
                  <View style={styles.quarterInput}>
                    <Input
                      label="State"
                      placeholder="TX"
                      value={formData.business_state}
                      onChangeText={(v) => updateField('business_state', v.toUpperCase())}
                      maxLength={2}
                      autoCapitalize="characters"
                    />
                  </View>
                  <View style={styles.quarterInput}>
                    <Input
                      label="ZIP"
                      placeholder="78701"
                      value={formData.business_zip}
                      onChangeText={(v) => updateField('business_zip', v)}
                      keyboardType="number-pad"
                      maxLength={10}
                    />
                  </View>
                </View>
              </View>
            )}

            <Button
              title="Create Account"
              onPress={handleRegister}
              loading={isLoading}
              fullWidth
              size="lg"
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={styles.footerLink}>Sign in</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  keyboardView: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    padding: Spacing.lg,
  },

  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    marginTop: Spacing.md,
  },

  logo: {
    fontSize: Typography.fontSize['3xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    marginBottom: Spacing.md,
  },

  title: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },

  subtitle: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },

  form: {
    marginBottom: Spacing.xl,
  },

  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },

  halfInput: {
    flex: 1,
  },

  quarterInput: {
    flex: 0.5,
  },

  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.md,
  },

  toggleLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },

  toggleHint: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  businessSection: {
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.md,
  },

  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },

  footerText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },

  footerLink: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },
});
