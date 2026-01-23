/**
 * Troubleshoot Screen
 * AI-powered HVAC troubleshooting assistant for technicians
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../../constants/theme';
import api from '../../../services/api';

interface Brand {
  id: string;
  name: string;
}

interface Symptom {
  id: string;
  symptom: string;
  category: string;
}

interface ErrorCodeInfo {
  code: string;
  meaning: string;
  category: string;
  severity: string;
  description: string;
  possible_causes: string[];
  solutions: string[];
  parts_needed: string[];
  brand: string;
}

interface TroubleshootResponse {
  success: boolean;
  error_info: ErrorCodeInfo | null;
  ai_guidance: string | null;
  follow_up_questions: string[];
  session_id: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: Colors.error,
  warning: Colors.warning,
  info: Colors.info,
};

export default function TroubleshootScreen() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const [selectedSymptom, setSelectedSymptom] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TroubleshootResponse | null>(null);
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [isAskingFollowUp, setIsAskingFollowUp] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showSymptomPicker, setShowSymptomPicker] = useState(false);

  useEffect(() => {
    loadBrandsAndSymptoms();
  }, []);

  const loadBrandsAndSymptoms = async () => {
    try {
      const [brandsRes, symptomsRes] = await Promise.all([
        api.get('/api/v1/troubleshoot/brands'),
        api.get('/api/v1/troubleshoot/symptoms'),
      ]);
      setBrands(brandsRes.data?.data || []);
      setSymptoms(symptomsRes.data?.data || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const diagnose = async () => {
    if (!errorCode && !selectedSymptom && !description) {
      Alert.alert('Input Required', 'Please enter an error code, select a symptom, or describe the issue.');
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const response = await api.post('/api/v1/troubleshoot/diagnose', {
        brand: selectedBrand,
        error_code: errorCode || undefined,
        symptom: selectedSymptom,
        description: description || undefined,
        job_id: jobId,
      });

      if (response.data?.data) {
        setResult(response.data.data);
      }
    } catch (err: any) {
      console.error('Diagnose error:', err);
      Alert.alert('Error', err.response?.data?.detail?.message || 'Failed to get diagnosis');
    } finally {
      setIsLoading(false);
    }
  };

  const askFollowUp = async () => {
    if (!followUpQuestion.trim() || !result?.session_id) return;

    setIsAskingFollowUp(true);

    try {
      const response = await api.post('/api/v1/troubleshoot/followup', {
        session_id: result.session_id,
        question: followUpQuestion,
      });

      if (response.data?.data) {
        setResult({
          ...result,
          ai_guidance: response.data.data.ai_guidance,
          follow_up_questions: response.data.data.follow_up_questions,
        });
        setFollowUpQuestion('');
      }
    } catch (err: any) {
      console.error('Follow-up error:', err);
      Alert.alert('Error', 'Failed to process follow-up question');
    } finally {
      setIsAskingFollowUp(false);
    }
  };

  const resetForm = () => {
    setSelectedBrand(null);
    setErrorCode('');
    setSelectedSymptom(null);
    setDescription('');
    setResult(null);
    setFollowUpQuestion('');
  };

  const selectedBrandName = brands.find(b => b.id === selectedBrand)?.name;
  const selectedSymptomName = symptoms.find(s => s.id === selectedSymptom)?.symptom;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Troubleshoot</Text>
          {result && (
            <TouchableOpacity onPress={resetForm} style={styles.resetButton}>
              <Ionicons name="refresh" size={24} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {!result ? (
          <>
            {/* Input Form */}
            <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>Enter Error Code or Symptom</Text>

              {/* Brand Selector */}
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowBrandPicker(!showBrandPicker)}
              >
                <Ionicons name="build" size={20} color={Colors.textSecondary} />
                <Text style={[styles.pickerText, selectedBrand && styles.pickerTextSelected]}>
                  {selectedBrandName || 'Select Equipment Brand'}
                </Text>
                <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>

              {showBrandPicker && (
                <View style={styles.pickerOptions}>
                  {brands.map(brand => (
                    <TouchableOpacity
                      key={brand.id}
                      style={[styles.pickerOption, selectedBrand === brand.id && styles.pickerOptionSelected]}
                      onPress={() => {
                        setSelectedBrand(brand.id);
                        setShowBrandPicker(false);
                      }}
                    >
                      <Text style={styles.pickerOptionText}>{brand.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Error Code Input */}
              <View style={styles.inputContainer}>
                <Ionicons name="warning" size={20} color={Colors.textSecondary} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter error/fault code (e.g., E4, 13)"
                  value={errorCode}
                  onChangeText={setErrorCode}
                  autoCapitalize="characters"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>

              {/* OR Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Symptom Selector */}
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowSymptomPicker(!showSymptomPicker)}
              >
                <Ionicons name="thermometer" size={20} color={Colors.textSecondary} />
                <Text style={[styles.pickerText, selectedSymptom && styles.pickerTextSelected]}>
                  {selectedSymptomName || 'Select Common Symptom'}
                </Text>
                <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>

              {showSymptomPicker && (
                <View style={styles.pickerOptions}>
                  {symptoms.map(symptom => (
                    <TouchableOpacity
                      key={symptom.id}
                      style={[styles.pickerOption, selectedSymptom === symptom.id && styles.pickerOptionSelected]}
                      onPress={() => {
                        setSelectedSymptom(symptom.id);
                        setShowSymptomPicker(false);
                      }}
                    >
                      <Text style={styles.pickerOptionText}>{symptom.symptom}</Text>
                      <Text style={styles.pickerOptionCategory}>{symptom.category}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Description Input */}
              <View style={styles.inputContainer}>
                <Ionicons name="chatbox" size={20} color={Colors.textSecondary} />
                <TextInput
                  style={[styles.textInput, styles.multilineInput]}
                  placeholder="Describe the issue (optional)"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
            </View>

            {/* Diagnose Button */}
            <TouchableOpacity
              style={[styles.diagnoseButton, isLoading && styles.diagnoseButtonDisabled]}
              onPress={diagnose}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <ActivityIndicator color={Colors.white} />
                  <Text style={styles.diagnoseButtonText}>Analyzing...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color={Colors.white} />
                  <Text style={styles.diagnoseButtonText}>Get AI Diagnosis</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Results */}
            <View style={styles.resultsContainer}>
              {/* Error Code Info */}
              {result.error_info && (
                <View style={styles.errorInfoCard}>
                  <View style={styles.errorInfoHeader}>
                    <View style={[
                      styles.severityBadge,
                      { backgroundColor: (SEVERITY_COLORS[result.error_info.severity] || Colors.gray400) + '20' }
                    ]}>
                      <Text style={[
                        styles.severityText,
                        { color: SEVERITY_COLORS[result.error_info.severity] || Colors.gray400 }
                      ]}>
                        {result.error_info.severity.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.errorCode}>Code {result.error_info.code}</Text>
                  </View>

                  <Text style={styles.errorMeaning}>{result.error_info.meaning}</Text>
                  <Text style={styles.errorBrand}>{result.error_info.brand}</Text>

                  <View style={styles.errorSection}>
                    <Text style={styles.errorSectionTitle}>Description</Text>
                    <Text style={styles.errorSectionText}>{result.error_info.description}</Text>
                  </View>

                  <View style={styles.errorSection}>
                    <Text style={styles.errorSectionTitle}>Possible Causes</Text>
                    {result.error_info.possible_causes.map((cause, i) => (
                      <View key={i} style={styles.bulletItem}>
                        <Ionicons name="ellipse" size={6} color={Colors.textSecondary} />
                        <Text style={styles.bulletText}>{cause}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.errorSection}>
                    <Text style={styles.errorSectionTitle}>Solutions</Text>
                    {result.error_info.solutions.map((solution, i) => (
                      <View key={i} style={styles.bulletItem}>
                        <Text style={styles.bulletNumber}>{i + 1}.</Text>
                        <Text style={styles.bulletText}>{solution}</Text>
                      </View>
                    ))}
                  </View>

                  {result.error_info.parts_needed.length > 0 && (
                    <View style={styles.partsSection}>
                      <Ionicons name="construct" size={16} color={Colors.primary} />
                      <Text style={styles.partsText}>
                        Parts that may be needed: {result.error_info.parts_needed.join(', ')}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* AI Guidance */}
              {result.ai_guidance && (
                <View style={styles.guidanceCard}>
                  <View style={styles.guidanceHeader}>
                    <Ionicons name="sparkles" size={20} color={Colors.primary} />
                    <Text style={styles.guidanceTitle}>AI Guidance</Text>
                  </View>
                  <Text style={styles.guidanceText}>{result.ai_guidance}</Text>
                </View>
              )}

              {/* Follow-up Questions */}
              {result.follow_up_questions.length > 0 && (
                <View style={styles.followUpSection}>
                  <Text style={styles.followUpTitle}>Suggested follow-ups:</Text>
                  {result.follow_up_questions.map((q, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.followUpSuggestion}
                      onPress={() => setFollowUpQuestion(q)}
                    >
                      <Ionicons name="chatbubble-outline" size={14} color={Colors.primary} />
                      <Text style={styles.followUpSuggestionText}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Follow-up Input */}
              <View style={styles.followUpInputContainer}>
                <TextInput
                  style={styles.followUpInput}
                  placeholder="Ask a follow-up question..."
                  value={followUpQuestion}
                  onChangeText={setFollowUpQuestion}
                  placeholderTextColor={Colors.textSecondary}
                />
                <TouchableOpacity
                  style={[styles.followUpButton, !followUpQuestion.trim() && styles.followUpButtonDisabled]}
                  onPress={askFollowUp}
                  disabled={!followUpQuestion.trim() || isAskingFollowUp}
                >
                  {isAskingFollowUp ? (
                    <ActivityIndicator color={Colors.white} size="small" />
                  ) : (
                    <Ionicons name="send" size={18} color={Colors.white} />
                  )}
                </TouchableOpacity>
              </View>

              {/* New Diagnosis Button */}
              <TouchableOpacity style={styles.newDiagnosisButton} onPress={resetForm}>
                <Ionicons name="add-circle" size={20} color={Colors.primary} />
                <Text style={styles.newDiagnosisText}>Start New Diagnosis</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  resetButton: {
    padding: Spacing.xs,
  },
  title: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  formSection: {
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  pickerText: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },
  pickerTextSelected: {
    color: Colors.text,
  },
  pickerOptions: {
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    maxHeight: 200,
  },
  pickerOption: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pickerOptionSelected: {
    backgroundColor: Colors.primary + '15',
  },
  pickerOptionText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  pickerOptionCategory: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  textInput: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    padding: 0,
  },
  multilineInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    paddingHorizontal: Spacing.md,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  diagnoseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  diagnoseButtonDisabled: {
    opacity: 0.7,
  },
  diagnoseButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
  },
  resultsContainer: {
    marginTop: Spacing.md,
  },
  errorInfoCard: {
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  errorInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  severityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  severityText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
  },
  errorCode: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  errorMeaning: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  errorBrand: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    marginBottom: Spacing.md,
  },
  errorSection: {
    marginBottom: Spacing.md,
  },
  errorSectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  errorSectionText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginVertical: 2,
  },
  bulletNumber: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
    width: 16,
  },
  bulletText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  partsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary + '10',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  partsText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
  },
  guidanceCard: {
    backgroundColor: Colors.primary + '10',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  guidanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  guidanceTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  guidanceText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    lineHeight: 22,
  },
  followUpSection: {
    marginBottom: Spacing.md,
  },
  followUpTitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  followUpSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  followUpSuggestionText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
  },
  followUpInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  followUpInput: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    ...Shadows.sm,
  },
  followUpButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  followUpButtonDisabled: {
    backgroundColor: Colors.gray300,
  },
  newDiagnosisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  newDiagnosisText: {
    color: Colors.primary,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
  },
});
