/**
 * TranscriptModal Component
 * Displays full call transcript with conversation turns
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { api } from '../../services/api';
import AudioPlayer from './AudioPlayer';

interface ConversationTurn {
  role: 'ai' | 'caller' | 'system';
  content: string;
  timestamp: string;
  intent_detected?: string;
}

interface CallDetails {
  call_id: string;
  from_number: string;
  to_number: string;
  direction: 'inbound' | 'outbound';
  status: string;
  intent: string;
  conversation_summary?: string;
  duration_seconds: number;
  recording_url?: string;
  started_at?: string;
  ended_at?: string;
  created_at: string;
  client_id?: string;
  appointment_id?: string;
}

interface TranscriptModalProps {
  visible: boolean;
  callId: string;
  onClose: () => void;
  onViewAppointment?: (appointmentId: string) => void;
}

export default function TranscriptModal({
  visible,
  callId,
  onClose,
  onViewAppointment,
}: TranscriptModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [call, setCall] = useState<CallDetails | null>(null);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);

  useEffect(() => {
    if (visible && callId) {
      fetchCallDetails();
    }
  }, [visible, callId]);

  const fetchCallDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch call details and conversation in parallel
      const [callRes, convRes] = await Promise.all([
        api.get(`/voice/calls/${callId}`),
        api.get(`/voice/calls/${callId}/conversation`),
      ]);

      setCall(callRes.data.data);
      setTurns(convRes.data.data.turns || []);
    } catch (err: any) {
      console.error('Failed to fetch call details:', err);
      setError(err.message || 'Failed to load call details');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  const getIntentLabel = (intent: string) => {
    const labels: Record<string, string> = {
      booking: 'Appointment Booked',
      reschedule: 'Reschedule Request',
      cancel: 'Cancellation',
      inquiry: 'Information Inquiry',
      support: 'Support Request',
      unknown: 'General Call',
    };
    return labels[intent] || intent;
  };

  const getIntentColor = (intent: string) => {
    const colors: Record<string, string> = {
      booking: Colors.success,
      reschedule: Colors.warning,
      cancel: Colors.error,
      inquiry: Colors.primary,
      support: Colors.warning,
    };
    return colors[intent] || Colors.textSecondary;
  };

  const renderTurn = (turn: ConversationTurn, index: number) => {
    const isAI = turn.role === 'ai';
    const isSystem = turn.role === 'system';

    if (isSystem) {
      return (
        <View key={index} style={styles.systemTurn}>
          <Text style={styles.systemText}>{turn.content}</Text>
        </View>
      );
    }

    return (
      <View
        key={index}
        style={[styles.turnContainer, isAI ? styles.aiTurn : styles.callerTurn]}
      >
        <View style={styles.turnHeader}>
          <View style={[styles.turnIcon, isAI ? styles.aiIcon : styles.callerIcon]}>
            <Ionicons
              name={isAI ? 'hardware-chip' : 'person'}
              size={14}
              color={isAI ? Colors.primary : Colors.textSecondary}
            />
          </View>
          <Text style={styles.turnRole}>{isAI ? 'AI Assistant' : 'Caller'}</Text>
          {turn.timestamp && (
            <Text style={styles.turnTime}>{formatTime(turn.timestamp)}</Text>
          )}
        </View>
        <Text style={styles.turnContent}>{turn.content}</Text>
        {turn.intent_detected && (
          <View style={styles.intentBadge}>
            <Text style={styles.intentText}>
              Intent: {turn.intent_detected}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Call Transcript</Text>
          <View style={styles.placeholder} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading transcript...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchCallDetails}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : call ? (
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Call Info Card */}
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>From</Text>
                  <Text style={styles.infoValue}>
                    {formatPhoneNumber(call.from_number)}
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Duration</Text>
                  <Text style={styles.infoValue}>
                    {formatDuration(call.duration_seconds)}
                  </Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Date & Time</Text>
                  <Text style={styles.infoValue}>
                    {new Date(call.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Outcome</Text>
                  <View
                    style={[
                      styles.outcomeBadge,
                      { backgroundColor: getIntentColor(call.intent) + '15' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.outcomeText,
                        { color: getIntentColor(call.intent) },
                      ]}
                    >
                      {getIntentLabel(call.intent)}
                    </Text>
                  </View>
                </View>
              </View>

              {call.conversation_summary && (
                <View style={styles.summaryContainer}>
                  <Text style={styles.summaryLabel}>Summary</Text>
                  <Text style={styles.summaryText}>{call.conversation_summary}</Text>
                </View>
              )}

              {call.appointment_id && onViewAppointment && (
                <TouchableOpacity
                  style={styles.viewJobButton}
                  onPress={() => onViewAppointment(call.appointment_id!)}
                >
                  <Ionicons name="calendar" size={18} color={Colors.primary} />
                  <Text style={styles.viewJobText}>View Created Appointment</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Audio Player */}
            {call.recording_url && (
              <View style={styles.audioSection}>
                <Text style={styles.sectionTitle}>Recording</Text>
                <AudioPlayer
                  uri={call.recording_url}
                  duration={call.duration_seconds}
                />
              </View>
            )}

            {/* Transcript */}
            <View style={styles.transcriptSection}>
              <Text style={styles.sectionTitle}>Conversation</Text>
              {turns.length > 0 ? (
                turns.map((turn, index) => renderTurn(turn, index))
              ) : (
                <View style={styles.noTranscript}>
                  <Ionicons
                    name="chatbubbles-outline"
                    size={40}
                    color={Colors.textSecondary}
                  />
                  <Text style={styles.noTranscriptText}>
                    No transcript available
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  placeholder: {
    width: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  errorText: {
    fontSize: Typography.fontSize.base,
    color: Colors.error,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.md,
  },
  retryText: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  content: {
    flex: 1,
  },
  infoCard: {
    margin: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    ...Shadows.sm,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },
  outcomeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  outcomeText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
  },
  summaryContainer: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  summaryLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: 22,
  },
  viewJobButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.md,
  },
  viewJobText: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  audioSection: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  transcriptSection: {
    margin: Spacing.md,
    marginTop: 0,
  },
  turnContainer: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  aiTurn: {
    backgroundColor: Colors.primary + '10',
    marginRight: Spacing.xl,
  },
  callerTurn: {
    backgroundColor: Colors.gray100,
    marginLeft: Spacing.xl,
  },
  systemTurn: {
    alignItems: 'center',
    marginVertical: Spacing.sm,
  },
  systemText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  turnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  turnIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.xs,
  },
  aiIcon: {
    backgroundColor: Colors.primary + '20',
  },
  callerIcon: {
    backgroundColor: Colors.gray200,
  },
  turnRole: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  turnTime: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  turnContent: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: 22,
  },
  intentBadge: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    backgroundColor: Colors.gray200,
    borderRadius: BorderRadius.sm,
  },
  intentText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  noTranscript: {
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  noTranscriptText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },
});
