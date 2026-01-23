/**
 * FollowUpDashboard Component
 * Dashboard for managing post-job follow-up calls and review requests
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import api from '../services/api';

interface FollowUp {
  followup_id: string;
  job_id: string;
  client_id: string;
  client_name: string | null;
  client_phone: string | null;
  followup_type: string;
  status: string;
  scheduled_for: string;
  completed_at: string | null;
  sentiment: string | null;
  satisfied: boolean | null;
  concerns: string[];
  notes: string | null;
}

interface FollowUpStats {
  total_scheduled: number;
  completed: number;
  positive: number;
  negative: number;
  no_answer: number;
  satisfaction_rate: number;
  avg_response_rate: number;
}

interface FollowUpScript {
  greeting: string;
  satisfaction_question: string;
  positive_response: string;
  negative_response: string;
  review_request: string;
  closing: string;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: Colors.info,
  calling: Colors.warning,
  completed: Colors.success,
  positive: Colors.success,
  negative: Colors.error,
  no_answer: Colors.gray400,
  cancelled: Colors.gray300,
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  calling: 'In Progress',
  completed: 'Completed',
  positive: 'Positive',
  negative: 'Needs Attention',
  no_answer: 'No Answer',
  cancelled: 'Cancelled',
};

const FOLLOWUP_TYPE_LABELS: Record<string, string> = {
  satisfaction: 'Satisfaction Check',
  review_request: 'Review Request',
  warranty: 'Warranty Check-in',
  maintenance: 'Maintenance Reminder',
};

interface Props {
  onSelectFollowUp?: (followUp: FollowUp) => void;
}

export default function FollowUpDashboard({ onSelectFollowUp }: Props) {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [pendingFollowUps, setPendingFollowUps] = useState<FollowUp[]>([]);
  const [stats, setStats] = useState<FollowUpStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(null);
  const [script, setScript] = useState<FollowUpScript | null>(null);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeOutcome, setCompleteOutcome] = useState<string>('positive');
  const [completeNotes, setCompleteNotes] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [followUpsRes, pendingRes, statsRes] = await Promise.all([
        api.get('/api/v1/followups', {
          params: selectedFilter !== 'all' ? { status: selectedFilter } : undefined,
        }),
        api.get('/api/v1/followups/pending'),
        api.get('/api/v1/followups/stats/summary'),
      ]);

      setFollowUps(followUpsRes.data?.data || []);
      setPendingFollowUps(pendingRes.data?.data || []);
      setStats(statsRes.data?.data || null);
    } catch (err) {
      console.error('Failed to load follow-ups:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [selectedFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleViewScript = async (followUp: FollowUp) => {
    setSelectedFollowUp(followUp);
    try {
      const response = await api.post(`/api/v1/followups/${followUp.followup_id}/script`);
      if (response.data?.data) {
        setScript(response.data.data);
        setShowScriptModal(true);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to generate script');
    }
  };

  const handleStartCall = (followUp: FollowUp) => {
    setSelectedFollowUp(followUp);
    setShowCompleteModal(true);
  };

  const handleCompleteFollowUp = async () => {
    if (!selectedFollowUp) return;

    try {
      await api.post(`/api/v1/followups/${selectedFollowUp.followup_id}/complete`, null, {
        params: {
          outcome: completeOutcome,
          notes: completeNotes || undefined,
        },
      });

      setShowCompleteModal(false);
      setSelectedFollowUp(null);
      setCompleteOutcome('positive');
      setCompleteNotes('');
      loadData();
      Alert.alert('Success', 'Follow-up marked as complete');
    } catch (err) {
      Alert.alert('Error', 'Failed to complete follow-up');
    }
  };

  const handleCancelFollowUp = async (followUp: FollowUp) => {
    Alert.alert(
      'Cancel Follow-Up',
      'Are you sure you want to cancel this follow-up?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/v1/followups/${followUp.followup_id}`);
              loadData();
            } catch (err) {
              Alert.alert('Error', 'Failed to cancel follow-up');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading follow-ups...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Header */}
      {stats && (
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.total_scheduled}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.success }]}>{stats.positive}</Text>
            <Text style={styles.statLabel}>Positive</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.error }]}>{stats.negative}</Text>
            <Text style={styles.statLabel}>Negative</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{Math.round(stats.satisfaction_rate * 100)}%</Text>
            <Text style={styles.statLabel}>Satisfaction</Text>
          </View>
        </View>
      )}

      {/* Pending Alert */}
      {pendingFollowUps.length > 0 && (
        <View style={styles.pendingAlert}>
          <Ionicons name="time" size={20} color={Colors.warning} />
          <Text style={styles.pendingText}>
            {pendingFollowUps.length} follow-up{pendingFollowUps.length > 1 ? 's' : ''} due now
          </Text>
        </View>
      )}

      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
        {['all', 'scheduled', 'positive', 'negative', 'no_answer'].map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[styles.filterTab, selectedFilter === filter && styles.filterTabActive]}
            onPress={() => setSelectedFilter(filter)}
          >
            <Text style={[styles.filterText, selectedFilter === filter && styles.filterTextActive]}>
              {filter === 'all' ? 'All' : STATUS_LABELS[filter] || filter}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Follow-ups List */}
      <ScrollView
        style={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {followUps.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="call-outline" size={48} color={Colors.gray300} />
            <Text style={styles.emptyText}>No follow-ups found</Text>
          </View>
        ) : (
          followUps.map((followUp) => (
            <TouchableOpacity
              key={followUp.followup_id}
              style={[
                styles.followUpCard,
                pendingFollowUps.some(p => p.followup_id === followUp.followup_id) && styles.pendingCard,
              ]}
              onPress={() => onSelectFollowUp?.(followUp)}
            >
              <View style={styles.followUpHeader}>
                <View style={styles.clientInfo}>
                  <Text style={styles.clientName}>
                    {followUp.client_name || 'Unknown Client'}
                  </Text>
                  {followUp.client_phone && (
                    <Text style={styles.clientPhone}>{followUp.client_phone}</Text>
                  )}
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: (STATUS_COLORS[followUp.status] || Colors.gray400) + '20' },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: STATUS_COLORS[followUp.status] || Colors.gray400 },
                    ]}
                  >
                    {STATUS_LABELS[followUp.status] || followUp.status}
                  </Text>
                </View>
              </View>

              <View style={styles.followUpDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar" size={14} color={Colors.textSecondary} />
                  <Text style={styles.detailText}>{formatDate(followUp.scheduled_for)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="bookmark" size={14} color={Colors.textSecondary} />
                  <Text style={styles.detailText}>
                    {FOLLOWUP_TYPE_LABELS[followUp.followup_type] || followUp.followup_type}
                  </Text>
                </View>
              </View>

              {followUp.concerns.length > 0 && (
                <View style={styles.concernsContainer}>
                  <Text style={styles.concernsLabel}>Concerns:</Text>
                  {followUp.concerns.map((concern, i) => (
                    <Text key={i} style={styles.concernText}>- {concern}</Text>
                  ))}
                </View>
              )}

              {followUp.status === 'scheduled' && (
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleViewScript(followUp)}
                  >
                    <Ionicons name="document-text" size={16} color={Colors.primary} />
                    <Text style={styles.actionButtonText}>Script</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.primaryButton]}
                    onPress={() => handleStartCall(followUp)}
                  >
                    <Ionicons name="call" size={16} color={Colors.white} />
                    <Text style={styles.primaryButtonText}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => handleCancelFollowUp(followUp)}
                  >
                    <Ionicons name="close" size={16} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Script Modal */}
      <Modal visible={showScriptModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Call Script</Text>
              <TouchableOpacity onPress={() => setShowScriptModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {script && (
              <ScrollView style={styles.scriptContainer}>
                <View style={styles.scriptSection}>
                  <Text style={styles.scriptLabel}>Greeting</Text>
                  <Text style={styles.scriptText}>{script.greeting}</Text>
                </View>
                <View style={styles.scriptSection}>
                  <Text style={styles.scriptLabel}>Satisfaction Question</Text>
                  <Text style={styles.scriptText}>{script.satisfaction_question}</Text>
                </View>
                <View style={styles.scriptSection}>
                  <Text style={[styles.scriptLabel, { color: Colors.success }]}>
                    If Positive
                  </Text>
                  <Text style={styles.scriptText}>{script.positive_response}</Text>
                </View>
                <View style={styles.scriptSection}>
                  <Text style={[styles.scriptLabel, { color: Colors.error }]}>
                    If Negative
                  </Text>
                  <Text style={styles.scriptText}>{script.negative_response}</Text>
                </View>
                <View style={styles.scriptSection}>
                  <Text style={styles.scriptLabel}>Review Request</Text>
                  <Text style={styles.scriptText}>{script.review_request}</Text>
                </View>
                <View style={styles.scriptSection}>
                  <Text style={styles.scriptLabel}>Closing</Text>
                  <Text style={styles.scriptText}>{script.closing}</Text>
                </View>
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.modalPrimaryButton}
              onPress={() => {
                setShowScriptModal(false);
                if (selectedFollowUp) handleStartCall(selectedFollowUp);
              }}
            >
              <Ionicons name="call" size={20} color={Colors.white} />
              <Text style={styles.modalPrimaryButtonText}>Start Call</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Complete Modal */}
      <Modal visible={showCompleteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Complete Follow-Up</Text>
              <TouchableOpacity onPress={() => setShowCompleteModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.outcomeLabel}>Call Outcome</Text>
            <View style={styles.outcomeButtons}>
              {['positive', 'negative', 'no_answer'].map((outcome) => (
                <TouchableOpacity
                  key={outcome}
                  style={[
                    styles.outcomeButton,
                    completeOutcome === outcome && styles.outcomeButtonActive,
                    completeOutcome === outcome && {
                      borderColor: STATUS_COLORS[outcome],
                      backgroundColor: STATUS_COLORS[outcome] + '15',
                    },
                  ]}
                  onPress={() => setCompleteOutcome(outcome)}
                >
                  <Ionicons
                    name={outcome === 'positive' ? 'happy' : outcome === 'negative' ? 'sad' : 'call'}
                    size={24}
                    color={completeOutcome === outcome ? STATUS_COLORS[outcome] : Colors.gray400}
                  />
                  <Text
                    style={[
                      styles.outcomeButtonText,
                      completeOutcome === outcome && { color: STATUS_COLORS[outcome] },
                    ]}
                  >
                    {STATUS_LABELS[outcome]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.notesLabel}>Notes (optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Add notes about the call..."
              value={completeNotes}
              onChangeText={setCompleteNotes}
              multiline
              numberOfLines={3}
              placeholderTextColor={Colors.textSecondary}
            />

            <TouchableOpacity
              style={styles.modalPrimaryButton}
              onPress={handleCompleteFollowUp}
            >
              <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
              <Text style={styles.modalPrimaryButtonText}>Mark Complete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
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
  loadingText: {
    marginTop: Spacing.sm,
    color: Colors.textSecondary,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    ...Shadows.sm,
  },
  statValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  statLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  pendingAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warning + '20',
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  pendingText: {
    color: Colors.warning,
    fontWeight: Typography.fontWeight.semibold,
  },
  filterContainer: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
  },
  filterText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyText: {
    marginTop: Spacing.sm,
    color: Colors.textSecondary,
  },
  followUpCard: {
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  pendingCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  followUpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  clientPhone: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
  },
  followUpDetails: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  concernsContainer: {
    backgroundColor: Colors.error + '10',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  concernsLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.error,
    marginBottom: 4,
  },
  concernText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary + '15',
  },
  actionButtonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
  },
  primaryButtonText: {
    color: Colors.white,
  },
  cancelButton: {
    marginLeft: 'auto',
    padding: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  scriptContainer: {
    marginBottom: Spacing.md,
  },
  scriptSection: {
    marginBottom: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.sm,
  },
  scriptLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  scriptText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: 22,
  },
  outcomeLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  outcomeButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  outcomeButton: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  outcomeButtonActive: {
    borderWidth: 2,
  },
  outcomeButtonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray400,
    marginTop: 4,
  },
  notesLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  notesInput: {
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.md,
  },
  modalPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  modalPrimaryButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
  },
});
