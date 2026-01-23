/**
 * Photo Analysis Screen
 * Capture/upload property photos for AI-powered HVAC sizing estimation
 */

import React, { useState, useRef } from 'react';
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

interface PropertyAnalysis {
  sqft_estimate: number | null;
  sqft_confidence: number;
  sun_exposure: string;
  sun_confidence: number;
  window_percentage: number;
  window_confidence: number;
  roof_type: string;
  home_age: string;
  visible_equipment: string | null;
  notes: string;
  suggested_inputs: {
    sqft: number | null;
    sun_exposure: string;
    window_percentage: number;
    insulation: string;
  };
}

export default function PhotoAnalyzeScreen() {
  const router = useRouter();
  const { jobId, clientId } = useLocalSearchParams<{ jobId?: string; clientId?: string }>();

  const [image, setImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<PropertyAnalysis | null>(null);
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

  const analyzePhoto = async () => {
    if (!image) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      // Create form data
      const formData = new FormData();

      // Get file info from URI
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

      const response = await api.post('/api/v1/ai/analyze-property', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data?.data) {
        setAnalysis(response.data.data);
      }
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.response?.data?.detail?.message || 'Failed to analyze photo');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const renderConfidence = (confidence: number) => {
    const percent = Math.round(confidence * 100);
    let color = Colors.error;
    if (confidence >= 0.7) color = Colors.success;
    else if (confidence >= 0.4) color = Colors.warning;

    return (
      <View style={styles.confidenceBar}>
        <View style={[styles.confidenceFill, { width: `${percent}%`, backgroundColor: color }]} />
        <Text style={styles.confidenceText}>{percent}% confident</Text>
      </View>
    );
  };

  const useEstimates = () => {
    if (!analysis?.suggested_inputs) return;

    // Navigate back with the suggested values
    router.back();
    // In a real app, you'd pass these values back to the form
    Alert.alert(
      'Estimates Applied',
      `Square Footage: ${analysis.suggested_inputs.sqft}\n` +
        `Sun Exposure: ${analysis.suggested_inputs.sun_exposure}\n` +
        `Window %: ${analysis.suggested_inputs.window_percentage}%`
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Photo Analysis</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Instructions */}
      <View style={styles.instructionCard}>
        <Ionicons name="information-circle" size={24} color={Colors.primary} />
        <View style={styles.instructionText}>
          <Text style={styles.instructionTitle}>How to use</Text>
          <Text style={styles.instructionBody}>
            Take a photo of the property exterior. Our AI will estimate square footage,
            sun exposure, window coverage, and other factors for HVAC sizing.
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
          onPress={analyzePhoto}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <>
              <ActivityIndicator color={Colors.white} />
              <Text style={styles.analyzeButtonText}>Analyzing...</Text>
            </>
          ) : (
            <>
              <Ionicons name="sparkles" size={20} color={Colors.white} />
              <Text style={styles.analyzeButtonText}>Analyze with AI</Text>
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
          <Text style={styles.resultsTitle}>Analysis Results</Text>

          {/* Square Footage */}
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Ionicons name="resize" size={24} color={Colors.primary} />
              <Text style={styles.resultLabel}>Estimated Square Footage</Text>
            </View>
            <Text style={styles.resultValue}>
              {analysis.sqft_estimate?.toLocaleString() || 'Unknown'} sq ft
            </Text>
            {renderConfidence(analysis.sqft_confidence)}
          </View>

          {/* Sun Exposure */}
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Ionicons name="sunny" size={24} color={Colors.warning} />
              <Text style={styles.resultLabel}>Sun Exposure</Text>
            </View>
            <Text style={styles.resultValue}>
              {analysis.sun_exposure.charAt(0).toUpperCase() + analysis.sun_exposure.slice(1)}
            </Text>
            {renderConfidence(analysis.sun_confidence)}
          </View>

          {/* Window Coverage */}
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Ionicons name="grid" size={24} color={Colors.info} />
              <Text style={styles.resultLabel}>Window Coverage</Text>
            </View>
            <Text style={styles.resultValue}>{analysis.window_percentage}%</Text>
            {renderConfidence(analysis.window_confidence)}
          </View>

          {/* Additional Info */}
          <View style={styles.additionalInfo}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Roof Type:</Text>
              <Text style={styles.infoValue}>{analysis.roof_type}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Home Age:</Text>
              <Text style={styles.infoValue}>{analysis.home_age}</Text>
            </View>
            {analysis.visible_equipment && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Equipment:</Text>
                <Text style={styles.infoValue}>{analysis.visible_equipment}</Text>
              </View>
            )}
          </View>

          {/* Notes */}
          {analysis.notes && (
            <View style={styles.notesCard}>
              <Text style={styles.notesLabel}>Additional Notes</Text>
              <Text style={styles.notesText}>{analysis.notes}</Text>
            </View>
          )}

          {/* Use Estimates Button */}
          <TouchableOpacity style={styles.useButton} onPress={useEstimates}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
            <Text style={styles.useButtonText}>Use These Estimates</Text>
          </TouchableOpacity>

          {/* Retake Photo */}
          <TouchableOpacity
            style={styles.retakeButton}
            onPress={() => {
              setImage(null);
              setAnalysis(null);
            }}
          >
            <Ionicons name="camera" size={20} color={Colors.primary} />
            <Text style={styles.retakeButtonText}>Take Another Photo</Text>
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
  resultsTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  resultCard: {
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  resultLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  resultValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  confidenceBar: {
    height: 20,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: BorderRadius.sm,
  },
  confidenceText: {
    position: 'absolute',
    right: Spacing.xs,
    top: 2,
    fontSize: Typography.fontSize.xs,
    color: Colors.text,
  },
  additionalInfo: {
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    textTransform: 'capitalize',
  },
  notesCard: {
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  notesLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  notesText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  useButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.success,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  useButtonText: {
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
