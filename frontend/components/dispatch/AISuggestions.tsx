/**
 * AI Suggestions Panel
 * Displays AI-powered technician recommendations for job assignment
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { api } from '../../services/api';

interface TechPerformance {
  on_time_rate: number | null;
  avg_rating: number | null;
  total_jobs: number;
}

interface TechSuggestion {
  tech_id: string;
  tech_name: string;
  score: number;
  reasons: string[];
  eta_minutes: number | null;
  distance_miles: number | null;
  status: string;
  available_hours: number;
  performance: TechPerformance;
  is_preferred: boolean;
}

interface AISuggestionsProps {
  jobId: string;
  targetDate?: string;
  onSelectTech: (techId: string, techName: string) => void;
  onClose?: () => void;
}

export default function AISuggestions({
  jobId,
  targetDate,
  onSelectTech,
  onClose,
}: AISuggestionsProps) {
  const [suggestions, setSuggestions] = useState<TechSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferredTechId, setPreferredTechId] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.post('/dispatch/suggest-tech', null, {
        params: {
          job_id: jobId,
          target_date: targetDate,
        },
      });

      setSuggestions(response.data.data.suggestions);
      setPreferredTechId(response.data.data.customer_preferred_tech);
    } catch (err: any) {
      console.error('Failed to fetch suggestions:', err);
      setError(err.message || 'Failed to load AI suggestions');
    } finally {
      setLoading(false);
    }
  }, [jobId, targetDate]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return Colors.success;
    if (score >= 60) return '#22C55E'; // Green
    if (score >= 40) return Colors.warning;
    return Colors.error;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return Colors.success;
      case 'enroute':
        return Colors.primary;
      case 'on_site':
        return Colors.warning;
      default:
        return Colors.textSecondary;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available':
        return 'Available';
      case 'enroute':
        return 'En Route';
      case 'on_site':
        return 'On Site';
      case 'complete':
        return 'Just Finished';
      default:
        return status;
    }
  };

  const renderSuggestion = (suggestion: TechSuggestion, index: number) => {
    const scoreColor = getScoreColor(suggestion.score);
    const statusColor = getStatusColor(suggestion.status);
    const isTopPick = index === 0;

    return (
      <TouchableOpacity
        key={suggestion.tech_id}
        style={[
          styles.suggestionCard,
          isTopPick && styles.topPickCard,
          suggestion.is_preferred && styles.preferredCard,
        ]}
        onPress={() => onSelectTech(suggestion.tech_id, suggestion.tech_name)}
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.rankBadge}>
            {isTopPick ? (
              <Ionicons name="star" size={14} color={Colors.warning} />
            ) : (
              <Text style={styles.rankText}>#{index + 1}</Text>
            )}
          </View>

          <View style={styles.techInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.techName}>{suggestion.tech_name}</Text>
              {suggestion.is_preferred && (
                <View style={styles.preferredBadge}>
                  <Ionicons name="heart" size={10} color={Colors.error} />
                  <Text style={styles.preferredText}>Preferred</Text>
                </View>
              )}
            </View>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={styles.statusText}>{getStatusLabel(suggestion.status)}</Text>
              {suggestion.eta_minutes && (
                <Text style={styles.etaText}>
                  {suggestion.distance_miles?.toFixed(1)} mi ({suggestion.eta_minutes} min)
                </Text>
              )}
            </View>
          </View>

          <View style={[styles.scoreBadge, { backgroundColor: scoreColor + '15' }]}>
            <Text style={[styles.scoreText, { color: scoreColor }]}>
              {suggestion.score}
            </Text>
          </View>
        </View>

        {/* Reasons */}
        <View style={styles.reasonsContainer}>
          {suggestion.reasons.slice(0, 4).map((reason, i) => (
            <View key={i} style={styles.reasonItem}>
              <Ionicons
                name={reason.includes('Not ') || reason.includes('Below') || reason.includes('Limited')
                  ? 'close-circle'
                  : 'checkmark-circle'}
                size={14}
                color={reason.includes('Not ') || reason.includes('Below') || reason.includes('Limited')
                  ? Colors.error
                  : Colors.success}
              />
              <Text style={styles.reasonText} numberOfLines={1}>
                {reason}
              </Text>
            </View>
          ))}
        </View>

        {/* Performance stats */}
        {suggestion.performance.total_jobs >= 5 && (
          <View style={styles.performanceRow}>
            {suggestion.performance.on_time_rate !== null && (
              <View style={styles.statItem}>
                <Ionicons name="time-outline" size={12} color={Colors.textSecondary} />
                <Text style={styles.statText}>
                  {Math.round(suggestion.performance.on_time_rate * 100)}% on-time
                </Text>
              </View>
            )}
            {suggestion.performance.avg_rating !== null && (
              <View style={styles.statItem}>
                <Ionicons name="star" size={12} color={Colors.warning} />
                <Text style={styles.statText}>
                  {suggestion.performance.avg_rating.toFixed(1)}
                </Text>
              </View>
            )}
            <View style={styles.statItem}>
              <Ionicons name="briefcase-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.statText}>
                {suggestion.performance.total_jobs} jobs
              </Text>
            </View>
          </View>
        )}

        {/* Assign button */}
        <TouchableOpacity
          style={[styles.assignButton, isTopPick && styles.topPickAssignButton]}
          onPress={() => onSelectTech(suggestion.tech_id, suggestion.tech_name)}
        >
          <Ionicons
            name="person-add"
            size={16}
            color={isTopPick ? Colors.white : Colors.primary}
          />
          <Text style={[styles.assignButtonText, isTopPick && styles.topPickAssignText]}>
            {isTopPick ? 'Assign Best Match' : 'Assign'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="bulb" size={20} color={Colors.primary} />
            <Text style={styles.title}>AI Recommendations</Text>
          </View>
          {onClose && (
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Analyzing technician availability...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="bulb" size={20} color={Colors.primary} />
            <Text style={styles.title}>AI Recommendations</Text>
          </View>
          {onClose && (
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={40} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchSuggestions}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (suggestions.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="bulb" size={20} color={Colors.primary} />
            <Text style={styles.title}>AI Recommendations</Text>
          </View>
          {onClose && (
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={40} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>No available technicians found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="bulb" size={20} color={Colors.primary} />
          <Text style={styles.title}>AI Recommendations</Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.subtitle}>
        Based on distance, availability, skills, and performance history
      </Text>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {suggestions.slice(0, 5).map((suggestion, index) =>
          renderSuggestion(suggestion, index)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    ...Shadows.md,
    maxHeight: 500,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  subtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  loadingContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  errorContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  errorText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.error,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.md,
  },
  retryText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  emptyContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  suggestionCard: {
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  topPickCard: {
    borderColor: Colors.primary,
    borderWidth: 2,
    backgroundColor: Colors.primary + '05',
  },
  preferredCard: {
    borderColor: Colors.error + '50',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.gray200,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  rankText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
  },
  techInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  techName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  preferredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.error + '15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  preferredText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.error,
    fontWeight: Typography.fontWeight.medium,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  etaText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginLeft: Spacing.sm,
  },
  scoreBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
  },
  reasonsContainer: {
    marginBottom: Spacing.sm,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 2,
  },
  reasonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    flex: 1,
  },
  performanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary + '10',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  topPickAssignButton: {
    backgroundColor: Colors.primary,
  },
  assignButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
  },
  topPickAssignText: {
    color: Colors.white,
  },
});
