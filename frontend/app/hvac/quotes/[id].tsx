/**
 * HVAC Quote Detail
 * View quote details, send to customer, and manage status
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../../../constants/theme';
import { hvacApi, Quote } from '../../../services/hvacApi';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#E3F2FD', text: '#1976D2' },
  sent: { bg: '#FFF3E0', text: '#F57C00' },
  viewed: { bg: '#F3E5F5', text: '#7B1FA2' },
  accepted: { bg: '#E8F5E9', text: '#388E3C' },
  rejected: { bg: '#FFEBEE', text: '#D32F2F' },
  expired: { bg: '#ECEFF1', text: '#546E7A' },
};

export default function QuoteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [sendingQuote, setSendingQuote] = useState(false);

  const fetchQuote = useCallback(async () => {
    if (!id) return;

    try {
      const res = await hvacApi.getQuote(id);
      if (res.success && res.data) {
        setQuote(res.data.quote);
      }
    } catch (error) {
      console.error('Failed to fetch quote:', error);
      Alert.alert('Error', 'Failed to load quote details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
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

  const handleSendQuote = async (method: 'email' | 'sms') => {
    if (!quote) return;

    Alert.alert(
      'Send Quote',
      `Send this quote via ${method === 'email' ? 'email' : 'SMS'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSendingQuote(true);
            try {
              const res = await hvacApi.sendQuote(quote.quote_id, method);
              if (res.success) {
                Alert.alert('Success', 'Quote sent successfully');
                fetchQuote(); // Refresh to get updated status
              } else {
                Alert.alert('Error', res.error || 'Failed to send quote');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to send quote');
            } finally {
              setSendingQuote(false);
            }
          },
        },
      ]
    );
  };

  const handleDownloadPdf = async () => {
    if (!quote) return;

    try {
      const res = await hvacApi.getQuotePdf(quote.quote_id);
      if (res.success && res.data) {
        // In a real app, you would save or share the PDF
        Alert.alert('PDF Ready', `Quote PDF generated: ${res.data.filename}`);
      } else {
        Alert.alert('Error', 'Failed to generate PDF');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to generate PDF');
    }
  };

  const handleUpdateStatus = (newStatus: Quote['status']) => {
    if (!quote) return;

    Alert.alert(
      'Update Status',
      `Change quote status to "${newStatus}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            try {
              const res = await hvacApi.updateQuoteStatus(quote.quote_id, newStatus);
              if (res.success) {
                fetchQuote();
              } else {
                Alert.alert('Error', res.error || 'Failed to update status');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to update status');
            }
          },
        },
      ]
    );
  };

  const handleDeleteQuote = () => {
    if (!quote) return;

    Alert.alert(
      'Delete Quote',
      'Are you sure you want to delete this quote? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await hvacApi.deleteQuote(quote.quote_id);
              if (res.success) {
                router.back();
              } else {
                Alert.alert('Error', res.error || 'Failed to delete quote');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete quote');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading quote...</Text>
      </View>
    );
  }

  if (!quote) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
        <Text style={styles.errorText}>Quote not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[quote.status] || STATUS_COLORS.draft;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.quoteNumber}>Quote #{quote.quote_id.slice(-6)}</Text>
              <Text style={styles.quoteDate}>Created {formatDate(quote.created_at)}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
              <Text style={[styles.statusText, { color: statusColor.text }]}>
                {quote.status}
              </Text>
            </View>
          </View>

          <View style={styles.tierRow}>
            <View style={[styles.tierBadge, { backgroundColor: getTierColor(quote.tier) }]}>
              <Text style={styles.tierText}>{quote.tier.toUpperCase()}</Text>
            </View>
            <Text style={styles.jobType}>
              {quote.job_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </Text>
          </View>

          <View style={styles.expiryRow}>
            <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.expiryText}>
              Expires: {formatDate(quote.expires_at)}
            </Text>
          </View>
        </View>

        {/* Line Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Line Items</Text>
          {quote.line_items.map((item, index) => (
            <View key={index} style={styles.lineItem}>
              <View style={styles.lineItemHeader}>
                <View style={styles.lineItemType}>
                  <Ionicons
                    name={
                      item.item_type === 'equipment'
                        ? 'cube-outline'
                        : item.item_type === 'labor'
                        ? 'construct-outline'
                        : 'ellipse-outline'
                    }
                    size={16}
                    color={Colors.textSecondary}
                  />
                  <Text style={styles.lineItemTypeText}>{item.item_type}</Text>
                </View>
                <Text style={styles.lineItemTotal}>{formatCurrency(item.total)}</Text>
              </View>
              <Text style={styles.lineItemDescription}>{item.description}</Text>
              <Text style={styles.lineItemQuantity}>
                {item.quantity} x {formatCurrency(item.unit_price)}
              </Text>
            </View>
          ))}
        </View>

        {/* Pricing Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pricing Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Equipment</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(quote.equipment_total)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Labor</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(quote.labor_total)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Materials</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(quote.materials_total)}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatCurrency(quote.subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                Tax ({(quote.tax_rate * 100).toFixed(1)}%)
              </Text>
              <Text style={styles.summaryValue}>{formatCurrency(quote.tax)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(quote.total)}</Text>
            </View>
          </View>
        </View>

        {/* Profit Analysis */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profit Analysis</Text>
          <View style={styles.profitCard}>
            <View style={styles.profitRow}>
              <View style={styles.profitItem}>
                <Text style={styles.profitLabel}>Cost</Text>
                <Text style={styles.profitValue}>{formatCurrency(quote.cost_total)}</Text>
              </View>
              <View style={styles.profitItem}>
                <Text style={styles.profitLabel}>Profit</Text>
                <Text style={[styles.profitValue, { color: Colors.success }]}>
                  {formatCurrency(quote.profit)}
                </Text>
              </View>
              <View style={styles.profitItem}>
                <Text style={styles.profitLabel}>Margin</Text>
                <Text style={[styles.profitValue, { color: Colors.primary }]}>
                  {quote.margin_percent.toFixed(1)}%
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Notes */}
        {quote.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{quote.notes}</Text>
            </View>
          </View>
        )}

        {/* Status Actions */}
        {quote.status === 'draft' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actions</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#E3F2FD' }]}
                onPress={() => handleSendQuote('email')}
                disabled={sendingQuote}
              >
                <Ionicons name="mail-outline" size={24} color="#1976D2" />
                <Text style={[styles.actionButtonText, { color: '#1976D2' }]}>
                  Send Email
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#E8F5E9' }]}
                onPress={() => handleSendQuote('sms')}
                disabled={sendingQuote}
              >
                <Ionicons name="chatbubble-outline" size={24} color="#388E3C" />
                <Text style={[styles.actionButtonText, { color: '#388E3C' }]}>
                  Send SMS
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {quote.status === 'sent' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer Response</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#E8F5E9' }]}
                onPress={() => handleUpdateStatus('accepted')}
              >
                <Ionicons name="checkmark-circle-outline" size={24} color="#388E3C" />
                <Text style={[styles.actionButtonText, { color: '#388E3C' }]}>
                  Mark Accepted
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#FFEBEE' }]}
                onPress={() => handleUpdateStatus('rejected')}
              >
                <Ionicons name="close-circle-outline" size={24} color="#D32F2F" />
                <Text style={[styles.actionButtonText, { color: '#D32F2F' }]}>
                  Mark Rejected
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* More Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleDownloadPdf}>
            <Ionicons name="document-outline" size={20} color={Colors.primary} />
            <Text style={styles.secondaryButtonText}>Download PDF</Text>
          </TouchableOpacity>

          {quote.status === 'draft' && (
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: Colors.error }]}
              onPress={handleDeleteQuote}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
              <Text style={[styles.secondaryButtonText, { color: Colors.error }]}>
                Delete Quote
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  errorText: {
    fontSize: Typography.fontSize.lg,
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  backButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
  },
  backButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
  },
  headerCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  quoteNumber: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  quoteDate: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    textTransform: 'capitalize',
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  tierBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
  },
  tierText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  jobType: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expiryText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginLeft: Spacing.xs,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  lineItem: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  lineItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  lineItemType: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lineItemTypeText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
    marginLeft: Spacing.xs,
  },
  lineItemTotal: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  lineItemDescription: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    marginBottom: 2,
  },
  lineItemQuantity: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  summaryLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  totalLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  totalValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  profitCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  profitRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  profitItem: {
    alignItems: 'center',
  },
  profitLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  profitValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  notesCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  notesText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  actionButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    marginTop: Spacing.xs,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  secondaryButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
    marginLeft: Spacing.sm,
  },
});
