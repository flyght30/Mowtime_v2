/**
 * HVAC Quotes List
 * View and manage all HVAC quotes
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../../../constants/theme';
import { hvacApi, Quote } from '../../../services/hvacApi';

type StatusFilter = 'all' | 'draft' | 'sent' | 'accepted' | 'rejected';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#E3F2FD', text: '#1976D2' },
  sent: { bg: '#FFF3E0', text: '#F57C00' },
  viewed: { bg: '#F3E5F5', text: '#7B1FA2' },
  accepted: { bg: '#E8F5E9', text: '#388E3C' },
  rejected: { bg: '#FFEBEE', text: '#D32F2F' },
  expired: { bg: '#ECEFF1', text: '#546E7A' },
};

export default function QuotesList() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    sent: 0,
    accepted: 0,
    totalValue: 0,
    acceptedValue: 0,
  });

  const fetchQuotes = useCallback(async () => {
    try {
      const filters = statusFilter !== 'all' ? { status: statusFilter } : undefined;
      const res = await hvacApi.getQuotes(filters);
      if (res.success && res.data) {
        setQuotes(res.data.quotes);

        // Calculate stats
        const allQuotes = res.data.quotes;
        setStats({
          total: allQuotes.length,
          draft: allQuotes.filter((q) => q.status === 'draft').length,
          sent: allQuotes.filter((q) => q.status === 'sent').length,
          accepted: allQuotes.filter((q) => q.status === 'accepted').length,
          totalValue: allQuotes.reduce((sum, q) => sum + q.total, 0),
          acceptedValue: allQuotes
            .filter((q) => q.status === 'accepted')
            .reduce((sum, q) => sum + q.total, 0),
        });
      }
    } catch (error) {
      console.error('Failed to fetch quotes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchQuotes();
  }, [fetchQuotes]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'good':
        return '#4CAF50';
      case 'better':
        return '#2196F3';
      case 'best':
        return '#9C27B0';
      default:
        return Colors.gray500;
    }
  };

  const renderQuoteItem = ({ item }: { item: Quote }) => {
    const statusColor = STATUS_COLORS[item.status] || STATUS_COLORS.draft;

    return (
      <TouchableOpacity
        style={styles.quoteCard}
        onPress={() => router.push(`/hvac/quotes/${item.quote_id}`)}
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.quoteNumber}>Quote #{item.quote_id.slice(-6)}</Text>
            <Text style={styles.quoteDate}>{formatDate(item.created_at)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.statusText, { color: statusColor.text }]}>
              {item.status}
            </Text>
          </View>
        </View>

        <View style={styles.quoteDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Job Type</Text>
            <Text style={styles.detailValue}>
              {item.job_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Tier</Text>
            <View style={[styles.tierBadge, { backgroundColor: getTierColor(item.tier) }]}>
              <Text style={styles.tierText}>{item.tier.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(item.total)}</Text>
          </View>
          <View style={styles.profitSection}>
            <Text style={styles.profitLabel}>Profit</Text>
            <Text style={styles.profitValue}>
              {formatCurrency(item.profit)} ({item.margin_percent.toFixed(0)}%)
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading quotes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Summary */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total Quotes</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.accepted}</Text>
          <Text style={styles.statLabel}>Accepted</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: Colors.success }]}>
            {formatCurrency(stats.acceptedValue)}
          </Text>
          <Text style={styles.statLabel}>Won Value</Text>
        </View>
      </View>

      {/* Status Filter */}
      <View style={styles.filterContainer}>
        {STATUS_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.value}
            style={[
              styles.filterChip,
              statusFilter === filter.value && styles.filterChipActive,
            ]}
            onPress={() => setStatusFilter(filter.value)}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === filter.value && styles.filterChipTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quote List */}
      <FlatList
        data={quotes}
        keyExtractor={(item) => item.quote_id}
        renderItem={renderQuoteItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={Colors.gray400} />
            <Text style={styles.emptyText}>No quotes found</Text>
            <Text style={styles.emptySubtext}>
              Create a quote from a load calculation
            </Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => router.push('/hvac/calculate')}
            >
              <Ionicons name="calculator-outline" size={20} color={Colors.white} />
              <Text style={styles.createButtonText}>Start Load Calculation</Text>
            </TouchableOpacity>
          </View>
        }
      />
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
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
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
  filterContainer: {
    flexDirection: 'row',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.full,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
  },
  filterChipText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray600,
  },
  filterChipTextActive: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
  },
  listContent: {
    padding: Spacing.md,
  },
  quoteCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  quoteNumber: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  quoteDate: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    textTransform: 'capitalize',
  },
  quoteDetails: {
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  detailLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  tierBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  tierText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  totalLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  totalValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  profitSection: {
    flex: 1,
    marginLeft: Spacing.lg,
  },
  profitLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  profitValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.success,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
  },
  emptyText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  createButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    marginLeft: Spacing.sm,
  },
});
