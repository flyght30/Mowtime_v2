/**
 * Equipment Scan Screen
 * Capture photos of HVAC equipment for AI-powered identification and analysis
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../../constants/theme';
import api from '../../../services/api';

interface EquipmentAnalysis {
  brand: string | null;
  model: string | null;
  equipment_type: string;
  estimated_age: string | null;
  tonnage: string | null;
  condition: string;
  visible_issues: string[];
  common_issues: string[];
  replacement_recommended: boolean;
  replacement_reason: string | null;
}

const EQUIPMENT_TYPE_ICONS: Record<string, string> = {
  condensing_unit: 'snow',
  air_handler: 'arrow-up',
  furnace: 'flame',
  heat_pump: 'swap-horizontal',
  mini_split: 'apps',
  package_unit: 'cube',
  unknown: 'help-circle',
};

const CONDITION_COLORS: Record<string, string> = {
  excellent: Colors.success,
  good: Colors.primary,
  fair: Colors.warning,
  poor: Colors.error,
  unknown: Colors.gray400,
};

export default function EquipmentScanScreen() {
  const router = useRouter();
  const { jobId, clientId } = useLocalSearchParams<{ jobId?: string; clientId?: string }>();

  const [image, setImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<EquipmentAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickImage = async (useCamera: boolean) => {
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permission Required', 'Please grant camera/photo access to use this feature.');
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
            allowsEditing: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
            allowsEditing: false,
          });

      if (!result.canceled && result.assets[0]) {
        setImage(result.assets[0].uri);
        setAnalysis(null);
        setError(null);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to select image');
    }
  };

  const analyzeEquipment = async () => {
    if (!image) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();

      const filename = image.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      formData.append('file', {
        uri: image,
        name: filename,
        type,
      } as any);

      if (jobId) formData.append('job_id', jobId);
      if (clientId) formData.append('client_id', clientId);

      const response = await api.post('/api/v1/ai/analyze-equipment', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data?.data) {
        setAnalysis(response.data.data);
      }
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.response?.data?.detail?.message || 'Failed to analyze equipment');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatEquipmentType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const saveToEquipment = () => {
    if (!analysis) return;
    Alert.alert(
      'Save Equipment',
      'This information will be saved to the client\'s equipment record.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: () => {
            // In real implementation, save to API
            Alert.alert('Saved', 'Equipment information has been saved.');
            router.back();
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Equipment Scan</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Instructions */}
      <View style={styles.instructionCard}>
        <Ionicons name="scan" size={24} color={Colors.primary} />
        <View style={styles.instructionText}>
          <Text style={styles.instructionTitle}>Take a clear photo</Text>
          <Text style={styles.instructionBody}>
            Capture the equipment nameplate or label for best results.
            Our AI will identify the brand, model, age, and condition.
          </Text>
        </View>
      </View>

      {/* Image Selection */}
      {!image ? (
        <View style={styles.imagePickerContainer}>
          <TouchableOpacity style={styles.pickerButton} onPress={() => pickImage(true)}>
            <Ionicons name="camera" size={48} color={Colors.primary} />
            <Text style={styles.pickerText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pickerButton} onPress={() => pickImage(false)}>
            <Ionicons name="images" size={48} color={Colors.primary} />
            <Text style={styles.pickerText}>Choose from Gallery</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.imageContainer}>
          <Image source={{ uri: image }} style={styles.previewImage} resizeMode="cover" />
          <TouchableOpacity
            style={styles.changeImageButton}
            onPress={() => {
              setImage(null);
              setAnalysis(null);
            }}
          >
            <Ionicons name="close-circle" size={28} color={Colors.white} />
          </TouchableOpacity>
        </View>
      )}

      {/* Analyze Button */}
      {image && !analysis && (
        <TouchableOpacity
          style={[styles.analyzeButton, isAnalyzing && styles.analyzingButton]}
          onPress={analyzeEquipment}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <>
              <ActivityIndicator color={Colors.white} />
              <Text style={styles.analyzeButtonText}>Identifying Equipment...</Text>
            </>
          ) : (
            <>
              <Ionicons name="sparkles" size={20} color={Colors.white} />
              <Text style={styles.analyzeButtonText}>Identify Equipment</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={20} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Analysis Results */}
      {analysis && (
        <View style={styles.resultsContainer}>
          {/* Equipment Header */}
          <View style={styles.equipmentHeader}>
            <View style={styles.equipmentIcon}>
              <Ionicons
                name={EQUIPMENT_TYPE_ICONS[analysis.equipment_type] || 'help-circle'}
                size={32}
                color={Colors.primary}
              />
            </View>
            <View style={styles.equipmentInfo}>
              <Text style={styles.equipmentBrand}>
                {analysis.brand || 'Unknown Brand'}
              </Text>
              <Text style={styles.equipmentModel}>
                {analysis.model || 'Model not detected'}
              </Text>
              <Text style={styles.equipmentType}>
                {formatEquipmentType(analysis.equipment_type)}
              </Text>
            </View>
          </View>

          {/* Quick Stats */}
          <View style={styles.statsRow}>
            {analysis.tonnage && (
              <View style={styles.statCard}>
                <Ionicons name="speedometer" size={20} color={Colors.primary} />
                <Text style={styles.statValue}>{analysis.tonnage}</Text>
                <Text style={styles.statLabel}>Capacity</Text>
              </View>
            )}
            {analysis.estimated_age && (
              <View style={styles.statCard}>
                <Ionicons name="calendar" size={20} color={Colors.warning} />
                <Text style={styles.statValue}>{analysis.estimated_age}</Text>
                <Text style={styles.statLabel}>Estimated Age</Text>
              </View>
            )}
            <View style={styles.statCard}>
              <Ionicons
                name="shield-checkmark"
                size={20}
                color={CONDITION_COLORS[analysis.condition]}
              />
              <Text style={[styles.statValue, { color: CONDITION_COLORS[analysis.condition] }]}>
                {analysis.condition.charAt(0).toUpperCase() + analysis.condition.slice(1)}
              </Text>
              <Text style={styles.statLabel}>Condition</Text>
            </View>
          </View>

          {/* Replacement Recommendation */}
          {analysis.replacement_recommended && (
            <View style={styles.replacementCard}>
              <View style={styles.replacementHeader}>
                <Ionicons name="warning" size={24} color={Colors.error} />
                <Text style={styles.replacementTitle}>Replacement Recommended</Text>
              </View>
              <Text style={styles.replacementReason}>
                {analysis.replacement_reason || 'This unit is approaching end of service life.'}
              </Text>
            </View>
          )}

          {/* Visible Issues */}
          {analysis.visible_issues.length > 0 && (
            <View style={styles.issuesCard}>
              <Text style={styles.issuesTitle}>Visible Issues</Text>
              {analysis.visible_issues.map((issue, index) => (
                <View key={index} style={styles.issueRow}>
                  <Ionicons name="alert-circle" size={16} color={Colors.error} />
                  <Text style={styles.issueText}>{issue}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Common Issues for This Equipment */}
          {analysis.common_issues.length > 0 && (
            <View style={styles.commonIssuesCard}>
              <Text style={styles.commonIssuesTitle}>Common Issues to Check</Text>
              {analysis.common_issues.map((issue, index) => (
                <View key={index} style={styles.commonIssueRow}>
                  <Ionicons name="information-circle" size={16} color={Colors.info} />
                  <Text style={styles.commonIssueText}>{issue}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Action Buttons */}
          <TouchableOpacity style={styles.saveButton} onPress={saveToEquipment}>
            <Ionicons name="save" size={20} color={Colors.white} />
            <Text style={styles.saveButtonText}>Save to Equipment Records</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.retakeButton}
            onPress={() => {
              setImage(null);
              setAnalysis(null);
            }}
          >
            <Ionicons name="camera" size={20} color={Colors.primary} />
            <Text style={styles.retakeButtonText}>Scan Another Unit</Text>
          </TouchableOpacity>
        </View>
      )}
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
  title: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  instructionCard: {
    flexDirection: 'row',
    backgroundColor: Colors.primary + '15',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  instructionText: {
    flex: 1,
  },
  instructionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  instructionBody: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  imagePickerContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  pickerButton: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
    borderWidth: 2,
    borderColor: Colors.primary + '30',
    borderStyle: 'dashed',
  },
  pickerText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
    marginTop: Spacing.sm,
  },
  imageContainer: {
    position: 'relative',
    marginBottom: Spacing.md,
  },
  previewImage: {
    width: '100%',
    height: 250,
    borderRadius: BorderRadius.lg,
  },
  changeImageButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  analyzingButton: {
    opacity: 0.7,
  },
  analyzeButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.error + '15',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  errorText: {
    color: Colors.error,
    fontSize: Typography.fontSize.sm,
    flex: 1,
  },
  resultsContainer: {
    marginTop: Spacing.md,
  },
  equipmentHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  equipmentIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  equipmentInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  equipmentBrand: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  equipmentModel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  equipmentType: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    ...Shadows.sm,
  },
  statValue: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  replacementCard: {
    backgroundColor: Colors.error + '15',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
  },
  replacementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  replacementTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.error,
  },
  replacementReason: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  issuesCard: {
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  issuesTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.error,
    marginBottom: Spacing.sm,
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  issueText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
  },
  commonIssuesCard: {
    backgroundColor: Colors.info + '10',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  commonIssuesTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.info,
    marginBottom: Spacing.sm,
  },
  commonIssueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  commonIssueText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.success,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
  },
  retakeButton: {
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
  retakeButtonText: {
    color: Colors.primary,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
  },
});
