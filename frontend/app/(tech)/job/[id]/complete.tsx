/**
 * Job Completion Screen
 * Capture photos, signature, voice notes, and completion notes
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../../../constants/theme';
import { useTech } from '../../../../contexts/TechContext';
import SignaturePad from '../../../../components/tech/SignaturePad';
import VoiceRecorder from '../../../../components/tech/VoiceRecorder';
import { useOfflineQueue } from '../../../../hooks/useOfflineQueue';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm * 2) / 3;

interface MaterialItem {
  name: string;
  quantity: number;
  price: number;
}

export default function CompleteJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { currentJob, completeJob, refreshJobs } = useTech();
  const { isOnline, queueLength, makeRequest } = useOfflineQueue();

  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [voiceNoteUri, setVoiceNoteUri] = useState<string | null>(null);
  const [voiceNoteDuration, setVoiceNoteDuration] = useState(0);
  const [laborHours, setLaborHours] = useState('');
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [finalPrice, setFinalPrice] = useState(
    currentJob?.estimated_price?.toString() || ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [newMaterialName, setNewMaterialName] = useState('');

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant camera permission to take photos.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          setPhotos([...photos, `data:image/jpeg;base64,${asset.base64}`]);
        } else if (asset.uri) {
          setPhotos([...photos, asset.uri]);
        }
      }
    } catch (error) {
      console.error('Failed to take photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant photo library permission to select photos.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
        allowsMultipleSelection: true,
        selectionLimit: 5 - photos.length,
      });

      if (!result.canceled && result.assets) {
        const newPhotos = result.assets.map(asset => {
          if (asset.base64) {
            return `data:image/jpeg;base64,${asset.base64}`;
          }
          return asset.uri;
        });
        setPhotos([...photos, ...newPhotos].slice(0, 5));
      }
    } catch (error) {
      console.error('Failed to pick photo:', error);
      Alert.alert('Error', 'Failed to select photos');
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleAddMaterial = () => {
    if (!newMaterialName.trim()) {
      setShowAddMaterial(false);
      return;
    }
    setMaterials([...materials, { name: newMaterialName.trim(), quantity: 1, price: 0 }]);
    setNewMaterialName('');
    setShowAddMaterial(false);
  };

  const handleRemoveMaterial = (index: number) => {
    setMaterials(materials.filter((_, i) => i !== index));
  };

  const handleVoiceRecording = (uri: string, duration: number) => {
    setVoiceNoteUri(uri);
    setVoiceNoteDuration(duration);
  };

  const handleSignature = (sig: string) => {
    setSignature(sig);
  };

  const handleSubmit = async () => {
    if (!currentJob) {
      Alert.alert('Error', 'No active job found');
      return;
    }

    // Validation
    if (photos.length === 0) {
      Alert.alert(
        'Photos Required',
        'Please take at least one photo of the completed work.'
      );
      return;
    }

    const offlineWarning = !isOnline
      ? '\n\nNote: You are currently offline. The completion will be queued and submitted when connectivity is restored.'
      : '';

    Alert.alert(
      'Complete Job',
      `Are you sure you want to mark this job as complete?${offlineWarning}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              const completionData = {
                notes: notes.trim() || undefined,
                photos,
                signature: signature || undefined,
                voice_note_uri: voiceNoteUri || undefined,
                voice_note_duration: voiceNoteDuration || undefined,
                final_price: finalPrice ? parseFloat(finalPrice) : undefined,
                materials_used: materials.length > 0 ? materials : undefined,
                labor_hours: laborHours ? parseFloat(laborHours) : undefined,
              };

              if (isOnline) {
                await completeJob(currentJob.job_id, completionData);
                await refreshJobs();

                Alert.alert(
                  'Job Completed',
                  'Great work! The job has been marked as complete.',
                  [
                    {
                      text: 'OK',
                      onPress: () => router.replace('/(tech)'),
                    },
                  ]
                );
              } else {
                // Queue for later
                await makeRequest(
                  `/technicians/me/jobs/${currentJob.job_id}/complete`,
                  'POST',
                  completionData,
                  { offlineCapable: true }
                );

                Alert.alert(
                  'Completion Queued',
                  'Your job completion has been saved and will be submitted when you are back online.',
                  [
                    {
                      text: 'OK',
                      onPress: () => router.replace('/(tech)'),
                    },
                  ]
                );
              }
            } catch (error) {
              console.error('Failed to complete job:', error);
              Alert.alert('Error', 'Failed to complete job. Please try again.');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Offline Banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline" size={16} color={Colors.white} />
          <Text style={styles.offlineText}>
            Offline Mode {queueLength > 0 ? `(${queueLength} queued)` : ''}
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photos Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos</Text>
          <Text style={styles.sectionSubtitle}>
            Take photos of the completed work (required)
          </Text>

          <View style={styles.photosGrid}>
            {photos.map((photo, index) => (
              <View key={index} style={styles.photoContainer}>
                <Image source={{ uri: photo }} style={styles.photo} />
                <TouchableOpacity
                  style={styles.removePhotoButton}
                  onPress={() => handleRemovePhoto(index)}
                >
                  <Ionicons name="close" size={16} color={Colors.white} />
                </TouchableOpacity>
              </View>
            ))}

            {photos.length < 5 && (
              <View style={styles.photoButtons}>
                <TouchableOpacity
                  style={styles.addPhotoButton}
                  onPress={handleTakePhoto}
                >
                  <Ionicons name="camera" size={24} color={Colors.primary} />
                  <Text style={styles.addPhotoText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addPhotoButton}
                  onPress={handlePickPhoto}
                >
                  <Ionicons name="images" size={24} color={Colors.primary} />
                  <Text style={styles.addPhotoText}>Gallery</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Notes Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Completion Notes</Text>
          <Text style={styles.sectionSubtitle}>
            Add notes about the work performed
          </Text>

          <TextInput
            style={styles.notesInput}
            placeholder="Describe the work completed, any issues encountered, or recommendations..."
            placeholderTextColor={Colors.gray400}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={notes}
            onChangeText={setNotes}
          />

          {/* Voice Recorder */}
          <VoiceRecorder
            onRecordingComplete={handleVoiceRecording}
            maxDuration={120}
          />
        </View>

        {/* Labor & Materials */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Labor & Materials</Text>

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Labor Hours</Text>
            <TextInput
              style={styles.numberInput}
              placeholder="0"
              keyboardType="decimal-pad"
              value={laborHours}
              onChangeText={setLaborHours}
            />
          </View>

          <View style={styles.materialsHeader}>
            <Text style={styles.inputLabel}>Materials Used</Text>
            <TouchableOpacity
              style={styles.addMaterialButton}
              onPress={() => setShowAddMaterial(true)}
            >
              <Ionicons name="add" size={16} color={Colors.primary} />
              <Text style={styles.addMaterialText}>Add</Text>
            </TouchableOpacity>
          </View>

          {showAddMaterial && (
            <View style={styles.addMaterialInput}>
              <TextInput
                style={styles.materialNameInput}
                placeholder="Material name..."
                placeholderTextColor={Colors.gray400}
                value={newMaterialName}
                onChangeText={setNewMaterialName}
                onSubmitEditing={handleAddMaterial}
                autoFocus
              />
              <TouchableOpacity
                style={styles.addMaterialConfirm}
                onPress={handleAddMaterial}
              >
                <Ionicons name="checkmark" size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          )}

          {materials.length === 0 && !showAddMaterial ? (
            <Text style={styles.noMaterials}>No materials added</Text>
          ) : (
            materials.map((material, index) => (
              <View key={index} style={styles.materialRow}>
                <View style={styles.materialInfo}>
                  <Text style={styles.materialName}>{material.name}</Text>
                  <View style={styles.materialInputs}>
                    <TextInput
                      style={styles.materialQtyInput}
                      placeholder="Qty"
                      keyboardType="number-pad"
                      value={material.quantity.toString()}
                      onChangeText={(text) => {
                        const updated = [...materials];
                        updated[index].quantity = parseInt(text) || 0;
                        setMaterials(updated);
                      }}
                    />
                    <TextInput
                      style={styles.materialPriceInput}
                      placeholder="$0.00"
                      keyboardType="decimal-pad"
                      value={material.price ? material.price.toString() : ''}
                      onChangeText={(text) => {
                        const updated = [...materials];
                        updated[index].price = parseFloat(text) || 0;
                        setMaterials(updated);
                      }}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => handleRemoveMaterial(index)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Final Price */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Final Price</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>
              {currentJob?.estimated_price
                ? `Estimated: $${currentJob.estimated_price.toFixed(2)}`
                : 'Enter final price'}
            </Text>
            <View style={styles.priceInputContainer}>
              <Text style={styles.priceCurrency}>$</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={finalPrice}
                onChangeText={setFinalPrice}
              />
            </View>
          </View>
        </View>

        {/* Signature Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Signature</Text>
          <Text style={styles.sectionSubtitle}>
            Get customer signature for verification
          </Text>

          <SignaturePad
            onSave={handleSignature}
            signature={signature}
            customerName={currentJob?.client?.name}
          />
        </View>
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (isSubmitting || photos.length === 0) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting || photos.length === 0}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color={Colors.white} />
              <Text style={styles.submitButtonText}>Complete Job</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.warning,
    paddingVertical: Spacing.sm,
  },
  offlineText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  section: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  photoContainer: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  addPhotoButton: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPhotoText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    marginTop: 4,
  },
  notesInput: {
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    minHeight: 100,
    marginBottom: Spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  numberInput: {
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    width: 80,
    textAlign: 'center',
  },
  materialsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  addMaterialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.primary + '15',
    borderRadius: BorderRadius.sm,
  },
  addMaterialText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  addMaterialInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  materialNameInput: {
    flex: 1,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  addMaterialConfirm: {
    padding: Spacing.sm,
  },
  noMaterials: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  materialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  materialInfo: {
    flex: 1,
  },
  materialName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginBottom: 4,
  },
  materialInputs: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  materialQtyInput: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    width: 50,
    textAlign: 'center',
  },
  materialPriceInput: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    width: 80,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
  },
  priceCurrency: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  priceInput: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    paddingVertical: Spacing.sm,
    minWidth: 80,
  },
  footer: {
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.success,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.gray300,
  },
  submitButtonText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.white,
  },
});
