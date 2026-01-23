/**
 * VoiceRecorder Component
 * Records audio notes for job completion with AI transcription and summarization
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { techApi } from '../../services/techApi';

interface VoiceRecorderProps {
  jobId: string;
  appointmentId?: string;
  onSummaryApproved?: (summary: string) => void;
  maxDuration?: number; // seconds
}

type RecordingState = 'idle' | 'recording' | 'recorded' | 'playing' | 'uploading' | 'processing' | 'ready' | 'editing';

interface VoiceNoteData {
  voice_note_id: string;
  status: 'uploaded' | 'transcribing' | 'summarizing' | 'complete' | 'failed';
  transcription?: string;
  summary?: string;
  summary_edited?: string;
  error_message?: string;
}

export default function VoiceRecorder({
  jobId,
  appointmentId,
  onSummaryApproved,
  maxDuration = 120, // 2 minutes default
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [playbackPosition, setPlaybackPosition] = useState(0);

  // Voice note data from backend
  const [voiceNote, setVoiceNote] = useState<VoiceNoteData | null>(null);
  const [editedSummary, setEditedSummary] = useState('');
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync();
      }
      if (sound) {
        sound.unloadAsync();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [recording, sound, pollInterval]);

  // Pulse animation while recording
  useEffect(() => {
    if (state === 'recording') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state, pulseAnim]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant microphone permission to record voice notes.'
        );
        return;
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setState('recording');
      setDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const uri = recording.getURI();
      setRecording(null);
      setRecordingUri(uri);
      setState('recorded');
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const uploadRecording = async () => {
    if (!recordingUri) return;

    setState('uploading');

    try {
      // Create form data
      const formData = new FormData();
      formData.append('file', {
        uri: recordingUri,
        type: 'audio/m4a',
        name: 'voice_note.m4a',
      } as any);
      formData.append('job_id', jobId);
      if (appointmentId) {
        formData.append('appointment_id', appointmentId);
      }
      formData.append('duration_seconds', duration.toString());

      // Upload to backend
      const response = await techApi.post('/voice-notes/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const noteData = response.data.data;
      setVoiceNote(noteData);
      setState('processing');

      // Start polling for status
      startPolling(noteData.voice_note_id);
    } catch (error: any) {
      console.error('Failed to upload recording:', error);
      Alert.alert('Upload Failed', error.message || 'Failed to upload voice note');
      setState('recorded');
    }
  };

  const startPolling = (noteId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await techApi.get(`/voice-notes/${noteId}`);
        const noteData = response.data.data;
        setVoiceNote(noteData);

        if (noteData.status === 'complete') {
          clearInterval(interval);
          setPollInterval(null);
          setEditedSummary(noteData.summary || '');
          setState('ready');
        } else if (noteData.status === 'failed') {
          clearInterval(interval);
          setPollInterval(null);
          Alert.alert('Processing Failed', noteData.error_message || 'Voice note processing failed');
          setState('recorded');
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds

    setPollInterval(interval);
  };

  const playRecording = async () => {
    if (!recordingUri) return;

    try {
      if (sound) {
        await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: recordingUri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );

      setSound(newSound);
      setState('playing');
    } catch (error) {
      console.error('Failed to play recording:', error);
    }
  };

  const stopPlayback = async () => {
    if (!sound) return;

    try {
      await sound.stopAsync();
      setState(voiceNote?.status === 'complete' ? 'ready' : 'recorded');
      setPlaybackPosition(0);
    } catch (error) {
      console.error('Failed to stop playback:', error);
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPlaybackPosition(status.positionMillis / 1000);
      if (status.didJustFinish) {
        setState(voiceNote?.status === 'complete' ? 'ready' : 'recorded');
        setPlaybackPosition(0);
      }
    }
  };

  const deleteRecording = () => {
    Alert.alert(
      'Delete Recording',
      'Are you sure you want to delete this recording?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (sound) {
              sound.unloadAsync();
              setSound(null);
            }
            if (pollInterval) {
              clearInterval(pollInterval);
              setPollInterval(null);
            }
            setRecordingUri(null);
            setVoiceNote(null);
            setDuration(0);
            setEditedSummary('');
            setState('idle');
          },
        },
      ]
    );
  };

  const approveSummary = async () => {
    if (!voiceNote) return;

    try {
      const response = await techApi.post(
        `/voice-notes/${voiceNote.voice_note_id}/approve`,
        null,
        {
          params: {
            edited_summary: editedSummary !== voiceNote.summary ? editedSummary : undefined,
          },
        }
      );

      Alert.alert('Success', 'Voice note summary saved to job');

      if (onSummaryApproved) {
        onSummaryApproved(editedSummary);
      }

      // Reset to idle state
      setRecordingUri(null);
      setVoiceNote(null);
      setDuration(0);
      setEditedSummary('');
      setState('idle');
    } catch (error: any) {
      console.error('Failed to approve summary:', error);
      Alert.alert('Error', error.message || 'Failed to save summary');
    }
  };

  const getProcessingMessage = () => {
    if (!voiceNote) return 'Uploading...';
    switch (voiceNote.status) {
      case 'uploaded':
        return 'Preparing...';
      case 'transcribing':
        return 'Transcribing audio...';
      case 'summarizing':
        return 'Creating summary...';
      default:
        return 'Processing...';
    }
  };

  return (
    <View style={styles.container}>
      {/* Idle State - Record Button */}
      {state === 'idle' && (
        <TouchableOpacity
          style={styles.recordButton}
          onPress={startRecording}
        >
          <View style={styles.micIcon}>
            <Ionicons name="mic" size={24} color={Colors.primary} />
          </View>
          <View style={styles.buttonText}>
            <Text style={styles.title}>Voice Note</Text>
            <Text style={styles.subtitle}>Tap to record (max {maxDuration / 60} min)</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Recording State */}
      {state === 'recording' && (
        <View style={styles.recordingContainer}>
          <View style={styles.recordingHeader}>
            <Animated.View
              style={[
                styles.recordingIndicator,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <View style={styles.recordingDot} />
            </Animated.View>
            <Text style={styles.recordingText}>Recording...</Text>
            <Text style={styles.timerText}>{formatTime(duration)}</Text>
          </View>

          <View style={styles.waveform}>
            {[...Array(20)].map((_, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.waveBar,
                  {
                    height: 10 + Math.random() * 30,
                    opacity: pulseAnim,
                  },
                ]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={styles.stopButton}
            onPress={stopRecording}
          >
            <Ionicons name="stop" size={24} color={Colors.white} />
            <Text style={styles.stopButtonText}>Stop Recording</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Recorded State - Ready to Upload */}
      {state === 'recorded' && (
        <View style={styles.recordedContainer}>
          <View style={styles.recordedHeader}>
            <Ionicons name="mic" size={20} color={Colors.success} />
            <Text style={styles.recordedText}>Voice note recorded</Text>
            <Text style={styles.durationText}>{formatTime(duration)}</Text>
          </View>

          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${duration > 0 ? (playbackPosition / duration) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {formatTime(playbackPosition)} / {formatTime(duration)}
            </Text>
          </View>

          <View style={styles.controlButtons}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={state === 'playing' ? stopPlayback : playRecording}
            >
              <Ionicons
                name={state === 'playing' ? 'pause' : 'play'}
                size={20}
                color={Colors.primary}
              />
              <Text style={styles.controlButtonText}>
                {state === 'playing' ? 'Pause' : 'Play'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, styles.deleteButton]}
              onPress={deleteRecording}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
              <Text style={[styles.controlButtonText, styles.deleteText]}>
                Delete
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.uploadButton}
            onPress={uploadRecording}
          >
            <Ionicons name="cloud-upload" size={20} color={Colors.white} />
            <Text style={styles.uploadButtonText}>Process with AI</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Uploading/Processing State */}
      {(state === 'uploading' || state === 'processing') && (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.processingText}>{getProcessingMessage()}</Text>
          <Text style={styles.processingSubtext}>
            {state === 'processing' ? 'This usually takes 10-20 seconds' : 'Uploading audio...'}
          </Text>
        </View>
      )}

      {/* Ready State - Summary Available */}
      {(state === 'ready' || state === 'editing') && voiceNote && (
        <View style={styles.summaryContainer}>
          <View style={styles.summaryHeader}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.summaryTitle}>AI Summary Ready</Text>
          </View>

          {/* Original transcription (collapsible) */}
          {voiceNote.transcription && (
            <View style={styles.transcriptionSection}>
              <Text style={styles.sectionLabel}>Original Recording:</Text>
              <Text style={styles.transcriptionText} numberOfLines={3}>
                "{voiceNote.transcription}"
              </Text>
            </View>
          )}

          {/* Editable summary */}
          <View style={styles.summarySection}>
            <Text style={styles.sectionLabel}>Professional Summary:</Text>
            {state === 'editing' ? (
              <TextInput
                style={styles.summaryInput}
                value={editedSummary}
                onChangeText={setEditedSummary}
                multiline
                textAlignVertical="top"
                placeholder="Edit the summary..."
              />
            ) : (
              <TouchableOpacity onPress={() => setState('editing')}>
                <Text style={styles.summaryText}>{editedSummary}</Text>
                <Text style={styles.editHint}>Tap to edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Action buttons */}
          <View style={styles.actionButtons}>
            {state === 'editing' ? (
              <>
                <TouchableOpacity
                  style={[styles.actionButton, styles.cancelButton]}
                  onPress={() => {
                    setEditedSummary(voiceNote.summary || '');
                    setState('ready');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.saveButton]}
                  onPress={() => setState('ready')}
                >
                  <Text style={styles.saveButtonText}>Done Editing</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteActionButton]}
                  onPress={deleteRecording}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.approveButton]}
                  onPress={approveSummary}
                >
                  <Ionicons name="checkmark" size={20} color={Colors.white} />
                  <Text style={styles.approveButtonText}>Use This Summary</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.sm,
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '10',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  micIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  buttonText: {
    flex: 1,
  },
  title: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  subtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  recordingContainer: {
    backgroundColor: Colors.error + '10',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.error + '30',
  },
  recordingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  recordingIndicator: {
    marginRight: Spacing.sm,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.error,
  },
  recordingText: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.error,
  },
  timerText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.error,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    gap: 2,
    marginBottom: Spacing.md,
  },
  waveBar: {
    width: 3,
    backgroundColor: Colors.error,
    borderRadius: 2,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.error,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  stopButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.white,
  },
  recordedContainer: {
    backgroundColor: Colors.success + '10',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  recordedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  recordedText: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.success,
    marginLeft: Spacing.sm,
  },
  durationText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  progressContainer: {
    marginBottom: Spacing.md,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.gray200,
    borderRadius: 2,
    marginBottom: Spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.success,
    borderRadius: 2,
  },
  progressText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  controlButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.white,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  controlButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
  },
  deleteButton: {
    borderColor: Colors.error + '30',
  },
  deleteText: {
    color: Colors.error,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  uploadButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.white,
  },
  processingContainer: {
    backgroundColor: Colors.gray100,
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  processingText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginTop: Spacing.md,
  },
  processingSubtext: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  summaryContainer: {
    backgroundColor: Colors.primary + '08',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  summaryTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.success,
    marginLeft: Spacing.sm,
  },
  transcriptionSection: {
    marginBottom: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.sm,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
  },
  transcriptionText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  summarySection: {
    marginBottom: Spacing.md,
  },
  summaryText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: 22,
  },
  summaryInput: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: 22,
    backgroundColor: Colors.white,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 100,
  },
  editHint: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    marginTop: Spacing.xs,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  deleteActionButton: {
    backgroundColor: Colors.error + '10',
    paddingHorizontal: Spacing.md,
  },
  approveButton: {
    flex: 1,
    backgroundColor: Colors.success,
    paddingVertical: Spacing.md,
  },
  approveButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.white,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: Colors.gray200,
  },
  cancelButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  saveButton: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  saveButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.white,
  },
});
