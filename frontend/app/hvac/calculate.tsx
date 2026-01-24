/**
 * HVAC Load Calculator
 * Multi-step wizard for calculating heating/cooling loads
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../../constants/theme';
import {
  hvacApi,
  LoadCalculationInput,
  LoadCalculationResult,
  RecommendedEquipment,
} from '../../services/hvacApi';

type Step = 'property' | 'building' | 'climate' | 'results';

interface FormData extends LoadCalculationInput {
  zip_code: string;
}

const WINDOW_QUALITY_OPTIONS = [
  { value: 'single', label: 'Single Pane', description: 'Older windows, poor insulation' },
  { value: 'standard', label: 'Standard', description: 'Basic double pane' },
  { value: 'double', label: 'Double Pane', description: 'Energy efficient' },
  { value: 'triple', label: 'Triple Pane', description: 'Maximum efficiency' },
];

const INSULATION_OPTIONS = [
  { value: 'poor', label: 'Poor', description: 'Little to no insulation' },
  { value: 'average', label: 'Average', description: 'Standard insulation' },
  { value: 'good', label: 'Good', description: 'Above average insulation' },
  { value: 'excellent', label: 'Excellent', description: 'High R-value, spray foam' },
];

const SUN_EXPOSURE_OPTIONS = [
  { value: 'low', label: 'Low', description: 'Shaded, trees, north-facing' },
  { value: 'mixed', label: 'Mixed', description: 'Partial shade' },
  { value: 'high', label: 'High', description: 'Full sun exposure' },
];

export default function LoadCalculator() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    square_footage?: string;
    sun_exposure?: string;
    window_percentage?: string;
    insulation?: string;
    from_photo_analysis?: string;
    roof_type?: string;
    home_age?: string;
  }>();

  const [step, setStep] = useState<Step>('property');
  const [loading, setLoading] = useState(false);
  const [lookingUpZip, setLookingUpZip] = useState(false);
  const [result, setResult] = useState<LoadCalculationResult | null>(null);
  const [fromPhotoAnalysis, setFromPhotoAnalysis] = useState(false);
  const [photoAnalysisInfo, setPhotoAnalysisInfo] = useState<{
    roof_type?: string;
    home_age?: string;
  } | null>(null);

  const [formData, setFormData] = useState<FormData>({
    square_footage: 0,
    ceiling_height_ft: 9,
    floor_count: 1,
    window_count: 10,
    window_quality: 'standard',
    insulation_quality: 'average',
    sun_exposure: 'mixed',
    climate_zone: undefined,
    occupants: 4,
    zip_code: '',
  });

  // Apply photo analysis values if coming from that screen
  useEffect(() => {
    if (params.from_photo_analysis === 'true') {
      setFromPhotoAnalysis(true);
      setFormData((prev) => ({
        ...prev,
        square_footage: params.square_footage ? parseInt(params.square_footage) : prev.square_footage,
        sun_exposure: (params.sun_exposure as 'low' | 'mixed' | 'high') || prev.sun_exposure,
        insulation_quality: (params.insulation as 'poor' | 'average' | 'good' | 'excellent') || prev.insulation_quality,
        // Estimate window count from percentage (assuming 2000sqft base)
        window_count: params.window_percentage
          ? Math.round((parseInt(params.window_percentage) / 100) * 15 * (parseInt(params.square_footage || '2000') / 2000))
          : prev.window_count,
      }));
      setPhotoAnalysisInfo({
        roof_type: params.roof_type,
        home_age: params.home_age,
      });
    }
  }, [params]);

  const [climateInfo, setClimateInfo] = useState<{
    zone: number;
    name: string;
    design_temp_summer_f: number;
    design_temp_winter_f: number;
  } | null>(null);

  const updateForm = useCallback((field: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const lookupClimateZone = useCallback(async () => {
    if (formData.zip_code.length !== 5) {
      Alert.alert('Invalid ZIP', 'Please enter a valid 5-digit ZIP code');
      return;
    }

    setLookingUpZip(true);
    try {
      console.log('🔍 Looking up climate zone for ZIP:', formData.zip_code);
      const res = await hvacApi.getClimateZoneByZip(formData.zip_code);
      console.log('📡 API Response:', JSON.stringify(res, null, 2));
      
      if (res.success && res.data) {
        console.log('✅ Setting climate info');
        setClimateInfo({
          zone: res.data.climate_zone,
          name: res.data.zone_info.name,
          design_temp_summer_f: res.data.design_temperatures.design_temp_summer_f,
          design_temp_winter_f: res.data.design_temperatures.design_temp_winter_f,
        });
        updateForm('climate_zone', res.data.climate_zone);
      } else {
        console.error('❌ Invalid response:', res);
        Alert.alert('Error', 'Could not find climate zone for this ZIP code');
      }
    } catch (error) {
      console.error('❌ Climate lookup error:', error);
      Alert.alert('Error', 'Failed to look up climate zone');
    } finally {
      setLookingUpZip(false);
    }
  }, [formData.zip_code, updateForm]);

  const validateStep = useCallback((): boolean => {
    switch (step) {
      case 'property':
        if (!formData.square_footage || formData.square_footage < 100) {
          Alert.alert('Invalid Input', 'Please enter a valid square footage (min 100)');
          return false;
        }
        return true;
      case 'building':
        return true;
      case 'climate':
        if (!formData.climate_zone) {
          Alert.alert('Missing Info', 'Please look up the climate zone by ZIP code');
          return false;
        }
        return true;
      default:
        return true;
    }
  }, [step, formData]);

  const nextStep = useCallback(() => {
    if (!validateStep()) return;

    const steps: Step[] = ['property', 'building', 'climate', 'results'];
    const currentIndex = steps.indexOf(step);

    if (step === 'climate') {
      calculateLoad();
    } else if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  }, [step, validateStep]);

  const prevStep = useCallback(() => {
    const steps: Step[] = ['property', 'building', 'climate', 'results'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  }, [step]);

  const calculateLoad = useCallback(async () => {
    setLoading(true);
    try {
      const input: LoadCalculationInput = {
        square_footage: formData.square_footage,
        ceiling_height_ft: formData.ceiling_height_ft,
        floor_count: formData.floor_count,
        window_count: formData.window_count,
        window_quality: formData.window_quality,
        insulation_quality: formData.insulation_quality,
        sun_exposure: formData.sun_exposure,
        climate_zone: formData.climate_zone,
        occupants: formData.occupants,
      };

      const res = await hvacApi.calculateLoad(input);
      if (res.success && res.data) {
        setResult(res.data);
        setStep('results');
      } else {
        Alert.alert('Error', res.error || 'Failed to calculate load');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to calculate load. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [formData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatNumber = (num: number, decimals = 0) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  const createQuoteFromTier = useCallback(
    (tier: 'good' | 'better' | 'best') => {
      if (!result) return;
      router.push({
        pathname: '/hvac/quotes/new',
        params: {
          calc_id: result.calc_id,
          tier: tier,
        },
      });
    },
    [result, router]
  );

  const renderStepIndicator = () => {
    const steps = [
      { key: 'property', label: 'Property' },
      { key: 'building', label: 'Building' },
      { key: 'climate', label: 'Climate' },
      { key: 'results', label: 'Results' },
    ];

    const currentIndex = steps.findIndex((s) => s.key === step);

    return (
      <View style={styles.stepIndicator}>
        {steps.map((s, index) => (
          <React.Fragment key={s.key}>
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  index <= currentIndex && styles.stepCircleActive,
                  index < currentIndex && styles.stepCircleComplete,
                ]}
              >
                {index < currentIndex ? (
                  <Ionicons name="checkmark" size={14} color={Colors.white} />
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      index <= currentIndex && styles.stepNumberActive,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  index <= currentIndex && styles.stepLabelActive,
                ]}
              >
                {s.label}
              </Text>
            </View>
            {index < steps.length - 1 && (
              <View
                style={[
                  styles.stepLine,
                  index < currentIndex && styles.stepLineActive,
                ]}
              />
            )}
          </React.Fragment>
        ))}
      </View>
    );
  };

  const renderPropertyStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Property Information</Text>
      <Text style={styles.stepSubtitle}>
        Enter basic details about the property
      </Text>

      {fromPhotoAnalysis && (
        <View style={styles.photoAnalysisBanner}>
          <Ionicons name="sparkles" size={20} color={Colors.primary} />
          <View style={styles.photoAnalysisBannerText}>
            <Text style={styles.photoAnalysisBannerTitle}>AI Estimates Applied</Text>
            <Text style={styles.photoAnalysisBannerSubtitle}>
              Values pre-filled from photo analysis
              {photoAnalysisInfo?.home_age && ` (${photoAnalysisInfo.home_age} home)`}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Square Footage *</Text>
        <TextInput
          style={styles.textInput}
          keyboardType="numeric"
          placeholder="e.g., 2000"
          value={formData.square_footage ? String(formData.square_footage) : ''}
          onChangeText={(text) => updateForm('square_footage', parseInt(text) || 0)}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Ceiling Height (ft)</Text>
        <View style={styles.segmentedControl}>
          {[8, 9, 10, 12].map((height) => (
            <TouchableOpacity
              key={height}
              style={[
                styles.segmentButton,
                formData.ceiling_height_ft === height && styles.segmentButtonActive,
              ]}
              onPress={() => updateForm('ceiling_height_ft', height)}
            >
              <Text
                style={[
                  styles.segmentButtonText,
                  formData.ceiling_height_ft === height &&
                    styles.segmentButtonTextActive,
                ]}
              >
                {height}'
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Number of Floors</Text>
        <View style={styles.segmentedControl}>
          {[1, 2, 3].map((floors) => (
            <TouchableOpacity
              key={floors}
              style={[
                styles.segmentButton,
                formData.floor_count === floors && styles.segmentButtonActive,
              ]}
              onPress={() => updateForm('floor_count', floors)}
            >
              <Text
                style={[
                  styles.segmentButtonText,
                  formData.floor_count === floors && styles.segmentButtonTextActive,
                ]}
              >
                {floors}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Number of Occupants</Text>
        <TextInput
          style={styles.textInput}
          keyboardType="numeric"
          placeholder="e.g., 4"
          value={formData.occupants ? String(formData.occupants) : ''}
          onChangeText={(text) => updateForm('occupants', parseInt(text) || 0)}
        />
      </View>
    </View>
  );

  const renderBuildingStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Building Characteristics</Text>
      <Text style={styles.stepSubtitle}>
        These factors affect heating and cooling requirements
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Number of Windows</Text>
        <TextInput
          style={styles.textInput}
          keyboardType="numeric"
          placeholder="e.g., 10"
          value={formData.window_count ? String(formData.window_count) : ''}
          onChangeText={(text) => updateForm('window_count', parseInt(text) || 0)}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Window Quality</Text>
        {WINDOW_QUALITY_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.optionCard,
              formData.window_quality === option.value && styles.optionCardActive,
            ]}
            onPress={() => updateForm('window_quality', option.value)}
          >
            <View style={styles.optionContent}>
              <Text
                style={[
                  styles.optionLabel,
                  formData.window_quality === option.value && styles.optionLabelActive,
                ]}
              >
                {option.label}
              </Text>
              <Text style={styles.optionDescription}>{option.description}</Text>
            </View>
            {formData.window_quality === option.value && (
              <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Insulation Quality</Text>
        {INSULATION_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.optionCard,
              formData.insulation_quality === option.value && styles.optionCardActive,
            ]}
            onPress={() => updateForm('insulation_quality', option.value)}
          >
            <View style={styles.optionContent}>
              <Text
                style={[
                  styles.optionLabel,
                  formData.insulation_quality === option.value &&
                    styles.optionLabelActive,
                ]}
              >
                {option.label}
              </Text>
              <Text style={styles.optionDescription}>{option.description}</Text>
            </View>
            {formData.insulation_quality === option.value && (
              <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Sun Exposure</Text>
        <View style={styles.segmentedControl}>
          {SUN_EXPOSURE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.segmentButton,
                styles.segmentButtonWide,
                formData.sun_exposure === option.value && styles.segmentButtonActive,
              ]}
              onPress={() => updateForm('sun_exposure', option.value)}
            >
              <Text
                style={[
                  styles.segmentButtonText,
                  formData.sun_exposure === option.value &&
                    styles.segmentButtonTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderClimateStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Climate Zone</Text>
      <Text style={styles.stepSubtitle}>
        Enter the property ZIP code to determine climate zone
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>ZIP Code *</Text>
        <View style={styles.zipInputRow}>
          <TextInput
            style={[styles.textInput, styles.zipInput]}
            keyboardType="numeric"
            placeholder="e.g., 75001"
            maxLength={5}
            value={formData.zip_code}
            onChangeText={(text) => updateForm('zip_code', text.replace(/\D/g, ''))}
          />
          <TouchableOpacity
            style={styles.lookupButton}
            onPress={lookupClimateZone}
            disabled={lookingUpZip}
          >
            {lookingUpZip ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.lookupButtonText}>Look Up</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {climateInfo && (
        <View style={styles.climateCard}>
          <View style={styles.climateHeader}>
            <Ionicons name="location" size={24} color={Colors.primary} />
            <Text style={styles.climateTitle}>Climate Zone {climateInfo.zone}</Text>
          </View>
          <Text style={styles.climateName}>{climateInfo.name}</Text>
          <View style={styles.climateTempRow}>
            <View style={styles.climateTemp}>
              <Ionicons name="sunny" size={20} color="#FF9800" />
              <Text style={styles.climateTempLabel}>Summer Design</Text>
              <Text style={styles.climateTempValue}>
                {climateInfo.design_temp_summer_f}°F
              </Text>
            </View>
            <View style={styles.climateTemp}>
              <Ionicons name="snow" size={20} color="#2196F3" />
              <Text style={styles.climateTempLabel}>Winter Design</Text>
              <Text style={styles.climateTempValue}>
                {climateInfo.design_temp_winter_f}°F
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );

  const renderTierCard = (rec: RecommendedEquipment) => {
    const tierColors = {
      good: '#4CAF50',
      better: '#2196F3',
      best: '#9C27B0',
    };

    const tierLabels = {
      good: 'Good',
      better: 'Better',
      best: 'Best',
    };

    return (
      <View
        key={rec.tier}
        style={[styles.tierCard, { borderLeftColor: tierColors[rec.tier] }]}
      >
        <View style={styles.tierHeader}>
          <View
            style={[styles.tierBadge, { backgroundColor: tierColors[rec.tier] }]}
          >
            <Text style={styles.tierBadgeText}>{tierLabels[rec.tier]}</Text>
          </View>
          <Text style={styles.tierTotal}>
            {formatCurrency(rec.total_equipment_cost)}
          </Text>
        </View>

        <View style={styles.tierEquipment}>
          <View style={styles.equipmentItem}>
            <Ionicons name="snow-outline" size={18} color={Colors.gray600} />
            <View style={styles.equipmentInfo}>
              <Text style={styles.equipmentName}>{rec.ac.name}</Text>
              <Text style={styles.equipmentSpec}>
                {rec.ac.seer} SEER - {formatCurrency(rec.ac.cost)}
              </Text>
            </View>
          </View>
          <View style={styles.equipmentItem}>
            <Ionicons name="flame-outline" size={18} color={Colors.gray600} />
            <View style={styles.equipmentInfo}>
              <Text style={styles.equipmentName}>{rec.furnace.name}</Text>
              <Text style={styles.equipmentSpec}>
                {rec.furnace.afue}% AFUE - {formatCurrency(rec.furnace.cost)}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.createQuoteButton, { backgroundColor: tierColors[rec.tier] }]}
          onPress={() => createQuoteFromTier(rec.tier)}
        >
          <Ionicons name="document-text-outline" size={18} color={Colors.white} />
          <Text style={styles.createQuoteButtonText}>Create Quote</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderResultsStep = () => {
    if (!result) return null;

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Load Calculation Results</Text>
        <Text style={styles.stepSubtitle}>
          Based on {formatNumber(result.input_data.square_footage)} sq ft property
        </Text>

        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Ionicons name="snow" size={24} color="#2196F3" />
              <Text style={styles.summaryLabel}>Cooling Load</Text>
              <Text style={styles.summaryValue}>
                {formatNumber(result.cooling_btuh)} BTU/h
              </Text>
              <Text style={styles.summarySubvalue}>
                {result.cooling_tons.toFixed(1)} tons
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Ionicons name="flame" size={24} color="#FF9800" />
              <Text style={styles.summaryLabel}>Heating Load</Text>
              <Text style={styles.summaryValue}>
                {formatNumber(result.heating_btuh)} BTU/h
              </Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Ionicons name="resize" size={24} color="#4CAF50" />
              <Text style={styles.summaryLabel}>Recommended Size</Text>
              <Text style={styles.summaryValue}>
                {result.recommended_ac_tons} ton system
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Ionicons name="speedometer" size={24} color="#9C27B0" />
              <Text style={styles.summaryLabel}>Airflow Required</Text>
              <Text style={styles.summaryValue}>
                {formatNumber(result.cfm_required)} CFM
              </Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {result.notes && result.notes.length > 0 && (
          <View style={styles.notesCard}>
            <Text style={styles.notesTitle}>Notes</Text>
            {result.notes.map((note, index) => (
              <View key={index} style={styles.noteItem}>
                <Ionicons name="information-circle" size={16} color={Colors.info} />
                <Text style={styles.noteText}>{note}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Equipment Recommendations */}
        <Text style={styles.sectionTitle}>Recommended Equipment</Text>
        {result.recommended_equipment.map(renderTierCard)}
      </View>
    );
  };

  const renderCurrentStep = () => {
    switch (step) {
      case 'property':
        return renderPropertyStep();
      case 'building':
        return renderBuildingStep();
      case 'climate':
        return renderClimateStep();
      case 'results':
        return renderResultsStep();
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {renderStepIndicator()}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {renderCurrentStep()}
      </ScrollView>

      {/* Navigation Buttons */}
      <View style={styles.navigation}>
        {step !== 'property' && step !== 'results' && (
          <TouchableOpacity style={styles.backButton} onPress={prevStep}>
            <Ionicons name="arrow-back" size={20} color={Colors.gray600} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}

        {step === 'results' ? (
          <TouchableOpacity
            style={styles.newCalcButton}
            onPress={() => {
              setStep('property');
              setResult(null);
              setClimateInfo(null);
            }}
          >
            <Ionicons name="refresh" size={20} color={Colors.primary} />
            <Text style={styles.newCalcButtonText}>New Calculation</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextButton, loading && styles.nextButtonDisabled]}
            onPress={nextStep}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Text style={styles.nextButtonText}>
                  {step === 'climate' ? 'Calculate' : 'Next'}
                </Text>
                <Ionicons name="arrow-forward" size={20} color={Colors.white} />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  stepItem: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.gray200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: Colors.primary,
  },
  stepCircleComplete: {
    backgroundColor: Colors.success,
  },
  stepNumber: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.gray500,
  },
  stepNumberActive: {
    color: Colors.white,
  },
  stepLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray400,
    marginTop: 4,
  },
  stepLabelActive: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: Colors.gray200,
    marginHorizontal: Spacing.xs,
    marginBottom: 16,
  },
  stepLineActive: {
    backgroundColor: Colors.success,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  stepSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  textInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  segmentButtonWide: {
    flex: 1,
  },
  segmentButtonActive: {
    backgroundColor: Colors.white,
    ...Shadows.sm,
  },
  segmentButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.gray500,
  },
  segmentButtonTextActive: {
    color: Colors.primary,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  optionCardActive: {
    borderColor: Colors.primary,
    backgroundColor: '#EEF2FF',
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  optionLabelActive: {
    color: Colors.primary,
  },
  optionDescription: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  zipInputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  zipInput: {
    flex: 1,
  },
  lookupButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    minWidth: 100,
  },
  lookupButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    textAlign: 'center',
  },
  climateCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Shadows.md,
  },
  climateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  climateTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginLeft: Spacing.sm,
  },
  climateName: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  climateTempRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  climateTemp: {
    alignItems: 'center',
  },
  climateTempLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  climateTempValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  backButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.gray600,
    marginLeft: Spacing.xs,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    marginLeft: 'auto',
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.white,
    marginRight: Spacing.xs,
  },
  newCalcButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    marginLeft: 'auto',
  },
  newCalcButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
    marginLeft: Spacing.xs,
  },
  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.md,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  summaryValue: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  summarySubvalue: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  notesCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  notesTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  noteText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray700,
    marginLeft: Spacing.xs,
    flex: 1,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  tierCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    ...Shadows.md,
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  tierBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  tierBadgeText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
    fontSize: Typography.fontSize.sm,
  },
  tierTotal: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  tierEquipment: {
    marginBottom: Spacing.md,
  },
  equipmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  equipmentInfo: {
    marginLeft: Spacing.sm,
    flex: 1,
  },
  equipmentName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  equipmentSpec: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  createQuoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  createQuoteButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    marginLeft: Spacing.xs,
  },
  photoAnalysisBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '15',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  photoAnalysisBannerText: {
    flex: 1,
  },
  photoAnalysisBannerTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  photoAnalysisBannerSubtitle: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
